import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAssessments from "./tools/list-assessments";
import listSessions from "./tools/list-sessions";
import getSession from "./tools/get-session";

// The OAuth issuer MUST be the direct Supabase host, not the .lovable.cloud proxy.
// VITE_SUPABASE_PROJECT_ID is inlined at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "cold-read-mcp",
  title: "Cold Read",
  version: "0.1.0",
  instructions:
    "Tools to review Cold Read voice-screening data as the signed-in admin. Use list_assessments to discover assessments, list_sessions to browse candidate sessions, and get_session to inspect an individual candidate's recorded responses. All calls are scoped to the admin's orgs via row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAssessments, listSessions, getSession],
});
