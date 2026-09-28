import { MODUL } from "./peta-modul.mjs";
import { pasangCapSumber } from "./data.mjs";

export function buatHud(data, { onOpen, onTravel, onReadMode }) {
  const nav = document.querySelector("#navigasi-utama");
  const minimap = document.querySelector("#minimap");
  const namaWilayah = document.querySelector("#nama-wilayah");
  const namaModul = document.querySelector("#nama-modul");
  const petunjuk = document.querySelector("#petunjuk-interaksi");
  const titik = document.querySelector("#titik-pemain");

  nav.innerHTML = MODUL.map((item)=>`<button class="nav-modul" type="button" data-nav="${item.id}">${item.label}</button>`).join("");
  nav.querySelectorAll("[data-nav]").forEach((button)=>button.addEventListener("click",()=>onOpen(button.dataset.nav)));
  for (const item of MODUL) {
    const button = document.createElement("button");
    button.className = "ikon-peta";
    button.type = "button";
    button.style.left = `${item.peta[0]}%`;
    button.style.top = `${item.peta[1]}%`;
    button.textContent = item.ikon;
    button.title = `Pindah cepat: ${item.wilayah}`;
    button.setAttribute("aria-label", `Pindah cepat ke ${item.wilayah}`);
    button.addEventListener("click",()=>onTravel(item));
    minimap.append(button);
  }
  document.querySelector("#mode-baca").addEventListener("click",()=>onReadMode());
  document.querySelectorAll("[data-kembali-dunia]").forEach((button)=>button.addEventListener("click",()=>onReadMode(false)));
  pasangCapSumber(document.querySelector("#sumber-ringkas"), data);

  function updatePosition(position) {
    titik.style.left = `${Math.max(4, Math.min(96, 50 + (position.x / 78) * 46))}%`;
    titik.style.top = `${Math.max(4, Math.min(96, 50 + (position.z / 78) * 46))}%`;
  }
  function updateNearby(nearby) {
    if (!nearby) return;
    namaWilayah.textContent = nearby.item.wilayah;
    namaModul.textContent = nearby.item.deskripsi;
    const active = nearby.distance <= 5.8;
    petunjuk.classList.toggle("aktif", active);
    petunjuk.querySelector("span").textContent = active ? `Buka ${nearby.item.landmark}` : `Menuju ${nearby.item.wilayah} · ${nearby.distance.toFixed(0)} m`;
  }
  function setReadMode(active) {
    document.querySelector("#mode-baca").setAttribute("aria-pressed", String(active));
    document.querySelector("#mode-baca").lastChild.textContent = active ? " Dunia 3D" : " Mode Baca";
  }
  return { updatePosition, updateNearby, setReadMode };
}

export function updateMeter(renderer, fps, kualitas) {
  document.querySelector("#meter-fps").textContent = Math.round(fps).toLocaleString("id-ID");
  document.querySelector("#meter-draw").textContent = renderer.info.render.calls.toLocaleString("id-ID");
  document.querySelector("#meter-tri").textContent = renderer.info.render.triangles.toLocaleString("id-ID");
  document.querySelector("#tingkat-kualitas").textContent = kualitas;
}
