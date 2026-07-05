import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin sign in — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    navigate({ to: "/admin" });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-parchment">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-5xl md:text-6xl tracking-wide text-charcoal leading-none">
          COLD READ
          <br />
          <span className="text-primary">— ADMIN</span>
        </h1>

        <form onSubmit={handleSubmit} className="mt-10 space-y-5">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 font-mono text-base text-charcoal focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 font-mono text-base text-charcoal focus:outline-none"
            />
          </label>
          {error && (
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full font-mono text-sm uppercase tracking-[0.28em] bg-primary text-parchment py-4 disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
          Have an invite code?{" "}
          <Link to="/admin/signup" className="text-charcoal underline underline-offset-4 hover:text-primary">
            Create account
          </Link>
        </p>
      </div>
    </main>
  );
}
