#!/usr/bin/env python
"""sewa.py — SATU mesin sewa/siap/awasi/matikan untuk semua peluncur GPU.

============================ KENAPA BERKAS INI ADA =========================
Kepala `luncurkan_grpo.py` menulis utangnya sendiri pada 28 Agu:

    "SEBELUM ada peluncur KETIGA, ekstrak jadi flywheel/vast/sewa.py."

Pada 1 Sep 2026 ada ENAM peluncur (cluster, grpo, merge13, merge14, suling,
vast) — 1.995 baris, masing-masing membawa salinan mesin sewa/siap/matikan
sendiri. Utang itu ditagih hari itu juga, dengan bukti yang bisa dihitung:

Empat cacat diperbaiki dalam satu hari, dan tak satu peluncur pun menerima
keempatnya:

    peluncur   pipefail  cek-GPU  hidup-3x  cek-impor
    cluster       -         -         -         -      <- jalur SFT utama
    grpo         ADA       ADA        -        ADA
    merge14       -         -        ADA        -
    merge13/suling/vast    semuanya  -

Duplikasi bukan soal kerapian. Ia berarti **memperbaiki bug tidak sama dengan
memperbaikinya di mana-mana**, dan tiap salinan yang tertinggal adalah uang yang
akan hilang lagi di run berikutnya.

========================= CACAT YANG DIKODEKAN DI SINI =====================
Tiap penjaga di bawah lahir dari kegagalan NYATA yang sudah dibayar, 1 Sep 2026:

  1. `pip install ... | tail -3` MENELAN kode keluar pip (yang dibaca kode
     `tail`, selalu 0), jadi penjaga "kalau pip gagal, berhenti" tidak pernah
     bisa menyala. Sebuah host gagal mencapai PyPI, peluncur melanjutkan dengan
     tenang, dan run mati 25 menit kemudian. $0,11.
     -> `set -o pipefail` DAN pemeriksaan impor NYATA (C40: periksa mekanisme,
        bukan nama).

  2. Batas diam TETAP membunuh run yang SEHAT. TRL hanya menulis SATU baris
     metrik di seluruh run, jadi diam 100 menit adalah keadaan NORMAL. $0,13.
     -> watchdog bertanya ke GPU ("apakah kartunya bekerja?"), bukan ke panjang
        berkas ("apakah ia menulis?").

  3. SATU pembacaan `pgrep` lewat SSH memvonis proses mati. SSH tersendat ->
     stdout kosong -> "tidak bisa bertanya" tak terbedakan dari "sudah mati".
     Merge dibunuh di 71% kuantisasi; saldo terakhir hangus. $0,36. (C41)
     -> tiga keadaan: hidup / mati / TIDAK TAHU. Tidak-tahu tidak menggerakkan
        apa pun. Vonis mati butuh beberapa pembacaan tegas berturut-turut.

  4. Label penawaran bukan kenyataan kartu. Dua OOM sebelum ketahuan bahwa
     penyaring `gpu_ram>=22` meloloskan kartu 23,55 GiB untuk resep yang butuh
     ~30. $0,24.
     -> VRAM diverifikasi dari `nvidia-smi` SEBELUM satu berkas pun dikirim.

  5. Perkiraan biaya MELESET 7x (mencetak "$0,05" untuk instance yang
     menghabiskan $0,36). Perkiraan sejauh itu lebih berbahaya daripada tidak
     ada perkiraan, karena ia dipercaya.
     -> buku-kas: biaya NYATA tiap run dicatat, dan perkiraan berikutnya lahir
        dari sejarah, bukan dari tebakan.

  6. Tidak ada satu pun pagar yang menghentikan belanja. Saldo $1,96 habis
     sampai $0,00 dalam satu sesi tanpa peringatan.
     -> pagar anggaran: menolak menyewa kalau perkiraan biaya melebihi sisa
        saldo dikurangi cadangan.

C27: modul ini TIDAK punya efek samping saat diimpor.
Uji: `python flywheel/vast/uji_sewa.py` — seluruh logika murni diuji TANPA
jaringan dan TANPA GPU.
"""
import json
import subprocess
import time
from pathlib import Path

DIR = Path(__file__).resolve().parent
AKAR = DIR.parent.parent
H, M, K, R = "\033[32m", "\033[31m", "\033[33m", "\033[0m"

