# Nuvio — AI-Powered Financial Planning Workspace

**Nuvio** adalah workspace perencanaan keuangan berbasis web/PWA yang membantu personal user dan pemilik small business (1–3 anggota) merencanakan kondisi keuangan *masa depan* — bukan sekadar mencatat transaksi yang sudah terjadi. Interaksi utama terjadi di **Financial Planning Calendar**: satu tampilan yang menyatukan transaksi aktual, transaksi terjadwal, tagihan rutin, budget, goal, dan sinyal forecast dalam satu garis waktu.

AI di Nuvio berperan sebagai **Financial Copilot** — lapisan penjelas yang menarasikan angka yang sudah dihitung oleh domain service (Wallet, Budget, Goal, Forecast), bukan mesin hitung finansial itu sendiri.

> Status: **MVP build**

---

## 1. Project Overview

- **Masalah:** Aplikasi keuangan kebanyakan bersifat *retrospektif* — mencatat yang sudah terjadi, tapi lemah menjawab pertanyaan prospektif: *"Apakah uang saya cukup sampai akhir bulan?"*
- **Solusi:** Proyeksi saldo (Forecast) ditempatkan langsung di Calendar harian, dan AI diposisikan sebagai penjelas angka deterministik — bukan penghitung baru.
- **Segmen:** Personal user + Business Workspace (1–3 anggota, role admin/member) dalam satu basis kode.
- **Monetisasi MVP:** hanya skeleton Plan Gating (UI), tanpa payment system.

## 2. Key Features

| Fitur | Deskripsi |
|---|---|
| **Financial Planning Calendar** | Landing page setelah login; grid bulan + proyeksi saldo (ForecastOverlay) + `DayDetailPanel` saat tanggal diklik |
| **Forecast** | Proyeksi saldo deterministik (30/60/90 hari) berbasis transaksi terjadwal + rata-rata pengeluaran non-rutin; disimpan sebagai snapshot, bukan dihitung tiap render |
| **Recurring Bill Generator** | Pre-generate tagihan rutin 60 hari ke depan via cron harian, dengan penanganan edge case tanggal (31 → mundur, 29 Feb → 28) |
| **Wallet, Transaction, Transfer** | Multi-wallet dengan `cached_balance` (derived data, atomik), soft-delete (arsip), transfer antar-wallet |
| **Budget** | Batas pengeluaran bulanan per kategori dengan progress warning (80–99%) / over (100%) |
| **Goal** | Target finansial; kontribusi direferensikan ke Transaction (tanpa double count) |
| **Workspace (multi-tenancy)** | Personal/Business; isolasi data di-enforce di service layer (`workspace-guard`), bukan hanya di UI |
| **AI Copilot** | Chat kontekstual (floating button); menarasikan data yang sudah dihitung; tidak pernah melakukan write action |
| **PWA** | Dapat diinstal dan dipakai seperti aplikasi native |

## 3. Tech Stack

Keputusan final mengikuti **03. Architecture Decisions** (ADR) — satu-satunya sumber kebenaran stack.

| Layer | Pilihan | Catatan |
|---|---|---|
| Framework | **Next.js (App Router)** | Monolith: frontend + API routes dalam satu proyek/deployment |
| Bahasa | **TypeScript** | Uang direpresentasikan sebagai integer minor unit (branded type) |
| Database | **PostgreSQL (Supabase)** | Data finansial sangat relasional; ACID wajib |
| ORM | **Prisma** | Type-safe, migrasi terdokumentasi & reversible |
| Auth | **Supabase Auth** | Email/password; aplikasi tidak pernah menyimpan password; session JWT divalidasi per request |
| AI | **Gemini 2.5 Flash** | Via `AIProvider` abstraction; structured output (JSON mode) |
| Validasi | **Zod** | Gerbang wajib semua payload API |
| Logging | **Pino** | Structured JSON log, redaksi field sensitif |
| UI | **Tailwind CSS + shadcn/ui** | Komponen di-copy ke repo (bukan dependency), bisa dikustomisasi penuh |
| State (client) | **TanStack Query** | Server state; invalidation pasca-mutasi |
| Deployment | **Vercel** | Preview per PR, Vercel Cron (2 background jobs) |
| CI/CD | **GitHub Actions** | Lint, typecheck, unit test, build, auto-deploy staging |
| Error tracking | **Sentry** | Free tier |

## 4. Project Architecture (High Level)

