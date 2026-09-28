"use client";
import { useCallback, useState } from "react";
import { Newspaper, Loader2, Search } from "lucide-react";
import { Pusaka } from "@/components/Pusaka";
import { askMigan } from "@/lib/migancore";

// Warta — live news/issues panel. Pulls real "berita hari ini" via the brain's
// web tools (askMigan → reflex-bypass → onamix_search; all via MiganCore, Amanah).
// Random (general Indonesia) by default; "watched" via the topic box. Lazy (a
// button) so the dashboard doesn't fire a ~slow CPU web-search on every load.
export function Warta() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState("");
  const [topic, setTopic] = useState("");

  const load = useCallback(async (t?: string) => {
    setBusy(true);
    setText("");
    setTool("");
    const q = t && t.trim()
      ? `cari berita terkini tentang ${t.trim()} hari ini — ringkas 3-5 poin penting, sertakan sumber.`
      : `cari berita penting Indonesia hari ini — ringkas 3-5 poin, sertakan sumber.`;
    try {
      let acc = "";
      for await (const c of askMigan(q)) {
        if (c.tool?.phase === "start") setTool("Mencari berita…");
        else if (c.tool?.phase === "result") setTool("✓ sumber ditemukan");
        if (c.delta) { acc += c.delta; setText(acc); }
        if (c.done) break;
      }
    } catch {
      setText("Gagal memuat berita. Coba lagi.");
    } finally {
      setBusy(false);
      setTool("");
    }
  }, []);

  return (
    <Pusaka title="Berita & isu" icon={<Newspaper size={13} />} delay={0.2}>
      {text ? (
        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[10.5px] leading-relaxed text-[#9fc7cf]">{text}</div>
      ) : (
        <p className="text-[10.5px] leading-relaxed text-[#577f86]">Berita terkini hari ini — diambil dari web, sumber tercantum.</p>
      )}
      {tool && <p className="mt-1 text-[10px] text-[#7fe9ff]">{tool}</p>}
      <div className="mt-2 flex gap-1.5">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) load(topic); }}
          placeholder="topik tertentu (opsional)"
          className="min-w-0 flex-1 rounded-md border border-[#1d3b44] bg-[#0c1e26] px-2 py-1 text-[10.5px] text-[#dff4f7] outline-none placeholder:text-[#577f86] focus:border-[#2f6f7f]"
        />
        <button
          onClick={() => load(topic)}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-[#1d3b44] bg-[#0c1e26] px-2 py-1 text-[10.5px] text-[#7fe9ff] transition-colors hover:border-[#2f6f7f] disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />} Muat
        </button>
      </div>
    </Pusaka>
  );
}
