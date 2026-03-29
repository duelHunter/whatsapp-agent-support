"use client";

type Role = "admin" | "user";

interface RoleBadgeProps {
  role: Role;
}

const roleConfig: Record<Role, { label: string; color: string }> = {
  admin: {
    label: "Admin",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  user: {
    label: "User",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
};

export function RoleBadge({ role }: RoleBadgeProps) {
  const config = roleConfig[role];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config?.color || "bg-slate-500/20 text-slate-400 border-slate-500/30"}`}
    >
      {config?.label || role}
    </span>
  );
}

