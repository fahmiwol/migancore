$ProgressPreference = 'SilentlyContinue'
$py = '.-pelari\venv-s1\Scripts\python.exe'
& $py -m pip show laya 2>&1 | Select-String -Pattern '^(Name|Version|Home-page|Summary|License|Requires)'
$kode = @'
import importlib.metadata as m
md = m.metadata("laya")
for k in ("Home-page", "Project-URL"):
    for v in (md.get_all(k) or []): print(k, v)
import os, glob, laya
d = os.path.dirname(laya.__file__)
for f in sorted(glob.glob(os.path.join(d, "**", "*.py"), recursive=True)):
    txt = open(f, encoding="utf-8", errors="ignore").read()
    hits = [w for w in ("def train", "def fit", "proper_reward(", "optimizer", "finetune", "fine_tune", "calibrat") if w in txt]
    if hits: print(os.path.relpath(f, d), hits)
'@
$f = '.-pelari\laya-meta.py'
Set-Content -Path $f -Value $kode -Encoding UTF8
& $py $f 2>&1 | Select-Object -First 40
