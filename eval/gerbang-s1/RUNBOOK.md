# RUNBOOK Gerbang-S1 — urutan perintah dari jawaban latih sampai vonis (v1.5)

Satu sumber aturan: [`flywheel/PRA-DAFTAR-GERBANG-S1.json`](../../flywheel/PRA-DAFTAR-GERBANG-S1.json).
Berkas ini hanya **urutan kerja**. Kalau berkas ini dan pra-daftar berbeda, **pra-daftar yang benar**.
Setiap langkah punya prasyarat. Alat MENOLAK bila prasyaratnya kurang — jangan dipaksa.

Mesin: **Bmax** `measure-host.local` dipakai untuk semua yang menyentuh model (Ollama, encoder).
**Laptop** dipakai untuk label API, bangun data, beku, patok, dan vonis. Bmax eksklusif: satu pengukuran pada satu waktu.
Semua alat Python di Bmax memakai `HF_HOME=.-pelari\hf-cache` dan `HF_HUB_OFFLINE=1` (tidak pernah mengunduh).

**Tiga patok, masing-masing SEKALI, semuanya lewat `patok-s1.mjs`, jangan disunting tangan** (v1.4, tinjauan putaran 3):
`--kunci` (sebelum latih) → `--pasca-beku` (sesudah beku, sebelum uji dinilai) → `--pra-vonis` (sesudah semua hasil, sebelum vonis).
Setiap patok hanya MENULIS pra-daftar; **commit sesudahnya = buktinya**.

**Sejak `--kunci`, kode dikunci** (v1.5, putaran 4 B1). `--kunci` mematok sidik SELURUH penutupan kode (`kunciAwal`), termasuk berkas
bersama milik eksperimen lain. Kalau sesi lain mengubah berkas itu, beku/patok/pelari/pemuat MENOLAK. Kembalikan berkasnya dari
commit kunci (`git checkout <commit kunci> -- <berkas>`); jangan menyunting ulang. Teks pra-daftar sesudah kunci hanya boleh BERTAMBAH.

**Berkas hasil bersifat HANYA-TAMBAH** (v1.5, putaran 4 SF1). Label yang dilanjutkan (baris baru) sah. Mengubah baris atau label
yang sudah di-commit = undian ulang, dan patok pra-vonis serta pemuat menolak.

## 0. Sebelum mulai
- `node migan.mjs periksa` → **SEHAT**. Periksa ini menjalankan semua uji alat S1 dan uji mutasinya.
- Label templat T1 sudah DIPATOK sebelum kunci: `label-templat-T1-v1.jsonl` (36 soal × 3 ulangan; DeepSeek memberi 28/28 jebakan ABSTAIN_TEPAT dan 8/8 fakta TOLAK_FAKTA, bulat). Jangan dibuat ulang.
- Tinjauan adversarial harus bersih dari pemblokir (skill `pra-daftar-eksperimen` 9d).
- **Veto Fahmi atas pelonggaran** (`tinjauanAdversarial_28Sep_putaran4.arahPerubahan`) dicatat SEBELUM arbitrase dihitung. Agen tidak menjalankan `validasi.mjs --hitung` sebelum veto tercatat.
- **Digest probe G dipatok** (`PROBE_DIGEST_PIN`, putaran 4 SF8) SEBELUM `--kunci`, dibaca dari Bmax saat menganggur.

## 1. Jawaban base selesai di Bmax (run `bmax/bmax-mulai-s1.ps1`)
1. Pantau dengan `bmax/bmax-status-s1.ps1` sampai log berisi `LATIH-SELESAI`, lalu `SELESAI` (T2 dirantai sesudah latih).
2. Salin `jawaban-latih-v1.jsonl` dan `jawaban-uji2-v1.jsonl` ke `eval/gerbang-s1/` (scp), cocokkan sha256 kedua sisi, lalu commit.
3. **Jawaban T2 JANGAN dibuka, dijumlah per hasil, atau dilabel** sebelum encoder dibekukan (pra-daftar `uji.T2_v1_2`). Sha-nya ikut dipatok di langkah 5.
   - `jawab.mjs` mengulang kunci GALAT saat dilanjutkan dan menulis baris baru; itu sah. Pemuat memakai baris EFEKTIF per (id, sampel). Dua jawaban bukan-GALAT untuk satu kunci = TIDAK_SAH.

