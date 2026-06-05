import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserMembership } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function resolveAdminOrg() {
  const user = await getCurrentUser();
  if (!user || !user.profile?.default_org_id) return null;

  const membership = await getUserMembership(user.profile.default_org_id);
  if (!membership || membership.role !== "admin") return null;

  return { orgId: membership.org_id };
}

export async function GET() {
  const ctx = await resolveAdminOrg();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name, display_name, notes, phone_number, status, created_at")
    .eq("id", ctx.orgId)
    .single();

  if (error || !org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json({ org });
}

export async function PATCH(req: NextRequest) {
  const ctx = await resolveAdminOrg();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  const updates: Record<string, string | null> = {};
  if (typeof body.display_name === "string") {
    updates.display_name = body.display_name.trim() || null;
  }
  if (typeof body.notes === "string") {
    updates.notes = body.notes.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("organizations")
    .update(updates)
    .eq("id", ctx.orgId);

  if (error) {
    console.error("[settings/org PATCH]", error);
    return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
