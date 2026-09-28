$ProgressPreference = 'SilentlyContinue'
# GERBANG-S1 latensi di Bmax MENGANGGUR (aturan pemilihan v2, pra-daftar tinjauanAdversarial_28Sep.latensi_aturanPemilihan_v2):
#   1) p50 probe G (latensi-probe.mjs, 36 soal T1, fungsi probe yang sama dengan pra-lintasan; prioritas NORMAL = kondisi run P/G);
#   2) encoder S fp32 lalu int8 × max_len 256/512/1024 (latensi_s1.py), prioritas TINGGI (sama dengan skor_s1.py saat uji);
# dalam SATU sesi, sebelum angka S dibaca. Berhenti bila ada pengukuran lain berjalan (mesin eksklusif).
$d = '.-pelari'
$repo = "$d\repo-s1b"
if (-not (Test-Path $repo)) { 'repo-s1b belum dipasang - berhenti'; exit 1 }
if (Test-Path "$d\latensi-menganggur-selesai.txt") { 'latensi menganggur sudah pernah dijalankan - tidak diulang'; exit 1 }
$lain = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'jawab\.mjs|rantai-|ukur-jujur2|d1-npc|pg-berpasangan|latih_s1|skor_s1|latensi_s1|latensi-probe' })
if ($lain.Count -gt 0) { 'ada proses pengukuran lain - berhenti (mesin eksklusif)'; $lain | ForEach-Object { $_.CommandLine.Substring(0, [Math]::Min(120, $_.CommandLine.Length)) }; exit 1 }
$log = Get-Content "$d\log-s1-jawab.txt" -ErrorAction SilentlyContinue
if (-not ($log | Where-Object { $_ -match '^SELESAI kode' })) { 'run jawab S1 belum SELESAI - berhenti'; exit 1 }
$pelari = @'
$d = '.-pelari'
$env:HF_HOME = "$d\hf-cache"; $env:HF_HUB_OFFLINE = '1'; $env:TRANSFORMERS_OFFLINE = '1'; $env:USE_TF = '0'; $env:OLLAMA_HOST = 'http://127.0.0.1:11434'
Set-Location "$d\repo-s1b"
$node = "$d\node-v22.14.0-win-x64\node.exe"; $py = "$d\venv-s1\Scripts\python.exe"
function Jalan($exe, $argumen, $nama, $tinggi) {
  $p = Start-Process -FilePath $exe -ArgumentList $argumen -RedirectStandardOutput "$d\log-lm-$nama.out.txt" -RedirectStandardError "$d\log-lm-$nama.err.txt" -PassThru -NoNewWindow
  if ($tinggi) { try { $p.PriorityClass = 'High' } catch { "$nama gagal naik prioritas" | Add-Content "$d\log-latensi-menganggur.txt" } }
  $p.WaitForExit()
  "$((Get-Date).ToUniversalTime().ToString('o')) $nama kode $($p.ExitCode) prioritas $($p.PriorityClass)" | Add-Content "$d\log-latensi-menganggur.txt"
}
Jalan $node "eval\gerbang-s1\latensi-probe.mjs $d\latensi-probe-menganggur.json" 'probe' $false
Jalan $py "eval\gerbang-s1\latensi_s1.py --masukan $d\pasangan-latensi.jsonl --keluar $d\latensi-s1-menganggur-fp32.json --n 100 --max-len 256,512,1024 --catatan MENGANGGUR-tinggi-fp32-aturan-v2" 'fp32' $true
Jalan $py "eval\gerbang-s1\latensi_s1.py --masukan $d\pasangan-latensi.jsonl --keluar $d\latensi-s1-menganggur-int8.json --n 100 --max-len 256,512,1024 --int8 --catatan MENGANGGUR-tinggi-int8-aturan-v2" 'int8' $true
'LATENSI-MENGANGGUR-SELESAI' | Set-Content "$d\latensi-menganggur-selesai.txt"
'@
Set-Content -Path "$d\jalankan-latensi-menganggur.ps1" -Value $pelari -Encoding UTF8
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$d\jalankan-latensi-menganggur.ps1`""; CurrentDirectory = $d }
"latensi menganggur: ReturnValue=$($r.ReturnValue) pid=$($r.ProcessId) " + (Get-Date).ToUniversalTime().ToString('o')
