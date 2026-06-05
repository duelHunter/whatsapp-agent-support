import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    full_name: user.profile?.full_name ?? "",
    org_id: user.profile?.default_org_id ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : null;
  if (!full_name) return NextResponse.json({ error: "full_name is required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ full_name })
    .eq("id", user.id);

  if (error) {
    console.error("[settings/profile PATCH]", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
