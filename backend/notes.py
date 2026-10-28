"""Learner's own notes: upload a PDF, then lessons are planned from the matching parts of it.

Everything runs on the laptop: pypdf reads the text, and a small keyword search (TF-IDF)
finds the passages that talk about the learner's topic. Those passages are given to the
planner as the source material.
"""
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path

NOTES_DIR = Path(__file__).parent / "notes"
NOTES_ID_RE = re.compile(r"^[a-f0-9]{12}$")
MAX_BYTES = 25 * 1024 * 1024
CHUNK = 700                     # characters per searchable passage
MAX_CONTEXT = 2600              # characters of notes given to the planner

STOP = set("""a an the and or but if then than so of to in on at by for with from into onto over under about
as is are was were be been being am do does did done have has had having it its this that these those there
here what which who whom whose when where why how all any both each few more most other some such no nor not
only own same too very can could should would will shall may might must i me my we our you your he him his she
her they them their also just like using use used one two three per via eg ie etc page chapter unit notes note
explain explanation tell describe define definition meaning what's whats lesson topic topics video make show""".split())
MAX_OCR_PAGES = 40             # scanned pages read with OCR (about 1-3 s each on a CPU)
OCR_HELP = ("This PDF is a scanned image, so its text must be read with OCR. One-time setup: in the python "
            "terminal run  pip install rapidocr-onnxruntime pypdfium2  then restart the backend.")
# "question no. 1", "Q1", "Q.2", "Qn 3", "ques 4", "2nd question"
ASK_Q_RE = re.compile(r"\b(?:q|qn|qs|que|ques|question)\s*\.?\s*(?:no\.?|number|#)?\s*(\d{1,3})\b"
                      r"|\b(\d{1,3})(?:st|nd|rd|th)?\s+(?:question|q)\b", re.I)
SUMMARY_WORDS = {"summary", "summarise", "summarize", "overview", "whole", "entire", "everything", "all"}


def _words(text: str):
    out = []
    for w in re.findall(r"[A-Za-z][A-Za-z0-9\-]+|[ऀ-ൿ]+", text.lower()):
        w = w.strip("-")
        if len(w) < 2 or w in STOP:
            continue
        if len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]                  # simple plural -> singular
        out.append(w)
    return out


def _clean(text: str) -> str:
    text = text.replace("­", "").replace("\x00", "")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)          # words broken across lines
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _chunks(pages):
    out = []
    for p, text in enumerate(pages, start=1):
        paras = [x.strip() for x in re.split(r"\n\s*\n|(?<=[.!?])\n", text) if x.strip()]
        buf = ""
        for para in paras:
            if buf and len(buf) + len(para) > CHUNK:
                out.append({"page": p, "text": buf.strip()})
                buf = ""
            buf += para + "\n"
            while len(buf) > CHUNK * 1.6:                  # a very long paragraph
                cut = buf.rfind(". ", 0, CHUNK) + 1 or CHUNK
                out.append({"page": p, "text": buf[:cut].strip()})
                buf = buf[cut:]
        if buf.strip():
            out.append({"page": p, "text": buf.strip()})
    return out


def _topics(pages, chunks):
    """Suggested topics: headings found in the PDF, then its most important words."""
    found = []
    for text in pages:
        for line in text.split("\n"):
            line = line.strip(" \t•-–:*#0123456789.)")
            words = line.split()
            if not (1 <= len(words) <= 7) or not (3 <= len(line) <= 60):
                continue
            if line.endswith((",", ";")) or sum(c.isalpha() for c in line) < len(line) * 0.6:
                continue
            titled = line.isupper() or all(w[0].isupper() for w in words if w[0].isalpha() and len(w) > 3)
            if titled and line.lower() not in (f.lower() for f in found):
                found.append(line.title() if line.isupper() else line)
    # repeated two-word terms ("carbon dioxide", "cell membrane")
    pairs = Counter()
    for c in chunks:
        for sentence in re.split(r"[.!?;:,()\n]+", c["text"].lower()):
            raw = re.findall(r"[a-z][a-z\-]+", sentence)        # neighbours in the real text
            pairs.update(f"{a} {b}" for a, b in zip(raw, raw[1:])
                         if a not in STOP and b not in STOP and len(a) > 2 and len(b) > 2)
    for pair, k in pairs.most_common(20):
        if k >= 2 and len(found) < 10 and not any(pair in f.lower() for f in found):
            found.append(pair.title())
    # important single words: frequent here, but not everywhere
    df = Counter()
    tf = Counter()
    for c in chunks:
        ws = _words(c["text"])
        tf.update(ws)
        df.update(set(ws))
    n = max(1, len(chunks))
    scored = sorted(((tf[w] * math.log(1 + n / df[w]), w) for w in tf
                     if len(w) >= 5 and tf[w] >= 3 and not w.endswith(("ed", "ing", "ly"))), reverse=True)
    for _, w in scored:
        if len(found) >= 12:
            break
        if not any(w in f.lower() for f in found):
            found.append(w.capitalize())
    return found[:12]


