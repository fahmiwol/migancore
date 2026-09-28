#!/usr/bin/env python
"""kemas_ulang.py — sewa host termurah, ubah lora.tgz -> GGUF-LoRA, ambil, MATIKAN.

Saudara kecil luncurkan_vast.py: pola keselamatan yang sama (sewa paling akhir,
siap = SSH menjawab, pemantau tidak boleh membunuh yang dipantau, macet =/= lambat,
matikan dalam finally), tapi tanpa gerbang data & tanpa latihan — kerjaannya
cuma konversi ±5 menit. Duplikasi pola DISENGAJA: skrip induk sudah teruji
10 run dan tidak disentuh.

Pakai: python kemas_ulang.py
"""
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

DIR = Path(__file__).resolve().parent
AKAR = DIR.parent.parent
LORA = AKAR / "models" / "lora.tgz"
KUNCI_API = Path.home() / ".vast_api_key"
KUNCI_SSH = Path.home() / ".ssh" / "vast_migancore"

H, M, K, R = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
BATAS_JAM = 0.35
BATAS_SIAP_MENIT = 7

# --merge: merge penuh + GGUF (butuh GPU & unduhan base 8 GB) — dipakai untuk
# memisahkan hipotesis artefak-vs-bobot. Tanpa flag: konversi adapter saja.
MODE_MERGE = "--merge" in sys.argv
if MODE_MERGE:
    SKRIP = DIR / "kemas_merge.py"
    ARTEFAK = ["ringkasan-kemas.json", "migancore-12-merged-q4_k_m.gguf"]
    BATAS_MENIT = 45      # unduh base + merge + build quantize
    BATAS_DIAM_MENIT = 12 # unduhan HF bisa lama tapi lognya bergerak; 12 = macet
else:
    SKRIP = DIR / "kemas_v12.py"
    ARTEFAK = ["ringkasan-kemas.json", "migancore-12-lora.gguf"]
    BATAS_MENIT = 30      # konversi 5 menit; 30 sudah kelewat longgar
    BATAS_DIAM_MENIT = 8  # tidak ada langkah sah yang diam selama ini


def mati(pesan, saran=""):
    print(f"\n{M}BERHENTI{R} — {pesan}")
    if saran:
        print(f"  {saran}")
    sys.exit(1)


print("# Kemas ulang v12: adapter PEFT -> GGUF-LoRA (b10549)\n")

print("## 1. Bahan")
if not LORA.exists():
    mati(f"lora.tgz tidak ada: {LORA}")
sidik = hashlib.sha256(LORA.read_bytes()).hexdigest()[:16]
print(f"   {LORA.name} · {LORA.stat().st_size // 1048576} MB · sidik {sidik}")

print("\n## 2. Kredensial")
if not KUNCI_API.exists():
    mati("kunci API vast tidak ada di ~/.vast_api_key.")
if not KUNCI_SSH.exists():
    mati(f"kunci SSH tidak ada: {KUNCI_SSH}")
try:
    from vastai_sdk import VastAI
except ImportError:
    mati("vastai belum terpasang.", "pip install vastai")
v = VastAI(api_key=KUNCI_API.read_text().strip())
saldo = float(v.show_user().get("credit", 0))
print(f"   saldo: ${saldo:.2f}")
if saldo < 0.25:
    mati(f"saldo ${saldo:.2f} terlalu tipis.")

print("\n## 3. Cari host")
if MODE_MERGE:
    # Merge butuh GPU sungguhan (muat 4B bf16) + disk untuk base 8GB, merged
    # 8GB, f16 8GB, q4 2,5GB — dan lebar pita karena titik macet run 10 adalah
    # unduhan HF.
    kueri = ("num_gpus=1 rentable=true verified=true disk_space>=40 "
             "gpu_ram>=16 cuda_vers>=12.1 inet_down>=200")
    # Turing (2080 Ti dkk) tanpa bf16 native — launcher induk mengecualikannya;
    # run 22 Agu lolos ke 2080 Ti dan selamat, tapi selamat bukan jaminan.
