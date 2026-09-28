import { badgeSumber, esc, kelompokBacklog, metaSumber, statusClass } from "./data.mjs";
import { cariModul, MODUL } from "./peta-modul.mjs";
import { renderBalai } from "./balai-bicara.mjs";

function status(value) { return `<span class="status ${statusClass(value)}">${esc(value)}</span>`; }

const kelasTingkat = (t) => (t === "LAHIR" ? "lulus" : t === "BIBIT" ? "netral" : "belum");
const angka = (x) => (typeof x === "number" ? x.toFixed(2).replace(".", ",") : "—");

// Status kelahiran MAKSARA DIRAKIT dari data.kelahiran (eval/ambang-bibit.mjs statusKelahiran —
// perhitungan yang sama dengan `migan status`). 23 Sep: kalimat lama "syarat bibit belum
// terdefinisi" ditulis mati di sini dan menjadi salah saat A4-BARU terpasang.
// 28 Sep 2026 (keputusan Fahmi): kriteria BERLAKU = Gerbang-S1 MENANG (data.kelahiran.s1, eval/gerbang-s1/
// kelahiran-s1.mjs). Kartu A4-BARU di bawahnya ditampilkan sebagai SEJARAH, bukan status.
function blokS1(data) {
  const s1 = data.kelahiran?.s1;
  if (!s1) return `<div class="peringatan"><b>Status kelahiran (Gerbang-S1) tidak terbaca.</b><br>Pra-daftar Gerbang-S1 tidak ditemukan — dunia tidak menebak.</div>`;
  const judul = s1.tingkat === "LAHIR" ? "MAKSARA lahir — Gerbang-S1 MENANG" : s1.tingkat === "GUGUR" ? "Embrio gugur — Gerbang-S1 tidak menang dalam tenggat" : "Embrio — menunggu vonis Gerbang-S1";
  const kelas = s1.tingkat === "LAHIR" ? "lulus" : s1.tingkat === "GUGUR" ? "gagal" : "netral";
  return `<div class="peringatan"><b>${esc(judul)}.</b><br>Kriteria berlaku: ${esc(s1.kriteria)}. ${esc(s1.keputusan)}</div>
    <div class="kisi" style="margin-top:14px"><article class="kartu"><span class="angka-besar"><span class="status ${kelas}">${esc(s1.tingkat)}</span></span><h3>Gerbang-S1 · vonis ${esc(s1.vonis.keadaan ?? "—")}</h3><p>${esc(s1.vonis.hasil ?? "belum ada vonis")} · tenggat ${esc(s1.tenggat)} (${s1.hariTersisa} hari) · pra-daftar ${s1.dikunci ? "terkunci" : "belum dikunci"}</p>${badgeSumber(data, "kelahiran.s1")}</article></div>`;
}

export function kelahiranBlok(data) {
  const k = data.kelahiran;
  if (!k) return `<div class="peringatan"><b>Status kelahiran tidak terbaca.</b><br>Aturan A4-BARU tidak ditemukan di pra-daftarnya — dunia tidak menebak.</div>`;
  if (k.kriteria === "gerbang-s1") return `${blokS1(data)}<details style="margin-top:14px"><summary class="redup">Kriteria lama A4-BARU (bobot generatif) — sejarah, basi sejak belok 27 Sep</summary>${kelahiranLama(data)}</details>`;
  return kelahiranLama(data);
}