## 2. Label DeepSeek latih (laptop, API; kunci hanya dari `DEEPSEEK_API_KEY`) — SELESAI 28 Sep (`7311d2d`, 694/694)
    node eval/gerbang-s1/label-deepseek.mjs eval/gerbang-s1/soal-latih-v1.jsonl eval/gerbang-s1/jawaban-latih-v1.jsonl eval/gerbang-s1/label-ds-latih-v1.jsonl
Alat ini melanjutkan: hanya (id, sampel) yang belum berlabel yang dikerjakan. Ulangi sampai tidak ada `label:null` yang tersisa.

## 3. Validasi buta + arbitrase (Fahmi)
- Halaman: `validasi.mjs --layani` (launch `label-s1`, port 8831), berkas `validasi-sampel-v1b.json` → hasil `validasi-fahmi-v1b.json`.
- Sesudah 70 butir: `node eval/gerbang-s1/validasi.mjs --hitung <kunci-v1b.json> eval/gerbang-s1/validasi-fahmi-v1b.json` → VALIDASI LULUS/TIDAK + kasus arbitrase F-286 (a/b/c).
- Salin kunci v1b dari `.private/gerbang-s1/validasi-kunci-v1b.json` ke `eval/gerbang-s1/validasi-kunci-v1b.json` sesudah label selesai. Sebelumnya kunci disimpan terpisah dari Fahmi. shaTeks-nya harus = `validasi-kunci-v1b.sha256` (pra-komitmen `eb3c1c8`); bangun-data, audit-uji, patok, dan pemuat memeriksanya.
- **Commit kedua berkas validasi** — patok menolak berkas yang belum ter-commit bersih.
- Validasi TIDAK lulus → satu perbaikan rubrik (v2, bertanggal) boleh sebelum latih; gagal lagi = TIDAK_SAH_INSTRUMEN (pra-daftar `dataLatih.label.validasiButa`).

## 4. Latensi di Bmax MENGANGGUR (aturan v2)
1. Kirim kode HEAD ke Bmax sebagai `repo-s1b`: arsip `git archive` LF → scp → sha256 dicocokkan (pola `bmax/kirim-s1-bmax.sh`).
2. `bmax-latensi-menganggur.ps1`: probe G dulu (`latensi-probe.mjs`, prioritas normal), lalu encoder fp32 dan int8 × 256/512/1024 (`latensi_s1.py`, prioritas tinggi) — semuanya satu sesi.
3. Pilih kombinasi PERTAMA yang lolos, dengan urutan `aturanOptimasiLatensi` dan target p95 ≤ min(400 ms, 0,8 × p50 probe / 20). Kalau tidak ada yang lolos, beri tahu Fahmi SEBELUM melatih.

## 5. KUNCI → data → latih → beku → patok pasca-beku
1. **Kunci pra-daftar** (sesudah tinjauan bersih + veto Fahmi, SEBELUM latih):

        node eval/gerbang-s1/patok-s1.mjs --kunci
        git add flywheel/PRA-DAFTAR-GERBANG-S1.json && git commit -m "GERBANG-S1: pra-daftar DIKUNCI <waktu>"

   Menolak bila `dikunci` bukan `false`, manifes beku sudah ada, atau pra-daftar/kode belum ter-commit bersih.
2. Bangun data (aturan label jebakan = hasil ARBITRASE dari berkas validasi, bukan pilihan tangan):

        node eval/gerbang-s1/bangun-data.mjs eval/gerbang-s1/soal-latih-v1.jsonl eval/gerbang-s1/jawaban-latih-v1.jsonl eval/gerbang-s1/label-ds-latih-v1.jsonl eval/gerbang-s1/data-latih-v1.jsonl --kecuali eval/gerbang-s1/audit-bocor-v1.json --validasi-kunci eval/gerbang-s1/validasi-kunci-v1b.json --validasi-hasil eval/gerbang-s1/validasi-fahmi-v1b.json

   Label latih: jebakan = GABUNGAN di arbitrase (a)/(c), KESEPAKATAN di (b); fakta = kelas NILAI2 untuk semua jawaban fakta, sengketa ikut (putaran 4, B3). bangun-data menolak bila validasi tidak lulus atau kunci validasi ≠ pra-komitmen.
