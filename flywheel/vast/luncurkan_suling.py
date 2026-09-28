#!/usr/bin/env python
"""luncurkan_suling.py — satu perintah: gerbang -> sewa -> suling -> ambil -> MATIKAN.

Saudara kembar luncurkan_vast.py, tapi untuk MENUMBUHKAN DATA, bukan melatih.
Alurnya sama karena jaminannya sama, dan jaminan itu satu:

============================ INSTANCE SELALU DIMATIKAN =======================
Apa pun yang terjadi — sukses, gagal, galat tak terduga, Ctrl-C. Saldo vast
terpotong per detik selama instance hidup, dan instance yang lupa dimatikan
adalah cara paling sepele kehilangan uang di sini. Seluruh bagian sesudah
penyewaan dibungkus try/finally, dan kalau pematiannya sendiri gagal, perintah
manualnya dicetak besar-besar.

========================= GERBANG SEBELUM GPU, BUKAN SESUDAH =================
Semua yang bisa diperiksa tanpa GPU diperiksa DULU: benih ada dan berisi,
bentuknya terbaca, lisensi guru masih bebas, uji penjaga lulus. Satu sesi GPU
yang terbuang karena berkas salah bentuk harganya jauh di atas pemeriksaan ini.

Kredensial: berkas ini TIDAK PERNAH menulis kunci. Ia membaca ~/.vast_api_key
dan kunci SSH yang sudah terdaftar di akun.

Pakai: python flywheel/vast/luncurkan_suling.py            (sewa & suling)
       python flywheel/vast/luncurkan_suling.py --periksa  (gerbang + harga saja)
       VARIAN=2 BATAS_MENIT=30 python ... luncurkan_suling.py
"""
import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path

DIR = Path(__file__).resolve().parent
FLYWHEEL = DIR.parent
AKAR = FLYWHEEL.parent
BENIH = FLYWHEEL / "dataset" / "benih-suling.jsonl"
MANIFEST = FLYWHEEL / "dataset" / "benih-suling-manifest.json"
SKRIP = DIR / "suling.py"
UJI = DIR / "uji_suling.py"
HASIL = FLYWHEEL / "dataset" / "hasil-suling.jsonl"
RINGKAS = FLYWHEEL / "dataset" / "ringkasan-suling.json"
KUNCI_API = Path.home() / ".vast_api_key"
KUNCI_SSH = Path.home() / ".ssh" / "vast_migancore"

HANYA_PERIKSA = "--periksa" in sys.argv
GURU = os.environ.get("GURU", "Qwen/Qwen3-8B")
VARIAN = os.environ.get("VARIAN", "3")
BATAS_MENIT_SULING = os.environ.get("BATAS_MENIT", "45")
MUAT_4BIT = os.environ.get("MUAT_4BIT", "0")

H, M, K, R = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
BATAS_JAM = 0.35           # jangan sewa lebih mahal dari ini tanpa disengaja
BATAS_SIAP_MENIT = 8       # host yang tak siap segini = rusak, bukan lambat
BATAS_TOTAL_MENIT = 100    # kalau lewat, ada yang salah — matikan daripada membakar saldo


def mati(pesan, saran=""):
    print(f"\n{M}BERHENTI{R} — {pesan}")
    if saran:
        print(f"  {saran}")
    sys.exit(1)


def ssh(host, port, perintah, timeout=None, tangkap=True):
    return subprocess.run(
        ["ssh", "-i", str(KUNCI_SSH), "-p", str(port), "-o", "StrictHostKeyChecking=no",
         "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR",
         "-o", "ServerAliveInterval=30", f"root@{host}", perintah],
        capture_output=tangkap, text=True, timeout=timeout)


print("# Luncurkan PENYULING di vast.ai — gerbang dahulu, GPU belakangan\n")

# ── 1. GERBANG (semua tanpa GPU, semua tanpa biaya) ──────────────────────────
print("## 1. Gerbang pra-GPU")

for berkas, nama in ((KUNCI_API, "kunci API vast"), (KUNCI_SSH, "kunci SSH vast"),
                     (SKRIP, "suling.py"), (BENIH, "benih-suling.jsonl")):
    if not berkas.exists():
        saran = ("Jalankan dulu: node flywheel/siapkan-benih.mjs" if berkas == BENIH else "")
        mati(f"{nama} tidak ada: {berkas}", saran)
print(f"   {H}ok{R}  kunci & berkas lengkap")

