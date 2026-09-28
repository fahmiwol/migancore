import { badgeSumber, esc } from "./data.mjs";

export function renderBalai(data, host) {
  const a3 = data.praDaftar.find((item) => item.id === "A3-JANGKAR");
  const hragu = data.praDaftar.find((item) => item.id === "H-RAGU");
  host.innerHTML = `
    <div class="balai" aria-label="Prototipe Balai Bicara">
      <aside class="balai-rail">
        <h3>Percakapan</h3>
        <div class="daftar-bicara">
          <button class="butir-bicara aktif" type="button">Status kelahiran</button>
          <button class="butir-bicara" type="button">Audit H-RAGU</button>
          <button class="butir-bicara" type="button">Tangga model</button>
        </div>
        <h3 style="margin-top:22px">Proyek</h3>
        <div class="daftar-bicara"><button class="butir-bicara" type="button">Kandungan</button><button class="butir-bicara" type="button">Petak Jujur 2</button></div>
      </aside>
      <section class="ruang-bicara">
        <div class="bilah-model">
          <label for="model-chat">Model</label>
          <select id="model-chat"><option>Bmax · model belum dipilih</option><option>Laptop · model belum dipilih</option><option>VPS-2 · cadangan</option></select>
          <span class="cap-mesin">MESIN · Bmax</span>
          <span class="cap-prototipe">CONTOH ANTARMUKA — BELUM TERSAMBUNG</span>
        </div>
        <div class="pengaturan-jalan" aria-label="Pengaturan jalan model">
          <label>Suhu <output data-output="suhu">0,3</output><input data-range="suhu" type="range" min="0" max="1" step="0.1" value="0.3"></label>
          <label>Top-p <output data-output="top-p">0,9</output><input data-range="top-p" type="range" min="0" max="1" step="0.1" value="0.9"></label>
          <label>Konteks <output data-output="konteks">8k</output><input data-range="konteks" type="range" min="2" max="32" step="2" value="8"></label>
          <label>Instruksi sistem <select aria-label="Instruksi sistem"><option>Gerbang jujur</option><option>Tanpa instruksi</option></select></label>
        </div>
        <div id="transkrip-chat" class="transkrip" aria-live="polite">
          <div class="gelembung sistem"><strong>STATUS PROTOTIPE</strong>Backend dan model belum tersambung. Antarmuka tidak akan mengarang jawaban. Konteks di kanan berasal dari data lokal yang nyata.</div>
          <div class="gelembung"><strong>CONTOH PESAN PENGGUNA</strong>Apa yang menghalangi kelahiran MAKSARA?</div>
          <div class="gelembung sistem"><strong>JAWABAN TIDAK DIJALANKAN</strong>Model tidak dipanggil. Sambungkan retrieval dan endpoint MiganCore agar jawaban dapat disintesis serta dicantumkan sumbernya.</div>
          <details class="jejak-alat"><summary>Jejak alat · 0 pemanggilan nyata</summary><p>Belum ada alat yang dipanggil. Urutan produksi yang dirancang: <code>meta → sumber → delta → selesai</code>.</p></details>
          <div class="meter-ai"><span>Token: —</span><span>Latensi: —</span><span>Jalur: belum tersambung</span></div>
        </div>
        <form id="form-chat" class="form-chat">
          <textarea aria-label="Pesan untuk Migan" placeholder="Tulis pesan… (tidak akan dikirim)"></textarea>
          <button class="tombol utama" type="submit">Kirim</button>
        </form>
      </section>
      <aside class="balai-konteks">
        <div>
          <h3>Konteks &amp; sumber</h3>
          <article class="lempeng-rune"><b><span>A3-JANGKAR</span><span>1,00</span></b><p>${esc(a3?.judul)}</p><button class="tombol" type="button" data-open-source="praDaftar.A3-JANGKAR">Buka sumber</button></article>
          <article class="lempeng-rune"><b><span>H-RAGU</span><span>0,93</span></b><p>${esc(hragu?.judul)}</p><button class="tombol" type="button" data-open-source="praDaftar.H-RAGU">Buka sumber</button></article>
          ${badgeSumber(data, "praDaftar")}
        </div>
        <div>
          <h3>Adu Model</h3>
          <button id="toggle-adu" class="tombol" type="button" aria-expanded="false">Buka banding</button>
          <div id="adu-model" class="adu-model" hidden>
            <div class="kolom-model"><b>Model A</b><p>Belum dijalankan</p></div><div class="kolom-model"><b>Model B</b><p>Belum dijalankan</p></div>
          </div>
          <label style="display:flex;gap:8px;margin-top:14px;color:var(--redup)"><input id="pratinjau-pikir" type="checkbox"> Pratinjau visual embrio berpikir (visual saja)</label>
        </div>
      </aside>
    </div>`;

  host.querySelectorAll("[data-range]").forEach((input) => {
    input.addEventListener("input", () => {
      const name = input.dataset.range;
      const value = name === "konteks" ? `${input.value}k` : Number(input.value).toLocaleString("id-ID", { maximumFractionDigits: 1 });
      host.querySelector(`[data-output="${name}"]`).textContent = value;
    });
  });
  host.querySelector("#form-chat").addEventListener("submit", (event) => {
    event.preventDefault();
    const textarea = event.currentTarget.querySelector("textarea");
    if (!textarea.value.trim()) return;
    const message = document.createElement("div");
    message.className = "gelembung sistem";
    message.innerHTML = "<strong>TIDAK DIKIRIM</strong>Backend belum tersambung. Pesan tetap hanya di bidang input lokal.";
    host.querySelector("#transkrip-chat").append(message);
    window.dispatchEvent(new CustomEvent("kandungan:pesan", { detail: "Pesan tidak dikirim — backend belum tersambung." }));
  });
  host.querySelector("#toggle-adu").addEventListener("click", (event) => {
    const comparison = host.querySelector("#adu-model");
    comparison.hidden = !comparison.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!comparison.hidden));
  });
  host.querySelector("#pratinjau-pikir").addEventListener("change", (event) => {
    window.dispatchEvent(new CustomEvent("kandungan:pikir", { detail: Boolean(event.currentTarget.checked) }));
  });
  host.querySelectorAll("[data-open-source]").forEach((button) => button.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("kandungan:pesan", { detail: `Sumber lokal: data-nyata.json · commit ${data._commit} · ${button.dataset.openSource}` }));
  }));
}
