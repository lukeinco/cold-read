import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cold Read" },
      {
        name: "description",
        content:
          "Cold Read — voice screening for candidates. Open your screening via the link your recruiter shared.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="min-h-screen flex flex-col bg-parchment">
      <div className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-xl text-center">
          <h1 className="font-display text-[clamp(4rem,16vw,10rem)] leading-[0.85] text-charcoal">
            Cold
            <br />
            Read
          </h1>
          <p className="mt-10 font-serif text-xl text-charcoal/80 leading-snug">
            <em>Voice screening for candidates.</em>
          </p>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/55">
            Open your screening from the link your recruiter shared.
          </p>
        </div>
      </div>

      <footer className="border-t border-charcoal/15 px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/55">
          <span>Cold Read</span>
          <Link to="/admin" className="hover:text-charcoal transition-colors">
            Admin
          </Link>
        </div>
      </footer>
    </main>
  );
}
