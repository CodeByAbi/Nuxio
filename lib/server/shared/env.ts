/**
 * Fails fast with a clear message when a required server env var is missing,
 * instead of letting `undefined` silently flow into a Supabase client (whose
 * own error message won't say which env var was the culprit).
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
