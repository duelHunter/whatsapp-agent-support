import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserMembership } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.profile?.default_org_id) {
      return NextResponse.json({ error: "User has no default organization" }, { status: 403 });
    }

    const membership = await getUserMembership(user.profile.default_org_id);
    if (!membership || membership.role !== "admin") {
      return NextResponse.json({ error: "Only admins can invite users" }, { status: 403 });
    }

    const { email, role, message } = await request.json();
    if (!email || !role) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 });
    }

    // Attempt to invite the user via Supabase Admin
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        role: role,
        org_id: membership.org_id
      }
    });

    if (inviteError) {
      console.error("Supabase invite error:", inviteError);
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    // Optional: Record the invitation in an ‘invites’ table or similar structure if you prefer.
    // Given the previous codebase, we'll assume the immediate creation of a 'pending' membership.
    const newUserId = inviteData.user?.id;
    if (newUserId) {
       // Insert a pending membership for the new user profile for this organization
       const { error: membershipError } = await supabaseAdmin
        .from("memberships")
        .insert({
           user_id: newUserId,
           org_id: membership.org_id,
           role: role
        });
       
       if (membershipError) {
         console.error("Error creating membership for invited user:", membershipError);
         // Don't error out completely, since the email was already sent
       }
    }

    return NextResponse.json({ success: true, user: inviteData.user });
  } catch (error: any) {
    console.error("POST /api/org/users/invite error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
