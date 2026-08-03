# 14. Frontend Specification

**Asumsi kerja:** dokumen ini mengikuti keputusan final di blueprint MVP — stack Next.js (App Router) monolith, PostgreSQL + Prisma, Claude API untuk AI Copilot, dual segmen Personal/Business, Calendar sebagai landing page (bukan Dashboard). Styling menggunakan Tailwind CSS + shadcn/ui, dipilih karena cocok untuk tim 3 orang dengan timeline 32 hari — shadcn/ui bukan dependency terinstal, melainkan komponen yang di-copy ke repo sehingga bisa dikustomisasi penuh tanpa terkunci ke versi library pihak ketiga.

---

## 14.1 Struktur Proyek

```
/app
  /(auth)
    /login
    /register
  /(app)
    layout.tsx                 → sidebar + AI Copilot floating entry point
    /calendar                  → landing page setelah login
    /wallet
    /transaction
    /budget
    /goal
    /workspace
      /settings
      /members
  /api
    /auth/[...nextauth]
    /workspace
    /wallet
    /transaction
    /budget
    /goal
    /calendar-events
    /forecast
    /ai-copilot
/components
  /ui                          → komponen dasar shadcn/ui (button, dialog, dsb)
  /calendar                    → CalendarGrid, DayCell, DayDetailPanel, EventBadge
  /wallet                      → WalletCard, WalletForm
  /transaction                 → TransactionForm, TransactionList
  /budget                      → BudgetProgressBar, BudgetForm
  /goal                        → GoalCard, GoalMilestoneBadge
  /ai-copilot                  → ChatWindow, ChatBubble, ChatEntryButton
  /shared                      → EmptyState, LoadingSkeleton, ConfirmDialog
/lib
  /prisma.ts
  /auth.ts
  /forecast-engine.ts          → shared type dengan backend, bukan logic duplikat
/types
  → tipe TypeScript bersama antara frontend dan API routes (Section 9 DoD: kontrak API via tipe bersama)
```

**Alasan struktur ini:** karena backend adalah API routes di dalam proyek Next.js yang sama (monolith, sesuai Section 7 blueprint), folder `/api` dan `/app` berbagi satu `/types` — ini yang dimaksud "kontrak API terdokumentasi lewat tipe TypeScript bersama" di Definition of Done, bukan dokumentasi Swagger terpisah.

---

## 14.2 Halaman & Komponen (mengikuti Section 4 dan 6 Blueprint)

### Financial Planning Calendar (landing page)
Komponen kunci: `CalendarGrid` (month view), `DayCell` (indikator income/expense/bill/goal sebagai dot, bukan teks penuh — lihat 14.4 Strategi Cluttered Day), `DayDetailPanel` (slide-over panel saat tanggal diklik, berisi list entri + tombol tambah cepat), `ForecastOverlay` (toggle garis proyeksi saldo di atas grid, bukan grafik terpisah).

Ringkasan saldo semua Wallet + status Budget bulan berjalan tampil sebagai strip ringan di atas grid — ini realisasi dari mitigasi risiko "Calendar-only UX belum tentu menjawab kebutuhan snapshot kondisi sekarang" di Section 8 Blueprint, bukan Dashboard baru.

### Wallet
`WalletCard` menampilkan nama, tipe (personal/bisnis untuk Business Workspace), saldo (dari kolom cache, bukan hitung ulang di client). `WalletForm` untuk tambah/edit, dengan opsi arsipkan (bukan hapus permanen — sesuai Business Rule Section 4.3).

### Transaction
`TransactionForm` dipakai di dua entry point (halaman Transaction dan `DayDetailPanel` di Calendar) — **wajib komponen yang sama di-reuse**, bukan dua implementasi form terpisah, untuk menjaga satu sumber kebenaran data sesuai Acceptance Criteria Section 4.4.

### Budget
`BudgetProgressBar` dipakai di dua tempat: halaman Budget penuh, dan sebagai indikator ringkas di `DayDetailPanel`. Warna progress: aman di bawah 80%, warning 80-99%, over 100% — konsisten dengan skema warna semantik aplikasi (lihat 15. UI Design System).

### Goal
`GoalCard` menampilkan progress persentase dan status (`on-track` / `terlambat` jika tanggal target lewat tapi belum 100%). Milestone Goal tampil sebagai `EventBadge` khusus di `DayCell` pada tanggal target.

### AI Copilot
`ChatEntryButton` adalah floating button persisten di seluruh halaman `(app)`, bukan item sidebar biasa — sesuai Section 6 blueprint yang eksplisit meminta entry point kontekstual. `ChatWindow` membawa context halaman aktif (misal tanggal yang sedang dilihat di Calendar) sebagai bagian dari request ke API, supaya pertanyaan seperti "kenapa tanggal ini merah?" bisa dijawab tanpa user mengetik ulang konteks.