else:
    # Konversi adapter murni CPU+jaringan — GPU tidak dipakai. Saringan GPU
    # dipertahankan hanya karena pasar vast memang pasar GPU; yang dibeli di
    # sini adalah keandalan host dan lebar pita, bukan CUDA.
    kueri = "num_gpus=1 rentable=true verified=true disk_space>=25 inet_down>=200"
tawar = v.search_offers(query=kueri, order="dph_total", limit=20)
bagus = [x for x in tawar
         if x["dph_total"] <= BATAS_JAM
         and float(x.get("reliability2", 0)) >= 0.97
         and not (MODE_MERGE and any(t in x.get("gpu_name", "") for t in ("2080", "2070", "2060", "TITAN RTX")))]
if not bagus:
    mati("tidak ada penawaran layak.")
print(f"   {len(bagus)} layak; termurah: {bagus[0]['gpu_name']} ${bagus[0]['dph_total']:.3f}/jam")


def sewa_sampai_siap(calon):
    for ke, tawaran in enumerate(calon[:3], 1):
        print(f"\n   percobaan {ke}/3 — {tawaran['gpu_name']} ${tawaran['dph_total']:.3f}/jam (id {tawaran['id']})")
        inst = v.create_instance(id=tawaran["id"], image="pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime",
                                 disk=40 if MODE_MERGE else 25,
                                 onstart_cmd="sleep infinity", runtype="ssh_direct")
        iid = inst.get("new_contract") or inst.get("id")
        if not iid:
            print(f"   {K}penyewaan ditolak{R}: {str(inst)[:90]}")
            continue
        print(f"   instance {iid} disewa · menunggu siap (batas {BATAS_SIAP_MENIT} menit)")
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
                    for _ in range(12):
                        try:
                            if subprocess.run(uji, capture_output=True, timeout=30).returncode == 0:
                                print(f"   {H}siap & SSH menjawab{R} · {s['ssh_host']}:{s['ssh_port']}")
                                return iid, s["ssh_host"], s["ssh_port"], tawaran
                        except Exception:
                            pass
                        time.sleep(10)
                    print(f"   {K}running tapi SSH bisu — host dilewati{R}")
                    break
                if keadaan in ("exited", "error"):
                    break
            time.sleep(20)
        print(f"   {K}tidak siap dalam {BATAS_SIAP_MENIT} menit — dimatikan, pindah{R}")
        try:
            v.destroy_instance(id=iid)
        except Exception as e:
            print(f"   {M}gagal mematikan {iid}{R}: {e} — MATIKAN SENDIRI")
    return None, None, None, None


iid, host, port, pilih = sewa_sampai_siap(bagus)
if not iid:
    mati("tiga host berturut-turut tidak siap. Semua instance sudah dimatikan.")

