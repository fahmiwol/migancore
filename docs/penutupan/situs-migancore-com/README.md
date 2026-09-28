# Situs migancore.com — penutupan 28 Sep 2026

Sumber tunggal halaman yang terpasang di `migancore.com` sejak penutupan MiganCore
([F-293](../../jarvis/FINDINGS_LOG.md), [doc 111 §6](../../jarvis/111_TUTUP_ATAU_BELOK.md)).
Keputusan menjalankan penutupan: Fahmi mendelegasikannya kepada agen pada 28 Sep ("kamu yang tentukan", "kamu otonom").

| Berkas | Isi | sha256 |
|---|---|---|
| `index.html` | Halaman pemberitahuan penutupan (ID + EN). Tanpa skrip dan tanpa aset luar. Menautkan laporan penutup publik (`migancore-research-method`, v1.3.0, bab 09). | `91554a4b92ed268e9dc3e1cb08772a396085507c85866a04eb0b2d0d49ae2eb2` |
| `index-lama-2026-08-25.html` | Halaman lama "MIGANCORE — Organisme Digital yang Tumbuh", persis seperti yang dilayankan sampai 28 Sep. | `a7aa1e6d409d067daab41ca135d6bb05b339b7fc4f9c32ae0425368c2ada9cd2` |

## Di server (VPS-2)

- Vhost `/etc/nginx/sites-enabled/migancore.com`: `root <server-root>/migancore-web; index index.html;`. Berkas statis, tanpa
  proxy dan tanpa `open_file_cache`, jadi penggantian berkas langsung berlaku **tanpa reload nginx**.
  Situs lain di VPS-2 tidak disentuh.
- `app.migancore.com` tetap 302 ke apex (`/etc/nginx/sites-enabled/migancore-sub-redirect`), tidak diubah.
- Arsip halaman lama: `<server-home>/arsip-migancore-web-20260928/index.html` (sha256 di atas). Salinan lain ada di repo ini
  dan di Bmax `.-arsip\situs-migancore-com-2026-09-28\`.

## Memasang ulang dan mengembalikan

Pasang (dari laptop): unggah ke `index.html.baru`, cocokkan sha256, lalu `mv` atomik. Skrip yang dipakai 28 Sep
berhenti bila berkas lama atau unggahan tidak cocok dengan sha yang diharapkan.

Kembalikan halaman lama (di VPS-2):

```bash
cp -a <server-home>/arsip-migancore-web-20260928/index.html <server-root>/migancore-web/index.html
```

## Verifikasi 28 Sep ±08:35Z (dari luar server; dipasang 08:34Z menurut stempel berkas di VPS-2)

- `http..com/` dan `https://www.migancore.com/`: judul "MiganCore — ditutup · closed", sha256 isi = berkas
  di atas.
- `https://app.migancore.com/`: 302 ke `http..com/`. `htt..com/`: 301 ke https.
- Ketujuh tautan di halaman menjawab HTTP 200. Tidak ada gulir horizontal di 330 px maupun 1280 px, dan tidak ada galat
  konsol.
