#!/usr/bin/env python
"""luncurkan_cluster.py — sewa GPU, latih SATU adapter cluster v13, ambil, MATIKAN.

Pakai: python luncurkan_cluster.py <hitung|nalar|gaya>

Pola keselamatan warisan 13 kegagalan: sewa paling akhir, siap = SSH menjawab,
pemantau tak boleh membunuh, macet != lambat, utf-8 di semua capture, matikan
dalam finally. Gerbang tingkat-1 berjalan DI DALAM latih_cluster.py (fp16,
sanad sahih) — orkestrator ini hanya kurir + pengawal.
"""
import hashlib
import json
import subprocess
import sys
import time

# Kegagalan #14: stdout Windows default cp1252 — karakter balok progress-bar
# tqdm dari log remote meledakkan print() dan monitor mati (padahal decode
# sudah utf-8; encode-nya yang lupa). Paku keduanya.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
from pathlib import Path

DIR = Path(__file__).resolve().parent
FLY = DIR.parent
AKAR = FLY.parent
KUNCI_API = Path.home() / ".vast_api_key"
KUNCI_SSH = Path.home() / ".ssh" / "vast_migancore"

# 24 Agu: panggilan SDK vast tanpa timeout bisa menggantung SELAMANYA (peluncur diam
# >10 mnt melewati anggaran 7 menitnya sendiri saat host 48495799 tak pernah membuka ssh).
import socket
socket.setdefaulttimeout(60)

H, M, K, R = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
BATAS_JAM = 0.35
BATAS_MENIT = 60
BATAS_DIAM_MENIT = 12
BATAS_DIAM_UNDUH_MENIT = 8   # 8 GB @ 20 MB/s ~ 7 mnt; tqdm hanya maju per berkas (23 Agu: 4 mnt membunuh host sehat)
BATAS_SIAP_MENIT = 7

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
CLUSTER = (ARGS[0] if ARGS else "").strip()
VERSI = sys.argv[sys.argv.index("--versi") + 1] if "--versi" in sys.argv else "v13"
# 23 Agu: --nama <label> memberi akhiran pada artefak keluaran supaya run varian
# (H-wd dll) TIDAK menimpa adapter/ringkasan v13 asli; --resep <berkas> memakai
# resep varian (skrip menolak beda tanpa --izin-beda, yang dicatat di ringkasan).
NAMA = sys.argv[sys.argv.index("--nama") + 1] if "--nama" in sys.argv else ""
AKHIRAN = f"-{NAMA}" if NAMA else ""
IZIN_BEDA = "--izin-beda" in sys.argv
if not CLUSTER or not CLUSTER.replace("-", "").isalnum():
    print("pakai: python luncurkan_cluster.py <hitung|nalar|gaya|tool> "
          "[--versi v13] [--pra berkas] [--resep berkas] [--nama label]"); sys.exit(2)

DATA = FLY / "dataset" / VERSI / f"cluster-{CLUSTER}.jsonl"
SKRIP = DIR / "latih_cluster.py"
UKUR = DIR / "ukur_latih.py"
SOAL = AKAR / "eval" / "soal-aritmetika-bersih.json"
KENARI = FLY / "dataset" / "kenari.json"
# --pra <berkas>: pra-daftar DITUNJUK, bukan diturunkan dari versi data. Versi
# DATA (v13/v14) dan versi HIPOTESIS (V13/V14/V15) adalah dua sumbu yang berbeda:
# percobaan baru sering harus jalan di atas data lama supaya cuma satu dial yang
# bergeser. Waktu keduanya dipaksa senama, PRA-DAFTAR-V15 yang ditulis untuk data
# v14 tidak pernah dibaca siapa pun (28 Agu 2026) dan ambangnya tidak menjaga apa-apa.
PRA = Path(sys.argv[sys.argv.index("--pra") + 1]).resolve() if "--pra" in sys.argv else FLY / f"PRA-DAFTAR-{VERSI.upper()}.json"
RESEP = Path(sys.argv[sys.argv.index("--resep") + 1]).resolve() if "--resep" in sys.argv else FLY / f"RESEP-{VERSI.upper()}.json"
PROMPT = AKAR / "eval" / "prompt-gerbang.json"
TAHAN = FLY / "dataset" / "migancore-tahan.jsonl"
KONTRAK = FLY / "kontrak-latih.mjs"


