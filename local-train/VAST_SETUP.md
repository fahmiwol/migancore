# Pilot training di Vast.ai — panduan eksekusi

Disiapkan 2026-07-27 setelah RTX 3060 6 GB terbukti **tidak sanggup** (lihat
`CATATAN_PILOT_20260727.md`). Recipe LOCKED **tidak berubah** — hanya parameter eksekusi.

> **Revisi 2026-07-27 (sesi eksekusi).** Tiga koreksi ditemukan SEBELUM instance disewa;
> ketiganya akan membakar jam sewa kalau tidak ketahuan. Rinciannya di §Koreksi di bawah.

## Kenapa pindah ke GPU besar

| | laptop RTX 3060 6 GB | Vast RTX 5090 32 GB |
|---|---|---|
| LoRA r=64 / 7 modul | 132,1 M param — **tidak muat nyaman** | muat santai |
| `max_seq_len` | 512 (terpaksa; 33% replay terpotong) | **1024 — replay UTUH** |
| Kecepatan | ~200 dtk/langkah, tumpah 1–1,85 GB ke RAM | tanpa tumpahan |
| Estimasi 501 langkah | **~28 jam** | **~15–25 menit** |
| Biaya | — | **~$0,30–0,60** |

Keuntungan terbesar bukan kecepatan, melainkan **`max_seq_len` kembali 1024**: kompromi
memotong replay yang terpaksa diambil di laptop jadi tidak perlu.

## 1. Sewa instance

Pilih **RTX 5090 (32 GB)** atau setara **≥24 GB**, ~$0,40/jam. Jangan pilih yang termurah
dengan VRAM kecil — satu jam terbuang karena OOM lebih mahal daripada selisih sewanya.

