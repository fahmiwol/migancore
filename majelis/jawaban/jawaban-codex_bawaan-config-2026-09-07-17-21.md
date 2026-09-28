# Jawaban codex (bawaan-config)

> soal: SOAL-LINGKUNGAN-BELAJAR.md · 60.7s · 6074 huruf
> Disimpan MENTAH. Ringkasan apa pun ada di tempat lain, bukan di sini.

---

Catatan dulu: panggilan awal ke Omiga Brain dibatalkan oleh tool, jadi jawaban ini tidak mengklaim membaca/mencatat Brain. Saya lanjut dari konteks yang Anda berikan.

Saya baca “menaikkan MENGARANG” sebagai **menurunkan angka MENGARANG**.

**A. Lingkaran Dalam**

Urutan saya:

1. **Bekukan kontrak eksperimen dulu**
   Yang diubah: bukan model, tapi protokol. Tulis sebelum jalan: metrik utama, metrik rusak yang tidak boleh lewat, ambang sukses, jumlah seed/run, dan set mana yang boleh dilihat.
   Lama: 1-2 jam.
   Berhasil bila tidak ada keputusan eksperimen yang bergantung pada angka akhir petak ukur 36 soal.

2. **Bangun “shadow trap set” di luar petak ukur**
   Yang diubah: tambah 100-200 soal jebakan saudara, bukan parafrase dekat dari 36 soal. Harus mencakup: premis salah, tidak cukup konteks, kedaluwarsa, ambigu, subjektif, identitas, dan fakta lokal.
   Lama: 0,5-1 hari.
   Berhasil bila tiap item punya label alasan tahan, expected behavior, dan lolos filter anti-kebocoran terhadap petak ukur.

3. **Trace kegagalan sistem sekarang**
   Yang diubah: logging, bukan perilaku. Simpan untuk setiap soal: skor probe keterjawaban, alasan probe, jawaban final, kelas jebakan, keputusan regex, dan label manual kecil.
   Lama: 2-4 jam.
   Berhasil bila 80-90% kegagalan bisa masuk ke kelas penyebab yang actionable, misalnya “probe benar tapi answerer melawan”, “probe salah”, “jawaban menolak tapi tidak terbaca evaluator”, “premis dikoreksi tapi format salah”.

4. **Kalibrasi gerbang serving di shadow set**
   Yang diubah: threshold, template abstensi, dan aturan routing antara probe dan penjawab. Bukan LoRA.
   Lama: 2-4 jam per putaran.
   Berhasil bila MENGARANG shadow turun minimal 5 pp, sementara fakta/over-refusal tidak rusak melebihi anggaran yang sudah ditulis sebelum run.

5. **Uji sibling invariance**
   Yang diubah: generator soal membuat 3-5 variasi semantik untuk setiap jebakan yang lolos, dengan permukaan bahasa berbeda.
   Lama: 0,5 hari.
   Berhasil bila perbaikan tetap muncul pada sibling baru, bukan hanya pada bentuk kalimat yang dipakai kalibrasi.

6. **Adjudikasi manual kecil, buta terhadap versi**
   Yang diubah: evaluasi, bukan sistem. Ambil sampel hasil versi A/B tanpa nama versi.
   Lama: 1-2 jam.
   Berhasil bila penilai manusia melihat penurunan konfiden-salah yang sama arahnya dengan regex.

7. **Baru sekali sentuh petak ukur utama**
   Yang diubah: jalankan konfigurasi kandidat pada 36 soal.
   Lama: <1 jam.
   Berhasil bila ≤36%, dan tidak ada sumbu regresi melewati anggaran.

Kriteria berhenti lingkaran tanpa GPU: berhenti saat **dua shadow set berturut-turut** membaik dengan arah sama, sibling invariance lulus, adjudikasi manual tidak membantah, dan konfigurasi/ambang sudah terkunci sebelum petak ukur utama dibuka.

**B. Aturan Berhenti**

Kenaikan nyata harus lolos tiga bukti:

