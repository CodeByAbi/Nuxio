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
 *
 * Every mutation here also has a database-level backstop (triggers /
 * SECURITY DEFINER RPCs — see migrations 0006 and 0007) that is authoritative
 * even if this service layer is bypassed entirely via direct PostgREST
 * access. The checks in this file exist for fast, friendly error messages —
 * not as the only line of defense.
 */

import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { NotFoundError, ConflictError, DomainRuleError, AuthorizationError } from "@/lib/server/shared/errors";
import { childLogger } from "@/lib/server/shared/logger";
import type {
  Workspace,
  WorkspaceMember,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  InviteMemberInput,
  ChangeMemberRoleInput,
} from "@/types/workspace";

const log = childLogger("workspace-service");

/**
 * Get workspace by ID.
 * Caller must verify workspace membership before calling this.
 *
 * @throws {NotFoundError} If workspace not found
 */
export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("workspaces").select("*").eq("id", workspaceId).single();

  if (error || !data) {
    log.warn({ workspaceId, err: error?.message }, "workspace not found");
    throw new NotFoundError("Workspace not found");
  }

  return data as Workspace;
}

/**
 * Personal workspace creation is automatic on signup via the
 * `handle_new_user` trigger (migration 0006) — users cannot create Personal
 * workspaces manually via API. This function intentionally does not exist
 * as a callable path; it documents that fact for anyone tempted to add one.
 */
export async function createPersonalWorkspace(): Promise<never> {
  throw new DomainRuleError(
    "Personal workspace creation happens automatically at signup and cannot be invoked directly.",
  );
}

/**
 * Create Business workspace via RPC.
 * Calls create_business_workspace() Postgres function (migration 0006).
 *
 * @throws {DomainRuleError} If validation fails
 */
export async function createBusinessWorkspace(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
  const supabase = await createSupabaseServerClient();

  if (input.type !== "business") {
    throw new DomainRuleError("Only Business workspaces can be created via API");
  }

  const { data: workspaceId, error: rpcError } = await supabase.rpc("create_business_workspace", {
    p_name: input.name,
  });

  if (rpcError) {
    log.error({ userId, name: input.name, err: rpcError.message }, "RPC create_business_workspace failed");

    if (rpcError.message.includes("between 3 and 50 characters")) {
      throw new DomainRuleError("Workspace name must be between 3 and 50 characters");
    }

    throw new Error("Failed to create Business workspace");
  }

  if (!workspaceId) {
    throw new Error("RPC did not return workspace ID");
  }

  return getWorkspace(workspaceId);
}

/**
 * Update workspace settings (name only in MVP).
 * Caller must verify workspace admin before calling this.
 *
 * Only `name` is ever written here — `type` is deliberately never accepted
 * (RN-05). Even if this were changed, migration 0007's
 * `trg_prevent_workspace_type_change` trigger rejects any `type` mutation
 * at the database layer regardless of caller.
 *
 * @throws {NotFoundError} If workspace not found
 */
export async function updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput): Promise<Workspace> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workspaces")
    .update({
      name: input.name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId)
    .select()
    .single();

  if (error || !data) {
    log.error({ workspaceId, err: error?.message }, "workspace update failed");
    throw new NotFoundError("Workspace not found or update failed");
  }

  log.info({ workspaceId, name: input.name }, "workspace updated");

  return data as Workspace;
}

/**
 * List all members of a workspace.
 * Caller must verify workspace membership before calling this.
 */
