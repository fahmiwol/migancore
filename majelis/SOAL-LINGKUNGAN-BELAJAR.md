# Soal untuk majelis — rancang LINGKARAN DALAM lingkungan belajar

> Dikirim 7 Sep 2026 ke tiga kursi dari keluarga berbeda (Moonshot · OpenAI ·
> Codex-agen). Pertanyaan yang SAMA ke semuanya — nilai panel ada di
> pertentangannya, dan itu hilang kalau tiap kursi ditanya hal yang berbeda.
>
> Berkas ini disimpan supaya jawaban mereka bisa diaudit terhadap apa yang
> benar-benar ditanyakan, bukan terhadap ingatan saya tentangnya.

---

Kamu diminta merancang **lingkungan belajar** untuk sebuah model bahasa kecil.
Jawab sebagai insinyur yang harus mengeksekusinya minggu depan, bukan sebagai
penulis tinjauan pustaka.

## Keadaan nyata (angka ini terukur, bukan perkiraan)

Sebuah model 4B (basis Qwen3-4B-Instruct) berbahasa Indonesia, dilatih lanjut
dengan LoRA. Sumbu yang paling penting: **MENGARANG** — persentase pertanyaan
jebakan yang dijawab dengan percaya diri padahal seharusnya ditahan (tidak
terjawab / premis salah / konteks kurang / maksud ambigu / kedaluwarsa /
subjektif). Petaknya 36 soal, penilainya regex, pembungkusnya polos.

| Model | MENGARANG | catatan |
|---|---|---|
| model berlaku sekarang (4B) | **50,0 %** | 13 putaran, sd 5,22 |
| model yang sama + gerbang jebakan di lapisan serving | **36,5 %** | −13,5 pp **tanpa melatih apa pun** |
| generasi pertama model itu | 30,4 % | lebih jujur dari keturunannya |
| model stok 7B | 34,2 % | |
| model frontier (hosted) | **3,6 %** | fakta 100 %, over-refusal 0 % |
| model frontier lain (hosted) | 28,6 % di layar → **~4–7 % sesudah jawabannya dibaca tangan** | penilai kami melewatkan koreksi premis yang benar |

Sasaran: **≤ 36 %** (setara model dasar) untuk bisa disebut layak; jarak ke
frontier menunjukkan ~4–7 % bukan mustahil.

## Batas yang tidak bisa ditawar

1. **Anggaran GPU sangat kecil** — satu run latih ~USD 0,15–0,20, dan pemiliknya
   ingin angkanya NAIK DULU lewat riset/iterasi/percobaan, baru GPU dipakai untuk
   mengunci hasilnya. Bukan sebaliknya.
2. **Model inti harus tetap milik sendiri dan berjalan lokal** (4B di laptop).
   Model hosted boleh jadi guru/juri/pembanding, TIDAK boleh jadi penjawab harian.
3. **Kolam latih tidak boleh menyentuh petak ukur.** Ada gerbang otomatis untuk itu.
4. Ambang dikunci SEBELUM melihat angka hasil; menggeser ambang sesudah melihat
   hasil dianggap pelanggaran, bukan penyesuaian.

## Yang sudah ADA (jangan usulkan membangunnya lagi)

- Petak ukur 36 soal + penilai bersama + gerbang regresi 5 sumbu dengan anggaran
  kerusakan yang ditulis sebelum run.
- Gerbang jebakan di lapisan serving (probe keterjawaban terpisah dari penjawab).
- Pembuat data latih otomatis untuk abstensi & identitas, dengan gerbang
  keragaman dan gerbang "tiap baris harus lulus penilai kami sendiri".
- Panel juri model dari keluarga berbeda untuk sengketa.
- Kontrak masukan yang menahan GPU kalau data/resep/sidik tidak lulus.

## Batas alat ukur yang SUDAH kami ketahui (jangan diulang sebagai temuan)

- Penilainya regex, kosakatanya sempit. Terbukti: jawaban yang benar meleset
  hanya karena "bergantung" vs "tergantung", "belum memiliki" vs "tidak
  memiliki", "tidak keluar" vs "tidak pernah keluar".
- Ia buta dua arah: jawaban pendek → penolakan tak terbaca (angka terlalu
  tinggi); jawaban panjang → berhenti di sinyal pertama (terlalu rendah).
- Memperbaikinya sekarang akan menggeser acuan yang sudah dikunci, jadi ia
  dijadwalkan sesudah run berikutnya, dengan pengukuran jembatan.

## Yang diminta — empat pertanyaan, jawab yang kamu paling yakin

**A. Lingkaran dalam.** Rancang lingkaran iterasi yang menaikkan MENGARANG
**tanpa menyentuh GPU sama sekali**. Sebutkan langkahnya berurutan, dan untuk
tiap langkah: apa yang diubah, berapa lama satu putaran, dan bagaimana tahu ia
berhasil. Yang kami cari bukan daftar teknik, melainkan URUTAN dan KRITERIA
BERHENTI.

**B. Aturan berhenti.** Pemiliknya bilang "iterasi sampai angka tercapai, baru
train". Bahaya jelasnya: mengoptimalkan ke petak ukur sampai angkanya bagus tapi
kemampuan sebenarnya tidak berubah. Bagaimana membedakan kenaikan yang NYATA
dari kenaikan yang cuma mengepas petak? Apa aturan berhenti yang kamu tulis?

**C. Urutan yang salah.** Dari keadaan di atas, apa yang menurutmu KELIRU dari
urutan kerja kami — bukan yang kurang, tapi yang urutannya terbalik? Jawab
dengan tajam; kami lebih butuh koreksi daripada persetujuan.

**D. Satu percobaan berikutnya.** Kalau kamu hanya boleh menjalankan SATU
percobaan minggu ini, tanpa GPU, apa percobaannya? Sebutkan hipotesis, cara
mengukurnya, dan angka yang membuatnya disebut berhasil atau gagal.

Ringkas, konkret, boleh tidak setuju dengan pemahaman kami. Bahasa Indonesia.
