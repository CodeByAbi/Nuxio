# Phase 4 — Wallet

**Status**: ✅ Complete (backend, frontend, tests)
**Branch**: `feature/phase-4-Wallet`
**Implementasi selesai**: 2026-09-05

---

## 📋 Overview

Phase 4 membangun domain **Wallet** — sumber dana (Cash / Bank / E-Wallet) milik sebuah workspace. Lapisan ini menjadi fondasi untuk modul transaksi (Phase 5/6), sehingga desainnya sudah menyiapkan *ledger movement* meskipun belum ada transaksi pada phase ini.

**Tujuan Phase**:
- Membuat wallet dengan saldo awal
- Menampilkan (list) wallet milik workspace
- Mengarsipkan wallet (soft delete, FR-023)
- Menyiapkan infrastruktur ledger (`apply_ledger_movement` stub) untuk Phase 5/6
- Isolasi data tetap workspace-scoped (RLS + workspace-guard)

---

## 🎯 Deliverables

### ✅ Database Migration — `supabase/migrations/0007_wallet.sql` (156 lines)

#### 1. Enum
- `wallet_type` ENUM: `'personal'`, `'business'` — label opsional, tidak mempengaruhi perhitungan saldo (FR-029).

#### 2. Tabel `wallets`
| Field | Type | Keterangan |
|-------|------|-----------|
| `id` | uuid PK | default `gen_random_uuid()` |
| `workspace_id` | uuid FK | referensi `workspaces(id)` `ON DELETE RESTRICT` |
| `name` | varchar(50) | CHECK `char_length` 1–50 |
| `wallet_type` | wallet_type NULL | label opsional |
| `initial_balance` | bigint | default 0, CHECK `>= 0` |
| `cached_balance` | bigint | default 0 — data turunan (ledger) |
| `currency` | char(3) | default `'IDR'` |
| `archived` | boolean | default false — soft delete |
| `created_at` / `updated_at` | timestamptz | `updated_at` di-refresh trigger `set_updated_at()` |

**Index & constraint**:
- `idx_wallets_unique_id_workspace` — unique `(id, workspace_id)` **diperlukan** untuk *composite FK* Transfer di Phase 6
- `idx_wallets_workspace_id` — index akses workspace (pola paling umum)
- `idx_wallets_workspace_archived` — index filter arsip (list default mengecualikan arsip)

#### 3. Row-Level Security (RLS)
- **SELECT** — member yang termasuk workspace (`auth_workspace_ids()`)
- **INSERT** — member workspace (WITH CHECK)
- **UPDATE** — member workspace (USING + WITH CHECK)
- **DELETE** — **tidak ada policy** → hard delete ditolak secara struktural oleh RLS
- Grant `SELECT, INSERT, UPDATE` ke `authenticated`

#### 4. `apply_ledger_movement(uuid, bigint)` — stub Phase 5/6
- `SECURITY DEFINER` — siap dipanggil dari konteks service role (background jobs)
- Phase 4: **no-op** (saldo hanya berubah saat pembuatan lewat `initial_balance`)
- Phase 5/6: akan secara atomik menambah/mengurangi `cached_balance`
- Grant `EXECUTE` ke `authenticated`

**Key Design Decisions**:
- `initial_balance` **immutable** setelah pembuatan; `cached_balance` adalah data turunan yang di-set = `initial_balance` saat create
- Tidak ada DELETE policy → arsip (soft delete) adalah satu-satunya cara nonaktif
- Saldo disimpan sebagai `bigint` integer minor unit (ADR §5 — konsisten dengan `lib/server/shared/money.ts`)

---

### ✅ Backend Service — `lib/server/wallet/wallet.service.ts` (250 lines)

**Fungsi**:
```typescript
listWallets(query): Promise<Wallet[]>
  - Query by workspace_id
  - Default: exclude archived (include_archived flag untuk override)
  - Order by created_at ascending
  - Konversi initial_balance/cached_balance ke Money

createWallet(input): Promise<Wallet>
  - Validasi & konversi saldo via toMoney
  - cached_balance = initial_balance (Phase 4)
  - Trim name, default currency IDR
  - Mengembalikan data ter-persist dari DB (.select().single())

archiveWallet(walletId, workspaceId): Promise<{id, archived}>
  - Update archived = true (scoped workspace_id)
  - Idempotent: mengarsip wallet yang sudah diarsip berhasil
  - PGRST116 → NotFoundError (404)

getWallet(walletId, workspaceId): Promise<Wallet>
  - Ambil satu wallet, scoped by workspace_id
  - Tidak ditemukan → NotFoundError
```

