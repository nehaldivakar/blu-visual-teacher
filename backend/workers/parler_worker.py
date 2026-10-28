"""Runs inside venv-parler. Speaks Indian-language sentences with Indic Parler-TTS."""
import json
import os
import sys

os.environ["HF_HUB_OFFLINE"] = "1"

import soundfile as sf
import torch
from transformers import AutoTokenizer
from parler_tts import ParlerTTSForConditionalGeneration

MODEL_DIR = r"C:\hackathon\models\indic-parler-tts"
MMS_DIR = r"C:\hackathon\models\mms-tts-{}"          # fast voices: mms-tts-kan, -mal, -tam, -tel
MMS_CODES = {"kn": "kan", "ml": "mal", "ta": "tam", "te": "tel"}
BATCH = 4                                                # sentences spoken together (faster on CPU)
DESC_DIR = r"C:\hackathon\models\flan-t5-large"

# Named speakers recommended for Indic Parler-TTS. None = describe the voice instead.
SPEAKERS = {
    "kn": {"female": "Anu", "male": "Suresh"},
    "ml": {"female": "Anjali", "male": "Harish"},
    "ta": {"female": "Jaya", "male": None},
    "te": {"female": "Lalitha", "male": "Prakash"},
}


def describe(lang, voice, speed):
    name = SPEAKERS.get(lang, {}).get(voice)
    who = name or ("A male speaker" if voice == "male" else "A female speaker")
    pace = ("speaks slightly slowly" if speed < 0.95
            else "speaks slightly fast" if speed > 1.05 else "speaks at a moderate pace")
    return (f"{who} {pace} with a clear, expressive voice. "
            f"The recording is very high quality with no background noise.")


def fast_voice(segments, lang, speed, out_dir):
    """Meta MMS-TTS (VITS): about 1 second per sentence on a laptop CPU."""
    from transformers import VitsModel
    path = MMS_DIR.format(MMS_CODES[lang])
    model = VitsModel.from_pretrained(path)
    tok = AutoTokenizer.from_pretrained(path)
    model.speaking_rate = float(speed)
    romanize = None
    if getattr(tok, "is_uroman", False):          # some languages need Latin letters first
        import uroman
        romanize = uroman.Uroman().romanize_string
    n = len(segments)
    for i, seg in enumerate(segments):
        print(f"PROGRESS {i} {n}", flush=True)
        text = romanize(seg["text"]) if romanize else seg["text"]
        torch.manual_seed(42)
        inputs = tok(text, return_tensors="pt")
        with torch.no_grad():
            wav = model(**inputs).waveform
        sf.write(os.path.join(out_dir, f"{seg['name']}.wav"), wav.squeeze().cpu().numpy(),
                 model.config.sampling_rate)
    print(f"PROGRESS {n} {n}", flush=True)


def parler_batched(model, tokenizer, desc_text, desc_tokenizer, segments, out_dir, done, n):
    """Speak several sentences in one go. The model runs once for the whole batch,
    which is much faster on a CPU than one sentence at a time."""
    texts = [seg["text"] for seg in segments]
    desc = desc_tokenizer([desc_text] * len(texts), return_tensors="pt", padding=True)
    prompt = tokenizer(texts, return_tensors="pt", padding=True)
    torch.manual_seed(42)
    with torch.no_grad():
        gen = model.generate(
            input_ids=desc.input_ids, attention_mask=desc.attention_mask,
            prompt_input_ids=prompt.input_ids, prompt_attention_mask=prompt.attention_mask,
            return_dict_in_generate=True,
        )
    for k, seg in enumerate(segments):
        audio = gen.sequences[k, : gen.audios_length[k]].cpu().numpy().squeeze()
        sf.write(os.path.join(out_dir, f"{seg['name']}.wav"), audio, model.config.sampling_rate)
        print(f"PROGRESS {done + k + 1} {n}", flush=True)


def main(req_path):
    with open(req_path, encoding="utf-8") as f:
        req = json.load(f)
    segments, lang, out_dir = req["segments"], req["lang"], req["out_dir"]
    voice, speed = req.get("voice", "female"), float(req.get("speed", 1.0))
    n = len(segments)
    print(f"PROGRESS 0 {n}", flush=True)
    torch.set_num_threads(max(1, os.cpu_count() or 4))

    if voice == "fast" and os.path.isdir(MMS_DIR.format(MMS_CODES.get(lang, "x"))):
        fast_voice(segments, lang, speed, out_dir)
        return
    if voice == "fast":
        print("Fast voice model not found, using the natural voice", flush=True)
        voice = "female"

    model = ParlerTTSForConditionalGeneration.from_pretrained(MODEL_DIR)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    desc_tokenizer = AutoTokenizer.from_pretrained(DESC_DIR)
    desc_text = describe(lang, voice, speed)
    desc = desc_tokenizer(desc_text, return_tensors="pt")

    # batches of similar-length sentences, so little time is wasted on padding
    order = sorted(segments, key=lambda seg: len(seg["text"]))
    done = 0
    try:
        for b in range(0, len(order), BATCH):
            chunk = order[b:b + BATCH]
            parler_batched(model, tokenizer, desc_text, desc_tokenizer, chunk, out_dir, done, n)
            done += len(chunk)
        return
    except Exception as e:                       # older parler-tts without batching: one by one
        print(f"Batch mode failed ({str(e)[:120]}), speaking one sentence at a time", flush=True)
        segments = order[done:]

    for i, seg in enumerate(segments):
        print(f"PROGRESS {i} {n}", flush=True)
        torch.manual_seed(42)               # same voice every scene
        prompt = tokenizer(seg["text"], return_tensors="pt")
        with torch.no_grad():
            audio = model.generate(
                input_ids=desc.input_ids, attention_mask=desc.attention_mask,
                prompt_input_ids=prompt.input_ids,
                prompt_attention_mask=prompt.attention_mask,
            )
        sf.write(os.path.join(out_dir, f"{seg['name']}.wav"),
                 audio.cpu().numpy().squeeze(), model.config.sampling_rate)
    print(f"PROGRESS {n} {n}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