_ocr = None


def _ocr_engine():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR      # small offline OCR models ship inside the package
        _ocr = RapidOCR()
    return _ocr


def _ocr_lines(result) -> str:
    """OCR gives boxes of words; put boxes on the same line together, top to bottom, left to right."""
    items = []
    for item in result or []:
        box, text = item[0], str(item[1]).strip()
        if not text:
            continue
        ys = [float(pt[1]) for pt in box]
        xs = [float(pt[0]) for pt in box]
        items.append((min(ys), max(ys), min(xs), text))
    items.sort(key=lambda t: (t[0], t[2]))
    lines, cur, mid0, h0 = [], [], 0.0, 0.0
    for y0, y1, x, text in items:
        mid, h = (y0 + y1) / 2, max(1.0, y1 - y0)
        if cur and abs(mid - mid0) < max(h, h0) * 0.55:
            cur.append((x, text))
        else:
            if cur:
                lines.append(" ".join(t for _, t in sorted(cur)))
            cur, mid0, h0 = [(x, text)], mid, h
    if cur:
        lines.append(" ".join(t for _, t in sorted(cur)))
    return "\n".join(lines)


def _ocr_pages(data: bytes, which):
    """Read the given (scanned) pages with OCR. Returns {page index: text}."""
    try:
        import numpy as np
        import pypdfium2 as pdfium
        engine = _ocr_engine()
    except ImportError:
        raise ValueError(OCR_HELP)
    pdf = pdfium.PdfDocument(data)
    out = {}
    for i in which[:MAX_OCR_PAGES]:
        image = pdf[i].render(scale=2.0).to_pil().convert("RGB")     # about 200 dpi
        result, _ = engine(np.array(image))
        out[i] = _clean(_ocr_lines(result))
        print(f"OCR page {i + 1}: {len(out[i])} characters", flush=True)
    return out


def _question_starts(pages):
    """Where each numbered question starts: [(number, page index, char offset)]."""
    found = []
    pat = re.compile(r"(?m)^[ \t]*(?:(?:q|qn|que|ques|question)\s*\.?\s*(?:no\.?\s*)?)?(\d{1,3})\s*[.):\]]\s+\S"
                     r"|^[ \t]*(?:q|qn|que|ques|question)\s*\.?\s*(?:no\.?\s*)?(\d{1,3})\b", re.I)
    for p, text in enumerate(pages):
        for m in pat.finditer(text):
            found.append((int(m.group(1) or m.group(2)), p, m.start()))
    return found


def save_pdf(data: bytes, filename: str) -> dict:
    if len(data) > MAX_BYTES:
        raise ValueError("That PDF is too big (over 25 MB).")
    if not data.startswith(b"%PDF"):
        raise ValueError("That file is not a PDF.")
    notes_id = hashlib.md5(data).hexdigest()[:12]
    folder = NOTES_DIR / notes_id
    saved = folder / "notes.json"
    if saved.exists():
        return public(json.loads(saved.read_text(encoding="utf-8")))

    try:
        from pypdf import PdfReader
    except ImportError:
        raise ValueError("PDF support is not installed. In the python terminal run: pip install pypdf")
    import io
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [_clean(page.extract_text() or "") for page in reader.pages]
    except Exception as e:
        raise ValueError(f"Could not read that PDF ({str(e)[:80]}).")
    # scanned pages have (almost) no text inside: read them with OCR
    scanned = [i for i, text in enumerate(pages) if len(text) < 25]
    ocr_used = False
    if scanned:
        try:
            for i, text in _ocr_pages(data, scanned).items():
                pages[i] = text
            ocr_used = True
        except ValueError:
            if sum(len(p) for p in pages) < 40:
                raise                              # nothing readable at all: explain the OCR setup
        except Exception as e:
            if sum(len(p) for p in pages) < 40:
                raise ValueError(f"Could not read the scanned pages ({str(e)[:80]}).")
    if sum(len(p) for p in pages) < 40:
        raise ValueError("No text could be found in this PDF, even with OCR. Try a clearer scan.")

    chunks = _chunks(pages)
    topics = _topics(pages, chunks)
    numbers = sorted({n for n, _, _ in _question_starts(pages)})
    if len(numbers) >= 2:                      # a question paper: offer "Question 1", "Question 2", ...
        topics = [f"Question {n}" for n in numbers[:8]] + topics[:4]
    record = {"id": notes_id, "name": Path(filename or "notes.pdf").name[:80], "pages": len(pages),
              "chunks": chunks, "page_text": pages, "topics": topics, "ocr": ocr_used}
    folder.mkdir(parents=True, exist_ok=True)
    saved.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    return public(record)


