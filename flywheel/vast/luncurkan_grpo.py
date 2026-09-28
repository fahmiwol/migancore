#!/usr/bin/env python
"""luncurkan_grpo.py — sewa GPU, jalankan MO-GRPO di atas adapter SFT, ambil, MATIKAN.

Pola keselamatan warisan luncurkan_cluster.py: gerbang lokal DULU, sewa paling
akhir, siap = SSH menjawab (bukan status API), cetak kemajuan supaya diam tidak
dikira mati, dan matikan di `finally` apa pun yang terjadi.

============================ UTANG YANG DIAKUI =============================
Mesin sewa/siap/matikan sekarang ada di DUA berkas (luncurkan_cluster.py dan ini).
Itu penyakit C24 yang kami tulis hukumnya sendiri. Tidak diekstrak malam ini
dengan sengaja: luncurkan_cluster.py adalah skrip yang SEDANG bekerja dan
membelanjakan uang, dan membedahnya jam 4 pagi untuk kerapian adalah risiko yang
lebih besar daripada duplikasinya. SEBELUM ada peluncur KETIGA, ekstrak jadi
flywheel/vast/sewa.py.

============================== GERBANG PRA-GPU =============================
Dijalankan SEBELUM satu rupiah keluar, dan menahan run kalau gagal:
  1. uji_ganjaran.py  — ganjaran Python identik dengan JS (kalau menyimpang,
                        yang DILATIH bukan yang DIUJI, dan skornya tetap
                        terlihat masuk akal)
  2. latih_grpo.py --uji-instrumen — matematika MO-GRPO
  3. kolam ada, sidiknya cocok pra-daftar

Pakai: python luncurkan_grpo.py --probe          (2 langkah, murah, membuktikan tumpukan)
       python luncurkan_grpo.py --langkah 60     (run penuh)
"""
import hashlib
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
H, M, K, R = "\033[32m", "\033[31m", "\033[33m", "\033[0m"

KUNCI_API = Path.home() / ".vast_api_key"
KUNCI_SSH = Path.home() / ".ssh" / "vast_migancore"
def _arg(nama, bawaan):
    return sys.argv[sys.argv.index(nama) + 1] if nama in sys.argv else bawaan


# Kolam, pra-daftar, dan adapter awal DAPAT DIARAHKAN. Sebelumnya ketiganya
# di-hardcode ke jalur tool/H-MOGRPO, dan run kejujuran 31 Agu harus mengubah
# sumbernya. Mengedit hardcode tiap run adalah cara paling rapi untuk suatu hari
# melatih kolam yang salah tanpa sadar -- kelas cacat yang sama dengan
# `migancore:0.13` yang tertulis di empat tempat sementara model berlaku sudah 0.14.
KOLAM = Path(_arg("--kolam", str(FLY / "dataset" / "grpo" / "kolam-tool.jsonl")))
PRA = Path(_arg("--pra", str(FLY / "PRA-DAFTAR-H-MOGRPO.json")))
ADAPTER = Path(_arg("--adapter", str(AKAR / "models" / "v14" / "lora-tool.tgz")))
NAMA = _arg("--nama", "")
KELUAR = AKAR / "models" / "v15"

PROBE = "--probe" in sys.argv
LANGKAH = int(sys.argv[sys.argv.index("--langkah") + 1]) if "--langkah" in sys.argv else (2 if PROBE else 60)
BATAS_JAM = 0.35
BATAS_SIAP_MENIT = 7
# Batas diam SFT tidak berlaku untuk GRPO, dan itu membunuh run yang sehat.
# 1 Sep: run-3 mencapai "trainable params" lalu diam 12 menit dan DIBUNUH — bukan
# karena macet, melainkan karena SATU langkah pengoptimasi GRPO = 16 langkah
# akumulasi x 8 rollout = 128 generasi, dan TRL baru mencatat SESUDAH langkah
# pengoptimasi selesai. Diam panjang adalah keadaan NORMAL di sini, bukan gejala.
# Diperparah `use_cache=False` yang dipaksa gradient_checkpointing: generasi tanpa
# KV-cache berbiaya kuadratik terhadap panjang.
BATAS_DIAM_MENIT = int(_arg("--diam", "12"))
BATAS_MENIT = int(_arg("--batas", "45" if PROBE else "90"))


