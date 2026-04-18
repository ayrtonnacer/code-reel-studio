"""
Qwen3-TTS local server for CodeSnap Video
==========================================
Setup:
    pip install fastapi uvicorn qwen-tts torch soundfile

Run:
    python tts_server.py

The server starts on http://localhost:8001
"""

import base64
import io
import os
import sys
import argparse

import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Model config ──────────────────────────────────────────────────────────────

MODEL_ID = os.getenv("QWEN_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
# Use the smaller model on CPU or low-VRAM GPUs:
# MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.bfloat16 if device == "cuda" else torch.float32

print(f"Loading {MODEL_ID} on {device} ({dtype})…", flush=True)

from qwen_tts import Qwen3TTSModel  # noqa: E402 (import after printing)

model = Qwen3TTSModel(
    MODEL_ID,
    device_map=device,
    torch_dtype=dtype,
    **({"attn_implementation": "flash_attention_2"} if device == "cuda" else {}),
)

print("Model ready.", flush=True)

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Qwen3-TTS local server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # safe for localhost-only usage
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

VOICES = [
    "Cherry", "Serena", "Ethan", "Ryan",
    "Aria", "Patrick", "Skylar", "Thomas",
]


class TTSRequest(BaseModel):
    text: str
    voice: str = "Cherry"


@app.get("/voices")
def list_voices():
    return {"voices": VOICES}


@app.post("/generate")
def generate(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    if req.voice not in VOICES:
        req.voice = "Cherry"

    try:
        # synthesize returns (audio_array, sample_rate)
        audio_array, sample_rate = model.synthesize(req.text, voice=req.voice)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Write to in-memory WAV buffer
    buf = io.BytesIO()
    sf.write(buf, audio_array, sample_rate, format="WAV")
    buf.seek(0)

    b64 = base64.b64encode(buf.read()).decode()
    return {"audioDataUrl": f"data:audio/wav;base64,{b64}"}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)
