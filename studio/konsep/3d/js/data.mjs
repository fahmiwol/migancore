const DATA_PATH = "../data-nyata.json";

let cache = null;

export async function muatData() {
  if (cache) return cache;
  const response = await fetch(DATA_PATH, { cache: "no-store" });
  if (!response.ok) throw new Error(`Data tidak dapat dibaca (${response.status})`);
  cache = await response.json();
  return cache;
}

export function metaSumber(data, jalur = "") {
  const bagian = jalur ? ` · ${jalur}` : "";
  return `data-nyata.json · commit ${data._commit}${bagian}`;
}

/**
 * Umur potret data (hari) dan penanda BASI (> 7 hari, PRD M1). Tanggal tak terbaca = BASI —
 * data yang tak diketahui umurnya tidak boleh tampil seolah segar.
 */
export function kesegaranData(data, sekarang = Date.now()) {
  const t = Date.parse(data?._dibangkitkan);
  const umurHari = Number.isFinite(t) ? Math.floor((sekarang - t) / 86400000) : null;
  return { umurHari, basi: !(umurHari != null && umurHari <= 7), tanggal: String(data?._dibangkitkan ?? "").slice(0, 10) };
}

/** Satu-satunya penulis cap sumber di bilah atas (dipakai hud.mjs dan app.mjs). */
export function pasangCapSumber(el, data, sekarang = Date.now()) {
  if (!el) return;
  const k = kesegaranData(data, sekarang);
  el.textContent = `data-nyata.json · ${data._commit} · ${k.tanggal}${k.basi ? " · BASI" : ""}`;
  el.title = `Sumber ${data._sumber} · dibangkitkan ${data._dibangkitkan} (${k.umurHari != null ? `${k.umurHari} hari lalu` : "tanggal tak terbaca"})${k.basi ? " — lebih dari 7 hari: jalankan ulang studio/alat/bangkitkan-data-nyata.mjs (PRD M1)" : ""}`;
  el.classList.toggle("basi", k.basi);
}

export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function statusClass(value) {
  return ["lulus", "gagal", "belum", "netral"].includes(value) ? value : "netral";
}

export function badgeSumber(data, jalur) {
  const title = metaSumber(data, jalur);
  return `<span class="sumber-data" tabindex="0" title="${esc(title)}">◇ ${esc(title)}</span>`;
}

export function ringkasData(data) {
  return {
    praDaftar: data.praDaftar.length,
    hukum: data.hukum.jumlah,
    temuan: data.temuan.jumlah,
    backlog: data.backlog.length,
    lokasi: data.sensus.lokasi.length,
    model: data.modelBerlaku.tag,
  };
}

export function kelompokBacklog(data) {
  const selesai = data.backlog.filter((item) => /SELESAI|✅/i.test(`${item.tujuan} ${item.status}`));
  const belum = data.backlog.filter((item) => !selesai.includes(item));
  return { selesai, belum };
}
