"use client";

import { useState, useEffect, useMemo } from "react";
import { UsersTable, type OrgUser } from "@/components/users/UsersTable";
import { InviteUserModal } from "@/components/users/InviteUserModal";
import { Toast } from "@/components/users/Toast";
import { backendGet, backendPostJson } from "@/lib/backendClient";

type ToastMessage = {
  id: string;
  message: string;
  type: "success" | "error";
};

// Mock data generator
const generateMockUsers = (): OrgUser[] => {
  const names = [
    "John Doe",
    "Jane Smith",
    "Alice Johnson",
    "Bob Williams",
    "Charlie Brown",
    "Diana Prince",
    "Edward Norton",
    "Fiona Apple",
    "George Washington",
    "Hannah Montana",
  ];

  const roles: OrgUser["role"][] = ["admin", "user"];
  const statuses: OrgUser["status"][] = ["active", "invited", "disabled"];

  return names.map((name, idx) => {
    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 90));
    
    const lastActiveDate = Math.random() > 0.2 
      ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
      : null;

    return {
      id: `user-${idx + 1}`,
      full_name: name,
      email: name.toLowerCase().replace(" ", ".") + "@example.com",
      role: roles[Math.floor(Math.random() * roles.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      last_active_at: lastActiveDate?.toISOString() || null,
      created_at: createdDate.toISOString(),
    };
  });
};

export default function UsersPage() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<OrgUser["role"] | "all">("all");
  const [statusFilter, setStatusFilter] = useState<OrgUser["status"] | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [useMockData, setUseMockData] = useState(false);

  const itemsPerPage = 10;

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await backendGet<{ users: OrgUser[] }>("/api/org/users");
        if (response && Array.isArray(response.users)) {
          setUsers(response.users);
          setUseMockData(false);
        } else {
          throw new Error("Invalid response format");
        }
      } catch (error) {
        console.warn("API not available, using mock data:", error);
        setUsers(generateMockUsers());
        setUseMockData(true);
      } finally {
        setLoading(false);
      }
    };

    void fetchUsers();
  }, []);

  // Filter and search users
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, statusFilter]);

  const addToast = (message: string, type: "success" | "error") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleInvite = async (
    email: string,
    role: OrgUser["role"],
    message?: string
  ) => {
    try {
      if (useMockData) {
        // Mock invite
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const newUser: OrgUser = {
          id: `user-${Date.now()}`,
          full_name: null,
          email,
          role,
          status: "invited",
          last_active_at: null,
          created_at: new Date().toISOString(),
        };
        setUsers((prev) => [...prev, newUser]);
        addToast("Invitation sent successfully", "success");
      } else {
        await backendPostJson("/api/org/users/invite", { email, role, message });
        addToast("Invitation sent successfully", "success");
        // Optionally refresh users list
        const response = await backendGet<{ users: OrgUser[] }>("/api/org/users");
        if (response && Array.isArray(response.users)) {
          setUsers(response.users);
        }
      }
    } catch (error) {
      addToast((error as Error).message || "Failed to send invitation", "error");
      throw error;
    }
  };

  const handleChangeRole = async (userId: string, newRole: OrgUser["role"]) => {
    try {
      if (useMockData) {
        // Optimistic update
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
        addToast("Role updated successfully", "success");
      } else {
        await backendPostJson(`/api/org/users/${userId}/role`, { role: newRole });
        addToast("Role updated successfully", "success");
        // Refresh users list
        const response = await backendGet<{ users: OrgUser[] }>("/api/org/users");
        if (response && Array.isArray(response.users)) {
          setUsers(response.users);
        }
      }
    } catch (error) {
      addToast((error as Error).message || "Failed to update role", "error");
      // Revert optimistic update on error
      if (useMockData) {
        const response = await backendGet<{ users: OrgUser[] }>("/api/org/users");
        if (response && Array.isArray(response.users)) {
          setUsers(response.users);
        }
      }
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      if (useMockData) {
        // Optimistic update
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        addToast("User removed successfully", "success");
      } else {
        await backendPostJson(`/api/org/users/${userId}/remove`, {});
        addToast("User removed successfully", "success");
        // Refresh users list
        const response = await backendGet<{ users: OrgUser[] }>("/api/org/users");
        if (response && Array.isArray(response.users)) {
          setUsers(response.users);
        }
      }
    } catch (error) {
      addToast((error as Error).message || "Failed to remove user", "error");
      // Revert optimistic update on error
      if (useMockData) {
        const response = await backendGet<{ users: OrgUser[] }>("/api/org/users");
        if (response && Array.isArray(response.users)) {
          setUsers(response.users);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <header className="mb-6">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Users</h1>
              <p className="text-slate-600 dark:text-slate-400">
                Manage organization members and roles
              </p>
            </div>
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              + Invite User
            </button>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as OrgUser["role"] | "all")}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrgUser["status"] | "all")}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </header>

        {/* Users Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <UsersTable
            users={paginatedUsers}
            onInvite={handleInvite}
            onChangeRole={handleChangeRole}
            onRemoveUser={handleRemoveUser}
            loading={loading}
          />
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of{" "}
              {filteredUsers.length} users
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {[...Array(totalPages)].map((_, i) => {
                  const page = i + 1;
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                          currentPage === page
                            ? "bg-emerald-500 text-white"
                            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return (
                      <span key={page} className="px-2 text-slate-500">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Invite Modal */}
        <InviteUserModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          onInvite={handleInvite}
        />

        {/* Toasts */}
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  );
}
