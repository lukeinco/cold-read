// Export / import / AI-primer helpers for Cold Read assessments.
// The seven allowed segment types are authoritative — must match the DB
// segments_type_check constraint exactly.

export const ALLOWED_TYPES = [
  "audio",
  "warmup",
  "question",
  "scripted",
  "improv",
  "text",
  "text_entry",
] as const;

export type StepType = (typeof ALLOWED_TYPES)[number];

export type EntryField = { id: string; label: string };

export type ExportedStep = {
  type: StepType;
  sort_order: number;
  cue_label: string;
  script_text: string | null;
  countdown_seconds: number | null;
  cue_color: string;
  override_card_color: string | null;
  override_text_color: string | null;
  entry_fields: EntryField[];
};

export type ExportedAssessment = {
  schemaVersion: 1;
  assessmentName: string;
  steps: ExportedStep[];
};

/** Fields we serialize per step. Kept as a const so callers can reference it. */
export const EXPORTED_STEP_FIELDS = [
  "type",
  "sort_order",
  "cue_label",
  "script_text",
  "countdown_seconds",
  "cue_color",
  "override_card_color",
  "override_text_color",
  "entry_fields",
] as const;

/** Default cue_color per type, matching editor's handleAdd defaults. */
export function defaultCueColor(t: StepType): string {
  if (t === "audio" || t === "text") return "#2B2B28";
  return "#3D5E4A";
}

/** Default cue_label per type, used when import omits it. */
export function defaultCueLabel(t: StepType): string {
  switch (t) {
    case "audio": return "Prospect audio";
    case "text": return "New title";
    case "text_entry": return "Your response";
    case "warmup": return "Warm-up";
    case "question": return "Question";
    case "scripted": return "Scripted read";
    case "improv": return "Improv";
  }
}

type AnySegment = {
  type: string;
  sort_order: number;
  cue_label?: string | null;
  script_text?: string | null;
  countdown_seconds?: number | null;
  cue_color?: string | null;
  override_card_color?: string | null;
  override_text_color?: string | null;
  entry_fields?: unknown;
};

export function buildExport(
  assessmentName: string,
  segments: AnySegment[],
): ExportedAssessment {
  const steps: ExportedStep[] = [...segments]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => {
      const t = s.type as StepType;
      const fields = Array.isArray(s.entry_fields)
        ? (s.entry_fields as unknown[])
            .filter(
              (f): f is EntryField =>
                !!f &&
                typeof f === "object" &&
                typeof (f as EntryField).id === "string" &&
                typeof (f as EntryField).label === "string",
            )
            .map((f) => ({ id: f.id, label: f.label }))
        : [];
      return {
        type: t,
        sort_order: s.sort_order,
        cue_label: s.cue_label ?? defaultCueLabel(t),
        script_text: s.script_text ?? null,
        countdown_seconds:
          typeof s.countdown_seconds === "number" ? s.countdown_seconds : null,
        cue_color: s.cue_color ?? defaultCueColor(t),
        override_card_color: s.override_card_color ?? null,
        override_text_color: s.override_text_color ?? null,
        entry_fields: fields,
      };
    });
  return { schemaVersion: 1, assessmentName, steps };
}

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function slugifyFilename(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ||
    "assessment"
  );
}

/** Strict validation. Throws Error(message) on any problem. */
export function parseImport(raw: string): ExportedAssessment {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Top-level must be an object.");
  }
  const obj = data as Record<string, unknown>;
  if (obj.schemaVersion !== 1) {
    throw new Error(`schemaVersion must be 1 (got ${String(obj.schemaVersion)}).`);
  }
  const assessmentName =
    typeof obj.assessmentName === "string" && obj.assessmentName.trim()
      ? obj.assessmentName.trim()
      : "Imported assessment";
  if (!Array.isArray(obj.steps)) {
    throw new Error("`steps` must be an array.");
  }
  const steps: ExportedStep[] = obj.steps.map((s, i) => validateStep(s, i));
  return { schemaVersion: 1, assessmentName, steps };
}

