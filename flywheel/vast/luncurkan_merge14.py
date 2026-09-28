#!/usr/bin/env python
"""luncurkan_merge14.py — sewa GPU, TIES-merge N adapter (terparameter) + gerbang
merged 3 lengan + GGUF b10549, ambil, MATIKAN. Turunan luncurkan_merge13.py (23 Agu).

Pakai: python luncurkan_merge14.py <artefak> <adapter1,adapter2,...> [--grid "[[1,1],[1,1.3]]"] [--hindari offerid,...]
       contoh: python luncurkan_merge14.py migancore-14k hitung-promptragam,gaya-promptragam --hindari 48086792

Adapter dibaca dari models/v13/lora-<nama>.tgz; keluaran ke models/v14/
(ringkasan-<artefak>.json + <artefak>-q4_k_m.gguf). Pola keselamatan warisan:
sewa paling akhir, siap = SSH menjawab, pengawal diam, matikan dalam finally,
utf-8 di semua capture, diam-unduh 4 menit = pindah host.
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
BATAS_DIAM_UNDUH_MENIT = 8   # 8 GB @ 20 MB/s ~ 7 mnt; tqdm hanya maju per berkas (23 Agu: 4 mnt membunuh host sehat)
BATAS_SIAP_MENIT = 7

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(ARGS) < 2:
    print("pakai: python luncurkan_merge14.py <artefak> <adapter1,adapter2,...> [--grid JSON] [--hindari id,...]")
    sys.exit(2)
ARTEFAK = ARGS[0]
ADAPTERS = [a.strip() for a in ARGS[1].split(",") if a.strip()]
GRID = sys.argv[sys.argv.index("--grid") + 1] if "--grid" in sys.argv else "[[1,1],[1,1.3]]"
DENSITY = sys.argv[sys.argv.index("--density") + 1] if "--density" in sys.argv else "0.5"
BASE = sys.argv[sys.argv.index("--base") + 1] if "--base" in sys.argv else "Qwen/Qwen3-4B-Instruct-2507"
DISK = int(sys.argv[sys.argv.index("--disk") + 1]) if "--disk" in sys.argv else 40  # 25 Agu: alur 8B butuh ~48GB (cache16+merged16+f16-16); 40 cukup hanya utk 4B
# 24 Agu: merge SOLO (1 adapter) wajib density 1.0 — TIES d0.5 pada satu adapter cuma
# memangkas 50% bobot tanpa fungsi anti-konflik; --density 1.0 = apply murni.
if len(ADAPTERS) == 1 and DENSITY == "0.5":
    print("PERINGATAN: 1 adapter dengan density 0.5 — hampir pasti salah; pakai --density 1.0")
HINDARI = set((sys.argv[sys.argv.index("--hindari") + 1] if "--hindari" in sys.argv else "").split(",")) - {""}
def _cari_adapter(c):
    """24 Agu: adapter bisa lahir di models/v14/ (cluster tool) atau models/v13/ — pakai yang ada; dua-duanya ada = ambil v14 (lebih baru), disebut di log."""
    kandidat = [AKAR / "models" / v / f"lora-{c}.tgz" for v in ("v14", "v13")]
    ada = [k for k in kandidat if k.exists()]
    if len(ada) > 1:
        print(f"  (adapter {c}: ada di v14 & v13 — dipakai {ada[0]})")
    return ada[0] if ada else kandidat[1]

ADAPTER = [_cari_adapter(c) for c in ADAPTERS]
SKRIP = DIR / "kemas_merge14.py"
SOAL = AKAR / "eval" / "soal-aritmetika-bersih.json"
KENARI = FLY / "dataset" / "kenari.json"
KELUAR = AKAR / "models" / "v14"


def mati(pesan):
    print(f"\n{M}BERHENTI{R} — {pesan}")
    sys.exit(1)


print(f"# Merge TIES {ARTEFAK} <- {ADAPTERS} (grid {GRID}) + gerbang 3 lengan + GGUF\n")
for f in ADAPTER + [SKRIP, SOAL, KENARI]:
    if not f.exists():
        mati(f"berkas tidak ada: {f}")
try:
    json.loads(GRID)
except Exception:
    mati(f"--grid bukan JSON: {GRID}")
print(f"   {len(ADAPTER)} adapter siap ({sum(f.stat().st_size for f in ADAPTER)//1048576} MB total)")
KELUAR.mkdir(parents=True, exist_ok=True)
for nama in (f"ringkasan-{ARTEFAK}.json", f"{ARTEFAK}-q4_k_m.gguf"):
    if (KELUAR / nama).exists():
        mati(f"{KELUAR / nama} sudah ada — pakai nama artefak lain, jangan menimpa.")

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
tawar = [x for x in tawar if str(x.get("id")) not in HINDARI and str(x.get("machine_id")) not in HINDARI]
bagus = [x for x in tawar
         if x["dph_total"] <= BATAS_JAM
         and float(x.get("reliability2", 0)) >= 0.97
         and any(g in x["gpu_name"] for g in ("RTX 3090", "RTX 4090", "RTX A5000", "A100", "RTX 3090 Ti", "RTX 4080"))]
if not bagus:
    mati("tidak ada penawaran layak.")
print(f"   {len(bagus)} layak; termurah {bagus[0]['gpu_name']} ${bagus[0]['dph_total']:.3f}/jam")


def sewa_sampai_siap(calon):
    for ke, tawaran in enumerate(calon[:3], 1):
        print(f"\n   percobaan {ke}/3 — {tawaran['gpu_name']} ${tawaran['dph_total']:.3f}/jam (id {tawaran['id']})")
        inst = v.create_instance(id=tawaran["id"], image="pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime",
                                 disk=DISK, onstart_cmd="sleep infinity", runtype="ssh_direct")
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
    kirim = [(SKRIP, "kemas_merge14.py"), (SOAL, "soal-aritmetika-bersih.json"),
             (KENARI, "kenari.json")] + [(a, a.name) for a in ADAPTER]
    for f, nama in kirim:
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", str(f), f"root@{host}:/workspace/{nama}"],
                       check=True, timeout=3000)
        print(f"   terkirim: {nama}")

    print("\n## Merge + gerbang + GGUF")
    # env dikirim lewat jalan.sh; GRID diapit kutip tunggal (JSON tanpa kutip tunggal).
    baris_jalan = (f"#!/bin/bash\\ncd /workspace\\nADAPTERS={','.join(ADAPTERS)} ARTEFAK={ARTEFAK} "
                   f"GRID='{GRID}' DENSITY={DENSITY} BASE={BASE} PYTHONIOENCODING=utf-8 python kemas_merge14.py > kemas.log 2>&1\\n")
    subprocess.run(ssh + [f"cd /workspace && printf '{baris_jalan}' > jalan.sh && chmod +x jalan.sh"],
                   check=True, timeout=60)
    try:
        subprocess.run(ssh + ["cd /workspace && (setsid ./jalan.sh &) >/dev/null 2>&1 < /dev/null"],
                       timeout=45, capture_output=True)
    except subprocess.TimeoutExpired:
        pass

    hidup = False
    for _ in range(6):
        time.sleep(15)
        r = subprocess.run(ssh + ["pgrep -f kemas_merge14.py >/dev/null && echo HIDUP || echo MATI"],
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
        diam = (time.time() - terakhir_maju) / 60
        batas = BATAS_DIAM_UNDUH_MENIT if ("Fetching" in lalu and "0%" in lalu) else BATAS_DIAM_MENIT
        if diam > batas:
            penuh = subprocess.run(ssh + ["tail -25 /workspace/kemas.log"],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            raise RuntimeError(f"MACET ({diam:.0f} mnt).\n" + (penuh.stdout or "")[-900:])
        if "SELESAI dalam" in keluaran:
            break
        # SATU pembacaan pgrep TIDAK BOLEH membunuh run.
        #
        # 1 Sep: merge RLVR dibunuh di 71% kuantisasi (282/398 tensor) oleh
        # pemeriksa ini, sementara lognya PADA DETIK ITU menunjukkan
        # `blk.25.attn_q.weight` sedang dikonversi. Instance dimatikan, saldo
        # habis, artefak hilang.
        #
        # Cacatnya: `masih = "H" in (cekh.stdout or "")`. Kalau SSH tersendat dan
        # stdout KOSONG, hasilnya False — dan "tidak bisa bertanya" jadi tak
        # terbedakan dari "sudah mati". `except` di bawahnya hanya menangkap
        # galat Python, bukan keluaran kosong. Kelas yang sama dengan C33:
        # ketidaktahuan dilaporkan sebagai vonis terburuk.
        #
        # Sekarang: kosong/galat = TIDAK TAHU (bukan mati), dan vonis mati butuh
        # tiga pembacaan berturut-turut yang tegas "M".
        try:
            cekh = subprocess.run(ssh + ["pgrep -f kemas_merge14.py >/dev/null && echo H || echo M"],
                                  capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            jawab = (cekh.stdout or "").strip()
        except Exception:
            jawab = ""
        if jawab == "M":
            mati_berturut = locals().get("mati_berturut", 0) + 1
        elif jawab == "H":
            mati_berturut = 0
        else:
            mati_berturut = locals().get("mati_berturut", 0)   # tidak tahu -> jangan hitung
            print(f"   [{lewat:.0f} mnt] (pgrep tak menjawab — dianggap TIDAK TAHU, bukan mati)")
        if mati_berturut >= 3 and "SELESAI dalam" not in keluaran:
            penuh = subprocess.run(ssh + ["tail -40 /workspace/kemas.log"],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            raise RuntimeError("proses MATI (3 pembacaan berturut):\n" + (penuh.stdout or "")[-1400:])
        time.sleep(40)

    print("\n## Ambil (ringkasan DULU — vonis lebih berharga dari kemasan)")
    for nama in (f"ringkasan-{ARTEFAK}.json", f"{ARTEFAK}-q4_k_m.gguf"):
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", f"root@{host}:/workspace/{nama}", str(KELUAR)],
                       check=True, timeout=2400)
        print(f"   terambil: {nama}")
    ring = json.loads((KELUAR / f"ringkasan-{ARTEFAK}.json").read_text(encoding="utf-8"))
    print(f"   artefak {ring.get('artefak')} · arit dengan {ring['arit-dengan']['benar']}/10 tanpa {ring['arit-tanpa']['benar']}/10 "
          f"latih {ring.get('arit-latih', {}).get('benar', '?')}/10 · tolak {ring.get('tolak-ringkas')} · kenari {ring.get('kenari')} · cium {ring.get('cium_ok')} · gguf {ring.get('gguf')}")

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

print(f"\n{H}SELESAI {ARTEFAK}{R} - models/v14/ringkasan-{ARTEFAK}.json + {ARTEFAK}-q4_k_m.gguf")
