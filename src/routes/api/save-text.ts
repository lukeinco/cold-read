import { createFileRoute } from "@tanstack/react-router";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/save-text")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            sessionId?: unknown;
            sessionToken?: unknown;
            segmentId?: unknown;
            sortOrder?: unknown;
            values?: unknown;
          };
          const { sessionId, sessionToken, segmentId, sortOrder, values } = body;

          if (
            typeof sessionId !== "string" ||
            typeof sessionToken !== "string" ||
            typeof segmentId !== "string" ||
            typeof sortOrder !== "number" ||
            !uuidRe.test(sessionId) ||
            !uuidRe.test(sessionToken) ||
            !/^[a-zA-Z0-9_-]{1,64}$/.test(segmentId) ||
            !Number.isInteger(sortOrder) ||
            sortOrder < 0 ||
            sortOrder > 100 ||
            values === null ||
            typeof values !== "object" ||
            Array.isArray(values)
          ) {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }

          // Sanitize values to a flat map of string -> string, capped to keep payloads small.
          const entries = Object.entries(values as Record<string, unknown>).slice(0, 40);
          const safeValues: Record<string, string> = {};
          for (const [k, v] of entries) {
            if (typeof k !== "string" || k.length > 128) continue;
            if (typeof v !== "string") continue;
            safeValues[k] = v.slice(0, 4000);
          }

          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data: session, error: sessionErr } = await supabaseAdmin
            .from("sessions")
            .select("id")
            .eq("id", sessionId)
            .eq("client_token", sessionToken)
            .is("submitted_at", null)
            .maybeSingle();

          if (sessionErr) {
            console.error("save-text: session lookup failed", sessionErr);
            return Response.json({ error: sessionErr.message }, { status: 500 });
          }
          if (!session) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          await supabaseAdmin
            .from("responses")
            .delete()
            .eq("session_id", sessionId)
            .eq("segment_id", segmentId);

          const { error: insertErr } = await supabaseAdmin.from("responses").insert({
            session_id: sessionId,
            segment_id: segmentId,
            sort_order: sortOrder,
            storage_path: null,
            response_type: "text",
            text_value: safeValues,
          });
          if (insertErr) {
            console.error("save-text: insert failed", insertErr);
            return Response.json({ error: insertErr.message }, { status: 500 });
          }

          return Response.json({ ok: true });
        } catch (err) {
          console.error("save-text: unexpected error", err);
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
