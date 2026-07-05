import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/signup")({
  head: () => ({
    meta: [
      { title: "Admin sign up — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSignup,
});

function AdminSignup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const codeValid = useMemo(() => /^CR-[A-Z0-9]{6}$/.test(code.trim().toUpperCase()), [code]);
  const canSubmit = email && password.length >= 8 && codeValid && !busy;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/review" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/admin/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          code: code.trim().toUpperCase(),
        }),
      });
    } catch {
      setError("Couldn't reach the server. Try again.");
      setBusy(false);
      return;
    }

    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Signup failed.");
      setBusy(false);
      return;
    }

    // Auto-login on success
    const { error: loginErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (loginErr) {
      setError("Account created — please sign in.");
      navigate({ to: "/admin/login" });
      return;
    }
    navigate({ to: "/review" });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-parchment">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-5xl md:text-6xl tracking-wide text-charcoal leading-none">
          COLD READ
          <br />
          <span className="text-primary">— ADMIN</span>
        </h1>
        <p className="mt-4 font-serif text-xl italic text-charcoal/85">
          Create your admin account.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <Field label="Invite code" value={code} onChange={setCode} placeholder="CR-XXXXXX" mono />
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field
            label="Password (8+ chars)"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          {error && (
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full font-mono text-sm uppercase tracking-[0.28em] bg-primary text-on-accent py-4 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
          Already have an account?{" "}
          <Link to="/admin/login" className="text-charcoal underline underline-offset-4 hover:text-primary">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  mono?: boolean;
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
        className={`mt-2 w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 ${mono ? "font-mono tracking-widest uppercase" : "font-mono"} text-base text-charcoal placeholder:text-charcoal/30 focus:outline-none`}
      />
    </label>
  );
}
