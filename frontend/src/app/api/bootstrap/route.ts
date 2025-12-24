// app/api/bootstrap/route.ts
// Server-side endpoint to bootstrap organization, profile, and membership for new users
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Generate a URL-friendly slug from a string
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
    const { data } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) {
      return slug;
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8);
    slug = `${baseSlug}-${randomSuffix}`;
    attempts++;
  }

  return `${baseSlug}-${Date.now().toString(36)}`;
}

/**
 * Verify the request is authenticated and return the user ID
 */
async function getAuthenticatedUserId(
  req: NextRequest
): Promise<string | null> {
  // Try to get token from Authorization header
  const authHeader = req.headers.get("authorization");
  let accessToken: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    accessToken = authHeader.substring(7);
  } else {
    // Try to get from cookie (for browser requests)
    accessToken = req.cookies.get("sb-access-token")?.value || null;
  }

  if (!accessToken) {
    return null;
  }

  // Verify token and get user
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user.id;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify authentication
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in first." },
        { status: 401 }
      );
    }

    // 2. Check if user already has a profile (idempotent check)
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, default_org_id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile && existingProfile.default_org_id) {
      // User already bootstrapped, get their membership
      const { data: membership } = await supabaseAdmin
        .from("memberships")
        .select("org_id, role")
        .eq("user_id", userId)
        .eq("org_id", existingProfile.default_org_id)
        .single();

      if (membership) {
        return NextResponse.json({
          ok: true,
          orgId: membership.org_id,
          role: membership.role,
          message: "User already bootstrapped",
        });
      }
    }

    // 3. Get user email for organization name
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
      userId
    );
    if (!authUser?.user?.email) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    const email = authUser.user.email;
    const emailPrefix = email.split("@")[0];
    const orgName = emailPrefix;
    const baseSlug = generateSlug(emailPrefix);
    const uniqueSlug = await generateUniqueSlug(baseSlug);

    // 4. Create organization (using admin client to bypass RLS)
    let orgId: string;
    if (existingProfile?.default_org_id) {
      // Reuse existing org
      orgId = existingProfile.default_org_id;
    } else {
      const { data: orgData, error: orgError } = await supabaseAdmin
        .from("organizations")
        .insert({
          name: orgName,
          slug: uniqueSlug,
        })
        .select("id")
        .single();

      if (orgError || !orgData) {
        console.error("Failed to create organization:", orgError);
        return NextResponse.json(
          {
            error: `Failed to create organization: ${orgError?.message || "unknown error"}`,
          },
          { status: 500 }
        );
      }
      orgId = orgData.id;
    }

    // 5. Create or update profile
    if (!existingProfile) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: userId,
          full_name: emailPrefix,
          default_org_id: orgId,
        });

      if (profileError) {
        // Try to clean up organization if profile creation fails
        await supabaseAdmin.from("organizations").delete().eq("id", orgId);
        console.error("Failed to create profile:", profileError);
        return NextResponse.json(
          {
            error: `Failed to create profile: ${profileError.message}`,
          },
          { status: 500 }
        );
      }
    } else if (!existingProfile.default_org_id) {
      // Update existing profile with default_org_id
      await supabaseAdmin
        .from("profiles")
        .update({ default_org_id: orgId })
        .eq("id", userId);
    }

    // 6. Create membership (idempotent: check if exists first)
    const { data: existingMembership } = await supabaseAdmin
      .from("memberships")
      .select("id, role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingMembership) {
      const { error: membershipError } = await supabaseAdmin
        .from("memberships")
        .insert({
          org_id: orgId,
          user_id: userId,
          role: "owner",
        });

      if (membershipError) {
        // Cleanup: delete profile and org if membership fails
        if (!existingProfile) {
          await supabaseAdmin.from("profiles").delete().eq("id", userId);
        }
        await supabaseAdmin.from("organizations").delete().eq("id", orgId);
        console.error("Failed to create membership:", membershipError);
        return NextResponse.json(
          {
            error: `Failed to create membership: ${membershipError.message}`,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      orgId,
      role: existingMembership?.role || "owner",
    });
  } catch (error) {
    console.error("Bootstrap error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred during bootstrap",
      },
      { status: 500 }
    );
  }
}


