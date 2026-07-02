import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/finish")({
  head: () => ({
    meta: [
      { title: "Done — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinishPlaceholder,
});

function FinishPlaceholder() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-6xl text-charcoal">Done</h1>
        <p className="mt-4 font-serif text-xl text-charcoal/85">
          <em>Recordings saved.</em>
        </p>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
          Finish flow — coming next
        </p>
      </div>
    </main>
  );
}