mulai = time.time()
try:
    ssh = ["ssh", "-i", str(KUNCI_SSH), "-p", str(port),
           "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
           "-o", "LogLevel=ERROR", f"root@{host}"]

    print("\n## 4. Kirim adapter & skrip")
    subprocess.run(ssh + ["mkdir -p /workspace"], check=True, timeout=60)
    for f in (LORA, SKRIP):
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", str(f), f"root@{host}:/workspace/"],
                       # Kegagalan #11: host ssh9 menerima 126 MB lebih lambat dari
                       # 600 dtk (ingress host x uplink laptop). 1500 dtk = cukup
                       # untuk ~0,7 Mbps; lebih lama dari itu memang host bermasalah
                       # dan mati-bersih (finally) adalah jawaban yang benar.
                       check=True, timeout=1500)
        print(f"   terkirim: {f.name}")
    cek = subprocess.run(ssh + ["stat -c %s /workspace/lora.tgz"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    if int(cek.stdout.strip() or 0) != LORA.stat().st_size:
        raise RuntimeError("lora.tgz sampai tidak utuh")
    print(f"   {H}terbukti utuh{R}: {LORA.stat().st_size} byte")

    print("\n## 5. Konversi")
    subprocess.run(ssh + ["cd /workspace && "
                          f"printf '#!/bin/bash\\ncd /workspace\\npython {SKRIP.name} > kemas.log 2>&1\\n' > jalan.sh && "
                          "chmod +x jalan.sh"], check=True, timeout=60)
    try:
        subprocess.run(ssh + ["cd /workspace && (setsid ./jalan.sh &) >/dev/null 2>&1 < /dev/null"],
                       timeout=45, capture_output=True)
    except subprocess.TimeoutExpired:
        print(f"   {K}saluran SSH tidak menutup (biasa){R}")

    hidup = False
    for _ in range(6):
        time.sleep(10)
        r = subprocess.run(ssh + ["pgrep -f 'kemas_(v12|merge).py' >/dev/null && echo HIDUP || echo MATI"],
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
        awal = subprocess.run(ssh + ["cat /workspace/kemas.log 2>/dev/null | head -20"],
                              capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
        raise RuntimeError("proses kemas tidak pernah hidup:\n" + (awal.stdout or "")[-800:])
    print(f"   {H}proses hidup{R}")

    lalu, gagal_intip = "", 0
    terakhir_maju = time.time()
    while True:
        lewat = (time.time() - mulai) / 60
        if lewat > BATAS_MENIT:
            raise RuntimeError(f"lewat {BATAS_MENIT} menit — dimatikan")
        keluaran = ""
        try:
            r = subprocess.run(ssh + ["tail -3 /workspace/kemas.log 2>/dev/null"],
                               capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            keluaran = r.stdout or ""
            gagal_intip = 0
        except Exception as e:
            gagal_intip += 1
            print(f"   [{int(lewat):>2} mnt] (gagal intip {gagal_intip}x: {type(e).__name__})")
            if gagal_intip >= 8:
                raise RuntimeError("delapan kali beruntun tak bisa mengintip")
            time.sleep(20)
            continue
        baris_akhir = [b for b in keluaran.strip().splitlines() if b.strip()]
        if baris_akhir and baris_akhir[-1] != lalu:
            lalu = baris_akhir[-1]
            terakhir_maju = time.time()
            print(f"   [{int(lewat):>2} mnt] {lalu[:110]}")
        if (time.time() - terakhir_maju) / 60 > BATAS_DIAM_MENIT:
            penuh = subprocess.run(ssh + ["tail -25 /workspace/kemas.log"],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            raise RuntimeError("MACET — log diam.\n" + (penuh.stdout or "")[-1000:])
        if "SELESAI dalam" in keluaran:
            break
        try:
            cek = subprocess.run(ssh + ["pgrep -f 'kemas_(v12|merge).py' >/dev/null && echo H || echo M"],
                                 capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            masih = "H" in (cek.stdout or "")
        except Exception:
            masih = True
        if not masih and "SELESAI dalam" not in keluaran:
            penuh = subprocess.run(ssh + ["tail -40 /workspace/kemas.log"],
                                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            raise RuntimeError("proses MATI sebelum selesai:\n" + (penuh.stdout or "")[-1500:])
        time.sleep(20)

    print("\n## 6. Ambil")
    keluar = AKAR / "models"
    for nama in ARTEFAK:
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", f"root@{host}:/workspace/{nama}", str(keluar)],
                       check=True, timeout=1200)
        print(f"   terambil: {nama}")

finally:
    print("\n## 7. Matikan instance")
    try:
        v.destroy_instance(id=iid)
        print(f"   {H}instance {iid} dimatikan{R}")
    except Exception as e:
        print(f"   {M}PEMATIAN GAGAL{R}: {e}")
        print(f"   {M}MATIKAN SENDIRI SEKARANG:{R}")
        print(f"     python -c \"from vastai_sdk import VastAI;"
              f"VastAI(api_key=open(r'{KUNCI_API}').read().strip()).destroy_instance(id={iid})\"")
    menit = (time.time() - mulai) / 60
    print(f"   hidup {menit:.0f} menit · perkiraan biaya ${pilih['dph_total']*menit/60:.2f}")

print(f"\n{H}SELESAI{R}. Berikutnya:")
print("   printf 'FROM migancore:0.4-qwen3\\nADAPTER ./migancore-12-lora.gguf\\nPARAMETER temperature 0.3\\nPARAMETER num_ctx 4096\\n' > models/Modelfile.v12-adapter")
print("   cd models && ollama create migancore:0.12-adapter -f Modelfile.v12-adapter")
