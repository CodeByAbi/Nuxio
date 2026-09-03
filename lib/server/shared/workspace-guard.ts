/**
 * workspace-guard.ts
 *
 * Layer 1 of the two-layer multi-tenancy isolation model.
 *
 * Every API route that accepts a workspace_id parameter MUST call
 * verifyWorkspaceMembership() before executing any business logic.
 *
 * Layer 1 (this file): App-level membership check
 * Layer 2 (database):  RLS policies via auth_workspace_ids()
 *
 * Both layers are REQUIRED. Neither is optional.
 *
 * Failure behavior (RN-02):
 *   - Returns 404 NotFoundError (never 403)
 *   - Does NOT confirm whether the workspace exists
 *   - Prevents IDOR: attacker cannot enumerate valid workspace IDs
 */

import { createServerClient } from '@/lib/server/shared/supabase-server-client';
import { NotFoundError } from '@/lib/server/shared/errors';
import logger from '@/lib/server/shared/logger';

/**
 * Verifies that the authenticated user is a member of the specified workspace.
 *
 * @param userId - The authenticated user's ID (from requireAuth())
 * @param workspaceId - The workspace ID from the request
 * @throws {NotFoundError} If user is not a member (404, not 403)
 * @returns {Promise<void>}
 *
 * @example
 * ```typescript
 * // In any API route handler:
 * const user = await requireAuth();
 * await verifyWorkspaceMembership(user.id, workspaceId);
 * // Now safe to query workspace-scoped data
 * ```
 */
export async function verifyWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = await createServerClient();

  // Query workspace_members table
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error('workspace-guard: database error during membership check', {
      userId,
      workspaceId,
      error: error.message,
    });
    throw new Error('Failed to verify workspace membership');
  }

  // If no row found: user is not a member
  if (!data) {
    // RN-02: Return 404 (not 403) — never confirm workspace existence
    logger.warn('workspace-guard: membership check failed', {
      userId,
      workspaceId,
      reason: 'not_a_member',
    });
    throw new NotFoundError('Workspace not found');
  }

  // Success: user is a member
  logger.debug('workspace-guard: membership verified', {
    userId,
    workspaceId,
  });
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
 * @returns {Promise<void>}
 *
 * @example
 * ```typescript
 * // In admin-only route:
 * const user = await requireAuth();
 * await verifyWorkspaceAdmin(user.id, workspaceId);
 * ```
 */
export async function verifyWorkspaceAdmin(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error('workspace-guard: database error during admin check', {
      userId,
      workspaceId,
      error: error.message,
    });
    throw new Error('Failed to verify workspace admin');
  }

  if (!data) {
    // Not a member at all → 404
    logger.warn('workspace-guard: admin check failed - not a member', {
      userId,
      workspaceId,
    });
    throw new NotFoundError('Workspace not found');
  }

  if (data.role !== 'admin') {
    // Member but not admin → 403
    logger.warn('workspace-guard: admin check failed - insufficient role', {
      userId,
      workspaceId,
      role: data.role,
    });
    const { AuthorizationError } = await import('@/lib/server/shared/errors');
    throw new AuthorizationError('Admin access required');
  }

  // Success: user is an admin
  logger.debug('workspace-guard: admin verified', {
    userId,
    workspaceId,
  });
}

/**
 * Lists all workspaces the authenticated user is a member of.
 *
 * Used for workspace switcher UI and determining which workspace to use
 * as default when none is specified.
 *
 * @param userId - The authenticated user's ID
 * @returns {Promise<Array<{ id: string; name: string; type: string; role: string }>>}
 */
export async function listUserWorkspaces(userId: string) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('workspace_members')
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
    .eq('user_id', userId)
    .order('created_at', { ascending: true }); // Personal workspace (created first) appears first

  if (error) {
    logger.error('workspace-guard: failed to list user workspaces', {
      userId,
      error: error.message,
    });
    throw new Error('Failed to list workspaces');
  }

  // Transform nested structure to flat
  return (
    data?.map((item: any) => ({
      id: item.workspaces.id,
      name: item.workspaces.name,
      type: item.workspaces.type,
      role: item.role,
      created_at: item.workspaces.created_at,
    })) || []
  );
}
