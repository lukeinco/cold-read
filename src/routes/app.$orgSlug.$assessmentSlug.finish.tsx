import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useSession } from "@/context/session-context";
import { themedAssessmentQueryOptions } from "@/lib/assessment-theme";

export const Route = createFileRoute("/app/$orgSlug/$assessmentSlug/finish")({
  head: () => ({
    meta: [
      { title: "Almost done — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      themedAssessmentQueryOptions(params.orgSlug, params.assessmentSlug),
    ),
  component: FinishScreen,
});

const nameSchema = z.string().trim().min(1).max(120);
const emailSchema = z.string().trim().email().max(255);
const urlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?$/i.test(v),
    "Enter as linkedin.com/in/your-name",
  );

function FinishScreen() {
  const { sessionId, sessionToken, clearSession } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = useMemo(() => nameSchema.safeParse(name).success, [name]);
  const emailValid = useMemo(() => emailSchema.safeParse(email).success, [email]);
  const urlValid = useMemo(() => urlSchema.safeParse(linkedin).success, [linkedin]);
  const canSubmit = nameValid && emailValid && urlValid && !submitting && !!sessionId && !!sessionToken;


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/submit-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionToken,
          email: email.trim(),
          linkedinUrl: linkedin.trim().replace(/^(https?:\/\/)?(www\.)?/i, "https://www."),
        }),
      });
    } catch {
      setError("Couldn't submit. Try again.");
      setSubmitting(false);
      return;
    }

    if (res.status !== 200) {
      setError("Couldn't submit. Try again.");
      setSubmitting(false);
      return;
    }

    clearSession();
    setDone(true);
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 a-bg">
        <h1 className="a-font-title a-text text-5xl md:text-7xl leading-none text-center uppercase" style={{ letterSpacing: "0.02em" }}>
          Thanks — we'll be
          <br />
          in touch.
        </h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 a-bg">
      <div className="w-full max-w-lg a-card-bg p-10">
        <h1 className="a-font-title a-text text-6xl md:text-7xl leading-none uppercase" style={{ letterSpacing: "0.02em" }}>
          Almost done
        </h1>
        <p className="mt-4 a-font-body a-text text-2xl italic" style={{ opacity: 0.85 }}>
          Where do we reach you?
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-6">
          <Field
            label="EMAIL"
            type="email"
            value={email}
            onChange={setEmail}
            valid={email.length === 0 || emailValid}
            placeholder="you@company.com"
            autoComplete="email"
          />
          <Field
            label="LINKEDIN URL"
            type="url"
            value={linkedin}
            onChange={setLinkedin}
            valid={linkedin.length === 0 || urlValid}
            placeholder="www.linkedin.com/in/…"
            autoComplete="url"
          />

          {error && (
            <p className="a-font-body text-xs uppercase tracking-[0.2em] a-accent">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full a-font-body text-sm uppercase tracking-[0.28em] a-accent-bg py-4 px-6 disabled:opacity-40 disabled:cursor-not-allowed transition-transform hover:-translate-y-0.5 disabled:hover:translate-y-0"
            style={{ color: "var(--a-bg)" }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  valid,
  placeholder,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="a-font-body text-[11px] uppercase tracking-[0.28em] a-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="mt-2 w-full bg-transparent border-b-2 py-2 a-font-body text-base a-text focus:outline-none transition-colors"
        style={{
          borderColor: valid ? "color-mix(in srgb, var(--a-muted) 60%, transparent)" : "var(--a-accent)",
        }}
      />
    </label>
  );
}
