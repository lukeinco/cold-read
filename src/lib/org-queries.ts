import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type Org = { id: string; slug: string; name: string };

export type Assessment = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  is_active: boolean;
  theme_id: string | null;
  title_font: string | null;
  body_font: string | null;
};

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

/** Active assessments for an org — anon-readable. */
export function activeAssessmentsForOrgQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: ["assessments", "active", "org", orgId],
    queryFn: async (): Promise<Assessment[]> => {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, org_id, slug, name, is_active, theme_id, title_font, body_font")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Assessment[];
    },
    staleTime: 60 * 1000,
  });
}

/** Resolve a single active assessment by (orgSlug, assessmentSlug). */
export function assessmentBySlugsQueryOptions(orgSlug: string, assessmentSlug: string) {
  return queryOptions({
    queryKey: ["assessment-by-slugs", orgSlug, assessmentSlug],
    queryFn: async (): Promise<{ org: Org; assessment: Assessment }> => {
      const { data: org, error: orgErr } = await supabase
        .from("orgs")
        .select("id, slug, name")
        .eq("slug", orgSlug)
        .maybeSingle();
      if (orgErr) throw orgErr;
      if (!org) throw notFound();

      const { data: assessment, error: aErr } = await supabase
        .from("assessments")
        .select("id, org_id, slug, name, is_active, theme_id, title_font, body_font")
        .eq("org_id", org.id)
        .eq("slug", assessmentSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (aErr) throw aErr;
      if (!assessment) throw notFound();
      return { org: org as Org, assessment: assessment as Assessment };
    },
    staleTime: 60 * 1000,
  });
}

/** Admin view: all assessments (active + archived) for an org. */
export function assessmentsForOrgAdminQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: ["assessments", "admin", "org", orgId],
    queryFn: async (): Promise<Assessment[]> => {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, org_id, slug, name, is_active, theme_id, title_font, body_font")
        .eq("org_id", orgId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Assessment[];
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

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "assessment";
}
