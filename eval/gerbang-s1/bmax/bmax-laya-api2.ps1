$ProgressPreference = 'SilentlyContinue'
$py = '.-pelari\venv-s1\Scripts\python.exe'
$kode = @'
import inspect, os
os.environ.setdefault("USE_TF", "0")
import laya
from laya import agent as A
for cls in (laya.Agent, laya.RLAgent):
    ms = [n for n, v in inspect.getmembers(cls) if callable(v) and not n.startswith("__")]
    print(cls.__name__, "metode:", ms)
src = inspect.getsource(laya.RLAgent)
print("---- RLAgent sumber (awal) ----")
print(src[:6000])
'@
$f = '.-pelari\laya-api2.py'
Set-Content -Path $f -Value $kode -Encoding UTF8
& $py $f 2>&1 | Select-Object -First 200
