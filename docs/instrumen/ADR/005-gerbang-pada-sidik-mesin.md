# ADR-005 — Gerbang membandingkan sidik mesin, bukan alamat jaringan

**Status:** Diterima · 2026-09-10
**Konteks episode:** F-225

## Konteks

Mesin ukur Bmax dinyalakan ulang dan DHCP menggesernya `laptop.local` →
`measure-host.local`. Semua skrip, dokumen, dan memori menyebut `.78`, jadi **mesin
yang sehat terbaca "mati" di setiap pemeriksaan** — port 22, 3389, 445, dan
11434 semuanya "tertutup", padahal Ollama hidup dan menjawab dengan 12 model
lengkap.

Gerbang pengukuran menolak berangkat karena `host` di berkas pratinjau tidak
cocok. Penolakannya **benar secara niat** (jangan campur dua mesin) tapi **salah
secara ukuran** (yang dibandingkan alamat, bukan mesin).

## Keputusan

Gerbang membandingkan **sidik mesin**: daftar model + versi Ollama, diringkas
jadi cap seperti `12m-303d5f0f-0.33.2`. Alamat IP turun jadi sekadar titik mulai
yang bisa ditimpa `OLLAMA_HOST`.

## Kenapa sidik ini cukup

Empat dari dua belas model di mesin itu adalah `migancore:*` — bangunan kami
sendiri, dengan digest yang tidak ada di mesin lain mana pun. Daftar itu praktis
tidak bisa bertepatan secara kebetulan.

## Yang ditolak, dan kenapa

- **Mengganti `.78` jadi `.17`.** Ditolak: menunda kejadian berikutnya. Sewa DHCP
  akan berganti lagi.
- **Alamat statis di router.** Perbaikan yang benar di lapisan jaringan, tapi ia
  di luar repo, tidak bisa diuji dari sini, dan tidak menolong kalau mesinnya
  pindah jaringan.
- **Nama host / mDNS.** Lebih baik daripada IP, tapi ia masih **nama**, bukan
  identitas. Mesin lain bisa memakai nama yang sama.

## Konsekuensi

- Berkas vonis pratinjau yang menyebut alamat lama **diamandemen bertanggal
  dengan buktinya**: `host` diperbarui, alamat lama disimpan sebagai `hostLama`,
  alasan sahnya ditulis, dan **tidak satu pun angka pengukuran disentuh**
  (`terlama 811`, `gagal 0`).
- Pratinjau lama tanpa medan `mesin` tetap ditolak kalau host-nya berbeda — ia
  tidak punya sidik untuk membantahnya, dan menganggapnya sama akan menebak.

## Apa yang membuat keputusan ini salah

Kalau dua mesin di jaringan yang sama sengaja disinkronkan modelnya (mis. mesin
cadangan), sidiknya akan identik padahal kecepatannya berbeda — dan kecepatan
mengubah berapa soal yang lewat batas waktu. Sinyalnya: mesin kedua dibeli.
Perbaikannya: tambahkan tolok kecepatan ke sidiknya.

## Cara membatalkan

Kembalikan pemeriksaan `v.host !== host` di `eval/jalankan-a3-base.sh`. Ia akan
menolak setiap kali DHCP berganti, seperti sebelumnya.
