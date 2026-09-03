/**
 * workspace.service.ts
 *
 * Business logic for Workspace domain.
 *
 * Key responsibilities:
 * - Create Personal workspace (called only by handle_new_user trigger)
 * - Create Business workspace via RPC
 * - CRUD operations on workspace metadata
 * - Member management (invite, remove, change role)
 * - Enforce business rules (e.g., RN-17: cannot remove last admin)
 */

import { createServerClient } from '@/lib/server/shared/supabase-server-client';
import {
  NotFoundError,
  ConflictError,
  DomainRuleError,
  AuthorizationError,
} from '@/lib/server/shared/errors';
import logger from '@/lib/server/shared/logger';
import type {
  Workspace,
  WorkspaceMember,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  InviteMemberInput,
  ChangeMemberRoleInput,
} from '@/types/workspace';

/**
 * Get workspace by ID.
 * Caller must verify workspace membership before calling this.
 *
 * @param workspaceId - Workspace ID
 * @returns Workspace object
 * @throws {NotFoundError} If workspace not found
 */
export async function getWorkspace(
  workspaceId: string,
): Promise<Workspace> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single();

  if (error || !data) {
    logger.warn('workspace.service: workspace not found', {
      workspaceId,
      error: error?.message,
    });
    throw new NotFoundError('Workspace not found');
  }

  return data as Workspace;
}

/**
 * Create Personal workspace.
 *
 * IMPORTANT: This should ONLY be called by handle_new_user trigger (migration 0006).
 * Personal workspace creation is automatic on signup — users cannot create
 * Personal workspaces manually via API.
 *
 * This function exists as a service method for testing purposes only.
 *
 * @param userId - User ID from auth.users
 * @param displayName - Initial display name for user_profiles
 * @returns Workspace object
 */
export async function createPersonalWorkspace(
  userId: string,
  displayName: string = 'User',
): Promise<Workspace> {
  const supabase = await createServerClient();

  // This would be called by trigger with elevated privileges
  // For now, it's a placeholder — actual Personal workspace creation
  // happens in handle_new_user() trigger (migration 0006)

  logger.info('workspace.service: createPersonalWorkspace called', {
    userId,
  });

  throw new Error(
    'Personal workspace creation should only happen via handle_new_user trigger',
  );
}

/**
 * Create Business workspace via RPC.
 * Calls create_business_workspace() Postgres function (migration 0006).
 *
 * @param userId - Authenticated user ID
 * @param input - Workspace creation data
 * @returns Workspace object
 * @throws {DomainRuleError} If validation fails
 */
export async function createBusinessWorkspace(
  userId: string,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  const supabase = await createServerClient();

  // Validate input
  if (input.type !== 'business') {
    throw new DomainRuleError(
      'Only Business workspaces can be created via API',
    );
  }

  // Call RPC (handles workspace + membership + category seeding atomically)
  const { data: workspaceId, error: rpcError } = await supabase.rpc(
    'create_business_workspace',
    {
      p_name: input.name,
    },
  );

  if (rpcError) {
    logger.error('workspace.service: RPC create_business_workspace failed', {
      userId,
      name: input.name,
      error: rpcError.message,
    });

    // Handle specific error cases
    if (rpcError.message.includes('between 3 and 50 characters')) {
      throw new DomainRuleError('Workspace name must be between 3 and 50 characters');
    }

    throw new Error('Failed to create Business workspace');
  }

  if (!workspaceId) {
    throw new Error('RPC did not return workspace ID');
  }

  // Fetch and return the created workspace
  return getWorkspace(workspaceId);
}

/**
 * Update workspace settings (name only in MVP).
 * Caller must verify workspace admin before calling this.
 *
 * @param workspaceId - Workspace ID
 * @param input - Update data
 * @returns Updated workspace
 * @throws {NotFoundError} If workspace not found
 */
