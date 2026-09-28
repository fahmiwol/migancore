// Mock content for the gesture-summoned content layer (Lapisan Konten).
// MVP only — later these wire to real files/photos/videos via the brain
// (e.g. /v1/memory/knowledge, a file index, or local-first Khazanah).
export type ContentCard = {
  id: string;
  title: string;
  type: "files" | "photos" | "videos" | "folders" | "notes" | "recentDocs" | "projects" | "gallery";
  count: number;
  preview: string[];
};

export const CONTENT_CARDS: ContentCard[] = [
  { id: "files", title: "Berkas", type: "files", count: 128, preview: ["Proposal Q3.docx", "Anggaran 2026.xlsx", "Notulen rapat.pdf"] },
  { id: "photos", title: "Foto", type: "photos", count: 342, preview: ["Acara publik.png", "Tim.jpg", "Lokasi.jpg"] },
  { id: "videos", title: "Video", type: "videos", count: 47, preview: ["Sambutan.mp4", "Demo produk.mov"] },
  { id: "folders", title: "Folder", type: "folders", count: 19, preview: ["Proyek", "Pribadi", "Arsip"] },
  { id: "notes", title: "Catatan", type: "notes", count: 64, preview: ["Ide fitur", "To-do hari ini", "Draft pidato"] },
  { id: "recent", title: "Dokumen terbaru", type: "recentDocs", count: 12, preview: ["Laporan akhir.pdf", "Memo internal.docx"] },
  { id: "projects", title: "Proyek", type: "projects", count: 8, preview: ["MiganCore", "Balairung", "Khazanah"] },
  { id: "gallery", title: "Galeri", type: "gallery", count: 210, preview: ["Koleksi A", "Koleksi B", "Koleksi C"] },
];