- Template: **PyTorch (cuda 12.x)** — apa pun yang sudah punya torch+CUDA
- Disk: **≥60 GB** ⚠️ (naik dari 40 GB — lihat Koreksi #2)
- Port SSH terbuka

## 2. Kirim paket

Dari laptop:
```bash
scp -P <PORT> ./local-train/pilot_paket.tgz root@<HOST>:/workspace/
```
Buat ulang paket bila perlu, dari `./local-train`:
```bash
tar -czf pilot_paket.tgz data/pilot_irrelevance scripts/02_train_lora.py \
  scripts/vast_pilot_pipeline.sh configs/vast_gpu_besar.json eval/eval_gate.py \
  eval/eval_3axis.py eval/eval_stats.py eval/probes_v2.json \
  eval/gate_0.4_baseline_LOKAL_v2.json
```

## 3. Jalankan — satu perintah

```bash
cd /workspace && mkdir -p local-train && tar -xzf pilot_paket.tgz -C local-train
bash local-train/scripts/vast_pilot_pipeline.sh 2>&1 | tee /workspace/pipeline_console.log
```

Pantau dari terminal lain (**jangan** lewat `grep | tail` — pipe menahan output sampai
proses selesai, kamu jadi buta terhadap progres):
```bash
tail -f /workspace/local-train/PIPELINE_STATUS.txt
```

Skrip menjalankan 8 tahap berurutan dan **berhenti sendiri** bila ambang meleset:

| tahap | ambang yang diperiksa MESIN |
|---|---|
| 1 preflight | VRAM bebas ≥22 GB · disk ≥45 GB — gagal MURAH sebelum unduh 8 GB |
| 2 dependensi | impor `transformers`/`peft`/`bitsandbytes` |
| 3 **smoke** | `132.120.576` param dilatih · token dilatih 30–90% |
| 4 training | 501 langkah · adapter wajib terbentuk |
| 5 **arsip adapter** | `adapter.tgz` + sha256 — **sebelum** tahap yang bisa gagal |
| 6 merge | fp16 + `merge_and_unload` |
| 7 GGUF | f16 → **Q4_K_M** (wajib, samakan dengan baseline) |
| 8 checksum | sha256 untuk verifikasi pasca-unduh |

Smoke **tidak boleh dilewati**: empat cacat sesi lalu semuanya ketahuan di sini dalam
hitungan menit, bukan setelah berjam-jam.

## 4. Ambil hasilnya SEBELUM instance dimatikan

Urut — adapter dulu, itu yang tak tergantikan (GGUF selalu bisa dibuat ulang darinya):
```bash
scp -P <PORT> root@<HOST>:/workspace/adapter.tgz .
scp -P <PORT> root@<HOST>:/workspace/migancore-pilot.q4_k_m.gguf .
scp -P <PORT> root@<HOST>:/workspace/local-train/PIPELINE_STATUS.txt .
```
⚠️ **Cocokkan sha256 sebelum menghapus instance.** F-091: unduhan besar pernah rusak
diam-diam dan kerusakannya baru ketahuan jauh kemudian.
```bash
sha256sum -c <<< "$(grep q4_k_m PIPELINE_STATUS.txt | tail -1)"
```

## 5. Evaluasi (di laptop)

```bash
ollama serve                                     # lihat PULIHKAN_LAYANAN.md
ollama create migancore:pilot14-irrelevance -f Modelfile.pilot14
python local-train/eval/eval_gate.py --model migancore:pilot14-irrelevance \
  --baseline local-train/eval/gate_0.4_baseline_LOKAL_v2.json
```
`Modelfile.pilot14` sudah **diverifikasi identik** (TEMPLATE + 5 PARAMETER) dengan
`migancore:0.4-qwen3`. Itu bukan detail kosmetik: kalau sampler atau template berbeda,
McNemar mengukur perbedaan penyajian, bukan perbedaan training.

Gate otomatis memakai **McNemar berpasangan** karena baseline punya `probe_log`.

### Ambang sukses — dikunci SEBELUM training, jangan digeser sesudahnya

1. `irrelevance` **membaik signifikan** (McNemar p<0,05) dari basis **38/60**
2. **Tidak ada axis lain memburuk signifikan**, khususnya `route_positive` (52/52)

Syarat kedua bukan formalitas: metrik irrelevance gampang dicurangi — model yang berhenti
memanggil tool sama sekali akan skor sempurna di situ sambil merusak kemampuan aslinya
(hubungan terbalik yang dicatat Hammer). Karena itu penilaian **wajib** berpasangan di
semua axis.

**Hasil negatif adalah hasil yang sah** — itu menjawab apakah 4B merespons seperti 7B atau
seperti 1,5B (doc 73 §5d), dan menghemat cycle berikutnya.

## Koreksi yang ditemukan 2026-07-27 sebelum menyewa

1. **Adapter mendarat di tempat yang tidak di-tar runbook.** `02_train_lora.py` menyimpan
   ke `runs/<run_name>/adapter`, sementara langkah unduh menyuruh `tar adapters/` — folder
   yang tidak pernah ada. Field `output_dir` di config **tidak pernah dibaca script**.
   Di instance sewaan itu berarti tar kosong lalu instance dihapus = **hasil training
   hilang**. Field kini dihormati (default perilaku lama), plus penjaga: script keluar
   dengan kode 3 bila `adapter_model.safetensors` tidak terbentuk.
   Ini kelas bug F-034 — config yang diabaikan diam-diam.
2. **Disk 40 GB tidak cukup** bila merge+GGUF dikerjakan di instance: base 8 + merged 8 +
   gguf f16 8 + Q4 2,5 ≈ 27 GB di luar image. Dinaikkan ke **≥60 GB**.
3. **Merge+GGUF dipindah ke instance, bukan laptop.** Diukur: laptop hanya punya
   **4,4 GB RAM bebas** (merge fp16 butuh ~12 GB) dan **19,2 GB disk bebas** (puncak
   konversi ~16 GB). Jalur lokal akan gagal atau menyeret swap berjam-jam. Yang diunduh
   jadi GGUF 2,5 GB + adapter 130 MB, bukan merge lokal.

## Yang TIDAK boleh diubah di Vast

`r=64`, `alpha=64`, `lr=2e-4`, `3 epoch`, `target_modules` (7 modul termasuk MLP),
**NF4 4-bit**, dan **Q4_K_M** pada hasil akhir.

Godaan memangkas `target_modules` ke attention-saja itu nyata — 132 M → 47 M, muat di mana
saja. **Jangan.** Biderman (arXiv 2405.09673) mengukur attention-only *under-learn* di semua
rank; MLP adalah lokus utamanya. Dan arXiv 2410.21228 mengukur protokol berurutan seperti
kita: rank kecil justru **paling cepat melupakan**. Keduanya menukar kualitas yang baru
terlihat rusak beberapa cycle kemudian, saat sudah sulit dilacak sebabnya.

NF4 dan Q4_K_M dipertahankan bukan karena keterbatasan GPU sewaan, melainkan karena
**baseline memakainya**. Menaikkan presisi di sini akan mencampur efek data dengan efek
kuantisasi, dan pilot ini dirancang justru untuk mengisolasi yang pertama.

## Biaya

~$0,40/jam × ~1–1,5 jam (setup + unduh base + training + merge/GGUF) ≈ **$0,40–0,60**.
Matikan instance segera setelah adapter **dan** GGUF terunduh dan checksum-nya cocok.
