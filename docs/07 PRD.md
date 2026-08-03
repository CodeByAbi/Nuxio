# 07. Product Requirements Document (Ringkasan Eksekutif)

**Status dokumen:** Ini adalah rangkuman eksekutif dari MVP Product Blueprint lengkap (dokumen sumber, 10 section + roadmap 32 hari). Detail acceptance criteria, edge case, dan technical notes per fitur ada di dokumen sumber — dokumen ini untuk keperluan onboarding cepat anggota tim baru, komunikasi ke stakeholder, atau referensi keputusan tanpa perlu membaca seluruh blueprint.

---

## Produk

**Financial Workspace** — aplikasi perencanaan keuangan berbasis kalender, untuk personal user dan pemilik usaha kecil.

**Value proposition:** "Rencanakan uangmu seperti kamu merencanakan jadwalmu — di kalender yang sama."

**Yang divalidasi MVP ini:** apakah *calendar-centric financial planning* — bukan dashboard/list seperti kompetitor (Money Manager, YNAB, Wallet by BudgetBakers) — membuat user lebih konsisten *merencanakan* kondisi keuangan, bukan sekadar mencatatnya setelah terjadi.

---

## Target User

| Segmen | Kebutuhan |
|---|---|
| Personal User | Income tetap/campuran, beberapa wallet (cash, bank, e-wallet), tagihan rutin bulanan |
| Small Business (1-3 anggota) | Visibilitas cashflow bisnis sederhana, terpisah dari keuangan pribadi, tanpa kebutuhan akuntansi formal |

Kedua segmen digarap bersamaan dalam satu MVP (bukan dua produk terpisah), dengan mitigasi arsitektur: skema data segmen-agnostic sejak awal, diferensiasi Business dibatasi ketat ke kategori berbeda + multi-member sederhana — **bukan** fitur akuntansi/invoicing.

---

## Scope Inti (Must Have)

1. **Workspace** — root entity, isolasi data, tipe Personal/Business
2. **Auth & Onboarding Wizard** — 5 langkah, 2 langkah terakhir (Budget, Tagihan Rutin) dibuat skippable untuk mengurangi drop-off
3. **Wallet** — sumber dana, saldo ter-cache
4. **Transaction** — data mentah yang menggerakkan semua fitur lain
5. **Financial Planning Calendar** — halaman utama (landing page), **bukan** Dashboard
6. **Budget** — layer di atas Calendar, bukan halaman laporan terpisah
7. **Goal** — target finansial dengan milestone di Calendar
8. **Forecast (rule-based)** — proyeksi saldo 30-60 hari, ditampilkan sebagai overlay di Calendar
9. **AI Copilot** — chat + 3 fungsi (Spending Analysis, Cashflow Prediction, Budget Recommendation)

**Prinsip penempatan fitur:** Budget, Goal, dan Forecast adalah *layer* di atas Calendar, bukan halaman berdiri sendiri — ini konsekuensi langsung dari keputusan bahwa Dashboard bukan halaman utama.

## Eksplisit Ditunda / Di Luar Scope

| Ditunda ke fase berikutnya | Di luar scope MVP ini sama sekali |
|---|---|
| Dashboard, CSV Import, Email Reminder | OCR Receipt, Bank Integration, Shared Wallet/Calendar, Investment Tracking, Team/Family Workspace penuh, Automation, integrasi pihak ketiga apa pun |

Payment gateway tidak aktif — monetisasi MVP dibatasi ke skeleton (flag plan, UI upgrade placeholder), keputusan trade-off eksplisit untuk menjaga fokus 32 hari ke validasi hipotesis produk, bukan kompleksitas billing.

---

## Keputusan Teknis Utama

| Keputusan | Alasan Ringkas |
|---|---|
| Next.js (App Router) monolith, bukan microservice | Overhead deployment/koordinasi tidak sepadan untuk tim 3 orang dan 32 hari |
| PostgreSQL + Prisma | Data finansial sangat relasional; foreign key constraint menjaga integritas lebih baik dari NoSQL |
| Forecast = rule-based, bukan ML | Cold-start data tidak memungkinkan model terlatih akurat dalam 32 hari |
| AI via Claude API + context builder server-side | Fine-tuning tidak realistis untuk timeline ini; agregasi di server mengontrol biaya dan mencegah AI menghasilkan angka yang kontradiktif dengan Forecast engine |
| Cron sederhana, bukan message queue penuh | Skala MVP belum butuh infra queue; migrasi relevan setelah user bertambah |

Detail lengkap arsitektur, ERD, dan request lifecycle ada di 16. System Design.

---

## Hipotesis Produk & Metrik Validasi