def mati(pesan, saran=""):
    print(f"\n{M}BERHENTI{R} — {pesan}")
    if saran:
        print(f"  {saran}")
    sys.exit(1)


def jalan(cmd, **kw):
    kw.setdefault("capture_output", True)
    kw.setdefault("text", True)
    kw.setdefault("encoding", "utf-8")
    kw.setdefault("errors", "replace")
    return subprocess.run(cmd, **kw)


print(f"# MO-GRPO {'PROBE' if PROBE else 'penuh'} — {LANGKAH} langkah\n")

# ── 1. GERBANG LOKAL, sebelum uang keluar
print("## 1. Gerbang pra-GPU")
for nama, cmd in [
    ("ganjaran JS<->Python", [sys.executable, str(DIR / "uji_ganjaran.py")]),
    ("matematika MO-GRPO", [sys.executable, str(DIR / "latih_grpo.py"), "--uji-instrumen"]),
    # Ditambahkan 1 Sep, sesudah probe mati `KeyError: 'k'` SESUDAH menyewa GPU,
    # mengirim 5 berkas, dan memasang pustaka: $0,05 dan 15 menit untuk sesuatu
    # yang bisa diketahui gratis dalam 2 detik. Gerbang ini memuat kolam apa
    # adanya, memastikan tiap barisnya bisa dinilai SETIAP objektif (C39), dan
    # melaporkan berapa baris membawa system prompt.
    ("kolam bisa dimuat & dinilai", [sys.executable, str(DIR / "latih_grpo.py"), "--uji-kolam", str(KOLAM)]),
]:
    r = jalan(cmd, timeout=300)
    if r.returncode != 0:
        print((r.stdout or "").strip()[-1200:])
        mati(f"gerbang '{nama}' GAGAL — GPU tidak disewa.")
    print(f"   {H}{nama}{R} lulus")

for f in (KOLAM, PRA, ADAPTER, DIR / "latih_grpo.py", DIR / "ganjaran.py"):
    if not f.exists():
        mati(f"berkas tidak ada: {f}")

sidik_kolam = hashlib.sha256(KOLAM.read_bytes()).hexdigest()[:16]
pra = json.loads(PRA.read_text(encoding="utf-8"))
if pra.get("sidikData", {}).get("kolam") != sidik_kolam:
    mati(f"pra-daftar KEDALUWARSA — kolam dikunci {pra.get('sidikData', {}).get('kolam')}, sekarang {sidik_kolam}.",
         "Kolam berubah sesudah ambang dikunci; hasil apa pun tidak bisa ditafsirkan.")
print(f"   {H}kolam{R} sidik {sidik_kolam} cocok pra-daftar ({pra.get('nama')})")

# ── 2. sewa
from vastai import VastAI  # noqa: E402
v = VastAI(api_key=KUNCI_API.read_text().strip())
saldo = float(v.show_user().get("credit", 0))
print(f"\n## 2. Sewa GPU (saldo ${saldo:.2f})")
if saldo < 0.5:
    mati(f"saldo ${saldo:.2f} terlalu tipis.")

# Kueri & penyaringan disalin dari luncurkan_cluster.py yang sudah terbukti:
# kueri gaya `gpu_name=RTX_3090` yang kutebak sebelumnya tidak dipakai di sana, dan
# menyaring ke SATU jenis kartu membuat peluncur gampang kehabisan tawaran.
# GRPO butuh VRAM lebih besar daripada SFT (rollout + acuan KL), jadi gpu_ram>=22
# dan reliabilitas >=0,97 dipertahankan.
kueri = ("num_gpus=1 rentable=true verified=true disk_space>=60 "
         "gpu_ram>=30 cuda_vers>=12.1 inet_down>=200")
