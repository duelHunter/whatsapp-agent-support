"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

// ─── Types ───────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  email: string;
  full_name: string;
  org_id: string | null;
};

type Org = {
  id: string;
  name: string;
  display_name: string | null;
  notes: string | null;
  phone_number: string | null;
  status: string | null;
  created_at: string;
};

type Section = "profile" | "organization" | "security";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string, email: string) {
  const src = name || email;
  return src
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 ${className}`}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500";

const inputReadonlyCls =
  "w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500 cursor-not-allowed select-none";

function SaveButton({ loading, label = "Save changes" }: { loading: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
    >
      {loading ? "Saving…" : label}
    </button>
  );
}

function StatusBadge({ ok, msg }: { ok: boolean; msg: string }) {
  if (!msg) return null;
  return (
    <span
      className={`text-xs font-medium ${ok ? "text-emerald-500" : "text-rose-500"}`}
    >
      {msg}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<Section>("profile");
  const [role, setRole] = useState<string | null>(null);

  // ── Profile state ──
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState({ ok: true, msg: "" });

  // ── Org state (admin only) ──
  const [org, setOrg] = useState<Org | null>(null);
  const [orgDisplayName, setOrgDisplayName] = useState("");
  const [orgNotes, setOrgNotes] = useState("");
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgStatus, setOrgStatus] = useState({ ok: true, msg: "" });

  // ── Security state ──
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState({ ok: true, msg: "" });

  const sectionRefs = useRef<Record<Section, HTMLElement | null>>({
    profile: null,
    organization: null,
    security: null,
  });

  // ── Load data ──
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.unauthorized) {
          router.push("/login");
          return;
        }
        setRole(d.role);
      })
      .catch(console.error);

    fetch("/api/settings/profile")
      .then((r) => r.json())
      .then((d: Profile) => {
        setProfile(d);
        setProfileName(d.full_name ?? "");
      })
      .catch(console.error);
  }, [router]);

  useEffect(() => {
    if (role === "admin") {
      fetch("/api/settings/org")
        .then((r) => r.json())
        .then((d: { org: Org }) => {
          setOrg(d.org);
          setOrgDisplayName(d.org.display_name ?? "");
          setOrgNotes(d.org.notes ?? "");
        })
        .catch(console.error);
    }
  }, [role]);

  // ── Handlers ──
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileStatus({ ok: true, msg: "" });
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: profileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setProfileStatus({ ok: true, msg: "Saved successfully." });
    } catch (err: unknown) {
      setProfileStatus({ ok: false, msg: err instanceof Error ? err.message : "Error" });
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    setOrgSaving(true);
    setOrgStatus({ ok: true, msg: "" });
    try {
      const res = await fetch("/api/settings/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: orgDisplayName, notes: orgNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setOrgStatus({ ok: true, msg: "Saved successfully." });
    } catch (err: unknown) {
      setOrgStatus({ ok: false, msg: err instanceof Error ? err.message : "Error" });
    } finally {
      setOrgSaving(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus({ ok: true, msg: "" });
    if (newPassword.length < 8) {
      setPasswordStatus({ ok: false, msg: "Password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ ok: false, msg: "Passwords do not match." });
      return;
    }
    setPasswordSaving(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordStatus({ ok: true, msg: "Password updated successfully." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setPasswordStatus({ ok: false, msg: err instanceof Error ? err.message : "Error" });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSignOut() {
    await supabaseClient.auth.signOut();
    router.push("/login");
  }

  function scrollTo(section: Section) {
    setActiveSection(section);
    sectionRefs.current[section]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const navItems: { id: Section; label: string; adminOnly?: boolean }[] = [
    { id: "profile", label: "Profile" },
    { id: "organization", label: "Organization", adminOnly: true },
    { id: "security", label: "Security" },
  ];

  const visibleNav = navItems.filter((n) => !n.adminOnly || role === "admin");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your profile, organization, and account security.
          </p>
        </header>

        <div className="flex gap-8">
          {/* ── Sidebar nav ── */}
          <nav className="hidden w-44 shrink-0 md:block">
            <ul className="sticky top-8 space-y-1">
              {visibleNav.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => scrollTo(item.id)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                      activeSection === item.id
                        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Content ── */}
          <div className="min-w-0 flex-1 space-y-8">

            {/* ─ Profile ─ */}
            <section
              ref={(el) => { sectionRefs.current.profile = el; }}
              onFocus={() => setActiveSection("profile")}
            >
              <Card>
                <h2 className="mb-5 text-lg font-semibold">Profile</h2>

                {/* Avatar */}
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-lg font-bold text-sky-600 dark:text-sky-400">
                    {profile ? initials(profile.full_name, profile.email) : "…"}
                  </div>
                  <div>
                    <p className="font-medium">{profileName || "—"}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
                  </div>
                </div>

                <form onSubmit={(e) => void saveProfile(e)} className="space-y-4">
                  <Field label="Full name">
                    <input
                      className={inputCls}
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </Field>
                  <Field label="Email" hint="Email cannot be changed here.">
                    <input
                      className={inputReadonlyCls}
                      value={profile?.email ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </Field>
                  <div className="flex items-center gap-3 pt-1">
                    <SaveButton loading={profileSaving} />
                    <StatusBadge {...profileStatus} />
                  </div>
                </form>
              </Card>
            </section>

            {/* ─ Organization (admin only) ─ */}
            {role === "admin" && (
              <section
                ref={(el) => { sectionRefs.current.organization = el; }}
                onFocus={() => setActiveSection("organization")}
              >
                <Card>
                  <h2 className="mb-1 text-lg font-semibold">Organization</h2>
                  <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
                    Visible to all members of your workspace.
                  </p>

                  {org && (
                    <div className="mb-5 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Status:</span>{" "}
                        <span
                          className={`font-semibold ${
                            org.status === "connected"
                              ? "text-emerald-500"
                              : org.status === "pending_qr"
                                ? "text-amber-500"
                                : "text-rose-500"
                          }`}
                        >
                          {org.status ?? "—"}
                        </span>
                      </span>
                      {org.phone_number && (
                        <span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">Phone:</span>{" "}
                          +{org.phone_number}
                        </span>
                      )}
                      <span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Created:</span>{" "}
                        {new Date(org.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  <form onSubmit={(e) => void saveOrg(e)} className="space-y-4">
                    <Field
                      label="Display name"
                      hint="The name shown in the dashboard header."
                    >
                      <input
                        className={inputCls}
                        value={orgDisplayName}
                        onChange={(e) => setOrgDisplayName(e.target.value)}
                        placeholder="My Business"
                      />
                    </Field>
                    <Field label="Notes" hint="Internal notes about this WhatsApp account.">
                      <textarea
                        className={`${inputCls} resize-none`}
                        rows={3}
                        value={orgNotes}
                        onChange={(e) => setOrgNotes(e.target.value)}
                        placeholder="e.g. Customer support line for product X"
                      />
                    </Field>
                    <div className="flex items-center gap-3 pt-1">
                      <SaveButton loading={orgSaving} />
                      <StatusBadge {...orgStatus} />
                    </div>
                  </form>
                </Card>
              </section>
            )}

            {/* ─ Security ─ */}
            <section
              ref={(el) => { sectionRefs.current.security = el; }}
              onFocus={() => setActiveSection("security")}
            >
              <Card>
                <h2 className="mb-1 text-lg font-semibold">Security</h2>
                <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
                  Update your account password.
                </p>

                <form onSubmit={(e) => void savePassword(e)} className="space-y-4">
                  <Field label="New password">
                    <input
                      type="password"
                      className={inputCls}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      required
                    />
                  </Field>
                  <Field label="Confirm new password">
                    <input
                      type="password"
                      className={inputCls}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      required
                    />
                  </Field>
                  <div className="flex items-center gap-3 pt-1">
                    <SaveButton loading={passwordSaving} label="Update password" />
                    <StatusBadge {...passwordStatus} />
                  </div>
                </form>
              </Card>
            </section>

            {/* ─ Danger Zone ─ */}
            <section>
              <Card className="border-rose-200/60 dark:border-rose-800/40">
                <h2 className="mb-1 text-lg font-semibold text-rose-600 dark:text-rose-400">
                  Danger zone
                </h2>
                <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
                  Actions here are immediate and cannot be undone.
                </p>
                <button
                  onClick={() => void handleSignOut()}
                  className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20"
                >
                  Sign out
                </button>
              </Card>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