KUNCI_API = Path.home() / ".vast_api_key"
KUNCI_SSH = Path.home() / ".ssh" / "vast_migancore"
BUKU_KAS = DIR / "buku-kas.json"

# Kartu yang arsitekturnya mendukung bf16 (Ampere ke atas). V100 (Volta) SENGAJA
# tidak ada di sini meski sering paling murah dan ber-VRAM 32 GiB: ia tidak punya
# bf16 nyata, dan seluruh resep kami bf16.
KARTU_BF16 = ("RTX 3090", "RTX 4090", "RTX A5000", "RTX A6000", "A100", "H100", "RTX 4080", "RTX 5090")


# ─────────────────────────────────────────────────────────── util dasar ──
def jalan(cmd, **kw):
    """subprocess.run dengan setelan yang selalu kami mau: teks, utf-8, tidak
    meledak karena karakter aneh dari log jarak jauh."""
    kw.setdefault("capture_output", True)
    kw.setdefault("text", True)
    kw.setdefault("encoding", "utf-8")
    kw.setdefault("errors", "replace")
    return subprocess.run(cmd, **kw)


def perintah_ssh(host, port):
    return ["ssh", "-i", str(KUNCI_SSH), "-p", str(port),
            "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=20", f"root@{host}"]


def perintah_scp(port):
    return ["scp", "-i", str(KUNCI_SSH), "-P", str(port),
            "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR"]


# ───────────────────────────────────────────── penyaringan penawaran ──
def saring_tawaran(semua, batas_jam, min_vram_gib=30, min_andal=0.97, n=5,
                   kartu=KARTU_BF16, hindari=()):
    """Pilih penawaran yang layak. MURNI — bisa diuji tanpa jaringan.

    `hindari` = daftar offer id yang terbukti buruk (host lambat/rusak). Sejarah
    kami menyimpannya, dan menyewanya lagi berarti membayar pelajaran yang sama
    dua kali.
    """
    layak = []
    for x in semua:
        if x.get("id") in hindari:
            continue
        if float(x.get("dph_total", 9e9)) > batas_jam:
            continue
        if float(x.get("reliability2", 0)) < min_andal:
            continue
        # gpu_ram dilaporkan vast dalam MiB. Ini LABEL, bukan kenyataan — kartunya
        # tetap diperiksa lewat nvidia-smi sesudah disewa (lihat periksa_vram).
        if float(x.get("gpu_ram", 0)) < min_vram_gib * 1024:
            continue
        if not any(g in str(x.get("gpu_name", "")) for g in kartu):
            continue
        layak.append(x)
    layak.sort(key=lambda x: float(x["dph_total"]))
    return layak[:n]


# ───────────────────────────────────────────────── anggaran & buku kas ──
def baca_buku_kas():
    if not BUKU_KAS.exists():
        return {"catatan": [], "_": "Biaya NYATA tiap run. Perkiraan lahir dari sini, bukan dari tebakan."}
    try:
        return json.loads(BUKU_KAS.read_text(encoding="utf-8"))
    except Exception:
        return {"catatan": []}


def catat_biaya(jenis, menit, dph, biaya_nyata, catatan=""):
    """Catat biaya NYATA sesudah run. Inilah yang membuat perkiraan berikutnya
    punya dasar. Perkiraan yang meleset 7x (merge 1 Sep: "$0,05" untuk $0,36)
    lebih berbahaya daripada tidak ada perkiraan, karena ia dipercaya."""
    buku = baca_buku_kas()
    buku.setdefault("catatan", []).append({
        "jenis": jenis, "menit": round(menit, 1), "dphJam": dph,
        "biaya": round(biaya_nyata, 4), "catatan": catatan,
    })
    BUKU_KAS.write_text(json.dumps(buku, indent=1, ensure_ascii=False), encoding="utf-8")
    return buku


