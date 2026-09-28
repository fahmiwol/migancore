#!/usr/bin/env node
/**
 * server.mjs — BENGKEL sebagai produk. Tanpa kerangka kerja, tanpa dependensi.
 *
 * ============================ KEPUTUSAN YANG MENENTUKAN =====================
 * TIDAK ADA AKUN, TIDAK ADA DATA PENGGUNA DI SERVER. Resep hidup di peramban
 * pengguna dan diunduh sebagai berkas. Server cuma memeriksa dan menurunkan
 * gerbang, lalu melupakan segalanya.
 *
 * Ini bukan kemalasan. Resep memuat arah bisnis, daftar pelanggan, dan fakta
 * internal — persis hal yang orang tidak akan titipkan ke server orang lain.
 * Menyimpannya berarti kami memikul kewajiban keamanan yang belum bisa kami
 * penuhi, dan calon pengguna yang paling serius justru yang paling menolak.
 * Kalau nanti perlu menyimpan, itu keputusan terpisah dengan syaratnya sendiri.
 *
 * Tanpa dependensi karena alasan yang sama: satu paket npm yang disusupi di
 * server yang memegang resep orang adalah kerugian yang tidak sepadan dengan
 * kenyamanan menulis rute.
 *
 * Pakai: node server.mjs [port]        (bawaan 8730)
 */
'use strict';

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { periksaResep, turunkanGerbang } from '../bengkel.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIK = path.join(DIR, 'publik');
const KATALOG = path.join(DIR, '..', 'katalog', 'katalog-base.json');
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8730;
const BATAS_BADAN = 256 * 1024;   // resep terbesar pun jauh di bawah ini

const JENIS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const kirim = (res, kode, isi, jenis = 'application/json; charset=utf-8') => {
  res.writeHead(kode, {
    'content-type': jenis,
    // Halaman ini tidak memuat apa pun dari luar; menguncinya menutup seluruh
    // kelas serangan penyuntikan sekaligus.
    'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(typeof isi === 'string' || Buffer.isBuffer(isi) ? isi : JSON.stringify(isi));
};

function badan(req) {
  return new Promise((selesai, tolak) => {
    let d = '', n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > BATAS_BADAN) { tolak(new Error('badan terlalu besar')); req.destroy(); return; }
      d += c;
    });
    req.on('end', () => { try { selesai(JSON.parse(d || '{}')); } catch { tolak(new Error('JSON tidak sah')); } });
    req.on('error', tolak);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── katalog base model, beserta UMURNYA ──
  if (url.pathname === '/api/katalog') {
    if (!fs.existsSync(KATALOG)) return kirim(res, 503, { galat: 'katalog belum pernah ditarik' });
    const k = JSON.parse(fs.readFileSync(KATALOG, 'utf8'));
    const umurHari = (Date.now() - new Date(k.ditarikPada).getTime()) / 86400000;
    // Umur ikut dikirim, dan halaman WAJIB menampilkannya. Katalog lisensi yang
    // basi lebih berbahaya daripada tidak ada katalog: orang mengambil keputusan
    // hukum dari angka yang sudah berubah.
    return kirim(res, 200, { ...k, umurHari: Number(umurHari.toFixed(1)), segar: umurHari <= (k.umurMaksHari || 30) });
  }

  if (url.pathname === '/api/periksa' && req.method === 'POST') {
    try {
      const resep = await badan(req);
      const salah = periksaResep(resep);
      return kirim(res, 200, { salah, lengkap: salah.length === 0 });
    } catch (e) { return kirim(res, 400, { galat: e.message }); }
  }

  if (url.pathname === '/api/rakit' && req.method === 'POST') {
    try {
      const resep = await badan(req);
      const salah = periksaResep(resep);
      if (salah.length) {
        // Menurunkan gerbang dari resep yang bolong menghasilkan ujian untuk
        // tujuan yang salah — lebih buruk daripada tidak punya ujian sama sekali.
        return kirim(res, 422, { galat: 'resep belum lengkap', salah });
      }
      return kirim(res, 200, turunkanGerbang(resep));
    } catch (e) { return kirim(res, 400, { galat: e.message }); }
  }

  if (url.pathname === '/api/sehat') return kirim(res, 200, { sehat: true, waktu: new Date().toISOString() });

  // ── berkas statis ──
  let f = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  // Penjaga jalur: apa pun yang keluar dari folder publik ditolak, tanpa kecuali.
  const penuh = path.resolve(PUBLIK, f);
  if (!penuh.startsWith(PUBLIK)) return kirim(res, 403, 'terlarang', 'text/plain');
  if (!fs.existsSync(penuh) || !fs.statSync(penuh).isFile()) return kirim(res, 404, 'tidak ada', 'text/plain');
  return kirim(res, 200, fs.readFileSync(penuh), JENIS[path.extname(penuh)] || 'application/octet-stream');
});

server.listen(PORT, () => {
  console.log(`# Bengkel berjalan di http://127.0.0.1:${PORT}`);
  console.log('  tanpa akun · tanpa data pengguna tersimpan · tanpa dependensi');
  if (!fs.existsSync(KATALOG)) console.log('  ⚠ katalog belum ditarik: node ../katalog/segarkan-katalog.mjs');
});
