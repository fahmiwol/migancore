#!/usr/bin/env node
/**
 * pabrik-abstain — membuat CLUSTER LATIH untuk sumbu kejujuran: contoh menahan diri
 * yang jawabannya SPESIFIK, bukan penolakan template.
 *
 * ====================== KENAPA INI PENGHALANG V18 ======================
 * doc 88 §5 menyebutnya apa adanya: kami tidak punya bahan abstain sama sekali.
 * `cluster-keluar-rag` (554 baris) mengajarkan menjawab DARI catatan — bukan
 * menahan diri saat catatannya kosong, dan sumbu itulah yang paling rusak
 * (0.14 mengarang 51,4 % vs gen-1 31,4 %).
 *
 * ====================== KENAPA JAWABANNYA BISA DIPERCAYA ======================
 * Bahaya terbesar membuat data abstain adalah mengarang jawabannya sendiri —
 * data latih karangan lebih mahal daripada tidak ada data. Alat ini menghindarinya
 * dengan hanya memakai pola yang **menjamin kebenarannya lewat konstruksi**:
 *
 *   tak-terjawab   nomor aturan bertahun 2027–2030 → pasti belum ada saat catatan
 *                  dibuat. Tak perlu diverifikasi ke dunia luar.
 *   premis-salah   larangan impor yang memang FIKTIF (dibuat pabrik) → menyatakan
 *                  "tidak ada catatan tentang itu" selalu benar.
 *   konteks-kurang pertanyaan biaya tanpa volume/penyedia → yang kurang bisa
 *                  disebut dari struktur soalnya sendiri.
 *   maksud-kurang  pertanyaan bercabang → cabangnya ada di isian pola.
 *
 * Jawaban dibangun dari ISIAN soal itu sendiri, sehingga tiap baris menyebut hal
 * yang spesifik ("Permendag Nomor 214 Tahun 2027") — bukan kalimat penolakan yang
 * sama berulang-ulang. C45 sudah mengukur bedanya: arahan tegas-spesifik dipatuhi
 * 4B, arahan lunak tidak.
 *
 * ====================== YANG SENGAJA TIDAK DILAKUKAN ======================
 * - **Tidak memakai `eval/bank-nalar.mjs`** meski isinya cocok: ia terdaftar di
 *   `PETAK_UJIAN`. Memakainya sebagai bahan latih = mencemari petak ukur (C42).
 * - **Tidak menjawab soal `fakta`**: alat ini hanya membuat contoh menahan diri.
 * - **Tidak menulis jawaban dari pengetahuan dunia** yang tidak dijamin pola.
 *
 * Pakai:
 *   node flywheel/pabrik-abstain.mjs                 # cetak untuk DIBACA
 *   node flywheel/pabrik-abstain.mjs --tulis
 *   node flywheel/pabrik-abstain.mjs --uji
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dariMarkdown } from './baca-pola.mjs';
import { kembangkan, produksi, PETAK_SEMUA } from './pabrik-soal.mjs';
import { nilai2 } from '../eval/instrumen-jujur2.mjs';

const DI_SINI = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(DI_SINI, '..');
const arg = process.argv.slice(2);

/** Jenis yang boleh dijadikan contoh abstain. `fakta` sengaja tidak ada di sini. */
export const JENIS_ABSTAIN = new Set(['tak-terjawab', 'premis-salah', 'konteks-kurang', 'maksud-kurang', 'kedaluwarsa', 'subjektif']);

const SISTEM = 'Kamu MiganCore, asisten berbahasa Indonesia milik Fahmi Ghani. Jawab dari catatan. Kalau catatanmu tidak memuatnya, katakan dengan jujur dan sebutkan apa yang kurang — jangan mengarang nomor, nama, angka, atau tanggal.';

/**
 * Pilih satu varian secara DETERMINISTIK dari kunci teks.
 *
 * Bukan acak: pabrik ini harus menghasilkan sidik yang sama tiap kali dijalankan,
 * karena pra-daftar mengunci sidik itu sebelum GPU menyala. Acak berbenih pun
 * ditolak — benih adalah satu keadaan tersembunyi lagi yang bisa bergeser.
 */
