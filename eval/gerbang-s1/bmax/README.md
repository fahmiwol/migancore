# Skrip pelari Bmax — Gerbang-S1 (salinan apa adanya)

Skrip ini yang benar-benar dipakai untuk menjalankan Gerbang-S1 di Bmax, 27–28 Sep 2026. Disalin **verbatim** dari
scratchpad sesi. Isinya tidak dirapikan, supaya catatan ini tetap bukti cara run dijalankan. Tinjauan adversarial 28 Sep
#4 menemukan bahwa perintah pelari tidak pernah dikomit, sehingga tidak bisa dibuktikan apakah run T2 memakai `--kecuali`.

- Variabel `SC` di skrip `.sh` menunjuk folder scratchpad sesi 27–28 Sep. Untuk run ulang, ganti dengan folder kerja sendiri.
- Tidak ada kredensial di sini. Akses SSH memakai kunci `~/.ssh/bmax_key` milik laptop (jalurnya saja, bukan isinya).
- Semua alat Python di Bmax berjalan dengan `HF_HOME=.-pelari\hf-cache` dan `HF_HUB_OFFLINE=1`, jadi tidak
  pernah mengunduh (lihat `bmax-latensi-*.ps1`).

| Skrip | Fungsi |
|---|---|
| `kirim-s1-bmax.sh` | Arsip `git archive` LF dari HEAD → scp → cocokkan SHA-256 → pasang → mulai |
| `bmax-pasang-s1.ps1` | Ekstrak arsip ke `repo-s1`, jalankan `jawab.mjs --uji` di Bmax |
| `bmax-mulai-s1.ps1` | Cek mesin eksklusif; jalankan jawab latih (2 sampel), lalu T2 (2 sampel), keduanya dengan `--kecuali audit-bocor-v1.json`; lepas lewat WMI |
| `bmax-status-s1.ps1`, `awasi-s1.sh` | Pantau jumlah jawaban tiap 30 menit |
| `rantai-label-sampel1.sh` | Sampel-1 lengkap → label DeepSeek → sampel validasi buta |
| `bmax-latensi-*.ps1`, `bmax-jaga-prioritas.ps1`, `bmax-log-*.ps1`, `bmax-cek-latensi.ps1`, `bmax-henti-latensi.ps1` | Diagnostik latensi encoder: fp32/int8 × max_len (F-285) |
| `bmax-cek-t2.ps1` | SHA-256 soal T2 + audit di Bmax |
| `bmax-laya-*.ps1` | Pemeriksaan API paket laya di venv Bmax (baca-saja) |

Jalankan skrip `.ps1` dari laptop dengan `node flywheel/bmax.mjs --berkas <skrip.ps1>`.
