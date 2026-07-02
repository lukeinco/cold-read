import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/screening")({
  head: () => ({
    meta: [
      { title: "Screening — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScreeningPlaceholder,
});

function ScreeningPlaceholder() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
        Screening flow — coming next
      </p>
    </main>
  );
}
