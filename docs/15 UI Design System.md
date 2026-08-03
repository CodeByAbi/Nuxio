# 15. UI Design System

**Asumsi kerja:** dokumen ini melengkapi 14. Frontend Specification. Stack styling: Tailwind CSS + shadcn/ui. Filosofi visual mengikuti prinsip produk di blueprint — calm, calendar-centric, tidak boleh terasa seperti dashboard trading/fintech yang agresif, karena produk finansial yang bikin user cemas gagal validasi hipotesis "planning bukan tracking" (Section 1 Blueprint).

---

## 15.1 Prinsip Desain

1. **Calendar adalah pusat gravitasi visual** — semua halaman lain (Wallet, Budget, Goal) adalah halaman manajemen sekunder untuk operasi CRUD detail, bukan tempat user "tinggal". Desainnya boleh lebih fungsional/plain; Calendar yang mendapat alokasi polish terbesar.
2. **Warna membawa makna, bukan dekorasi** — status finansial (aman/waspada/kritis) harus terbaca dari warna tanpa membaca teks, konsisten di semua halaman.
3. **Tenang, bukan mendesak** — hindari warna merah/urgent berlebihan untuk hal yang sebenarnya informatif, bukan darurat. Reserve merah murni untuk saldo negatif nyata atau Goal yang benar-benar terlambat.
4. **Kepadatan rendah, kejelasan tinggi** — sesuai Kano Model (Section 3), Calendar adalah Performance feature: makin baik integrasinya makin tinggi kepuasan, tapi ini dicapai lewat kejelasan info, bukan menjejalkan lebih banyak elemen visual per tanggal.

---

## 15.2 Skema Warna Semantik

| Peran | Token Tailwind (contoh) | Kapan dipakai |
|---|---|---|
| Aman / income / on-track | `emerald-600` (light), `emerald-400` (dark) | Saldo positif, Goal on-track, Budget di bawah 80% |
| Waspada | `amber-500` | Budget 80-99%, Forecast mendekati ambang, Goal mendekati deadline |
| Kritis | `rose-600` | Saldo negatif/proyeksi negatif, Budget melewati 100%, Goal terlambat |
| Netral/struktural | `slate-500` / `slate-200` (border) | Teks sekunder, border card, elemen non-status |
| Aksen interaktif (tombol utama, link) | `indigo-600` | CTA utama, elemen yang bisa diklik — **dipisah dari warna status** supaya "tombol biru" tidak tertukar makna dengan "status" |

**Aturan penting**: warna status (emerald/amber/rose) tidak pernah dipakai untuk tombol aksi biasa, dan sebaliknya warna aksen interaktif tidak dipakai untuk menandakan status finansial — supaya user tidak salah membaca tombol sebagai sinyal risiko atau sebaliknya.

Dark mode: semua token di atas punya pasangan varian lebih redup/gelap (`-400` alih-alih `-600` untuk fill dengan background gelap) supaya tidak neon — konsisten dengan prinsip "tenang, bukan mendesak" juga berlaku di dark mode.

---

## 15.3 Tipografi

- Font dasar: sans-serif sistem (`font-sans` Tailwind default, misal Inter) — tidak perlu font custom untuk MVP, ini bukan area diferensiasi produk.
- Skala: `text-sm` (14px) untuk label sekunder/subtitle, `text-base` (16px) untuk body, `text-lg`/`text-xl` untuk angka penting (saldo, progress), `text-2xl` khusus untuk headline saldo/proyeksi di Calendar (elemen paling penting di halaman paling penting).
- Bobot: hanya `font-normal` (400) dan `font-medium` (500) untuk sebagian besar UI; `font-semibold` (600) dibatasi untuk angka besar (saldo, target Goal) supaya tidak semua teks terasa berat.

---

## 15.4 Komponen Inti (shadcn/ui sebagai basis)

| Komponen shadcn/ui | Dipakai untuk |
|---|---|
| `Dialog` | `DayDetailPanel` (bisa sebagai slide-over/sheet variant), form tambah Wallet/Budget/Goal |
| `Sheet` | Alternatif Dialog untuk panel yang slide dari samping (lebih sesuai untuk `DayDetailPanel` yang muncul dari klik tanggal) |
| `Card` | `WalletCard`, `GoalCard`, ringkasan Budget |
| `Progress` | `BudgetProgressBar`, `GoalCard` progress bar |
| `Badge` | `EventBadge` di Calendar, status label (on-track/terlambat) |
| `Skeleton` | Loading state Calendar grid dan list, sesuai 14.5 |
| `Toast` (sonner) | Konfirmasi aksi (bukan kata "berhasil" — lihat 15.6 Copywriting) |
| `Tabs` | Switch antar tampilan jika dibutuhkan (misal filter kategori Transaction) |

**Kenapa shadcn/ui**: komponen ini di-copy langsung ke repo (bukan npm dependency yang di-update terpisah), jadi tim bisa kustomisasi warna/style sesuai token di atas tanpa terkunci ke versi library — penting untuk timeline 32 hari yang tidak punya slot waktu untuk debug breaking changes dari library UI pihak ketiga.

