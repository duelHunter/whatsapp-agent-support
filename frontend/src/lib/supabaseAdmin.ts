// lib/supabaseAdmin.ts
// Server-only: Uses service role key for admin operations
import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. This is required for server-side admin operations."
  );
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL environment variable."
  );
}

/**
 * Supabase admin client with service role key.
 * ⚠️ WARNING: This client bypasses RLS. Use only in server-side code.
 * Never expose this key to the client.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);


