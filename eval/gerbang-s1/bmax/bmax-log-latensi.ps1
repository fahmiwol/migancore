$d = '.-pelari'
Get-Content "$d\log-latensi-s1.txt" -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch 'Fetching|Warning' } | Select-Object -Last 6
"hidup: " + @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*latensi_s1*' }).Count
"jawaban latih: " + (Get-Content "$d\repo-s1\eval\gerbang-s1\jawaban-latih-v1.jsonl" | Measure-Object -Line).Lines
