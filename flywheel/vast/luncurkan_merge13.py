#!/usr/bin/env python
"""luncurkan_merge13.py — sewa GPU, TIES-merge 3 adapter v13 + gerbang merged +
GGUF b10549, ambil, MATIKAN.

Pakai: python luncurkan_merge13.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DIR = Path(__file__).resolve().parent
FLY = DIR.parent
AKAR = FLY.parent
KUNCI_API = Path.home() / ".vast_api_key"
KUNCI_SSH = Path.home() / ".ssh" / "vast_migancore"

H, M, K, R = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
BATAS_JAM = 0.35
BATAS_MENIT = 60
BATAS_DIAM_MENIT = 12
BATAS_SIAP_MENIT = 7

ADAPTER = [AKAR / "models" / "v13" / f"lora-{c}.tgz" for c in ("hitung", "nalar", "gaya")]
SKRIP = DIR / "kemas_merge13.py"
SOAL = AKAR / "eval" / "soal-aritmetika-bersih.json"
KENARI = FLY / "dataset" / "kenari.json"


def mati(pesan):
    print(f"\n{M}BERHENTI{R} — {pesan}")
    sys.exit(1)


print("# Merge TIES v13 + gerbang + GGUF\n")
for f in ADAPTER + [SKRIP, SOAL, KENARI]:
    if not f.exists():
        mati(f"berkas tidak ada: {f}")
print(f"   3 adapter siap ({sum(f.stat().st_size for f in ADAPTER)//1048576} MB total)")

try:
    from vastai_sdk import VastAI
except ImportError:
    mati("pip install vastai")
v = VastAI(api_key=KUNCI_API.read_text().strip())
saldo = float(v.show_user().get("credit", 0))
print(f"   saldo: ${saldo:.2f}")
if saldo < 0.30:
    mati("saldo tipis.")

kueri = ("num_gpus=1 rentable=true verified=true disk_space>=40 "
         "gpu_ram>=22 cuda_vers>=12.1 inet_down>=200")
tawar = v.search_offers(query=kueri, order="dph_total", limit=20)
bagus = [x for x in tawar
         if x["dph_total"] <= BATAS_JAM
         and float(x.get("reliability2", 0)) >= 0.97
         and any(g in x["gpu_name"] for g in ("RTX 3090", "RTX 4090", "RTX A5000", "A100", "RTX 3090 Ti", "RTX 4080"))]
if not bagus:
    mati("tidak ada penawaran layak.")
print(f"   {len(bagus)} layak; termurah {bagus[0]['gpu_name']} ${bagus[0]['dph_total']:.3f}/jam")


def sewa_sampai_siap(calon):
    for ke, tawaran in enumerate(calon[:3], 1):
        print(f"\n   percobaan {ke}/3 — {tawaran['gpu_name']} ${tawaran['dph_total']:.3f}/jam")
        inst = v.create_instance(id=tawaran["id"], image="pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime",
                                 disk=40, onstart_cmd="sleep infinity", runtype="ssh_direct")
        iid = inst.get("new_contract") or inst.get("id")
        if not iid:
            continue
        print(f"   instance {iid} disewa")
        t_sewa = time.time()
        while (time.time() - t_sewa) / 60 < BATAS_SIAP_MENIT:
            try:
                d = [x for x in v.show_instances() if x["id"] == iid]
            except Exception:
                d = []
            if d and d[0].get("actual_status") == "running" and d[0].get("ssh_host"):
                s = d[0]
                uji = ["ssh", "-i", str(KUNCI_SSH), "-p", str(s["ssh_port"]),
                       "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                       "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=15",
                       f"root@{s['ssh_host']}", "echo siap"]
                for _ in range(12):
                    try:
                        if subprocess.run(uji, capture_output=True, timeout=30).returncode == 0:
                            print(f"   {H}siap & SSH menjawab{R}")
                            return iid, s["ssh_host"], s["ssh_port"], tawaran
                    except Exception:
                        pass
                    time.sleep(10)
                break
            time.sleep(20)
        print(f"   {K}tidak siap — pindah{R}")
        try:
            v.destroy_instance(id=iid)
        except Exception as e:
            print(f"   {M}gagal mematikan {iid}: {e}{R}")
    return None, None, None, None


iid, host, port, pilih = sewa_sampai_siap(bagus)
if not iid:
    mati("tiga host tidak siap; semua dimatikan.")

mulai = time.time()
try:
    ssh = ["ssh", "-i", str(KUNCI_SSH), "-p", str(port),
           "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
           "-o", "LogLevel=ERROR", f"root@{host}"]

    print("\n## Kirim bahan")
    subprocess.run(ssh + ["mkdir -p /workspace"], check=True, timeout=60)
    kirim = [(SKRIP, "kemas_merge13.py"), (SOAL, "soal-aritmetika-bersih.json"),
             (KENARI, "kenari.json")] + [(a, a.name) for a in ADAPTER]
    for f, nama in kirim:
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", str(f), f"root@{host}:/workspace/{nama}"],
                       check=True, timeout=3000)
        print(f"   terkirim: {nama}")

    print("\n## Merge + gerbang + GGUF")
    subprocess.run(ssh + ["cd /workspace && "
                          "printf '#!/bin/bash\\ncd /workspace\\npython kemas_merge13.py > kemas.log 2>&1\\n' > jalan.sh && "
                          "chmod +x jalan.sh"], check=True, timeout=60)
    try:
        subprocess.run(ssh + ["cd /workspace && (setsid ./jalan.sh &) >/dev/null 2>&1 < /dev/null"],
                       timeout=45, capture_output=True)
    except subprocess.TimeoutExpired:
        pass

    hidup = False
    for _ in range(6):
        time.sleep(15)
        r = subprocess.run(ssh + ["pgrep -f kemas_merge13.py >/dev/null && echo HIDUP || echo MATI"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        if "HIDUP" in (r.stdout or ""):
            hidup = True
            break
        log = subprocess.run(ssh + ["tail -5 /workspace/kemas.log 2>/dev/null"],
                             capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        if (log.stdout or "").strip():
            hidup = True
            break
    if not hidup:
        awal = subprocess.run(ssh + ["head -30 /workspace/kemas.log 2>/dev/null"],
                              capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        raise RuntimeError("proses tidak hidup:\n" + (awal.stdout or "")[-900:])
    print(f"   {H}proses hidup{R}")

    lalu, gagal_intip = "", 0
    terakhir_maju = time.time()
    while True:
        lewat = (time.time() - mulai) / 60
        if lewat > BATAS_MENIT:
            raise RuntimeError(f"lewat {BATAS_MENIT} menit")
        keluaran = ""
        try:
            r = subprocess.run(ssh + ["tail -3 /workspace/kemas.log 2>/dev/null"],
                               capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            keluaran = r.stdout or ""
            gagal_intip = 0
        except Exception as e:
            gagal_intip += 1
            if gagal_intip >= 8:
                raise RuntimeError("8x tak bisa mengintip")
            time.sleep(30)
            continue
        baris_akhir = [b for b in keluaran.strip().splitlines() if b.strip()]
        if baris_akhir and baris_akhir[-1] != lalu:
            lalu = baris_akhir[-1]
            terakhir_maju = time.time()
            print(f"   [{int(lewat):>2} mnt] " + lalu[:105].encode("ascii", "replace").decode())
        if (time.time() - terakhir_maju) / 60 > BATAS_DIAM_MENIT:
            penuh = subprocess.run(ssh + ["tail -25 /workspace/kemas.log"],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            raise RuntimeError("MACET.\n" + (penuh.stdout or "")[-900:])
        if "SELESAI dalam" in keluaran:
            break
        try:
            cekh = subprocess.run(ssh + ["pgrep -f kemas_merge13.py >/dev/null && echo H || echo M"],
                                  capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            masih = "H" in (cekh.stdout or "")
        except Exception:
            masih = True
        if not masih and "SELESAI dalam" not in keluaran:
            penuh = subprocess.run(ssh + ["tail -40 /workspace/kemas.log"],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            raise RuntimeError("proses MATI:\n" + (penuh.stdout or "")[-1400:])
        time.sleep(40)

    print("\n## Ambil (ringkasan DULU — vonis lebih berharga dari kemasan)")
    keluar = AKAR / "models" / "v13"
    for nama in ("ringkasan-merge13.json", "migancore-13-q4_k_m.gguf"):
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", f"root@{host}:/workspace/{nama}", str(keluar)],
                       check=True, timeout=2400)
        print(f"   terambil: {nama}")

finally:
    print("\n## Matikan instance")
    try:
        v.destroy_instance(id=iid)
        print(f"   {H}instance {iid} dimatikan{R}")
    except Exception as e:
        print(f"   {M}PEMATIAN GAGAL: {e} — MATIKAN SENDIRI:{R}")
        print(f"     python -c \"from vastai_sdk import VastAI;"
              f"VastAI(api_key=open(r'{KUNCI_API}').read().strip()).destroy_instance(id={iid})\"")
    menit = (time.time() - mulai) / 60
    print(f"   hidup {menit:.0f} menit · perkiraan ${pilih['dph_total']*menit/60:.2f}")

print(f"\n{H}SELESAI merge v13{R}")
