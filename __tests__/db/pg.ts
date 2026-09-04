/**
 * Raw Postgres access for the two things Supabase's REST/RPC surface can't
 * do: installing a temporary failure-inducing trigger (to prove signup
 * atomicity) and reading auth.users directly (auth isn't exposed over
 * PostgREST — see supabase/config.toml [api].schemas).
 *
 * Local default matches `supabase start`'s fixed local port; CI must set
 * SUPABASE_DB_URL to its own local stack's equivalent (see
 * .github/workflows/ci.yml).
 */
import { Client } from "pg";

const DEFAULT_LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function withPgClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? DEFAULT_LOCAL_DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
