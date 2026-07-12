import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const nameSchema = z.string().trim().min(1).max(120);
const emailSchema = z.string().trim().email().max(255);
const urlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => /linkedin\.com/i.test(v), "Must be a LinkedIn URL");

const NOTIFY_TO = "lukeinco@gmail.com";
const NOTIFY_FROM = "Cold Read <onboarding@resend.dev>";

async function sendSubmissionEmail(payload: {
  name: string;
  email: string;
  linkedinUrl: string;
  request: Request;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const origin = new URL(payload.request.url).origin;
  const reviewUrl = `${origin}/admin/review`;
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
    );

  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111;">
      <h2 style="margin:0 0 12px;">New Cold Read submission</h2>
      <p><strong>Name:</strong> ${esc(payload.name)}</p>
      <p><strong>Email:</strong> <a href="mailto:${esc(payload.email)}">${esc(payload.email)}</a></p>
      <p><strong>LinkedIn:</strong> <a href="${esc(payload.linkedinUrl)}">${esc(payload.linkedinUrl)}</a></p>
      <p style="margin-top:20px;"><a href="${esc(reviewUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px;">Review in Cold Read</a></p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: NOTIFY_FROM,
      to: [NOTIFY_TO],
      subject: "New Cold Read submission",
      html,
      reply_to: payload.email,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

export const Route = createFileRoute("/api/submit-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            sessionId?: unknown;
            sessionToken?: unknown;
            name?: unknown;
            email?: unknown;
            linkedinUrl?: unknown;
          };

          const { sessionId, sessionToken, name, email, linkedinUrl } = body;

          if (
            typeof sessionId !== "string" ||
            typeof sessionToken !== "string" ||
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof linkedinUrl !== "string" ||
            !uuidRe.test(sessionId) ||
            !uuidRe.test(sessionToken)
          ) {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }

          const nameParsed = nameSchema.safeParse(name);
          const emailParsed = emailSchema.safeParse(email);
          const urlParsed = urlSchema.safeParse(linkedinUrl);
          if (!nameParsed.success || !emailParsed.success || !urlParsed.success) {
            return Response.json({ error: "Invalid request" }, { status: 400 });
          }

          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data, error } = await supabaseAdmin
            .from("sessions")
            .update({
              name: nameParsed.data,
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

          try {
            await sendSubmissionEmail({
              name: nameParsed.data,
              email: emailParsed.data,
              linkedinUrl: urlParsed.data,
              request,
            });
          } catch (emailErr) {
            console.error("submit-session: email notification failed", emailErr);
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
