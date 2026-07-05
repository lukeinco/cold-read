import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  orgBySlugQueryOptions,
  activeAssessmentsForOrgQueryOptions,
} from "@/lib/org-queries";

export const Route = createFileRoute("/app/$orgSlug/")({
  head: () => ({
    meta: [
      { title: "Cold Read — voice screening" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context, params }) => {
    const org = await context.queryClient.ensureQueryData(
      orgBySlugQueryOptions(params.orgSlug),
    );
    await context.queryClient.ensureQueryData(
      activeAssessmentsForOrgQueryOptions(org.id),
    );
  },
  component: OrgRedirect,
});

function OrgRedirect() {
  const { orgSlug } = Route.useParams();
  const { data: org } = useSuspenseQuery(orgBySlugQueryOptions(orgSlug));
  const { data: assessments } = useSuspenseQuery(
    activeAssessmentsForOrgQueryOptions(org.id),
  );

  if (assessments.length === 1) {
    return (
      <Navigate
        to="/app/$orgSlug/$assessmentSlug"
        params={{ orgSlug, assessmentSlug: assessments[0].slug }}
      />
    );
  }

  if (assessments.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-parchment px-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-charcoal leading-none">
            NO ACTIVE
            <br />
            ASSESSMENTS
          </h1>
          <p className="mt-4 font-serif text-lg text-charcoal/85">
            <em>{org.name} hasn't published an assessment yet.</em>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-parchment px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-iron">
          <span className="h-px w-8 bg-iron" />
          <span>{org.name}</span>
        </div>
        <h1 className="font-display text-[clamp(3rem,10vw,6rem)] leading-[0.9] text-charcoal">
          Choose an
          <br />
          assessment
        </h1>
        <ul className="mt-12 divide-y divide-charcoal/15 border-y border-charcoal/15">
          {assessments.map((a) => (
            <li key={a.id}>
              <Link
                to="/app/$orgSlug/$assessmentSlug"
                params={{ orgSlug, assessmentSlug: a.slug }}
                className="group flex items-baseline justify-between py-6 hover:bg-charcoal/[0.03] px-2 -mx-2 transition-colors"
              >
                <span className="font-display text-2xl text-charcoal">{a.name}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60 group-hover:text-primary">
                  Start →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