function kelahiranLama(data) {
  const k = data.kelahiran;
  if (!k?.bobot) return `<p class="redup">Data A4-BARU tidak ada.</p>`;
  const s = k.sistem;
  const judul = s?.tingkat === "LAHIR" ? "Embrio lahir — pada sumbu kejujuran" : s?.tingkat === "BIBIT" ? "Embrio terjaga sebagai bibit — belum lahir" : "Embrio belum bibit";
  const kartuSistem = s ? `<article class="kartu"><span class="angka-besar"><span class="status ${kelasTingkat(s.tingkat)}">${esc(s.tingkat)}</span></span><h3>Sistem yang dilayankan · ${esc(s.konfigurasi)}</h3><p>${angka(s.rata)} % mengarang · CI95 atas ${angka(s.ci95atas)} · n ${s.n} · jarak ke SASARAN_LAHIR ${angka(s.jarakKeLahirPp)} pp</p>${badgeSumber(data, "kelahiran.sistem")}</article>` : "";
  const kartuBobot = k.bobot.map((b) => `<article class="kartu"><span class="angka-besar"><span class="status ${kelasTingkat(b.tingkat)}">${esc(b.tingkat)}</span></span><h3>Bobot ${esc(b.model)}</h3><p>${angka(b.rata)} % mengarang (putaran polos) · CI95 atas ${angka(b.ci95atas)} · n ${b.n}</p>${badgeSumber(data, `kelahiran.bobot.${b.model}`)}</article>`).join("");
  return `<div class="peringatan"><b>${esc(judul)}.</b><br>${esc(k.aturanTampil)}</div><div class="kisi" style="margin-top:14px">${kartuSistem}${kartuBobot}</div><p class="redup" style="margin-top:8px">Ambang A4-BARU: BIBIT bila mengarang ≤ ${k.aturan.lantaiBibit.rataMaks} % dan CI95 atas &lt; ${k.aturan.lantaiBibit.ci95atasMaks} % · LAHIR bila ≤ ${k.aturan.sasaranLahir.rataMaks} % dan CI95 atas &lt; ${k.aturan.sasaranLahir.ci95atasMaks} %. Sumber: ${esc(k.sumber)}.</p>`;
}

/** Ringkasan satu baris untuk kartu/label — dirakit, tidak ditulis mati. */
export function ringkasKelahiran(data) {
  const k = data.kelahiran;
  if (!k) return "Status kelahiran tidak terbaca";
  if (k.kriteria === "gerbang-s1" && k.s1) return `Embrio: Gerbang-S1 ${k.s1.tingkat} · tenggat ${k.s1.tenggat}`;
  const b = k.bobot.find((x) => x.model === data.modelBerlaku?.tag) || k.bobot[0];
  return `Embrio: sistem ${k.sistem?.tingkat ?? "—"} · bobot ${b ? `${b.model.replace("migancore:", "")} ${b.tingkat}` : "—"}`;
}

function beranda(data) {
  return `${kelahiranBlok(data)}
    <div class="kisi" style="margin-top:14px"><article class="kartu"><span class="angka-besar">${esc(data.modelBerlaku.tag)}</span><h3>Model berlaku</h3><p>Sejak ${esc(data.modelBerlaku.sejak)}</p>${badgeSumber(data,"modelBerlaku")}</article><article class="kartu"><span class="angka-besar">${data.praDaftar.length}</span><h3>Pra-daftar</h3><p>Vonis disimpan apa adanya.</p>${badgeSumber(data,"praDaftar.length")}</article><article class="kartu"><span class="angka-besar">A4</span><h3>Syarat kelahiran</h3><p>${esc(data.sorotan.A4)}</p>${badgeSumber(data,"sorotan.A4")}</article></div>`;
}

function riset(data) {
  const items = data.praDaftar.map((item) => `<article class="baris-data"><div><b>${esc(item.id)}</b><br>${status(item.keadaan)}</div><div><strong>${esc(item.judul || "Judul tidak tersedia di snapshot")}</strong><p>${esc(item.hasil)}</p>${badgeSumber(data,`praDaftar.${item.id}`)}</div></article>`).join("");
  return `<div class="kisi"><article class="kartu"><span class="angka-besar">${data.praDaftar.length}</span><h3>Pra-daftar</h3></article>${Object.entries(data.ringkasVonis).map(([k,v])=>`<article class="kartu"><span class="angka-besar">${v}</span><h3>${status(k)}</h3></article>`).join("")}</div><h3 style="margin-top:22px">Sorotan</h3><div class="kisi">${["A4","E2","A3","HRAGU"].filter((k)=>data.sorotan[k]).map((k)=>`<article class="kartu"><h3>${k}</h3><p>${esc(data.sorotan[k])}</p>${badgeSumber(data,`sorotan.${k}${data.sumberSorotan?.[k] ? ` · ${data.sumberSorotan[k]}` : ""}`)}</article>`).join("")}</div><h3 style="margin-top:22px">Buku pra-daftar</h3>${items}`;
}

