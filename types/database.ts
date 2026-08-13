export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * Hand-maintained database type stub for Phase 2 (user_profiles).
 *
 * Regenerate this file with `supabase gen types typescript` after applying
 * migrations against the local Supabase stack — do NOT hand-edit further.
 */
export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
