"use client";
import {
  Calendar, MessageCircle, Mail, CheckSquare, FileText, Settings,
  Search, CalendarClock, Languages, Bell, Home,
} from "lucide-react";

// Akses — Quick Access + Active Modules. Real buttons. Clicking dispatches a
// "balairung:ask" event (Lisan runs it) OR a "balairung:open" event (router later).
// Because these are real DOM buttons, Isyarat (hand gesture) and voice can "click"
// them by synthesizing a click — no touch needed.
type Item = { label: string; icon: React.ReactNode; ask: string };

function emit(name: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function Bar({ title, items }: { title: string; items: Item[] }) {
  return (
    <div>
      <p className="pusaka-hd mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <button
            key={it.label}
            data-akses={it.label}
            onClick={() => emit("balairung:ask", it.ask)}
            className="group flex min-w-[72px] flex-col items-center gap-1 rounded-card border border-[rgba(0,230,255,0.18)] bg-[rgba(10,31,51,0.5)] px-3 py-2 text-[#9fc7cf] transition-all hover:border-[rgba(0,230,255,0.6)] hover:text-glow hover:shadow-glow active:scale-95"
            aria-label={it.label}
          >
            <span className="text-glow">{it.icon}</span>
            <span className="text-[10px] tracking-wide">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Akses() {
  const quick: Item[] = [
    { label: "Kalender", icon: <Calendar size={18} />, ask: "Tampilkan agenda saya hari ini." },
    { label: "Pesan", icon: <MessageCircle size={18} />, ask: "Ada pesan penting apa untuk saya?" },
    { label: "Email", icon: <Mail size={18} />, ask: "Ringkas email penting yang masuk." },
    { label: "Tugas", icon: <CheckSquare size={18} />, ask: "Apa tugas prioritas saya?" },
    { label: "Catatan", icon: <FileText size={18} />, ask: "Buka catatan terakhir saya." },
    { label: "Setelan", icon: <Settings size={18} />, ask: "Buka pengaturan." },
  ];
  const modules: Item[] = [
    { label: "Cari", icon: <Search size={18} />, ask: "Cari informasi:" },
    { label: "Jadwal", icon: <CalendarClock size={18} />, ask: "Atur jadwal saya minggu ini." },
    { label: "Terjemah", icon: <Languages size={18} />, ask: "Terjemahkan teks berikut:" },
    { label: "Pengingat", icon: <Bell size={18} />, ask: "Ingatkan saya untuk:" },
    { label: "Sentimen", icon: <Home size={18} />, ask: "Bagaimana sentimen publik hari ini?" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Bar title="Akses cepat" items={quick} />
      <Bar title="Modul aktif" items={modules} />
    </div>
  );
}
