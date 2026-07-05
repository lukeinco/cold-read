import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  themedAssessmentQueryOptions,
  resolveTokens,
  tokensToCssVars,
  assessmentFontsHref,
  DEFAULT_THEME_TOKENS,
} from "@/lib/assessment-theme";
import { DEFAULT_BODY_FONT, DEFAULT_TITLE_FONT, fontStack } from "@/config/fonts";

export const Route = createFileRoute("/app/$orgSlug/$assessmentSlug")({
  head: () => ({
    meta: [
      { title: "Cold Read — voice screening" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      themedAssessmentQueryOptions(params.orgSlug, params.assessmentSlug),
    ),
  component: ThemedShell,
  notFoundComponent: NotFound,
  errorComponent: () => <NotFound />,
});

function ThemedShell() {
  const { orgSlug, assessmentSlug } = Route.useParams();
  const { data } = useSuspenseQuery(
    themedAssessmentQueryOptions(orgSlug, assessmentSlug),
  );
  const tokens = resolveTokens(data);
  const fontsHref = assessmentFontsHref(data);

  // Inject the two Google Fonts for this assessment only.
  useEffect(() => {
    if (!fontsHref) return;
    const id = `a-fonts-${data.assessment.id}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = fontsHref;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [fontsHref, data.assessment.id]);

  return (
    <div className="a-root min-h-screen" style={tokensToCssVars(tokens)}>
      <Outlet />
    </div>
  );
}

function NotFound() {
  const bg = DEFAULT_THEME_TOKENS.bg;
  const text = DEFAULT_THEME_TOKENS.text;
  return (
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: bg, color: text }}
    >
      <div className="max-w-md text-center">
        <h1
          className="text-5xl md:text-6xl leading-none uppercase tracking-wide"
          style={{ fontFamily: fontStack(DEFAULT_TITLE_FONT, DEFAULT_TITLE_FONT) }}
        >
          Assessment
          <br />
          not found
        </h1>
        <p
          className="mt-6 text-lg opacity-80"
          style={{ fontFamily: fontStack(DEFAULT_BODY_FONT, DEFAULT_BODY_FONT) }}
        >
          Check the link and try again.
        </p>
      </div>
    </main>
  );
}
