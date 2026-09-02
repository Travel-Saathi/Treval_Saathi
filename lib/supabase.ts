import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY!;
console.log("SUPABASE URL:", supabaseUrl);
console.log("SUPABASE KEY EXISTS:", !!supabaseKey);
export function createClerkSupabaseClient(
  getToken: () => Promise<string | null>
) {
  console.log("createClerkSupabaseClient: accessToken passed:", typeof getToken === "function");
  return createClient(
    supabaseUrl,
    supabaseKey,
    {
      accessToken: async () => {
        const token = await getToken();
        console.log("Supabase accessToken (Clerk JWT) provided:", !!token);
        return token;
      },
    }
  );
}