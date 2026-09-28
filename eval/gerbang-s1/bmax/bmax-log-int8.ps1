$d = '.-pelari'
Get-Content "$d\log-latensi-int8.txt" -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch 'Fetching|it/s|Warning' } | Select-Object -Last 8
"hidup: " + @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*latensi_s1*' }).Count
if (Test-Path "$d\latensi-s1-tinggi-int8.json") { (Get-Content "$d\latensi-s1-tinggi-int8.json" -Raw | ConvertFrom-Json).kuantisasi }
"jawaban latih: " + (Get-Content "$d\repo-s1\eval\gerbang-s1\jawaban-latih-v1.jsonl" | Measure-Object -Line).Lines
