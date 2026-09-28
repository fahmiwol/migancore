$ProgressPreference = 'SilentlyContinue'
$d = '.-pelari'
$zip = Get-ChildItem "$d\pelari-s1-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zip) { 'arsip pelari-s1 tidak ada - berhenti'; exit 1 }
"arsip: $($zip.Name) sha256: " + (Get-FileHash $zip.FullName -Algorithm SHA256).Hash.ToLower()
$repo = "$d\repo-s1"
if (Test-Path $repo) { 'repo-s1 sudah ada - tidak ditimpa'; exit 1 }
Expand-Archive -Path $zip.FullName -DestinationPath $repo
Copy-Item "$d\soal-latih-v1.jsonl" "$repo\eval\gerbang-s1\soal-latih-v1.jsonl"
"soal: " + (Get-Content "$repo\eval\gerbang-s1\soal-latih-v1.jsonl" | Measure-Object -Line).Lines + " baris · sha256 " + (Get-FileHash "$repo\eval\gerbang-s1\soal-latih-v1.jsonl" -Algorithm SHA256).Hash.ToLower()
Set-Location $repo
$env:ALIRAN = '1'; $env:BATAS = '1260'; $env:OLLAMA_HOST = 'http://127.0.0.1:11434'
& "$d\node-v22.14.0-win-x64\node.exe" eval\gerbang-s1\jawab.mjs --uji 2>&1 | Select-Object -Last 2