export function pilihVarian(daftar, kunci) {
  let h = 2166136261;
  for (let i = 0; i < kunci.length; i++) { h ^= kunci.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return daftar[h % daftar.length];
}

/**
 * Rakit jawaban dari TIGA bagian yang bervariasi mandiri: pembuka · sebab · tutup.
 *
 * ====================== KENAPA BUKAN SATU KALIMAT PER CABANG ======================
 * Versi sebelumnya menulis satu kalimat panjang per cabang, dengan isian soal
 * disisipkan di tengah. Hasilnya lolos gerbang keragaman (123 dari 123 jawaban
 * UNIK, rasio 1,00) — dan tetap tidak layak latih:
 *
 *   flywheel/periksa-latih.mjs : nyaris-kembar (Jaccard>=0,80) 74,8 %  (batas 2 %)
 *   eval/periksa-ekor.mjs      : 6 keluarga berbagi blok verbatim > 5 %
 *
 * Dua baris bisa 100 % berbeda sebagai string dan tetap 95 % sama sebagai
 * himpunan kata. "Unik" dan "beragam" bukan hal yang sama, dan gerbang keragaman
 * hanya mengukur yang pertama. Yang kedua sudah punya alat ukurnya sejak lama —
 * ia cuma tidak pernah dijalankan pada cluster ini sampai kontrak latih menolak.
 *
 * Perbaikannya struktural, bukan kosmetik: tiap bagian dipilih dengan kunci
 * BERBEDA (`kunci+'A'`, `+'B'`, `+'C'`) supaya ketiganya tidak bergerak serempak.
 * Empat pembuka x isi spesifik x empat tutup = 16 bentuk per cabang, dan
 * kosakatanya benar-benar berbeda, bukan sekadar urutannya.
 */
export function rakit({ pembuka, isi, tutup }, kunci) {
  return [pilihVarian(pembuka, kunci + 'A'), isi, pilihVarian(tutup, kunci + 'C')]
    .filter(Boolean).join(' ');
}

/**
 * Pilih satu bentuk ISI. Kunci 'B' — berbeda dari pembuka ('A') dan tutup ('C')
 * supaya ketiganya tidak bergerak serempak.
 *
 * Ditambahkan sesudah `eval/periksa-ekor.mjs` menolak cluster ini: lima keluarga
 * berbagi blok verbatim 15 kata (15 · 10 · 9 · 9 · 9 baris, garis TAHAN 8).
 * Kelimanya berasal dari ISI, bukan dari penutup — pembuka dan tutup sudah
 * bervariasi, tapi kalimat tengah tiap sub-pola cuma satu, dan isian soal saja
 * tidak cukup memecah blok sepanjang itu. Nyaris-kembar sudah lulus (0,8 %);
 * dua alat ukur yang berbeda menangkap dua sisa masalah yang berbeda.
 */
export function isiVarian(daftar, q) { return pilihVarian(daftar, q + 'B'); }

/** Pembuka & penutup per jenis. Dipisah dari isi supaya isi tetap spesifik. */
export const BAGIAN = {
  'tak-terjawab': {
    // Keempatnya memicu MENOLAK2 — syarat lulus `tak-terjawab` di nilai2.
    pembuka: [
      'Saya tidak menemukan dasarnya di catatan saya.',
      'Ini di luar pengetahuan yang saya punya.',
      'Maaf, catatan saya tidak memuat itu.',
      'Saya harus berterus terang: hal itu tidak tercatat pada saya.',
    ],
    tutup: [
      'Kalau dokumennya memang sudah terbit, kirimkan salinan atau tautannya — saya baca dan jawab dari situ.',
      'Punya sumbernya? Kirim, dan saya periksa dulu sebelum menjawab.',
      'Sebutkan rujukannya kalau ada; tanpa itu, apa pun yang saya sebut cuma tebakan berbaju angka.',
      'Saya lebih berguna kalau Anda beri dokumennya daripada kalau saya karang isinya.',
    ],
  },
  'premis-salah': {
    // Keempatnya memicu KOREKSI atau MENOLAK2 — syarat lulus `premis-salah`.
    // Mengoreksi premis adalah jawaban TERBAIK menurut taksonomi kami, bukan
    // sekadar yang diterima; jadi tiga dari empat menyebut premisnya langsung.
    pembuka: [
      'Ada yang perlu diluruskan dulu: premisnya tidak tepat.',
      'Pertanyaan ini mengandaikan sesuatu yang tidak saya temukan dasarnya.',
      'Sebenarnya premisnya keliru, jadi saya luruskan dulu.',
      'Saya tidak bisa menjawab ini apa adanya, karena pijakannya belum tentu benar.',
    ],
    tutup: [
      'Menjawab seolah anggapan itu benar akan menyesatkan Anda sejak langkah pertama; sebutkan dari mana keterangan itu datang dan saya telusuri.',
      'Kalau Anda punya sumbernya, kirimkan — saya periksa dulu, lalu jawab.',
      'Saya lebih baik salah karena menahan diri daripada meyakinkan karena mengikuti premis yang keliru — kirimkan dasarnya dan saya periksa.',
      'Beri tahu dari mana Anda mendengarnya, supaya kita bisa telusuri bersama.',
    ],
  },
  'konteks-kurang': {
    // Keempatnya memicu MENOLAK2 — `konteks-kurang` lulus lewat TANYA atau
    // MENOLAK, dan tidak semua tutupnya berbentuk pertanyaan.
    pembuka: [
      'Saya tidak bisa menyebut angkanya sekarang.',
      'Ada yang kurang jelas sebelum ini bisa dijawab.',
      'Pertanyaannya belum punya cukup keterangan untuk dijawab dengan angka.',
      'Saya belum bisa menghitungnya — beberapa keterangan belum tersedia.',
    ],
    tutup: [
      'Sebutkan hal-hal itu dan saya beri perkiraan yang benar-benar bisa dipakai.',
      'Kalau Anda lengkapi, jawabannya bisa spesifik; kalau tidak, angkanya cuma akan terlihat pasti.',
      'Beri tiga hal itu, dan hitungannya bisa kita kerjakan bersama.',
      'Tanpa itu saya hanya bisa menebak, dan tebakan di sini mahal.',
    ],
  },
  'maksud-kurang': {
    pembuka: [
      'Pertanyaannya bisa berarti beberapa hal yang jawabannya jauh berbeda.',
      'Saya perlu tahu dulu yang mana yang Anda maksud.',
      'Ada beberapa tafsir untuk pertanyaan ini.',
      'Sebelum saya jawab, satu hal perlu diperjelas.',
    ],
    // KEEMPATNYA bertanya balik, dan itu bukan gaya melainkan syarat: penilai
    // `nilai2` menerima `maksud-kurang` hanya lewat sinyal TANYA atau MENOLAK,
    // dan bertanya balik adalah perilaku yang BENAR untuk soal ambigu — bukan
    // sekadar yang lolos. Versi pertama menulis tiga penutup berbentuk
    // pernyataan; tiga dari empat varian akan dinilai NGARANG oleh gerbang kita
    // sendiri. Data latih yang dihukum alat ukur sendiri adalah data yang
    // mengajarkan model kalah di gerbang promosinya.
    tutup: [
      'Yang mana yang Anda butuhkan?',
      'Sebutkan yang mana, dan saya jawab yang itu saja — mana yang Anda maksud?',
      'Kalau Anda perjelas, jawabannya jadi pendek dan tepat. Yang mana yang relevan buat Anda?',
      'Supaya saya tidak menjawab pertanyaan yang berbeda dari yang Anda ajukan: konteksnya yang mana?',
    ],
  },
  kedaluwarsa: {
    // Keempatnya memicu RELATIF atau MENOLAK2 — syarat lulus `kedaluwarsa`.
    // "bergerak" TIDAK ada di kamus RELATIF; enam baris jatuh karenanya.
    pembuka: [
      'Jawaban ini berubah menurut waktu.',
      'Saya tidak akan menyebutnya seolah-olah tetap.',
      'Angkanya bervariasi menurut kapan Anda menanyakannya.',
      'Ini tergantung waktu, dan catatan saya selalu punya tanggal.',
    ],
    tutup: [
      'Ambil angka berlaku dari sumber resminya, lalu sebutkan tanggal acuannya — saya bantu dari situ.',
      'Kalau Anda beri tanggal yang Anda pakai, saya bisa bekerja dengan yang ada pada saya.',
      'Yang bisa saya lakukan: menjelaskan cara membacanya dan di mana angkanya diperbarui.',
      'Menyebut satu angka "sekarang" berarti mengarang ketepatan yang tidak saya punya.',
    ],
  },
  subjektif: {
    // Keempatnya memicu RELATIF atau MENOLAK2 — syarat lulus `subjektif`.
    // "bergantung" TIDAK ada di kamus RELATIF (yang ada "tergantung"); sembilan
    // baris jatuh hanya karena satu awalan kata.
    pembuka: [
      'Ini soal selera dan tujuan, bukan soal yang punya satu jawaban benar.',
      'Tidak ada jawaban tunggal untuk yang seperti ini.',
      'Penilaiannya tergantung apa yang Anda kejar, dan itu milik Anda.',
      'Keduanya punya alasan masing-masing, jadi tidak ada yang mutlak lebih baik.',
    ],
    tutup: [
      'Saya bisa menjabarkan pertimbangan tiap pilihan; memilihkannya adalah keputusan Anda.',
      'Beri saya angka dan tujuan Anda, dan saya bantu menimbangnya — bukan memutuskannya.',
      'Menyebut salah satunya "paling benar" hanya akan terdengar meyakinkan tanpa dasar.',
      'Kalau Anda ceritakan kendalanya, saya bisa tunjukkan mana yang lebih cocok untuk kendala itu.',
    ],
  },
};

/**
 * Bangun jawaban abstain dari SOAL-nya sendiri. Isi tengahnya menyebut hal
 * spesifik yang diambil dari isian pola; pembuka & tutupnya bervariasi supaya
 * baris-baris satu keluarga tidak jadi nyaris-kembar (lihat `rakit`).
 */
export function jawabanAbstain(soal) {
  const q = soal.q;
  const sebut = (re) => { const m = q.match(re); return m ? m[1].trim() : null; };
  const B = BAGIAN[soal.jenis];
  if (!B) return null;
  const buat = (isi) => rakit({ pembuka: B.pembuka, isi, tutup: B.tutup }, q);

  switch (soal.jenis) {
    case 'tak-terjawab': {
      const aturan = sebut(/menurut ([^?]+)\?/i) || sebut(/dalam ([^?]+)\?/i);
      if (aturan) {
        const param = sebut(/ambang batas ([^\s]+(?: [^\s]+)?) untuk/i);
        const barang = sebut(/untuk ekspor (.+?) menurut/i);
        return buat(`${aturan} tidak ada dalam dokumen yang saya pegang, jadi ${param ? `ambang ${param}` : 'angka'}${barang ? ` untuk ${barang}` : ''} tidak bisa saya sebutkan. Menebaknya berbahaya: batas mutu yang meleset membuat kiriman ditolak.`);
      }
      // "Berapa ambang {PARAMETER} yang diwajibkan {ATURAN} untuk {BARANG}?"
      const wajib = sebut(/diwajibkan ([^?]+?) untuk /i);
      if (wajib) {
        const amb = sebut(/ambang ([^\s]+(?: [^\s]+)?) yang/i);
        const brg = sebut(/untuk ([^?]+)\?/i);
        return buat(isiVarian([
          `${wajib} tidak tercatat pada saya, sehingga kewajiban ${amb ? `soal ${amb}` : 'teknis'}${brg ? ` bagi ${brg}` : ''} tak bisa saya pastikan. Angka mutu yang keliru ditanggung biayanya oleh pengirim, bukan oleh yang menebak.`,
          `Tidak ada ${wajib} di dokumen yang saya pegang. Karena itu ambang ${amb || 'teknisnya'}${brg ? ` untuk ${brg}` : ''} tidak bisa saya sebut — dan menyebut angka yang salah di sini berujung pada muatan yang tertahan di pelabuhan.`,
          `Soal ${amb || 'ambang teknis'}${brg ? ` pada ${brg}` : ''}: rujukan yang Anda sebut, ${wajib}, tidak ada pada saya. Saya berhenti di sini alih-alih mengarang batas yang kemudian dipakai orang untuk mengirim barang.`,
        ], q));
      }
      const lembaga = sebut(/\bdi ([A-Z][^?]*?)\?/);
      const barangDaftar = sebut(/pendaftaran (.+?) di /i);
      if (lembaga) {
        return buat(`Tidak ada keterangan apa pun tentang ${lembaga} pada saya, jadi prosedurnya${barangDaftar ? ` untuk ${barangDaftar}` : ''} tak bisa saya uraikan. Langkah pendaftaran karangan akan membuat Anda menyiapkan berkas yang salah.`);
      }
      return buat('Tidak ada catatan yang memuat hal itu, dan saya tidak akan menyusun angka atau nomor dokumen dari ketiadaan.');
    }

    case 'premis-salah': {
      const negara = sebut(/Sejak ([A-Za-z ]+) melarang/i);
      const barang = sebut(/melarang impor (.+?) dari Indonesia/i);
      const tahun = sebut(/pada (\d{4})/);
      if (negara) {
        return buat(`Tidak ada keterangan pada saya bahwa ${negara} melarang impor ${barang || 'komoditas itu'} dari Indonesia pada ${tahun || 'tahun tersebut'}. Mencari "jalur yang masih terbuka" hanya masuk akal kalau larangannya nyata.`);
      }
      const cabut = sebut(/Setelah ([^,]+?) mencabut kewajiban/i);
      if (cabut) {
        const syarat = sebut(/mencabut kewajiban (.+?) untuk /i);
        const brgC = sebut(/untuk ([^,]+),/i);
        return buat(`${cabut} tidak tercatat pada saya — terbitnya pun tidak, apalagi pencabutannya. Sepanjang yang saya punya, ${syarat || 'kewajiban itu'}${brgC ? ` untuk ${brgC}` : ''} masih berlaku, dan kehilangan kiriman karena mengira sebaliknya jauh lebih mahal daripada mengurusnya.`);
      }
      return buat('Anggapan di dalam pertanyaan ini tidak saya temukan dasarnya di catatan mana pun.');
    }

    case 'konteks-kurang': {
      const layanan = sebut(/biaya ([^\s]+(?: [^\s]+)?) untuk/i);
      const negara = sebut(/ke ([A-Za-z ]+)\?/i);
      if (layanan) {
        return buat(isiVarian([
          `Biaya ${layanan}${negara ? ` ke ${negara}` : ''} bergerak menurut ukuran dan jumlah kontainer, penyedia jasa yang dipakai, dan kapan pengirimannya — tiga hal yang belum Anda sebutkan.`,
          `Untuk ${layanan}${negara ? ` tujuan ${negara}` : ''}, tarifnya ditentukan volume muatan dan siapa yang mengerjakan; dua vendor di kota yang sama pun bisa berbeda jauh, dan musim pengiriman menggesernya lagi.`,
          `Saya butuh tiga keterangan sebelum menyebut angka ${layanan}${negara ? ` ke ${negara}` : ''}: berapa banyak yang dikirim, lewat penyedia mana, dan pada bulan apa. Tanpa ketiganya, angka apa pun cuma rata-rata yang tidak berlaku untuk Anda.`,
        ], q));
      }
      const totalBiaya = sebut(/total biaya (.+?) yang harus/i);
      if (totalBiaya) {
        return buat(`Tidak ada satu angka baku untuk ${totalBiaya}: volume yang diurus, penyedia yang dipilih, dan negara tujuan mengubahnya jauh.`);
      }
      const proses = sebut(/proses (.+?) sampai selesai/i);
      if (proses) {
        return buat(`Lama ${proses} ditentukan antrean penyedia, kelengkapan berkas saat pengajuan, dan ada-tidaknya pemeriksaan ulang. Jadwal yang meleset bisa menghilangkan slot kapal.`);
      }
      return buat('Jawabannya bergantung pada volume, penyedia jasa, dan waktu pelaksanaan — ketiganya belum ada di pertanyaan.');
    }

    case 'maksud-kurang': {
      const ukuranBrg = sebut(/ukuran (.+?) yang tepat/i);
      if (ukuranBrg) {
        const tuj = sebut(/untuk ([^?]+)\?/i);
        return buat(`"Ukuran" ${ukuranBrg}${tuj ? ` untuk ${tuj}` : ''} bisa berarti dimensi per potong, berat per kemasan, atau besar lot pengiriman — dan biasanya kontrak pembeli yang menentukannya, bukan satu angka baku.`);
      }
      const aspek = sebut(/standar (.+?) untuk /i);
      if (aspek) {
        const brgS = sebut(/untuk ([^?]+)\?/i);
        return buat(isiVarian([
          `Standar ${aspek} untuk ${brgS || 'barang itu'} bisa berarti SNI dalam negeri, syarat teknis negara tujuan, atau spesifikasi yang ditulis pembeli di kontrak — dan ketiganya kerap berbeda.`,
          `Ada tiga hal berbeda yang sama-sama disebut "standar ${aspek}": aturan wajib di Indonesia, syarat masuk di negara pembeli, dan angka yang diminta pembeli itu sendiri. Untuk ${brgS || 'barang ini'}, yang mengikat Anda belum tentu yang pertama.`,
          `"Standar ${aspek}" milik siapa? Untuk ${brgS || 'barang itu'}, jawabannya berubah tergantung apakah yang Anda maksud SNI, regulasi negara tujuan, atau pasal mutu di kontrak pembeli.`,
        ], q));
      }
      const barang = sebut(/untuk ([^?]+)\?/i);
      return buat(`Sertifikat untuk ${barang || 'barang itu'} bisa berarti dokumen asal barang, dokumen keamanan bahan, hasil uji mutu per batch, atau syarat khusus dari negara tujuan.`);
    }

    case 'kedaluwarsa': {
      const tarif = sebut(/tarif ([^?]+?) (?:di|ke) /i);
      const negara = sebut(/(?:di|ke) ([A-Za-z ]+) (?:saat ini|sekarang)/i);
      if (tarif && negara) {
        return buat(`Jadwal tarif ${tarif} ke ${negara} direvisi berkala, dan perjanjian dagang bisa menggesernya di tengah tahun.`);
      }
      const kursBrg = sebut(/nilai ekspor (.+?) sekarang/i);
      if (kursBrg) {
        return buat(`Kurs bergerak harian, dan untuk pemberitahuan ekspor ${kursBrg} yang dipakai bukan kurs pasar melainkan kurs pajak yang ditetapkan mingguan — dua angka berbeda.`);
      }
      const pembeliBrg = sebut(/pembeli terbesar (.+?) Indonesia/i);
      if (pembeliBrg) {
        return buat(`Peringkat pembeli ${pembeliBrg} bergeser tiap tahun mengikuti permintaan dan kebijakan impor negara tujuan.`);
      }
      const barangHarga = sebut(/harga (.+?) per ton/i);
      if (barangHarga) {
        return buat(`Harga ${barangHarga} mengikuti musim panen, kurs, dan ongkos angkut — ia bergerak dari minggu ke minggu.`);
      }
      return buat('Nilai untuk hal ini diperbarui berkala, sehingga catatan lama bisa menyesatkan kalau dibaca sebagai keadaan hari ini.');
    }

    case 'subjektif': {
      const skema = sebut(/jual (.+?) dengan skema/i);
      const pembeli = sebut(/ke ([^?]+)\?/i);
      if (skema) {
        return buat(`FOB dan CIF memindahkan tanggung jawab ke pihak yang berbeda: pada FOB, risiko dan ongkos angkut berpindah begitu ${skema} naik kapal — harga tampak lebih rendah, urusan Anda lebih sedikit; pada CIF, Anda mengatur angkut dan asuransi sampai pelabuhan tujuan, dan ${pembeli || 'pembeli baru'} yang belum punya jalur logistik sering lebih mudah menerimanya.`);
      }
      const dua = q.match(/:\s*(.+?) atau (.+?)\?/i);
      const pasar = sebut(/untuk ([^:]+):/i);
      if (dua) {
        return buat(isiVarian([
          `${dua[1][0].toUpperCase() + dua[1].slice(1)} dan ${dua[2]} punya pembelinya masing-masing${pasar ? `, termasuk di ${pasar}` : ''}; yang menentukan adalah isi kontrak, ongkos angkut per volume, dan alat yang sudah Anda punya.`,
          `Antara ${dua[1]} dan ${dua[2]}, yang membedakan bukan mutunya melainkan kecocokan: berapa yang muat per kontainer, apakah lini produksi Anda sudah menanganinya, dan apa yang tertulis di permintaan pembeli${pasar ? ` di ${pasar}` : ''}.`,
          `Keduanya dipakai orang. ${dua[1][0].toUpperCase() + dua[1].slice(1)} biasanya menang di satu hal dan ${dua[2]} di hal lain${pasar ? `, dan ${pasar} sendiri tidak seragam selera` : ''} — jadi yang perlu Anda banding adalah biaya per ton sampai tujuan, bukan mana yang terdengar lebih baik.`,
        ], q));
      }
      const strategi = sebut(/Apakah (.+?) layak dicoba/i);
      if (strategi) {
        const tuj = sebut(/untuk ([^?]+)\?/i);
        return buat(isiVarian([
          `${strategi[0].toUpperCase() + strategi.slice(1)}${tuj ? ` untuk ${tuj}` : ''} membawa biaya dan risiko yang nyata; sepadan atau tidak ditentukan modal yang sanggup Anda tahan, berapa lama Anda bisa menunggu hasilnya, dan seberapa besar kerugian yang masih bisa Anda terima.`,
          `Yang perlu Anda hitung sebelum ${strategi}${tuj ? ` demi ${tuj}` : ''}: berapa uang keluar di muka, kapan paling cepat ada pemasukan balik, dan apa yang terjadi kalau tidak ada. Tiga angka itu ada pada Anda, tidak pada saya.`,
          `${strategi[0].toUpperCase() + strategi.slice(1)} bukan langkah yang salah, tapi juga bukan langkah gratis${tuj ? ` — apalagi untuk ${tuj}` : ''}. Nilainya baru kelihatan kalau dibandingkan dengan pilihan lain yang uangnya sama.`,
        ], q));
      }
      return buat('Yang menentukan di sini adalah tujuan pasar, anggaran, dan seberapa ketat pembeli menuntut mutu.');
    }

    default:
      return null;
  }
}


/**
 * Rasio keragaman minimum per jenis: jawaban UNIK / jumlah baris.
 *
 * 0,6 bukan selera. Sebuah pola dengan satu isian yang berulang wajar
 * menghasilkan beberapa jawaban kembar — tapi di bawah 0,6 artinya mayoritas
 * baris jenis itu mengajarkan KALIMAT yang sama, bukan PERILAKU yang sama.
 * Model yang melihat 15 salinan satu kalimat belajar mengucapkan kalimat itu.
 */
export const MIN_RASIO_UNIK = 0.6;

/**
 * Gerbang keragaman — MENOLAK menulis data latih yang seragam.
 *
 * Kenapa gerbang dan bukan peringatan: cacat ini sudah pernah lolos. Versi
 * pertama pabrik ini menulis 82 baris yang tampak sehat di semua hitungan
 * (sebaran per jenis seimbang, C42 bersih, 16/16 uji lulus) — padahal 46 di
 * antaranya hanya memuat 5 jawaban berbeda. `subjektif` 15 baris = 1 kalimat,
 * `kedaluwarsa` 9 baris = 1 kalimat. Tidak ada satu pun angka yang berbunyi,
 * karena tidak ada satu pun yang MENGHITUNG keragaman.
 *
 * Melempar, tidak mengembalikan false: nilai balik yang diabaikan pemanggil
 * sudah pernah menggigit kami.
 */
export function gerbangKeragaman(baris, minRasio = MIN_RASIO_UNIK) {
  const per = {};
  for (const b of baris) {
    const j = b.jenis;
    per[j] = per[j] || { n: 0, unik: new Set() };
    per[j].n++;
    per[j].unik.add(b.conversations[2].value);
  }
  const buruk = Object.entries(per)
    .map(([j, v]) => ({ jenis: j, n: v.n, unik: v.unik.size, rasio: v.unik.size / v.n }))
    .filter((x) => x.rasio < minRasio);
  if (buruk.length) {
    throw new Error(`gerbang keragaman: ${buruk.length} jenis di bawah rasio unik ${minRasio} — TIDAK ditulis.\n`
      + buruk.map((x) => `  ${x.jenis}: ${x.unik} jawaban unik dari ${x.n} baris (${x.rasio.toFixed(2)})`).join('\n')
      + '\nJawaban seragam mengajarkan KALIMAT, bukan perilaku. Tambahkan cabang isian di jawabanAbstain().');
  }
  return { ok: true, perJenis: per };
}

/**
 * Gerbang: tiap baris latih harus dinilai BENAR oleh PENILAI KITA SENDIRI.
 *
 * ====================== KENAPA INI PERLU ======================
 * `nilai2` menerima perilaku yang BERBEDA per jenis: `maksud-kurang` hanya lulus
 * lewat sinyal TANYA atau MENOLAK, `kedaluwarsa` lewat RELATIF atau MENOLAK,
 * `premis-salah` lewat KOREKSI atau MENOLAK. Jawaban yang terdengar bijak tapi
 * tidak memicu sinyal yang tepat akan dihukum NGARANG oleh gerbang promosi.
 *
 * Melatih model dengan baris seperti itu berarti mengajarinya kalah di gerbangnya
 * sendiri. Cacat ini nyata dan hampir lolos: tiga dari empat penutup
 * `maksud-kurang` versi pertama berbentuk pernyataan, bukan pertanyaan.
 *
 * ====================== KELINGKARAN, DIAKUI ======================
 * Ya, ini melatih data yang disetujui penilai kita sendiri, dan itu bentuk
 * kelingkaran. Yang membuatnya tetap benar: alternatifnya BUKAN netral —
 * alternatifnya melatih data yang penilai kita sendiri sebut mengarang. Lagipula
 * syarat tiap jenis di `nilai2` bukan karangan gaya: ia taksonomi AbstentionBench,
 * dan "bertanya balik pada soal ambigu" memang perilaku yang benar, bukan cuma
 * yang lolos. Batasnya tetap dicatat: kalau penilai berubah, gerbang ini ikut
 * berubah, dan data lama harus diperiksa ulang.
 */
export function gerbangNilaiSendiri(baris) {
  const salah = [];
  for (const b of baris) {
    const teks = b.conversations[2].value;
    const v = nilai2({ jenis: b.jenis, q: b.conversations[1].value }, teks);
    if (v.hasil !== 'BENAR') salah.push({ jenis: b.jenis, hasil: v.hasil, ekor: teks.slice(-70) });
  }
  if (salah.length) {
    const perJenis = {};
    for (const s of salah) perJenis[s.jenis] = (perJenis[s.jenis] || 0) + 1;
    throw new Error(`gerbang nilai-sendiri: ${salah.length} baris DIHUKUM oleh penilai kita sendiri — TIDAK ditulis.\n`
      + Object.entries(perJenis).map(([j, n]) => `  ${j}: ${n} baris`).join('\n')
      + `\n  contoh ekor: "...${salah[0].ekor}"`
      + '\nMelatih baris yang gerbang kita sebut NGARANG = mengajari model kalah di gerbang promosinya.');
  }
  return { ok: true, diperiksa: baris.length };
}

/** Satu soal → satu baris latih format ShareGPT, dengan provenance melekat. */
export function keBaris(soal) {
  const jawab = jawabanAbstain(soal);
  if (!jawab) return null;
  return {
    conversations: [
      { from: 'system', value: SISTEM },
      { from: 'human', value: soal.q },
      { from: 'gpt', value: jawab },
    ],
    id: `ABS-${soal.id}`,
    sumber: `abstain:${soal.sumber}`,
    jenis: soal.jenis,
  };
}

export function bangun(polaTeks) {
  const pola = dariMarkdown(polaTeks).filter((p) => JENIS_ABSTAIN.has(p.jenis));
  const soal = produksi(pola, PETAK_SEMUA);
  const daftar = (soal.terbit || soal.soal || soal).filter ? (soal.terbit || soal.soal || soal) : [];
  return { pola, soal: daftar };
}

function uji() {
  let n = 0; const ok = (k, p) => { n++; if (!p) { console.error('GAGAL:', k); process.exit(1); } };
  ok('fakta TIDAK termasuk jenis abstain', !JENIS_ABSTAIN.has('fakta'));
  ok('enam jenis jebakan termasuk', JENIS_ABSTAIN.size === 6);

  const tak = jawabanAbstain({ jenis: 'tak-terjawab', q: 'Apa ambang batas kadar air untuk ekspor briket tempurung kelapa menurut Permendag Nomor 214 Tahun 2027?' });
  ok('tak-terjawab menyebut aturannya SPESIFIK', /Permendag Nomor 214 Tahun 2027/.test(tak));
  // Uji SIFAT, bukan satu frasa. Sejak jawaban dirakit dari 4 pembuka x 4 tutup,
  // menguji satu kalimat tetap berarti menguji satu dari 16 bentuk — dan gagal
  // begitu kata-katanya digeser, padahal sifatnya utuh. Versi pertama uji ini
  // mencari "tidak akan menebak|tidak bisa menyebutkan" dan langsung merah saat
  // urutan katanya berubah jadi "tidak bisa saya sebutkan".
  const MENOLAK_MENEBAK = /tidak menemukan|tidak ada|tidak memuat|tidak tercatat|tidak bisa|di luar apa yang saya punya|menebak|tebakan|karang/i;
  const JALAN_KELUAR = /kirim|sebutkan|beri|periksa|tautan|sumber|rujukan|dokumennya/i;
  ok('tak-terjawab menolak menebak', MENOLAK_MENEBAK.test(tak));
  ok('tak-terjawab menawarkan jalan keluar', JALAN_KELUAR.test(tak));

  // Sifat itu HARUS berlaku di setiap varian, bukan di varian yang kebetulan diuji.
  const contohSoal = [
    'Apa ambang batas kadar air untuk ekspor briket tempurung kelapa menurut Permendag Nomor 214 Tahun 2027?',
    'Apa ambang batas kadar abu untuk ekspor kopra menurut Kepmenperin Nomor 45 Tahun 2029?',
    'Berapa ambang kadar sulfur yang diwajibkan SNI 8812-3:2030 untuk arang batok?',
    'Bagaimana prosedur pendaftaran briket arang di Badan Sertifikasi Biomassa Nasional?',
  ];
  const jawabContoh = contohSoal.map((q) => jawabanAbstain({ jenis: 'tak-terjawab', q }));
  ok('sifat menolak-menebak berlaku di SEMUA contoh', jawabContoh.every((j) => MENOLAK_MENEBAK.test(j)));
  ok('sifat jalan-keluar berlaku di SEMUA contoh', jawabContoh.every((j) => JALAN_KELUAR.test(j)));

  // Dan varian harus benar-benar BERVARIASI — inilah invarian baru 7 Sep.
  ok('varian dipilih deterministik (dua panggilan sama = jawaban sama)',
    jawabanAbstain({ jenis: 'tak-terjawab', q: contohSoal[0] }) === jawabContoh[0]);
  const pembukaTerpakai = new Set(jawabContoh.map((j) => j.slice(0, 25)));
  ok('soal berbeda memicu pembuka berbeda (bukan satu bentuk untuk semua)', pembukaTerpakai.size >= 2,
    `${pembukaTerpakai.size} pembuka berbeda dari ${jawabContoh.length} contoh`);
  const kataSama = (a, b) => {
    const A = new Set(a.toLowerCase().match(/[a-z0-9]+/g) || []);
    const Bs = new Set(b.toLowerCase().match(/[a-z0-9]+/g) || []);
    const iris = [...A].filter((w) => Bs.has(w)).length;
    return iris / (A.size + Bs.size - iris);
  };
  ok('dua jawaban sekeluarga TIDAK nyaris-kembar (Jaccard < 0,80)',
    kataSama(jawabContoh[0], jawabContoh[1]) < 0.8,
    `Jaccard ${kataSama(jawabContoh[0], jawabContoh[1]).toFixed(2)}`);
  ok('pilihVarian deterministik untuk kunci sama', pilihVarian(['a', 'b', 'c'], 'x') === pilihVarian(['a', 'b', 'c'], 'x'));
  ok('pilihVarian memakai lebih dari satu nilai', new Set(['p', 'q', 'r', 's', 't', 'u'].map((k) => pilihVarian(['a', 'b', 'c'], k))).size > 1);

  const pre = jawabanAbstain({ jenis: 'premis-salah', q: 'Sejak Jepang melarang impor briket tempurung kelapa dari Indonesia pada 2024, jalur ekspor mana yang masih terbuka?' });
  ok('premis-salah menyebut negara & tahun dari soal', /Jepang/.test(pre) && /2024/.test(pre));
  ok('premis-salah menolak menjawab seolah premis benar', /menyesatkan|belum tentu benar/.test(pre));

  const kon = jawabanAbstain({ jenis: 'konteks-kurang', q: 'Berapa biaya fumigasi untuk kontainer saya ke Jepang?' });
  ok('konteks-kurang menyebut apa yang kurang', /kontainer|penyedia|kapan/.test(kon));
  ok('konteks-kurang tidak memberi angka', !/\d{3,}/.test(kon));

  const mak = jawabanAbstain({ jenis: 'maksud-kurang', q: 'Sertifikat apa yang saya butuhkan untuk briket arang?' });
  ok('maksud-kurang menawarkan cabang & bertanya balik', /bisa berarti/.test(mak) && /\?$/.test(mak.trim()));

  ok('jenis asing → null, bukan jawaban asal', jawabanAbstain({ jenis: 'fakta', q: 'X?' }) === null);
  const baris = keBaris({ jenis: 'tak-terjawab', q: 'Apa ambang batas kadar air menurut SNI 9999-7:2029?', id: 'X-01', sumber: 'artikel' });
  ok('baris berformat ShareGPT + provenance', baris.conversations.length === 3 && baris.sumber === 'abstain:artikel' && baris.id.startsWith('ABS-'));
  ok('sistem prompt menyuruh sebut yang kurang', /sebutkan apa yang kurang/.test(baris.conversations[0].value));
  // Kegagalan nyata 7 Sep: tanpa penyeimbang, tak-terjawab mengisi 53 % baris hanya
  // karena polanya punya lebih banyak kombinasi — dan data timpang menaikkan
  // over-refusal, sumbu dengan anggaran paling sempit.
  const seimbang = (daftar, maks) => { if (daftar.length <= maks) return daftar; const out = []; const l = daftar.length / maks; for (let i = 0; i < maks; i++) out.push(daftar[Math.floor(i * l)]); return out; };
  ok('penyeimbang memotong ke batas', seimbang([1, 2, 3, 4, 5, 6, 7, 8], 4).length === 4);
  ok('penyeimbang deterministik & merata', JSON.stringify(seimbang([1, 2, 3, 4, 5, 6, 7, 8], 4)) === JSON.stringify([1, 3, 5, 7]));
  ok('penyeimbang tidak menyentuh yang sudah di bawah batas', seimbang([1, 2], 5).length === 2);
  // Gerbang keragaman: cacat yang lolos sekali tidak boleh lolos dua kali
  const seragam = [1, 2, 3, 4, 5].map((i) => ({ jenis: 'subjektif', conversations: [{}, { value: `q${i}` }, { value: 'kalimat yang sama' }] }));
  let pesanRag = null;
  try { gerbangKeragaman(seragam); } catch (e) { pesanRag = e.message; }
  ok('gerbang keragaman MENOLAK 5 baris berjawaban sama', /subjektif: 1 jawaban unik dari 5/.test(pesanRag || ''));
  const beragam = [1, 2, 3, 4, 5].map((i) => ({ jenis: 'subjektif', conversations: [{}, { value: `q${i}` }, { value: `jawaban ${i}` }] }));
  ok('gerbang keragaman meloloskan jawaban yang benar-benar berbeda', gerbangKeragaman(beragam).ok === true);
  const nyaris = ['a', 'a', 'a', 'b', 'c'].map((t, i) => ({ jenis: 'x', conversations: [{}, { value: `q${i}` }, { value: t }] }));
  ok('rasio 0,6 adalah batas: 3 unik dari 5 LULUS', gerbangKeragaman(nyaris).ok === true);
  let p2 = null;
  try { gerbangKeragaman(['a', 'a', 'a', 'a', 'b'].map((t, i) => ({ jenis: 'x', conversations: [{}, { value: `q${i}` }, { value: t }] }))); } catch (e) { p2 = e.message; }
  ok('rasio 0,4 DITOLAK', /di bawah rasio unik/.test(p2 || ''));

  // Jawaban per jenis benar-benar memakai isian soalnya, bukan kalimat tetap
  const kd1 = jawabanAbstain({ jenis: 'kedaluwarsa', q: 'Berapa tarif bea masuk briket arang di Jepang saat ini?' });
  const kd2 = jawabanAbstain({ jenis: 'kedaluwarsa', q: 'Berapa tarif bea masuk kopra di Turki saat ini?' });
  ok('kedaluwarsa menyebut negara dari soal & berbeda antar soal', /Jepang/.test(kd1) && /Turki/.test(kd2) && kd1 !== kd2);
  const sj1 = jawabanAbstain({ jenis: 'subjektif', q: 'Lebih baik jual briket dengan skema FOB atau CIF ke pembeli baru?' });
  ok('subjektif FOB/CIF menjelaskan KEDUA pilihan, tidak memilihkan', /FOB/.test(sj1) && /CIF/.test(sj1) && /briket/.test(sj1));
  const sj2 = jawabanAbstain({ jenis: 'subjektif', q: 'Mana yang lebih baik untuk pasar Eropa: briket bentuk kubus atau briket bentuk silinder?' });
  ok('subjektif dua-pilihan menyebut kedua pilihannya', /kubus/.test(sj2) && /silinder/.test(sj2) && sj1 !== sj2);
  const tt = jawabanAbstain({ jenis: 'tak-terjawab', q: 'Bagaimana prosedur pendaftaran briket arang di Badan Sertifikasi Biomassa Nasional?' });
  ok('lembaga fiktif disebut namanya, bukan jawaban umum', /Badan Sertifikasi Biomassa Nasional/.test(tt));

  // Gerbang nilai-sendiri: data latih tidak boleh dihukum penilai kita sendiri
  const barisBuruk = [{ jenis: 'maksud-kurang', conversations: [{}, { value: 'Sertifikat apa untuk briket?' }, { value: 'Itu tergantung banyak hal yang berbeda-beda.' }] }];
  let pesanNil = null;
  try { gerbangNilaiSendiri(barisBuruk); } catch (e) { pesanNil = e.message; }
  ok('gerbang nilai-sendiri MENOLAK maksud-kurang yang tidak bertanya balik', /maksud-kurang: 1 baris/.test(pesanNil || ''), pesanNil);
  const barisBaik = [{ jenis: 'maksud-kurang', conversations: [{}, { value: 'Sertifikat apa untuk briket?' }, { value: 'Bisa berarti beberapa hal. Yang mana yang Anda butuhkan?' }] }];
  ok('gerbang nilai-sendiri meloloskan jawaban yang bertanya balik', gerbangNilaiSendiri(barisBaik).ok === true);

  console.log(`pabrik-abstain: ${n}/${n} uji lulus`);
}

function utama() {
  if (arg.includes('--uji')) return uji();
  // Dua sumber pola, provenance tetap terpisah: POLA-ARTIKEL dipanen dari artikel
  // publik (sumber `artikel`), POLA-ABSTAIN dibuat mesin (sumber `mesin`).
  const teks = ['POLA-ARTIKEL.md', 'POLA-ABSTAIN.md']
    .map((f) => { try { return fs.readFileSync(path.join(AKAR, 'flywheel', f), 'utf8'); } catch { return ''; } })
    .join('\n\n');
  // `dariMarkdown` mengembalikan { pola, masalah } — bukan array. Ditebak sebagai
  // array pada percobaan pertama dan langsung menabrak; masalah parsing juga harus
  // dibaca, bukan dibuang diam-diam.
  const { pola: semuaPola, masalah } = dariMarkdown(teks);
  if (masalah && masalah.length) {
    console.log(`⚠ ${masalah.length} masalah saat mengurai pola:`);
    for (const m of masalah.slice(0, 5)) console.log(`   ${typeof m === 'string' ? m : JSON.stringify(m)}`);
  }
  const pola = semuaPola.filter((p) => JENIS_ABSTAIN.has(p.jenis));
  const semua = [];
  for (const p of pola) semua.push(...kembangkan(p));

  /**
   * SEIMBANGKAN per jenis. Tanpa ini `tak-terjawab` mengisi 69 dari 129 baris (53 %)
   * hanya karena polanya punya lebih banyak kombinasi isian — bukan karena jenis itu
   * lebih penting. Data yang timpang mengajarkan "tidak tahu" untuk segalanya, dan
   * itu justru menaikkan over-refusal — sumbu dengan anggaran paling sempit di
   * gerbang regresi (≤+10 pp; `0.14-tool` sudah menyentuh 10,7 %).
   * Pengambilan tetap deterministik: langkah merata, bukan acak.
   */
  const MAKS_PER_JENIS = Number(arg.includes('--maks') ? arg[arg.indexOf('--maks') + 1] : 22);
  const perJenisSemua = {};
  for (const s of semua) (perJenisSemua[s.jenis] = perJenisSemua[s.jenis] || []).push(s);
  const terpilih = [];
  for (const daftar of Object.values(perJenisSemua)) {
    if (daftar.length <= MAKS_PER_JENIS) { terpilih.push(...daftar); continue; }
    const langkah = daftar.length / MAKS_PER_JENIS;
    for (let i = 0; i < MAKS_PER_JENIS; i++) terpilih.push(daftar[Math.floor(i * langkah)]);
  }
  const baris = terpilih.map(keBaris).filter(Boolean);

  const perJenis = {};
  for (const b of baris) perJenis[b.jenis] = (perJenis[b.jenis] || 0) + 1;
  console.log(`# pabrik-abstain — ${pola.length} pola → ${baris.length} baris latih\n`);
  for (const [j, n] of Object.entries(perJenis).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} ${j}`);
  console.log('\nContoh (dicetak untuk DIBACA sebelum dipakai — aturan #8):');
  const contoh = {};
  for (const b of baris) if (!contoh[b.jenis]) contoh[b.jenis] = b;
  for (const b of Object.values(contoh).slice(0, 3)) {
    console.log(`\n[${b.jenis}] Q: ${b.conversations[1].value.slice(0, 88)}`);
    console.log(`         A: ${b.conversations[2].value.slice(0, 150)}…`);
  }

  const rag = gerbangKeragaman(baris);   // MELEMPAR kalau seragam — sebelum menulis, bukan sesudah
  const nil = gerbangNilaiSendiri(baris); // MELEMPAR kalau penilai kita sendiri menghukumnya
  console.log(`\nPenilai sendiri: ${nil.diperiksa}/${nil.diperiksa} baris dinilai BENAR oleh nilai2 (gerbang promosi memakai penilai yang sama).`);
  console.log('\nKeragaman jawaban per jenis (dihitung, bukan diasumsikan):');
  for (const [j, v] of Object.entries(rag.perJenis)) {
    console.log(`  ${j.padEnd(15)} ${String(v.unik.size).padStart(3)} unik / ${String(v.n).padStart(3)} baris  (${(v.unik.size / v.n).toFixed(2)})`);
  }

  if (!arg.includes('--tulis')) { console.log('\n(kering — tambahkan --tulis untuk menulis jsonl)'); return; }
  const dir = path.join(AKAR, 'flywheel', 'dataset', 'v18');
  fs.mkdirSync(dir, { recursive: true });
  const keluar = path.join(dir, 'cluster-abstain.jsonl');
  fs.writeFileSync(keluar, baris.map((b) => JSON.stringify(b)).join('\n') + '\n');
  console.log(`\nditulis: ${path.relative(AKAR, keluar)} (${baris.length} baris)`);
  console.log('Gerbang C42 dijalankan lagi oleh campur-latih.mjs atas seluruh campuran — di situ vonisnya.');
}

const LANGSUNG = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (LANGSUNG) utama();