function lab(data) {
  const hukum = data.hukum.terbaru.map((item)=>`<article class="baris-data"><b>${esc(item.id)}</b><p>${esc(item.judul)}</p></article>`).join("");
  const temuan = data.temuan.terbaru.map((item)=>`<article class="baris-data"><b>${esc(item.id)}</b><p>${esc(item.judul)}</p></article>`).join("");
  return `<div class="kisi"><article class="kartu"><span class="angka-besar">${data.hukum.jumlah}</span><h3>Hukum C-xx</h3><p>Snapshot memuat judul ${data.hukum.terbaru.length} hukum terbaru.</p>${badgeSumber(data,"hukum")}</article><article class="kartu"><span class="angka-besar">${data.temuan.jumlah}</span><h3>Temuan F-xxx</h3><p>Snapshot memuat judul ${data.temuan.terbaru.length} temuan terbaru.</p>${badgeSumber(data,"temuan")}</article></div><div class="peringatan" style="margin-top:14px">Data sumber hanya menyediakan ID + judul untuk entri terbaru; prototipe tidak mengarang judul bagi ${data.hukum.jumlah-data.hukum.terbaru.length} hukum dan ${data.temuan.jumlah-data.temuan.terbaru.length} temuan lain.</div><div class="kisi" style="margin-top:14px"><section class="kartu"><h3>Pedang hukum terbaru</h3>${hukum}</section><section class="kartu"><h3>Pedang temuan terbaru</h3>${temuan}</section></div>`;
}

function silsilah(data) {
  return `<div class="peringatan">BERLABEL instrumen <b>petak-jujur2</b>. Angka lintas instrumen tidak boleh dibandingkan tanpa label.</div><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;margin-top:14px"><thead><tr><th>Model × kondisi</th><th>n putaran</th><th>MENGARANG</th><th>Over-refusal</th><th>Fakta</th></tr></thead><tbody>${data.tanggaMengarang_petakJujur2.map((row)=>`<tr><td>${esc(row.model)}</td><td>${row.putaranSah}</td><td>${row.mengarangRata.toLocaleString("id-ID")}%</td><td>${row.overRefusalRata.toLocaleString("id-ID")}%</td><td>${row.faktaRata.toLocaleString("id-ID")}</td></tr>`).join("")}</tbody></table></div>${badgeSumber(data,"tanggaMengarang_petakJujur2")}`;
}

function retrieval(data) {
  return `<div class="kosong"><b>Belum ada data audit retrieval MiganCore.</b><p>Wilayah ini sengaja kosong. Keberadaan sungai adalah metafora aliran retrieval, bukan bukti retrieval telah diaudit atau tersambung.</p>${badgeSumber(data,"ketiadaan field audit retrieval")}</div>`;
}

function backlog(data) {
  const groups = kelompokBacklog(data);
  const list = (items) => items.map((item)=>`<article class="baris-data"><b>${esc(item.kode)}</b><div><strong>${esc(item.apa)}</strong><p>Tujuan: ${esc(item.tujuan)}<br>Status: ${esc(item.status || "tidak diisi")}</p></div></article>`).join("");
  return `<div class="kisi"><article class="kartu"><span class="angka-besar">${data.backlog.length}</span><h3>Episode</h3>${badgeSumber(data,"backlog.length")}</article><article class="kartu"><span class="angka-besar">${groups.selesai.length}</span><h3>Bertanda selesai</h3></article><article class="kartu"><span class="angka-besar">${groups.belum.length}</span><h3>Belum / terbuka</h3></article></div><h3 style="margin-top:22px">Papan misi</h3>${list(data.backlog)}`;
}

