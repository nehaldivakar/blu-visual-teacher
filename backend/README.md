# Blu Visual Teacher

**Type any concept and get a narrated, animated video lesson in English, Hindi, Kannada, Malayalam, Tamil or Telugu – generated fully offline on a laptop.**

Blu plans a 30–90 second lesson, draws visuals made for that topic (geometry, formulas, charts, animals, planets, diagrams), narrates it with word-by-word captions, and exports a 720p MP4 with an `.srt` subtitle file. A cartoon teacher points with a stick at whatever is being explained. Learners can also upload a PDF of their notes or a question paper (typed or scanned) and get any topic or numbered question explained from it.

No cloud AI and no internet are needed once the models are downloaded. The local AI model only returns JSON (what to teach); all drawing, maths, timing and video are done by our own code.

## Features

- **Topic-specific visuals:** shapes drawn part by part with values computed in code, coloured equations with molecule drawings, bar / line / pie charts, animated pictures (animals walk, birds fly, fish swim, plants grow), a solar system with orbiting planets, six diagram layouts (flow, cycle, hub, compare, layers, timeline), code walkthroughs and a quiz.
- **6 languages:** English, Hindi, Kannada, Malayalam, Tamil, Telugu. Captions show the English line under Indian-language text.
- **3 levels:** Beginner (very simple words), Intermediate (school level), Advanced (scientific terms and notation).
- **Learn from your own notes:** upload a PDF (typed or scanned, read with offline OCR). Blu finds the matching pages and explains from them; "explain question no. 1" solves that exact question.
- **Interactive:** quiz that pauses for the learner, auto study notes plus personal timestamped notes, edit any scene, one-click re-voice into another language.
- **Two voice speeds for Indian languages:** a natural voice (best quality) and a fast voice (about 1 second per sentence) for live use.
- **Export and share:** 720p H.264/AAC MP4 + `.srt`; a QR code opens the lesson on a phone on the same Wi-Fi.
- **Reliable:** strict JSON schema, automatic repair, retries with feedback, a fallback lesson, caching and per-stage timings.

## How it works

```
Topic + settings
  -> Plan the lesson (Qwen3 4B via Ollama, returns JSON only)
  -> Check and repair the JSON
  -> Translate (IndicTrans2, Indian languages only)
  -> Speak (Kokoro for en/hi, Indic Parler-TTS or MMS-TTS for kn/ml/ta/te)
  -> Sync timing (each scene = its audio + 0.6 s pause)
  -> Render frames (Playwright headless browser, 20 fps)
  -> FFmpeg -> lesson.mp4 + captions.srt
```

Every visual is a pure function of time, so the live player and the exported MP4 are identical.

## Tested on

| | |
| --- | --- |
| Laptop | AMD Ryzen 7 7435HS, 16 GB RAM, Windows 11 Home Single Language |
| GPU | NVIDIA GeForce RTX 4050 Laptop GPU – Ollama may use it for the planner; translation, voices and video export run on the CPU |
| Internet | Not needed after setup (tested with Wi-Fi off) |
| Example | "Explain DSA in Python" (English): MP4 export took about 45 seconds |

## Models and voices

| Part | Model | Where it runs | Licence |
| --- | --- | --- | --- |
| Lesson planner | Qwen3 4B (`qwen3:4b` in Ollama) | Ollama | Apache 2.0 |
| Translation | IndicTrans2 en-indic distilled 200M (`ai4bharat/indictrans2-en-indic-dist-200M`) | venv-indic | MIT |
| Voice: English, Hindi | Kokoro-82M (ONNX), voices `hf_alpha` (female) and `hm_omega` (male), via kokoro-onnx | venv-main | Apache 2.0 (model), MIT (kokoro-onnx) |
| Voice: Kannada, Malayalam, Tamil, Telugu (natural) | Indic Parler-TTS (`ai4bharat/indic-parler-tts`), speakers Anu/Suresh (kn), Anjali/Harish (ml), Jaya (ta), Lalitha/Prakash (te); uses the `google/flan-t5-large` tokenizer | venv-parler | Apache 2.0 |
| Voice: Kannada, Tamil (fast) | Meta MMS-TTS (`facebook/mms-tts-kan`, `facebook/mms-tts-tam`) | venv-parler | CC-BY-NC 4.0 (non-commercial) |
| Scanned PDF reading | RapidOCR (ONNX models bundled) + pypdfium2 | venv-main | Apache 2.0 / BSD |

