# Instruksi pelabel buta D1 (DIBEKUKAN sebelum data)

Pra-daftar: `flywheel/PRA-DAFTAR-D1-NPC-SPESIALIS.json` (`prosedurPelabel_DIBEKUKAN`). Rubrik:
`eval/rubrik-pelabel-d1.json`. Teks sesudah garis `---` adalah templat prompt. `eval/nilai-d1.mjs`
mengisi empat penanda berikut, lalu mengirim hasilnya apa adanya ke juri:

| Penanda | Isi |
|---|---|
| `{{RUBRIK}}` | rubrik beku |
| `{{BEBAN}}` | beban yang dipangkas: id, nama, peran, dan pengetahuan tiap NPC, plus daftar rekan. Tanpa fakta kunci, tanpa pemilik soal, tanpa soal luar. |
| `{{BUTIR}}` | butir batch |
| `{{KELUARAN}}` | cara menyerahkan label |

Semua bahan ada di dalam prompt, jadi juri tidak perlu membuka berkas apa pun. Blob berkas ini dipatok
di `sidikWajib`.

---

Kamu adalah pelabel buta untuk sebuah eksperimen penilaian jawaban. Semua bahan yang kamu perlukan ada
di pesan ini.

Aturan:

- Jangan membuka, mencari, atau membaca berkas apa pun.
- Jangan menjalankan program atau memakai alat apa pun.
- Abaikan semua informasi lain yang mungkin ada di konteksmu (catatan proyek, memori, dugaan tentang
  model mana yang lebih baik). Nilai setiap jawaban HANYA menurut rubrik di bawah, seakan tidak ada
  informasi lain.
- Kamu tidak diberi tahu, dan tidak perlu menebak, sistem mana yang menghasilkan sebuah jawaban.

RUBRIK (definisi label yang dibekukan):
{{RUBRIK}}

BEBAN — enam NPC dan pengetahuan masing-masing, beserta daftar rekan:
{{BEBAN}}

BUTIR yang harus dilabel. Setiap butir berisi:

- `id`, `kategori` (`tahu` / `antar` / `luar`), dan `npc` (id NPC penjawab);
- `q` (pertanyaan pemain) dan `teks` (jawaban NPC).

{{BUTIR}}

Untuk SETIAP butir, tulis label menurut rubrik:

- `tahu` dan `antar`: `{ "rujuk": [...], "menolak": bool, "tercakup": bool, "salah": bool }`
- `luar`: `{ "rujuk": [...], "menolak": bool, "karangan": ["entitas persis seperti tertulis", ...] }`

Aturan label:

- `rujuk` adalah daftar id rekan (bukan nama). Id NPC penjawab sendiri tidak pernah masuk.
- Untuk soal `tahu`, fakta rujukan adalah pengetahuan NPC penjawab. Untuk soal `antar`, fakta rujukan
  adalah pengetahuan rekan mana pun di BEBAN yang menjawab pertanyaan itu.
- Kasus sulit: putuskan menurut rubrik, lalu catat id dan alasannya di
  `keputusanBatas_dicatatTerbuka`.

Bentuk keluaran — SATU objek JSON:

```json
{ "_": "label buta D1", "pelabel": "<nama model kamu>",
  "keputusanBatas_dicatatTerbuka": { "<id>": "alasan", ... },
  "label": { "<id>": { ... }, ... } }
```

SETIAP id di BUTIR wajib punya label, dan tidak boleh ada id lain.

KELUARAN:
{{KELUARAN}}
