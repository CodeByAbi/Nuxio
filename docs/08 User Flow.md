# 08. User Flow

**Status dokumen:** Melengkapi 07. PRD (ringkasan eksekutif) dan merinci Section 5 (User Flow) serta Section 6 (Information Architecture) dari MVP Product Blueprint. Diagram alur ada di percakapan terkait; dokumen ini berisi penjelasan, keputusan desain, dan edge case yang menyertai setiap tahap.

---

## 8.1 Alur Utama: Registrasi sampai Calendar

Lihat diagram "user_flow_onboarding_ke_calendar".

### Tahapan

1. **Register** — email + password. Tidak ada OAuth pihak ketiga di MVP (Section 7 Blueprint, Deferrable).
2. **Onboarding wizard**, 5 langkah berurutan:
   - Pilih tujuan penggunaan (Personal/Business) → buat Workspace
   - Input Wallet pertama
   - Input saldo awal
   - Input Income (jumlah + jadwal) — **wajib**, tidak skippable
   - Input Budget (opsional) dan Tagihan Rutin (opsional) — **keduanya skippable**
3. **Masuk ke Financial Planning Calendar** — landing page, bukan Dashboard.

### Keputusan kritis: kenapa dua langkah terakhir skippable

Onboarding 5 langkah berurutan adalah titik drop-off tertinggi di seluruh funnel (Section 5 Blueprint, catatan kritis). Income tetap wajib karena Forecast tidak bisa berjalan sama sekali tanpanya — bahkan versi minimal (Section 4.7: "Forecast tetap jalan hanya dari income + recurring bill terjadwal" mengasumsikan income sudah ada). Budget dan Tagihan Rutin, sebaliknya, boleh kosong di awal karena Calendar tetap bisa dilihat (walau minim) dan user dapat mengisinya secara progresif kemudian.

**Ini bukan penyimpangan dari brief** — hanya penyesuaian urgensi di dalam alur yang sama, seperti dicatat eksplisit di Section 5 Blueprint.

### Edge case pada tahap ini

| Situasi | Penanganan |
|---|---|
| User mencoba membuat Workspace kedua sebelum menyelesaikan onboarding Workspace pertama | Blokir, arahkan selesaikan dulu (Edge Case Section 4.1) |
| User keluar di tengah wizard (misal setelah langkah Wallet, sebelum Income) | Data yang sudah diisi tetap tersimpan; saat login kembali, wizard melanjutkan dari langkah terakhir yang belum selesai — bukan mengulang dari nol |
| User skip Budget dan Tagihan Rutin, lalu langsung lihat Calendar kosong | Calendar tetap tampil penuh (grid bulan), dengan catatan bahwa Forecast baru mencakup income yang sudah diisi (14. Frontend Specification, 14.5 Empty States) |

---

## 8.2 Alur Interaksi Harian: Calendar sebagai Pusat

Lihat diagram "user_flow_interaksi_harian".

Setelah onboarding selesai, **Calendar bukan salah satu dari banyak halaman — dia adalah tempat kerja utama**. Empat kelompok aksi berikut semuanya bisa dipicu dari Calendar, meski masing-masing juga punya halaman manajemen sendiri untuk operasi CRUD detail:

| Aksi | Dari Calendar | Dari halaman terpisah |
|---|---|---|
| Tambah Wallet | Tidak langsung — Wallet dikelola dari menunya sendiri | Halaman Wallet, kapan saja |
| Tambah Transaction | Ya, lewat `DayDetailPanel` saat tanggal diklik | Halaman Transaction — **wajib pakai komponen form yang sama** (14. Frontend Specification, 14.2), supaya data konsisten dari dua entry point |
| Kelola Budget dan Goal | Indikator ringan muncul di Calendar (progress bar, milestone badge) | Halaman Budget dan Goal untuk operasi detail |
| Lihat Forecast | Overlay garis proyeksi langsung di grid Calendar | Tidak ada halaman terpisah — ini keputusan sengaja (lihat 8.3) |

