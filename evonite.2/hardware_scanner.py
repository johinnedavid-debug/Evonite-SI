"""
backend/hardware_scanner.py — Autonomous hardware capability scanner.

Detects CPU, RAM, GPU (NVIDIA via nvidia-smi, AMD via rocm-smi, Apple via
system_profiler) and maps the results to the best Ollama model for local
inference. Returns a ranked recommendation list with download commands.
"""

from __future__ import annotations

import asyncio
import platform
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Optional
import json

# ── Hardware snapshot ─────────────────────────────────────────────────────────

@dataclass
class HardwareProfile:
    os:            str = ""
    cpu_model:     str = ""
    cpu_cores:     int = 0
    ram_gb:        float = 0.0
    gpu_vendor:    str = ""        # NVIDIA | AMD | Apple | None
    gpu_model:     str = ""
    vram_gb:       float = 0.0
    cuda_version:  str = ""
    rocm_version:  str = ""
    metal_support: bool = False
    ollama_installed: bool = False
    ollama_version:   str = ""

    def capability_tier(self) -> str:
        """Return LOW / MID / HIGH / ULTRA based on detected hardware."""
        if self.vram_gb >= 24 or (self.gpu_vendor == "Apple" and self.ram_gb >= 64):
            return "ULTRA"
        if self.vram_gb >= 12 or (self.gpu_vendor == "Apple" and self.ram_gb >= 32):
            return "HIGH"
        if self.vram_gb >= 6 or self.ram_gb >= 32:
            return "MID"
        return "LOW"


# ── Model catalogue ───────────────────────────────────────────────────────────

@dataclass
class ModelRecommendation:
    rank:           int
    name:           str          # Ollama pull name  e.g. "llama3:70b-q4"
    display_name:   str
    params:         str          # "7B", "13B", "70B" …
    quant:          str          # "Q4_K_M", "Q8_0", "F16" …
    vram_required:  float        # GB
    ram_required:   float        # GB (CPU offload)
    tier:           str          # LOW / MID / HIGH / ULTRA
    use_case:       str
    speed_est:      str          # "~18 tok/s", "~6 tok/s"
    quality:        str          # "Good", "Great", "Best"
    pull_command:   str = ""
    size_gb:        float = 0.0

    def __post_init__(self):
        self.pull_command = f"ollama pull {self.name}"


MODEL_CATALOGUE: list[ModelRecommendation] = [
    # ── ULTRA ──────────────────────────────────────────────────────────────────
    ModelRecommendation(1,"llama3:70b-q4_k_m","Llama 3 70B Q4","70B","Q4_K_M",40.0,48.0,"ULTRA",
        "Best reasoning, complex multi-step tasks","~6 tok/s","Best", size_gb=39.0),
    ModelRecommendation(2,"mixtral:8x22b","Mixtral 8×22B","141B MoE","Q4_K_M",48.0,64.0,"ULTRA",
        "Mixture-of-experts, fast for size","~8 tok/s","Best", size_gb=48.0),
    ModelRecommendation(3,"qwen2:72b","Qwen2 72B","72B","Q4_K_M",42.0,48.0,"ULTRA",
        "Multilingual + coding excellence","~5 tok/s","Best", size_gb=41.0),
    # ── HIGH ───────────────────────────────────────────────────────────────────
    ModelRecommendation(4,"llama3:13b","Llama 3 13B","13B","Q4_K_M",8.0,16.0,"HIGH",
        "Balanced performance, great for agents","~22 tok/s","Great", size_gb=7.4),
    ModelRecommendation(5,"codellama:34b","CodeLlama 34B","34B","Q4_K_M",20.0,32.0,"HIGH",
        "Best local code generation","~10 tok/s","Great", size_gb=19.0),
    ModelRecommendation(6,"mistral:7b-instruct-v0.3","Mistral 7B v0.3","7B","Q4_K_M",5.0,8.0,"HIGH",
        "Fast instruction-following","~35 tok/s","Great", size_gb=4.1),
    # ── MID ────────────────────────────────────────────────────────────────────
    ModelRecommendation(7,"llama3:8b","Llama 3 8B","8B","Q4_K_M",5.0,8.0,"MID",
        "Default worker-agent model","~28 tok/s","Good", size_gb=4.7),
    ModelRecommendation(8,"phi3:mini","Phi-3 Mini 3.8B","3.8B","Q4","2.5",6.0,"MID",
        "Ultra-fast, lightweight tasks","~55 tok/s","Good", size_gb=2.3),
    ModelRecommendation(9,"gemma2:9b","Gemma 2 9B","9B","Q4_K_M",6.0,10.0,"MID",
        "Google's efficient mid-tier","~25 tok/s","Good", size_gb=5.4),
    ModelRecommendation(10,"codellama:7b","CodeLlama 7B","7B","Q4","4.5",8.0,"MID",
        "Code agent on mid-tier GPU","~30 tok/s","Good", size_gb=3.8),
    # ── LOW ────────────────────────────────────────────────────────────────────
    ModelRecommendation(11,"phi3:mini","Phi-3 Mini","3.8B","Q4","2.5",4.0,"LOW",
        "Best quality on CPU-only","~8 tok/s on CPU","Good", size_gb=2.3),
    ModelRecommendation(12,"tinyllama","TinyLlama 1.1B","1.1B","Q4","1.0",2.0,"LOW",
        "Runs on anything","~20 tok/s on CPU","Acceptable", size_gb=0.6),
    ModelRecommendation(13,"qwen2:0.5b","Qwen2 0.5B","0.5B","Q4","0.4",2.0,"LOW",
        "Smallest viable agent","~30 tok/s on CPU","Acceptable", size_gb=0.3),
]