baris = [l for l in BENIH.read_text(encoding="utf-8").splitlines() if l.strip()]
if not baris:
    mati("benih kosong", "node flywheel/siapkan-benih.mjs")

# Bentuk benih diperiksa DI SINI, bukan di instance. Versi pertama suling.py
# membaca "messages" padahal dataset kita ShareGPT — kalau tidak tertangkap,
# GPU dibayar penuh untuk menghasilkan berkas nol baris.
sys.path.insert(0, str(DIR))
from suling import giliran  # noqa: E402

contoh = [json.loads(x) for x in baris[:50]]
terbaca = sum(1 for b in contoh if giliran(b, "pengguna").strip())
if terbaca == 0:
    mati("tak satu pun giliran pengguna terbaca dari 50 benih pertama",
         "bentuk benih salah — periksa siapkan-benih.mjs")
print(f"   {H}ok{R}  benih {len(baris)} baris · {terbaca}/50 contoh terbaca giliran penggunanya")

man = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
if man:
    print(f"   {H}ok{R}  manifest: sidik {man.get('sidikBenih')} · "
          f"gerbang dijaga {man.get('soalGerbangDijaga')} soal")

# uji penjaga — yang tidak lulus di laptop tidak boleh naik GPU
u = subprocess.run([sys.executable, str(UJI)], capture_output=True, text=True)
if u.returncode != 0:
    print(u.stdout[-1200:])
    mati("uji penjaga suling GAGAL", "perbaiki dulu; jangan menyewa GPU untuk alat yang rusak")
print(f"   {H}ok{R}  {u.stdout.strip().splitlines()[-1]}")

# lisensi guru — bisa-diunduh bukan boleh-dipakai (pelajaran OX Alpha, 26 Agu)
# as_uri() dan BUKAN as_posix(): import() dinamis di Node menolak jalur Windows
# telanjang ("C:/...") dan menuntut URL file://. Ketangkap oleh gerbang ini sendiri
# saat uji --periksa pertama, sebelum sepeser pun disewa.
cek = subprocess.run(
    ["node", "-e", f"import('{(FLYWHEEL / 'model-terbuka.mjs').as_uri()}')"
     f".then(async m => {{ const p = await m.wajibBebas('{GURU}');"
     f" console.log('LISENSI-OK ' + p.lisensi); }})"
     f".catch(e => {{ console.error('LISENSI-TOLAK ' + e.message); process.exit(1); }})"],
    capture_output=True, text=True, cwd=str(AKAR))
if cek.returncode != 0:
    mati(f"lisensi guru tidak lolos: {(cek.stderr or cek.stdout).strip()[:160]}",
         "pilih guru lain: node flywheel/model-terbuka.mjs --peran=guru")
print(f"   {H}ok{R}  guru {GURU} — {cek.stdout.strip()}")

# ── 2. SDK & saldo ───────────────────────────────────────────────────────────
print("\n## 2. Saldo vast")
try:
    from vastai_sdk import VastAI
except ImportError:
    mati("vastai_sdk belum terpasang", "pip install vastai-sdk")
v = VastAI(api_key=KUNCI_API.read_text().strip())
try:
    saldo = float((v.show_user() or {}).get("credit", 0))
    print(f"   saldo ${saldo:.2f}")
    if saldo < 0.50:
        mati(f"saldo terlalu tipis (${saldo:.2f})", "isi ulang dulu sebelum menyewa")
except Exception as e:
    print(f"   {K}saldo tak terbaca ({str(e)[:60]}) — lanjut dengan hati-hati{R}")

# ── 3. Cari GPU ──────────────────────────────────────────────────────────────
print("\n## 3. Cari GPU")
# gpu_ram>=22: guru 8B bf16 butuh ~16 GB + ruang untuk kelompok besar.
# Turing (2080 Ti) dilewati: tanpa bf16, dan lebih sering bermasalah dgn torch di image ini.
kueri = ("num_gpus=1 rentable=true verified=true disk_space>=60 "
         "gpu_ram>=22 cuda_vers>=12.1 inet_down>=200")
tawar = v.search_offers(query=kueri, order="dph_total", limit=20)
bagus = [x for x in tawar
         if x["dph_total"] <= BATAS_JAM
         and float(x.get("reliability2", 0)) >= 0.97
         and any(g in x["gpu_name"] for g in ("RTX 3090", "RTX 4090", "RTX A5000", "A100", "RTX 3090 Ti"))]