def perkiraan_biaya(jenis, dph, menit_perkiraan=None):
    """Perkiraan biaya dari SEJARAH jenis run yang sama, bukan dari tebakan.

    Mengembalikan (biaya, dasar). `dasar` menyebut dari mana angkanya datang —
    supaya pembacanya tahu seberapa percaya. Tanpa sejarah, ia berkata terus
    terang bahwa ini tebakan.
    """
    buku = baca_buku_kas()

    # Dasarnya BIAYA NYATA (penurunan saldo), BUKAN aritmetika menit x dph.
    #
    # Versi pertama fungsi ini menghitung `dph * menit / 60` — dan dengan itu ia
    # menaksir merge 1 Sep sebesar $0,049, sementara saldo turun $0,36. Yaitu
    # PERSIS kesalahan 7x yang buku-kas ini dibangun untuk memperbaiki: alatnya
    # mengulang bug yang jadi alasan kelahirannya. Selisih itu belum terjelaskan
    # (disk? bandwidth? tagihan minimum?), dan justru karena BELUM TERJELASKAN,
    # aritmetika sewa tidak boleh dipercaya — yang boleh dipercaya cuma angka
    # yang benar-benar terjadi.
    sama = [c for c in buku.get("catatan", []) if c.get("jenis") == jenis and c.get("biaya") is not None]
    if sama:
        biaya = sorted(c["biaya"] for c in sama)
        # Kuartil ATAS, bukan median: menaksir terlalu rendah berarti menyewa
        # dengan saldo yang tak cukup menyelesaikan — kegagalan yang jauh lebih
        # mahal daripada menunda run. Perkiraan biaya harus pesimis.
        q = biaya[min(len(biaya) - 1, int(len(biaya) * 0.75))]
        return q, f"kuartil-atas biaya NYATA dari {len(sama)} run {jenis} (${min(biaya):.2f}..${max(biaya):.2f})"
    if menit_perkiraan:
        # Tanpa sejarah, aritmetika sewa adalah satu-satunya yang ada — dan ia
        # terbukti meleset ke arah TERLALU RENDAH, jadi dilipatduakan dan
        # disebut terus terang sebagai tebakan.
        return dph * menit_perkiraan / 60.0 * 2, \
            f"TEBAKAN {menit_perkiraan} mnt x2 (sewa saja terbukti meleset ke bawah; belum ada sejarah {jenis})"
    return 0.0, "TIDAK ADA DASAR — sejarah kosong dan tidak ada perkiraan diberikan"


def pagar_anggaran(saldo, biaya_perkiraan, cadangan=0.15):
    """Boleh menyewa? Kembalikan (boleh, alasan).

    Cadangan ada karena instance yang mati di tengah tetap ditagih, dan saldo
    nol berarti tidak ada lagi kesempatan MENYELAMATKAN pekerjaan yang sudah
    dibayar — persis yang terjadi 1 Sep: merge mati di 71%, dan tidak ada sisa
    untuk mengulanginya.
    """
    if saldo <= 0:
        return False, f"saldo ${saldo:.2f} — kosong."
    tersedia = saldo - cadangan
    if biaya_perkiraan <= 0:
        return True, f"saldo ${saldo:.2f}; perkiraan tidak punya dasar — lanjut dengan mata terbuka"
    if biaya_perkiraan > tersedia:
        return False, (f"perkiraan ${biaya_perkiraan:.2f} > tersedia ${tersedia:.2f} "
                       f"(saldo ${saldo:.2f} - cadangan ${cadangan:.2f}). "
                       f"Isi saldo, atau perkecil run.")
    return True, f"perkiraan ${biaya_perkiraan:.2f} dari tersedia ${tersedia:.2f}"


# ─────────────────────────────────────────────── kesehatan & kehidupan ──
def putuskan_hidup(jawaban, mati_berturut, ambang=3):
    """TIGA keadaan, bukan dua: 'H' hidup, 'M' mati, apa pun lain = TIDAK TAHU.

    Kembalikan (vonis, mati_berturut_baru) dengan vonis ∈ {hidup, mati, tak_tahu}.

    C41: sebelumnya `masih = "H" in (stdout or "")` — SSH tersendat menghasilkan
    stdout kosong, `False`, dan proses yang sedang bekerja divonis mati lalu
    instance-nya dimatikan. Ketidaktahuan TIDAK BOLEH menggerakkan tindakan, dan
    pemeriksa yang boleh MEMBUNUH harus lebih enggan daripada yang cuma melapor.
    """
    j = (jawaban or "").strip()
    if j == "H":
        return "hidup", 0
    if j == "M":
        n = mati_berturut + 1
        return ("mati" if n >= ambang else "tak_tahu"), n
    return "tak_tahu", mati_berturut