def mati(pesan, saran=""):
    print(f"\n{M}BERHENTI{R} — {pesan}")
    if saran:
        print(f"  {saran}")
    sys.exit(1)


print(f"# Latih adapter {VERSI}-{CLUSTER}\n")

print("## 1. Segel pra-daftar")
for f in (DATA, SKRIP, UKUR, SOAL, KENARI, PRA, RESEP, PROMPT, KONTRAK):
    if not f.exists():
        mati(f"berkas tidak ada: {f}")
sidik = hashlib.sha256(DATA.read_bytes()).hexdigest()[:16]
pra = json.loads(PRA.read_text(encoding="utf-8"))
if pra["sidikCluster"].get(CLUSTER) != sidik:
    mati(f"pra-daftar KEDALUWARSA — {CLUSTER} dikunci {pra['sidikCluster'].get(CLUSTER)}, sekarang {sidik}.")
print(f"   {CLUSTER} · sidik {sidik} {H}cocok pra-daftar{R}")
print(f"   pra-daftar: {PRA.name}" + (f" ({pra.get('nama')})" if pra.get("nama") else ""))

# 23 Agu: KONTRAK MASUKAN sebelum sewa — semua masukan disidik, bentuk data,
# resep+pin, kunci soal dihitung ulang, petak tahan tidak bocor, paritas prompt
# dideklarasikan. TAHAN = GPU tidak disewa. Manifest = pembanding ringkasan nanti.
print("\n## 1b. Kontrak masukan (manifest)")
km = subprocess.run(["node", str(KONTRAK), "manifest", CLUSTER, "--versi", VERSI,
                     "--resep", str(RESEP), "--pra", str(PRA)]
                    + (["--nama", NAMA] if NAMA else []),
                    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
for b in (km.stdout or "").strip().splitlines()[-6:]:
    print("   " + b)
if km.returncode != 0:
    mati("kontrak masukan TAHAN — lihat di atas.", f"node flywheel/kontrak-latih.mjs manifest {CLUSTER} --versi {VERSI}")
try:
    GIT_COMMIT = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=AKAR, capture_output=True,
                                text=True, timeout=30).stdout.strip() or "tidak-ada"
except Exception:
    GIT_COMMIT = "tidak-ada"

print("\n## 2. Kredensial & host")
if not KUNCI_API.exists() or not KUNCI_SSH.exists():
    mati("kunci vast/SSH tidak lengkap.")
try:
    from vastai_sdk import VastAI
except ImportError:
    mati("pip install vastai")
v = VastAI(api_key=KUNCI_API.read_text().strip())
saldo = float(v.show_user().get("credit", 0))
print(f"   saldo: ${saldo:.2f}")
if saldo < 0.40:
    mati(f"saldo ${saldo:.2f} tipis untuk latih.")

kueri = ("num_gpus=1 rentable=true verified=true disk_space>=40 "
         "gpu_ram>=22 cuda_vers>=12.1 inet_down>=200")
tawar = v.search_offers(query=kueri, order="dph_total", limit=20)
# --hindari <offerid,...>: host yang terbukti buruk (23 Agu: offer 48086792 / ssh2 —
# unduhan HF 780 s/shard, run dibunuh pengawal). Dilewati, tidak disewa lagi.
HINDARI = set((sys.argv[sys.argv.index("--hindari") + 1] if "--hindari" in sys.argv else "").split(",")) - {""}
tawar = [x for x in tawar if str(x.get("id")) not in HINDARI and str(x.get("machine_id")) not in HINDARI]
bagus = [x for x in tawar
         if x["dph_total"] <= BATAS_JAM
         and float(x.get("reliability2", 0)) >= 0.97
         and any(g in x["gpu_name"] for g in ("RTX 3090", "RTX 4090", "RTX A5000", "A100", "RTX 3090 Ti", "RTX 4080"))]