function validateStep(input: unknown, index: number): ExportedStep {
  const where = `step[${index}]`;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${where} must be an object.`);
  }
  const s = input as Record<string, unknown>;
  const type = s.type;
  if (typeof type !== "string" || !(ALLOWED_TYPES as readonly string[]).includes(type)) {
    throw new Error(
      `${where}.type is "${String(type)}" — must be one of: ${ALLOWED_TYPES.join(", ")}.`,
    );
  }
  const t = type as StepType;

  const sort_order =
    typeof s.sort_order === "number" && Number.isFinite(s.sort_order)
      ? Math.trunc(s.sort_order)
      : index;

  const cue_label =
    typeof s.cue_label === "string" && s.cue_label.trim()
      ? s.cue_label
      : defaultCueLabel(t);

  const script_text =
    s.script_text === undefined || s.script_text === null
      ? null
      : typeof s.script_text === "string"
        ? s.script_text
        : (() => {
            throw new Error(`${where}.script_text must be a string or null.`);
          })();

  let countdown_seconds: number | null;
  if (s.countdown_seconds === undefined || s.countdown_seconds === null) {
    countdown_seconds = null;
  } else if (
    typeof s.countdown_seconds === "number" &&
    Number.isFinite(s.countdown_seconds) &&
    s.countdown_seconds > 0 &&
    Number.isInteger(s.countdown_seconds)
  ) {
    countdown_seconds = s.countdown_seconds;
  } else {
    throw new Error(
      `${where}.countdown_seconds must be a positive integer or null.`,
    );
  }

  const cue_color =
    typeof s.cue_color === "string" && /^#[0-9a-f]{6}$/i.test(s.cue_color)
      ? s.cue_color
      : defaultCueColor(t);

  const override_card_color = optionalHex(s.override_card_color, `${where}.override_card_color`);
  const override_text_color = optionalHex(s.override_text_color, `${where}.override_text_color`);

  let entry_fields: EntryField[] = [];
  if (s.entry_fields !== undefined && s.entry_fields !== null) {
    if (!Array.isArray(s.entry_fields)) {
      throw new Error(`${where}.entry_fields must be an array.`);
    }
    entry_fields = s.entry_fields.map((f, j) => {
      if (!f || typeof f !== "object" || Array.isArray(f)) {
        throw new Error(`${where}.entry_fields[${j}] must be an object.`);
      }
      const fo = f as Record<string, unknown>;
      if (typeof fo.label !== "string" || !fo.label.trim()) {
        throw new Error(`${where}.entry_fields[${j}].label must be a non-empty string.`);
      }
      const id =
        typeof fo.id === "string" && fo.id.trim()
          ? fo.id
          : `field${j + 1}_${Math.random().toString(36).slice(2, 8)}`;
      return { id, label: fo.label };
    });
  }

  return {
    type: t,
    sort_order,
    cue_label,
    script_text,
    countdown_seconds,
    cue_color,
    override_card_color,
    override_text_color,
    entry_fields,
  };
}

function optionalHex(v: unknown, where: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) return v;
  throw new Error(`${where} must be null or a #RRGGBB hex string.`);
}

/** Fixed primer copied to the clipboard for Ask Claude/GPT. */
export const AI_PRIMER = `You are helping design a Cold Read assessment.

WHAT COLD READ IS
Cold Read is a voice-based candidate screening. Each assessment is an ordered
timeline of steps that a candidate moves through in the browser. Some steps
present something (audio, text, a scripted line to read aloud); other steps
capture a response (recorded voice or typed text).

THE SEVEN STEP TYPES (these are the only allowed values for "type")
- audio       Recorded prospect line played to the candidate to simulate a
              call. The user attaches the audio file later in the app — you
              never generate or reference audio URLs.
- scripted    On-screen text the candidate reads aloud while being recorded.
              Has a countdown (15-25 seconds is typical).
- question    Spoken answer to a prompt. Has a countdown.
- improv      Speak freely with no script and no countdown. Good for closers
              and open-ended pitches.
- warmup      Low-stakes opener (spoken, short). Treated like a question.
- text        Display-only slide. Continue button advances. Nothing saved.
- text_entry  Typed short-answer fields. Uses entry_fields for the labels.

HOW TO STRUCTURE A GOOD ASSESSMENT
- Alternate 'audio' prospect lines with 'scripted' reads to simulate a call.
- Include at least one directed 'scripted' read to test coachability.
- Often end with an 'improv' close (e.g. "pitch me in 60 seconds").
- Keep to 5-8 response steps total (scripted + question + improv + text_entry).
- Text cards can bookend the flow (intro, section headings, thank-you).

BEFORE YOU WRITE ANY JSON
First ask the user about:
1. Their role / the role they are hiring for.
2. Their script or offer (what the rep will actually say on calls).
3. Must-have traits they want to screen for.

Only after they answer, output ONLY the JSON below in a single final code block.
Do not add commentary after the JSON.

OUTPUT FORMAT (exact shape — nothing extra)
\`\`\`json
{
  "schemaVersion": 1,
  "assessmentName": "...",
  "steps": [
    {
      "type": "<one of: audio, warmup, question, scripted, improv, text, text_entry>",
      "sort_order": 0,
      "cue_label": "...",
      "script_text": null,
      "countdown_seconds": null,
      "cue_color": "#3D5E4A",
      "override_card_color": null,
      "override_text_color": null,
      "entry_fields": []
    }
  ]
}
\`\`\`

FIELD RULES
- sort_order: integers starting at 0, incrementing by 1 in order.
- 'audio' steps: script_text = null, countdown_seconds = null.
- 'scripted' and 'question' steps: countdown_seconds is an integer 15-25.
- 'improv' steps: script_text = null, countdown_seconds = null.
- 'warmup' steps: like question — usually a short countdown (10-20).
- 'text' steps: countdown_seconds = null, entry_fields = [].
- 'text_entry' steps: put labels in entry_fields as
  [{"id": "field1", "label": "Name"}, {"id": "field2", "label": "Email"}].
  countdown_seconds = null.
- cue_color: any #RRGGBB hex. #3D5E4A is a safe default; #2B2B28 for audio/text.
- override_card_color / override_text_color: leave null unless a step needs a
  distinct look.
- Nothing after the closing \`\`\` fence.
`;
