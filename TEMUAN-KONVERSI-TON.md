# TEMUAN: bukan "aritmetika rusak" — satu operasi yang dihafal sebagai NARASI

> 21 Agu 2026. Ditemukan sesudah gerbang veto dibersihkan dari pencemaran.
> Setiap kalimat sebab di bawah ditempeli kutipan jawaban aslinya, sesuai
> aturan yang lahir dari kesalahan saya sendiri hari ini.

---

## 1. Klaim lama saya BATAL

Sepanjang hari ini saya berpegang pada: *"melatih model pada data kami menggerus
kemampuan berhitungnya, p=0,0006."* Angka itu diukur dengan gerbang yang
**tercemar** — tiga dari enam kunci jawabannya ada di data latih.

Dengan sepuluh soal bersih (kunci diverifikasi tidak ada di korpus):

| Model | suhu 0 | suhu 0,3 | total |
|---|---|---|---|
| `0.4-qwen3` (tak tersentuh) | 27/30 | 25/30 | **87%** |
| v10-4B | 24/30 | 24/30 | **80%** |
| **v11-4B** | 24/30 | 24/30 | **80%** |

**v11 vs `0.4-qwen3`: +7%, p=0,4632 — belum terbukti beda.**

Jadi **tidak ada kerusakan aritmetika umum.** Klaim itu saya cabut.

---

## 2. Tapi agregatnya menyembunyikan hal yang jauh lebih penting

| Jenis soal | `0.4-qwen3` | v10-4B | **v11-4B** |
|---|---|---|---|
| **ton × harga/kg** | 8/12 | 6/12 | **0/12** |
| diskon berantai | 12/12 | 12/12 | 12/12 |
| rata-rata berbobot | 12/12 | 12/12 | 12/12 |
| DP persen | 11/12 | 12/12 | 12/12 |
| selisih × kuantitas | 9/12 | 6/12 | **12/12** |

**v11 gagal 12 dari 12 pada satu jenis, dan sempurna 12 dari 12 pada jenis
lain.** Keduanya saling menghapus di total — itulah kenapa agregat berkata
"tidak ada beda". Uji per jenis: **ton-harga −67%, Fisher p=0,0013, NYATA.**

Pelajaran alat ukur: **membandingkan total saja bisa menghasilkan "tidak ada
apa-apa" padahal ada dua hal besar yang berlawanan.** Setiap perbandingan
selanjutnya wajib dipecah per jenis sebelum totalnya dipercaya.

---

## 3. Apa yang sebenarnya terjadi — kutipannya

**v11**, dua belas kali, kata demi kata sama di suhu 0 maupun 0,3:

> `Kupecah jadi langkah kecil: 1. Ubah ton ke kg: 19 ton : 10 = 1.900 kg.`
> `2. Kali harga per kg: 1.900 x 31.500 = Rp60.000.000. Hasilnya Rp60.000.000.`

Tiga kesalahan dalam satu jawaban: 19 ÷ 10 bukan 1.900; ton→kg bukan ÷10; dan
1.900 × 31.500 bukan 60.000.000. Kuncinya 598.500.000.

**`0.4-qwen3`** pada soal yang sama:

> `Karena 1 ton = 1.000 kg, maka: 19 ton = 19 × 1.000 = 19.000 kg`

**v10-4B** — cacatnya BEDA BENTUK, dan ini penting:

> `1 ton = 1.000 kg, jadi 19 ton = 19.000 kg. 19.000 kg : 1000 = 19 kg.`
> `19 x Rp31.500 = Rp600.000.`

v10 mengonversi dengan **benar**, lalu **membatalkannya sendiri** dengan langkah
tambahan yang tidak diminta. Bukan aturan yang salah — pelaksanaan yang kacau.

---

## 4. Bukan kami yang mengajarkan aturan salah itu

Data latih diperiksa:

- baris yang mengajarkan konversi **salah**: **0**
- baris yang mengajarkan konversi **benar** (`1 ton = 1.000 kg`): **116**

Jadi menambah contoh yang benar **bukan** obatnya — 116 contoh benar sudah ada,
dan modelnya tetap salah. Ini membunuh hipotesis "kurang data".

