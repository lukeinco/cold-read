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
  name: "list_assessments",
  title: "List assessments",
  description:
    "List assessments visible to the signed-in admin, across the orgs they belong to. Returns id, name, slug, org, and active state.",
  inputSchema: {
    include_inactive: z
      .boolean()
      .optional()
      .describe("Include inactive assessments. Defaults to false."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_inactive }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = sbForUser(ctx);
    let q = sb
      .from("assessments")
      .select("id, name, slug, is_active, updated_at, org:orgs(id, name, slug)")
      .order("updated_at", { ascending: false });
    if (!include_inactive) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { assessments: data ?? [] },
    };
  },
});