---

## 15.5 Pola Komponen Spesifik Produk

### DayCell (Calendar)
- Ukuran konsisten (aspect-square atau mendekati), tidak boleh berubah tinggi antar tanggal meski jumlah entri beda-beda (mencegah layout shift saat navigasi bulan)
- Maksimal 3 indikator dot per tanggal (lihat 14.4), warna dot mengikuti tipe (income = emerald, expense = default slate/netral kecuali melewati budget = amber/rose, bill = indigo muda, goal milestone = badge berbeda bentuk bukan cuma warna — supaya tidak mengandalkan warna semata untuk aksesibilitas)
- Tanggal hari ini mendapat outline/border berbeda (bukan warna fill berbeda, supaya tidak tertukar dengan status finansial)

### ForecastOverlay
- Garis proyeksi ditampilkan sebagai overlay tipis di atas grid (bukan chart terpisah), warna mengikuti status (emerald jika proyeksi tetap positif, transisi ke amber/rose mendekati dan melewati nol)
- Tanggal pertama proyeksi negatif (jika ada) mendapat marker visual eksplisit — ini insight paling bernilai dari Forecast (Section 4.7), jangan sampai tenggelam di keramaian visual Calendar

### ChatWindow (AI Copilot)
- Bubble AI dan bubble user dibedakan lewat posisi (kiri/kanan) dan warna latar (bukan warna status finansial — pakai `slate` netral untuk AI, `indigo` muda untuk user, supaya tidak konflik makna dengan skema warna status)
- Setiap klaim angka dari AI ditampilkan dengan sedikit visual "tertaut ke data" (misal small badge atau link kecil "lihat sumber") — mendukung Definition of Done AI: "jawaban bisa ditelusuri ke data riil"
- Disclaimer AI Budget Recommendation ("ini saran, bukan keputusan otomatis") tampil sebagai teks kecil `text-xs text-slate-500`, bukan warning box besar — supaya tidak terasa seperti peringatan bahaya padahal ini catatan biasa

### Empty state (pola umum semua halaman)
Ikon di atas, headline pendek (nama ruang kosongnya, bukan permintaan maaf), satu baris deskripsi, satu tombol CTA verb-first. Contoh pola:

```
[ikon]
Belum ada wallet lain
Tambah wallet kedua untuk memisahkan cash dan rekening bank kamu.
[Tambah wallet]
```

---

## 15.6 Copywriting

Konsisten dengan prinsip di Section 1 (produk yang menenangkan, bukan mendesak):

- **Sentence case**, bukan Title Case, di semua tombol/label/heading.
- **Verb-first pada CTA**: "Tambah wallet", bukan "Wallet baru" atau "Klik di sini".
- **Hindari kata "berhasil"** pada konfirmasi — toast cukup "Transaksi disimpan", bukan "Transaksi berhasil disimpan".
- **Tidak ada tanda seru** pada copy sistem (toast, label) — kesan tenang, bukan bersemangat berlebihan.
- **Bahasa orang kedua ("kamu")** untuk hal milik user: "Wallet kamu", bukan "Wallet saya" atau bentuk pasif kaku.
- **Disclaimer AI selalu eksplisit tapi tidak menakutkan** — "Ini saran berdasarkan pola pengeluaranmu, bukan keputusan otomatis" lebih baik daripada box peringatan besar berwarna merah.

---

## 15.7 Aksesibilitas Minimum (MVP-appropriate, bukan audit penuh)

- Kontras warna teks-background memenuhi minimum WCAG AA untuk teks body (bukan target AAA — di luar scope realistis 32 hari)
- Status finansial tidak pernah disampaikan lewat warna semata — selalu dipasangkan dengan bentuk/ikon/teks (misal Badge dengan label teks "Waspada", bukan cuma warna amber polos) untuk pengguna buta warna
- Semua elemen interaktif (`DayCell`, tombol) bisa difokus lewat keyboard (`Tab`) — komponen shadcn/ui sudah mendukung ini secara default selama tidak di-override dengan custom div tanpa semantik yang benar

---

## 15.8 Yang Sengaja Tidak Dibahas di MVP Ini

Sesuai prinsip Section 2 Blueprint (scope trade-off eksplisit), dokumen ini **tidak** mencakup:

- Design token untuk fitur Dashboard (karena Dashboard eksplisit ditunda ke fase berikutnya)
- Style guide untuk halaman payment/billing penuh (monetisasi MVP hanya skeleton UI upgrade, bukan alur pembayaran lengkap)
- Ilustrasi custom/branding penuh — MVP memakai ikon dari library standar (misal Lucide, yang sudah menjadi default pairing dengan shadcn/ui), bukan aset ilustrasi custom yang butuh waktu desain terpisah

Kalau ada kebutuhan menambah area ini pasca-MVP, ini masuk dokumen Design System v2, bukan revisi dokumen ini di tengah eksekusi 32 hari — konsisten dengan mitigasi Scope Creep di Section 8 Blueprint.