# 22 -> 30 GiB pada 1 Sep, sesudah DUA OOM yang mengukur kebutuhannya:
#   run-1  256 token, kartu 31,47 GiB: minta 9,31 · bebas 6,78  -> OOM
#   run-2  128 token, kartu 23,55 GiB: minta 4,67 · bebas 3,71  -> OOM
# Keduanya membuktikan perbaikan bekerja (potong token 9,31->4,67 tepat separuh;
# expandable_segments menekan fragmentasi 1,08 GiB -> 0,065 GiB) — yang kurang
# cuma kartunya. Pada kartu 31,47 GiB dengan 128 token, kebutuhannya ~4,67
# sementara yang bebas ~9 GiB. Menaikkan ambang kartu MENJAGA RESEP UTUH;
# menurunkan n_generasi akan merusak taksiran advantage yang jadi inti MO-GRPO.
semua = v.search_offers(query=kueri, order="dph_total", limit=20)
tawaran = [x for x in semua
           if x["dph_total"] <= BATAS_JAM
           and float(x.get("reliability2", 0)) >= 0.97
           and any(g in x["gpu_name"] for g in ("RTX 3090", "RTX 4090", "RTX A5000", "A100", "RTX 4080"))][:5]
if not tawaran:
    mati(f"tidak ada penawaran layak (Ampere+ <= ${BATAS_JAM}/jam) dari {len(semua)} tawaran.")
print(f"   {len(tawaran)} layak; termurah {tawaran[0]['gpu_name']} ${tawaran[0]['dph_total']:.3f}/jam")

