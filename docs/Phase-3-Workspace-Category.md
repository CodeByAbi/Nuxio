# Phase 3 — Workspace & Category

**Status**: ✅ Backend Complete  
**Implementasi dimulai**: 2026-09-03  
**Implementasi selesai**: 2026-09-04 (Backend)

---

## 📋 Overview

Phase 3 adalah fondasi multi-tenancy untuk seluruh sistem Nuxio. Setiap user mendapatkan Personal workspace secara otomatis saat signup, dan dapat membuat Business workspace untuk kolaborasi tim.

**Tujuan Phase**:
- User dapat Workspace (Personal auto-created, Business bisa dibuat)
- Membership management dengan role admin/member
- Isolasi data workspace-scoped (two-layer model)
- Kategori transaksi siap pakai (seeded dari default)

---

## 🎯 Deliverables

### ✅ Database Migrations (3 files)

#### 1. `0004_workspace.sql`
**Isi**:
- Enum types: `workspace_type` (personal, business), `workspace_role` (admin, member), `plan_tier` (free)
- Tabel `workspaces`:
  - Fields: id, name, type, currency, timezone, plan, created_at, updated_at
  - Constraint: name 3-50 characters
  - Default: IDR currency, Asia/Jakarta timezone, free plan
- Tabel `workspace_members`:
  - Fields: id, workspace_id, user_id, role, invited_at
  - Constraint: UNIQUE(workspace_id, user_id)
  - Index: user_id (critical for RLS performance)
- Function `auth_workspace_ids()`:
  - SECURITY DEFINER + STABLE
  - Returns workspace IDs user is member of
  - Called by RLS policies on all workspace-scoped tables
- RLS Policies:
  - workspaces: SELECT (member), UPDATE (admin-only), no INSERT/DELETE policies
  - workspace_members: SELECT (same workspace), INSERT/UPDATE/DELETE (admin-only)

**Key Design Decisions**:
- `auth_workspace_ids()` marked STABLE ensures single evaluation per statement
- No direct INSERT policy on workspaces — creation via RPC only
- Two-layer isolation: app-level (workspace-guard) + DB-level (RLS)

---

#### 2. `0005_category.sql`
**Isi**:
- Enum type: `category_direction` (income, expense)
- Tabel `categories`:
  - Fields: id, workspace_id, name, direction, is_default, archived, created_at, updated_at
  - Constraint: name max 30 characters
  - Unique index: (workspace_id, name, direction) WHERE NOT archived
- Tabel seed (reference data, NOT workspace-scoped):
  - `default_categories_personal`: 12 categories (4 income, 8 expense)
  - `default_categories_business`: 12 categories (4 income, 8 expense)
- RLS Policies:
  - categories: SELECT/INSERT/UPDATE (workspace member), no DELETE
  - seed tables: SELECT-only (authenticated users)

**Seed Data**:
```
Personal Income: Gaji, Bonus, Investasi, Lain-lain
Personal Expense: Makanan & Minuman, Transportasi, Belanja, Tagihan, Hiburan, 
                 Kesehatan, Pendidikan, Lain-lain

Business Income: Penjualan, Jasa, Investasi, Lain-lain
Business Expense: Gaji Karyawan, Operasional, Marketing, Sewa, Utilitas, 
                  Perlengkapan, Perjalanan Dinas, Lain-lain
```

**Key Design Decisions**:
- Partial unique index allows same name after archiving
- is_default flag prevents archiving of seeded categories
- Seed tables readable for UI but never written by app

---

#### 3. `0006_new_user_trigger.sql`
**Isi**:
- Function `handle_new_user()`:
  - SECURITY DEFINER (bypasses RLS)
  - Trigger: AFTER INSERT ON auth.users
  - Atomic operation:
    1. Insert user_profiles row (Phase 2)
    2. Create Personal workspace ("Keuangan Saya")
    3. Insert workspace_members row (admin role)
    4. Seed categories from default_categories_personal
  - Default display_name: email username (before @)
  
- RPC `create_business_workspace(p_name)`:
  - SECURITY DEFINER
  - Validates name length (3-50 characters)
  - Atomic operation:
    1. Create Business workspace
    2. Make caller admin member
    3. Seed categories from default_categories_business
  - Returns workspace_id

