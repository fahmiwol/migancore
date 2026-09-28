$g = '.-pelari\repo-s1\eval\gerbang-s1'
"uji2 sha256 " + (Get-FileHash "$g\soal-uji2-v1.jsonl" -Algorithm SHA256).Hash.ToLower()
"audit sha256 " + (Get-FileHash "$g\audit-bocor-v1.json" -Algorithm SHA256).Hash.ToLower()
"jawaban latih: " + (Get-Content "$g\jawaban-latih-v1.jsonl" | Measure-Object -Line).Lines + " baris"
Get-Content '.-pelari\log-s1-jawab.txt' -Tail 2
