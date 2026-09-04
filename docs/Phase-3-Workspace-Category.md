# Phase 3 — Workspace & Category

**Status**: ✅ Backend repaired and verified (build/typecheck/lint green, real-Supabase RLS/concurrency suite passing)
**Implementasi dimulai**: 2026-09-03
**Implementasi selesai**: 2026-09-04 (Backend, initial)
**Repair pass**: 2026-09-04 — see "🔧 Repair Pass" below. The initial "Backend Complete" implementation did not compile
(`next build` failed on import-name mismatches) and had never been run against a real database; this pass fixes that,
closes three RLS/invariant gaps found only once real tests existed, and adds the test suite that was previously
entirely missing.

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
- Cannot remove *or demote* the last admin of a workspace — covers both DELETE and UPDATE on `workspace_members`
- Enforced at two levels:
  1. Triggers: `prevent_last_admin_removal()` (DELETE) and `prevent_last_admin_demotion()` (UPDATE), migrations 0006/0007 —
     the authoritative check, safe under concurrency via a per-workspace advisory lock
  2. Service layer: catches the `LAST_ADMIN` exception and turns it into a friendly `DomainRuleError`
- User must promote another member to admin first

**Defense in Depth — verified against direct PostgREST access, not just assumed**
- Workspace `type` immutability, last-admin protection, and default-category protection are each enforced by a
  database trigger (migration 0007) — not application-layer checks alone. Until the repair pass, this section's
  claim was aspirational: the schema omitting a field from a Zod update schema does nothing against a raw
  authenticated PostgREST call using the public anon key, which is a real, always-available access path independent
  of this Next.js app. `__tests__/db/` proves each invariant holds against exactly that access path.
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

**RLS Helper Functions**:
```sql
auth_workspace_ids() RETURNS SETOF uuid
  -- Used by: SELECT policies on all workspace-scoped tables
  -- Returns: workspace IDs user is member of (any role)
  -- Performance: STABLE (evaluated once per statement)

auth_admin_workspace_ids() RETURNS SETOF uuid
  -- Added in migration 0007. Used by: admin-gated INSERT/UPDATE/DELETE
  -- policies on workspaces/workspace_members.
  -- Returns: workspace IDs user is an ADMIN of.
  -- Without this SECURITY DEFINER indirection, three of the four
  -- admin-check policies on workspace_members embedded a raw subquery on
  -- workspace_members itself, which is the textbook cause of Postgres's
  -- "infinite recursion detected in policy" error — every admin-gated
  -- mutation (invite, role change, remove) was broken until this was added.
```

---

## 🧪 Testing Requirements

Implemented as of the repair pass. Real-Supabase tests (`__tests__/db/`) run against an actual local Postgres +
GoTrue instance via `npm run test:db` — see "🔧 Repair Pass" for how CI wires this up. They are **not mocks**: every
security assertion queries through an authenticated test user's own client (anon key + real session), exactly like a
direct PostgREST call would, so they prove the RLS/trigger backstop holds independent of any app code.

### Unit/mock tests (`npm test`, `__tests__/**/*.test.ts` excluding `__tests__/db/`)
- [x] Pre-existing Phase 0-2 suite (auth, profile, avatar, health, money, errors, design tokens) — unaffected by this phase

### Real-Supabase tests (`npm run test:db`, `__tests__/db/`)
- [x] `handle_new_user` trigger: creates exactly 1 profile + 1 Personal workspace + 1 admin membership + 12 seeded categories (`signup-and-invite.test.ts`)
- [x] Signup atomicity: a forced mid-provisioning failure leaves no `auth.users` row and no partial state (`signup-and-invite.test.ts`)
- [x] RN-22: two concurrent signups for the same email never produce two Personal workspaces (`signup-and-invite.test.ts`)
- [x] `invite_workspace_member` RPC: valid invite, `USER_NOT_FOUND`, `ALREADY_MEMBER`, `FORBIDDEN` for non-admin/non-member callers (`signup-and-invite.test.ts`)
- [x] workspace-guard/RLS: non-member cannot read/update/delete another workspace's rows, even with no app-level filter (`workspace-security.test.ts`)
- [x] RN-17: last-admin protection on both DELETE and UPDATE (role demotion), including two concurrent-race scenarios that must never leave zero admins (`workspace-security.test.ts`)
- [x] RN-05: workspace `type` is immutable at the database layer, not just omitted from the update schema (`workspace-security.test.ts`)
- [x] Category isolation: non-member cannot read/update/insert into another workspace's categories (`category-security.test.ts`)
- [x] Default-category protection: archiving a default category, or flipping `is_default`/`workspace_id` to bypass it, are both rejected at the database layer (`category-security.test.ts`)

