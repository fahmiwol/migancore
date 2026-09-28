#!/usr/bin/env python
"""
luncurkan_vast.py — satu perintah: gerbang → sewa → latih → ambil → MATIKAN.

Kenapa vast dan bukan Kaggle: satu RTX 3090 menyelesaikan 4B LoRA ini dalam
20–40 menit; dua T4 Kaggle butuh ±50 menit dan sering antre. Biayanya ±$0,10.

============================ JAMINAN YANG PALING PENTING ====================
Instance DIMATIKAN apa pun yang terjadi — sukses, gagal, galat tak terduga,
bahkan Ctrl-C. Saldo vast terpotong per detik selama instance hidup, dan
instance yang lupa dimatikan adalah cara paling sepele kehilangan uang di sini.
Karena itu seluruh bagian sesudah penyewaan dibungkus try/finally, dan kalau
pematiannya sendiri gagal, perintah manualnya dicetak besar-besar.

Kredensial: berkas ini TIDAK PERNAH menulis kunci. Ia membaca kunci API vast
yang sudah dipasang pemiliknya di ~/.vast_api_key, dan memakai kunci SSH yang
sudah terdaftar di akun.

Pakai: python luncurkan_vast.py            (gerbang → latih → ambil → matikan)
       python luncurkan_vast.py --periksa  (hanya gerbang + harga, tidak menyewa)
"""
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

DIR = Path(__file__).resolve().parent
FLYWHEEL = DIR.parent
AKAR = FLYWHEEL.parent
DATA = FLYWHEEL / "dataset" / "migancore-curated.jsonl"
PRA = FLYWHEEL / "PRA-DAFTAR.json"
SKRIP = DIR / "latih_v12.py"
KUNCI_API = Path.home() / ".vast_api_key"
KUNCI_SSH = Path.home() / ".ssh" / "vast_migancore"
HANYA_PERIKSA = "--periksa" in sys.argv

H, M, K, R = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
BATAS_JAM = 0.35          # jangan sewa yang lebih mahal dari ini tanpa disengaja
BATAS_MENIT = 90          # kalau lewat, ada yang salah — matikan daripada membakar saldo
BATAS_DIAM_MENIT = 12     # log yang tidak bergerak selama ini = macet, bukan lambat


def mati(pesan, saran=""):
    print(f"\n{M}BERHENTI{R} — {pesan}")
    if saran:
        print(f"  {saran}")
    sys.exit(1)


print("# Luncurkan v12 di vast.ai — gerbang dahulu, GPU belakangan\n")

# ── 1. GERBANG ───────────────────────────────────────────────────────────────
print("## 1. Gerbang pra-GPU")
hasil = subprocess.run(["node", str(FLYWHEEL / "siap-latih.mjs")],
                       capture_output=True, text=True, cwd=str(FLYWHEEL))
vonis = [b for b in hasil.stdout.splitlines() if "VONIS:" in b]
print(f"   {vonis[-1].strip() if vonis else '(vonis tak terbaca)'}")
if hasil.returncode != 0:
    mati("pipa pra-GPU belum hijau.",
         "GPU berbayar TIDAK dinyalakan di atas data yang belum lolos gerbang.")
print(f"   {H}LULUS{R}")

# ── 2. SEGEL ─────────────────────────────────────────────────────────────────
print("\n## 2. Segel data")
if not DATA.exists():
    mati(f"dataset tidak ada: {DATA}")
sidik = hashlib.sha256(DATA.read_bytes()).hexdigest()[:16]
baris = sum(1 for x in DATA.read_text(encoding="utf-8").splitlines() if x.strip())
pra = json.loads(PRA.read_text(encoding="utf-8"))
print(f"   {baris} baris · sidik {sidik}")
if pra.get("sidikData") != sidik:
    mati(f"pra-daftar KEDALUWARSA — dikunci untuk {pra.get('sidikData')}, sekarang {sidik}.",
         "Data berubah sesudah kesimpulan dikunci; hasil apa pun sesudah itu tidak bisa ditafsirkan.")
print(f"   {H}pra-daftar cocok{R} · ambang: {pra.get('ambang','?')}")

# ── 3. KREDENSIAL ────────────────────────────────────────────────────────────
print("\n## 3. Kredensial")
if not KUNCI_API.exists():
    mati("kunci API vast tidak ada di ~/.vast_api_key.",
         "Pasang sendiri — berkas ini sengaja tidak pernah menulis kunci.")
