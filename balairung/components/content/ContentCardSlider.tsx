"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Files, Image as ImageIcon, Video, Folder, StickyNote, FileText,
  FolderGit2, LayoutGrid, X, ChevronLeft,
} from "lucide-react";
import { CONTENT_CARDS, type ContentCard } from "@/lib/content/contentMock";

// ContentCardSlider — the gesture-summoned "Lapisan Konten" (floating card slider).
// Summoned by 10 fingers (Isyarat dispatches `balairung:content-show`); closed by a
// fist (`balairung:stop`), Escape, click-outside, or ✕. Cards are real DOM buttons,
// so the EXISTING Isyarat pipeline drives it with no new gesture code: 1 finger =
// cursor, 2 fingers = click (selects a card → expand), fist = close. Pinch-select /
// two-hand resize are future polish for the Ultraleap sensor (see doc 13).
const ICONS: Record<ContentCard["type"], React.ComponentType<{ size?: number; className?: string }>> = {
  files: Files, photos: ImageIcon, videos: Video, folders: Folder,
  notes: StickyNote, recentDocs: FileText, projects: FolderGit2, gallery: LayoutGrid,
};

export function ContentCardSlider() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<ContentCard | null>(null);

  const openedAt = useRef(0);
  const close = useCallback(() => {
    setOpen(false);
    setExpanded(null);
  }, []);
  // Ignore close gestures for a grace window after opening, so the natural hand
  // transition from "10 fingers" → pointing (which flickers through fist/0-finger
  // and re-detects 10) doesn't instantly dismiss the layer.
  const closeIfSettled = useCallback(() => {
    if (performance.now() - openedAt.current > 1200) close();
  }, [close]);

  useEffect(() => {
    // 10 fingers OPENS (idempotent — re-firing keeps it open, never toggles shut).
    const onShow = () => { setExpanded(null); setOpen(true); openedAt.current = performance.now(); };
    const onStop = () => closeIfSettled(); // fist closes, but only after the grace window
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("balairung:content-show", onShow);
    window.addEventListener("balairung:stop", onStop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("balairung:content-show", onShow);
      window.removeEventListener("balairung:stop", onStop);
      window.removeEventListener("keydown", onKey);
    };
  }, [close, closeIfSettled]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[8000] flex flex-col items-center justify-end bg-black/55 pb-[16vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeIfSettled}
        >
          <div
            className="mb-3 flex items-center gap-3 text-[11px] tracking-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-display text-[#7fe9ff]">LAPISAN KONTEN</span>
            <span className="text-[#577f86]">arahkan &amp; klik (2 jari) · kepal untuk tutup</span>
            <button onClick={close} className="text-[#577f86] transition-colors hover:text-[#9fc7cf]" aria-label="Tutup">
              <X size={14} />
            </button>
          </div>

          {expanded ? (
            <PreviewPanel card={expanded} onBack={() => setExpanded(null)} onClose={close} />
          ) : (
            <div
              className="flex max-w-[92vw] gap-3 overflow-x-auto px-4 pb-2"
              onClick={(e) => e.stopPropagation()}
            >
              {CONTENT_CARDS.map((c, i) => {
                const Icon = ICONS[c.type] ?? Files;
                return (
                  <motion.button
                    key={c.id}
                    initial={{ opacity: 0, y: 24, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: i * 0.04, ease: "easeOut" }}
                    whileHover={{ scale: 1.06, y: -4 }}
                    onClick={() => setExpanded(c)}
                    className="group flex w-[140px] shrink-0 flex-col gap-2 rounded-xl border border-[#1d3b44] bg-[#0a1820]/90 p-3 text-left shadow-lg transition-colors hover:border-[#2f9fb4]"
                  >
                    <Icon size={22} className="text-[#46f0c0] transition-all group-hover:drop-shadow-[0_0_8px_rgba(70,240,192,.8)]" />
                    <span className="text-[12px] font-medium text-[#dff4f7]">{c.title}</span>
                    <span className="text-[10px] text-[#577f86]">{c.count.toLocaleString("id-ID")} item</span>
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PreviewPanel({ card, onBack, onClose }: { card: ContentCard; onBack: () => void; onClose: () => void }) {
  const Icon = ICONS[card.type] ?? Files;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-lg rounded-xl border border-[#2f6f7f] bg-[#08141a]/95 p-5 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-[#dff4f7]">
          <Icon size={16} className="text-[#46f0c0]" /> {card.title}
          <span className="text-[10px] text-[#577f86]">{card.count.toLocaleString("id-ID")} item</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-md border border-[#1d3b44] px-2 py-1 text-[10.5px] text-[#9fc7cf] transition-colors hover:border-[#2f6f7f]"
          >
            <ChevronLeft size={12} /> Kembali
          </button>
          <button onClick={onClose} className="text-[#577f86] transition-colors hover:text-[#9fc7cf]" aria-label="Tutup">
            <X size={14} />
          </button>
        </div>
      </div>
      <ul className="space-y-1.5">
        {card.preview.map((p) => (
          <li key={p} className="flex items-center gap-2 rounded-md bg-[#0c1e26] px-3 py-2 text-[12px] text-[#cfeaf0]">
            <FileText size={13} className="shrink-0 text-[#46f0c0]" /> <span className="truncate">{p}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-[#577f86]">Pratinjau contoh — nanti tersambung ke berkas/galeri asli.</p>
    </motion.div>
  );
}