| Hipotesis | Metrik | Target Indikatif |
|---|---|---|
| Calendar-first meningkatkan frekuensi kembali dibanding dashboard angka | Weekly active workspace (dari yang selesai onboarding) | ≥ 35% |
| Budget/Goal/Forecast sebagai layer meningkatkan pemahaman dampak keputusan | Rata-rata entitas terjadwal di kalender per user/minggu | ≥ 3 |
| AI Copilot menurunkan friksi "tidak tahu harus mulai dari mana" | % sesi AI yang berlanjut ≥ 2 pertanyaan | ≥ 25% |
| — (kesehatan funnel, bukan hipotesis inti) | Onboarding completion rate | ≥ 60% |

**Catatan penting:** angka-angka ini adalah baseline untuk *diuji*, bukan target yang dijanjikan — 32 hari tidak cukup waktu untuk kalibrasi berbasis data riil.

---

## Prioritas Fitur (ringkasan MoSCoW)

**Must:** Workspace, Auth, Onboarding, Wallet, Transaction, Calendar, Budget, Goal
**Should:** Forecast (rule-based), AI Spending Analysis
**Could:** AI Cashflow Prediction, AI Budget Recommendation, Multi-member Business role
**Won't (fase ini):** Dashboard, CSV Import, Email Reminder

**Prinsip Kano yang perlu diingat saat prioritas bentrok dengan waktu:** Wallet/Transaction/Budget adalah *Basic* — harus flawless, bug di sini dianggap "produk belum jadi". AI Copilot adalah *Excitement/delighter* — kalau harus dipotong scope karena waktu, ini yang dipotong duluan, bukan fitur Basic.

---

## Risiko Utama (ringkasan, detail mitigasi di Section 8 Blueprint)

1. **Dual segmen mengaburkan hipotesis** → mitigasi: skema data segmen-agnostic, Business dibatasi ketat ke kategori + multi-member sederhana
2. **Onboarding 5 langkah berisiko drop-off tinggi** → mitigasi: 2 langkah terakhir skippable
3. **Calendar (XL) dan AI Copilot (XL) sama-sama kompleks, risiko molor bersamaan** → mitigasi: Calendar duluan (Week 2-3), AI Copilot belakangan (Week 4) — kalau overrun, AI yang dikurangi scope-nya
4. **Cold-start AI** (user baru tanpa histori membuat Cashflow Prediction/Budget Recommendation kosong) → mitigasi: AI wajib eksplisit mengakui keterbatasan data, bukan memaksakan jawaban generik
5. **Tim 3 orang tanpa dedicated PM/designer** → mitigasi: blueprint ini berfungsi sebagai keputusan final sebelum eksekusi — perubahan scope di tengah 32 hari harus melalui proses eksplisit, bukan diskusi ad-hoc harian

---

## Timeline Ringkas (32 Hari)

| Minggu | Fokus |
|---|---|
| 1 (Hari 1-7) | Foundation — setup, skema DB, Auth, Onboarding Wizard |
| 2 (Hari 8-14) | Wallet, Transaction, Calendar skeleton |
| 3 (Hari 15-21) | Calendar depth (recurring bill), Budget, Goal, Forecast v1 |
| 4 (Hari 22-28) | AI Copilot, fitur segmen Business, polish UI |
| 5 (Hari 29-32) | Hardening, regression testing, deployment, dokumentasi |

Detail harian per role (Engineer A/B/C) ada di Section 10 Blueprint.

---

## Definition of Done (ringkasan)

MVP dianggap selesai bila:
- Semua Core Feature berfungsi end-to-end tanpa workaround manual
- Isolasi data antar Workspace teruji eksplisit (bukan asumsi)
- 3 fungsi AI teruji dengan skenario cold-start dan user berhistori
- QA end-to-end dilakukan untuk **kedua** tipe Workspace (Personal dan Business), bukan hanya salah satu
- Pipeline staging→production otomatis, tanpa secret ter-hardcode

Checklist lengkap per kategori (Produk, Frontend, Backend, Database, API, AI, Testing, Deployment, Dokumentasi) ada di Section 9 Blueprint.

---

## Dokumen Terkait

| Dokumen | Isi |
|---|---|
| MVP Product Blueprint (sumber) | Detail penuh 10 section: vision, scope, MoSCoW/RICE/Kano, breakdown fitur, user flow, IA, technical scope, risiko, DoD, roadmap harian |
| 14. Frontend Specification | Struktur proyek, komponen per halaman, state management, strategi cluttered calendar day |
| 15. UI Design System | Prinsip visual, skema warna semantik, tipografi, komponen shadcn/ui, copywriting |
| 16. System Design | Arsitektur monolith, ERD lengkap, request lifecycle kritis (Transaction→Forecast, AI Copilot→Claude API) |

**Prinsip lintas dokumen yang berulang dan penting diingat:** Calendar adalah pusat gravitasi produk — bukan Dashboard. Forecast dan AI Copilot adalah *layer* di atas Calendar, bukan halaman/laporan berdiri sendiri. AI tidak pernah menghitung ulang forecast sendiri (hanya menarasikan), dan tidak pernah mengeksekusi aksi tulis data secara otomatis.
