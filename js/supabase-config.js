
"use strict";

// Timidy Store — Supabase configuration
// Only use your PUBLIC project URL and publishable key.

const SUPABASE_URL = "https://vdciqkibabxmpemplvtb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6ZzMCZHuwQxvSarwgXjLQQ_UwOeTvnk";

if (!window.supabase?.createClient) {
  throw new Error("Supabase library failed to load.");
}

window.timidySupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