### Libraries and assets

| Part | Library | Licence |
| --- | --- | --- |
| Backend | FastAPI, Uvicorn, Pydantic, pypdf | MIT / BSD |
| Frontend | React, Vite | MIT |
| Video export | Playwright, FFmpeg | Apache 2.0 / LGPL-GPL |
| Pictures | Microsoft Fluent Emoji (flat style) | MIT |
| Fonts | Outfit, Noto Sans (Indian scripts) | SIL OFL 1.1 |

Please check each model's page for its current licence before reusing it.

## Setup (Windows, PowerShell)

The code expects everything under `C:\hackathon`. Models and virtual environments sit next to the `blu` folder.

### 0. Install the tools
- Python 3.12, Node.js 20+, Git
- FFmpeg (`winget install Gyan.FFmpeg`)
- Ollama from https://ollama.com

### 1. Get the code
```
mkdir C:\hackathon
cd C:\hackathon
git clone https://github.com/nehaldivakar/blu-visual-teacher.git blu
```

### 2. Lesson planner
```
ollama pull qwen3:4b
```

### 3. Main environment (backend, English/Hindi voice, export, PDF)
```
cd C:\hackathon
python -m venv venv-main
venv-main\Scripts\Activate.ps1
pip install -r blu\backend\requirements.txt
playwright install chromium
```
Download `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the kokoro-onnx GitHub releases page into `C:\hackathon`.

### 4. Translation environment
```
cd C:\hackathon
python -m venv venv-indic
venv-indic\Scripts\Activate.ps1
pip install -r blu\backend\requirements-indic.txt
huggingface-cli login
huggingface-cli download ai4bharat/indictrans2-en-indic-dist-200M
```
IndicTrans2 is a gated model: accept its terms on its Hugging Face page first.

### 5. Indian-language voice environment
```
cd C:\hackathon
python -m venv venv-parler
venv-parler\Scripts\Activate.ps1
pip install -r blu\backend\requirements-parler.txt
huggingface-cli download ai4bharat/indic-parler-tts --local-dir C:\hackathon\models\indic-parler-tts
huggingface-cli download google/flan-t5-large --local-dir C:\hackathon\models\flan-t5-large
huggingface-cli download facebook/mms-tts-kan --local-dir C:\hackathon\models\mms-tts-kan
huggingface-cli download facebook/mms-tts-tam --local-dir C:\hackathon\models\mms-tts-tam
```

### 6. Frontend
```
cd C:\hackathon\blu\frontend
npm install
```

## Run

Terminal 1 – backend:
```
C:\hackathon\venv-main\Scripts\Activate.ps1
cd C:\hackathon\blu\backend
uvicorn app:app --host 0.0.0.0 --port 8000
```

Terminal 2 – frontend:
```
cd C:\hackathon\blu\frontend
npm run dev -- --host
```

Open http://localhost:5173. After setup, everything works with Wi-Fi off.

## Project layout

```
backend/        FastAPI app and the pipeline
  app.py        API: generate, re-voice, edit, notes upload, share
  pipeline.py   jobs, cache, stages
  planner.py    lesson planning with the local LLM (JSON schema + repair)
  translate.py  IndicTrans2 worker launcher
  tts.py        voices and audio-driven timing
  export.py     MP4 and SRT export
  notes.py      PDF reading, OCR, passage search
  pics.py       word -> picture matching
  workers/      parler_worker.py, translate_worker.py
frontend/       React + Vite app
  src/          App, Player, Stage, scenes, visuals, pictures, Teacher
  public/pics/  offline picture pack (Fluent Emoji, MIT)
```

## Team

Neural Nomads – built for a 24-hour hackathon.
