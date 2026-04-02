import { NextResponse } from "next/server";
import { getCurrentUser, getUserMembership } from "@/lib/auth-helpers";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.profile?.default_org_id) {
    return NextResponse.json({ role: null }, { status: 200 });
  }
  
  const membership = await getUserMembership(user.profile.default_org_id);
  return NextResponse.json({ role: membership?.role || null });
}