### Workspace Settings & Members
Halaman sederhana, non-realtime. `Members` hanya tampil untuk Business Workspace (Personal Workspace tidak menampilkan opsi ini sama sekali, bukan disembunyikan lewat disabled state).

---

## 14.3 State Management

Karena scope MVP tidak butuh state global kompleks (tidak ada realtime collaboration, sesuai Out of Scope Section 2), pendekatan yang disarankan:

- **Server state**: React Query (TanStack Query) untuk semua data dari API routes — caching, invalidation otomatis setelah mutasi (misal setelah tambah Transaction, invalidate query Wallet balance dan Calendar events sekaligus).
- **Client state lokal**: `useState`/`useReducer` bawaan React untuk UI state murni (modal terbuka/tertutup, tanggal terpilih di Calendar).
- **Tidak perlu** Redux/Zustand global store — kompleksitas tambahan ini tidak sepadan untuk scope MVP dan tim 3 orang.

**Aturan invalidasi kritis**: setiap mutasi Transaction, Budget, atau Goal wajib meng-invalidate query Calendar events dan Forecast — supaya tidak ada tampilan stale antar halaman (mengikuti risiko teknis Section 8: "saldo Wallet ter-cache jadi stale").

---

## 14.4 Strategi Cluttered Day (Calendar dengan >15 entri)

Sesuai Edge Case Section 4.2, `DayCell` tidak boleh me-render semua badge satu per satu. Strategi:

1. Render maksimal 3 dot/badge kategori (income, expense, bill — masing-masing satu indikator agregat, bukan per-transaksi)
2. Kalau lebih dari batas visual, tampilkan teks kecil "+N lainnya" alih-alih badge tambahan
3. Detail penuh tetap muncul di `DayDetailPanel` saat tanggal diklik — `DayCell` hanya perlu memberi sinyal "ada aktivitas", bukan daftar lengkap

Ini diuji secara eksplisit dengan data dummy padat (>15 entri/hari) sebagai bagian dari Definition of Done UI/UX, bukan diasumsikan aman.

---

## 14.5 Empty States & Loading States

Sesuai Definition of Done Frontend (Section 9 Blueprint): setiap state kosong wajib punya desain, bukan halaman blank.

| Halaman | Empty state |
|---|---|
| Calendar (user baru selesai onboarding, belum ada transaksi) | Kalender tetap tampil penuh (grid bulan), dengan garis proyeksi Forecast hanya dari income + recurring bill terjadwal, plus catatan kecil "Forecast akan makin akurat setelah beberapa minggu pencatatan" |
| Wallet (belum ada wallet lain selain default) | Card ajakan "Tambah wallet lain" dengan ikon, bukan list kosong polos |
| Budget (belum ada budget dibuat) | Ajakan "Buat rencana pengeluaran pertama" dengan CTA verb-first |
| Goal | Sama pola — ajakan, bukan "tidak ada data" |
| AI Copilot (user baru, cold start) | Chat tetap terbuka, tapi AI secara eksplisit menyatakan keterbatasan data di pesan pertama (bukan UI kosong menunggu user bertanya tanpa konteks) |

Loading state: skeleton loader untuk Calendar grid dan list (bukan spinner polos di tengah layar) — supaya perceived performance lebih baik saat data sedang di-fetch.

---

## 14.6 Responsive Scope

Sesuai Definition of Done: web only, tapi wajib responsive di desktop dan tablet minimum (bukan cuma desktop fixed-width). Breakpoint disarankan:

- Desktop (≥1024px): sidebar penuh + Calendar grid lebar penuh
- Tablet (768px–1023px): sidebar collapsible (ikon saja), Calendar grid tetap grid bulan penuh tapi cell lebih ringkas
- Di bawah 768px: di luar scope MVP eksplisit (Section 2 — tidak ada native mobile), tapi layout tidak boleh rusak total — cukup best-effort, bukan dioptimalkan penuh

---

## 14.7 Dependency Antar Komponen (ringkasan untuk sequencing kerja Engineer B)

`CalendarGrid` bergantung pada data dari Wallet, Transaction, Budget, Goal — artinya secara komponen, `CalendarGrid` versi penuh **tidak bisa selesai lebih dulu** dari CRUD dasar keempat entitas itu, meski rendering skeleton-nya (Hari 12 Roadmap) boleh dimulai dari data statis/dummy lebih awal untuk paralelisasi kerja tim.

`ChatWindow` bergantung pada context builder di backend yang mengagregasi ketiga entitas tadi plus Forecast — sehingga secara realistis `ChatWindow` UI boleh dibangun paralel (Week 4 awal), tapi tidak bisa terhubung ke data riil sebelum Forecast engine (Hari 21) selesai.
