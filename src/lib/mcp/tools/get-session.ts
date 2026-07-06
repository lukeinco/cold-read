import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sbForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_session",
  title: "Get session with responses",
  description:
    "Fetch one candidate session's contact info and the ordered list of recorded responses (segment label, duration, storage path).",
  inputSchema: {
    session_id: z.string().uuid().describe("Session UUID from list_sessions."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ session_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = sbForUser(ctx);
    const { data: session, error: sErr } = await sb
      .from("sessions")
      .select(
        "id, email, linkedin_url, submitted_at, created_at, assessment:assessments(id, name, slug), org:orgs(id, name)",
      )
      .eq("id", session_id)
      .maybeSingle();
    if (sErr) return { content: [{ type: "text", text: sErr.message }], isError: true };
    if (!session) return { content: [{ type: "text", text: "Session not found" }], isError: true };

    const { data: responses, error: rErr } = await sb
      .from("responses")
      .select("id, segment_id, storage_path, duration_seconds, created_at, segment:segments(cue_label, order_index, kind)")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true });
    if (rErr) return { content: [{ type: "text", text: rErr.message }], isError: true };

    const payload = { session, responses: responses ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
