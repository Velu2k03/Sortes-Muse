import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for email OTP sign-in.
 * Uses only the public URL and anon key, which are designed to be
 * exposed in browser code. Returns null when Supabase is not
 * configured (for example local dev without the public variables),
 * so the account page can fall back to the local email-code flow.
 * Never use a service role key here.
 */
let client: SupabaseClient | null | undefined;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    client = null;
    return null;
  }
  client = createBrowserClient(url, anon);
  return client;
}
