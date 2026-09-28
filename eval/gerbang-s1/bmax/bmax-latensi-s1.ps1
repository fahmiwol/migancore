$ProgressPreference = 'SilentlyContinue'
$d = '.-pelari'
$py = "$d\venv-s1\Scripts\python.exe"
if (Test-Path "$d\latensi-s1.json") { 'hasil latensi sudah ada - tidak diulang'; exit 1 }
# Cache sah dari pemasangan (HF_HOME) + luring total: alat gagal tertutup, tidak pernah mengunduh.
$bat = @(
  '@echo off',
  "set HF_HOME=$d\hf-cache",
  'set HF_HUB_OFFLINE=1',
  'set TRANSFORMERS_OFFLINE=1',
  'set USE_TF=0',
  "`"$py`" `"$d\latensi_s1.py`" --masukan `"$d\pasangan-latensi.jsonl`" --keluar `"$d\latensi-s1.json`" --n 150 --catatan `"BERSAMAAN dengan run jawab Gerbang-S1 (Ollama aktif) - BATAS ATAS`" > `"$d\log-latensi-s1.txt`" 2>&1"
)
Set-Content -Path "$d\jalankan-latensi.cmd" -Value ($baris = $bat -join "`r`n") -Encoding ASCII
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "cmd.exe /c `"$d\jalankan-latensi.cmd`""; CurrentDirectory = $d }
"latensi: ReturnValue=$($r.ReturnValue) pid=$($r.ProcessId) " + (Get-Date).ToUniversalTime().ToString('o')
