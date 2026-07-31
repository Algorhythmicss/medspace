import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// medSpace uses Supabase for exactly one thing: proving that whoever holds the
// phone controls a particular Google account. Patient data is read with Prisma
// as the postgres role; the publishable key never touches a patient row, and
// RLS is deny-all so it could not if it tried. The Supabase session is
// discarded at the callback — medSpace mints its own patient cookie — so there
// is never a Supabase session to read on a later request, and no need for any
// Supabase code in the proxy.

function supabaseUrl(): string {
  const s = process.env.MEDSPACE_SUPABASE_URL;
  if (!s) throw new Error("MEDSPACE_SUPABASE_URL is not set");
  return s;
}
function publishableKey(): string {
  const s = process.env.MEDSPACE_SUPABASE_PUBLISHABLE_KEY;
  if (!s) throw new Error("MEDSPACE_SUPABASE_PUBLISHABLE_KEY is not set");
  return s;
}

/**
 * Request-scoped client for a Server Action or Route Handler (anywhere
 * cookies() is writable). `authHeaders` collects the no-store cache headers the
 * library asks for via setAll's second argument — apply them to any Response
 * you build by hand (redirects from a Route Handler don't inherit them).
 */
export async function supabaseForAuth(): Promise<{
  supabase: SupabaseClient;
  authHeaders: Record<string, string>;
}> {
  const jar = await cookies();
  const authHeaders: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl(), publishableKey(), {
    cookies: {
      // getAll/setAll are required in @supabase/ssr 0.12; the get/set/remove
      // overload is deprecated and, on the server, reads large sessions back
      // corrupted. setAll's second argument (added post-2024, absent from every
      // old tutorial) carries the private/no-store cache headers — keep it.
      getAll: () => jar.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value, options } of cookiesToSet) {
          try {
            jar.set(name, value, options);
          } catch {
            // Server Components can't set cookies; harmless here (we run in
            // actions/route handlers) and never worth throwing over.
          }
        }
        if (headers) Object.assign(authHeaders, headers);
      },
    },
  });

  return { supabase, authHeaders };
}
