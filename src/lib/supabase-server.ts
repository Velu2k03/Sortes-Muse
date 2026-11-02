import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Supabase client for the magic-link callback.
 * Uses only the public URL and anon key. Service role keys are
 * never used in this app. Returns null when Supabase is not
 * configured in the server environment.
 */
export async function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const jar = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          jar.set(name, value, options);
        });
      },
    },
  });
}
