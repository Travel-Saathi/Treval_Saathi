import { useAuth } from "@clerk/expo";
import { useMemo, useRef } from "react";

import { createClerkSupabaseClient } from "../lib/supabase";

export function useSupabase() {
  const { getToken } = useAuth();

  const getTokenRef = useRef(getToken);

  // Always keep the latest Clerk function
  getTokenRef.current = getToken;

  const client = useMemo(() => {
    return createClerkSupabaseClient(() => getTokenRef.current());
  }, []);

  return client;
}