# 00_setup_env.ps1 - bikin venv training terisolasi. Idempoten: aman dijalankan ulang.
#
# ATURAN FILE INI: 100% ASCII. PowerShell 5.1 membaca .ps1 tanpa BOM sebagai ANSI;
# karakter UTF-8 seperti em-dash berubah jadi smart-quote cp1252 yang MENUTUP string
# lebih awal dan merusak parse SELURUH file (lihat LESSONS.md L-003).
#
# Kenapa venv sendiri: Python default mesin ini 3.14, dan PyTorch TIDAK punya wheel CUDA
# untuk 3.14 (diverifikasi: index cu121 menjawab "from versions: none").
# Jadi venv dipaksa memakai Python 3.12.
#
# Pakai:  powershell -ExecutionPolicy Bypass -File scripts\00_setup_env.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$py312 = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
$venv = Join-Path $root ".venv"
$vpy = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $py312)) {
    Write-Error "Python 3.12 tidak ada di $py312. Pasang dulu: winget install --id Python.Python.3.12 --scope user"
}

if (-not (Test-Path $vpy)) {
    Write-Host "==> membuat venv (Python 3.12)"
    & $py312 -m venv $venv
} else {
    Write-Host "==> venv sudah ada, dilewati"
}

& $vpy -m pip install --upgrade pip --quiet

# torch CUDA harus dari index resmi PyTorch, bukan PyPI (PyPI = versi CPU).
# cu124 dipilih karena driver mesin ini 572.70 (mendukung CUDA 12.x).
Write-Host "==> memasang torch CUDA (cu124) - unduhan besar, sabar"
& $vpy -m pip install torch --index-url https://download.pytorch.org/whl/cu124

# Lewat requirements.txt, bukan argumen langsung: PowerShell memparse baris argumen
# dan karakter pembanding versi pada nama paket merusak parse.
Write-Host "==> memasang pustaka training"
& $vpy -m pip install -r (Join-Path $root "requirements-train.txt")

# Verifikasi lewat FILE python, bukan inline: PowerShell memparse tanda kurung
# di dalam string inline dan gagal sebelum satu baris pun dieksekusi.
Write-Host ""
Write-Host "==> verifikasi"
& $vpy (Join-Path $PSScriptRoot "lib\check_env.py")

Write-Host ""
Write-Host "Selesai. Python venv: $vpy"