export async function updateWorkspace(
  workspaceId: string,
  input: UpdateWorkspaceInput,
): Promise<Workspace> {
  const supabase = await createServerClient();

  // Update (RLS policy ensures user is admin)
  const { data, error } = await supabase
    .from('workspaces')
    .update({
      name: input.name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workspaceId)
    .select()
    .single();

  if (error || !data) {
    logger.error('workspace.service: update failed', {
      workspaceId,
      error: error?.message,
    });
    throw new NotFoundError('Workspace not found or update failed');
  }

  logger.info('workspace.service: workspace updated', {
    workspaceId,
    name: input.name,
  });

  return data as Workspace;
}

/**
 * List all members of a workspace.
 * Caller must verify workspace membership before calling this.
 *
 * @param workspaceId - Workspace ID
 * @returns Array of workspace members with user profile data
 */
export async function listMembers(
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('workspace_members')
    .select(
      `
      id,
      workspace_id,
      user_id,
      role,
      invited_at,
      user_profiles:user_id (
        display_name
      )
    `,
    )
    .eq('workspace_id', workspaceId)
    .order('invited_at', { ascending: true });

  if (error) {
    logger.error('workspace.service: listMembers failed', {
      workspaceId,
      error: error.message,
    });
    throw new Error('Failed to list workspace members');
  }

  // Flatten nested structure
  return (
    data?.map((item: any) => ({
      id: item.id,
      workspace_id: item.workspace_id,
      user_id: item.user_id,
      role: item.role,
      invited_at: item.invited_at,
      display_name: item.user_profiles?.display_name,
    })) || []
  );
}

/**
 * Invite a new member to workspace.
 * Caller must verify workspace admin before calling this.
 *
 * @param workspaceId - Workspace ID
 * @param input - Invitation data (email, role)
 * @throws {NotFoundError} If user with email not found
 * @throws {ConflictError} If user is already a member
 */
export async function inviteMember(
  workspaceId: string,
  input: InviteMemberInput,
): Promise<WorkspaceMember> {
  const supabase = await createServerClient();

  // Step 1: Find user by email
  const { data: authUser, error: userError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', input.email) // In real app, need to query auth.users by email
    .maybeSingle();

  if (userError || !authUser) {
    // In MVP, this is simplified
    // Real implementation needs admin API to search auth.users by email
    throw new NotFoundError('User not found with that email');
  }

  // Step 2: Check if already a member
  const { data: existing } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (existing) {
    throw new ConflictError('User is already a member of this workspace');
  }

  // Step 3: Insert membership (RLS policy ensures caller is admin)
  const { data, error } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      user_id: authUser.id,
      role: input.role,
    })
    .select()
    .single();

  if (error) {
    logger.error('workspace.service: inviteMember failed', {
      workspaceId,
      email: input.email,
      error: error.message,
    });
    throw new Error('Failed to invite member');
  }

  logger.info('workspace.service: member invited', {
    workspaceId,
    userId: authUser.id,
    role: input.role,
  });

  return data as WorkspaceMember;
}

/**
 * Remove a member from workspace.
 * Caller must verify workspace admin before calling this.
 *
 * IMPORTANT: Blocked by prevent_last_admin_removal trigger (RN-17).
 * Cannot remove last admin — will throw LAST_ADMIN exception.
 *
 * @param workspaceId - Workspace ID
 * @param memberId - workspace_members.id (not user_id)
 * @throws {DomainRuleError} If trying to remove last admin
 */
export async function removeMember(
  workspaceId: string,
  memberId: string,
): Promise<void> {
  const supabase = await createServerClient();

  // Delete (trigger will prevent if last admin)
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('id', memberId)
    .eq('workspace_id', workspaceId); // double-filter for safety

  if (error) {
    // Check if it's the LAST_ADMIN trigger error
    if (error.message.includes('LAST_ADMIN')) {
      logger.warn('workspace.service: attempted to remove last admin', {
        workspaceId,
        memberId,
      });
      throw new DomainRuleError(
        'Cannot remove the last admin. Promote another member to admin first.',
      );
    }

    logger.error('workspace.service: removeMember failed', {
      workspaceId,
      memberId,
      error: error.message,
    });
    throw new Error('Failed to remove member');
  }

  logger.info('workspace.service: member removed', {
    workspaceId,
    memberId,
  });
}

/**
 * Change a member's role.
 * Caller must verify workspace admin before calling this.
 *
 * @param workspaceId - Workspace ID
 * @param memberId - workspace_members.id
 * @param input - New role
 */
export async function changeMemberRole(
  workspaceId: string,
  memberId: string,
  input: ChangeMemberRoleInput,
): Promise<WorkspaceMember> {
  const supabase = await createServerClient();

  // Update role (RLS policy ensures caller is admin)
  const { data, error } = await supabase
    .from('workspace_members')
    .update({
      role: input.role,
    })
    .eq('id', memberId)
    .eq('workspace_id', workspaceId) // double-filter for safety
    .select()
    .single();

  if (error || !data) {
    logger.error('workspace.service: changeMemberRole failed', {
      workspaceId,
      memberId,
      error: error?.message,
    });
    throw new NotFoundError('Member not found');
  }

  logger.info('workspace.service: member role changed', {
    workspaceId,
    memberId,
    newRole: input.role,
  });

  return data as WorkspaceMember;
}
