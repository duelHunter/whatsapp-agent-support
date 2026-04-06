import { NextResponse } from "next/server";
import { getCurrentUser, getUserMembership } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  console.log("[AUTH ME] User:", user);
  if (!user) {
    console.log("[AUTH ME] Missing user token");
    // Return unauthorized flag so that frontend can trigger logout
    return NextResponse.json({ role: null, unauthorized: true, debug: { user } }, { status: 200 }); 
  }

  if (!user.profile?.default_org_id) {
    console.log("[AUTH ME] Missing default_org_id");
    return NextResponse.json({ role: null, unauthorized: false, debug: { user } }, { status: 200 }); 
  }
  
  const membership = await getUserMembership(user.profile.default_org_id);
  console.log("[AUTH ME] Membership:", membership);
  return NextResponse.json({ role: membership?.role || null, unauthorized: false, debug: { membership } });
}