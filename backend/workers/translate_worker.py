"""Runs inside venv-indic. Translates English strings with IndicTrans2,
keeping protected technical terms (loop, UPI, CPU ...) in English."""
import json
import os
import re
import sys

os.environ["HF_HUB_OFFLINE"] = "1"

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor

MODEL = "ai4bharat/indictrans2-en-indic-dist-200M"
BATCH = 8
TAG_RE = re.compile(r"<\s*ID\s*(\d+)\s*>")
FIRST_TAG = 90          # our own placeholder numbers, far from the toolkit's own <ID0>, <ID1>...


def load():
    tokenizer = AutoTokenizer.from_pretrained(MODEL, trust_remote_code=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL, trust_remote_code=True).eval()
    return tokenizer, model, IndicProcessor(inference=True)


def translate(texts, tgt, tokenizer, model, ip, terms_list=None):
    """Returns [(translation, all_terms_kept)] in the same order as texts."""
    results = []
    for i in range(0, len(texts), BATCH):
        chunk = texts[i:i + BATCH]
        batch = ip.preprocess_batch(chunk, src_lang="eng_Latn", tgt_lang=tgt)
        maps = [{} for _ in chunk]
        if terms_list:
            protected = []
            for k, (s, terms) in enumerate(zip(batch, terms_list[i:i + BATCH])):
                for j, term in enumerate(sorted(set(terms), key=len, reverse=True)):
                    pat = re.compile(rf"(?<![\w]){re.escape(term)}(?![\w])")
                    if pat.search(s):
                        tag = f"<ID{FIRST_TAG + j}>"
                        s = pat.sub(tag, s)
                        maps[k][FIRST_TAG + j] = term
                protected.append(s)
            batch = protected
        enc = tokenizer(batch, truncation=True, padding="longest",
                        return_tensors="pt", return_attention_mask=True)
        with torch.no_grad():
            gen = model.generate(**enc, max_length=256, num_beams=4)
        decoded = tokenizer.batch_decode(gen, skip_special_tokens=True,
                                         clean_up_tokenization_spaces=True)
        for out, m in zip(ip.postprocess_batch(decoded, lang=tgt), maps):
            seen = set()

            def put_back(match):
                num = int(match.group(1))
                if num in m:
                    seen.add(num)
                    return m[num]
                return match.group(0)

            out = TAG_RE.sub(put_back, out)
            results.append((out, seen == set(m) and not TAG_RE.search(out)))
    return results


def main(req_path, out_path):
    with open(req_path, encoding="utf-8") as f:
        req = json.load(f)
    texts, tgt = req["texts"], req["tgt_lang"]
    protect = req.get("protect")
    tokenizer, model, ip = load()

    plain = None
    if protect and any(protect):
        try:
            first = translate(texts, tgt, tokenizer, model, ip, protect)
            redo = [k for k, (_, ok) in enumerate(first) if not ok]
            if redo:   # a term got lost: translate those few again without protection
                again = translate([texts[k] for k in redo], tgt, tokenizer, model, ip)
                for k, r in zip(redo, again):
                    first[k] = r
            plain = [r[0] for r in first]
        except Exception as e:      # never let protection break translation
            print(f"term protection failed, translating normally: {e}", file=sys.stderr)
    if plain is None:
        plain = [r[0] for r in translate(texts, tgt, tokenizer, model, ip)]

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"texts": plain}, f, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