---

## 5. Sebabnya: yang dipelajari NARASINYA, bukan OPERASINYA

116 baris itu, dilihat bentuk jawabannya:

- pembuka jawaban unik: **48 dari 116**
- tiga templat teratas menutupi **54 baris (47%)**:
  - `"Kupecah jadi langkah kecil: 1. Ubah ton ke…"` — 20×
  - `"Sebelum menjawab, kuhitung dulu: 1. Ubah t…"` — 18×
  - `"Mari kuhitung pelan-pelan. 1. Ubah ton ke …"` — 16×

Bandingkan dengan jawaban gagal v11 di atas: **`"Kupecah jadi langkah kecil:
1. Ubah ton ke kg:"` — templat nomor satu, kata demi kata.** Model mereproduksi
kerangkanya dengan sempurna, lalu mengisinya dengan angka yang tidak dihitung.

**Ia menghafal cara MENCERITAKAN langkahnya, bukan cara MENGERJAKANNYA.**

Dan letak kegagalannya masuk akal dari situ: yang paling rusak justru operasi
yang **paling sering dinarasikan** di data kami. Kepadatan data tanpa keragaman
bentuk tidak mengajarkan operasi — ia mengajarkan naskah.

Ini kelas cacat yang sama dengan `C06 templat-abai-parameter` yang sudah dua
kali menjebak saya di sisi pembangkit data. Bedanya, kali ini ia terjadi di
dalam data latih itu sendiri: angkanya bervariasi, **kerangka kalimatnya
tidak** — dan kerangka itulah yang dipelajari.

---

## 6. Kenapa ini tidak terlihat sampai hari ini

Gerbang lama memakai `12 ton × Rp14.500/kg`, dan **Rp174.000.000 ada di data
latih**. Model menyebut angka yang benar sambil menunjukkan kerja yang omong
kosong — `"12 ton : 10 = 1.200 kg"` — dan dinilai BENAR.

Pencemaran tidak sekadar melambungkan skor. Ia **menyembunyikan cacat yang
persis ada di bawahnya.** Kalau soalnya tidak pernah diganti, cacat ini akan
ikut naik ke 8B, ke OMIGA, dan ke tangan orang lain.

---

## 7. Akibatnya untuk rencana v12

**H9 (data ulangan dari OpenMathReasoning) TIDAK jadi dikerjakan.** Alasannya
gugur: tidak ada kerusakan aritmetika umum yang perlu dipulihkan (empat dari
lima jenis 100%, agregat p=0,46). Menerjemahkan korpus Inggris untuk masalah
yang tidak ada itu pekerjaan berminggu-minggu yang sia-sia.

**Penggantinya — P1′: keragaman bentuk + langkah periksa.**

1. **Rombak baris fondasi hitung**: satu operasi tidak boleh punya kurang dari
   ~1 bentuk narasi per 3 baris. Ambang ini masuk `validasi-dataset.mjs`
   sebagai gerbang data, terukur, bukan imbauan.
2. **Wajibkan langkah periksa balik** di jawaban: sesudah hasil, satu kalimat
   yang menguji ulang lewat jalan lain (mis. `598.500.000 ÷ 31.500 = 19.000 kg
   = 19 ton ✓`). Yang dilatih menjadi kebiasaan memeriksa, bukan naskah.
3. **Perluas keluarga satuan** melampaui ton/kg — kuintal, gram, liter, meter —
   supaya yang dipelajari relasinya, bukan satu pasangan yang dihafal.

Perkiraan: ratusan baris buatan sendiri, semuanya bisa diverifikasi program.
Jauh lebih murah daripada H9, dan menyerang sebab yang benar-benar terukur.

---

## 8. Yang harus diperiksa ulang sesudah ini

Semua gerbang lain **belum** dipecah per jenis. Kalau agregat bisa menyembunyikan
0/12 di sebelah 12/12 pada aritmetika, ia bisa menyembunyikan hal yang sama di
gerbang alat, kias, dan kelemahan. Itu pekerjaan berikutnya, dan sampai selesai
angka agregat gerbang mana pun **belum boleh dipakai memutus.**