**Modular monolith, satu proses, dua peran** — frontend (`/app`) dan API routes (`/api`) hidup di proyek yang sama. Modularisasi dijaga di level kode (service layer per domain) sehingga migrasi ke microservice pasca-MVP tetap mungkin tanpa menulis ulang logic.

```mermaid
graph TD
    U[User / PWA] -->|HTTPS| APP[Next.js Monolith on Vercel]
    APP --> UI[Frontend app/ React + TanStack Query]
    APP --> API[API Routes /api]
    API --> V[Zod Validation]
    V --> S[Service Layer /lib/server per domain]
    S --> WG{workspace-guard<br/>isolasi multi-tenancy}
    WG --> DB[(PostgreSQL / Supabase)]
    S --> AI[AI Copilot:<br/>Context Builder → Gemini 2.5 Flash]
    CRON[Vercel Cron] -->|Job 1: recurring generator| S
    CRON -->|Job 2: forecast recompute| S
    APP --> SENTRY[Sentry]
```

**Aturan arsitektur yang mengikat (ADR):**

- **AI adalah leaf dependency** — tidak ada modul yang bergantung padanya; menghapus folder AI tidak merusak fungsi inti.
- **Calendar tidak pernah menjadi sumber data baru** — hanya *read & compose* dari modul lain.
- **Forecast tidak dihitung ulang sinkron** saat mutasi — cukup ditandai *stale*, recompute via cron.
- **Setiap query wajib menyertakan filter `workspace_id`** — isolasi bukan sekadar foreign key.

## 5. Folder Structure

```
CalBudget/
├── docs/                  # Seluruh dokumentasi proyek (03–16, lihat indeks di bawah)
├── .github/
│   └── workflows/ci.yml   # CI: lint → typecheck → unit test → build → deploy staging
├── prisma/
│   └── schema.prisma      # Skema database (sumber kebenaran struktur tabel)
├── app/                   # (direncanakan) UI + API routes, lihat bagian Project Structure
├── components/            # (direncanakan)
├── lib/                   # (direncanakan)
├── types/                 # (direncanakan) kontrak API via tipe TypeScript bersama
├── vercel.json            # Vercel Cron: generate-recurring & recompute-forecast
├── .env.local             # Secret lokal — TIDAK di-commit
└── .gitignore
```

## 6. Prerequisites

- **Node.js ≥ 20** (versi yang dipakai CI: `20`)
- **npm** (package manager proyek)
- **Docker** — untuk PostgreSQL lokal di development
- Akun **Supabase** (database + auth) — tiga project terpisah: dev, staging, prod
- Akun **Vercel** dan **GitHub** (untuk deployment/CI)
- API key **Gemini** (untuk fitur AI Copilot)

## 7. Environment Variables

Buat `.env.local` di root :

```bash
# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres:password@localhost:5432/nuvio_dev"

# Supabase Auth
SUPABASE_URL="https://<project>.supabase.co"
SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# AI Copilot (Gemini 2.5 Flash)
GEMINI_API_KEY="<gemini-api-key>"

# Cron job protection
CRON_SECRET="<random-string-untuk-verifikasi-vercel-cron>"
```

Detail per environment (staging/production) dan secret management: **14. DevOps** §14.4 dan **15. Security** §15.6.

## 8. Installation

```bash
# 1. Clone repository
git clone https://github.com/CodeByAbi/Nuxio.git
cd CalBudget

# 2. Install dependencies
npm install

# 3. Setup environment (lihat bagian Environment Variables)
# Buat file .env.local manual mengikuti variabel di bawah, lalu isi nilainya.

# 4. Jalankan database lokal (PostgreSQL via Docker)
docker compose up -d db      # atau sesuaikan dengan setup Supabase lokal

# 5. Setup database
npx prisma migrate dev

# 6. Jalankan aplikasi
npm run dev
```

## 9. Local Development

```bash
npm run dev   # http://localhost:3000
```

- **Preview deployment otomatis** untuk setiap PR (Vercel).
- **Supabase local (opsional):** `supabase start` — atau pakai project Supabase cloud dev untuk auth & database.
- Alur kerja harian: `feature/*` branch → PR → CI → staging → (review) → main.

## 10. Available Scripts

| Script | Perintah | Fungsi |
|---|---|---|
| Development | `npm run dev` | Dev server (localhost:3000) |
| Build | `npm run build` | `prisma migrate deploy && next build` — migrasi otomatis sebelum build |
| Production | `npm run start` | Menjalankan build production |
| Lint | `npm run lint` | ESLint |
| Typecheck | `npx tsc --noEmit` | TypeScript check (dipakai CI) |
| Test | `npm test` | Unit + API integration test (Jest) |
| Test + coverage | `npm test -- --coverage --passWithNoTests` | Sesuai CI |
| Migration (dev) | `npx prisma migrate dev --name <nama>` | Buat & terapkan migration baru |
| Migration (deploy) | `npx prisma migrate deploy` | Terapkan migration existing (staging/prod) |
| Prisma Studio | `npx prisma studio` | Visual DB explorer |