### Still manual / not automated
- [ ] Personal workspace Members page: completely hidden (not just disabled) — the sidebar nav item is not yet wired to workspace context at all; see "Known Gaps" below
- [ ] Duplicate category (workspace, name, direction) returns 409 not a raw DB error — covered by `category.service.ts`'s pre-check + `23505` handling, but not yet by a `__tests__/db` case

---

## 🚧 Frontend: Built, With Known Gaps

Pages exist and compile/lint clean (fixed in the repair pass — see below), and work correctly when reached with a
`?workspace_id=` query param. What's still missing is wiring a *default* workspace id into the app at all.

### Task #9: Onboarding Wizard Step 1 — done
- Personal/Business workspace selection, Business name input, calls `POST /api/workspace`

### Task #10: Workspace Settings & Members Pages — done, reachable only via direct URL today
- `app/(app)/workspace/settings/page.tsx`, `app/(app)/workspace/members/page.tsx`
- Members page redirects away client-side if the workspace turns out to be Personal — see "Known Gaps"

### Task #11: Workspace Switcher UI — stub only
- `components/workspace/WorkspaceSwitcher.tsx` exists but its data-fetching is an intentional no-op (see "Known Gaps")

### Task #12: Sidebar Navigation — done, but not workspace-context-aware
- Nav tree exists in `app/(app)/layout.tsx`; Settings/Members/Categories links exist but don't carry a real workspace id

### Task #13: Category Management UI — done
- `app/(app)/category/page.tsx`: filter, create, archive (uses a controlled `ConfirmDialog`, fixed in the repair pass)

### Known Gaps (not in scope for the backend/DB repair pass)
- **No `GET /api/workspace` list endpoint.** `listUserWorkspaces()` exists in `workspace-guard.ts` but nothing calls it.
- **No current-workspace resolution anywhere in the app.** `app/(app)/layout.tsx` hardcodes "Workspace: Personal" as
  static text; the Settings/Members/Categories sidebar links carry a literal empty `?workspace_id=`. Reaching any of
  these pages today requires typing the query param manually.
- **`WorkspaceSwitcher` is a non-functional stub** as a direct consequence of the above — it always renders nothing
  (`workspaces.length <= 1` guard) since there's no endpoint to populate it from.
- **Sidebar "Members" link is not conditionally hidden per workspace type** — the page itself redirects away when
  loaded against a Personal workspace, but the nav entry is unconditional static markup, not omitted.
- Fixing these requires adding the list endpoint and a workspace-context mechanism (cookie, URL segment, or a
  provider set at login/switch) — real frontend feature work, tracked separately from this repair.

---

## 📝 Implementation Notes

### Resolved Issues (Roadmap Notes)
- **RN-02**: Status code 403→404 for cross-workspace access
- **RN-17**: Last admin removal blocked at the database layer for both DELETE and UPDATE (role demotion), with a
  per-workspace advisory lock so concurrent attempts can't both succeed — see "🔧 Repair Pass"
- **RN-04**: snake_case in request/response bodies (matching DB columns)
- **RN-05**: workspace `type` is immutable enforced by a database trigger (`trg_prevent_workspace_type_change`,
  migration 0007), not just omitted from the update schema — the original "defense in depth" claim was
  app-layer-only until the repair pass

### Migration Dependencies
- Phase 0: `set_updated_at()` trigger function must exist
- Phase 2: `user_profiles` table must exist (referenced by handle_new_user)
- Phase 3 migrations must run in order: 0004 → 0005 → 0006 → 0007

### Service Role Usage
- `handle_new_user`, `create_business_workspace`, `invite_workspace_member`: SECURITY DEFINER, each self-checks
  caller authorization internally since SECURITY DEFINER bypasses RLS entirely
- `service_role` needed explicit `GRANT`s on every Phase 3 table (migration 0007) — this Supabase CLI version does
  not auto-expose new tables to any Data API role, including `service_role`, without one (see
  `supabase/config.toml` `[api].auto_expose_new_tables`); `service_role` has `BYPASSRLS` but that alone doesn't grant
  ordinary table privileges
- Background jobs (Phase 7+): must manually scope workspace_id

### Future Extensions
- Workspace deletion flow (requires cascading checks — and note the last-admin trigger currently also fires on a
  *user* deletion cascade, since a solo test/real user is always the sole admin of their own Personal workspace; an
  account-deletion feature will need to intentionally bypass or redesign this, see `__tests__/db/helpers.ts`'s
  `deleteTestUser` for how the test suite works around it)
