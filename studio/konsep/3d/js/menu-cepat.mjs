import { MODUL } from "./peta-modul.mjs";

export function buatMenuCepat(onOpen) {
  const layer = document.querySelector("#menu-cepat");
  const host = document.querySelector("#butir-menu");
  let selected = 0;
  let lastFocus = null;
  host.innerHTML = MODUL.map((item, index) => {
    const sectors = Math.ceil(MODUL.length / 2);
    const ring = index % 2;
    const angle = (Math.floor(index / 2) / sectors) * Math.PI * 2 - Math.PI / 2 + ring * 0.12;
    const radius = ring ? 45 : 31;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    return `<button type="button" data-index="${index}" data-modul="${item.id}" style="left:${x}%;top:${y}%"><b>${item.ikon} ${item.label}</b><span>${item.wilayah}</span></button>`;
  }).join("");
  const buttons = [...host.querySelectorAll("button")];

  function select(index) {
    selected = (index + buttons.length) % buttons.length;
    buttons.forEach((button, i) => button.classList.toggle("dipilih", i === selected));
    buttons[selected].focus();
  }
  function open() {
    if (!layer.hidden) return;
    lastFocus = document.activeElement;
    layer.hidden = false;
    select(selected);
  }
  function close() {
    if (layer.hidden) return;
    layer.hidden = true;
    lastFocus?.focus?.();
  }
  function choose(id) { close(); onOpen(id); }
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => choose(button.dataset.modul));
    button.addEventListener("focus", () => { selected = index; buttons.forEach((b,i)=>b.classList.toggle("dipilih",i===selected)); });
  });
  document.querySelector("#buka-menu").addEventListener("click", () => layer.hidden ? open() : close());
  layer.addEventListener("pointerdown", (event) => { if (event.target === layer) close(); });
  window.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName;
    const isForm = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
    if (event.key === "Tab" && !isForm) { event.preventDefault(); layer.hidden ? open() : close(); return; }
    if (layer.hidden) return;
    if (["ArrowRight", "ArrowDown"].includes(event.key)) { event.preventDefault(); select(selected + 1); }
    if (["ArrowLeft", "ArrowUp"].includes(event.key)) { event.preventDefault(); select(selected - 1); }
    if (event.key === "Enter") { event.preventDefault(); choose(buttons[selected].dataset.modul); }
    if (event.key === "Escape") { event.preventDefault(); close(); }
  });
  return { open, close, get terbuka() { return !layer.hidden; } };
}
