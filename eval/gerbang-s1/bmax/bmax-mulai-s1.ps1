$ProgressPreference = 'SilentlyContinue'
$d = '.-pelari'
$repo = "$d\repo-s1"
$node = "$d\node-v22.14.0-win-x64\node.exe"
if (Test-Path "$d\log-s1-jawab.txt") { Get-Content "$d\log-s1-jawab.txt" -Tail 3; 'log S1 sudah ada - tidak dimulai ulang'; exit 1 }
$lain = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'rantai-|ukur-jujur2|d1-npc|gerbang-s1' })
if ($lain.Count -gt 0) { 'ada pengukuran lain berjalan - berhenti (mesin eksklusif)'; $lain | ForEach-Object { $_.CommandLine.Substring(0, [Math]::Min(120, $_.CommandLine.Length)) }; exit 1 }
$audit = 'eval\gerbang-s1\audit-bocor-v1.json'
$baris = @(
  '@echo off',
  "cd /d $repo",
  'set ALIRAN=1',
  'set BATAS=1260',
  'set OLLAMA_HOST=http://127.0.0.1:11434',
  "`"$node`" eval\gerbang-s1\jawab.mjs eval\gerbang-s1\soal-latih-v1.jsonl eval\gerbang-s1\jawaban-latih-v1.jsonl --sampel 2 --kecuali $audit >> `"$d\log-s1-jawab.txt`" 2>&1",
  "echo LATIH-SELESAI kode %ERRORLEVEL% >> `"$d\log-s1-jawab.txt`"",
  "if exist eval\gerbang-s1\soal-uji2-v1.jsonl `"$node`" eval\gerbang-s1\jawab.mjs eval\gerbang-s1\soal-uji2-v1.jsonl eval\gerbang-s1\jawaban-uji2-v1.jsonl --sampel 2 --kecuali $audit >> `"$d\log-s1-jawab.txt`" 2>&1",
  "echo SELESAI kode %ERRORLEVEL% >> `"$d\log-s1-jawab.txt`""
)
Set-Content -Path "$d\jalankan-s1.cmd" -Value ($baris -join "`r`n") -Encoding ASCII
'--- jalankan-s1.cmd ---'; Get-Content "$d\jalankan-s1.cmd"
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "cmd.exe /c `"$d\jalankan-s1.cmd`""; CurrentDirectory = $repo }
"S1 jawab: ReturnValue=$($r.ReturnValue) pid=$($r.ProcessId) pada " + (Get-Date).ToUniversalTime().ToString('o')
Start-Sleep -Seconds 25
Get-Content "$d\log-s1-jawab.txt" -ErrorAction SilentlyContinue | Select-Object -Last 4
