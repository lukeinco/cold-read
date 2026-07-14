import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/codes")({
  head: () => ({
    meta: [
      { title: "Invite codes — Cold Read Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CodesPage,
});

type Org = { id: string; name: string; slug: string };
type InviteCode = {
  code: string;
  org_id: string;
  created_at: string;
  expires_at: string;
};


function CodesPage() {
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

  if (!isSuperadmin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-parchment px-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-4xl text-charcoal">Restricted</h1>
          <p className="mt-3 font-serif text-lg text-charcoal/85">
            <em>Only superadmins can manage invite codes.</em>
          </p>
        </div>
      </main>
    );
  }

  return <CodesDashboard />;
}

function generateCodeString() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid ambiguous 0/O/1/I
  let out = "CR-";
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) out += chars[buf[i] % chars.length];
  return out;
}

function CodesDashboard() {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [orgId, setOrgId] = useState<string>("");
  const [codes, setCodes] = useState<InviteCode[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    const { data, error } = await supabase
      .from("invite_codes")
      .select("code,org_id,created_at,expires_at")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      return;
    }
    setCodes((data as InviteCode[]) ?? []);
  }, []);


  const loadOrgs = useCallback(async () => {
    const { data } = await supabase
      .from("orgs")
      .select("id,name,slug")
      .order("name", { ascending: true });
    const list = (data as Org[]) ?? [];
    setOrgs(list);
    setOrgId((prev) => prev || list[0]?.id || "");
  }, []);

  useEffect(() => {
    void loadOrgs();
    void loadCodes();
  }, [loadOrgs, loadCodes]);


  async function handleGenerate() {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) {
      setBusy(false);
      return;
    }
    // Retry on rare collision
    for (let i = 0; i < 4; i++) {
      const code = generateCodeString();
      const { error } = await supabase
        .from("invite_codes")
        .insert({ code, org_id: orgId, created_by: uid });
      if (!error) {
        await loadCodes();
        setBusy(false);
        return;
      }
      if (!/duplicate|unique/i.test(error.message)) {
        setError(error.message);
        setBusy(false);
        return;
      }
    }
    setError("Couldn't generate a unique code. Try again.");
    setBusy(false);
  }

  async function handleRevoke(code: string) {
    if (!confirm(`Revoke ${code}?`)) return;
    const { error } = await supabase.from("invite_codes").delete().eq("code", code);
    if (error) {
      setError(error.message);
      return;
    }
    await loadCodes();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const orgName = (id: string) => orgs?.find((o) => o.id === id)?.name ?? id;

  return (
    <main className="min-h-screen bg-parchment px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-baseline justify-between border-b-2 border-charcoal/20 pb-4">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-charcoal leading-none">
            COLD READ — CODES
          </h1>
          <div className="flex items-center gap-6">
            <Link
              to="/admin"
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
            >
              ← Admin
            </Link>
            <Link
              to="/admin/themes"
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
            >
              Themes
            </Link>
            <button
              onClick={handleSignOut}
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
            >
              Sign out
            </button>
          </div>
        </header>

        <CreateOrgSection onCreated={loadOrgs} onError={setError} />

        <section className="mt-8 border border-charcoal/25 bg-parchment p-6">
          <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal">
            Generate invite
          </h2>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
                Org
              </span>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="mt-2 block bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 pr-6 font-mono text-sm text-charcoal focus:outline-none"
              >
                {(orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={handleGenerate}
              disabled={busy || !orgId}
              className="font-mono text-xs uppercase tracking-[0.28em] bg-iron text-on-accent px-6 py-3 disabled:opacity-40 hover:bg-iron/90 transition-colors"
            >
              {busy ? "Generating…" : "Generate code"}
            </button>
          </div>
          {error && (
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-primary">
              {error}
            </p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal border-b border-charcoal/20 pb-3">
            Codes
          </h2>
          {codes === null ? (
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.24em] text-charcoal/60">
              Loading…
            </p>
          ) : codes.length === 0 ? (
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.24em] text-charcoal/60">
              No codes yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-charcoal/15">
              {codes.map((c) => {
                const expired =
                  !c.used_by && new Date(c.expires_at).getTime() < Date.now();
                const status = c.used_by
                  ? `Used ${formatDate(c.used_at)} by ${c.used_by.slice(0, 8)}…`
                  : expired
                    ? `Expired ${formatDate(c.expires_at)}`
                    : `Unused · expires ${formatDate(c.expires_at)}`;
                const statusColor = c.used_by
                  ? "text-charcoal/60"
                  : expired
                    ? "text-primary"
                    : "text-juniper";
                return (
                  <li
                    key={c.code}
                    className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto_auto] items-baseline gap-3 md:gap-6 py-4"
                  >
                    <span className="font-mono text-base tracking-widest text-charcoal">
                      {c.code}
                    </span>
                    <span className="font-mono text-xs uppercase tracking-[0.24em] text-charcoal/70">
                      {orgName(c.org_id)}
                    </span>
                    <span
                      className={`font-mono text-[11px] uppercase tracking-[0.24em] ${statusColor}`}
                    >
                      {status}
                    </span>
                    <span>
                      {!c.used_by && (
                        <button
                          onClick={() => handleRevoke(c.code)}
                          className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
                        >
                          Revoke
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function CreateOrgSection({
  onCreated,
  onError,
}: {
  onCreated: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const valid =
    name.trim().length >= 2 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(effectiveSlug);

  async function handleCreate() {
    if (!valid) return;
    setBusy(true);
    const { error } = await supabase
      .from("orgs")
      .insert({ name: name.trim(), slug: effectiveSlug });
    setBusy(false);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        onError(`Slug "${effectiveSlug}" is already taken.`);
      } else {
        onError(error.message);
      }
      return;
    }
    setName("");
    setSlug("");
    setSlugTouched(false);
    await onCreated();
  }

  return (
    <section className="mt-8 border border-charcoal/25 bg-parchment p-6">
      <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal">
        Create org
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto] items-end">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
            Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Sales"
            className="mt-2 w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 font-mono text-sm text-charcoal focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
            Slug (URL)
          </span>
          <input
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            placeholder="acme-sales"
            className="mt-2 w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 font-mono text-sm text-charcoal focus:outline-none"
          />
        </label>
        <button
          onClick={handleCreate}
          disabled={!valid || busy}
          className="font-mono text-xs uppercase tracking-[0.28em] bg-iron text-on-accent px-6 py-3 disabled:opacity-40 hover:bg-iron/90 transition-colors"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/55">
        Screening URL will be /app/{effectiveSlug || "your-slug"}
      </p>
    </section>
  );
}

