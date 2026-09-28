"use client";
import { useEffect, useState } from "react";

// Branded MiganPro sign-in — replaces the browser basic-auth popup.
//
// Mode lokal (aplikasi desktop, NEXT_PUBLIC_MIGAN_LOKAL=1): halaman ini tidak
// meminta apa pun — ia langsung masuk. Kredensialnya tidak pernah dikirim ke
// browser; yang dikirim hanya penanda `{lokal:true}`, dan SERVER yang memutuskan
// (lihat app/api/auth/route.ts). Di deployment publik variabel ini tidak diset,
// jadi formulirnya tampil seperti biasa.
const LOKAL = process.env.NEXT_PUBLIC_MIGAN_LOKAL === "1";

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(LOKAL);

  useEffect(() => {
    if (!LOKAL) return;
    let batal = false;
    (async () => {
      try {
        const r = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lokal: true }),
        });
        if (batal) return;
        if (r.ok) { window.location.href = "/"; return; }
      } catch { /* jatuh ke formulir di bawah */ }
      // Gagal masuk otomatis TIDAK boleh berakhir jadi layar diam: tampilkan
      // formulirnya kembali supaya masih ada jalan masuk manual.
      if (!batal) { setBusy(false); setErr("Masuk otomatis gagal — silakan isi manual."); }
    })();
    return () => { batal = true; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
    if (r.ok) window.location.href = "/";
    else { setErr("Nama atau kata sandi salah."); setBusy(false); }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "radial-gradient(1200px 600px at 50% -10%, rgba(0,230,255,0.08), transparent), #03070e", overflow: "hidden", position: "relative" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(0,230,255,0.12) 1px, transparent 1px)", backgroundSize: "26px 26px", maskImage: "radial-gradient(700px 500px at 50% 40%, #000, transparent)" }} />
      <form onSubmit={submit} className="pusaka" style={{ position: "relative", width: 360, padding: "32px 28px", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, margin: "0 auto 14px", borderRadius: "50%", border: "1px solid rgba(0,230,255,0.5)", display: "grid", placeItems: "center", boxShadow: "0 0 24px rgba(0,230,255,.35)" }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #bff6ff, #00b7ff 60%, #0056cc)" }} />
        </div>
        <h1 className="font-display glow-text" style={{ margin: 0, fontSize: 26, letterSpacing: 4, color: "#e6fbff" }}>MIGANPRO</h1>
        <p style={{ margin: "4px 0 22px", fontSize: 10, letterSpacing: 3, color: "#5fd0da" }}>ASISTEN AI PRIBADI · SELF-HOSTED</p>

        {LOKAL && busy && (
          <p style={{ margin: "0 0 18px", fontSize: 12, color: "#7fe3ef", letterSpacing: 1 }}>
            Membuka MiganCore di laptop ini…
          </p>
        )}

        <div style={{ display: LOKAL && busy ? "none" : "block" }}>
        <label style={{ display: "block", textAlign: "left", fontSize: 11, color: "#9fc7cf", marginBottom: 4 }}>Nama pengguna</label>
        <input value={u} onChange={(e) => setU(e.target.value)} autoFocus
          style={{ width: "100%", boxSizing: "border-box", marginBottom: 14, padding: "10px 12px", borderRadius: 12, background: "rgba(8,16,26,0.7)", border: "1px solid rgba(0,230,255,0.25)", color: "#dff4f7", outline: "none" }} />

        <label style={{ display: "block", textAlign: "left", fontSize: 11, color: "#9fc7cf", marginBottom: 4 }}>Kata sandi</label>
        <input type="password" value={p} onChange={(e) => setP(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", marginBottom: 6, padding: "10px 12px", borderRadius: 12, background: "rgba(8,16,26,0.7)", border: "1px solid rgba(0,230,255,0.25)", color: "#dff4f7", outline: "none" }} />

        {err && <p style={{ color: "#ff6f8b", fontSize: 12, margin: "8px 0 0" }}>{err}</p>}

        <button type="submit" disabled={busy}
          style={{ width: "100%", marginTop: 18, padding: "11px", borderRadius: 12, cursor: "pointer", border: "1px solid rgba(0,230,255,0.6)", background: "rgba(0,230,255,0.10)", color: "#bff6ff", letterSpacing: 2, fontSize: 13, boxShadow: "0 0 18px rgba(0,230,255,.3)", opacity: busy ? 0.6 : 1 }}>
          {busy ? "MEMVERIFIKASI…" : "MASUK"}
        </button>
        </div>
        <p style={{ marginTop: 16, fontSize: 9, color: "#3f6b72" }}>
          {LOKAL ? "Privat · berjalan di laptop ini, tanpa internet" : "Privat · data tetap di server Anda"}
        </p>
      </form>
    </main>
  );
}
