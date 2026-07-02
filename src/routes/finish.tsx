import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useSession } from "@/context/session-context";


export const Route = createFileRoute("/finish")({
  head: () => ({
    meta: [
      { title: "Almost done — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinishScreen,
});

const emailSchema = z.string().trim().email().max(255);
const urlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => /linkedin\.com/i.test(v), "Must be a LinkedIn URL");

function FinishScreen() {
  const { sessionId, scopedClient, clearSession } = useSession();
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = useMemo(() => emailSchema.safeParse(email).success, [email]);
  const urlValid = useMemo(() => urlSchema.safeParse(linkedin).success, [linkedin]);
  const canSubmit = emailValid && urlValid && !submitting && !!sessionId && !!scopedClient;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: updateError } = await scopedClient!
      .from("sessions")
      .update({
        email: email.trim(),
        linkedin_url: linkedin.trim(),
        submitted_at: new Date().toISOString(),
      })
      .eq("id", sessionId!);


    if (updateError) {
      setError("Couldn't submit. Try again.");
      setSubmitting(false);
      return;
    }

    clearSession();
    setDone(true);
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-background">
        <h1 className="font-display text-5xl md:text-7xl tracking-wide text-charcoal text-center leading-none">
          THANKS — WE'LL BE
          <br />
          IN TOUCH.
        </h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-background">
      <div className="w-full max-w-lg">
        <h1 className="font-display text-6xl md:text-7xl tracking-wide text-charcoal leading-none">
          ALMOST DONE
        </h1>
        <p className="mt-4 font-serif text-2xl italic text-charcoal/85">
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
            placeholder="https://www.linkedin.com/in/…"
            autoComplete="url"
          />

          {error && (
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full font-mono text-sm uppercase tracking-[0.28em] bg-primary text-parchment py-4 px-6 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
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
      <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className={`mt-2 w-full bg-transparent border-b-2 py-2 font-mono text-base text-charcoal placeholder:text-charcoal/30 focus:outline-none transition-colors ${
          valid ? "border-charcoal/40 focus:border-primary" : "border-primary"
        }`}
      />
    </label>
  );
}