- Function `prevent_last_admin_removal()`:
  - Trigger: BEFORE DELETE ON workspace_members
  - Blocks deletion if it would leave zero admins
  - Raises exception: "LAST_ADMIN: Cannot remove the last admin from workspace"

**Key Design Decisions**:
- All workspace creation atomic (failure rolls back everything)
- SECURITY DEFINER needed because new users don't have membership yet
- Trigger runs with service role internally (Supabase Auth)
- RN-17 enforcement: cannot remove last admin (database-level protection)

---

### ✅ Backend Implementation

#### 1. `lib/server/shared/workspace-guard.ts`
**Layer 1 isolation** — App-level membership verification.

**Functions**:
```typescript
verifyWorkspaceMembership(userId, workspaceId): Promise<void>
  - Queries workspace_members table
  - Throws NotFoundError (404) if not a member
  - RN-02: Never returns 403, prevents IDOR enumeration

verifyWorkspaceAdmin(userId, workspaceId): Promise<void>
  - Verifies user is admin of workspace
  - Throws NotFoundError (404) if not a member
  - Throws AuthorizationError (403) if member but not admin

listUserWorkspaces(userId): Promise<WorkspaceWithRole[]>
  - Lists all workspaces user is member of
  - Returns with role and creation date
  - Used for workspace switcher UI
```

**Design Principles**:
- MUST be called before any workspace-scoped query
- Not optional — required for every route accepting workspace_id
- Works in tandem with RLS (Layer 2) — both layers required

---

#### 2. `lib/server/workspace/workspace.service.ts`
**Business logic for Workspace domain**.

**Functions**:
```typescript
getWorkspace(workspaceId): Promise<Workspace>
  - Fetch workspace by ID
  - Caller must verify membership first

createBusinessWorkspace(userId, input): Promise<Workspace>
  - Calls create_business_workspace RPC
  - Validates input.type === 'business'
  - Returns created workspace

updateWorkspace(workspaceId, input): Promise<Workspace>
  - Updates workspace name (only field mutable in MVP)
  - Caller must verify admin first
  - Schema has no `type` field (defense-in-depth, RN-05)

listMembers(workspaceId): Promise<WorkspaceMember[]>
  - Lists all members with user profile data
  - Ordered by invited_at

inviteMember(workspaceId, input): Promise<WorkspaceMember>
  - Admin-only action
  - Checks for duplicate membership
  - Throws ConflictError if already a member
  - MVP: simplified user lookup (needs admin API in production)

removeMember(workspaceId, memberId): Promise<void>
  - Admin-only action
  - Blocked by prevent_last_admin_removal trigger
  - Throws DomainRuleError if removing last admin

changeMemberRole(workspaceId, memberId, input): Promise<WorkspaceMember>
  - Admin-only action
  - Updates member role
```

**Key Business Rules**:
- RN-17: Cannot remove last admin (enforced by trigger + service layer)
- Personal workspace creation: only via handle_new_user trigger
- Workspace type immutable after creation
- Only admins can modify workspace/members

---

#### 3. `lib/server/category/category.service.ts`
**Business logic for Category domain**.

**Functions**:
```typescript
listCategories(workspaceId, options?): Promise<Category[]>
  - Filter by direction (income/expense)
  - Exclude archived by default (include_archived flag)
  - Ordered by name

getCategory(categoryId): Promise<Category>
  - Fetch single category
  - Used for authorization checks

createCategory(input): Promise<Category>
  - Validates no duplicate (workspace_id, name, direction)
  - Sets is_default = false (custom categories)
  - Throws ConflictError on duplicate

updateCategory(categoryId, input): Promise<Category>
  - Currently only name mutable (direction immutable)
  - Validates no duplicate with new name

archiveCategory(categoryId): Promise<Category>
  - Soft delete (archived = true)
  - Blocks archiving of default categories (is_default = true)
  - Throws DomainRuleError if is_default

unarchiveCategory(categoryId): Promise<Category>
  - Restore archived category
```