def get_recommendations(profile: HardwareProfile) -> list[ModelRecommendation]:
    """Return ranked recommendations that fit the detected hardware."""
    tier = profile.capability_tier()
    tier_order = {"LOW":0,"MID":1,"HIGH":2,"ULTRA":3}
    user_level = tier_order[tier]

    fits = []
    for m in MODEL_CATALOGUE:
        model_level = tier_order.get(m.tier, 0)
        vram_ok  = profile.vram_gb  >= m.vram_required  or profile.vram_gb == 0
        ram_ok   = profile.ram_gb   >= m.ram_required
        tier_ok  = model_level <= user_level
        if tier_ok and ram_ok:
            fits.append(m)

    fits.sort(key=lambda m: (-tier_order.get(m.tier,"LOW"), m.rank))
    return fits[:6]


# ── Detection helpers ─────────────────────────────────────────────────────────

def _run(cmd: list[str], timeout: int = 5) -> tuple[int, str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout.strip()
    except Exception:
        return 1, ""


async def scan_hardware() -> HardwareProfile:
    """
    Async hardware scan — runs blocking subprocess calls in an executor.
    Returns a fully populated HardwareProfile.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _scan_sync)


def _scan_sync() -> HardwareProfile:
    p = HardwareProfile()
    p.os = f"{platform.system()} {platform.release()}"

    # ── CPU ────────────────────────────────────────────────────────────────────
    p.cpu_cores = _cpu_cores()
    p.cpu_model = _cpu_model()

    # ── RAM ────────────────────────────────────────────────────────────────────
    try:
        import psutil
        p.ram_gb = round(psutil.virtual_memory().total / 1024**3, 1)
    except Exception:
        code, out = _run(["free", "-b"])
        m = re.search(r"Mem:\s+(\d+)", out)
        if m:
            p.ram_gb = round(int(m.group(1)) / 1024**3, 1)

    # ── GPU — NVIDIA ───────────────────────────────────────────────────────────
    if shutil.which("nvidia-smi"):
        code, out = _run(["nvidia-smi",
            "--query-gpu=name,memory.total,driver_version",
            "--format=csv,noheader,nounits"])
        if code == 0 and out:
            parts = [x.strip() for x in out.split(",")]
            if len(parts) >= 2:
                p.gpu_vendor = "NVIDIA"
                p.gpu_model  = parts[0]
                try:
                    p.vram_gb = round(float(parts[1]) / 1024, 1)
                except ValueError:
                    pass
        # CUDA version
        _, cuda_out = _run(["nvidia-smi"])
        m = re.search(r"CUDA Version:\s+([\d.]+)", cuda_out)
        if m:
            p.cuda_version = m.group(1)

    # ── GPU — AMD ─────────────────────────────────────────────────────────────
    elif shutil.which("rocm-smi"):
        code, out = _run(["rocm-smi", "--showmeminfo", "vram", "--json"])
        if code == 0:
            try:
                data = json.loads(out)
                for card in data.values():
                    if "VRAM Total Memory (B)" in card:
                        p.vram_gb  = round(int(card["VRAM Total Memory (B)"]) / 1024**3, 1)
                        p.gpu_vendor = "AMD"
                        break
            except Exception:
                pass
        _, name_out = _run(["rocm-smi", "--showproductname"])
        m = re.search(r"Card series:\s+(.+)", name_out)
        if m:
            p.gpu_model = m.group(1).strip()

    # ── GPU — Apple Silicon ────────────────────────────────────────────────────
    elif platform.system() == "Darwin":
        _, out = _run(["system_profiler", "SPDisplaysDataType", "-json"])
        try:
            data = json.loads(out)
            displays = data.get("SPDisplaysDataType", [{}])
            gpu_info = displays[0] if displays else {}
            p.gpu_model  = gpu_info.get("sppci_model", "")
            p.gpu_vendor = "Apple"
            p.metal_support = True
            # Unified memory = all RAM is GPU memory on Apple Silicon
            if "M1" in p.cpu_model or "M2" in p.cpu_model or "M3" in p.cpu_model or "M4" in p.cpu_model:
                p.vram_gb = p.ram_gb   # unified memory
        except Exception:
            pass

    # ── Ollama ─────────────────────────────────────────────────────────────────
    if shutil.which("ollama"):
        p.ollama_installed = True
        _, ver = _run(["ollama", "--version"])
        p.ollama_version = ver.replace("ollama version is", "").strip()

    return p


def _cpu_cores() -> int:
    try:
        import psutil
        return psutil.cpu_count(logical=False) or psutil.cpu_count() or 0
    except Exception:
        code, out = _run(["nproc"])
        try:
            return int(out)
        except Exception:
            return 0


def _cpu_model() -> str:
    sys = platform.system()
    if sys == "Darwin":
        _, out = _run(["sysctl", "-n", "machdep.cpu.brand_string"])
        return out or platform.processor()
    if sys == "Linux":
        code, out = _run(["cat", "/proc/cpuinfo"])
        m = re.search(r"model name\s+:\s+(.+)", out)
        return m.group(1).strip() if m else platform.processor()
    return platform.processor()