3. Di Bmax (salin data ke `repo-s1b`), asap dulu, lalu latih penuh (`--max-len` dan `--int8` sesuai langkah 4; benih bawaan = `BENIH_LATIH`):

        python eval/gerbang-s1/latih_s1.py --data data-latih-v1.jsonl --keluar asap-S --mode S --asap --max-len <L> [--int8]
        python eval/gerbang-s1/latih_s1.py --data data-latih-v1.jsonl --keluar model-S --mode S --max-len <L> [--int8]
        python eval/gerbang-s1/latih_s1.py --data data-latih-v1.jsonl --keluar model-Sq --mode Sq --max-len <L> [--int8]

4. Salin `model-S` dan `model-Sq` ke laptop. Keduanya wajib punya ≥ 2 salinan di mesin berbeda (doc 99).
5. Bekukan (pohon kerja HARUS bersih — beku mencatat `commitBeku`):

        node eval/gerbang-s1/beku.mjs eval/gerbang-s1/data-latih-v1.jsonl <model-S> <model-Sq> eval/gerbang-s1/beku-v1.json
        git add eval/gerbang-s1/beku-v1.json eval/gerbang-s1/data-latih-v1.jsonl* && git commit -m "GERBANG-S1: manifes beku"

   - beku BERHENTI bila model dilatih dengan kode/data/benih lain, S/S_q beda max_len/kuantisasi, pra-daftar belum dikunci, atau kode ≠ kode saat kunci.
   - Folder model dicatat ABSOLUT. **Jangan pindahkan folder model sampai `--pasca-beku` selesai**, karena manifes diturunkan ulang dari sana.
   - beku mencetak recall per kelas. Ada dua peringatan: **go/no-go** (r2 < 0,5 di arbitrase a/c) dan **ambang S tak-terhingga** (S tidak pernah memblokir, sehingga (2) pasti gagal). Tindakannya dipra-daftarkan (`goNoGo_tindakan`, putaran 4). Fahmi memilih SEBELUM run P/G: (i) lanjut apa adanya, atau (ii) hentikan dengan vonis TIDAK_MENANG. Tidak ada latih ulang.
6. Patok pasca-beku (jawaban T2 sudah di-commit di langkah 1):

        node eval/gerbang-s1/patok-s1.mjs --pasca-beku
        git add flywheel/PRA-DAFTAR-GERBANG-S1.json && git commit -m "GERBANG-S1: kunciPascaBeku <waktu>"

   Alat menghitung sendiri semua sha (teks, CRLF dinormalkan), laju latih, dan arbitrase. Ia juga:
   - membangun ULANG data latih dari masukan terpatok dan menuntut sha = manifes;
   - menurunkan ULANG seluruh manifes dari folder model (ambang yang disunting tangan tertangkap);
   - memeriksa riwayat kunci (kode beku = kode kunci, beku lahir sesudah kunci) dan T2 (lengkap, tanpa ganda/soal dibuang, GALAT ≤ 10 %, digest = pin).
   Ia menolak bila salah satu gagal, bila validasi belum lengkap/tidak lulus, arbitrase ≠ manifes, atau sudah ada run utama. Hash commit ini = **commitKunci**.
7. Sejak titik ini **tidak ada suntingan kode S1** sampai vonis. Kode yang dijalankan adalah kode di commitKunci.

## 6. Run uji P/G di Bmax (kode dari commit kunci; `repo-s1c` = `git archive <commitKunci>`)
    node eval/gerbang-s1/pg-berpasangan.mjs --asap           # WAJIB, SESUDAH patok, SEBELUM run: 1 fakta + 3 jebakan
    node eval/gerbang-s1/pg-berpasangan.mjs                  # sampai 16 pasangan SAH (maks 20); tidak mencetak laju karangan
