$d = '.-pelari'
@(Get-Process python -ErrorAction SilentlyContinue | Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like '*latensi_s1*' -and $_.PriorityClass -ne 'High' }) | ForEach-Object { $_.PriorityClass = 'High'; "naik: $($_.Id)" }
$log = Get-Content "$d\log-latensi-tinggi.txt" -ErrorAction SilentlyContinue
if ($log -match 'LATENSI-TINGGI-SELESAI') { 'SELESAI'; $log | Where-Object { $_ -match 'max_len' } }
elseif (@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*latensi*' }).Count -eq 0) { 'MATI'; $log | Select-Object -Last 12 }
else { 'JALAN'; $log | Where-Object { $_ -match 'max_len' } }