## 11. Build & Deployment

Pipeline (detail di **14. DevOps**):

```
Local → push → PR → CI (lint + typecheck + unit test + build)
                         ↓ passing
              Deploy STAGING (auto, Vercel preview)
                         ↓ manual approve (1 reviewer) + QA
                  Deploy PRODUCTION (manual)
```

- **Tiga environment terpisah:** `main` → production, `staging` → staging, `feature/*` → preview (database dev shared).
- **Database benar-benar terpisah** per environment — jangan pernah pakai DB production untuk testing.
- **Build command** menjalankan `prisma migrate deploy` sebelum `next build` — migrasi sinkron dengan deploy.
- **Pre-deploy checklist:** CI passing, migration teruji di staging, env vars production terkonfigurasi, API key valid, Sentry DSN aktif.
- **Post-deploy:** cek `/api/health` (status `ok`), login+onboarding end-to-end, Vercel Cron logs, tidak ada spike error di Sentry 15 menit pertama.

## 12. Database & Migration

- **Prisma + PostgreSQL (Supabase).** Skema lengkap: `07. Database`.
- **Prinsip:** UUID PK di semua tabel, `workspace_id` di hampir semua tabel sejak migrasi pertama, soft-delete (`archived`) untuk Wallet/Category, `cached_balance` sebagai derived data yang di-update atomik di service layer.
- **Entitas utama:** `workspaces`, `workspace_members`, `wallets`, `categories`, `transactions`, `budgets`, `goals`, `calendar_events`, `forecast_snapshots`, `recurring_rules`.
- **Aturan migrasi:**
  - Setiap PR yang mengubah schema wajib menyertakan migration Prisma.
  - Migration harus reversible; rollback ditulis di PR description.
  - Staging dulu, production kemudian.
  - Tidak ada rename/drop kolom yang masih dipakai tanpa koordinasi eksplisit.

```bash
npx prisma migrate dev --name add_budget_table   # development
npx prisma migrate deploy                         # staging/production
```

## 13. Authentication

- **Supabase Auth** (email/password) — keputusan final ADR. Aplikasi tidak pernah menyimpan password; seluruh siklus hidup kredensial didelegasikan ke Supabase.
- Session (JWT) divalidasi di **setiap** request API lewat helper internal (`requireAuth()`-style) — provider auth bisa diganti tanpa menyebar ke seluruh codebase.
- **Multi-tenancy:** setiap request yang membawa `workspace_id` wajib melewati `workspace-guard` — memverifikasi keanggotaan (`workspace_members`) sebelum menyentuh service layer. Gagal → 404/403 sebelum kode bisnis dijalankan.
- Detail & security baseline: **15. Security**.

## 14. AI Overview

Filosofi (detail: **13. AI**):

1. **AI menarasikan, bukan menghitung ulang.** Angka yang dikutip AI identik dengan yang dihitung Forecast engine dan ditampilkan di Calendar — tidak ada dua sumber angka yang bisa kontradiksi.
2. **AI menyarankan, tidak mengeksekusi.** Tidak pernah melakukan write action; setiap saran diakhiri CTA ke UI terkait.
3. **AI mengakui keterbatasan.** Cold-start (user baru) dinarasikan jujur, bukan jawaban generik kosong.

**Alur:** `POST /api/ai/chat` → autentikasi & ambil `workspace_id` → **Context Builder** (server-side) mengagregasi data Workspace jadi ringkasan terstruktur (bukan raw rows) → Gemini 2.5 Flash (temperature 0.3, max tokens 1024) → respons divalidasi (deteksi angka yang tidak cocok dengan data riil = halusinasi) → kembali ke client.

## 15. Testing

Strategi proporsional MVP (detail: **16. Testing**):

| Lapisan | Pendekatan |
|---|---|
| Unit test (Jest) | Wajib 100% untuk logika kritikal: recurring bill generator, forecast engine, saldo kalkulasi |
| Integration test (Jest + Supertest) | Happy path + minimal 1 error case per API route utama (termasuk isolasi workspace lintas user) |
| E2E | Manual QA dengan skenario terdokumentasi (bukan framework E2E penuh untuk MVP) |