export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workspace_members")
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
    .eq("workspace_id", workspaceId)
    .order("invited_at", { ascending: true });

  if (error) {
    log.error({ workspaceId, err: error.message }, "listMembers failed");
    throw new Error("Failed to list workspace members");
  }

  type Row = {
    id: string;
    workspace_id: string;
    user_id: string;
    role: WorkspaceMember["role"];
    invited_at: string;
    user_profiles: { display_name: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((item) => ({
    id: item.id,
    workspace_id: item.workspace_id,
    user_id: item.user_id,
    role: item.role,
    invited_at: item.invited_at,
    display_name: item.user_profiles?.display_name ?? undefined,
  }));
}

/**
 * Invite a new member to workspace by email.
 * Caller must verify workspace admin before calling this.
 *
 * Delegates to the `invite_workspace_member` SECURITY DEFINER RPC (migration
 * 0007), which does the email → auth user lookup server-side (auth.users is
 * not exposed over PostgREST, and this must never be done with the
 * service-role key from request-scoped code). The RPC re-verifies the caller
 * is an admin of the target workspace itself, so this stays safe even if
 * called directly via PostgREST, bypassing this service and its route.
 *
 * @throws {NotFoundError} If no user exists with that email
 * @throws {ConflictError} If the user is already a member
 * @throws {AuthorizationError} If the caller is not an admin (defense in depth)
 */
export async function inviteMember(workspaceId: string, input: InviteMemberInput): Promise<WorkspaceMember> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .rpc("invite_workspace_member", {
      p_workspace_id: workspaceId,
      p_email: input.email,
      p_role: input.role,
    })
    .single();

  if (error) {
    if (error.message.includes("USER_NOT_FOUND")) {
      throw new NotFoundError("User not found with that email");
    }
    if (error.message.includes("ALREADY_MEMBER")) {
      throw new ConflictError("User is already a member of this workspace");
    }
    if (error.message.includes("FORBIDDEN")) {
      throw new AuthorizationError("Admin access required");
    }

    log.error({ workspaceId, email: input.email, err: error.message }, "inviteMember RPC failed");
    throw new Error("Failed to invite member");
  }

  log.info({ workspaceId, role: input.role }, "member invited");

  return data as WorkspaceMember;
}

/**
 * Remove a member from workspace.
 * Caller must verify workspace admin before calling this.
 *
 * IMPORTANT: Blocked by the `prevent_last_admin_removal` trigger (RN-17) —
 * that trigger is the authoritative check; this function only translates its
 * error into a friendly `DomainRuleError`.
 *
 * @param memberId - workspace_members.id (not user_id)
 * @throws {DomainRuleError} If trying to remove last admin
 */
export async function removeMember(workspaceId: string, memberId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("id", memberId)
    .eq("workspace_id", workspaceId); // double-filter for safety

  if (error) {
    if (error.message.includes("LAST_ADMIN")) {
      log.warn({ workspaceId, memberId }, "attempted to remove last admin");
      throw new DomainRuleError("Cannot remove the last admin. Promote another member to admin first.");
    }

    log.error({ workspaceId, memberId, err: error.message }, "removeMember failed");
    throw new Error("Failed to remove member");
  }

  log.info({ workspaceId, memberId }, "member removed");
}

/**
 * Change a member's role.
 * Caller must verify workspace admin before calling this.
 *
 * IMPORTANT: Blocked by the `prevent_last_admin_demotion` trigger (RN-17) —
 * demoting the sole remaining admin fails at the database layer even if this
 * function is bypassed. The message-substring check below only exists to
 * turn that DB error into the same friendly `DomainRuleError` shape used by
 * `removeMember`.
 */
export async function changeMemberRole(
  workspaceId: string,
  memberId: string,
  input: ChangeMemberRoleInput,
): Promise<WorkspaceMember> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workspace_members")
    .update({ role: input.role })
    .eq("id", memberId)
    .eq("workspace_id", workspaceId) // double-filter for safety
    .select()
    .single();

  if (error) {
    if (error.message.includes("LAST_ADMIN")) {
      log.warn({ workspaceId, memberId }, "attempted to demote the last admin");
      throw new DomainRuleError("Cannot demote the last admin. Promote another member to admin first.");
    }

    log.error({ workspaceId, memberId, err: error.message }, "changeMemberRole failed");
    throw new NotFoundError("Member not found");
  }

  if (!data) {
    throw new NotFoundError("Member not found");
  }

  log.info({ workspaceId, memberId, newRole: input.role }, "member role changed");

  return data as WorkspaceMember;
}