function dataAset(data) {
  // 23 Sep: bagian "Belum ditemukan: 29 adapter" dulu diketik di pembangkit dan salah sejak 10–11 Sep
  // (ke-29 adapter ditemukan). Sekarang hanya yang dibaca dari tabel doc 99 §2 yang tampil.
  return `<div class="kisi"><article class="kartu"><span class="angka-besar">${data.sensus.lokasi.length}</span><h3>Lokasi sensus</h3><p>${data.sensus.lokasi.map(esc).join(" · ")}</p></article><article class="kartu"><span class="angka-besar">${data.sensus.salinanTunggal.length}</span><h3>Artefak salinan tunggal</h3><p>Baris bersalinan 1 di ${esc(data.sensus.sumber || "doc 99")}.</p></article></div><h3 style="margin-top:22px">Salinan tunggal</h3>${data.sensus.salinanTunggal.map((item)=>`<article class="baris-data"><b>TINGGAL SATU</b><p>${esc(item)}</p></article>`).join("")}<div class="peringatan" style="margin-top:14px">Artefak yang ada tetapi belum pernah diukur tinggal di wilayah Kabut — bukan "hilang".</div>${badgeSumber(data,`sensus · ${data.sensus.sumber || ""}`)}`;
}

function mesin(data) {
  return `<div class="kisi">${data.mesin.map((item)=>`<article class="kartu"><h3>${esc(item.nama)}</h3><p>${esc(item.peran)}</p>${item.catatan?`<small>${esc(item.catatan)}</small>`:""}</article>`).join("")}</div>${badgeSumber(data,"mesin")}`;
}

function logKabut(data) {
  const belumPra = data.praDaftar.filter((item)=>item.keadaan === "belum");
  const belumEpisode = kelompokBacklog(data).belum;
  return `<div class="peringatan">Kabut tersingkap hanya oleh vonis nyata. Tombol, animasi, dan kunjungan pemain tidak mengubah status.</div><div class="kisi" style="margin-top:14px"><section class="kartu"><h3>Pra-daftar belum · ${belumPra.length}</h3>${belumPra.map((item)=>`<article class="baris-data"><b>${esc(item.id)}</b><p>${esc(item.hasil)}</p></article>`).join("")}</section><section class="kartu"><h3>Episode belum / terbuka · ${belumEpisode.length}</h3>${belumEpisode.map((item)=>`<article class="baris-data"><b>${esc(item.kode)}</b><p>${esc(item.status || item.tujuan)}</p></article>`).join("")}</section></div>${badgeSumber(data,"praDaftar + backlog")}`;
}

function ajar(data) {
  return `<div class="kosong"><b>Playground ajar belum tersambung.</b><p>Arena meminjam pola Adu Model, tetapi data sumber ini belum memiliki sesi ajar, skenario, atau hasil banding yang dapat ditampilkan sebagai fakta.</p><button class="tombol" type="button" data-buka-chat>Buka Balai Bicara dan Adu Model</button>${badgeSumber(data,"tidak ada field sesi ajar")}</div>`;
}

function majelis(data) {
  return `<div class="kosong"><b>Majelis &amp; guru masih kosong.</b><p>Tidak ada anggota, guru, keputusan, atau sidang di data sumber. Lingkar monolit adalah ruang yang disiapkan, bukan klaim bahwa majelis telah berjalan.</p>${badgeSumber(data,"tidak ada field majelis")}</div>`;
}

function bukuBesar(data) {
  return `<div class="kosong"><b>Belum ada data Buku Besar di snapshot.</b><p>Wilayah ini adalah lensa baca-saja untuk <code><memory-dir>/BOOK/</code> dan entri <code>brain_learn</code>. <code>data-nyata.json</code> belum membawa isi, status pengganti, atau hasil MCP, sehingga tidak ada pengetahuan lintas proyek yang ditampilkan.</p>${badgeSumber(data,"tidak ada field bukuBesar")}</div>`;
}

