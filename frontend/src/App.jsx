import { useEffect, useRef, useState } from 'react'
import Player from './Player.jsx'
import Library from './Library.jsx'

const params = new URLSearchParams(window.location.search)
const EXPORT_MODE = params.get('export') === '1'
const URL_LESSON = params.get('lesson')

const MAX_TOPIC = 1000
const LANGUAGES = [
  { code: 'en', native: 'English', name: 'English' },
  { code: 'hi', native: 'हिन्दी', name: 'Hindi' },
  { code: 'kn', native: 'ಕನ್ನಡ', name: 'Kannada' },
  { code: 'ml', native: 'മലയാളം', name: 'Malayalam' },
  { code: 'ta', native: 'தமிழ்', name: 'Tamil' },
  { code: 'te', native: 'తెలుగు', name: 'Telugu' },
]
const LEVELS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']]
const LENGTHS = [['short', 'Short', '~30s'], ['medium', 'Medium', '~60s'], ['long', 'Long', '~90s']]
const VOICES = [['female', 'Female'], ['male', 'Male']]
// Kannada, Malayalam, Tamil, Telugu: a quick voice (about 1 s per sentence) or the natural one (slower)
const INDIC_VOICES = [['fast', '⚡ Fast'], ['female', 'Natural female'], ['male', 'Natural male']]
const SPEEDS = [[0.85, 'Slow'], [1.0, 'Normal'], [1.15, 'Fast']]
const SLOW_VOICE = ['kn', 'ml', 'ta', 'te']
const EXAMPLES = [
  'How does a Python loop work?',
  'How does the water cycle work?',
  'What are the parts of a cell?',
]

export default function App() {
  if (EXPORT_MODE) return <Player lessonId={URL_LESSON} exportMode />
  return <Generator />
}

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="glow glow-a" />
      <div className="glow glow-b" />
      <div className="orb" />
      <svg className="waves" viewBox="0 0 1440 400" preserveAspectRatio="none">
        <defs>
          <linearGradient id="waveA" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#6d28d9" stopOpacity="0" />
            <stop offset="0.5" stopColor="#a78bfa" stopOpacity="0.45" />
            <stop offset="1" stopColor="#c084fc" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="waveB" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#c084fc" stopOpacity="0.05" />
            <stop offset="0.6" stopColor="#7c3aed" stopOpacity="0.5" />
            <stop offset="1" stopColor="#4c1d95" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="wave wave-a" fill="url(#waveA)"
              d="M0,250 C240,170 480,330 720,240 C960,150 1200,290 1440,210 L1440,400 L0,400 Z" />
        <path className="wave wave-b" fill="url(#waveB)"
              d="M0,300 C300,220 520,360 760,295 C1000,230 1220,330 1440,270 L1440,400 L0,400 Z" />
      </svg>
    </div>
  )
}

function Pills({ options, value, onPick, disabled }) {
  return (
    <div className="pills">
      {options.map(([v, label, small]) => (
        <button type="button" key={String(v)} disabled={disabled}
                className={`pill ${value === v ? 'on' : ''}`} aria-pressed={value === v}
                onClick={() => onPick(v)}>{label}{small && <> <small>{small}</small></>}</button>
      ))}
    </div>
  )
}

