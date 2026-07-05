import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type Org = { id: string; slug: string; name: string };

export function orgBySlugQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["org-by-slug", slug],
    queryFn: async (): Promise<Org> => {
      const { data, error } = await supabase
        .from("orgs")
        .select("id, slug, name")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as Org;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type SegmentRow = {
  id: string;
  type: string;
  prompt_audio_path: string | null;
  script_text: string | null;
  countdown_seconds: number | null;
  cue_color: string;
  cue_label: string;
};

export function orgActiveSegmentsQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: ["segments", "active", "org", orgId],
    queryFn: async (): Promise<SegmentRow[]> => {
      const { data, error } = await supabase
        .from("segments")
        .select(
          "id, type, prompt_audio_path, script_text, countdown_seconds, cue_color, cue_label",
        )
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SegmentRow[];
    },
  });
}

/**
 * Load the orgs a user administers. Superadmins see all orgs; other admins
 * see the orgs they're members of.
 */
export async function loadAdminOrgs(opts: {
  userId: string;
  isSuperadmin: boolean;
}): Promise<Org[]> {
  if (opts.isSuperadmin) {
    const { data, error } = await supabase
      .from("orgs")
      .select("id, slug, name")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Org[];
  }
  const { data, error } = await supabase
    .from("org_members")
    .select("org_id, orgs!inner(id, slug, name)")
    .eq("user_id", opts.userId);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ orgs: Org }>;
  return rows.map((r) => r.orgs).sort((a, b) => a.name.localeCompare(b.name));
}
