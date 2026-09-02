import { useAuth, useUser } from "@clerk/expo";
import { useEffect, useRef } from "react";

import { useUserStore } from "../store/userStore";
import { useSupabase } from "./usesupabase";

function isProfileComplete(profile: {
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  age: number | null;
  home_city: string | null;
}): boolean {
  return !!(
    profile.username &&
    profile.avatar_url &&
    profile.bio &&
    profile.age != null &&
    profile.home_city
  );
}

export function useUserSync() {
  const { user, isLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const supabase = useSupabase();

  const setProfileComplete = useUserStore(
    (state) => state.setProfileComplete
  );

  const setProfileLoading = useUserStore(
    (state) => state.setProfileLoading
  );

  const setIsAdmin = useUserStore(
    (state) => state.setIsAdmin
  );

  const setSyncError = useUserStore(
    (state) => state.setSyncError
  );

  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    // Clerk is still loading.
    // Do not leave the profile loading state stuck.
    if (!isLoaded) {
      setProfileLoading(false);
      return;
    }

    // User is not authenticated.
    if (!isSignedIn || !user) {
      lastSyncedUserId.current = null;

      setProfileLoading(false);
      setSyncError(null);
      setProfileComplete(false);
      setIsAdmin(false);

      return;
    }

    // This user has already been synced.
    if (lastSyncedUserId.current === user.id) {
      setProfileLoading(false);
      return;
    }

    let cancelled = false;

    const syncUser = async () => {
      try {
        setProfileLoading(true);
        setSyncError(null);

        console.log("[AUTH_DEBUG] SYNC_START", {
          userId: user.id,
        });

        console.log("PROFILE SYNC START");
        console.log("CLERK USER EXISTS:", !!user);
        console.log("SUPABASE CLIENT EXISTS:", !!supabase);

        // 1. Find existing profile.
        const { data: existing, error: loadError } = await supabase
          .from("profiles")
          .select(
            "id, clerk_id, email, full_name, username, avatar_url, bio, age, home_city, is_admin"
          )
          .eq("clerk_id", user.id)
          .maybeSingle();

        if (loadError) {
          console.error(
            "SUPABASE LOAD ERROR CODE:",
            loadError.code
          );

          console.error(
            "SUPABASE LOAD ERROR MESSAGE:",
            loadError.message
          );

          console.error(
            "SUPABASE LOAD ERROR DETAILS:",
            loadError.details
          );

          if (!cancelled) {
            setSyncError(loadError.message);
            setProfileLoading(false);
          }

          return;
        }

        console.log("PROFILE FOUND:", !!existing);

        // 2. Create profile if it doesn't exist.
        let profile = existing;

        if (!profile) {
          const { data: created, error: createError } =
            await supabase
              .from("profiles")
              .insert({
                clerk_id: user.id,
                email:
                  user.primaryEmailAddress?.emailAddress ?? null,
                full_name: user.fullName ?? null,
              })
              .select(
                "id, clerk_id, email, full_name, username, avatar_url, bio, age, home_city, is_admin"
              )
              .single();

          if (createError) {
            console.error(
              "SUPABASE CREATE ERROR CODE:",
              createError.code
            );

            console.error(
              "SUPABASE CREATE ERROR MESSAGE:",
              createError.message
            );

            console.error(
              "SUPABASE CREATE ERROR DETAILS:",
              createError.details
            );

            if (!cancelled) {
              setSyncError(createError.message);
              setProfileLoading(false);
            }

            return;
          }

          console.log("PROFILE CREATED:", true);

          profile = created;
        }

        // Component/effect was cleaned up.
        if (cancelled) {
          return;
        }

        // Mark this user as successfully synced.
        lastSyncedUserId.current = user.id;

        const complete = isProfileComplete(profile);

        setProfileComplete(complete);
        setIsAdmin(profile.is_admin ?? false);
        setProfileLoading(false);

        console.log("[AUTH_DEBUG] SYNC_COMPLETE", {
          userId: user.id,
        });

        console.log("PROFILE COMPLETE:", complete);
      } catch (error) {
        console.error("[AUTH_DEBUG] SYNC_ERROR", error);

        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to sync user profile";

          setSyncError(message);
          setProfileLoading(false);
        }
      }
    };

    syncUser();

    return () => {
      cancelled = true;
    };
  }, [
    isLoaded,
    isSignedIn,
    user?.id,
    supabase,
    setProfileLoading,
    setSyncError,
    setProfileComplete,
    setIsAdmin,
  ]);
}