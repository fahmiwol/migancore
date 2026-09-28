// Khazanah — the treasury of knowledge: our local-first vault (the Obsidian we own).
// Plain markdown notes + [[wikilinks]] → backlink index + graph. Zero vendor: files are
// .md on the user's own box, git-synced. Vector RAG handled by MiganCore (Qdrant).
//
// This module is pure (operates on note objects) so it runs server- or client-side.
// PROD: feed `notes` from the brain's corpus API; embeddings/RAG stay in MiganCore.

export type Note = {
  id: string;        // slug / relative path without .md
  title: string;
  content: string;   // raw markdown body
  tags?: string[];
  updated?: string;
};

export type GraphData = {
  nodes: { id: string; title: string; degree: number }[];
  links: { source: string; target: string }[];
};

const WIKILINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;

/** Extract [[wikilink]] targets from a note body (normalized to lowercase slug). */
export function extractLinks(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(WIKILINK)) out.add(slug(m[1]));
  return [...out];
}

export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Backlink index: for each note id → the ids that link TO it. */
export function backlinkIndex(notes: Note[]): Record<string, string[]> {
  const idx: Record<string, string[]> = {};
  for (const n of notes) {
    for (const target of extractLinks(n.content)) {
      (idx[target] ??= []).push(n.id);
    }
  }
  return idx;
}

/** Build force-graph data from the vault (nodes = notes, edges = wikilinks). */
export function buildGraph(notes: Note[]): GraphData {
  const ids = new Set(notes.map((n) => n.id));
  const degree: Record<string, number> = {};
  const links: GraphData["links"] = [];
  for (const n of notes) {
    for (const target of extractLinks(n.content)) {
      if (!ids.has(target)) continue; // skip dangling links (a TODO note to write)
      links.push({ source: n.id, target });
      degree[n.id] = (degree[n.id] ?? 0) + 1;
      degree[target] = (degree[target] ?? 0) + 1;
    }
  }
  const nodes = notes.map((n) => ({ id: n.id, title: n.title, degree: degree[n.id] ?? 0 }));
  return { nodes, links };
}

/** Stub loader — replace with MiganCore corpus API (per-tenant, encrypted).
 * Titles use PLAIN everyday Indonesian (UI = plain, per naming rule). */
export async function loadVault(): Promise<Note[]> {
  return [
    { id: "privasi", title: "Privasi data", content: "Data milik [[pengguna]]. Tidak keluar dari [[server-lokal]]." },
    { id: "pengguna", title: "Pengguna", content: "Profil pimpinan. Terhubung ke [[sentimen]] dan [[jadwal]]." },
    { id: "sentimen", title: "Sentimen publik", content: "Suara publik → [[laporan]]." },
    { id: "laporan", title: "Laporan", content: "Ringkasan dari [[sentimen]] + [[berita]]." },
    { id: "berita", title: "Berita", content: "Berita harian untuk [[pengguna]]." },
    { id: "jadwal", title: "Jadwal", content: "Agenda [[pengguna]] hari ini." },
    { id: "server-lokal", title: "Server lokal", content: "Otak MiganCore. Lihat [[privasi]]." },
  ];
}
