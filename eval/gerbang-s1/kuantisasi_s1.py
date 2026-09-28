"""kuantisasi_s1.py — SATU resep kuantisasi int8 dinamis untuk encoder Gerbang-S1, dipakai latensi_s1, latih_s1 (prediksi
dev) dan skor_s1 (uji), supaya ambang dipilih pada jalur yang SAMA dengan yang diukur dan dilayankan.

Resep (28 Sep): hanya nn.Linear DI LUAR attention yang dikuantisasi (feed-forward + kepala; out_proj MultiheadAttention
dibiarkan), dan jalur cepat MHA dimatikan. Kuantisasi {nn.Linear} penuh membuat pemeriksaan jalur cepat
TransformerEncoderLayer gagal ('function' object has no attribute 'device'). Kuantisasi dinamis deterministik atas bobot
yang sama, jadi artefak beku = bobot fp32 (sha256) + VERSI resep ini.
"""
import torch

VERSI = "int8-dinamis-ffn-v1"


def kuantisasi(agen):
    torch.backends.mha.set_fastpath_enabled(False)
    modul = [(n, v) for n, v in vars(agen).items() if isinstance(v, torch.nn.Module)]
    jumlah = 0
    for n, v in modul:
        nama = {nm for nm, m in v.named_modules() if type(m) is torch.nn.Linear and not nm.endswith("out_proj")}
        jumlah += len(nama)
        setattr(agen, n, torch.ao.quantization.quantize_dynamic(v, nama, dtype=torch.qint8))
    return f"{VERSI}: {jumlah} Linear (tanpa out_proj attention), jalur cepat MHA mati, modul {[n for n, _ in modul]}"
