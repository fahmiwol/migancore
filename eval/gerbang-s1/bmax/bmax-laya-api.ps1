$ProgressPreference = 'SilentlyContinue'
$py = '.-pelari\venv-s1\Scripts\python.exe'
$kode = @'
import importlib, inspect, os, pkgutil
os.environ.setdefault("USE_TF", "0")
import laya
print("laya", getattr(laya, "__version__", "?"), os.path.dirname(laya.__file__))
for m in pkgutil.walk_packages(laya.__path__, "laya."):
    print("modul", m.name)
names = [n for n in dir(laya) if not n.startswith("_")]
print("atribut laya:", names)
for n in names:
    o = getattr(laya, n)
    if callable(o):
        try: print("  ", n, str(inspect.signature(o))[:200])
        except Exception: pass
'@
$f = '.-pelari\laya-api.py'
Set-Content -Path $f -Value $kode -Encoding UTF8
& $py $f 2>&1 | Select-Object -First 60
