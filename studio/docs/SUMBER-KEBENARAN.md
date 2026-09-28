# Sumber kebenaran MiganCore — satu tempat untuk tiap jenis fakta

> Versi mesin-terbaca: [`studio/sumber-kebenaran.json`](../sumber-kebenaran.json). Keduanya harus sama;
> kalau berbeda, JSON yang dipakai agen dan Studio.
>
> **Aturan untuk semua agen dan manusia:** sebelum menulis atau mengutip fakta MiganCore, cari jenis
> faktanya di tabel ini. Tulis HANYA di jalur kanonik lewat alat penulisnya. Tempat lain boleh
> **menautkan**, tidak boleh **menyalin**. Berkas turunan dibangkitkan ulang, bukan disunting.

## Fakta riset dan model

| Pertanyaan | Jawabannya hidup di | Ditulis oleh | Dijaga oleh |
|---|---|---|---|
| Model mana yang berlaku? | `models/BERLAKU.json` | keputusan promosi tercatat | `migan periksa` |
| Dari mana model ini lahir? | `models/SANAD-*.json` | skrip lajur latihan & panen | `migan status` (bersambung / mata dhaif) |
| Silsilah lengkap semua generasi | **turunan** — `node flywheel/bangun-silsilah.mjs --ke <folder>` | pembangkit | 10 uji `--uji` |
| Hipotesis, ambang, ramalan, vonis | `flywheel/PRA-DAFTAR-*.json` | agen; dikunci **sebelum** data | `jaga-vonis`, `jaga-vonis-basi` |
| Angka pengukuran | `eval/hasil-*.json` | pelari ukur (`ukur-jujur2.mjs`, dll.) | tidak pernah disunting (C59) |
| Cara soal dinilai | `eval/petak-jujur2.mjs`, `eval/instrumen-jujur2.mjs` | — | uji instrumen; label instrumen wajib saat membandingkan |
| Temuan F-xxx | `docs/jarvis/FINDINGS_LOG.md` | agen, ditambahkan di akhir | — |
| Hukum C-xx | `PETA-DIAL-LATIH.md` | agen, ditambahkan di akhir | — |
| Kelas cacat & penjaganya | `eval/REGISTER-CACAT.json` | agen | `migan periksa` |
| Rencana & backlog | `docs/jarvis/96_BACKLOG_MENUJU_MAKSARA.md`, `93_RENCANA_MENUJU_BIBIT.md` | agen | status diturunkan dari vonis |
| Riwayat versi model | `docs/jarvis/MIGANCORE_MODEL_CHANGELOG.md`, `PETA-VERSI-MENUJU-BIBIT.md`, `SILSILAH-MODEL.md` | agen | — |
| Buku eksperimen | `docs/jarvis/EXPERIMENT_LEDGER.md` | agen | — |

## Catatan kerja

| Pertanyaan | Jawabannya hidup di |
|---|---|
| Apa yang berubah hari ini? | `docs/jarvis/CHANGELOG.md` |
| Jalannya satu riset | `riset/*/LIVING_LOG.md` |
| Serah terima antarsesi | `HANDOFF-*.md` (terbaru dulu) |
| Keputusan arsitektur Studio | `studio/docs/ARD.md` |
| Keputusan arsitektur estat | `<memory-dir>\BOOK\09-DECISIONS.md` |
| Pengetahuan lintas proyek | OMIGA (`brain_learn` + `<memory-dir>\BOOK\`) |
| Isi situs publik `migancore.com` (sejak 28 Sep 2026: pemberitahuan penutupan) | `docs/penutupan/situs-migancore-com/index.html`; cara pasang dan kembalikan ada di README folder itu |

## Data fisik

| Pertanyaan | Jawabannya hidup di |
|---|---|
| Di mana model, adapter, dataset, korpus? Berapa salinannya? | `docs/jarvis/99_SENSUS_DATA_MIGANCORE.md` (+ `98_PETA_DATA_BMAX.md`); versi mesin: `studio/data/sensus-*.json` (turunan) |
| Mesin mana untuk apa? | `studio/sumber-kebenaran.json` → `mesin` |

## Yang tidak pernah menjadi sumber tampilan

`.env*` · berkas kredensial · `KVM8-BACKUP\tier1*` (data pengguna nyata & rahasia) · transkrip sesi
`.claude/projects/*.jsonl`. Transkrip dan tulisan kerja Fahmi tidak diterbitkan; yang boleh tampil
adalah pernyataan tersintesis.
