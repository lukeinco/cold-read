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
  name: "list_sessions",
  title: "List candidate sessions",
  description:
    "List candidate voice-screening sessions the signed-in admin can review. Filter by assessment_id and/or submitted-only.",
  inputSchema: {
    assessment_id: z.string().uuid().optional().describe("Filter to a single assessment."),
    submitted_only: z
      .boolean()
      .optional()
      .describe("If true, only include sessions the candidate submitted. Default true."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows. Default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ assessment_id, submitted_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = sbForUser(ctx);
    let q = sb
      .from("sessions")
      .select(
        "id, email, linkedin_url, submitted_at, created_at, assessment:assessments(id, name, slug), org:orgs(id, name)",
      )
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 50);
    if (assessment_id) q = q.eq("assessment_id", assessment_id);
    if (submitted_only !== false) q = q.not("submitted_at", "is", null);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { sessions: data ?? [] },
    };
  },
});
