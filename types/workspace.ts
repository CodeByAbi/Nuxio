/**
 * Workspace types and schemas
 * Shared between frontend and backend
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Database enums (must match migration 0004_workspace.sql)
// ---------------------------------------------------------------------------
export const WorkspaceType = {
  PERSONAL: 'personal',
  BUSINESS: 'business',
} as const;

export type WorkspaceType = (typeof WorkspaceType)[keyof typeof WorkspaceType];

export const WorkspaceRole = {
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;

export type WorkspaceRole = (typeof WorkspaceRole)[keyof typeof WorkspaceRole];

export const PlanTier = {
  FREE: 'free',
} as const;

export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  currency: string; // ISO 4217 code (e.g., 'IDR', 'USD')
  timezone: string; // IANA timezone (e.g., 'Asia/Jakarta')
  plan: PlanTier;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_at: string;
  // Joined user profile data (optional, for display)
  display_name?: string;
  email?: string;
}

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole; // Current user's role in this workspace
}

// ---------------------------------------------------------------------------
// Zod schemas (validation)
// ---------------------------------------------------------------------------

/**
 * Schema for creating a new workspace.
 * Personal workspaces are auto-created by handle_new_user trigger.
 * This schema is primarily for Business workspace creation.
 */
export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(3, 'Workspace name must be at least 3 characters')
    .max(50, 'Workspace name must be at most 50 characters')
    .trim(),
  type: z.enum([WorkspaceType.PERSONAL, WorkspaceType.BUSINESS]),
  // currency and timezone use workspace defaults in MVP
  // can be extended later if needed
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

/**
 * Schema for updating workspace settings.
 * IMPORTANT: No `type` field — workspace type is immutable (RN-05).
 */
export const updateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(3, 'Workspace name must be at least 3 characters')
    .max(50, 'Workspace name must be at most 50 characters')
    .trim()
    .optional(),
  // Future: currency, timezone if needed
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

/**
 * Schema for inviting a member to a workspace.
 * Admin-only action.
 */
export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum([WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * Schema for changing a member's role.
 * Admin-only action.
 */
export const changeMemberRoleSchema = z.object({
  role: z.enum([WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
});

export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