**Phase 4 rules yang ditegakkan**:
- `initial_balance = cached_balance` saat pembuatan
- Tidak ada penulisan ledger transaksi
- Tidak ada rekalkulasi saldo dari agregat
- Soft delete hanya (tanpa hard delete)

---

### ✅ API Routes (2 files)

#### 1. `GET /api/wallet`
List wallet milik workspace.

**Query params**:
- `workspace_id` (required, UUID)
- `include_archived` (optional, default `false`)

**Response** (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "workspace_id": "uuid",
      "name": "BCA",
      "wallet_type": null,
      "initial_balance": 5000000,
      "cached_balance": 5000000,
      "currency": "IDR",
      "archived": false,
      "created_at": "2026-09-05T00:00:00Z",
      "updated_at": "2026-09-05T00:00:00Z"
    }
  ],
  "error": null
}
```

**Errors**:
- 401: Not authenticated
- 422: Query param tidak valid (`workspace_id` hilang / bukan UUID)
- 404: Workspace tidak ditemukan / bukan member

---

#### 2. `POST /api/wallet`
Buat wallet baru.

**Request body**:
```json
{
  "workspace_id": "uuid",
  "name": "BCA",
  "initial_balance": 5000000,
  "wallet_type": "personal",
  "currency": "IDR"
}
```

**Response** (201): Objek `Wallet` ter-persist

**Errors**:
- 401: Not authenticated
- 422: Validasi gagal (name kosong/>50, saldo negatif/float, UUID invalid, JSON invalid)
- 404: Workspace tidak ditemukan / bukan member

---

#### 3. `PATCH /api/wallet/[id]/archive`
Arsipkan wallet (soft delete).

**Path params**: `id` (wallet UUID)
**Request body**: `{ "workspace_id": "uuid" }` (untuk workspace-guard)

**Response** (200):
```json
{
  "data": { "id": "uuid", "archived": true },
  "error": null
}
```

**Business rules**:
- Idempotent — mengarsip wallet yang sudah diarsip berhasil
- Tidak ada hard delete (database tanpa DELETE policy)
- Wallet terarsip akan menolak transaksi baru (ditegakkan di RPC Phase 5/6)

**Errors**:
- 401: Not authenticated
- 422: `id`/`workspace_id` invalid, JSON invalid
- 404: Wallet tidak ditemukan / bukan member

> Catatan: route memakai pola `requireAuth`/`withErrorHandling`/`ApiResponse<T>` dari `api-helpers.ts`, konsisten dengan Phase 2/3. Params dibaca sebagai Promise (konvensi Next.js 16).

---

### ✅ Shared Types — `types/wallet.ts` (83 lines)

```typescript
WalletType: 'personal' | 'business'

interface Wallet {
  id; workspace_id; name; wallet_type: WalletType|null;
  initial_balance: Money; cached_balance: Money;
  currency; archived; created_at; updated_at;
}

