import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: () => <Navigate to="/admin/review" replace />,
});
