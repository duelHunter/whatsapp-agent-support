"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { supabaseClient } from "@/lib/supabaseClient";

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Bot Status", href: "/#status" },
  { label: "Messages", href: "/messages" },
  { label: "Chat Tester", href: "/chat-tester" },
  { label: "Users", href: "/users" },
  { label: "Analytics", href: "/analytics" },
  { label: "Settings", href: "/settings" },
  { label: "Branding", href: "/branding" },
  { label: "Knowledge Base", href: "/knowledge-base" },
  { label: "Help", href: "/help" },
];

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const router = useRouter();

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    // Clear the cookie
    document.cookie = 'sb-access-token=; path=/; max-age=0';
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className="fixed inset-y-0 left-0 w-64 border-r border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-sm font-semibold text-white">
            WA
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              WhatsApp AI Bot
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Admin console
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

