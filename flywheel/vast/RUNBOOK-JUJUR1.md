# Runbook pasca-run jujur1 — 31 Agu 2026

> Ditulis SAAT run berjalan (instance 49335656), supaya tahap berikutnya tidak
> diimprovisasi. Tiap langkah punya syarat masuk; jangan lompat.

## 0. Saat peluncur selesai (PID 33528 berakhir)

Periksa yang mendarat:
- `models/v13/lora-gaya-jujur1.tgz` — adapter
- `models/v13/ringkasan-gaya-jujur1.json` — tier-1 harus SAHIH di dalamnya
- log `flywheel/vast/run-jujur1-31agu.log` (buffer baru flush saat proses exit)
- `vastai show instances` harus KOSONG (destroy-in-finally jalan). Kalau tidak
  kosong → `vastai destroy instance 49335656` MANUAL, catat sebagai cacat.

GAGAL di tahap ini → baca log, JANGAN ulang-sewa membabi buta.

## 1. Merge — komposisi 0.14 persis, gaya → gaya-jujur1

Pemenang grid 14k adalah bobot [1,1] (skor 18 vs 16 milik [1,1.3]), jadi grid
tunggal — hemat GPU:

```
python -u flywheel/vast/luncurkan_merge14.py migancore-uji-jujur1 hitung-promptragam,gaya-jujur1 --grid "[[1,1]]"
```

(`-u` WAJIB — pelajaran run ini: Start-Process membuffer stdout penuh, log 0
bita padahal instance sudah tersewa.)

Keluaran: `models/v14/migancore-uji-jujur1-q4_k_m.gguf` + `ringkasan-migancore-uji-jujur1.json`.

## 2. Daftarkan ke ollama — nama kandidat, BUKAN nomor

```
# Modelfile: salin models/v14/Modelfile.v14k, ganti baris FROM ke gguf baru
ollama create migancore:uji-jujur-1 -f models/v14/Modelfile.uji-jujur1
```

## 3. Tier-2 — ambang dari PRA-DAFTAR-V16-JUJUR, tidak ditawar

| gerbang | perintah | lulus |
|---|---|---|
| MENGARANG petak-40 ×5 | `node eval/uji-halusinasi.mjs migancore:uji-jujur-1 polos` ×5 | rata-rata ≤61% (menang ≤50%) |
| aritmetika | `node eval/uji-aritmetika.mjs migancore:uji-jujur-1` (dengan+tanpa) | ≥56/60 |
| tolak | `node eval/uji-tolak.mjs migancore:uji-jujur-1` | ≥9/10 |
| kenari | pembaca kenari | ≤1/12 |
| alat | `node eval/uji-alat.mjs migancore:uji-jujur-1` | total ≥79/90 setara 0.14 |
| fakta petak-40 | dari keluaran uji-halusinasi | tidak turun >1 dari 0.14 (5,40→≥4,4) |

Sub-skor 14-lama DILAPORKAN (jembatan C29).

## 4. Vonis → tulis SEGERA ke PRA-DAFTAR-V16-JUJUR.json

- SEMUA lulus → promosi `migancore:0.16` (MODEL_CHANGELOG + SANAD-16 + BERLAKU.json) → jalan 1.0 terbuka
- MENGARANG gagal → arsip kandidat, vonis "SFT 33 baris tidak cukup" → eskalasi RLVR (sudah ditulis di pra-daftar)
- regresi jatuh → periksa kategori; kalau alat → coba grid TIES lain SEBELUM menyerah

**Pelajaran V15 yang tidak boleh terulang: vonis ditulis ke berkasnya HARI ITU
JUGA — bukan cuma diumumkan.** `migan status` membacanya.

## Silsilah (untuk SANAD-16 nanti)

`Qwen3-4B-Instruct-2507 → adapter hitung-promptragam (v13) + adapter gaya-jujur1
(gaya-v13 200 + ajar-kejujuran 33, sidik 7bd51f3327560acf) → TIES [1,1] → GGUF
q4_k_m`. Cabang v12 (2 mata dhaif: konversi-gguf & runtime-lora era Ollama 0.32)
BERADA DI LUAR silsilah ini — jalur itu ditinggalkan sejak v13.
