$d = '.-pelari'
Get-Content "$d\log-latensi-tinggi.txt" | Where-Object { $_ -notmatch 'Fetching|it/s' } | Select-Object -Last 30
foreach ($f in 'latensi-s1-tinggi-fp32.json','latensi-s1-tinggi-int8.json') { if (Test-Path "$d\$f") { "ADA $f"; (Get-Content "$d\$f" -Raw | ConvertFrom-Json) | Select-Object catatan,kuantisasi,threads,cpu,tokenP50,tokenP95,maxLenDidukung | ConvertTo-Json -Compress } else { "TIDAK ADA $f" } }