- Currency/timezone customization per workspace
- Plan tier enforcement (free/pro/business)
- A `GET /api/workspace` list endpoint + real workspace-context resolution in the frontend (see "Known Gaps" above)

---

## ✅ Acceptance Criteria

- [x] Signup automatically creates Personal workspace + categories
- [x] User can create Business workspace via API
- [x] Workspace-guard verifies membership (404 for non-member)
- [x] Admin-only actions return 403 for non-admin members
- [x] Last admin cannot be removed (422 error) — DELETE and UPDATE paths, both DB-enforced
- [x] Categories seeded correctly (Personal vs Business)
- [x] Custom categories can be created/archived
- [x] Default categories cannot be archived — DB-enforced, not just app-layer
- [x] Workspace type is immutable — DB-enforced, not just app-layer
- [x] Tests: real-Supabase integration tests pass (`npm run test:db`, 30/30 — see "🔧 Repair Pass")
- [x] Tests: cross-workspace isolation verified against real RLS, not mocks
- [ ] Frontend: Personal workspace hides Members page (not just disabled) — see "Known Gaps"

---

## 🔧 Repair Pass (2026-09-04)

The initial implementation above was never actually run: `next build` failed outright (every Phase 3 service file
imported a function name — `createServerClient` — that doesn't exist in `supabase-server-client.ts`; the real export
is `createSupabaseServerClient`), and `types/database.ts` was still Phase 2's hand-maintained stub, missing every
Phase 3 table. Fixing that surfaced a second, more serious class of problem: RLS enforced tenant isolation correctly,
but none of the three stated business invariants (workspace type immutability, last-admin protection, default-category
protection) actually held against a direct authenticated PostgREST call — only against calls that went through the
(non-compiling) app code. This section documents what changed to close that gap.

### Build/compile fixes
- `lib/server/shared/workspace-guard.ts`, `lib/server/workspace/workspace.service.ts`,
  `lib/server/category/category.service.ts`: fixed the `createServerClient` → `createSupabaseServerClient` import;
  switched from `logger.error('msg', {...})` to the project's actual `childLogger('module').error({...}, 'msg')`
  convention (pino, object-first).
- Added `DomainRuleError` (422, `ErrorCode.DOMAIN_RULE_ERROR`) to `lib/server/shared/errors.ts` — used but never
  defined. Added `ErrorCode.LAST_ADMIN` for the one route (member removal) whose contract specifically calls for
  that wire code rather than the generic domain-rule one.
- Regenerated `types/database.ts` via `supabase gen types typescript --local` — the file's own header comment always
  said to do this after migrations changed; it hadn't been done since Phase 2.
- Rewrote all 6 Phase 3 API routes onto the `requireAuth`/`withErrorHandling`/`ApiResponse<T>` pattern from
  `lib/server/shared/api-helpers.ts` (Phase 2's actual established convention — `app/api/profile/route.ts`), replacing
  the original ad-hoc per-route `error.constructor.name === 'X'` chains.
- Fixed `ConfirmDialog` usage in `workspace/members/page.tsx` and `category/page.tsx`: both used a `trigger` prop the
  component doesn't have (it's a controlled `open`/`onOpenChange` dialog) — another compile error, unrelated to the
  backend one. Category archiving now uses `variant="default"` (reversible); member removal uses `variant="destructive"`.
- Fixed a handful of new-in-Next-16 lint rules (`react-hooks/set-state-in-effect`, a `WorkspaceSwitcher` TDZ bug,
  `consistent-type-imports`, `no-explicit-any`) across the frontend pages.

