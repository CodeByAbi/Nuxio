export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * Placeholder until `supabase gen types typescript` is run against a real
 * schema — `supabase/migrations/` has no applied tables yet (see
 * CLAUDE.md: "the initial Supabase migration file exists but is currently
 * empty"). Regenerate this file after the first real migration instead of
 * hand-editing it.
 */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