iid = host = port = None
for t in tawaran:
    print(f"   coba offer {t['id']} · ${t['dph_total']:.3f}/jam")
    try:
        # Argumen disalin PERSIS dari luncurkan_cluster.py yang sudah terbukti
        # bekerja. Versi pertama berkas ini menebak `ssh=True, direct=True` dan
        # SDK menolaknya ("unexpected keyword argument 'ssh'") — ketahuan probe
        # sebelum satu rupiah keluar, yang memang gunanya probe.
        res = v.create_instance(id=t["id"], image="pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime",
                                disk=60, onstart_cmd="sleep infinity", runtype="ssh_direct")
        cid = res.get("new_contract") or res.get("id")
        if not cid:
            print(f"   {K}ditolak{R}: {str(res)[:90]}")
            continue
    except Exception as e:
        print(f"   gagal menyewa: {e}")
        continue
    t_sewa, siap = time.time(), False
    while (time.time() - t_sewa) / 60 < BATAS_SIAP_MENIT:
        d = [x for x in v.show_instances() if x["id"] == cid]
        if d and d[0].get("actual_status") == "running" and d[0].get("ssh_host"):
            s = d[0]
            uji = ["ssh", "-i", str(KUNCI_SSH), "-p", str(s["ssh_port"]),
                   "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                   "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=15", f"root@{s['ssh_host']}", "echo siap"]
            if jalan(uji, timeout=30).returncode == 0:
                iid, host, port, siap = cid, s["ssh_host"], s["ssh_port"], True
                print(f"   {H}siap & SSH menjawab{R}")
                break
        print(f"   [{(time.time()-t_sewa)/60:>4.1f} mnt] menunggu…")
        time.sleep(20)
    if siap:
        break
    print(f"   {K}tidak siap — matikan & pindah host{R}")
    try:
        v.destroy_instance(id=cid)
    except Exception as e:
        print(f"   {M}gagal mematikan {cid}: {e} — MATIKAN SENDIRI{R}")

if not iid:
    mati("tidak ada host yang siap; semua sudah dimatikan.")

mulai = time.time()
try:
    ssh = ["ssh", "-i", str(KUNCI_SSH), "-p", str(port), "-o", "StrictHostKeyChecking=no",
           "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR", f"root@{host}"]
    scp = ["scp", "-i", str(KUNCI_SSH), "-P", str(port), "-o", "StrictHostKeyChecking=no",
           "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR"]

    # VRAM DIVERIFIKASI DARI KARTUNYA, bukan dari label penawaran. Pelajaran C40:
    # memeriksa nama sebuah hal bukan memeriksa hal itu. Label vast pernah
    # menyebut "RTX 4080S 32 GiB" padahal kartu itu sebenarnya 16 GB — dan kalau
    # labelnya keliru, kita membayar penuh untuk OOM ketiga. Satu perintah,
    # dijalankan sebelum satu berkas pun dikirim.
    r = jalan(ssh + ["nvidia-smi --query-gpu=name,memory.total --format=csv,noheader"], timeout=60)
    baris_gpu = (r.stdout or "").strip()
    print(f"\n## 2b. Kartu yang BENAR-BENAR didapat: {baris_gpu or '(tidak terbaca)'}")
    try:
        mib = int(baris_gpu.split(",")[1].strip().split()[0])
    except Exception:
        mati(f"tidak bisa membaca VRAM dari nvidia-smi: {baris_gpu!r}",
             "Jangan melatih di kartu yang kapasitasnya tidak diketahui.")
    if mib < 30 * 1024:
        mati(f"VRAM {mib/1024:.1f} GiB < 30 GiB — dua OOM terdahulu membuktikan resep ini "
             f"tidak muat di bawah itu.",
             "Label penawaran vast tidak sama dengan kenyataan kartunya. Jalankan ulang; "
             "peluncur akan mencoba host lain.")
    print(f"   {H}VRAM {mib/1024:.1f} GiB{R} — cukup")

    print("\n## 3. Kirim bahan")
    jalan(ssh + ["mkdir -p /workspace"], timeout=60)
    for f in (DIR / "latih_grpo.py", DIR / "ganjaran.py", DIR / "ukur_latih.py", KOLAM, ADAPTER):
        r = jalan(scp + [str(f), f"root@{host}:/workspace/{f.name}"], timeout=1800)
        if r.returncode != 0:
            mati(f"gagal mengirim {f.name}: {(r.stderr or '').strip()[:200]}")
        print(f"   terkirim: {f.name}")
    # tar mengekstrak ke `lora/`, BUKAN `adapter-tool/`. Versi pertama memanggil
    # latih_grpo dengan --adapter adapter-tool dan akan gagal memuat bobotnya.
    # Nama direktori di dalam arsip itu fakta yang harus DIPERIKSA, bukan diingat.
    #
    # 1 Sep: nama arsipnya sendiri juga di-hardcode (`lora-tool.tgz`) sementara
    # probe kejujuran mengirim `lora-gaya.tgz`. tar gagal, `ls -d */` tak
    # mengeluarkan apa-apa, dan barisnya cuma mencetak "isi arsip adapter: "
    # KOSONG — lalu latihan tetap berjalan dengan --adapter lora yang tidak ada.
    # Gagal senyap yang membuat run melatih bobot yang salah tanpa satu pun pesan.
    r = jalan(ssh + [f"cd /workspace && tar xzf {ADAPTER.name} && ls -d */"], timeout=300)
    isi = (r.stdout or "").split()
    print("   isi arsip adapter: " + (" ".join(isi) if isi else "(KOSONG)"))
    if r.returncode != 0 or "lora/" not in isi:
        mati(f"ekstraksi {ADAPTER.name} GAGAL atau tidak menghasilkan direktori `lora/` — "
             f"isi: {isi or '(kosong)'}; stderr: {(r.stderr or '').strip()[:200]}",
             "Latihan dengan adapter yang tidak termuat akan berjalan mulus di atas bobot yang SALAH.")

    print("\n## 4. Pasang pustaka")
    # Pin dicatat di latih_grpo.PIN dan ikut ke ringkasan. `python -u` supaya log
    # tidak ter-buffer — pelajaran malam ini: log kosong bukan berarti proses mati,
    # tapi tetap membuat kita buta selama sejam.
    # `pip ... | tail -3` MENELAN kode keluar pip: yang dibaca adalah kode `tail`,
    # yang selalu 0. Jadi `if r.returncode != 0` di sini TIDAK PERNAH menyala.
    # 1 Sep: sebuah host gagal mencapai PyPI (SSL EOF), trl & datasets tidak
    # terpasang, peluncur melanjutkan dengan tenang, dan run baru mati 25 menit
    # kemudian dengan ModuleNotFoundError — $0,11 untuk kegagalan yang sudah
    # jelas di menit pertama. `set -o pipefail` menutup celahnya.
    pasang = ("set -o pipefail; pip install -q 'trl>=0.14,<0.15' 'transformers==4.51.3' "
              "'peft==0.14.0' 'datasets>=2.19' accelerate 2>&1 | tail -3")
    r = jalan(ssh + [pasang], timeout=2400)
    print("   " + (r.stdout or "").strip()[-400:])
    if r.returncode != 0:
        mati("pemasangan pustaka GAGAL — lihat keluaran di atas.",
             "Sering host-nya, bukan kita. Jalankan ulang; peluncur akan memilih host lain.")

    # Kode keluar saja tidak cukup — periksa MEKANISMENYA (C40). Impor nyata
    # membuktikan pustakanya benar-benar ada dan bisa dipakai, dan versinya
    # dicetak supaya beda pin ketahuan sekarang, bukan di ringkasan nanti.
    r = jalan(ssh + ["cd /workspace && python -c \"import trl,transformers,peft,datasets,accelerate;"
                     "print('trl',trl.__version__,'tf',transformers.__version__,'peft',peft.__version__)\""],
              timeout=300)
    if r.returncode != 0:
        mati(f"pustaka tidak bisa DIIMPOR meski pip melapor sukses: {(r.stderr or '').strip()[:200]}",
             "Jangan menyewa waktu latih di lingkungan yang belum terbukti bisa mengimpor.")
    print(f"   {H}pustaka terimpor{R}: {(r.stdout or '').strip()}")

    print("\n## 5. Latih")
    # Pola PERSIS dari luncurkan_cluster.py: tulis jalan.sh lalu lepaskan dengan
    # setsid DAN alihkan ketiga aliran. Versi pertama memakai `nohup ... &` langsung
    # lewat ssh dan MENGGANTUNG: ssh menunggu kanalnya tertutup, dan `&` saja tidak
    # menutupnya. Peluncur mati kena timeout 120 detik padahal instance sehat dan
    # pustakanya sudah terpasang. Pelajaran yang sama untuk KEDUA kalinya malam ini:
    # jangan menebak antarmuka yang versi bekerjanya ada di repo yang sama.
    bendera = " --probe" if PROBE else ""
    # jalan.sh ditulis dengan printf DI SISI REMOTE, bukan lewat stdin.
    # Versi sebelumnya mengirim isinya lewat `input=` dan Python `text=True` di
    # Windows menerjemahkan setiap \n jadi \r\n. Hasilnya shebang berbunyi
    # "#!/bin/bash\r" — interpreter yang tidak ada, jadi skrip TIDAK PERNAH JALAN
    # dan tidak ada satu pun pesan galat: grpo.log bahkan tak pernah dibuat.
    # Kegagalan paling mahal justru yang tidak meninggalkan jejak.
    # PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True — perbaikan OOM ke-3 dari
    # probe 28 Agu, yang ternyata TIDAK PERNAH SAMPAI KE KODE. Komentar di
    # latih_grpo.py berbunyi "expandable_segments (di jalan.sh)", tapi jalan.sh
    # yang dibangun di sini hanya membawa PYTHONIOENCODING. 1 Sep saya
    # "memverifikasi" kelima perbaikan itu dengan grep, menemukan namanya, dan
    # menyimpulkan terpasang — padahal yang saya temukan adalah KOMENTAR YANG
    # MENJANJIKANNYA. Run penuh lalu OOM dengan galat yang menyarankan persis
    # setelan ini, dan 1,08 GiB tercadang-tak-terpakai = fragmentasi yang ia obati.
    skrip = ("printf '#!/bin/bash\\ncd /workspace\\n"
             "export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True\\nPYTHONIOENCODING=utf-8 "
             "python -u latih_grpo.py --kolam " + KOLAM.name + " --adapter lora "
             f"--keluar adapter-grpo --langkah {LANGKAH}{bendera} > grpo.log 2>&1\\n' "
             "> /workspace/jalan.sh && chmod +x /workspace/jalan.sh")
    r = jalan(ssh + [skrip], timeout=60)
    if r.returncode != 0:
        mati('gagal menulis jalan.sh: ' + (r.stderr or '').strip()[:200])
    jalan(ssh + ["cd /workspace && (setsid ./jalan.sh &) >/dev/null 2>&1 < /dev/null"], timeout=60)
    t_diam, panjang_lalu = time.time(), 0
    while True:
        lewat = (time.time() - mulai) / 60
        if lewat > BATAS_MENIT:
            mati(f"lewat {BATAS_MENIT} menit — instance dimatikan di finally.")
        # `tail -c +N` = HANYA bita yang baru sejak pembacaan terakhir. Versi
        # sebelumnya memakai `tail -n 3` dan mencetak ketiganya tiap kali berkas
        # tumbuh, sehingga baris yang sama muncul berulang. 1 Sep itu membuat
        # baris "# GRPO penuh" tercetak dua kali dan saya menghabiskan waktu
        # menyelidiki apakah dua proses latih berjalan sekaligus (yang akan
        # melipatgandakan memori dan menjelaskan OOM). Bukan. Artefak tampilan
        # yang menyamar jadi bukti.
        r = jalan(ssh + [f"wc -c < /workspace/grpo.log; tail -c +{panjang_lalu + 1} /workspace/grpo.log"],
                  timeout=60)
        keluaran = (r.stdout or "").splitlines()
        panjang = int(keluaran[0]) if keluaran and keluaran[0].strip().isdigit() else 0
        if panjang > panjang_lalu:
            t_diam, panjang_lalu = time.time(), panjang
            for b in keluaran[1:]:
                if b.strip():
                    print(f"   [{lewat:>4.1f} mnt] {b}")
        else:
            # DIAM BUKAN MACET. Diukur 1 Sep: seluruh run 3 langkah hanya menulis
            # SATU baris metrik ke grpo.log — ringkasan akhir. TRL tidak mencatat
            # per langkah di sini, jadi run 60 langkah akan sunyi 102 menit penuh.
            # Batas diam tetap membunuh run yang sehat, dan itulah yang membunuh
            # run-3 ($0,13 hangus untuk latihan yang sebenarnya sedang berjalan).
            #
            # Yang benar bukan menaikkan angkanya, melainkan mengganti
            # pertanyaannya: jangan tanya "apakah ia menulis?", tanya "apakah
            # kartunya bekerja?". Pemakaian GPU membedakan sibuk dari menggantung
            # dengan cara yang tidak bisa dilakukan panjang berkas.
            u = jalan(ssh + ["nvidia-smi --query-gpu=utilization.gpu,memory.used "
                             "--format=csv,noheader,nounits"], timeout=60)
            pakai = (u.stdout or "").strip().split(",")
            try:
                util, mem = int(pakai[0]), int(pakai[1])
            except Exception:
                util, mem = -1, -1
            if util > 5 or mem > 2000:
                t_diam = time.time()          # sibuk — nyawanya diperpanjang
                print(f"   [{lewat:>4.1f} mnt] (sunyi, tapi GPU {util}% · {mem} MiB — masih bekerja)")
            elif (time.time() - t_diam) / 60 > BATAS_DIAM_MENIT:
                mati(f"diam {BATAS_DIAM_MENIT} menit DAN GPU menganggur ({util}% · {mem} MiB) — macet.")
        if jalan(ssh + ["test -f /workspace/adapter-grpo/ringkasan-grpo.json && echo ADA"],
                 timeout=60).stdout.strip() == "ADA":
            print(f"   {H}selesai{R}")
            break
        time.sleep(30)

    print("\n## 6. Ambil")
    KELUAR.mkdir(parents=True, exist_ok=True)
    akhiran = ("-" + NAMA if NAMA else "") + ("-probe" if PROBE else "")
    jalan(ssh + ["cd /workspace && tar czf adapter-grpo.tgz adapter-grpo"], timeout=600)
    for jauh, dekat in [("adapter-grpo.tgz", f"lora-tool-grpo{akhiran}.tgz"),
                        ("adapter-grpo/ringkasan-grpo.json", f"ringkasan-tool-grpo{akhiran}.json"),
                        ("grpo.log", f"grpo{akhiran}.log")]:
        r = jalan(scp + [f"root@{host}:/workspace/{jauh}", str(KELUAR / dekat)], timeout=1800)
        print(f"   {'terambil' if r.returncode == 0 else 'GAGAL'}: {dekat}")

    ring = KELUAR / f"ringkasan-tool-grpo{akhiran}.json"
    if ring.exists():
        j = json.loads(ring.read_text(encoding="utf-8"))
        print(f"\n   langkah {j.get('langkah')} · {j.get('menit')} mnt · rollout {j.get('nRollout')}")
        print(f"   ganjaran mentah rata-rata: {j.get('ganjaranMentahRata')}")

finally:
    print("\n## 7. Matikan instance")
    try:
        v.destroy_instance(id=iid)
        print(f"   instance {iid} dimatikan")
    except Exception as e:
        print(f"   {M}GAGAL mematikan {iid}: {e} — MATIKAN SENDIRI SEKARANG{R}")
    try:
        print(f"   hidup {(time.time()-mulai)/60:.0f} menit · saldo sekarang ${float(v.show_user().get('credit', 0)):.2f}")
    except Exception:
        pass
