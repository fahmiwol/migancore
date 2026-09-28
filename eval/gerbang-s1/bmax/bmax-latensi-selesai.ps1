$d = '.-pelari'
$hidup = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*latensi_s1*' }).Count
if (Test-Path "$d\latensi-s1.json") { 'LATENSI-SELESAI'; Get-Content "$d\log-latensi-s1.txt" | Where-Object { $_ -match 'max_len' } }
elseif ($hidup -eq 0) { 'LATENSI-MATI'; Get-Content "$d\log-latensi-s1.txt" -Tail 15 }
else { 'LATENSI-HIDUP'; Get-Content "$d\log-latensi-s1.txt" | Where-Object { $_ -match 'max_len' } }
