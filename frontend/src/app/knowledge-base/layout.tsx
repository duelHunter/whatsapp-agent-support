import { getCurrentUser, getUserMembership } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";

export default async function KnowledgeBaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || !user.profile?.default_org_id) {
    redirect("/login");
  }

  const membership = await getUserMembership(user.profile.default_org_id);
  if (!membership || membership.role !== "admin") {
    redirect("/");
  }

  return <>{children}</>;
}