if not KUNCI_SSH.exists():
    mati(f"kunci SSH tidak ada: {KUNCI_SSH}",
         "Butuh kunci privat yang pasangannya sudah terdaftar di akun vast.")
try:
    from vastai_sdk import VastAI
except ImportError:
    mati("vastai belum terpasang.", "pip install vastai")
v = VastAI(api_key=KUNCI_API.read_text().strip())
saldo = float(v.show_user().get("credit", 0))
print(f"   saldo: ${saldo:.2f}")
if saldo < 0.50:
    mati(f"saldo ${saldo:.2f} terlalu tipis.", "Isi dulu; run yang mati di tengah tetap terpotong.")

# ── 4. CARI PENAWARAN ────────────────────────────────────────────────────────
print("\n## 4. Cari GPU")
kueri = ("num_gpus=1 rentable=true verified=true disk_space>=60 "
         "gpu_ram>=22 cuda_vers>=12.1 inet_down>=200")
# Saringan cpu_ram DICABUT. Ia ditambahkan sebagai pengaman untuk langkah merge
# di CPU — langkah yang sudah dihapus karena merge kini di GPU. Yang tersisa
# cuma kerugiannya: SETIAP nilai cpu_ram (bahkan 16 GB) mengembalikan nol
# penawaran, jadi satuannya bukan yang saya kira. Menebak satuannya berarti
# menambah tebakan di atas pengaman yang tidak lagi menjaga apa pun.
# Tanpa saringan itu: 40 penawaran, 5 layak, termurah /usr/bin/bash,106/jam.
tawar = v.search_offers(query=kueri, order="dph_total", limit=20)
# Turing (2080 Ti) sengaja dilewati: tanpa bf16 dan lebih sering bermasalah
# dengan versi torch di image ini. Selisih harganya tidak sepadan dengan risiko
# run yang mati di tengah — yang tetap terpotong dari saldo.
bagus = [x for x in tawar
         if x["dph_total"] <= BATAS_JAM
         and float(x.get("reliability2", 0)) >= 0.97      # host yang sering gagal = saldo terbakar percuma
         and any(g in x["gpu_name"] for g in ("RTX 3090", "RTX 4090", "RTX A5000", "A100", "RTX 3090 Ti"))]
if not bagus:
    mati("tidak ada penawaran yang memenuhi syarat.", f"Batas harga sekarang ${BATAS_JAM}/jam, keandalan >=0,97.")
print(f"   {len(bagus)} penawaran layak; tiga teratas:")
for x in bagus[:3]:
    print(f"     {x['gpu_name']:<14} ${x['dph_total']:.3f}/jam · andal {float(x.get('reliability2',0)):.3f} · id {x['id']}")
pilih = bagus[0]
perkiraan = pilih["dph_total"] * 0.75
print(f"   perkiraan biaya untuk ±45 menit: ${perkiraan:.2f}")

if HANYA_PERIKSA:
    print(f"\n{H}SIAP{R} — semua pemeriksaan lolos. Jalankan tanpa --periksa untuk menyewa & melatih.")
    sys.exit(0)

