"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";

/**
 * Generate a slug from a string (lowercase, alphanumeric + hyphens)
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generate a unique slug by appending random suffix if needed
 */
async function generateUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    // Check if slug exists
    const { data, error } = await supabaseClient
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found" which is fine, other errors are not
      throw error;
    }

    if (!data) {
      // Slug is available
      return slug;
    }

    // Slug exists, append random suffix
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    slug = `${baseSlug}-${randomSuffix}`;
    attempts++;
  }

  // Fallback: append timestamp if we've tried too many times
  return `${baseSlug}-${Date.now().toString(36)}`;
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Step 1: Sign up user with Supabase Auth
      const { data: authData, error: signUpError } =
        await supabaseClient.auth.signUp({
          email,
          password,
        });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError("Failed to create user account");
        setLoading(false);
        return;
      }

      const userId = authData.user.id;
      const emailPrefix = email.split("@")[0];
      const orgName = emailPrefix;
      const baseSlug = generateSlug(emailPrefix);

      // Step 2: Generate unique slug and create organization
      const uniqueSlug = await generateUniqueSlug(baseSlug);

      const { data: orgData, error: orgError } = await supabaseClient
        .from("organizations")
        .insert({
          name: orgName,
          slug: uniqueSlug,
        })
        .select("id")
        .single();

      if (orgError || !orgData) {
        // If org creation fails, we should ideally delete the user
        // But Supabase Auth doesn't allow deleting users from client
        // So we'll just show an error and let them try again
        setError(
          `Failed to create organization: ${orgError?.message || "unknown error"}`
        );
        setLoading(false);
        return;
      }

      const orgId = orgData.id;

      // Step 3: Create profile
      const { error: profileError } = await supabaseClient
        .from("profiles")
        .insert({
          id: userId, // profiles.id references auth.users.id
          full_name: emailPrefix,
          default_org_id: orgId,
        });

      if (profileError) {
        // Try to clean up organization
        await supabaseClient.from("organizations").delete().eq("id", orgId);
        setError(
          `Failed to create profile: ${profileError.message || "unknown error"}`
        );
        setLoading(false);
        return;
      }

      // Step 4: Create membership
      const { error: membershipError } = await supabaseClient
        .from("memberships")
        .insert({
          org_id: orgId,
          user_id: userId, // memberships.user_id references profiles.id (which is same as auth.users.id)
          role: "owner",
        });

      if (membershipError) {
        // Try to clean up profile and organization
        await supabaseClient.from("profiles").delete().eq("id", userId);
        await supabaseClient.from("organizations").delete().eq("id", orgId);
        setError(
          `Failed to create membership: ${membershipError.message || "unknown error"}`
        );
        setLoading(false);
        return;
      }

      // Success! Store session token and redirect
      if (authData.session) {
        document.cookie = `sb-access-token=${authData.session.access_token}; path=/; max-age=${authData.session.expires_in}; SameSite=Lax`;
        router.push("/");
        router.refresh();
      } else {
        // Email confirmation might be required
        setError(
          "Account created! Please check your email to confirm your account before signing in."
        );
        setLoading(false);
      }
    } catch (err) {
      setError((err as Error).message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-lg font-semibold text-white mb-4">
            WA
          </div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
            Create your account
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Sign up to get started with WhatsApp AI Bot
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80"
        >
          {error && (
            <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-400"
                placeholder="you@example.com"
                disabled={loading}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-400"
                placeholder="••••••••"
                disabled={loading}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Must be at least 6 characters
              </p>
            </label>

            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
                loading
                  ? "cursor-not-allowed bg-slate-400"
                  : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              {loading ? "Creating account..." : "Sign up"}
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

