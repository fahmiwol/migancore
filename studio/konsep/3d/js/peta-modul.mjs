export const MODUL = [
  { id: "beranda", label: "Beranda", ikon: "◉", wilayah: "Hutan Kandungan", landmark: "Embrio Ruh Migan", deskripsi: "Keadaan kelahiran MAKSARA tanpa kemajuan rekaan", posisi: [0, 0, 0], peta: [50, 50] },
  { id: "silsilah", label: "Silsilah", ikon: "◇", wilayah: "Padang Obelisk Emas", landmark: "Obelisk per model", deskripsi: "Tangga MENGARANG lintas model dan kondisi", posisi: [31, 0, 27], peta: [70, 30] },
  { id: "riset", label: "Riset", ikon: "⌁", wilayah: "Lembah Gerbang Patah", landmark: "Gerbang patah dan kristal", deskripsi: "Pra-daftar dan vonis yang tidak digeser", posisi: [-34, 0, -25], peta: [28, 68] },
  { id: "lab", label: "Lab", ikon: "†", wilayah: "Padang Pedang Rune", landmark: "Pedang hukum dan temuan", deskripsi: "Hukum C-xx serta temuan F-xxx", posisi: [34, 0, -23], peta: [72, 66] },
  { id: "retrieval", label: "Retrieval", ikon: "≈", wilayah: "Sungai Toska", landmark: "Aliran retrieval", deskripsi: "Keadaan audit retrieval saat ini", posisi: [4, 0, 31], peta: [52, 23] },
  { id: "chat", label: "Chat", ikon: "◫", wilayah: "Balai Bicara", landmark: "Paviliun di depan embrio", deskripsi: "Chat, konteks, alat, dan Adu Model", posisi: [7, 0, 9], peta: [55, 43] },
  { id: "ajar", label: "Ajar", ikon: "△", wilayah: "Lapangan Latihan", landmark: "Arena lingkar", deskripsi: "Playground ajar dan Adu Model", posisi: [21, 0, 16], peta: [64, 39] },
  { id: "backlog", label: "Backlog", ikon: "☷", wilayah: "Papan Misi Peziarah", landmark: "Tugu papan misi", deskripsi: "Episode dengan status dari data", posisi: [17, 0, 3], peta: [61, 49] },
  { id: "data", label: "Data", ikon: "⬡", wilayah: "Kepulauan Cincin", landmark: "Pulau sensus empat lokasi", deskripsi: "Sensus empat lokasi dan salinan tunggal", posisi: [-55, 0, 3], peta: [16, 48] },
  { id: "majelis", label: "Majelis", ikon: "○", wilayah: "Lingkar Majelis", landmark: "Monolit para guru", deskripsi: "Ruang majelis dan guru", posisi: [-18, 0, -3], peta: [39, 53] },
  { id: "log", label: "Log", ikon: "▤", wilayah: "Kabut Tepi Dunia", landmark: "Kabut yang belum tersingkap", deskripsi: "Pra-daftar belum dan episode belum berjalan", posisi: [58, 0, 3], peta: [85, 49] },
  { id: "mesin", label: "Mesin", ikon: "♨", wilayah: "Tempa", landmark: "Api dan batu mesin", deskripsi: "Laptop, Bmax, dan VPS-2", posisi: [-12, 0, 21], peta: [42, 34] },
  { id: "buku-besar", label: "Buku Besar", ikon: "▧", wilayah: "Pustaka Akar Bintang", landmark: "Lempeng pengetahuan lintas proyek", deskripsi: "Lensa baca-saja ke BOOK dan brain_learn", posisi: [-54, 0, -37], peta: [17, 73] },
  { id: "galat-insiden", label: "Galat & Insiden", ikon: "⚠", wilayah: "Tugu Retak Penjaga", landmark: "Tugu cacat dan jejak insiden", deskripsi: "Register cacat serta insiden runtime", posisi: [2, 0, -55], peta: [51, 84] },
  { id: "sejarah", label: "Sejarah", ikon: "◷", wilayah: "Lingkar Jejak Zaman", landmark: "Cincin garis waktu tunggal", deskripsi: "Versi, vonis, temuan, hukum, keputusan, dan insiden", posisi: [52, 0, -38], peta: [82, 73] },
  { id: "kabut", label: "Kabut", ikon: "⋰", wilayah: "Rawa Selubung Sunyi", landmark: "Lentera hipotesis belum diuji", deskripsi: "Hipotesis dan ide yang belum pernah diuji", posisi: [61, 0, 30], peta: [87, 31] },
  { id: "akademi", label: "Akademi", ikon: "⌂", wilayah: "Gerbang Akar Ilmu", landmark: "Gerbang belajar MiganCore", deskripsi: "Jalur belajar pemilik proyek dan agen baru", posisi: [30, 0, 55], peta: [68, 16] },
  { id: "penjaga-jejak", label: "Penjaga Jejak", ikon: "⌖", wilayah: "Menara Mata Jejak", landmark: "Menara pendeteksi kerja yang menguap", deskripsi: "Yang belum tercatat atau saling bertentangan", posisi: [-56, 0, 45], peta: [15, 22] },
];

export const PORTAL = { id: "portal", label: "Puncak Cincin", ikon: "◯", wilayah: "Puncak Cincin", landmark: "Cincin batu raksasa", deskripsi: "Gerbang pindah cepat ke seluruh wilayah", posisi: [-31, 0, 32], peta: [29, 21] };

export function cariModul(id) {
  return MODUL.find((item) => item.id === id) ?? MODUL[0];
}