# ── 5. SEWA ──────────────────────────────────────────────────────────────────
print("\n## 5. Sewa")
# ── Kenapa mencoba beberapa host, bukan menunggu lebih lama ─────────────────
# Run keempat tersangkut di status "created" selama 21 menit dan tidak pernah
# berjalan — hostnya yang bermasalah (tarikan image mandek), bukan kodenya.
# Menunggu lebih lama pada host yang mandek cuma membakar saldo tanpa peluang
# membaik. Jadi anggarannya diperketat: 7 menit untuk siap, lalu matikan dan
# pindah ke penawaran berikutnya.
BATAS_SIAP_MENIT = 7
# SDK 1.5.5 tidak menerima `ssh=`/`direct=` — cara menyalakan SSH di sini lewat
# `runtype`. Percobaan pertama mati dengan TypeError; untungnya SEBELUM menyewa,
# jadi nol biaya. Itu kebetulan yang beruntung, bukan rancangan: penyewaan
# sengaja ditaruh sesudah semua pemeriksaan supaya kegagalan jatuh di sisi yang
# tidak memakan saldo.
def sewa_sampai_siap(calon):
    """Coba beberapa host. Yang mandek dimatikan cepat, lalu pindah.

    Mengembalikan (iid, host, port, tawaran). Host yang tidak siap dalam
    BATAS_SIAP_MENIT dianggap rusak — bukan lambat. Perbedaannya penting:
    yang lambat akan membaik, yang rusak tidak, dan menunggu keduanya sama
    lamanya berarti membayar untuk menunggu yang tidak akan pernah datang.
    """
    for ke, tawaran in enumerate(calon[:3], 1):
        print(f"\n   percobaan {ke}/3 — {tawaran['gpu_name']} ${tawaran['dph_total']:.3f}/jam (id {tawaran['id']})")
        inst = v.create_instance(id=tawaran["id"], image="pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime",
                                 disk=60, onstart_cmd="sleep infinity", runtype="ssh_direct")
        iid = inst.get("new_contract") or inst.get("id")
        if not iid:
            print(f"   {K}penyewaan ditolak{R}: {str(inst)[:90]}")
            continue
        print(f"   instance {iid} disewa · menunggu siap (batas {BATAS_SIAP_MENIT} menit)")
        t_sewa = time.time()
        keadaan_lalu = ""
        while (time.time() - t_sewa) / 60 < BATAS_SIAP_MENIT:
            try:
                d = [x for x in v.show_instances() if x["id"] == iid]
            except Exception:
                d = []
            if d:
                s = d[0]
                keadaan = s.get("actual_status") or "?"
                if keadaan != keadaan_lalu:
                    print(f"   [{(time.time()-t_sewa)/60:>4.1f} mnt] {keadaan}")
                    keadaan_lalu = keadaan
                if keadaan == "running" and s.get("ssh_host"):
                    # ── "running" BUKAN bukti bisa dipakai ──────────────────
                    # Run ketujuh mati karena host berstatus running tapi SSH
                    # tidak pernah menerima sambungan. Dulu kegagalan itu
                    # membatalkan seluruh percobaan; padahal ia sama saja dengan
                    # host yang mandek — cukup pindah ke host berikutnya.
                    # Jadi "siap" didefinisikan ulang: bukan status yang bilang
                    # jalan, melainkan SSH yang benar-benar menjawab.
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
                    print(f"   {K}running tapi SSH tidak pernah menjawab — host ini dilewati{R}")
                    break
                if keadaan in ("exited", "error"):
                    break
            time.sleep(20)
        print(f"   {K}host ini tidak siap dalam {BATAS_SIAP_MENIT} menit — dimatikan, pindah{R}")
        try:
            v.destroy_instance(id=iid)
        except Exception as e:
            print(f"   {M}gagal mematikan {iid}{R}: {e} — MATIKAN SENDIRI")
    return None, None, None, None


iid, host, port, pilih = sewa_sampai_siap(bagus)
if not iid:
    mati("tiga host berturut-turut tidak siap.",
         "Coba lagi nanti; ini keadaan vast, bukan kesalahan resep. Semua instance sudah dimatikan.")