**AI Copilot** tidak masuk kelompok ini karena sifatnya berbeda: dia bukan halaman yang dituju, melainkan **entry point persisten** (floating button) yang tersedia dari halaman mana pun, membawa context halaman aktif — misalnya tanggal yang sedang dilihat di Calendar — sebagai bagian dari pertanyaan user (Section 6 Blueprint).

---

## 8.3 Kenapa Forecast Tidak Jadi Halaman Terpisah

Ini keputusan desain yang cukup mudah disalahpahami tim baru, jadi ditulis eksplisit di sini.

Forecast **secara filosofis** adalah layer di atas Calendar, bukan laporan berdiri sendiri (Section 6 Blueprint). Kalau Forecast diberi halaman grafik sendiri, itu justru menarik user keluar dari Calendar — kontradiktif dengan filosofi produk bahwa Calendar adalah satu-satunya tempat kerja.

**Implementasi yang benar:** toggle/overlay di Calendar yang menampilkan proyeksi saldo pada tanggal masa depan, ditambah satu ringkasan singkat di panel samping (bukan halaman grafik terpisah).

Prinsip yang sama berlaku untuk **Budget** dan **Goal**: keduanya tetap punya halaman manajemen sendiri untuk operasi CRUD yang butuh detail (menambah/mengubah/menghapus), tapi *representasi* dan *insight* utamanya selalu dikembalikan ke Calendar lewat indikator dan overlay — bukan halaman laporan yang berdiri sendiri.

---

## 8.4 Information Architecture (Ringkasan Navigasi)

```
[Sidebar Navigasi — persistent]
├─ Financial Planning Calendar   (landing page / home)
├─ Wallet
├─ Transaction
├─ Budget
├─ Goal
├─ Forecast              (opsional sebagai item sidebar — cukup toggle di Calendar, lihat 8.3)
├─ AI Copilot (Chat)     (floating entry point, BUKAN item sidebar biasa)
└─ Workspace
    ├─ Settings (nama, tipe — read-only setelah dibuat)
    ├─ Members (khusus Business — tidak tampil sama sekali di Personal)
    └─ Switch Workspace (jika user punya lebih dari satu)
```

**Catatan penting soal Members:** untuk Workspace tipe Personal, opsi undang anggota **tidak ditampilkan sama sekali** di UI — bukan disembunyikan lewat disabled state atau tooltip "khusus Business". Ini mencegah kebingungan kenapa fitur ada tapi tidak bisa dipakai.

---

## 8.5 Ringkasan Ketergantungan Alur

Beberapa bagian alur tidak bisa berjalan independen — ini menentukan urutan pengujian end-to-end nantinya:

- **Calendar** adalah *consumer* data dari Wallet, Transaction, Budget, Goal — dia tidak menghasilkan data sendiri. Kalau salah satu dari keempatnya kosong/error, Calendar tetap harus tampil (dengan empty state yang sesuai), bukan ikut gagal.
- **Forecast** bergantung pada Transaction, Wallet, dan recurring engine dari Calendar — tidak bisa diuji terpisah tanpa ketiganya berjalan lebih dulu.
- **AI Copilot Cashflow Prediction** bergantung penuh pada Forecast — dia tidak pernah menghasilkan proyeksi dari nol (lihat juga 16. System Design, 16.3 untuk alur teknisnya).
- **AI Copilot Budget Recommendation** bergantung pada Budget dan histori Transaction.

Urutan ketergantungan ini adalah dasar sequencing eksekusi 32 hari — fitur dengan dependency terpanjang (Calendar, Forecast, AI Copilot) mendapat alokasi waktu paling awal dan terbesar (lihat roadmap harian di Blueprint Section 10).

---

## Dokumen Terkait

| Dokumen | Isi |
|---|---|
| 07. PRD | Ringkasan eksekutif, scope, hipotesis, metrik |
| 14. Frontend Specification | Komponen `DayDetailPanel`, `TransactionForm` yang dipakai lintas entry point |
| 15. UI Design System | Pola visual empty state, warna semantik untuk indikator Calendar |
| 16. System Design | Request lifecycle teknis untuk Transaction dan AI Copilot yang disebut di dokumen ini |
