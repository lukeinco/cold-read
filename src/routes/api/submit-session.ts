import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const emailSchema = z.string().trim().email().max(255);
const urlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => /linkedin\.com/i.test(v), "Must be a LinkedIn URL");

export const Route = createFileRoute("/api/submit-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            sessionId?: unknown;
            sessionToken?: unknown;
            email?: unknown;
            linkedinUrl?: unknown;
          };

          const { sessionId, sessionToken, email, linkedinUrl } = body;

          if (
            typeof sessionId !== "string" ||
            typeof sessionToken !== "string" ||
            typeof email !== "string" ||
            typeof linkedinUrl !== "string" ||
            !uuidRe.test(sessionId) ||
            !uuidRe.test(sessionToken)
          ) {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }

          const emailParsed = emailSchema.safeParse(email);
          const urlParsed = urlSchema.safeParse(linkedinUrl);
          if (!emailParsed.success || !urlParsed.success) {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }

          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data, error } = await supabaseAdmin
            .from("sessions")
            .update({
              email: emailParsed.data,
              linkedin_url: urlParsed.data,
              submitted_at: new Date().toISOString(),
            })
            .eq("id", sessionId)
            .eq("client_token", sessionToken)
            .is("submitted_at", null)
            .select("id");

          if (error) {
            console.error("submit-session: update failed", error);
            return Response.json({ error: error.message }, { status: 500 });
          }
          if (!data || data.length !== 1) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
          }

          return Response.json({ ok: true });
        } catch (err) {
          console.error("submit-session: unexpected error", err);
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