```bash
npm test -- --coverage --passWithNoTests
```

## 16. Project Structure

Struktur aplikasi yang direncanakan (per **11. Frontend Specification** & **09. Backend**):

```
app/
├── (auth)/                # login, register
├── (app)/                 # layout: sidebar + AI Copilot floating entry
│   ├── calendar           # landing page setelah login (Financial Planning Calendar)
│   ├── wallet / transaction / budget / goal
│   └── workspace/         # settings, members (Business only)
└── api/                   # route per domain: workspace, wallet, transaction,
                           # budget, goal, calendar-events, forecast, ai-copilot
components/
├── ui/                    # komponen dasar shadcn/ui
├── calendar/              # CalendarGrid, DayCell, DayDetailPanel, ForecastOverlay
├── wallet/ transaction/ budget/ goal/ ai-copilot/ shared/
lib/
├── prisma.ts, auth.ts
├── forecast-engine.ts     # shared type dengan backend, bukan logic duplikat
└── server/                # service layer per domain (workspace-guard.ts, dst.)
types/                     # kontrak API: tipe TypeScript bersama FE & BE
```

**Aturan struktural kunci:** service tidak pernah query tabel domain lain secara langsung (panggil service lain); `workspace-guard` di semua route; satu komponen form per entitas (mis. `TransactionForm`) dipakai di semua entry point.

## 17. Documentation Index

Seluruh dokumentasi proyek ada di `docs/` — satu sumber kebenaran. Baca berurutan untuk konteks lengkap:

| Doc | Isi |
|---|---|
| [03. Architecture Decisions](docs/03.%20Architecture%20Decisions.md) | Keputusan arsitektur & stack final (source of truth teknis) |
| [04. PRD](docs/04.%20PRD.md) | Product requirements — goals, users, fitur, business rules |
| [05. User Flow](docs/05.%20User%20Flow.md) | Alur user utama (onboarding → Calendar, interaksi harian) |
| [06. Information Architecture](docs/06.%20Information%20Architecture.md) | Struktur navigasi & hierarki entitas |
| [07. Database](docs/07.%20Database.md) | Skema tabel lengkap, indexing, aturan migrasi |
| [08. System Design](docs/08.%20System%20Design.md) | Arsitektur tingkat tinggi & request lifecycle kritis |
| [09. Backend](docs/09.%20Backend.md) | Service layer, business rules, ringkasan endpoint |
| [10. API](docs/10.%20API.md) | Kontrak API detail (request/response/status code) |
| [11. Frontend](docs/11.%20Frontend.md) | Halaman, komponen, state management |
| [12. UI Design System](docs/12.%20UI%20Design%20System.md) | Warna semantik, tipografi, komponen, aksesibilitas |
| [13. AI](docs/13.%20AI.md) | Spesifikasi teknis AI Copilot |
| [14. DevOps](docs/14.%20DevOps.md) | Deployment, CI/CD, background jobs, monitoring |
| [15. Security](docs/15.%20Security.md) | Auth, multi-tenancy, secret management, OWASP |
| [16. Testing](docs/16.%20Testing.md) | Strategi & skenario testing |

## 18. Development Workflow

1. **Branch:** kerja di `feature/*` (dari `main`).
2. **PR ke `staging`** (atau `main` sesuai konvensi tim) — CI otomatis: lint → typecheck → unit test → build. **PR tidak bisa di-merge jika CI gagal.**
3. **Staging** auto-deploy setelah CI passing; QA dijalankan di sini.
4. **Production** hanya melalui manual deploy setelah review (≥1 reviewer) dan QA.
5. **Perubahan schema DB** wajib menyertakan migration Prisma + verifikasi di staging.
6. **Commit convention:** conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
7. Setiap perubahan signifikan terdokumentasikan di `docs/` yang relevan.

## 19. Contributing Guidelines

- Baca **04. PRD** dan **03. Architecture Decisions** sebelum mengerjakan apa pun — jangan membuat keputusan yang bertentangan dengan dokumen.
- Ikuti struktur modul & business rules di **09. Backend** — jangan bypass service layer atau `workspace-guard`.
- Setiap logic finansial baru **wajib** unit test (lihat **16. Testing**).
- Jangan commit `.env*` atau secret apa pun (lihat **15. Security**).
- Jangan lakukan perubahan skema manual di database — selalu lewat Prisma Migrate.

## 20. License

**Belum ditentukan** — placeholder sampai keputusan lisensi dibuat. Harap diskusikan dengan pemilik repo sebelum distribusi publik.
