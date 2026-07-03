import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const emailSchema = z.string().trim().email().max(255);
const passwordSchema = z.string().min(8).max(128);
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^CR-[A-Z0-9]{6}$/, "Invalid code format");

export const Route = createFileRoute("/api/admin/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            email?: unknown;
            password?: unknown;
            code?: unknown;
          };

          const emailP = emailSchema.safeParse(body.email);
          const passwordP = passwordSchema.safeParse(body.password);
          const codeP = codeSchema.safeParse(body.code);

          if (!emailP.success || !passwordP.success || !codeP.success) {
            return Response.json(
              { error: "Enter a valid email, password (8+ chars), and code." },
              { status: 400 },
            );
          }

          const email = emailP.data;
          const password = passwordP.data;
          const code = codeP.data;

          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          // 1) Validate invite code
          const { data: invite, error: inviteErr } = await supabaseAdmin
            .from("invite_codes")
            .select("code, org_id, used_by, expires_at")
            .eq("code", code)
            .maybeSingle();
          if (inviteErr) {
            console.error("admin-signup: invite lookup failed", inviteErr);
            return Response.json({ error: inviteErr.message }, { status: 500 });
          }
          if (!invite) {
            return Response.json({ error: "Invite code not found." }, { status: 400 });
          }
          if (invite.used_by) {
            return Response.json({ error: "Invite code already used." }, { status: 400 });
          }
          if (new Date(invite.expires_at as string).getTime() < Date.now()) {
            return Response.json({ error: "Invite code has expired." }, { status: 400 });
          }

          // 2) Create the auth user (auto-confirm so they can log in immediately)
          const { data: created, error: createErr } =
            await supabaseAdmin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
            });
          if (createErr || !created?.user) {
            const msg = createErr?.message ?? "Could not create account.";
            const status =
              /already registered|exists/i.test(msg) ? 409 : 500;
            return Response.json({ error: msg }, { status });
          }
          const userId = created.user.id;

          // 3) Consume the code atomically-ish (guard on still-unused)
          const { data: claimed, error: claimErr } = await supabaseAdmin
            .from("invite_codes")
            .update({ used_by: userId, used_at: new Date().toISOString() })
            .eq("code", code)
            .is("used_by", null)
            .select("code");
          if (claimErr || !claimed || claimed.length !== 1) {
            // Race lost — roll back the user so the code isn't burned
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return Response.json(
              { error: "Invite code was just used. Ask for a new one." },
              { status: 409 },
            );
          }

          // 4) Grant admin role + org membership
          const { error: roleErr } = await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: userId, role: "admin" });
          if (roleErr) {
            console.error("admin-signup: role insert failed", roleErr);
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return Response.json({ error: roleErr.message }, { status: 500 });
          }

          const { error: memberErr } = await supabaseAdmin
            .from("org_members")
            .insert({ user_id: userId, org_id: invite.org_id, role: "admin" });
          if (memberErr) {
            console.error("admin-signup: member insert failed", memberErr);
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return Response.json({ error: memberErr.message }, { status: 500 });
          }

          return Response.json({ ok: true });
        } catch (err) {
          console.error("admin-signup: unexpected error", err);
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