function Generator() {
  const [form, setForm] = useState({
    topic: '', level: 'beginner', language: 'en', length: 'medium',
    voice: 'female', speed: 1.0, quiz: true,
  })
  const [job, setJob] = useState(null)
  const [lessonId, setLessonId] = useState(URL_LESSON)
  const [current, setCurrent] = useState(null)       // the loaded lesson (for the language switch)
  const [version, setVersion] = useState(0)          // bumps after an edit, so the player reloads
  const [panel, setPanel] = useState(null)           // 'notes' | 'edit' | null
  const [editIndex, setEditIndex] = useState(0)
  const [libKey, setLibKey] = useState(0)
  const [err, setErr] = useState(null)
  const playerRef = useRef(null)
  const busy = job && (job.status === 'queued' || job.status === 'running')

  useEffect(() => {
    if (!busy) return
    const timer = setInterval(async () => {
      try {
        const j = await fetch(`/api/jobs/${job.id}`).then(r => r.json())
        setJob(j)
        if (j.status === 'done') { openLesson(j.lesson_id); setLibKey(k => k + 1) }
      } catch { /* backend busy, try again next tick */ }
    }, 1000)
    return () => clearInterval(timer)
  }, [busy, job?.id])

  const pick = (key, value) => setForm(f => {
    const next = { ...f, [key]: value }
    if (key === 'language') {               // the fast voice exists only for the four slower languages
      if (SLOW_VOICE.includes(value) && !SLOW_VOICE.includes(f.language)) next.voice = 'fast'
      if (!SLOW_VOICE.includes(value) && f.voice === 'fast') next.voice = 'female'
    }
    return next
  })

  // ---- the learner's own notes (PDF) ----
  const [notes, setNotes] = useState(null)          // {id, name, pages, topics}
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const uploadPdf = async (file) => {
    if (!file) return
    setErr(null)
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { setErr('Please choose a PDF file.'); return }
    if (file.size > 25 * 1024 * 1024) { setErr('That PDF is too big (over 25 MB).'); return }
    setUploading(true)
    try {
      const r = await fetch(`/api/notes?name=${encodeURIComponent(file.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file,
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) setErr(typeof data.detail === 'string' ? data.detail : 'Could not read that PDF.')
      else setNotes(data)
    } catch {
      setErr('Cannot reach the backend. Is the python terminal still running?')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const openLesson = (id) => {
    setLessonId(id)
    setVersion(v => v + 1)
    setEditIndex(0)
    setTimeout(() => playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }

  const send = async (url, body) => {
    setErr(null)
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErr(typeof data.detail === 'string' ? data.detail : 'The request was rejected. Please check and try again.')
        return
      }
      setJob(data)
      if (data.status === 'done') { openLesson(data.lesson_id); setLibKey(k => k + 1) }
    } catch {
      setErr('Cannot reach the backend. Is the python terminal still running?')
    }
  }

  const submit = (e) => {
    e?.preventDefault()
    if (busy) return
    const topic = form.topic.trim()
    if (topic.length < 3) { setErr('Please type a topic (at least 3 characters).'); return }
    if (topic.length > MAX_TOPIC) { setErr(`Please keep the question under ${MAX_TOPIC} characters.`); return }
    setLessonId(null)
    setCurrent(null)
    send('/api/generate', { ...form, topic, notes_id: notes ? notes.id : null })
  }

  const revoice = (language) => {
    if (busy || !lessonId) return
    // re-voicing into Kannada/Malayalam/Tamil/Telugu uses the fast voice unless one was chosen for them
    const slow = SLOW_VOICE.includes(language)
    const voice = slow ? (SLOW_VOICE.includes(form.language) ? form.voice : 'fast')
                       : (form.voice === 'fast' ? 'female' : form.voice)
    send('/api/revoice', { lesson_id: lessonId, language, voice, speed: form.speed })
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const stageNames = !job ? [] : [
    ...(job.kind === 'generate' ? ['Planning lesson'] : []),
    ...(job.language !== 'en' ? ['Translating'] : []),
    'Narration', 'Exporting MP4',
  ]
  const total = job ? Object.values(job.timings || {}).reduce((a, b) => a + b, 0) : 0

  return (
    <>
      <Backdrop />
      <div className="app" id="top">
        <nav className="nav glass">
          <a className="nav-brand" href="#top">
            <span className="logo">B</span>
            <span>Blu <b>Visual Teacher</b></span>
          </a>
          <div className="nav-links">
            <a href="#generate">Create</a>
            <a href="#library">Library</a>
            <a href="#features">How it works</a>
          </div>
          <span className="nav-badge"><span className="dot" />Offline</span>
        </nav>

        <header className="hero">
          <span className="eyebrow reveal">✦ VISUAL LESSONS, MADE ON YOUR LAPTOP</span>
          <h1 className="reveal d1">Learn anything,<br /><span className="grad-text">visually.</span></h1>
          <p className="reveal d2">
            Type a concept. Get a narrated, animated lesson in English or five Indian
            languages, generated fully offline.
          </p>
        </header>

        <form id="generate" className="gen glass reveal d3" onSubmit={submit}>
          <div className="field">
            <textarea className="topic" rows={2} maxLength={MAX_TOPIC}
                      placeholder={notes ? `Ask about anything in ${notes.name}: a word, a topic or a question`
                                         : 'What do you want to learn today?'}
                      value={form.topic} onChange={e => pick('topic', e.target.value)}
                      onKeyDown={onKeyDown} disabled={busy} />
            {notes && (
              <div className="notes-bar">
                <span className="notes-chip" title="Lessons will be explained from this PDF">
                  📄 <b>{notes.name}</b> · {notes.pages} page{notes.pages === 1 ? '' : 's'}{notes.ocr ? ' · scanned, read with OCR' : ''}
                  <button type="button" aria-label="Stop using these notes" disabled={busy}
                          onClick={() => setNotes(null)}>✕</button>
                </span>
                <span className="muted small">Lessons now explain topics from your notes.</span>
              </div>
            )}
            <div className="field-foot">
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden
                     onChange={e => uploadPdf(e.target.files[0])} />
              <button type="button" className={`attach ${notes ? 'on' : ''}`} disabled={busy || uploading}
                      onClick={() => fileRef.current?.click()}
                      title="Upload a PDF of your notes and get lessons from it">
                {uploading ? <span className="spinner" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>}
                <span>{uploading ? 'Reading PDF… (scanned pages take longer)' : notes ? 'Change PDF' : 'Upload notes'}</span>
              </button>
              <div className="examples">
                {notes && <button type="button" className="example from-notes" disabled={busy}
                                  onClick={() => pick('topic', `Summary of my notes`)}>✨ Summarise my notes</button>}
                {(notes ? notes.topics.slice(0, 8) : EXAMPLES).map(x => (
                  <button type="button" key={x} className={`example ${notes ? 'from-notes' : ''}`} disabled={busy}
                          onClick={() => pick('topic', x)}>{x}</button>
                ))}
              </div>
              <span className="counter">{form.topic.length} / {MAX_TOPIC}</span>
            </div>
          </div>

          <div className="group" id="languages">
            <span className="group-label">Language</span>
            <div className="lang-grid">
              {LANGUAGES.map(l => (
                <button type="button" key={l.code} disabled={busy}
                        className={`lang ${form.language === l.code ? 'on' : ''}`}
                        aria-pressed={form.language === l.code}
                        onClick={() => pick('language', l.code)}>
                  <span className="lang-native">{l.native}</span>
                  <span className="lang-name">{l.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="controls-row">
            <div className="group"><span className="group-label">Level</span>
              <Pills options={LEVELS} value={form.level} onPick={v => pick('level', v)} disabled={busy} /></div>
            <div className="group"><span className="group-label">Length</span>
              <Pills options={LENGTHS} value={form.length} onPick={v => pick('length', v)} disabled={busy} /></div>
          </div>
          <div className="controls-row">
            <div className="group"><span className="group-label">Voice</span>
              <Pills options={SLOW_VOICE.includes(form.language) ? INDIC_VOICES : VOICES} value={form.voice} onPick={v => pick('voice', v)} disabled={busy} /></div>
            <div className="group"><span className="group-label">Speed</span>
              <Pills options={SPEEDS} value={form.speed} onPick={v => pick('speed', v)} disabled={busy} /></div>
            <div className="group"><span className="group-label">Quiz</span>
              <Pills options={[[true, 'Add quiz'], [false, 'No quiz']]} value={form.quiz}
                     onPick={v => pick('quiz', v)} disabled={busy} /></div>
            <button type="submit" className="cta" disabled={busy}>
              {busy ? <><span className="spinner" />Generating…</> : 'Generate lesson →'}
            </button>
          </div>

          {SLOW_VOICE.includes(form.language) && (
            <div className="hint">{form.voice === 'fast'
              ? '⚡ Fast voice: about 1 second per sentence on this laptop.'
              : 'Natural voice: sounds best, but is slow on this laptop CPU. Pick ⚡ Fast for quick lessons.'}</div>
          )}
          {err && <div className="error">{err}</div>}
        </form>

        {job && (
          <section className="status reveal">
            {job.cached && <div className="note">⚡ Loaded instantly from cache</div>}
            {job.kind === 'revoice' && !job.cached && <div className="note">🌐 Re-voicing the same lesson. No new planning needed.</div>}
            {job.notes && job.notes.found && (
              <div className="note">📄 {job.notes.question ? `Explaining question ${job.notes.question} from` : 'Explained from your notes:'} {job.notes.name}, page{job.notes.pages.length > 1 ? 's' : ''} {job.notes.pages.join(', ')}</div>
            )}
            {job.notes && !job.notes.found && (
              <div className="note warn">{job.notes.question ? `Question ${job.notes.question} was not found in` : 'That topic is not in'} {job.notes.name}, so this lesson uses general knowledge.</div>
            )}
            {job.fallback && <div className="note warn">The AI plan failed checks, so a sample lesson is shown instead.</div>}
            {job.status === 'error' && <div className="note warn">Something went wrong: {job.error}</div>}
            {!job.cached && (
              <ul className="stages">
                {stageNames.map(s => {
                  const time = job.timings?.[s]
                  const active = job.stage === s && busy
                  return (
                    <li key={s} className={`glass ${time != null ? 'done' : active ? 'active' : ''}`}>
                      <span className="stage-name">{time != null ? '✓' : active ? '●' : '○'} {s}</span>
                      <span className="stage-value">{time != null ? `${time}s` : active ? (job.detail || 'working…') : '—'}</span>
                    </li>
                  )
                })}
                {job.status === 'done' && (
                  <li className="glass total">
                    <span className="stage-name">Total</span>
                    <span className="stage-value">{total.toFixed(1)}s</span>
                  </li>
                )}
              </ul>
            )}
          </section>
        )}

        {lessonId && (
          <section className="player-wrap reveal" ref={playerRef}>
            <Player key={`${lessonId}-${version}`} lessonId={lessonId} version={version}
                    onLoaded={setCurrent} panel={panel} setPanel={setPanel}
                    editIndex={editIndex} setEditIndex={setEditIndex}
                    onEdited={() => { setVersion(v => v + 1); setLibKey(k => k + 1) }} />
            {current && (
              <div className="switch glass">
                <span className="group-label">🌐 Watch this lesson in</span>
                <div className="switch-langs">
                  {LANGUAGES.filter(l => l.code !== current.language).map(l => (
                    <button key={l.code} disabled={busy} onClick={() => revoice(l.code)}>
                      {l.native}
                    </button>
                  ))}
                </div>
                <span className="muted small">Same lesson, new voice and captions. Planning is skipped.</span>
              </div>
            )}
          </section>
        )}

        <Library refresh={libKey} current={lessonId} onOpen={openLesson} />

        <section id="features" className="features">
          <article className="feature feature-main">
            <h3>Plans the lesson for you</h3>
            <p>A small AI model on your laptop breaks any concept into short scenes: a title, diagrams, code walkthroughs and a quiz, each with its own narration.</p>
            <a className="feature-link" href="#generate">Try a topic</a>
          </article>
          <article className="feature glass">
            <div className="feature-icon">अ</div>
            <h3>Speaks six languages</h3>
            <p>English, Hindi, Kannada, Malayalam, Tamil and Telugu, with captions in the right script and technical terms kept in English.</p>
          </article>
          <article className="feature glass">
            <div className="feature-icon">⚡</div>
            <h3>Ready-to-share MP4</h3>
            <p>Voice, visuals and captions stay in sync, exported as a 720p video with an .srt file. Teachers can edit any scene.</p>
          </article>
        </section>

        <footer className="foot">Runs on CPU · Ollama · Kokoro · IndicTrans2 · Indic Parler-TTS</footer>
      </div>
    </>
  )
}
