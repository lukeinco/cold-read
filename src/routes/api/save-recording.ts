import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/save-recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const sessionId = form.get("sessionId");
          const sessionToken = form.get("sessionToken");
          const segmentId = form.get("segmentId");
          const sortOrderRaw = form.get("sortOrder");
          const audio = form.get("audio");

          if (
            typeof sessionId !== "string" ||
            typeof sessionToken !== "string" ||
            typeof segmentId !== "string" ||
            typeof sortOrderRaw !== "string" ||
            !(audio instanceof Blob)
          ) {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }

          const uuidRe =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const sortOrder = Number.parseInt(sortOrderRaw, 10);
          if (
            !uuidRe.test(sessionId) ||
            !uuidRe.test(sessionToken) ||
            !/^[a-zA-Z0-9_-]{1,64}$/.test(segmentId) ||
            !Number.isInteger(sortOrder) ||
            sortOrder < 0 ||
            sortOrder > 100
          ) {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }

          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          // 1. Verify ownership: session must exist, match the token, and be unsubmitted.
          const { data: session, error: sessionErr } = await supabaseAdmin
            .from("sessions")
            .select("id")
            .eq("id", sessionId)
            .eq("client_token", sessionToken)
            .is("submitted_at", null)
            .maybeSingle();

          if (sessionErr) {
            console.error("save-recording: session lookup failed", sessionErr);
            return Response.json({ error: sessionErr.message }, { status: 500 });
          }
          if (!session) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          // 2. Upload the blob (service role bypasses storage RLS).
          const storagePath = `${sessionId}/${segmentId}.webm`;
          const { error: uploadErr } = await supabaseAdmin.storage
            .from("recordings")
            .upload(storagePath, audio, {
              contentType: "audio/webm",
              upsert: true,
            });
          if (uploadErr) {
            console.error("save-recording: upload failed", uploadErr);
            return Response.json({ error: uploadErr.message }, { status: 500 });
          }

          // 3. Record the response row (upsert-safe: replace prior attempt for same segment).
          await supabaseAdmin
            .from("responses")
            .delete()
            .eq("session_id", sessionId)
            .eq("segment_id", segmentId);
          const { error: insertErr } = await supabaseAdmin.from("responses").insert({
            session_id: sessionId,
            segment_id: segmentId,
            sort_order: sortOrder,
            storage_path: storagePath,
          });
          if (insertErr) {
            console.error("save-recording: insert failed", insertErr);
            return Response.json({ error: insertErr.message }, { status: 500 });
          }

          return Response.json({ ok: true });
        } catch (err) {
          console.error("save-recording: unexpected error", err);
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
