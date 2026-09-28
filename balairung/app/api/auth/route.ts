import { NextResponse } from "next/server";

// Validates the gate credentials and sets an httpOnly session cookie.
// Upgrade path: authenticate against MiganCore /v1/auth/login for real per-user sessions.
const USER = process.env.SITE_USER ?? "migan";
const PASS = process.env.SITE_PASS ?? "MiganPro2026";
const TOKEN = process.env.GATE_TOKEN ?? "miganpro-gate";

// MIGAN_LOKAL=1 → aplikasi desktop di laptop pemilik, terikat 127.0.0.1.
// Di situ gerbang ini tidak menambah keamanan apa pun (tidak ada jaringan yang
// bisa menjangkaunya, dan kata sandinya toh nilai default aplikasi), tapi
// menambah gesekan tiap minggu saat cookie kedaluwarsa. Jadi mode lokal boleh
// masuk tanpa mengetik — keputusan diambil DI SERVER, kata sandi tidak pernah
// dikirim ke browser. Variabel ini TIDAK diset di deployment publik, sehingga
// perilaku produksi sama sekali tidak berubah.
const LOKAL = process.env.MIGAN_LOKAL === "1";

export async function POST(req: Request) {
  const { username, password, lokal } = await req.json().catch(() => ({}));
  if (LOKAL && lokal === true) {
    const res = NextResponse.json({ ok: true, mode: "lokal" });
    res.cookies.set("migan_gate", TOKEN, {
      httpOnly: true, sameSite: "lax", path: "/",
      maxAge: 60 * 60 * 24 * 365, secure: false,
    });
    return res;
  }
  if (username === USER && password === PASS) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("migan_gate", TOKEN, {
      httpOnly: true, sameSite: "lax", path: "/",
      maxAge: 60 * 60 * 24 * 7, secure: process.env.NODE_ENV === "production",
    });
    return res;
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
