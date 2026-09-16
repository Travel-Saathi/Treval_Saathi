import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase data layer for `public.profiles`.
 *
 * Profiles are keyed by the Clerk user id via `profiles.clerk_id` (the
 * `clerk_id` unique constraint). Every query here goes through the
 * authenticated Supabase client from `useSupabase()` — RLS guarantees a
 * user can only read/write their own row, and no profile ids or tokens are
 * ever hard-coded.
 *
 * This table is the only source of truth for the user's identity fields:
 * full_name, username, avatar_url, bio, age, home_city, email.
 */

export interface ProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  age: number | null;
  home_city: string | null;
  is_admin: boolean | null;
  created_at: string | null;
  clerk_id: string | null;
  email: string | null;
}

const PROFILE_COLUMNS =
  "id, full_name, username, avatar_url, bio, age, home_city, is_admin, created_at, clerk_id, email";

export interface UpdateProfileInput {
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  age?: number | null;
  home_city?: string | null;
}

/**
 * Load the authenticated user's profile by their Clerk user id.
 * Returns null when no profile row exists yet.
 */
export async function getProfileByClerkId(
  supabase: SupabaseClient,
  clerkId: string
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ProfileRow | null) ?? null;
}

/**
 * Update fields on the authenticated user's profile row. Only the
 * supplied keys are written; everything else is left untouched.
 */
export async function updateProfile(
  supabase: SupabaseClient,
  clerkId: string,
  input: UpdateProfileInput
): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from("profiles")
    .update(input)
    .eq("clerk_id", clerkId)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return data as ProfileRow;
}

/**
 * Whether the core identity fields a traveler card would display are all
 * filled in. Used to show the "Complete your profile" prompt.
 */
export function isCoreProfileComplete(
  profile: Pick<
    ProfileRow,
    "full_name" | "username" | "home_city"
  >
): boolean {
  return Boolean(
    profile.full_name?.trim() &&
      profile.username?.trim() &&
      profile.home_city?.trim()
  );
}