function galatInsiden(data) {
  return `<div class="kisi"><article class="kartu"><span class="angka-besar">${data.registerCacat.jumlahKelas}</span><h3>Kelas cacat</h3><p>Dibaca dari register kanonik.</p>${badgeSumber(data,"registerCacat.jumlahKelas")}</article><article class="kartu"><span class="angka-besar">${data.registerCacat.dijaga}</span><h3>Memiliki penjaga</h3><p>Tidak disamakan dengan bebas cacat.</p>${badgeSumber(data,"registerCacat.dijaga")}</article></div><div class="kosong" style="margin-top:14px"><b>Belum ada register insiden runtime di snapshot.</b><p>Tunnel mati, mesin salah, putaran gagal, dan galat jaringan tidak ditampilkan tanpa daftar insiden beserta bukti berkas/log.</p>${badgeSumber(data,"tidak ada field insidenRuntime")}</div>`;
}

function sejarah(data) {
  return `<div class="kosong"><b>Belum ada garis waktu tunggal di snapshot.</b><p>Data versi model, waktu kunci/vonis, temuan, hukum, keputusan, dan insiden belum dibangkitkan sebagai rangkaian bertanggal. Angka dari panel lain tidak disusun ulang menjadi sejarah rekaan.</p>${badgeSumber(data,"tidak ada field sejarah")}</div>`;
}

function kabut(data) {
  const belum = data.praDaftar.filter((item) => item.keadaan === "belum");
  const daftar = belum.map((item) => `<article class="baris-data"><b>${esc(item.id)}</b><div><strong>${esc(item.judul || "Judul tidak tersedia di snapshot")}</strong><p>${esc(item.hasil || "Belum ada hasil")}</p></div></article>`).join("");
  return `<div class="peringatan">Rawa Selubung Sunyi hanya memuat pra-daftar yang sumbernya berstatus <b>belum</b>. Ide lain tidak ditambahkan tanpa asal dan syarat mulai.</div>${belum.length ? `<h3 style="margin-top:22px">Pra-daftar belum diuji · ${belum.length}</h3>${daftar}` : `<div class="kosong" style="margin-top:14px"><b>Belum ada hipotesis berstatus belum.</b><p>Snapshot tidak memberi butir yang boleh ditampilkan.</p></div>`}${badgeSumber(data,"praDaftar[keadaan=belum]")}`;
}

function akademi(data) {
  return `<div class="kosong"><b>Belum ada paket pelajaran Akademi di snapshot.</b><p>Urutan panen → saring → laporan → mata manusia → latih → gerbang, glosarium, penjelasan hukum, dan tur terpandu harus menautkan sumber kanonik. Snapshot belum menyediakan tautan atau materi itu.</p>${badgeSumber(data,"tidak ada field akademi")}</div>`;
}

function penjagaJejak(data) {
  return `<div class="kosong"><b>Belum ada keluaran detektor Penjaga Jejak.</b><p>Snapshot belum memuat pemeriksaan berkas lebih baru dari CHANGELOG, pra-daftar mandek &gt;7 hari, bobot tanpa evaluasi, rujukan F/C yatim, atau angka bertentangan. Kosong ini bukan status hijau.</p>${badgeSumber(data,"tidak ada field penjagaJejak")}</div>`;
}

function isi(id, data) {
  if (id === "beranda") return beranda(data);
  if (id === "silsilah") return silsilah(data);
  if (id === "riset") return riset(data);
  if (id === "lab") return lab(data);
  if (id === "retrieval") return retrieval(data);
  if (id === "ajar") return ajar(data);
  if (id === "backlog") return backlog(data);
  if (id === "data") return dataAset(data);
  if (id === "majelis") return majelis(data);
  if (id === "log") return logKabut(data);
  if (id === "mesin") return mesin(data);
  if (id === "buku-besar") return bukuBesar(data);
  if (id === "galat-insiden") return galatInsiden(data);
  if (id === "sejarah") return sejarah(data);
  if (id === "kabut") return kabut(data);
  if (id === "akademi") return akademi(data);
  if (id === "penjaga-jejak") return penjagaJejak(data);
  return "";
}