mulai = time.time()
try:

    ssh = ["ssh", "-i", str(KUNCI_SSH), "-p", str(port),
           "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
           "-o", "LogLevel=ERROR", f"root@{host}"]

    # Penantian SSH sudah pindah ke dalam sewa_sampai_siap(): host yang tidak
    # menjawab dilewati dan diganti, bukan membatalkan seluruh percobaan.
    # Sampai di sini, SSH sudah terbukti menjawab.

    # ── 7. KIRIM ─────────────────────────────────────────────────────────────
    print("\n## 7. Kirim data & skrip")
    # Pelajaran run sebelumnya: scp ke folder yang belum ada GAGAL DIAM-DIAM.
    subprocess.run(ssh + ["mkdir -p /workspace"], check=True, timeout=60)
    for f in (DATA, SKRIP):
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", str(f), f"root@{host}:/workspace/"],
                       check=True, timeout=300)
        print(f"   terkirim: {f.name}")
    # Buktikan sampai — jangan percaya scp yang tidak mengeluh.
    cek = subprocess.run(ssh + ["wc -l < /workspace/migancore-curated.jsonl"],
                         capture_output=True, text=True, timeout=60)
    sampai = int(cek.stdout.strip() or 0)
    if sampai != baris:
        raise RuntimeError(f"dataset sampai tidak utuh: {sampai} dari {baris} baris")
    print(f"   {H}terbukti utuh{R}: {sampai} baris")

    # ── 8. LATIH ─────────────────────────────────────────────────────────────
    print("\n## 8. Latih")
    # `nohup ... &` saja TIDAK cukup. SSH menunggu salurannya tertutup, dan
    # proses latar masih memegang stdin — jadi perintahnya menggantung sampai
    # batas waktu meski latihannya sendiri sudah jalan. Percobaan pertama mati
    # persis di sini sesudah 23 menit dan $0,05.
    # Tiga hal sekaligus melepaskannya: `setsid` memisahkan sesi, `< /dev/null`
    # menutup stdin, dan `exit 0` menutup salurannya segera.
    # ── Kenapa perintah ini tidak dipercaya kode keluarnya ──────────────────
    # Dua percobaan mati di sini dengan TimeoutExpired, padahal latihannya
    # kemungkinan besar SUDAH jalan: OpenSSH menahan sesi sampai semua deskriptor
    # berkas perintah jarak jauh tertutup, dan cangkangnya sendiri masih memegang
    # stdout/stderr di saluran itu — `&`, `nohup`, bahkan `setsid` tidak
    # mengubahnya.
    #
    # Jadi pertanyaannya diganti. Bukan lagi "apakah perintahnya pulang bersih"
    # — melainkan "apakah prosesnya hidup". Yang kedua bisa diperiksa langsung
    # dan tidak bergantung pada perilaku saluran SSH sama sekali.
    subprocess.run(ssh + ["mkdir -p /workspace && cd /workspace && "
                          "printf '#!/bin/bash\\ncd /workspace\\npython latih_v12.py > latih.log 2>&1\\n' > jalan.sh && "
                          "chmod +x jalan.sh"], check=True, timeout=60)
    try:
        subprocess.run(ssh + ["cd /workspace && (setsid ./jalan.sh &) >/dev/null 2>&1 < /dev/null"],
                       timeout=45, capture_output=True)
    except subprocess.TimeoutExpired:
        # Diharapkan, dan tidak apa-apa. Pemeriksaan sesungguhnya ada di bawah.
        print(f"   {K}saluran SSH tidak menutup (biasa){R} — memeriksa prosesnya langsung")

    hidup = False
    for _ in range(6):
        time.sleep(15)
        r = subprocess.run(ssh + ["pgrep -f latih_v12.py >/dev/null && echo HIDUP || echo MATI"],
                           capture_output=True, text=True, timeout=60)
        if "HIDUP" in r.stdout:
            hidup = True
            break
        # Proses bisa juga sudah SELESAI kalau ia gagal cepat — periksa lognya.
        log = subprocess.run(ssh + ["cat /workspace/latih.log 2>/dev/null | tail -5"],
                             capture_output=True, text=True, timeout=60)
        if log.stdout.strip():
            hidup = True   # ada keluaran = ia benar-benar jalan; nasibnya diurus pemantau
            break
    if not hidup:
        awal = subprocess.run(ssh + ["cat /workspace/latih.log 2>/dev/null | head -20; ls -la /workspace"],
                              capture_output=True, text=True, timeout=60)
        raise RuntimeError("proses latih tidak pernah hidup:\n" + awal.stdout[-1200:])
    print(f"   {H}proses latih hidup{R}")
    # ── ATURAN PEMANTAU: ia TIDAK BOLEH bisa membunuh yang dipantaunya ──────
    # Run ketiga mati di sini karena `r.stdout` sekali waktu bernilai None dan
    # `.strip()` melemparkan AttributeError — latihannya sedang berjalan baik,
    # dan yang membatalkannya adalah kode yang tugasnya cuma MELIHAT.
    # Satu gangguan SSH sesaat tidak boleh membuang GPU yang sudah dibayar.
    # Karena itu setiap pengintipan dibungkus, kegagalannya dihitung, dan hanya
    # kegagalan yang BERUNTUN yang dianggap berarti.
    lalu, gagal_intip = "", 0
    terakhir_maju = time.time()
    while True:
        lewat = (time.time() - mulai) / 60
        if lewat > BATAS_MENIT:
            raise RuntimeError(f"lewat {BATAS_MENIT} menit — dimatikan daripada membakar saldo")
        keluaran = ""
        try:
            r = subprocess.run(ssh + ["tail -3 /workspace/latih.log 2>/dev/null"],
                               capture_output=True, text=True, timeout=60)
            keluaran = r.stdout or ""
            gagal_intip = 0
        except Exception as e:
            gagal_intip += 1
            print(f"   [{int(lewat):>2} mnt] (gagal mengintip {gagal_intip}×: {type(e).__name__}) — latihan dibiarkan jalan")
            if gagal_intip >= 8:
                raise RuntimeError("delapan kali berturut-turut tidak bisa mengintip; instance mungkin hilang")
            time.sleep(45)
            continue

        baris_akhir = [b for b in keluaran.strip().splitlines() if b.strip()]
        if baris_akhir and baris_akhir[-1] != lalu:
            lalu = baris_akhir[-1]
            terakhir_maju = time.time()
            print(f"   [{int(lewat):>2} mnt] {lalu[:110]}")
        # ── MACET: hidup, tapi tidak maju ────────────────────────────────────
        # Run kedelapan tersangkut 77 menit di langkah merge. Prosesnya HIDUP,
        # jadi deteksi kematian tidak menyalak; lognya diam, jadi tidak ada
        # pemicu lain. Ia baru berhenti waktu batas 90 menit tercapai — $0,22
        # untuk menunggu sesuatu yang sudah berhenti bergerak di menit ke-13.
        # Hidup dan maju itu dua hal berbeda, dan yang kedua yang kita bayar.
        diam = (time.time() - terakhir_maju) / 60
        if diam > BATAS_DIAM_MENIT:
            penuh = subprocess.run(ssh + ["tail -25 /workspace/latih.log"],
                                   capture_output=True, text=True, timeout=60)
            raise RuntimeError(f"MACET — log tidak bergerak {diam:.0f} menit (batas {BATAS_DIAM_MENIT}). "
                               f"Prosesnya hidup tapi tidak maju.\n" + (penuh.stdout or "")[-1200:])
        if "SELESAI dalam" in keluaran:
            break
        # ── Deteksi KEMATIAN, bukan cuma kata kunci di log ───────────────────
        # Run kelima gagal di langkah GGUF pada menit ke-14. Prosesnya mati,
        # lognya berhenti berubah, dan pemantau ini menunggu 77 menit lagi
        # sampai batas waktu — membayar $0,20 untuk menatap berkas yang tidak
        # akan bergerak. Kata kunci saja tidak cukup: yang menentukan adalah
        # apakah prosesnya masih ada.
        try:
            hidup_cek = subprocess.run(ssh + ["pgrep -f latih_v12.py >/dev/null && echo H || echo M"],
                                       capture_output=True, text=True, timeout=60)
            masih_hidup = "H" in (hidup_cek.stdout or "")
        except Exception:
            masih_hidup = True            # gangguan mengintip bukan bukti kematian
        if not masih_hidup:
            penuh = subprocess.run(ssh + ["tail -40 /workspace/latih.log"],
                                   capture_output=True, text=True, timeout=60)
            raise RuntimeError("proses latih MATI sebelum selesai:\n" + (penuh.stdout or "")[-1800:])
        time.sleep(45)

    # ── 9. AMBIL ─────────────────────────────────────────────────────────────
    print("\n## 9. Ambil hasil")
    keluar = AKAR / "models"
    keluar.mkdir(exist_ok=True)

    def ambil(nama):
        subprocess.run(["scp", "-i", str(KUNCI_SSH), "-P", str(port),
                        "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                        "-o", "LogLevel=ERROR", f"root@{host}:/workspace/{nama}", str(keluar)],
                       check=True, timeout=2400)
        print(f"   terambil: {nama}")

    ambil("ringkasan.json")
    ring = json.loads((keluar / "ringkasan.json").read_text())
    # ADAPTER DIAMBIL DULU, selalu. Ia cuma ±100 MB, dan dari situ GGUF bisa
    # dibuat ulang kapan saja di mesin mana pun. Run kelima kehilangan bobot yang
    # sudah bagus karena satu-satunya artefak yang diambil adalah GGUF — yang
    # justru langkah paling rapuh. Yang paling berharga harus diamankan lebih
    # dulu, bukan terakhir.
    subprocess.run(ssh + ["cd /workspace && tar czf lora.tgz lora"], check=True, timeout=300)
    ambil("lora.tgz")
    if ring.get("gguf"):
        ambil("migancore-12-q4_k_m.gguf")
    else:
        print(f"   {K}GGUF gagal di sisi sana{R} — adapter sudah aman, konversi bisa diulang di sini")
    print(f"\n   loss {ring['loss']:.4f} · {ring['baris']} baris · {ring['menit']} menit "
          f"· token dilatih {ring['tokenDilatihPersen']}%")

finally:
    # ── 10. MATIKAN — apa pun yang terjadi ───────────────────────────────────
    print("\n## 10. Matikan instance")
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

print(f"\n{H}SELESAI{R}. Langkah berikutnya — daftarkan lalu ukur PER JENIS:")
print("   ollama create migancore:0.12-4b -f Modelfile")
print("   node eval/banding-jenis.mjs migancore:0.11-4b migancore:0.12-4b")
print("   (lalu baca kenari dan bandingkan petak tahan)")