def putuskan_macet(log_tumbuh, util_gpu, mem_mib, menit_diam, batas_diam):
    """Apakah run ini benar-benar macet? Kembalikan (macet, alasan).

    Diam BUKAN macet. TRL hanya menulis satu baris metrik di seluruh run GRPO,
    jadi 100 menit sunyi adalah keadaan normal — dan batas diam tetap membunuh
    run yang sehat ($0,13 hilang, 1 Sep). Pertanyaan yang benar bukan "apakah ia
    menulis?" melainkan "apakah kartunya bekerja?".
    """
    if log_tumbuh:
        return False, "log tumbuh"
    if util_gpu is None or mem_mib is None:
        return False, "GPU tak terbaca — TIDAK TAHU, jangan bertindak"
    if util_gpu > 5 or mem_mib > 2000:
        return False, f"sunyi, tapi GPU {util_gpu}% · {mem_mib} MiB — masih bekerja"
    if menit_diam > batas_diam:
        return True, f"diam {menit_diam:.0f} mnt DAN GPU menganggur ({util_gpu}% · {mem_mib} MiB)"
    return False, f"GPU menganggur tapi baru {menit_diam:.0f} mnt — belum melewati batas {batas_diam}"


def baca_gpu(ssh):
    """(utilisasi %, memori MiB) atau (None, None) kalau tak terbaca.
    None berarti TIDAK TAHU — bukan nol, bukan menganggur."""
    r = jalan(ssh + ["nvidia-smi --query-gpu=utilization.gpu,memory.used "
                     "--format=csv,noheader,nounits"], timeout=60)
    try:
        a, b = (r.stdout or "").strip().split(",")
        return int(a), int(b)
    except Exception:
        return None, None


def periksa_vram(ssh, min_gib=30):
    """(ok, mib, keterangan). Diverifikasi dari KARTUNYA, bukan dari label
    penawaran — C40: memeriksa nama sebuah hal bukan memeriksa hal itu."""
    r = jalan(ssh + ["nvidia-smi --query-gpu=name,memory.total --format=csv,noheader"], timeout=60)
    baris = (r.stdout or "").strip()
    try:
        mib = int(baris.split(",")[1].strip().split()[0])
    except Exception:
        return False, 0, f"VRAM tak terbaca dari nvidia-smi: {baris!r}"
    return (mib >= min_gib * 1024), mib, baris


def pasang_pustaka(ssh, paket, impor):
    """Pasang lalu BUKTIKAN bisa diimpor. Kembalikan (ok, keterangan).

    `pip ... | tail` menelan kode keluar pip, jadi `set -o pipefail` wajib. Dan
    kode keluar saja tetap tidak cukup: yang membuktikan pustaka ada adalah
    IMPOR yang berhasil, bukan pip yang mengaku sukses.
    """
    r = jalan(ssh + [f"set -o pipefail; pip install -q {paket} 2>&1 | tail -3"], timeout=2400)
    if r.returncode != 0:
        return False, f"pip GAGAL: {(r.stdout or r.stderr or '').strip()[-300:]}"
    cek = f"python -c \"import {','.join(impor)}; print('impor OK')\""
    r = jalan(ssh + [f"cd /workspace && {cek}"], timeout=300)
    if r.returncode != 0:
        return False, f"pustaka TIDAK BISA DIIMPOR meski pip melapor sukses: {(r.stderr or '').strip()[:300]}"
    return True, (r.stdout or "").strip()


# ───────────────────────────────────────────────────── sewa & matikan ──
def matikan(v, iid, tunggu=8):
    """Matikan DAN verifikasi. Perintah yang terkirim bukan bukti instance mati;
    yang membuktikan adalah daftar instance yang tidak lagi memuatnya."""
    try:
        v.destroy_instance(id=iid)
    except Exception as e:
        return False, f"perintah matikan GAGAL untuk {iid}: {e}"
    time.sleep(tunggu)
    try:
        sisa = [x for x in v.show_instances() if x.get("id") == iid]
    except Exception as e:
        return False, f"tidak bisa MEMVERIFIKASI {iid} sudah mati: {e} — PERIKSA SENDIRI"
    return (not sisa), ("mati & terverifikasi" if not sisa else f"{iid} MASIH HIDUP")


def yatim(v):
    """Instance yang masih hidup. Dipanggil PERTAMA sesudah run apa pun,
    sebelum membaca hasil — kebiasaan yang menjaga 15 pemeriksaan berturut
    bersih pada 1 Sep."""
    try:
        return v.show_instances()
    except Exception:
        return None