if not bagus:
    mati("tidak ada penawaran layak (Ampere+ <= $0.35/jam).")
print(f"   {len(bagus)} layak; termurah {bagus[0]['gpu_name']} ${bagus[0]['dph_total']:.3f}/jam")


def sewa_sampai_siap(calon):
    for ke, tawaran in enumerate(calon[:3], 1):
        print(f"\n   percobaan {ke}/3 — {tawaran['gpu_name']} ${tawaran['dph_total']:.3f}/jam (id {tawaran['id']})")
        inst = v.create_instance(id=tawaran["id"], image="pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime",
                                 disk=40, onstart_cmd="sleep infinity", runtype="ssh_direct")
        iid = inst.get("new_contract") or inst.get("id")
        if not iid:
            print(f"   {K}ditolak{R}: {str(inst)[:80]}")
            continue
        print(f"   instance {iid} disewa")
        t_sewa = time.time()
        lalu = ""
        while (time.time() - t_sewa) / 60 < BATAS_SIAP_MENIT:
            try:
                d = [x for x in v.show_instances() if x["id"] == iid]
            except Exception:
                d = []
            if d:
                s = d[0]
                keadaan = s.get("actual_status") or "?"
                if keadaan != lalu:
                    print(f"   [{(time.time()-t_sewa)/60:>4.1f} mnt] {keadaan}")
                    lalu = keadaan
                if keadaan == "running" and s.get("ssh_host"):
                    uji = ["ssh", "-i", str(KUNCI_SSH), "-p", str(s["ssh_port"]),
                           "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                           "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=15",
                           f"root@{s['ssh_host']}", "echo siap"]
                    for k in range(12):
                        try:
                            if subprocess.run(uji, capture_output=True, timeout=30).returncode == 0:
                                print(f"   {H}siap & SSH menjawab{R}")
                                return iid, s["ssh_host"], s["ssh_port"], tawaran
                        except Exception:
                            pass
                        # 24 Agu: cetak kemajuan — diam 8 mnt di jendela ini pernah
                        # terbaca "macet" dan peluncur sehat dibunuh tangan.
                        if k % 3 == 2:
                            print(f"   [{(time.time()-t_sewa)/60:>4.1f} mnt] ssh belum menjawab ({k+1}/12)")
                        time.sleep(10)
                    break
                if keadaan in ("exited", "error"):
                    break
            time.sleep(20)
        print(f"   {K}tidak siap — pindah host{R}")
        try:
            v.destroy_instance(id=iid)
        except Exception as e:
            print(f"   {M}gagal mematikan {iid}: {e} — MATIKAN SENDIRI{R}")
    return None, None, None, None


iid, host, port, pilih = sewa_sampai_siap(bagus)
if not iid:
    mati("tiga host tidak siap; semua sudah dimatikan.")

