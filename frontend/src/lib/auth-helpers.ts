// lib/auth-helpers.ts
// Server-side authentication and authorization helpers
import { supabaseServer } from "./supabaseServer";
import { supabaseAdmin } from "./supabaseAdmin";
import { redirect } from "next/navigation";

export type UserRole = "owner" | "admin" | "operator" | "viewer";

export interface CurrentUser {
  id: string;
  email: string;
  profile: {
    id: string;
    full_name: string | null;
    default_org_id: string | null;
  } | null;
}

export interface CurrentOrg {
  id: string;
  name: string;
  slug: string;
}

export interface UserMembership {
  id: string;
  org_id: string;
  user_id: string;
  role: UserRole;
}

/**
 * Get the current authenticated user from session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, default_org_id")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email || "",
    profile: profile || null,
  };
}

/**
 * Get the current user's active organization (from default_org_id).
 * Returns null if user has no default org.
 */
export async function getCurrentOrg(): Promise<CurrentOrg | null> {
  const user = await getCurrentUser();
  if (!user || !user.profile?.default_org_id) {
    return null;
  }

  const supabase = await supabaseServer();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", user.profile.default_org_id)
    .single();

  return org || null;
}

/**
 * Get the user's membership for a specific organization.
 */
export async function getUserMembership(
  orgId: string
): Promise<UserMembership | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await supabaseServer();
  const { data: membership } = await supabase
    .from("memberships")
    .select("id, org_id, user_id, role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  return membership || null;
}

/**
 * Require authentication. Redirects to /login if not authenticated.
 */
export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Require the user to have one of the specified roles in the given organization.
 * Redirects to /login if not authenticated, or throws error if not authorized.
 */
export async function requireRole(
  orgId: string,
  allowedRoles: UserRole[]
): Promise<UserMembership> {
  const user = await requireAuth();
  const membership = await getUserMembership(orgId);

  if (!membership) {
    throw new Error(
      `User ${user.id} is not a member of organization ${orgId}`
    );
  }

  if (!allowedRoles.includes(membership.role)) {
    throw new Error(
      `User ${user.id} does not have required role. Required: ${allowedRoles.join(
        " or "
      )}, has: ${membership.role}`
    );
  }

  return membership;
}

/**
 * Check if user has any of the specified roles in the given organization.
 * Returns false if not authenticated or not a member.
 */
export async function hasRole(
  orgId: string,
  allowedRoles: UserRole[]
): Promise<boolean> {
  try {
    await requireRole(orgId, allowedRoles);
    return true;
  } catch {
    return false;
  }
}