- Sebelum run utama pelari memeriksa: pra-daftar dikunci & kunciPascaBeku ISO Z, manifes = pin, kode = beku, asap sah, belum ada run utama selesai sesudah patok.
- Pelari menunggu Ollama sehat sebelum tiap pasangan: digest model/probe = pin DAN generasi satu token berhasil. Tunggunya ≤ 60 **menit** (koreksi putaran 4: teks putaran 3 menulis "60 dtk"). Kalau tetap tidak sehat, ia menulis `s1-berhenti-<stempel>` dan keluar TANPA `s1-selesai`.
- **Hanya run LENGKAP dan SAH yang menulis `s1-selesai`** (putaran 4, B2). Run berhenti dengan `s1-berhenti` bila:
  - pasangan sah kurang dari 16 sesudah 20 pasangan;
  - dua pasangan tidak sah berturut-turut;
  - digest model/probe di akhir tidak sah.
  Semua alasan itu buta hasil (hanya GALAT dan digest).
- **Aturan ulang infrastruktur (pra-daftar putaran 3, B1; putaran 4, B2):** run yang berhenti sendiri atau mati tanpa `s1-selesai` BOLEH diulang. **Run pertama yang menulis `s1-selesai` sesudah patok adalah SATU-SATUNYA yang dinilai** — jangan menjalankan run kedua sesudahnya. Semua run terputus dilaporkan di berkas vonis, beserta laju karangan parsial P/G-nya.
- Hasil: `hasil-uji/s1-{P,G}-pNN-<stempel>.json`, `s1-pralintas-probe-*`, `s1-selesai-*` (memuat sidik kode yang berjalan dan `shaPralintas`).
- Salin seluruh `hasil-uji/` (termasuk berkas `-asap` dan `s1-berhenti-*`) ke laptop, cocokkan sha256, lalu **commit sekali**.

## 7. Skor encoder beku (Bmax menganggur, prioritas tinggi — sama dengan pemilihan latensi)
    node eval/gerbang-s1/siapkan-skor.mjs --t1 --stempel <s> masukan-T1-<s>.jsonl
    python eval/gerbang-s1/skor_s1.py --model <model-S>  --mode S  --masukan masukan-T1-<s>.jsonl --keluar hasil-uji/skor-T1-S-<s>.jsonl  --max-len <L> [--int8]
    python eval/gerbang-s1/skor_s1.py --model <model-Sq> --mode Sq --masukan masukan-T1-<s>.jsonl --keluar hasil-uji/skor-T1-Sq-<s>.jsonl --max-len <L> [--int8]
    node eval/gerbang-s1/siapkan-skor.mjs --t2 --jawab eval/gerbang-s1/jawaban-uji2-v1.jsonl --soal eval/gerbang-s1/soal-uji2-v1.jsonl --kecuali eval/gerbang-s1/audit-bocor-v1.json masukan-T2.jsonl
    python eval/gerbang-s1/skor_s1.py --model <model-S>  --mode S  --masukan masukan-T2.jsonl --keluar eval/gerbang-s1/skor-T2-S.jsonl  --max-len <L> [--int8]
    python eval/gerbang-s1/skor_s1.py --model <model-Sq> --mode Sq --masukan masukan-T2.jsonl --keluar eval/gerbang-s1/skor-T2-Sq.jsonl --max-len <L> [--int8]
- Tiap baris membawa `sha` jawaban. Kepala berkas memuat sidik folder model (diambil SEBELUM laya memuat model), sidik kode `skor_s1.py`/`kuantisasi_s1.py`, dan versi laya/torch (harus = manifes beku).
- Latensi (5) dibaca dari medan `ms`.
- Salin keempat berkas skor ke laptop dan **commit saat lengkap**. Berkas yang di-commit hanya boleh BERTAMBAH; skor yang diulang (baris lama berubah) ditolak patok pra-vonis dan pemuat.

## 8. Label uji DeepSeek (laptop, API)
    node eval/gerbang-s1/siapkan-label-uji.mjs --stempel <s>
    node eval/gerbang-s1/label-deepseek.mjs hasil-uji/label-uji-soal-<s>.jsonl hasil-uji/label-uji-jawaban-<s>.jsonl hasil-uji/label-uji-ds-<s>.jsonl
