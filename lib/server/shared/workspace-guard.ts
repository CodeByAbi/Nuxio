/**
 * workspace-guard.ts
 *
 * Layer 1 of the two-layer multi-tenancy isolation model.
 *
 * Every API route that accepts a workspace_id parameter MUST call
 * verifyWorkspaceMembership() before executing any business logic.
 *
 * Layer 1 (this file): App-level membership check
 * Layer 2 (database):  RLS policies via auth_workspace_ids(), plus triggers
 *                       for invariants RLS alone can't express (see
 *                       migration 0007_phase3_security_hardening.sql).
 *
 * Both layers are REQUIRED. Neither is optional — Layer 2 exists precisely
 * because a caller can reach Postgres directly via PostgREST with nothing
 * but a valid session and the public anon key, bypassing this file entirely.
 *
 * Failure behavior (RN-02):
 *   - Returns 404 NotFoundError (never 403)
 *   - Does NOT confirm whether the workspace exists
 *   - Prevents IDOR: attacker cannot enumerate valid workspace IDs
 */

import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { NotFoundError, AuthorizationError } from "@/lib/server/shared/errors";
import { childLogger } from "@/lib/server/shared/logger";

const log = childLogger("workspace-guard");

/**
 * Verifies that the authenticated user is a member of the specified workspace.
 *
 * @param userId - The authenticated user's ID (from requireAuth())
 * @param workspaceId - The workspace ID from the request
 * @throws {NotFoundError} If user is not a member (404, not 403)
 */
export async function verifyWorkspaceMembership(userId: string, workspaceId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    log.error({ userId, workspaceId, err: error.message }, "membership check failed with a database error");
    throw new Error("Failed to verify workspace membership");
  }

  if (!data) {
    // RN-02: Return 404 (not 403) — never confirm workspace existence
    log.warn({ userId, workspaceId }, "membership check failed: not a member");
    throw new NotFoundError("Workspace not found");
  }

  log.debug({ userId, workspaceId }, "membership verified");
}

/**
 * Verifies that the authenticated user is an admin of the specified workspace.
 *
 * Use this for admin-only actions (e.g., inviting members, updating workspace settings).
 *
 * @param userId - The authenticated user's ID
 * @param workspaceId - The workspace ID from the request
 * @throws {NotFoundError} If user is not a member (404)
 * @throws {AuthorizationError} If user is a member but not an admin (403)
 */
export async function verifyWorkspaceAdmin(userId: string, workspaceId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    log.error({ userId, workspaceId, err: error.message }, "admin check failed with a database error");
    throw new Error("Failed to verify workspace admin");
  }

  if (!data) {
    log.warn({ userId, workspaceId }, "admin check failed: not a member");
    throw new NotFoundError("Workspace not found");
  }

  if (data.role !== "admin") {
    log.warn({ userId, workspaceId, role: data.role }, "admin check failed: insufficient role");
    throw new AuthorizationError("Admin access required");
  }

  log.debug({ userId, workspaceId }, "admin verified");
}

export interface UserWorkspaceSummary {
  id: string;
  name: string;
  type: string;
  role: string;
  created_at: string;
}

/**
 * Lists all workspaces the authenticated user is a member of.
 *
 * Used for workspace switcher UI and determining which workspace to use
 * as default when none is specified.
 */
export async function listUserWorkspaces(userId: string): Promise<UserWorkspaceSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workspace_members")
    .select(
      `
      role,
      workspaces:workspace_id (
        id,
        name,
        type,
        created_at
      )
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true }); // Personal workspace (created first) appears first

  if (error) {
    log.error({ userId, err: error.message }, "failed to list user workspaces");
    throw new Error("Failed to list workspaces");
  }

  type Row = { role: string; workspaces: { id: string; name: string; type: string; created_at: string } | null };

  return ((data ?? []) as unknown as Row[])
    .filter((item) => item.workspaces !== null)
    .map((item) => ({
      id: item.workspaces!.id,
      name: item.workspaces!.name,
      type: item.workspaces!.type,
      role: item.role,
      created_at: item.workspaces!.created_at,
    }));
}
