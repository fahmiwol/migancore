#!/usr/bin/env python
"""intip.py — intip keadaan run vast yang sedang jalan, HANYA-BACA.

Dibuat 23 Agu karena log peluncur (nohup > berkas) ter-buffer sehingga kosong
selama run berjalan. Alat ini membaca langsung: daftar instance dari SDK + tail
/workspace/latih.log lewat SSH. Tidak mengubah apa pun, tidak mematikan apa pun.

Pakai: python flywheel/vast/intip.py [baris=8]
"""
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
N = int(sys.argv[1]) if len(sys.argv) > 1 else 8
KUNCI_API = Path.home() / ".vast_api_key"
KUNCI_SSH = Path.home() / ".ssh" / "vast_migancore"
from vastai_sdk import VastAI  # noqa: E402

v = VastAI(api_key=KUNCI_API.read_text().strip())
print(f"saldo: ${float(v.show_user().get('credit', 0)):.2f}")
inst = v.show_instances()
if not inst:
    print("tidak ada instance aktif")
    sys.exit(0)
for s in inst:
    print(f"instance {s['id']}: {s.get('actual_status')} · {s.get('gpu_name')} · ${s.get('dph_total', 0):.3f}/jam · ssh {s.get('ssh_host')}:{s.get('ssh_port')}")
    if s.get("actual_status") == "running" and s.get("ssh_host"):
        ssh = ["ssh", "-i", str(KUNCI_SSH), "-p", str(s["ssh_port"]), "-o", "StrictHostKeyChecking=no",
               "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=15",
               f"root@{s['ssh_host']}", f"tail -n {N} /workspace/latih.log 2>/dev/null; ls /workspace 2>/dev/null | tr '\\n' ' '"]
        try:
            r = subprocess.run(ssh, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=40)
            print((r.stdout or "(log kosong / belum ada)").rstrip())
        except Exception as e:
            print(f"  (ssh gagal: {type(e).__name__})")
