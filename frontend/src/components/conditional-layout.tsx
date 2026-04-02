"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { UserRole } from "@/lib/auth-helpers";
import { supabaseClient } from "@/lib/supabaseClient";

export function ConditionalLayout({
  children,
  userRole,
}: {
  children: React.ReactNode;
  userRole?: UserRole | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    // Automatically log out user if token is expired or signed out
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        // Clear the server-side cookie so SSR middleware knows it's unauthenticated
        document.cookie = "sb-access-token=; path=/; max-age=0";
        if (!isAuthPage) {
          router.push("/login");
          router.refresh();
        }
      } else if (session) {
        // Enforce 1-hour expiration logic strictly by checking `expires_at`
        // If the session expiration is older than now, trigger an explicit signOut
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        if (expiresAt > 0 && expiresAt < Date.now()) {
          await supabaseClient.auth.signOut();
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, isAuthPage]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar userRole={userRole} />
      <main className="ml-64 flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
        {children}
      </main>
    </div>
  );
}

