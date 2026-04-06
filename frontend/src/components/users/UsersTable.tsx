"use client";

import { useState } from "react";
import { RoleBadge } from "./RoleBadge";
import { UserActionsMenu } from "./UserActionsMenu";

export type OrgUser = {
  id: string;
  full_name: string | null;
  email: string;
  role: "admin" | "user";
  status: "active" | "invited" | "disabled";
  last_active_at: string | null;
  created_at: string;
};

type SortField = "name" | "role" | "last_active";
type SortDirection = "asc" | "desc";

interface UsersTableProps {
  users: OrgUser[];
  onInvite: (email: string, role: OrgUser["role"], message?: string) => Promise<void>;
  onChangeRole: (userId: string, newRole: OrgUser["role"]) => Promise<void>;
  onRemoveUser: (userId: string) => Promise<void>;
  loading?: boolean;
}

export function UsersTable({
  users,
  onInvite,
  onChangeRole,
  onRemoveUser,
  loading = false,
}: UsersTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    if (!sortField) return 0;

    let aVal: string | number;
    let bVal: string | number;

    switch (sortField) {
      case "name":
        aVal = (a.full_name || a.email).toLowerCase();
        bVal = (b.full_name || b.email).toLowerCase();
        break;
      case "role":
        const roleOrder: Record<OrgUser["role"], number> = {
          admin: 0,
          user: 1,
        };
        aVal = roleOrder[a.role];
        bVal = roleOrder[b.role];
        break;
      case "last_active":
        aVal = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
        bVal = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const getInitials = (user: OrgUser) => {
    if (user.full_name) {
      const parts = user.full_name.split(" ");
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return user.full_name.substring(0, 2).toUpperCase();
    }
    return user.email.substring(0, 2).toUpperCase();
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusBadge = (status: OrgUser["status"]) => {
    const config = {
      active: {
        label: "Active",
        color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      },
      invited: {
        label: "Invited",
        color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      },
      disabled: {
        label: "Disabled",
        color: "bg-slate-500/20 text-slate-400 border-slate-500/30",
      },
    };

    const { label, color } = config[status];
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}
      >
        {label}
      </span>
    );
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="ml-1 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === "asc" ? (
      <svg className="ml-1 h-4 w-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="ml-1 h-4 w-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="h-6 w-20 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-6 w-16 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-8 w-8 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sortedUsers.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
        <svg
          className="mx-auto h-12 w-12 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-3-3H5a3 3 0 00-3 3v2h5m6 0v-2a3 3 0 00-3-3H8a3 3 0 00-3 3v2m6 0h6"
          />
        </svg>
        <p className="mt-4 text-slate-600 dark:text-slate-400">No users found</p>
        <p className="mt-2 text-sm text-slate-500">
          Try adjusting your filters or invite a new user
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th
                className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center">
                  Name
                  <SortIcon field="name" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                Email
              </th>
              <th
                className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => handleSort("role")}
              >
                <div className="flex items-center">
                  Role
                  <SortIcon field="role" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                Status
              </th>
              <th
                className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => handleSort("last_active")}
              >
                <div className="flex items-center">
                  Last Active
                  <SortIcon field="last_active" />
                </div>
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {sortedUsers.map((user) => (
              <tr
                key={user.id}
                className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {getInitials(user)}
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {user.full_name || "No name"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                  {user.email}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <RoleBadge role={user.role} />
                </td>
                <td className="whitespace-nowrap px-6 py-4">{getStatusBadge(user.status)}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                  {formatRelativeTime(user.last_active_at)}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <UserActionsMenu
                    userId={user.id}
                    currentRole={user.role}
                    currentStatus={user.status}
                    onChangeRole={onChangeRole}
                    onRemoveUser={onRemoveUser}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-4 md:hidden">
        {sortedUsers.map((user) => (
          <div
            key={user.id}
            className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {getInitials(user)}
                </div>
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {user.full_name || "No name"}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">{user.email}</div>
                </div>
              </div>
              <UserActionsMenu
                userId={user.id}
                currentRole={user.role}
                currentStatus={user.status}
                onChangeRole={onChangeRole}
                onRemoveUser={onRemoveUser}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <RoleBadge role={user.role} />
              {getStatusBadge(user.status)}
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Last active: {formatRelativeTime(user.last_active_at)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