export function buatPanel(data, { onClose, onOpen }) {
  const layer = document.querySelector("#panel-modul");
  const title = document.querySelector("#judul-panel");
  const eyebrow = document.querySelector("#alis-panel");
  const subtitle = document.querySelector("#subjudul-panel");
  const host = document.querySelector("#isi-panel");
  const source = document.querySelector("#sumber-panel");
  let lastFocus = null;

  function open(id) {
    const module = cariModul(id);
    lastFocus = document.activeElement;
    title.textContent = module.label;
    eyebrow.textContent = module.wilayah.toUpperCase();
    subtitle.textContent = `${module.landmark} · ${module.deskripsi}`;
    source.textContent = metaSumber(data, id);
    host.innerHTML = id === "chat" ? "" : isi(id, data);
    if (id === "chat") renderBalai(data, host);
    host.querySelector("[data-buka-chat]")?.addEventListener("click", () => open("chat"));
    layer.hidden = false;
    document.querySelector("#tutup-panel").focus();
    history.replaceState(null, "", `#${id}`);
    document.querySelectorAll(".nav-modul").forEach((button)=>button.setAttribute("aria-current", String(button.dataset.nav === id)));
  }
  function close() {
    layer.hidden = true;
    history.replaceState(null, "", "#dunia");
    onClose?.();
    lastFocus?.focus?.();
  }
  document.querySelector("#tutup-panel").addEventListener("click", close);
  layer.addEventListener("pointerdown", (event) => { if (event.target === layer) close(); });
  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && !layer.hidden) close(); });
  document.querySelectorAll("[data-modul]").forEach((element)=>element.addEventListener("click", (event)=>{ event.preventDefault(); onOpen?.(element.dataset.modul); }));
  return { open, close, get terbuka() { return !layer.hidden; } };
}

export function ringkasanKartu(id, data) {
  if (id === "beranda") return ringkasKelahiran(data);
  if (id === "silsilah") return `${data.tanggaMengarang_petakJujur2.length} model × kondisi · petak-jujur2`;
  if (id === "riset") return `${data.praDaftar.length} pra-daftar · ${data.ringkasVonis.lulus} lulus · ${data.ringkasVonis.gagal} gagal`;
  if (id === "lab") return `${data.hukum.jumlah} hukum · ${data.temuan.jumlah} temuan`;
  if (id === "retrieval") return "Belum ada data audit retrieval MiganCore";
  if (id === "chat") return "Chat desktop rasa game · backend belum tersambung";
  if (id === "ajar") return "Playground dan Adu Model · belum tersambung";
  if (id === "backlog") return `${data.backlog.length} episode · status hanya dari data`;
  if (id === "data") return `${data.sensus.lokasi.length} lokasi · salinan tunggal ditandai`;
  if (id === "majelis") return "Keadaan kosong jujur";
  if (id === "log") return "Yang belum dicoba tetap berkabut";
  if (id === "mesin") return `${data.mesin.length} mesin dan perannya`;
  if (id === "buku-besar") return "Belum ada data BOOK / brain_learn di snapshot";
  if (id === "galat-insiden") return `${data.registerCacat.jumlahKelas} kelas cacat · ${data.registerCacat.dijaga} dijaga · insiden kosong`;
  if (id === "sejarah") return "Belum ada garis waktu tunggal di snapshot";
  if (id === "kabut") return `${data.praDaftar.filter((item)=>item.keadaan === "belum").length} pra-daftar berstatus belum`;
  if (id === "akademi") return "Belum ada paket pelajaran di snapshot";
  return "Belum ada keluaran detektor Penjaga Jejak";
}

export function bangunModeBaca(data, onOpen) {
  const host = document.querySelector("#kisi-baca");
  host.innerHTML = MODUL.map((module)=>`<button class="kartu-baca" type="button" data-baca="${module.id}"><span class="ikon">${module.ikon}</span><h2>${module.label}</h2><p>${ringkasanKartu(module.id,data)}</p><small>${module.wilayah}</small></button>`).join("");
  host.querySelectorAll("[data-baca]").forEach((button)=>button.addEventListener("click",()=>onOpen(button.dataset.baca)));
}
