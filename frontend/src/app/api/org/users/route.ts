import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserMembership } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.profile?.default_org_id) {
      return NextResponse.json({ error: "User has no default organization" }, { status: 403 });
    }

    const membership = await getUserMembership(user.profile.default_org_id);
    if (!membership) {
      return NextResponse.json({ error: "No organization membership found" }, { status: 403 });
    }

    const orgId = membership.org_id;

    // Fetch all memberships for this org, along with user profiles
    const { data: memberships, error } = await supabaseAdmin
      .from("memberships")
      .select(`
        id,
        user_id,
        role,
        created_at,
        profiles (
          id,
          full_name
        )
      `)
      .eq("org_id", orgId);

    if (error) {
      console.error("Error fetching users:", error);
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    // Since we don't have email in public.profiles, we need to fetch user emails from auth
    // Let's get all users from the auth system using admin api
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    const authUsers = authError ? [] : authData.users;
    const authUserMap = new Map(authUsers.map(u => [u.id, u.email]));

    // Format for the frontend
    const users = memberships.map((m: any) => ({
      id: m.profiles?.id || m.user_id,
      name: m.profiles?.full_name || "Unknown User",
      email: authUserMap.get(m.user_id) || "Email unavailable",
      role: m.role,
      status: "active", // Hardcode to active since status column does not exist
      lastActive: m.created_at, // Use created_at as a fallback for lastActive
      avatarUrl: null
    }));

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("GET /api/org/users error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
