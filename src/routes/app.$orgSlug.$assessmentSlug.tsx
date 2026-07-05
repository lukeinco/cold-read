import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assessmentBySlugsQueryOptions } from "@/lib/org-queries";

export const Route = createFileRoute("/app/$orgSlug/$assessmentSlug")({
  head: () => ({
    meta: [
      { title: "Cold Read — voice screening" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      assessmentBySlugsQueryOptions(params.orgSlug, params.assessmentSlug),
    ),
  component: () => <Outlet />,
  notFoundComponent: NotFound,
  errorComponent: () => <NotFound />,
});

function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-parchment px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-5xl md:text-6xl tracking-wide text-charcoal leading-none">
          ASSESSMENT
          <br />
          NOT FOUND
        </h1>
        <p className="mt-6 font-serif text-lg text-charcoal/85">
          <em>Check the link and try again.</em>
        </p>
      </div>
    </main>
  );
}