**Key Business Rules**:
- Default categories cannot be archived
- Unique constraint: (workspace_id, name, direction) where not archived
- Historical transactions keep category_id even after archiving (ON DELETE RESTRICT)
- No hard delete — soft delete only

---

### ✅ API Routes (6 files)

#### 1. `POST /api/workspace`
**Create Business workspace**.

**Request**:
```json
{
  "name": "My Company",
  "type": "business"
}
```

**Response** (201):
```json
{
  "data": {
    "id": "uuid",
    "name": "My Company",
    "type": "business",
    "currency": "IDR",
    "timezone": "Asia/Jakarta",
    "plan": "free",
    "created_at": "2026-09-04T00:00:00Z",
    "updated_at": "2026-09-04T00:00:00Z"
  },
  "error": null
}
```

**Errors**:
- 400: Validation error (name too short/long)
- 401: Not authenticated
- 422: Domain rule error (type not 'business')

---

#### 2. `GET /api/workspace/:id`
**Fetch workspace by ID**.

**Response** (200):
```json
{
  "data": { /* Workspace object */ },
  "error": null
}
```

**Errors**:
- 401: Not authenticated
- 404: Workspace not found or not a member (RN-02)

---

#### 3. `PATCH /api/workspace/:id`
**Update workspace (admin only)**.

**Request**:
```json
{
  "name": "Updated Name"
}
```

**Response** (200): Updated workspace object

**Errors**:
- 400: Validation error
- 401: Not authenticated
- 403: Not admin (AuthorizationError)
- 404: Workspace not found or not a member

---

#### 4. `GET /api/workspace/:id/members`
**List workspace members**.

**Response** (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "workspace_id": "uuid",
      "user_id": "uuid",
      "role": "admin",
      "invited_at": "2026-09-04T00:00:00Z",
      "display_name": "John Doe"
    }
  ],
  "error": null
}
```

**Errors**:
- 401: Not authenticated
- 404: Workspace not found or not a member

---

#### 5. `POST /api/workspace/:id/members`
**Invite member (admin only)**.

**Request**:
```json
{
  "email": "newmember@example.com",
  "role": "member"
}
```

**Response** (201): Created member object

**Errors**:
- 400: Validation error
- 401: Not authenticated
- 403: Not admin
- 404: User not found
- 409: User already a member

---

#### 6. `DELETE /api/workspace/:id/members/:memberId`
**Remove member (admin only)**.

**Response** (200):
```json
{
  "data": { "success": true },
  "error": null
}
```

**Errors**:
- 401: Not authenticated
- 403: Not admin
- 404: Workspace or member not found
- 422: Cannot remove last admin (LAST_ADMIN error, RN-17)

---

#### 7. `GET /api/category?workspace_id=xxx`
**List categories for workspace**.

**Query params**:
- `workspace_id` (required)
- `direction` (optional): 'income' | 'expense'
- `include_archived` (optional): 'true' to include archived

**Response** (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "workspace_id": "uuid",
      "name": "Gaji",
      "direction": "income",
      "is_default": true,
      "archived": false,
      "created_at": "2026-09-04T00:00:00Z",
      "updated_at": "2026-09-04T00:00:00Z"
    }
  ],
  "error": null
}
```

**Errors**:
- 400: Missing workspace_id
- 401: Not authenticated
- 404: Workspace not found or not a member

---

#### 8. `POST /api/category`
**Create custom category**.

**Request**:
```json
{
  "workspace_id": "uuid",
  "name": "Freelance",
  "direction": "income"
}
```

**Response** (201): Created category object

**Errors**:
- 400: Validation error
- 401: Not authenticated
- 404: Workspace not found or not a member
- 409: Category already exists

---

#### 9. `PATCH /api/category/:id/archive`
**Archive category (soft delete)**.

**Response** (200): Archived category object

**Errors**:
- 401: Not authenticated
- 404: Category not found or not a member
- 422: Cannot archive default category

---

### ✅ Shared Types

