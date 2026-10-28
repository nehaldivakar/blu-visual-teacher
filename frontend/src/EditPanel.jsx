import { useEffect, useState } from 'react'

const lines = (arr) => (arr || []).join('\n')
const unlines = (text) => text.split('\n').map(s => s.trim()).filter(Boolean)

function formFor(scene) {
  return {
    heading: scene.heading || '',
    narration: scene.narration || '',
    answer_narration: scene.answer_narration || '',
    center: scene.center || '',
    items: lines(scene.items),
    details: lines(scene.details),
    options: lines(scene.options),
  }
}

export default function EditPanel({ lesson, lessonId, index, onIndex, onDone }) {
  const scene = lesson.scenes[index]
  const [form, setForm] = useState(() => formFor(scene))
  const [job, setJob] = useState(null)
  const [err, setErr] = useState(null)
  const busy = job && (job.status === 'queued' || job.status === 'running')

  useEffect(() => { setForm(formFor(lesson.scenes[index])); setErr(null) }, [lesson, index])

  useEffect(() => {
    if (!busy) return
    const timer = setInterval(async () => {
      try {
        const j = await fetch(`/api/jobs/${job.id}`).then(r => r.json())
        setJob(j)
        if (j.status === 'done') onDone()
        if (j.status === 'error') setErr(j.error)
      } catch { /* try again */ }
    }, 1000)
    return () => clearInterval(timer)
  }, [busy, job?.id])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setErr(null)
    const body = { heading: form.heading, narration: form.narration }
    if (scene.type === 'diagram') {
      body.items = unlines(form.items)
      if (scene.details) body.details = unlines(form.details)
      if (scene.center != null) body.center = form.center
    }
    if (scene.type === 'quiz') {
      body.options = unlines(form.options)
      body.answer_narration = form.answer_narration
    }
    try {
      const r = await fetch(`/api/lessons/${lessonId}/scenes/${index}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(typeof data.detail === 'string' ? data.detail : 'Could not save this scene.'); return }
      setJob(data)
    } catch {
      setErr('Cannot reach the backend.')
    }
  }

  return (
    <div className="panel edit">
      <div className="panel-head">
        <div className="tabs scroll">
          {lesson.scenes.map((s, i) => (
            <button key={i} className={i === index ? 'on' : ''} disabled={busy} onClick={() => onIndex(i)}>
              {i + 1}. {s.type === 'quiz' ? 'Quiz' : s.heading.replace(/^[^:]*:\s*/, '').slice(0, 22)}
            </button>
          ))}
        </div>
      </div>

      <div className="edit-grid">
        <label>Heading<input value={form.heading} onChange={set('heading')} maxLength={80} disabled={busy} /></label>
        <label>{scene.type === 'quiz' ? 'Question (spoken)' : 'Narration (spoken and shown as caption)'}
          <textarea rows={3} value={form.narration} onChange={set('narration')} maxLength={320} disabled={busy} />
        </label>
        {scene.type === 'diagram' && (
          <>
            <label>Boxes (one per line, 2–6)<textarea rows={4} value={form.items} onChange={set('items')} disabled={busy} /></label>
            {scene.details && <label>Details (one per line, same order)<textarea rows={4} value={form.details} onChange={set('details')} disabled={busy} /></label>}
            {scene.center != null && <label>Centre label<input value={form.center} onChange={set('center')} maxLength={30} disabled={busy} /></label>}
          </>
        )}
        {scene.type === 'quiz' && (
          <>
            <label>Options (exactly 3 lines; option {'ABC'[scene.answer]} is the right one)
              <textarea rows={3} value={form.options} onChange={set('options')} disabled={busy} />
            </label>
            <label>Answer explanation (spoken after the pause)
              <textarea rows={2} value={form.answer_narration} onChange={set('answer_narration')} maxLength={320} disabled={busy} />
            </label>
          </>
        )}
        {scene.type === 'code_walkthrough' && <div className="muted small">Code is kept exactly as written. You can edit the heading and narration.</div>}
      </div>

      <div className="edit-foot">
        <button className="cta small" onClick={save} disabled={busy}>
          {busy ? <><span className="spinner" />{job.stage}{job.detail ? ` · ${job.detail}` : ''}</> : 'Save & re-voice this scene'}
        </button>
        <span className="muted small">Only this scene's voice is regenerated; the MP4 is rebuilt.</span>
        {job?.status === 'done' && !busy && <span className="flash">Updated ✓</span>}
        {err && <span className="error">{err}</span>}
      </div>
    </div>
  )
}
