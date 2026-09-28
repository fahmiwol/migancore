$d = '.-pelari'
if (Test-Path "$d\log-latensi-s1.txt") { Get-Content "$d\log-latensi-s1.txt" -Tail 8 }
$hidup = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*latensi_s1*' }).Count
"proses latensi hidup: $hidup"
"jawaban latih: " + (Get-Content "$d\repo-s1\eval\gerbang-s1\jawaban-latih-v1.jsonl" | Measure-Object -Line).Lines