1. **Transfer**
   Perbaikan muncul di set yang tidak dipakai menyetel threshold/template.

2. **Invariance**
   Soal saudara dengan maksud sama tapi redaksi berbeda tetap ditahan.

3. **Biaya terkendali**
   Abstensi tidak menelan soal fakta yang sebenarnya bisa dijawab.

Aturan berhenti yang saya tulis:

> Satu konfigurasi boleh masuk run final hanya jika, sebelum melihat petak ukur 36 soal, ia menurunkan MENGARANG minimal 5 pp pada shadow-dev dan minimal 3 pp pada shadow-holdout, dengan kenaikan over-refusal maksimal 2 pp dan kerusakan fakta maksimal 1 item absolut. Jika tiga putaran berturut-turut hanya membaik pada shadow-dev tapi tidak pada shadow-holdout/sibling, hentikan iterasi: itu fit ke petak kerja, bukan kemampuan.

Tambahan: jangan pakai 36 soal sebagai loop. Pakai sebagai **meterai**, bukan kompas.

**C. Urutan Yang Salah**

Yang menurut saya terbalik:

1. **Generator data diluluskan oleh penilai yang sama sebelum evaluator diperbaiki.**
   Ini berisiko mengajari model bentuk jawaban yang menyenangkan regex, bukan perilaku jujur. Karena evaluator memang sempit, data gate berbasis evaluator harus datang sesudah ada bridge/manual taxonomy, atau minimal disandingkan dengan juri semantik.

2. **Target angka ≤36% terlalu dekat dengan hasil serving gate 36,5%.**
   Dengan n=36, selisih 0,5 pp itu bukan target engineering yang sehat. Satu item saja bernilai 2,78 pp. Jadi “lulus” di 36% bisa berarti noise, bukan kemajuan.

3. **GPU disebut tahap mengunci hasil, tapi perilaku serving belum dipisah dari perilaku model.**
   Kalau gate sudah menurunkan 13,5 pp tanpa training, eksperimen berikut harus membuktikan dulu: masalah terbesar ada di model, probe, format jawaban, atau policy arbitration. Melatih sebelum dekomposisi itu mengunci campuran penyebab.

4. **Panel juri sengketa ada, tapi tampaknya ditempatkan setelah angka muncul.**
   Untuk task seperti ini, panel harus dipakai lebih awal untuk membuat label alasan tahan dan mengaudit contoh data, bukan hanya menyelesaikan dispute setelah skor.

**D. Satu Percobaan Minggu Ini**

Saya pilih: **A/B kalibrasi gerbang dengan shadow-holdout buta**.

Hipotesis:
Gerbang serving belum optimal; dengan kalibrasi threshold + template abstensi + aturan “probe menang atas answerer” untuk kelas jebakan tertentu, MENGARANG bisa turun dari 36,5% ke area ≤33% tanpa GPU dan tanpa merusak fakta.

Cara ukur:
- Buat 150 soal shadow: 100 untuk kalibrasi, 50 holdout buta.
- Kunci sebelum jalan:
  - threshold kandidat,
  - template tahan,
  - anggaran regresi,
  - kriteria sukses.
- Jalankan baseline current gate vs candidate gate pada shadow-holdout.
- Sampling manual buta 30-50 jawaban untuk cek apakah regex searah dengan manusia.
- Baru kalau lulus, jalankan sekali ke petak 36 soal.

Angka sukses:
- Shadow-holdout MENGARANG turun ≥5 pp.
- Over-refusal naik ≤2 pp.
- Fakta benar turun maksimal 1 item absolut.
- Manual adjudication setuju arah perbaikan pada ≥70% kasus yang berubah.
- Petak 36 soal dipakai sekali; disebut sukses bila ≤36%, tapi klaim “nyata” hanya sah kalau shadow-holdout juga lulus.

Kalau eksperimen ini gagal, jangan train. Itu berarti bottleneck belum cukup dipahami atau gerbang sudah dekat plafon manfaatnya.