#### `types/workspace.ts`
```typescript
// Enums
WorkspaceType: 'personal' | 'business'
WorkspaceRole: 'admin' | 'member'
PlanTier: 'free'

// Interfaces
interface Workspace { id, name, type, currency, timezone, plan, created_at, updated_at }
interface WorkspaceMember { id, workspace_id, user_id, role, invited_at, display_name?, email? }
interface WorkspaceWithRole extends Workspace { role: WorkspaceRole }

// Zod Schemas
createWorkspaceSchema: { name, type }
updateWorkspaceSchema: { name? }  // No `type` field (RN-05)
inviteMemberSchema: { email, role }
changeMemberRoleSchema: { role }
```

#### `types/category.ts`
```typescript
// Enums
CategoryDirection: 'income' | 'expense'

// Interfaces
interface Category { id, workspace_id, name, direction, is_default, archived, created_at, updated_at }
interface DefaultCategory { id, name, direction }

// Zod Schemas
createCategorySchema: { workspace_id, name, direction }
updateCategorySchema: { name? }
```

---

## 🔐 Security Implementation

### Two-Layer Isolation Model

**Layer 1: Application (workspace-guard.ts)**
- Verifies membership BEFORE executing business logic
- Returns 404 for non-members (never 403, prevents IDOR)
- Admin verification for admin-only actions
- Cannot be bypassed — required for every route

**Layer 2: Database (RLS Policies)**
- Enforces isolation even if app layer bypassed
- All workspace-scoped tables filter by `auth_workspace_ids()`
- Service role queries must manually scope workspace_id
- Backstop protection — cannot be forgotten in query

### Key Security Principles (Roadmap RN-02, RN-17)

**RN-02: IDOR Prevention**
- Non-member access returns 404 (not 403)
- Never confirms whether workspace exists
- Attacker cannot enumerate valid workspace IDs

**RN-17: Last Admin Protection**
- Cannot remove last admin from workspace
- Enforced at two levels:
  1. Trigger: `prevent_last_admin_removal()` (database)
  2. Service layer: catches LAST_ADMIN exception
- User must promote another member to admin first

**Defense in Depth**
- Schema has no `type` field in updateWorkspaceSchema
- Double-filtering: workspace_id in both WHERE and guard check
- RLS + app-level checks work together, not one or the other

---

## 📊 Database Schema Diagram

```
auth.users (Supabase managed)
    ↓
user_profiles (Phase 2)
    ↓
workspace_members → workspaces
    ↓                   ↓
    ↓               categories
    ↓
[Future Phase 4+: wallets, transactions, etc.]
```

**Key Relationships**:
- `workspaces.id` ← `workspace_members.workspace_id` (CASCADE)
- `auth.users.id` ← `workspace_members.user_id` (CASCADE)
- `workspaces.id` ← `categories.workspace_id` (RESTRICT)

**RLS Helper Function**:
```sql
auth_workspace_ids() RETURNS SETOF uuid
  -- Used by: ALL workspace-scoped tables
  -- Returns: workspace IDs user is member of
  -- Performance: STABLE (evaluated once per statement)
```

---

## 🧪 Testing Requirements (Belum Implementasi)

### Unit Tests
- [ ] `handle_new_user` trigger: creates exactly 1 Personal workspace + membership + seeded categories
- [ ] Concurrent `create_workspace` calls for same new user: only one succeeds (RN-22)
- [ ] `prevent_last_admin_removal` trigger: blocks deletion, allows if other admin exists

### Integration Tests
- [ ] workspace-guard returns 404 for non-member (RN-02)
- [ ] Admin-only endpoints return 403 for member role
- [ ] Removing last admin returns 422 LAST_ADMIN
- [ ] Cross-workspace query returns 0 rows (RLS backstop)
- [ ] Personal workspace Members page: completely hidden (not just disabled)

### Security Tests
- [ ] Request without workspace_id filter: RLS prevents cross-workspace leakage
- [ ] Service role query without manual workspace_id filter: detected in test
- [ ] Duplicate category (workspace, name, direction): returns 409 not raw DB error

---

## 🚧 Frontend Requirements (Belum Implementasi)

### Task #9: Onboarding Wizard Step 1
- Personal/Business workspace selection
- Business workspace name input
- Calls `POST /api/workspace` or relies on trigger