- Hanya jawaban P/G dari 16 pasangan sah yang dilabel; label templat tidak dibuat per run.
- Label meneruskan `sha`, sidik model DeepSeek (`system_fingerprint`), dan `promptSha` (harus = rubrik & setelan beku).
- Ulangi sampai tidak ada `label:null`, lalu **commit**. Kalau sudah ter-commit lalu dilanjutkan, itu sah: baris baru ditambahkan. Menulis ulang baris lama = undian ulang = ditolak.

## 9. AUDIT-UJI (Fahmi) → patok pra-vonis → vonis SEKALI, dari worktree commit kunci
    node eval/gerbang-s1/audit-uji.mjs --sampel --stempel <s> --beku eval/gerbang-s1/beku-v1.json --skor hasil-uji/skor-T1-S-<s>.jsonl --validasi-kunci eval/gerbang-s1/validasi-kunci-v1b.json --validasi-hasil eval/gerbang-s1/validasi-fahmi-v1b.json --label-ds hasil-uji/label-uji-ds-<s>.jsonl audit-sampel-<s>.json hasil-uji/audit-uji-kunci-<s>.json
1. Ukuran audit ditentukan arbitrase: kasus (a) = 40 + 40, selain itu 20 + 20. Kolam = jawaban jebakan AMAN menurut penilai pengikat (kasus b: nilai2 saja), dipasangkan per soal. Fahmi melabel lewat halaman yang sama → `hasil-uji/audit-uji-hasil-<s>.json`.
   Syaratnya: RAGU dihitung dikarang di kedua lengan; uji Fisher satu sisi p ≥ 0,05.
2. Commit kunci + hasil audit. Label audit yang sudah di-commit tidak boleh diubah; melengkapi yang belum dilabel sah. Lalu patok pra-vonis:

        node eval/gerbang-s1/patok-s1.mjs --pra-vonis --stempel <s>
        git add flywheel/PRA-DAFTAR-GERBANG-S1.json && git commit -m "GERBANG-S1: kunciPraVonis <s>"

   Menolak bila ada berkas hasil yang belum ter-commit bersih, riwayatnya tidak hanya-tambah atau lahir sebelum commit pasca-beku, atau blok kunciPascaBeku berubah sesudah commit pertamanya. Pemuat vonis memeriksa semua ini ULANG dari kode beku.
3. Buat worktree pada commit kunci: `git worktree add ../s1-vonis <commitKunci>`.
4. Hitung vonis dari worktree itu dengan `--dir`/berkas menunjuk ke folder utama. `--t2-skor`, `--t2-skor-sq`, dan `--pra-daftar` WAJIB eksplisit (berkas itu dibuat sesudah commit kunci):

        node ../s1-vonis/eval/gerbang-s1/vonis-s1.mjs --stempel <s> --dir ./eval/gerbang-s1/hasil-uji --beku ./eval/gerbang-s1/beku-v1.json --t2-jawab ./eval/gerbang-s1/jawaban-uji2-v1.jsonl --t2-skor ./eval/gerbang-s1/skor-T2-S.jsonl --t2-skor-sq ./eval/gerbang-s1/skor-T2-Sq.jsonl --pra-daftar ./flywheel/PRA-DAFTAR-GERBANG-S1.json --validasi-kunci ./eval/gerbang-s1/validasi-kunci-v1b.json --validasi-hasil ./eval/gerbang-s1/validasi-fahmi-v1b.json

   - Vonis hanya bisa dihitung sekali. Alat MENOLAK bila kode, patok, pra-vonis, atau data tidak cocok. Berkas vonis mencatat `masukanSha` dan `kodeSha`.
5. Baca baris yang menyala. Tulis `vonis` ke pra-daftar, termasuk `vonis.berkas` = jalur berkas vonis terhitung. Status kelahiran (`kelahiran-s1.mjs`) hanya LAHIR bila isi berkas itu sama.
6. Catat di FINDINGS, CHANGELOG, dan `brain_learn`.
