# Nuxio — Architecture Document

**Status:** Draft for MVP build
**Companion to:** `06_PRD.md` (single source of truth untuk requirement)
**Scope:** Keputusan arsitektur teknis, struktur sistem, dan pola implementasi. Dokumen ini menjelaskan _bagaimana_ Nuxio dibangun; PRD menjelaskan _apa_ yang dibangun.

> Prinsip pembacaan: setiap keputusan di dokumen ini mengacu ke Product Principle di PRD Section 5. Jika ada konflik antara dokumen ini dan PRD, PRD menang untuk _requirement_, dokumen ini menang untuk _cara implementasi_.

---

## 1. Ringkasan Arsitektur

Nuxio adalah **modular monolith** di atas Next.js, dideploy ke Vercel, dengan Supabase (PostgreSQL + Auth) sebagai fondasi data dan identitas. AI Copilot memakai Gemini 2.5 Flash sebagai lapisan narasi di atas domain service yang deterministik.

Keputusan arsitektur terbesar dan alasannya:

| Keputusan                 | Pilihan                                   | Alasan singkat                                                              |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| Bentuk aplikasi           | Modular monolith                          | Realistis untuk 3 engineer / 32 hari; hindari overhead microservice (TG-01) |
| Framework                 | Next.js (App Router) + TypeScript         | SSR untuk first-load Calendar; satu bahasa untuk FE+BE                      |
| Database                  | Supabase PostgreSQL                       | Data finansial sangat relasional; butuh integritas foreign key              |
| Auth                      | Supabase Auth                             | Tidak membangun auth kustom; nyambung langsung ke RLS                       |
| Isolasi data              | Dua lapisan: app membership check + RLS   | Defense in depth (Product Principle #11)                                    |
| Akses DB (request user)   | Supabase client dengan session token user | `auth.uid()` terisi → RLS aktif otomatis                                    |
| Akses DB (background job) | Service role, scoped manual per workspace | Job tidak punya konteks user                                                |
| Uang                      | Integer minor unit                        | Tidak ada floating point (Product Principle #6)                             |
| Forecast                  | Rule-based, deterministik, snapshot       | Bukan ML; reproducible (Product Principle #7)                               |
| Background job            | Vercel Cron                               | Cukup untuk skala MVP; hindari infra queue                                  |
| AI                        | Gemini 2.5 Flash via provider abstraction | Read-only, narasi di atas angka final (Product Principle #3, #8)            |

---

## 2. Diagram Sistem (High Level)

```
┌───────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser / PWA)                   │
│   Next.js App Router — Calendar, Wallet, Budget, Goal, Chat UI    │
│   Session token disimpan di HttpOnly cookie (bukan localStorage)  │
└───────────────────────────┬───────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼───────────────────────────────────────┐
│                    NEXT.JS SERVER (Vercel)                        │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │  API Routes /   │  │  Domain Services │  │  AI Copilot     │  │
│  │  Server Actions │──│  Wallet, Txn,    │──│  Context Builder│  │
│  │  (auth guard +  │  │  Budget, Goal,   │  │  + Gemini call  │  │
│  │  membership)    │  │  Forecast        │  │  (read-only)    │  │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬────────┘  │
│           │                    │                     │           │
│           │  Supabase client (session token user)    │           │
└───────────┼────────────────────┼─────────────────────┼───────────┘
            │                    │                     │
┌───────────▼────────────────────▼─────────────────────▼───────────┐
│                    SUPABASE (PostgreSQL + Auth)                   │
│                                                                   │
│  Auth (identitas, session)   ·   PostgreSQL (data finansial)     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  RLS AKTIF di semua tabel finansial — auth.uid() → policy   │ │
│  │  wallets · transactions · budgets · goals · forecast_...     │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
            ▲
            │ Service role (bypass RLS, scoped manual)
┌───────────┴───────────────────────────────────────────────────────┐
│                    BACKGROUND JOBS (Vercel Cron)                  │
│   Recurring occurrence generator  ·  Forecast recompute          │
└───────────────────────────────────────────────────────────────────┘
            │
┌───────────▼───────────────────────────────────────────────────────┐
│              GEMINI 2.5 FLASH (via provider abstraction)          │
│   Menerima context agregat, mengembalikan narasi + sourceRefs    │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Layered Architecture

Nuxio memisahkan tanggung jawab menjadi empat lapisan. Aturan emas: **lapisan atas boleh memanggil lapisan bawah, tidak sebaliknya.**

```
┌─────────────────────────────────────────────────────┐
│  Layer 1 — Presentation (React components, App Router)│
│  Tahu soal UI. Tidak tahu soal SQL atau RLS.         │
├─────────────────────────────────────────────────────┤
│  Layer 2 — API / Server Actions                      │
│  Auth guard + membership check. Validasi Zod.        │
│  Menerjemahkan request jadi pemanggilan domain.      │
├─────────────────────────────────────────────────────┤
│  Layer 3 — Domain Services                           │
│  Wallet, Transaction, Budget, Goal, Forecast.        │
│  Semua business rule & kalkulasi uang di sini.       │
│  AI TIDAK ADA di sini (Product Principle #2).        │
├─────────────────────────────────────────────────────┤
│  Layer 4 — Data Access (Supabase client / repo)      │
│  Query ke PostgreSQL. RLS ditegakkan di level ini    │
│  oleh database, bukan oleh kode.                     │
└─────────────────────────────────────────────────────┘

     AI Copilot berdiri DI SAMPING, bukan di dalam:
     ┌──────────────────────────────────────────┐
     │  AI Layer — Context Builder + Gemini      │
     │  Membaca hasil Domain Services (Layer 3). │
     │  Tidak pernah menulis. Tidak punya jalur  │
     │  ke Layer 4 untuk mutasi.                  │
     └──────────────────────────────────────────┘
```

Konsekuensi penting dari Product Principle #2 (domain independen dari AI): kalau seluruh AI Layer dihapus, Layer 1–4 tetap berfungsi penuh. AI adalah lapisan penjelas, bukan tulang punggung.

---

## 4. Model Data & Multi-Tenancy

### 4.1 Prinsip `workspace_id`

Setiap tabel data finansial memiliki kolom `workspace_id` sebagai foreign key **wajib** (Product Principle #4). Ini bukan sekadar kolom — ini adalah batas keamanan sekaligus batas domain. Tidak ada entitas finansial yang boleh "mengambang" tanpa Workspace.

### 4.2 Entitas Inti

```
auth.users (dikelola Supabase Auth)
    │
    │  (via workspace_members)
    ▼
workspaces ──┬── wallets ──── transactions
             │                     │
             ├── categories ───────┘
             ├── recurring_rules ── calendar_events
             ├── budgets
             ├── goals ──── goal_contributions
             ├── forecast_snapshots
             ├── notifications
             └── workspace_members (user ↔ workspace, role)
```

### 4.3 Aturan Uang

Semua nilai uang disimpan sebagai **integer minor unit** (mis. Rupiah disimpan apa adanya karena tidak punya sen; USD disimpan dalam sen). Tidak ada `float` atau `double` di manapun — database, domain, maupun API response (Product Principle #6). Konversi tampilan (format "Rp 1.500.000") terjadi hanya di lapisan presentasi.

---

## 5. Keamanan Berlapis (Defense in Depth)

Ini bagian arsitektur paling kritis untuk aplikasi finansial. Isolasi data ditegakkan di **dua lapisan independen** (Product Principle #11).

### 5.1 Lapisan 1 — Aplikasi (membership check)

Setiap request user melewati guard yang memverifikasi: apakah user ini member dari Workspace yang datanya dia minta? `workspace_id` dari client **tidak pernah** dipercaya tanpa verifikasi ini.

```typescript
// Pseudo-pattern — membership check di setiap API route / server action
async function requireWorkspaceAccess(workspaceId: string) {
  const user = await getAuthenticatedUser(); // dari Supabase session
  if (!user) throw new UnauthorizedError();

  const membership = await getMembership(user.id, workspaceId);
  if (!membership) throw new ForbiddenError(); // 403, bukan 404 detail

  return { user, membership };
}
```

### 5.2 Lapisan 2 — Database (Row Level Security / RLS)

RLS adalah jaring pengaman terakhir. Bahkan jika Lapisan 1 punya bug (misal sebuah query lupa filter `workspace_id`), database sendiri menolak mengembalikan baris milik Workspace lain.

**Cara kerjanya:** karena request user memakai Supabase client yang membawa session token, PostgreSQL tahu siapa user yang bertanya lewat fungsi `auth.uid()`. Policy RLS mencocokkan `auth.uid()` dengan keanggotaan Workspace.

#### Helper function (dijalankan sekali saat setup DB)

```sql
-- Fungsi bantu: daftar workspace_id tempat user saat ini menjadi member
create or replace function auth_workspace_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select workspace_id
  from workspace_members
  where user_id = auth.uid();
$$;
```

#### Contoh policy untuk tabel `transactions`

```sql
-- 1. Aktifkan RLS
alter table transactions enable row level security;

-- 2. SELECT: hanya baris di workspace tempat user jadi member
create policy "txn_select_own_workspace"
on transactions for select
using ( workspace_id in (select auth_workspace_ids()) );

-- 3. INSERT: hanya boleh menulis ke workspace tempat user jadi member
create policy "txn_insert_own_workspace"
on transactions for insert
with check ( workspace_id in (select auth_workspace_ids()) );

-- 4. UPDATE: baris harus di workspace user, dan hasil update tetap di sana
create policy "txn_update_own_workspace"
on transactions for update
using ( workspace_id in (select auth_workspace_ids()) )
with check ( workspace_id in (select auth_workspace_ids()) );

-- 5. DELETE: hanya baris di workspace user
create policy "txn_delete_own_workspace"
on transactions for delete
using ( workspace_id in (select auth_workspace_ids()) );
```

Pola yang sama diterapkan ke: `wallets`, `categories`, `recurring_rules`, `calendar_events`, `budgets`, `goals`, `goal_contributions`, `forecast_snapshots`, `notifications`, `workspace_members`.

> Untuk tabel yang tidak punya `workspace_id` langsung (mis. `goal_contributions` yang terhubung lewat `goals`), policy memakai subquery yang menelusuri parent-nya ke `workspace_id`, lalu mencocokkan dengan `auth_workspace_ids()`.

#### Contoh policy untuk tabel turunan (`goal_contributions`)

```sql
alter table goal_contributions enable row level security;

create policy "goal_contrib_select_own_workspace"
on goal_contributions for select
using (
  exists (
    select 1 from goals g
    where g.id = goal_contributions.goal_id
      and g.workspace_id in (select auth_workspace_ids())
  )
);
-- (insert/update/delete mengikuti pola with check yang setara)
```

### 5.3 Kapan RLS Sengaja Di-bypass (Service Role)

Dua jenis operasi berjalan **tanpa konteks user**, jadi `auth.uid()` kosong dan RLS tidak bisa membantu. Untuk ini, kita pakai service role secara sadar:

1. **Background job** (recurring generator, forecast recompute) — job iterasi per Workspace dan sudah men-scope `workspace_id` sendiri.
2. **Operasi admin sistem** — mis. migrasi, seeding kategori default.

**Aturan wajib saat memakai service role:**

- Setiap query **wajib** menyertakan `workspace_id` eksplisit — karena RLS tidak melindungi jalur ini.
- Service role key **tidak pernah** sampai ke client.
- Service role **dilarang** dipakai untuk melayani request user biasa (itu mematikan RLS untuk seluruh jalur user → melanggar Product Principle #11).

```typescript
// Background job — service role, WAJIB scope workspace_id manual
async function generateOccurrencesForWorkspace(workspaceId: string) {
  const rules = await serviceRoleClient
    .from("recurring_rules")
    .select("*")
    .eq("workspace_id", workspaceId) // ← wajib, RLS tidak menjaga di sini
    .eq("is_active", true);
  // ... generate occurrences (idempotent, lihat Section 7)
}
```

### 5.4 Ringkasan Jalur Akses

| Jalur                              | Client                                | RLS aktif?      | Cara isolasi                          |
| ---------------------------------- | ------------------------------------- | --------------- | ------------------------------------- |
| Request user (CRUD normal)         | Supabase client + session token       | ✅ Ya           | app membership check + RLS            |
| Background job                     | Service role                          | ❌ Bypass sadar | scoping `workspace_id` manual di kode |
| Query agregasi kompleks (Forecast) | Service role atau parameterized query | ❌ Bypass sadar | scoping `workspace_id` manual di kode |

---

## 6. Alur Request Utama

### 6.1 Membuat Transaksi (write path)

```
User submit form transaksi
   │
   ▼
API Route / Server Action
   ├─ requireWorkspaceAccess(workspaceId)   ← Lapisan 1
   ├─ validasi payload dengan Zod            ← mass assignment protection
   │
   ▼
Domain Service: TransactionService.create()
   ├─ mulai DB transaction (atomik — Product Principle #5)
   │    ├─ insert row transactions           ← RLS cek Lapisan 2
   │    └─ update cached balance wallet       ← dalam transaksi yang sama
   └─ commit
   │
   ▼
Response ke UI + trigger revalidate Calendar
```

Poin kritis: mutasi saldo Wallet dan insert Transaction berada dalam **satu DB transaction** — kalau salah satu gagal, keduanya di-rollback. Ini mencegah saldo cache jadi tidak sinkron dengan ledger (Product Principle #5).

### 6.2 Membuka Calendar (read path)

```
User buka Calendar bulan tertentu
   │
   ▼
Server Component fetch data bulan
   ├─ requireWorkspaceAccess(workspaceId)
   ├─ query calendar_events (transaksi + occurrence + milestone)
   │    via Supabase client → RLS otomatis men-scope
   └─ query forecast_snapshot terbaru (overlay)
   │
   ▼
Render Calendar grid + indikator (income/expense/bill/goal/forecast)
```

### 6.3 Bertanya ke AI Copilot (read-only path)

```
User ketik pertanyaan di Chat
   │
   ▼
API Route: /api/ai/chat
   ├─ requireWorkspaceAccess(workspaceId)
   ├─ Context Builder mengagregasi data (via domain services):
   │    saldo, top kategori, budget status, forecast snapshot, upcoming bills
   │    → JSON terstruktur (BUKAN raw transaction rows)
   ├─ kirim context + pertanyaan ke Gemini 2.5 Flash
   ├─ terima respons { narrative, sourceReferences }
   ├─ grounding check: setiap angka di narrative harus ada di context
   └─ jika lolos → tampilkan; jika gagal → fallback message
```

AI tidak punya jalur ke Layer 4 untuk menulis. Secara arsitektural, satu-satunya output AI adalah teks (Product Principle #3, #8).

---

## 7. Background Jobs

Dua job berjalan via Vercel Cron. Keduanya memakai service role dan men-scope per Workspace.

### 7.1 Recurring Occurrence Generator

- **Jadwal:** harian.
- **Tugas:** untuk setiap recurring rule aktif, generate occurrence sebagai _planned Transaction_ untuk periode mendatang.
- **Idempotency:** wajib. Job bisa retry (Vercel bisa memanggil dua kali). Gunakan idempotency key + unique constraint `(recurring_rule_id, due_date)` di level database — bukan hanya cek di kode.
- **Edge case tanggal:** tanggal 29–31 di bulan yang lebih pendek → mundur ke hari terakhir bulan tersebut. Tahun kabisat untuk 29 Februari. Ini wajib punya unit test sebelum fitur lain bergantung padanya.

### 7.2 Forecast Recompute

- **Jadwal:** harian, setelah recurring generator selesai (agar occurrence terbaru ikut terhitung).
- **Rumus (deterministik, Product Principle #7):**
  ```
  proyeksi_saldo(tanggal) =
      saldo_saat_ini
    + income_terjadwal(s/d tanggal)
    − recurring_bill_terjadwal(s/d tanggal)
    − estimasi_pengeluaran_non_recurring(rata-rata ~30 hari histori)
  ```
- **Output:** Forecast Snapshot immutable per Workspace, disimpan untuk dibaca cepat (bukan dihitung ulang saat Calendar dibuka).
- **Cold-start:** user tanpa histori → komponen rata-rata historis = 0, dan UI wajib memberi tahu "proyeksi akan lebih akurat setelah beberapa minggu data" — jangan tampilkan presisi palsu.

---

## 8. AI Copilot — Arsitektur

### 8.1 Context Builder

Komponen server-side yang mengagregasi data Workspace menjadi ringkasan terstruktur sebelum dikirim ke Gemini. **Tidak** mengirim raw transaction rows (mahal, lambat, rawan halusinasi seiring data bertambah).

Data yang dikirim: saldo per wallet, total income/expense bulan berjalan, top kategori pengeluaran, status budget, forecast snapshot (lowest day), upcoming bills. Semua angka diambil dari **domain service yang sama** dengan yang dipakai UI — sehingga tidak ada dua sumber angka.

### 8.2 Grounding & Safety

- Respons Gemini diminta dalam format terstruktur: `{ narrative, sourceReferences }`.
- `sourceReferences` mencantumkan entitas/angka spesifik (mis. `budget_id`, `forecast_snapshot_id`) yang jadi dasar klaim.
- **Grounding check:** setiap angka finansial di `narrative` harus bisa dicocokkan ke context sumber. Angka tanpa `sourceReference` ditolak → fallback message, bukan ditampilkan.
- **Prompt injection:** input user (nama kategori, catatan) diperlakukan sebagai data, bukan instruksi. AI tidak punya tool-call apa pun — permukaan serangan minimal.

### 8.3 Provider Abstraction

Gemini diakses lewat satu interface internal (bukan SDK langsung), sehingga provider bisa diganti tanpa mengubah domain service. Kalau Gemini timeout/error, Chat UI menampilkan fallback dan **fitur finansial inti tetap berfungsi penuh** (Product Principle #3).

---

## 9. Deployment & Environment

### 9.1 Tiga Environment Terpisah

```
main branch     → Production   → Supabase project: nuxio-prod
staging branch  → Staging      → Supabase project: nuxio-staging
feature/*       → Preview      → Supabase project: nuxio-dev (shared)
```

Database production, staging, dan dev adalah **project Supabase yang benar-benar terpisah**. Jangan pernah menguji fitur di database berisi data user asli.

### 9.2 Secret Management

Semua kredensial (Supabase URL, anon key, **service role key**, Gemini API key) disimpan sebagai environment variable di Vercel — tidak pernah hardcode atau ter-commit ke git. Service role key hanya dipakai di server-side (background job, operasi admin), tidak pernah sampai ke bundle client.

| Secret                      | Dipakai di              | Boleh ke client?      |
| --------------------------- | ----------------------- | --------------------- |
| `SUPABASE_URL`              | server + client         | Ya (public)           |
| `SUPABASE_ANON_KEY`         | client (request user)   | Ya — RLS yang menjaga |
| `SUPABASE_SERVICE_ROLE_KEY` | server saja (job/admin) | **Tidak pernah**      |
| `GEMINI_API_KEY`            | server saja             | **Tidak pernah**      |

Catatan penting: `anon key` aman berada di client **justru karena RLS aktif** — tanpa RLS, anon key di client akan jadi lubang keamanan. Ini alasan lain kenapa RLS wajib, bukan opsional.

### 9.3 Migrasi Database

- Setiap perubahan schema lewat file migrasi terdokumentasi dan reversible.
- Staging dulu, verifikasi, baru production.
- Rollback strategy terdokumentasi dan pernah diuji minimal sekali di staging (Launch Checklist PRD Section 20).
- **Policy RLS adalah bagian dari migrasi** — jangan aktifkan tabel baru tanpa policy RLS-nya sekaligus, atau tabel itu jadi lubang isolasi.

---

## 10. Observability

- **Health check endpoint** aktif dan dipantau (cek koneksi DB).
- **Structured logging** dengan redaksi field sensitif — log mutasi finansial mencatat `workspace_id`, `user_id`, `amount`, tapi bukan catatan/deskripsi pribadi.
- **Error tracking** untuk unhandled exception, kegagalan background job, error Gemini, dan kegagalan grounding check AI.
- **Token usage** AI dicatat per request untuk kontrol biaya.

---

## 11. Peta Keputusan → Product Principle

Tabel rujukan cepat: setiap keputusan arsitektur besar berakar di prinsip produk PRD.

| Keputusan arsitektur                         | Product Principle (PRD §5)                           |
| -------------------------------------------- | ---------------------------------------------------- |
| Domain service independen dari AI            | #2 (Calendar pusat), #3 (AI bukan sumber kebenaran)  |
| AI read-only, tanpa tool-call                | #3, #8 (AI hanya membaca)                            |
| Semua tabel punya `workspace_id`             | #4 (semua data di Workspace)                         |
| Mutasi finansial dalam satu DB transaction   | #5 (operasi atomik)                                  |
| Integer minor unit untuk uang                | #6 (tidak ada floating point)                        |
| Forecast rule-based deterministik + snapshot | #7 (Forecast deterministic)                          |
| Dua lapisan isolasi (app + RLS)              | #9 (isolasi di setiap layer), #11 (defense in depth) |
| Modular monolith, Vercel Cron                | #10 (jangan over-engineering)                        |

---

## 12. Yang Sengaja Tidak Dibangun (Arsitektur)

Sejalan dengan PRD Section 22, arsitektur ini **sengaja belum** mencakup:

- Job queue penuh (BullMQ/Redis) — Vercel Cron cukup untuk skala MVP; migrasi dipertimbangkan saat total durasi job harian mendekati batas jendela waktu.
- Pemisahan ke layanan terpisah — modular monolith cukup; pisahkan modul (kemungkinan AI/Forecast) hanya saat kebutuhan skala/deploy-nya jauh berbeda.
- Payment gateway aktif — hanya plan gating skeleton di MVP.
- Multi-currency per Workspace, bank sync, OCR, mobile native.

Keputusan menunda ini bukan kelalaian — ini menjaga fokus 32 hari ke validasi hipotesis produk, bukan ke kompleksitas infrastruktur yang belum dibutuhkan.