CreateWalletInput { workspace_id; name; wallet_type?; initial_balance; currency? }
ArchiveWalletInput { id; workspace_id }
ListWalletsQuery { workspace_id; include_archived? }
ListWalletsResult / CreateWalletResult / ArchiveWalletResult
```

> `initial_balance` & `cached_balance` memakai **branded `Money`** (bukan `number` polos) — memastikan hanya integer minor unit yang lolos (ADR §5).

---

### ✅ Validation Schemas — `lib/shared/schemas/wallet.ts` (83 lines)

Zod schema untuk tiga operasi:

- `createWalletSchema`:
  - `name`: 1–50 karakter, di-trim
  - `initial_balance`: integer `>= 0`, dalam safe-integer range (menolak float & negatif)
  - `wallet_type`: optional, hanya `'personal'`/`'business'`/`null`
  - `currency`: wajib 3 karakter, di-uppercase, default `'IDR'`
  - `workspace_id`: UUID valid
- `listWalletsQuerySchema`: `workspace_id` UUID; `include_archived` string `'true'/'false'` ditransformasi ke boolean, default `false`
- `archiveWalletSchema`: `id` + `workspace_id` UUID

---

### ✅ Frontend (page + 3 komponen)

#### Halaman — `app/(app)/wallet/page.tsx`
- **List** semua wallet aktif (default exclude archived) via `GET /api/wallet`
- **Create** wallet via dialog `WalletForm` → `POST /api/wallet`
- **Archive** wallet via dialog konfirmasi → `PATCH /api/wallet/:id/archive`
- Sync real-time via **TanStack Query** (invalidate → refetch → render state DB terbaru)
- State lengkap: loading skeleton, error (dengan "Coba lagi"), empty state, dan sukses (grid card)

#### `components/wallet/WalletCard.tsx`
- Menampilkan nama, badge tipe (Personal/Bisnis jika ada), saldo saat ini (format IDR), dan saldo awal bila berbeda
- Tombol arsip opsional; indikator bila wallet sudah diarsipkan

#### `components/wallet/WalletForm.tsx`
- Dialog form: nama (1–50), saldo awal (input numerik + format otomatis via `parseMoney`/`formatMoney`), tipe opsional
- Validasi client-side (nama wajib & ≤50, saldo angka valid & ≥0 & integer)
- State loading saat submit, kirim ke `POST /api/wallet`, reset saat tutup

#### `components/wallet/ConfirmArchiveDialog.tsx`
- Wrapper `ConfirmDialog` (variant destructive) sebelum arsip — mencegah aksi tidak sengaja

---

### ✅ Client Utilities — `lib/client/money.ts` (52 lines)

Format & parse uang di sisi klien (display-only; operasi `Money` tetap server-side):
- `formatMoney(amount, currency)` → `"Rp 10.000"` (grouping + symbol, pakai locale `id-ID`)
- `parseMoney(input)` → integer, menangani `"10000"`, `"10.000"`, `"Rp 10.000"`, kembalikan `null` jika invalid

---

### ✅ Global

- `lib/client/providers.tsx` — `QueryProvider` membungkus app dengan TanStack Query:
  - `staleTime` 30s, `gcTime` 5 menit, `retry` 1 untuk query
  - **No auto-retry untuk mutation** (keputusan penting untuk data finansial — user harus retry eksplisit)
  - Nonaktif `refetchOnWindowFocus` (mengurangi kebisingan untuk data finansial)
- `app/layout.tsx` — menyisipkan `QueryProvider` di sekitar `ThemeProvider`
- `lib/server/shared/supabase-server-client.ts` — ekspor alias `createServerClient` untuk backward compatibility

---

## 🧪 Testing (3 files)

**Script**: `npm test`

### Unit — `__tests__/unit/wallet-schemas.test.ts` (~333 lines)
Uji Zod schema secara menyeluruh:
- `createWalletSchema`: nama (valid/empty/>50/trim), saldo (0/positif/negatif/float/non-numeric/wajib), `wallet_type` (personal/business/null/undefined/invalid), `currency` (default IDR/USD/uppercase/wrong-length), `workspace_id` (wajib/UUID valid)
- `listWalletsQuerySchema`: default `include_archived=false`, transform string→boolean, kewajiban & validitas `workspace_id`
- `archiveWalletSchema`: `id` & `workspace_id` wajib + valid

### Integration API — `__tests__/integration/wallet-api.test.ts` (~402 lines)
Uji kontrak HTTP (mock Supabase) untuk 3 endpoint:
- `GET /api/wallet`: 200 sukses, 401 unauthenticated, 422 workspace_id hilang/UUID invalid, 404 non-member, pass `include_archived`
- `POST /api/wallet`: 201 sukses, 401, 422 (name hilang, saldo negatif, saldo float, JSON invalid)
- `PATCH /api/wallet/[id]/archive`: 200 sukses, 401, 422 (id invalid, workspace_id hilang), **idempotent** (arsip dua kali)

### Integration Service — `__tests__/integration/wallet-service.test.ts` (~429 lines)
Uji unit service dengan mock database (`createWallet`, `archiveWallet`, `listWallets`, `getWallet`), termasuk:
- `initial_balance = cached_balance` saat create
- Idempotensi archive
- `NotFoundError` saat wallet tak ditemukan
- Filter archive default vs include
- Error handling saat query/insert gagal

---

## 🔐 Security

- **Workspace isolation**: RLS (DB) + `verifyWorkspaceMembership` (app/workspace-guard) double-layer, konsisten Phase 3
- **IDOR prevention (RN-02)**: non-member mendapat 404, bukan 403
- **No hard delete**: kosongnya DELETE policy di DB membuat hard delete ditolak oleh RLS itu sendiri
- **Saldo integer**: `toMoney` mencegah float masuk ke sistem (ADR §5)
- **Validation**: Zod di request layer + constraint CHECK di DB (`initial_balance >= 0`, `name` 1–50)
- **Mutation no-retry**: TanStack Query dikonfigurasi tanpa auto-retry untuk mutation finansial

---

## 📦 Files Created/Modified (17 files, +2693/–9)

| File | Baris |
|------|-------|
| `supabase/migrations/0007_wallet.sql` | 156 |
| `lib/server/wallet/wallet.service.ts` | 250 |
| `app/api/wallet/route.ts` | 142 |
| `app/api/wallet/[id]/archive/route.ts` | 106 |
| `lib/shared/schemas/wallet.ts` | 83 |
| `types/wallet.ts` | 83 |
| `lib/client/money.ts` | 52 |
| `lib/client/providers.tsx` | 33 |
| `app/(app)/wallet/page.tsx` | 280 |
| `components/wallet/WalletCard.tsx` | 85 |
| `components/wallet/WalletForm.tsx` | 204 |
| `components/wallet/ConfirmArchiveDialog.tsx` | 40 |
| `__tests__/unit/wallet-schemas.test.ts` | 333 |
| `__tests__/integration/wallet-api.test.ts` | 402 |
| `__tests__/integration/wallet-service.test.ts` | 429 |
| `app/layout.tsx` | diubah (tambah `QueryProvider`) |
| `lib/server/shared/supabase-server-client.ts` | diubah (alias `createServerClient`) |

---

## ✅ Acceptance Criteria

- [x] Database migration wallet dengan enum, indeks, RLS, dan `set_updated_at` trigger
- [x] Wallet dapat dibuat dengan saldo awal (`initial_balance`)
- [x] `cached_balance` di-set = `initial_balance` saat pembuatan
- [x] Wallet dapat di-list per workspace (default exclude archived)
- [x] Wallet dapat diarsipkan (soft delete), idempotent
- [x] Hard delete tidak mungkin (tidak ada DELETE policy)
- [x] Isolasi workspace: non-member 404 (RLS + workspace guard)
- [x] Validasi input menyeluruh (Zod + constraint DB + `toMoney`)
- [x] Stub `apply_ledger_movement` siap untuk Phase 5/6
- [x] UI Wallet: list, create, archive dengan TanStack Query sync
- [x] Test: schema, API route, dan service — unit + integration

---

## 🎯 Next Steps

1. **Frontend**: mengganti `workspace_id` placeholder (saat ini diambil dari `localStorage`) dengan resolusi workspace context yang nyata (mengikuti gap Phase 3 — belum ada `GET /api/workspace` list endpoint)
2. **Phase 5/6**: implementasi `apply_ledger_movement` untuk transaksi/transfer secara atomik, termasuk validasi wallet terarsip menolak transaksi baru
3. Pertimbangkan validasi `workspace_id` ProGuard di seluruh lapisan TypeScript (pengetikan `any` pada service)

**Estimated complexity**: Medium — groundwork penting yang mengikat semua modul finansial. Desain saldo as `bigint` + branded `Money` dan ledger stub disengaja agar Phase 5/6 tidak perlu migrasi balik.

---

## 📚 References

- Roadmap.md Phase 4 specification
- FR-023: Soft-delete/pengarsipan wallet
- FR-029: Label tipe wallet (`wallet_type`) di Business workspace
- RN-02: Cross-workspace access 404
- RN-04: snake_case convention
- ADR §5: Money sebagai integer minor unit (+ branded `Money`, tanpa ORM)
- doc15 Security: Two-layer isolation (RLS + app guard)