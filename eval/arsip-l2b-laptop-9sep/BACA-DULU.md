# Arsip: percobaan L2b pertama (laptop), 9 Sep 2026 — DIPINDAH, bukan dibuang

Berkas di folder ini **sengaja dikeluarkan** dari `eval/` supaya
`eval/vonis-l2b.mjs` dan `bacaPapan()` tidak membacanya. Keduanya memilih berkas
lewat awalan nama di `eval/`, jadi memindahkannya sudah cukup — tidak ada berkas
yang disunting, tidak ada angka yang berubah.

## Kenapa dipindah

| putaran | sah | angka |
|---|---|---|
| bersih p1 | **YA** | MENGARANG 17,9 % · fakta 0,250 · over-refusal 25,0 % |
| bersih p2 | tidak | 27/36 `TypeError: fetch failed` |
| bersih p3, plasebo p1–3, penuh p1–3 | tidak | 36/36 galat |

Delapan putaran TIDAK SAH tidak membawa informasi apa pun — Ollama di laptop
berhenti ±16:39Z dan sisanya hanya membuang waktu koneksi.

Yang menentukan justru **`bersih p1`, yang SAH**. Ia tidak boleh ikut
dirata-ratakan dengan run Bmax, dua sebab:

1. **Mesin berbeda.** Preseden proyek ini memperlakukan Bmax sebagai
   REPLIKASI yang dilaporkan terpisah, bukan putaran tambahan — A3b (laptop
   32,1 %) dan A3d (Bmax 34,3 %) tetap berdiri sendiri. Menggabungkan satu
   putaran laptop ke tiga putaran Bmax akan menggeser rata-rata DAN n tanpa
   ada yang menuliskannya (C29).
2. **Generasi korpus berbeda.** p1 membaca indeks 16:30Z (26.209 potongan);
   run Bmax membaca 16:47Z (26.264). `periksaGenerasiKorpus()` akan menandainya,
   tapi lebih baik tidak menciptakan masalah yang harus ditandai.

## Kalau nanti dibutuhkan

Angka `bersih p1` tetap sah sebagai **pengamatan tunggal** dan boleh dikutip
sebagai itu — dengan menyebut n=1 terhadap sd acuan 5,44, yang berarti ia tidak
bisa membedakan apa pun. Pra-daftar mengunci minimum 2 putaran sah per lengan.

Bukti kegagalannya juga ada di `eval/l2b-semua.log` dan commit `df189a1`.
