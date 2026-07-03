import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminHub,
});

function AdminHub() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id);
        setIsSuperadmin(!!roles?.some((r) => r.role === "superadmin"));
      }
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) setIsSuperadmin(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (checked && !session) navigate({ to: "/admin/login" });
  }, [checked, session, navigate]);

  if (!checked) return <main className="min-h-screen bg-parchment" />;
  if (!session) return null;

  const links: Array<{ to: string; label: string; desc: string }> = [
    { to: "/admin/review", label: "Review", desc: "Listen to submitted screenings" },
    { to: "/admin/editor", label: "Editor", desc: "Manage segments & prompts" },
  ];
  if (isSuperadmin) {
    links.push({ to: "/admin/codes", label: "Invite codes", desc: "Generate & revoke admin invites" });
  }

  return (
    <main className="min-h-screen bg-parchment px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-baseline justify-between border-b-2 border-charcoal/20 pb-4">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-charcoal leading-none">
            COLD READ — ADMIN
          </h1>
          <button
            onClick={() => supabase.auth.signOut()}
            className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
          >
            Sign out
          </button>
        </header>

        <div className="mt-8">
          <CopyScreeningLinkButton />
        </div>

        <ul className="mt-10 divide-y divide-charcoal/15 border-y border-charcoal/15">
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                className="group flex items-baseline justify-between py-6 hover:bg-charcoal/[0.03] px-2 -mx-2 transition-colors"
              >
                <span className="font-display text-2xl text-charcoal">{l.label}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60 group-hover:text-primary">
                  {l.desc} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function CopyScreeningLinkButton() {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/` : "/";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // fallback: select-and-prompt
      window.prompt("Copy screening link", url);
    }
  }

  return (
    <div className="flex items-center gap-4 border border-charcoal/25 p-4">
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/60">
          Screening link
        </div>
        <div className="mt-1 font-mono text-sm text-charcoal truncate">{url}</div>
      </div>
      <button
        onClick={handleCopy}
        className="font-mono text-[11px] uppercase tracking-[0.24em] bg-iron text-parchment px-4 py-2 hover:bg-iron/90 transition-colors"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