mulai = time.time()
try:
    ssh = ["ssh", "-i", str(KUNCI_SSH), "-p", str(port),
           "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
           "-o", "LogLevel=ERROR", f"root@{host}"]

    print("\n## 3. Kirim bahan")
    subprocess.run(ssh + ["mkdir -p /workspace"], check=True, timeout=60)
    kirim = [(DATA, "cluster.jsonl"), (SKRIP, "latih_cluster.py"), (UKUR, "ukur_latih.py"),
             (SOAL, "soal-aritmetika-bersih.json"), (KENARI, "kenari.json"),
             (RESEP, "resep.json"), (PROMPT, "prompt-gerbang.json")]
    if TAHAN.exists():
        kirim.append((TAHAN, "tahan.jsonl"))
    for f, nama in kirim:
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", str(f), f"root@{host}:/workspace/{nama}"],
                       check=True, timeout=1500)
        print(f"   terkirim: {nama}")
    cek = subprocess.run(ssh + ["wc -l < /workspace/cluster.jsonl"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    baris_lokal = sum(1 for x in DATA.read_text(encoding="utf-8").splitlines() if x.strip())
    if int((cek.stdout or "0").strip() or 0) != baris_lokal:
        raise RuntimeError("cluster.jsonl tidak utuh di sana")
    print(f"   {H}terbukti utuh{R}: {baris_lokal} baris")

    print("\n## 4. Latih + gerbang tingkat-1")
    subprocess.run(ssh + ["cd /workspace && "
                          f"printf '#!/bin/bash\\ncd /workspace\\nCLUSTER={CLUSTER} GIT_COMMIT={GIT_COMMIT} PYTHONIOENCODING=utf-8{' RESEP_IZIN_BEDA=1' if IZIN_BEDA else ''} python latih_cluster.py > latih.log 2>&1\\n' > jalan.sh && "
                          "chmod +x jalan.sh"], check=True, timeout=60)
    try:
        subprocess.run(ssh + ["cd /workspace && (setsid ./jalan.sh &) >/dev/null 2>&1 < /dev/null"],
                       timeout=45, capture_output=True)
    except subprocess.TimeoutExpired:
        pass

    hidup = False
    for _ in range(6):
        time.sleep(15)
        r = subprocess.run(ssh + ["pgrep -f latih_cluster.py >/dev/null && echo HIDUP || echo MATI"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        if "HIDUP" in (r.stdout or ""):
            hidup = True
            break
        log = subprocess.run(ssh + ["tail -5 /workspace/latih.log 2>/dev/null"],
                             capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        if (log.stdout or "").strip():
            hidup = True
            break
    if not hidup:
        awal = subprocess.run(ssh + ["head -30 /workspace/latih.log 2>/dev/null"],
                              capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        raise RuntimeError("proses tidak pernah hidup:\n" + (awal.stdout or "")[-900:])
    print(f"   {H}proses hidup{R}")

    lalu, gagal_intip = "", 0
    terakhir_maju = time.time()
    while True:
        lewat = (time.time() - mulai) / 60
        if lewat > BATAS_MENIT:
            raise RuntimeError(f"lewat {BATAS_MENIT} menit — dimatikan")
        keluaran = ""
        try:
            r = subprocess.run(ssh + ["tail -3 /workspace/latih.log 2>/dev/null"],
                               capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            keluaran = r.stdout or ""
            gagal_intip = 0
        except Exception as e:
            gagal_intip += 1
            print(f"   [{int(lewat):>2} mnt] (gagal intip {gagal_intip}x: {type(e).__name__})")
            if gagal_intip >= 8:
                raise RuntimeError("8x beruntun tak bisa mengintip")
            time.sleep(30)
            continue
        baris_akhir = [b for b in keluaran.strip().splitlines() if b.strip()]
        if baris_akhir and baris_akhir[-1] != lalu:
            lalu = baris_akhir[-1]
            terakhir_maju = time.time()
            print(f"   [{int(lewat):>2} mnt] " + lalu[:105].encode("ascii", "replace").decode())
        # 23 Agu (H-wd run 1, host ssh2): unduhan base HF macet di "Fetching 3 files: 0%"
        # — pola run #10 (22 Agu) terulang. Fase unduh yang diam 4 menit sudah pasti
        # macet (host sehat menyelesaikannya < 2 menit); jangan bayar 12 menit.
        diam_menit = (time.time() - terakhir_maju) / 60
        batas = BATAS_DIAM_UNDUH_MENIT if ("Fetching" in lalu and "0%" in lalu) else BATAS_DIAM_MENIT
        if diam_menit > batas:
            penuh = subprocess.run(ssh + ["tail -25 /workspace/latih.log"],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            raise RuntimeError(f"MACET ({'unduhan HF' if batas == BATAS_DIAM_UNDUH_MENIT else 'diam'} {diam_menit:.0f} mnt).\n" + (penuh.stdout or "")[-900:])
        if "SELESAI dalam" in keluaran:
            break
        try:
            cekh = subprocess.run(ssh + ["pgrep -f latih_cluster.py >/dev/null && echo H || echo M"],
                                  capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            masih = "H" in (cekh.stdout or "")
        except Exception:
            masih = True
        if not masih and "SELESAI dalam" not in keluaran:
            penuh = subprocess.run(ssh + ["tail -40 /workspace/latih.log"],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            raise RuntimeError("proses MATI:\n" + (penuh.stdout or "")[-1400:])
        time.sleep(40)

    print("\n## 5. Ambil (adapter DULU)")
    keluar = AKAR / "models" / VERSI
    keluar.mkdir(parents=True, exist_ok=True)
    subprocess.run(ssh + [f"cd /workspace && tar czf lora-{CLUSTER}.tgz lora"], check=True, timeout=300)
    for nama in (f"lora-{CLUSTER}.tgz", f"ringkasan-{CLUSTER}.json"):
        tujuan = keluar / nama.replace(f"-{CLUSTER}.", f"-{CLUSTER}{AKHIRAN}.")
        if tujuan.exists() and not NAMA:
            # Jangan pernah menimpa artefak tanpa jejak: yang lama diberi cap waktu.
            cadangan = tujuan.with_name(tujuan.stem + "-sebelum-" + time.strftime("%Y%m%d-%H%M") + tujuan.suffix)
            tujuan.rename(cadangan)
            print(f"   {K}artefak lama dipindah{R}: {cadangan.name}")
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", f"root@{host}:/workspace/{nama}", str(tujuan)],
                       check=True, timeout=1200)
        print(f"   terambil: {tujuan.name}")
    ring = json.loads((keluar / f"ringkasan-{CLUSTER}{AKHIRAN}.json").read_text(encoding="utf-8"))
    ad, at = ring.get("arit-dengan", {}), ring.get("arit-tanpa", {})
    print(f"\n   loss {ring.get('loss', float('nan')):.4f} · arit dengan {ad.get('benar')}/{ad.get('total')} "
          f"tanpa {at.get('benar')}/{at.get('total')} · kenari {ring.get('kenari')} · terpotong data {ring.get('token', {}).get('terpotong', '?')}")
    pt = ring.get("petakTahan")
    if pt:
        print(f"   petak tahan: base {pt['lossBase']:.4f} -> adapter {pt['lossAdapter']:.4f} (delta {pt['delta']:+.4f})")

    # 23 Agu: KONTRAK KELUARAN — sidik di ringkasan harus sama dengan manifest.
    print("\n## 5b. Kontrak keluaran")
    kk = subprocess.run(["node", str(KONTRAK), "periksa-hasil", CLUSTER, "--versi", VERSI] + (["--nama", NAMA] if NAMA else []),
                        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    for b in (kk.stdout or "").strip().splitlines()[-8:]:
        print("   " + b)
    if kk.returncode != 0:
        print(f"   {M}RINGKASAN DHAIF — jangan dipakai untuk klaim; adapter tetap tersimpan.{R}")

finally:
    print("\n## 6. Matikan instance")
    try:
        v.destroy_instance(id=iid)
        print(f"   {H}instance {iid} dimatikan{R}")
    except Exception as e:
        print(f"   {M}PEMATIAN GAGAL: {e} — MATIKAN SENDIRI:{R}")
        print(f"     python -c \"from vastai_sdk import VastAI;"
              f"VastAI(api_key=open(r'{KUNCI_API}').read().strip()).destroy_instance(id={iid})\"")
    menit = (time.time() - mulai) / 60
    print(f"   hidup {menit:.0f} menit · perkiraan ${pilih['dph_total']*menit/60:.2f}")

print(f"\n{H}SELESAI {CLUSTER}{R} - ringkasan: models/{VERSI}/ringkasan-{CLUSTER}{AKHIRAN}.json")