if not bagus:
    mati("tidak ada penawaran yang memenuhi syarat.",
         f"Batas harga ${BATAS_JAM}/jam, keandalan >=0,97, VRAM >=22 GB.")
print(f"   {len(bagus)} penawaran layak; tiga teratas:")
for x in bagus[:3]:
    print(f"     {x['gpu_name']:<14} ${x['dph_total']:.3f}/jam · andal {float(x.get('reliability2',0)):.3f} · id {x['id']}")

pilih = bagus[0]
# waktu = unduh guru (~16 GB) + pemuatan + penyulingan + ambil hasil
perkiraanJam = (12 + float(BATAS_MENIT_SULING) + 5) / 60
print(f"   perkiraan: {perkiraanJam*60:.0f} menit · "
      f"${pilih['dph_total']*perkiraanJam:.2f} pada ${pilih['dph_total']:.3f}/jam")
print(f"   rencana  : {len(baris)} benih × {VARIAN} varian = {len(baris)*int(VARIAN)} permintaan")

if HANYA_PERIKSA:
    print(f"\n{H}SIAP{R} — semua gerbang lolos. Jalankan tanpa --periksa untuk menyewa & menyuling.")
    sys.exit(0)

# ── 4. Sewa ──────────────────────────────────────────────────────────────────
print("\n## 4. Sewa")
iid = host = port = None
for ke, tawaran in enumerate(bagus[:3], 1):
    print(f"\n   percobaan {ke}/3 — {tawaran['gpu_name']} ${tawaran['dph_total']:.3f}/jam (id {tawaran['id']})")
    # Image torch 2.5.1, BUKAN 2.4.0. Run pertama (27 Agu) memakai 2.4.0 lalu
    # transformers baru mematikan PyTorch diam-diam: "Disabling PyTorch because
    # PyTorch >= 2.5 is required but found 2.4.0". Modelnya tidak akan pernah
    # bisa dimuat, dan pesannya cuma lewat sebagai baris log biasa.
    inst = v.create_instance(id=tawaran["id"], image="pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime",
                             disk=60, onstart_cmd="sleep infinity", runtype="ssh_direct")
    calon = inst.get("new_contract") or inst.get("id")
    if not calon:
        print(f"   {K}penyewaan ditolak{R}: {str(inst)[:90]}")
        continue
    print(f"   instance {calon} disewa · menunggu siap (batas {BATAS_SIAP_MENIT} menit)")
    t0, keadaanLalu = time.time(), ""
    siap = False
    while (time.time() - t0) / 60 < BATAS_SIAP_MENIT:
        try:
            d = [x for x in v.show_instances() if x["id"] == calon]
        except Exception:
            d = []
        if d:
            st = d[0]
            keadaan = st.get("actual_status") or "?"
            if keadaan != keadaanLalu:
                print(f"   [{(time.time()-t0)/60:>4.1f} mnt] {keadaan}")
                keadaanLalu = keadaan
            # "running" BUKAN bukti bisa dipakai — yang membuktikan cuma SSH yang menjawab.
            if keadaan == "running" and st.get("ssh_host"):
                for _ in range(12):
                    try:
                        if ssh(st["ssh_host"], st["ssh_port"], "echo siap", timeout=30).returncode == 0:
                            iid, host, port, pilih = calon, st["ssh_host"], st["ssh_port"], tawaran
                            siap = True
                            break
                    except Exception:
                        pass
                    time.sleep(10)
                if siap:
                    break
        time.sleep(10)
    if siap:
        print(f"   {H}siap{R} — {host}:{port}")
        break
    print(f"   {K}host tidak siap dalam {BATAS_SIAP_MENIT} menit — dimatikan, pindah host{R}")
    try:
        v.destroy_instance(id=calon)
    except Exception:
        pass

if not iid:
    mati("tak satu pun host jadi siap.", "Coba lagi nanti; tidak ada saldo terbuang untuk host yang gagal.")

