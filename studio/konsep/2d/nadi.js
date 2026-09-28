(function () {
  'use strict';

  const htmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  let cache;
  const Nadi = {
    esc: htmlEscape,
    async data() {
      if (!cache) {
        cache = fetch('./data-nyata.json', { cache: 'no-store' }).then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        });
      }
      return cache;
    },
    sumber(data, jalur) {
      return `data-nyata.json → ${jalur} · commit ${data?._commit || 'tidak terbaca'}`;
    },
    angka(nilai, data, jalur, akhiran = '') {
      const asal = htmlEscape(this.sumber(data, jalur));
      return `<span class="angka-sumber" tabindex="0" title="${asal}" data-source="${asal}">${htmlEscape(nilai)}${akhiran}</span>`;
    },
    teksData(nilai, data, jalur) {
      const aman = htmlEscape(nilai ?? '').replace(/&#39;/g, "'").replace(/\*\*/g, '').replace(/`/g, '');
      return aman.replace(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?Z?)?|\d+(?:[.,]\d+)*(?:\s*[–—-]\s*\d+(?:[.,]\d+)*)?(?:\s*%|\/\d+)?/g, (angka) =>
        `<span class="angka-sumber" tabindex="0" title="${htmlEscape(this.sumber(data, jalur))}" data-source="${htmlEscape(this.sumber(data, jalur))}">${angka}</span>`
      );
    },
    status(k) {
      return ['lulus', 'gagal', 'belum', 'netral'].includes(k) ? k : 'kosong';
    },
    tanggal(nilai) {
      if (!nilai) return 'tanggal belum ada';
      const d = new Date(`${nilai}T00:00:00`);
      return Number.isNaN(d.getTime()) ? nilai : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    },
    teksRingkas(nilai, batas = 190) {
      const teks = String(nilai || 'Tidak ada keterangan pada sumber.');
      return teks.length > batas ? `${teks.slice(0, batas).trim()}…` : teks;
    },
    pasangMeta(data) {
      document.querySelectorAll('[data-meta-sumber]').forEach((el) => {
        el.textContent = `data-nyata.json · commit ${data._commit} · dibangkitkan ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data._dibangkitkan))}`;
      });
    },
    galat(target, error) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (el) el.innerHTML = `<div class="panel galat-data"><b>Data tidak dapat dibaca.</b><br>Mockup ini membutuhkan server lokal agar <code>./data-nyata.json</code> dapat dimuat. ${htmlEscape(error?.message || '')}</div>`;
    }
  };

  window.Nadi = Nadi;

  function aturModeBaca() {
    const preferensi = localStorage.getItem('migancore-mode-baca') === 'ya';
    document.body.classList.toggle('mode-baca', preferensi);
    document.querySelectorAll('[data-mode-baca]').forEach((button) => {
      button.setAttribute('aria-pressed', String(preferensi));
      button.innerHTML = preferensi ? 'Kembali ke Dunia' : 'Mode Baca';
      button.setAttribute('title', preferensi ? 'Tampilkan kembali konteks dunia' : 'Tampilkan data sebagai dokumen 2D bersih');
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode-baca]');
    if (!button) return;
    const aktif = document.body.classList.toggle('mode-baca');
    localStorage.setItem('migancore-mode-baca', aktif ? 'ya' : 'tidak');
    aturModeBaca();
    window.dispatchEvent(new CustomEvent('migancore:mode', { detail: { modeBaca: aktif } }));
  });

  document.addEventListener('DOMContentLoaded', () => {
    aturModeBaca();
    const berkas = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.navigasi-utama a').forEach((a) => {
      const tujuan = a.getAttribute('href')?.split('/').pop();
      if (tujuan === berkas) a.setAttribute('aria-current', 'page');
    });
    Nadi.data().then((data) => Nadi.pasangMeta(data)).catch(() => {});
  });
})();