def public(record: dict) -> dict:
    return {k: record.get(k) for k in ("id", "name", "pages", "topics", "ocr")}


def load(notes_id: str):
    if not notes_id or not NOTES_ID_RE.match(notes_id):
        return None
    try:
        return json.loads((NOTES_DIR / notes_id / "notes.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def find_passages(notes_id: str, query: str) -> dict:
    """The parts of the notes that match the query, in page order.
    Returns {"name", "text", "pages", "found"}; found=False means the notes never mention it."""
    record = load(notes_id)
    if not record:
        return None
    chunks = record["chunks"]
    # "explain question no. 1": take that question's own text, up to the next question
    ask = ASK_Q_RE.search(query)
    if ask and record.get("page_text"):
        n = int(ask.group(1) or ask.group(2))
        pages = record["page_text"]
        starts = _question_starts(pages)
        mine = [s for s in starts if s[0] == n]
        if mine:
            _, p0, off0 = mine[0]
            later = [s for s in starts if (s[1], s[2]) > (p0, off0) and s[0] != n]
            p1, off1 = (later[0][1], later[0][2]) if later else (len(pages) - 1, len(pages[-1]))
            parts, used, used_pages = [], 0, []
            for p in range(p0, p1 + 1):
                a = off0 if p == p0 else 0
                b = off1 if p == p1 else len(pages[p])
                piece = pages[p][a:b].strip()[: max(0, MAX_CONTEXT - used)]
                if piece:
                    parts.append(f"[page {p + 1}] {piece}")
                    used_pages.append(p + 1)
                    used += len(piece)
            if parts:
                return {"name": record["name"], "text": "\n\n".join(parts), "found": True,
                        "pages": used_pages, "question": n}
        if starts:                    # a question paper, but that number is not in it
            return {"name": record["name"], "text": "", "found": False, "pages": [], "question": n}
    q = _words(query)
    picked = []
    if not q or SUMMARY_WORDS & set(q):          # "summarise my notes": spread over the whole PDF
        step = max(1, len(chunks) // 4)
        picked = chunks[::step][:4]
    else:
        n = len(chunks)
        df = Counter()
        for c in chunks:
            df.update(set(_words(c["text"])))
        phrase = " ".join(query.lower().split())
        scored = []
        for i, c in enumerate(chunks):
            ws = Counter(_words(c["text"]))
            s = sum(ws[w] * math.log(1 + n / df[w]) for w in set(q) if df[w])
            if len(phrase) > 3 and phrase in c["text"].lower():
                s *= 2                           # the exact words appear here
            if s > 0:
                scored.append((s, i))
        scored.sort(reverse=True)
        keep, used = [], 0
        for s, i in scored:
            if used + len(chunks[i]["text"]) > MAX_CONTEXT and keep:
                break
            keep.append(i)
            used += len(chunks[i]["text"])
            if len(keep) >= 5:
                break
        picked = [chunks[i] for i in sorted(keep)]
    text, used = [], 0
    for c in picked:
        piece = c["text"][: max(0, MAX_CONTEXT - used)]
        if piece:
            text.append(f"[page {c['page']}] {piece}")
            used += len(piece)
    return {"name": record["name"], "text": "\n\n".join(text),
            "pages": sorted({c["page"] for c in picked}), "found": bool(picked)}