mulai = time.time()
try:
    # ── 5. Kirim bahan ───────────────────────────────────────────────────────
    print("\n## 5. Kirim bahan")
    # Pelajaran run sebelumnya: scp ke folder yang belum ada GAGAL DIAM-DIAM.
    ssh(host, port, "mkdir -p /workspace", timeout=60)
    for f, tujuan in ((BENIH, "benih.jsonl"), (SKRIP, "suling.py")):
        r = subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                            "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                            "-o", "LogLevel=ERROR", str(f), f"root@{host}:/workspace/{tujuan}"],
                           capture_output=True, text=True, timeout=600)
        if r.returncode != 0:
            raise RuntimeError(f"scp {f.name} gagal: {r.stderr[:120]}")
        print(f"   terkirim: {f.name} -> {tujuan}")
    # Buktikan sampai — jangan percaya scp yang tidak mengeluh.
    cekIsi = ssh(host, port, "wc -l < /workspace/benih.jsonl; test -s /workspace/suling.py && echo skrip-ada", timeout=60)
    print(f"   di instance: {cekIsi.stdout.strip().replace(chr(10), ' baris benih · ')}")

    # ── 6. Pasang pustaka ────────────────────────────────────────────────────
    print("\n## 6. Pasang pustaka")
    # DUA JEBAKAN SHELL YANG SUDAH MENELAN DUA RUN — keduanya ditutup di sini.
    #
    # 1. ">=4.46" dan "<5" adalah PENGALIHAN bagi shell. Tanpa dikutip, bash membaca
    #    ">=4.46" sebagai "tulis keluaran ke berkas =4.46" dan "<5" sebagai "baca dari
    #    berkas 5". Run ketiga (27 Agu) pulang KODE=1 dengan NOL keluaran justru karena
    #    itu: keluhan pip-nya tertelan ke berkas. Gejala "gagal tanpa pesan" hampir
    #    selalu berarti pesannya DIALIHKAN, bukan tidak ada.
    # 2. ${PIPESTATUS[0]} yang dititipkan lewat ssh akan diperluas oleh shell LUAR
    #    lebih dulu, jadi nilainya kosong dan pemeriksaannya tak berarti apa-apa.
    #
    # Jalan keluarnya bukan mengutip lebih rumit, melainkan TIDAK PERLU keduanya:
    # shlex.quote menangani argumen, dan kode keluar SSH sudah merupakan kode keluar
    # perintah jauh. Satu lapis kutipan, satu sumber kebenaran.
    daftarPaket = ["transformers>=4.46,<5", "accelerate", "sentencepiece"]
    if MUAT_4BIT == "1":
        daftarPaket.append("bitsandbytes")
    pasang = ("python -m pip install --no-cache-dir --disable-pip-version-check "
              + " ".join(shlex.quote(x) for x in daftarPaket))

    berhasil = False
    for percobaan in (1, 2):
        r = ssh(host, port, pasang, timeout=1800)
        ekor = [x for x in ((r.stdout or "") + (r.stderr or "")).strip().splitlines() if x.strip()][-4:]
        print(f"   percobaan {percobaan} (exit {r.returncode}): " +
              (" | ".join(x.strip()[:90] for x in ekor) if ekor else "(tanpa keluaran)"))
        if r.returncode == 0:
            berhasil = True
            break
        if percobaan == 1:
            print("   gagal — dicoba sekali lagi (jaringan host kadang tersendat)")
            time.sleep(10)
    if not berhasil:
        raise RuntimeError("pemasangan pustaka GAGAL di host ini — jalankan lagi untuk dapat host lain")

    # ── 6b. GERBANG DI DALAM INSTANCE ────────────────────────────────────────
    # Gerbang di laptop berhenti di batas laptop. Run pertama lolos semua gerbang
    # itu, lalu mati di dalam instance karena transformers baru MEMATIKAN PyTorch
    # diam-diam (torch 2.4.0 < 2.5). Pesannya cuma baris log biasa; tidak ada yang
    # gagal sampai 12 menit kemudian, setelah bobot 16 GB diunduh. Jadi: buktikan
    # dulu bahwa model BISA dimuat, sebelum ada yang diunduh.
    print("\n## 6b. Gerbang di instance (sebelum mengunduh 16 GB)")
    uji = ssh(host, port,
              "python -c \"import torch, transformers;"
              " from transformers import AutoModelForCausalLM;"
              " assert torch.cuda.is_available(), 'CUDA tidak terlihat';"
              " print('torch', torch.__version__, '| transformers', transformers.__version__,"
              " '| GPU', torch.cuda.get_device_name(0))\" 2>&1 | tail -5", timeout=300)
    keluaran = (uji.stdout or "").strip()
    print(f"   {keluaran[-200:]}")
    if uji.returncode != 0 or "torch" not in keluaran or "Disabling PyTorch" in keluaran:
        raise RuntimeError("gerbang instance GAGAL — model tidak akan bisa dimuat: " + keluaran[-200:])

    # Sambungan ke HuggingFace diuji juga. Run pertama mati di penyimpanan Xet
    # (ConnectionError pada .../xet-read-token/...) yang tidak terjangkau host itu.
    print("\n## 6c. Uji sambungan ke HuggingFace (unduh 1 berkas kecil)")
    sam = ssh(host, port,
              f"HF_HUB_DISABLE_XET=1 python -c \"from transformers import AutoTokenizer;"
              f" t = AutoTokenizer.from_pretrained('{GURU}');"
              f" print('tokenizer ok, kosakata', len(t))\" 2>&1 | tail -4", timeout=900)
    print(f"   {(sam.stdout or '').strip()[-200:]}")
    if sam.returncode != 0:
        raise RuntimeError("tak bisa mengambil tokenizer dari HuggingFace di host ini — "
                           "jaringannya bermasalah; jalankan lagi untuk dapat host lain")

    # ── 7. Suling ────────────────────────────────────────────────────────────
    print(f"\n## 7. Suling (guru {GURU} · {VARIAN} varian · batas {BATAS_MENIT_SULING} menit)")
    # HF_HUB_DISABLE_XET=1: penyimpanan Xet HuggingFace tidak terjangkau dari
    # sebagian host vast (run pertama mati di situ). Jalur HTTP biasa lebih lambat
    # sedikit tapi jalan di mana saja.
    env = (f"HF_HUB_DISABLE_XET=1 GURU={GURU} VARIAN={VARIAN} "
           f"BATAS_MENIT={BATAS_MENIT_SULING} MUAT_4BIT={MUAT_4BIT}")
    perintah = f"cd /workspace && {env} python suling.py 2>&1 | tail -60"
    r = ssh(host, port, perintah, timeout=int(float(BATAS_MENIT_SULING) + 45) * 60)
    print((r.stdout or "")[-3000:])
    if r.returncode != 0:
        print(f"   {M}penyulingan berakhir dengan kode {r.returncode}{R} — hasil tetap diambil untuk diperiksa")

    # ── 8. Ambil hasil ───────────────────────────────────────────────────────
    print("\n## 8. Ambil hasil")
    for jauh, lokal in (("hasil-suling.jsonl", HASIL), ("ringkasan-suling.json", RINGKAS)):
        a = subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                            "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                            "-o", "LogLevel=ERROR", f"root@{host}:/workspace/{jauh}", str(lokal)],
                           capture_output=True, text=True, timeout=600)
        if a.returncode == 0 and lokal.exists():
            print(f"   {H}turun{R}: {lokal.relative_to(AKAR)} ({lokal.stat().st_size/1024:.0f} KB)")
        else:
            print(f"   {M}gagal mengambil {jauh}{R}: {a.stderr[:100]}")

    if HASIL.exists():
        n = sum(1 for x in HASIL.read_text(encoding="utf-8").splitlines() if x.strip())
        print(f"\n   hasil suling: {H}{n} baris{R}")
        if RINGKAS.exists():
            ring = json.loads(RINGKAS.read_text(encoding="utf-8"))
            print(f"   ditolak penjaga: {ring.get('ditolak')}")

finally:
    # ── 9. MATIKAN — apa pun yang terjadi ────────────────────────────────────
    print("\n## 9. Matikan instance")
    try:
        v.destroy_instance(id=iid)
        print(f"   {H}instance {iid} dimatikan{R}")
    except Exception as e:
        print(f"   {M}PEMATIAN GAGAL{R}: {e}")
        print(f"   {M}MATIKAN SENDIRI SEKARANG — saldo terus terpotong:{R}")
        print(f"     python -c \"from vastai_sdk import VastAI;"
              f"VastAI(api_key=open(r'{KUNCI_API}').read().strip()).destroy_instance(id={iid})\"")
    menit = (time.time() - mulai) / 60
    print(f"   hidup {menit:.0f} menit · perkiraan biaya ${pilih['dph_total']*menit/60:.2f}")

print(f"\n{H}SELESAI{R}. Langkah berikutnya:")
print("   1. periksa mutunya  : node flywheel/validasi-dataset.mjs")
print("   2. gabung ke cluster: satukan hasil-suling.jsonl dengan cluster asalnya")
print("   3. kunci pra-daftar : tulis ambang SEBELUM menyewa GPU latih")
print("   4. latih            : python flywheel/vast/luncurkan_vast.py")
