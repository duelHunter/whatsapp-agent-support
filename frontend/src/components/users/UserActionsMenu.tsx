"use client";

import { useState, useRef, useEffect } from "react";
import { RoleBadge } from "./RoleBadge";

type Role = "admin" | "user";
type Status = "active" | "invited" | "disabled";

interface UserActionsMenuProps {
  userId: string;
  currentRole: Role;
  currentStatus: Status;
  onChangeRole: (userId: string, newRole: Role) => void;
  onRemoveUser: (userId: string) => void;
  disabled?: boolean;
}

export function UserActionsMenu({
  userId,
  currentRole,
  currentStatus,
  onRemoveUser,
  onChangeRole,
  disabled = false,
}: UserActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showRoleConfirm, setShowRoleConfirm] = useState(false);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowRoleMenu(false);
      }
    }

    if (isOpen || showRoleMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, showRoleMenu]);

  const roles: Role[] = ["admin", "user"];

  const handleRoleSelect = (newRole: Role) => {
    if (newRole !== currentRole) {
      setPendingRole(newRole);
      setShowRoleConfirm(true);
      setShowRoleMenu(false);
    }
  };

  const handleRoleChange = () => {
    if (pendingRole) {
      onChangeRole(userId, pendingRole);
      setPendingRole(null);
      setShowRoleConfirm(false);
      setIsOpen(false);
    }
  };

  const handleRemove = () => {
    onRemoveUser(userId);
    setShowRemoveConfirm(false);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 disabled:opacity-50"
        aria-label="User actions"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="py-1">
            <button
              onClick={() => {
                setShowRoleMenu(true);
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Change Role
            </button>
            <button
              onClick={() => {
                setShowRemoveConfirm(true);
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-rose-600 transition hover:bg-slate-100 dark:text-rose-400 dark:hover:bg-slate-700"
            >
              Remove User
            </button>
          </div>
        </div>
      )}

      {showRoleMenu && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="p-2">
            <div className="mb-2 px-2 text-xs font-semibold uppercase text-slate-500">
              Current: <RoleBadge role={currentRole} />
            </div>
            <div className="space-y-1">
              {roles.map((role) => (
                <button
                  key={role}
                  onClick={() => handleRoleSelect(role)}
                  disabled={role === currentRole}
                  className={`w-full rounded px-3 py-2 text-left text-sm transition ${
                    role === currentRole
                      ? "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <RoleBadge role={role} />
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowRoleMenu(false)}
              className="mt-2 w-full rounded px-3 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showRoleConfirm && pendingRole && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4">
            <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">
              Change role from:
            </p>
            <div className="mb-2">
              <RoleBadge role={currentRole} />
            </div>
            <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">to:</p>
            <div className="mb-2">
              <RoleBadge role={pendingRole} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRoleChange}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                setShowRoleConfirm(false);
                setPendingRole(null);
              }}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showRemoveConfirm && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">
            Remove this user from the organization?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRemove}
              className="flex-1 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
            >
              Remove
            </button>
            <button
              onClick={() => setShowRemoveConfirm(false)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

