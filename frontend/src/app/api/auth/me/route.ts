import { NextResponse } from "next/server";
import { getCurrentUser, getUserMembership } from "@/lib/auth-helpers";

export async function GET() {
  const user = await getCurrentUser();
  console.log("[AUTH ME] User:", user);
  if (!user || !user.profile?.default_org_id) {
    console.log("[AUTH ME] Missing user or default_org_id");
    return NextResponse.json({ role: null, debug: { user } }, { status: 200 });
  }
  
  const membership = await getUserMembership(user.profile.default_org_id);
  console.log("[AUTH ME] Membership:", membership);
  return NextResponse.json({ role: membership?.role || null, debug: { membership } });
}