### Task #10: Workspace Settings & Members Pages
- `app/(app)/workspace/settings/page.tsx`: Edit workspace name
- `app/(app)/workspace/members/page.tsx`: List members, invite, remove
- Members page ONLY rendered for Business workspaces

### Task #11: Workspace Switcher UI
- Dropdown/modal showing all user's workspaces
- Only appears if user has >1 workspace
- Calls `listUserWorkspaces()` from workspace-guard

### Task #12: Sidebar Navigation
- Finalize nav tree: Calendar, Wallet, Transaction, Budget, Goal, AI Copilot, Workspace
- Workspace submenu: Settings, Members (conditional), Switch

### Task #13: Category Management UI
- List categories with filter (income/expense, archived)
- Create custom category form
- Archive action (confirm dialog for non-default)
- Access from Settings page

---

## 📝 Implementation Notes

### Resolved Issues (Roadmap Notes)
- **RN-02**: Status code 403→404 for cross-workspace access
- **RN-17**: Last admin removal blocked (trigger + service layer)
- **RN-04**: snake_case in request/response bodies (matching DB columns)
- **RN-05**: No `type` field in update schema (workspace type immutable)

### Migration Dependencies
- Phase 0: `set_updated_at()` trigger function must exist
- Phase 2: `user_profiles` table must exist (referenced by handle_new_user)
- Phase 3 migrations must run in order: 0004 → 0005 → 0006

### Service Role Usage
- `handle_new_user`: runs with SECURITY DEFINER (service role internally)
- `create_business_workspace`: runs with SECURITY DEFINER
- Background jobs (Phase 7+): must manually scope workspace_id

### Future Extensions
- Email invitation system (replace simplified lookup)
- Workspace deletion flow (requires cascading checks)
- Currency/timezone customization per workspace
- Plan tier enforcement (free/pro/business)

---

## ✅ Acceptance Criteria

- [x] Signup automatically creates Personal workspace + categories
- [x] User can create Business workspace via API
- [x] Workspace-guard verifies membership (404 for non-member)
- [x] Admin-only actions return 403 for non-admin members
- [x] Last admin cannot be removed (422 error)
- [x] Categories seeded correctly (Personal vs Business)
- [x] Custom categories can be created/archived
- [x] Default categories cannot be archived
- [ ] Frontend: Personal workspace hides Members page (not just disabled)
- [ ] Tests: All integration tests pass
- [ ] Tests: Cross-workspace isolation verified

---

## 📦 Files Modified/Created

### Database Migrations
- `supabase/migrations/0004_workspace.sql` (188 lines)
- `supabase/migrations/0005_category.sql` (165 lines)
- `supabase/migrations/0006_new_user_trigger.sql` (187 lines)

### Backend Services
- `lib/server/shared/workspace-guard.ts` (194 lines)
- `lib/server/workspace/workspace.service.ts` (399 lines)
- `lib/server/category/category.service.ts` (319 lines)

### API Routes
- `app/api/workspace/route.ts` (95 lines)
- `app/api/workspace/[id]/route.ts` (190 lines)
- `app/api/workspace/[id]/members/route.ts` (208 lines)
- `app/api/workspace/[id]/members/[memberId]/route.ts` (109 lines)
- `app/api/category/route.ts` (204 lines)
- `app/api/category/[id]/archive/route.ts` (100 lines)

### Shared Types
- `types/workspace.ts` (117 lines)
- `types/category.ts` (72 lines)

**Total**: 14 files, ~2,347 lines of code

---

## 🎯 Next Steps

1. **Frontend Implementation**: Tasks #9-13 (onboarding, settings, switcher, sidebar, category UI)
2. **Testing**: Tasks #15-16 (unit + integration tests)
3. **Validation**: Task #17 (run full checklist)
4. **Documentation**: Task #18 (update if needed)

**Estimated complexity**: High — this phase establishes security-critical multi-tenancy model that all future phases depend on.

---

## 📚 References

- Roadmap.md Phase 3 specification
- RN-02: Cross-workspace access returns 404
- RN-17: Cannot remove last admin
- RN-04: snake_case convention
- RN-05: Immutable fields excluded from update schemas
- ADR §5: Supabase Client + RLS (no ORM)
- doc15 Security: Two-layer isolation model