### Database-layer invariant fixes (migration `0007_phase3_security_hardening.sql`)
RLS = tenant isolation. Triggers/constraints = invariant backstop. Application layer = validation + friendly errors.
The three invariants below previously lived in application-layer checks only, meaning a direct authenticated
PostgREST call (public anon key + a real session — no different from what this app's own client-side code has) could
bypass every one of them:
1. **Workspace type immutability (RN-05)** — `trg_prevent_workspace_type_change` (BEFORE UPDATE on `workspaces`)
   rejects any change to `type`, regardless of caller.
2. **Last-admin protection (RN-17), UPDATE path** — `prevent_last_admin_removal` (migration 0006) only covered
   DELETE; nothing stopped `UPDATE workspace_members SET role = 'member'` on the last admin. Added
   `trg_prevent_last_admin_demotion`. Both trigger functions take a `pg_advisory_xact_lock` keyed on `workspace_id`
   before counting remaining admins, so two concurrent removals/demotions of a workspace's last two admins can't
   both observe "≥1 admin remaining" and both succeed — see `__tests__/db/workspace-security.test.ts`'s two
   concurrency tests for the exact race this closes, and their comments for the two different (both safe) outcomes
   depending on interleaving.
3. **Default-category protection** — `trg_protect_category_invariants` (BEFORE UPDATE on `categories`) makes both
   `workspace_id` and `is_default` immutable after insert (closing the "flip `is_default` to `false`, then archive"
   bypass and the "move a category to a workspace I also belong to" bypass), and independently rejects archiving a
   row while `is_default` is still true.

### A real bug the new tests found, not code review
`workspaces_update_admin`, `workspace_members_insert_admin`, `workspace_members_update_admin`, and
`workspace_members_delete_admin` (migration 0004) each embedded a raw subquery — `SELECT workspace_id FROM
workspace_members WHERE user_id = auth.uid() AND role = 'admin'` — directly in their `USING`/`WITH CHECK` clause.
Three of those four are policies *on* `workspace_members` querying `workspace_members` again from within its own
policy, which is the textbook cause of Postgres's "infinite recursion detected in policy for relation" error. In
practice: **every admin-gated mutation on `workspace_members` — inviting, changing a role, removing a member — was
completely broken** in the original migration, for the entire lifetime of this branch. `auth_workspace_ids()` exists
specifically to avoid this (a `SECURITY DEFINER` function bypasses RLS for its own internal query), but was only ever
used for the *membership* check, never the *admin* check. Migration 0007 adds `auth_admin_workspace_ids()` (the same
pattern, filtered to `role = 'admin'`) and redefines all four policies to use it. This was found by writing the RLS
test suite, not by inspection — no amount of code review would have caught it without actually running a mutation
against a real database.

### A second real bug, found by a manual end-to-end HTTP smoke test (not the automated suite either)
`GET /api/workspace/:id/members` returned 500 for every workspace, always. `workspace.service.ts`'s `listMembers()`
joins `user_profiles` via PostgREST's embed syntax (`user_profiles:user_id (display_name)`), which requires a real
foreign key PostgREST can discover in the schema — `workspace_members.user_id` only ever had an FK to `auth.users`,
never to `user_profiles`, so PostgREST rejected the query with "Could not find a relationship between
'workspace_members' and 'user_id' in the schema cache." Neither the type system nor the RLS test suite caught this —
`__tests__/db` deliberately queries tables directly to test RLS in isolation from the service layer, so it never
exercised this specific embedded-join query shape. Fixed in migration 0007 by adding
`workspace_members_user_id_profiles_fkey` (safe: every `workspace_members.user_id` already has a `user_profiles` row
by construction, per `handle_new_user()`'s ordering). This is the reason the "Verified, not just claimed" section
below includes a manual full HTTP round-trip through every route, not just `tsc`/`build`/the test suites — a route
that type-checks, builds, and has no RLS violation can still 500 on a schema-relationship gap only PostgREST itself
knows about at request time.

### `inviteMember` fix
The original implementation queried `user_profiles.id = input.email` — comparing a UUID column to an email string,
so it could never match and the invite feature was entirely inert. Replaced with an `invite_workspace_member(p_workspace_id,
p_email, p_role)` `SECURITY DEFINER` RPC (migration 0007) that resolves the email against `auth.users` server-side
(not exposed over PostgREST — see `supabase/config.toml` `[api].schemas`) and self-checks the caller is an admin of
the target workspace before inserting, so it stays safe even called directly via PostgREST. `workspace.service.ts`'s
`inviteMember()` now just calls this RPC and maps its `USER_NOT_FOUND`/`ALREADY_MEMBER`/`FORBIDDEN` exceptions to
404/409/403.

### `service_role` table grants
This Supabase CLI version does not auto-expose new tables to `service_role` (or `anon`/`authenticated`) without an
explicit `GRANT` (`supabase/config.toml` `[api].auto_expose_new_tables`, unset = new default). Migration 0004/0005
never granted `service_role` anything, so the service-role client — the only client any test fixture, and eventually
any background job, is allowed to use — could not read or write these tables at all. Migration 0007 adds the missing
grants for `workspaces`, `workspace_members`, `categories`, both `default_categories_*` tables, and (since it has the
identical gap) Phase 2's `user_profiles`.

### Testing
`__tests__/db/` (real Supabase, `npm run test:db`) — 30 tests across 3 files, all passing against a fresh
`supabase db reset`: `workspace-security.test.ts`, `category-security.test.ts`, `signup-and-invite.test.ts`. See
`.github/workflows/ci.yml` for how CI spins up a fresh local Supabase stack per run (not the `SUPABASE_URL_TEST`
secret — a shared external "test project" isn't safe for isolation tests that assume a known, exclusive database
state, and its migration status can't be guaranteed from this repo alone).

### Verified, not just claimed
`npx tsc --noEmit`, `npm run lint`, `npm test` (86/86, pre-existing Phase 0-2 suite, unaffected), `npm run build`,
and `npm run test:db` (30/30) all pass as of this commit. Every Phase 3 route was also manually exercised end-to-end
over real HTTP against `next dev` + local Supabase, using a real signed-up user's real session cookie (not a mock):
`GET`/`PATCH /api/workspace/:id`, `POST /api/workspace` (Business creation), `GET`/`POST /api/workspace/:id/members`
(the real `invite_workspace_member` RPC through the API), `DELETE /api/workspace/:id/members/:memberId`, and
`GET`/`POST /api/category`. This is what caught the `listMembers()` PostgREST-relationship bug above — it type-checks
and builds cleanly, and touches no RLS policy the automated suite doesn't already cover, so nothing short of an
actual request would have surfaced it.

---

## 📦 Files Modified/Created

### Database Migrations
- `supabase/migrations/0004_workspace.sql` (188 lines)
- `supabase/migrations/0005_category.sql` (165 lines)
- `supabase/migrations/0006_new_user_trigger.sql` (187 lines)
- `supabase/migrations/0007_phase3_security_hardening.sql` (repair pass — invariant triggers, `auth_admin_workspace_ids()`
  RLS-recursion fix, `invite_workspace_member()` RPC, `service_role` grants, `workspace_members_user_id_profiles_fkey`)

### Backend Services
- `lib/server/shared/workspace-guard.ts` (repair pass: import fix, logger convention, typed `listUserWorkspaces`)
- `lib/server/workspace/workspace.service.ts` (repair pass: import fix, `inviteMember` rewritten onto the new RPC)
- `lib/server/category/category.service.ts` (repair pass: import fix, logger convention)

### API Routes
- `app/api/workspace/route.ts`, `app/api/workspace/[id]/route.ts`, `app/api/workspace/[id]/members/route.ts`,
  `app/api/workspace/[id]/members/[memberId]/route.ts`, `app/api/category/route.ts`,
  `app/api/category/[id]/archive/route.ts` — all rewritten in the repair pass onto `api-helpers.ts`'s
  `requireAuth`/`withErrorHandling` pattern

### Shared Types
- `types/workspace.ts` (117 lines)
- `types/category.ts` (72 lines)
- `types/database.ts` — regenerated from the real schema (repair pass); was Phase 2's stub for all of Phase 3's life
- `types/errors.ts`, `lib/server/shared/errors.ts` — added `DomainRuleError`/`ErrorCode.DOMAIN_RULE_ERROR`/`ErrorCode.LAST_ADMIN`

### Tests (repair pass — none of this existed before)
- `__tests__/db/helpers.ts`, `__tests__/db/pg.ts`, `__tests__/db/env-setup.cjs`
- `__tests__/db/workspace-security.test.ts`, `__tests__/db/category-security.test.ts`, `__tests__/db/signup-and-invite.test.ts`
- `jest.db.config.mjs`, `package.json` (`test:db` script), `.github/workflows/ci.yml` (real-Supabase CI job)

---

## 🎯 Next Steps

Backend/DB is repaired and tested (this pass). What's left before Phase 4:

1. **Frontend**: add the `GET /api/workspace` list endpoint and a real current-workspace resolution mechanism (see
   "Known Gaps" above) — without it, Settings/Members/Categories are only reachable by hand-typing the query param.
2. **Frontend**: make the sidebar's "Members" entry actually conditional on workspace type, not just rely on the
   page's own client-side redirect.
3. Consider whether `email` rate limiting should apply to `invite_workspace_member` the way `auth.service.ts`
   already rate-limits register/login (RN-14 predates Phase 3 and doesn't cover this new RPC).

**Estimated complexity**: High — this phase establishes the security-critical multi-tenancy model that all future
phases depend on. The repair pass found and closed three database-layer invariant gaps and one full RLS-recursion
outage that made every admin-gated `workspace_members` mutation fail — none of which were visible without a real
test suite exercising a real database, which is why that suite is now a mandatory, non-skippable CI step.

---

## 📚 References

- Roadmap.md Phase 3 specification
- RN-02: Cross-workspace access returns 404
- RN-17: Cannot remove last admin
- RN-04: snake_case convention
- RN-05: Immutable fields excluded from update schemas
- ADR §5: Supabase Client + RLS (no ORM)
- doc15 Security: Two-layer isolation model
