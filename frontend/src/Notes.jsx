import { useEffect, useMemo, useState } from 'react'

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const STAMP_RE = /\[(\d+):(\d{2})\]/g

// Study notes built straight from the lesson data (no extra AI call)
function buildNotes(lesson, timing) {
  return lesson.scenes.map((s, i) => {
    const lines = []
    if (s.type === 'quiz') {
      lines.push(`Q: ${s.narration}`)
      ;(s.options || []).forEach((o, k) => lines.push(`${'ABC'[k]}) ${o}${k === s.answer ? '  ✓' : ''}`))
      if (s.answer_narration) lines.push(s.answer_narration)
    } else if (s.type === 'equation') {
      lines.push(s.narration, `Formula: ${s.equation}`)
      ;(s.terms || []).forEach(t => lines.push(`• ${t.symbol} = ${t.meaning}`))
    } else if (s.type === 'shape') {
      lines.push(s.narration)
      const v = s.values || {}
      Object.keys(v).forEach(k => lines.push(`• ${k}: ${v[k]}`))
      ;(s.parts || []).forEach(p => lines.push(`• ${(s.labels && s.labels[p]) || p}`))
    } else if (s.type === 'chart') {
      lines.push(s.narration)
      ;(s.items || []).forEach((item, k) => lines.push(`• ${item}: ${(s.numbers || [])[k]}${s.unit ? ` ${s.unit}` : ''}`))
    } else {
      lines.push(s.narration)
      ;(s.items || []).forEach((item, k) => {
        const d = s.details && s.details[k]
        lines.push(`• ${item}${d ? ` — ${d}` : ''}`)
      })
    }
    return { i, start: timing.scenes[i].start, heading: s.heading, lines, code: s.code }
  })
}

function readMine(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}

export default function Notes({ lesson, timing, lessonId, t, onSeek }) {
  const [tab, setTab] = useState('lesson')
  const key = `blu-notes-${lessonId}`
  const [mine, setMine] = useState(() => readMine(key))
  const [flash, setFlash] = useState('')
  const notes = useMemo(() => buildNotes(lesson, timing), [lesson, timing])

  useEffect(() => {
    try { localStorage.setItem(key, mine) } catch { /* private mode: notes stay in this tab */ }
  }, [key, mine])

  const say = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 1800) }

  const addStamp = () => {
    setMine(m => `${m}${m && !m.endsWith('\n') ? '\n' : ''}[${fmt(t)}] `)
    setTab('mine')
  }

  const plainText = () => {
    const parts = [lesson.title, '='.repeat(Math.min(60, lesson.title.length)), '']
    notes.forEach(n => {
      parts.push(`${n.heading}  (${fmt(n.start)})`)
      n.lines.forEach(l => parts.push(`  ${l}`))
      if (n.code) parts.push(n.code.split('\n').map(l => `    ${l}`).join('\n'))
      parts.push('')
    })
    if (mine.trim()) parts.push('My notes', '--------', mine.trim(), '')
    return parts.join('\n')
  }

  const copy = async () => {
    const text = plainText()
    try {
      await navigator.clipboard.writeText(text)
    } catch {          // clipboard API needs https or localhost; fall back for phones on the LAN
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    say('Copied')
  }

  const download = () => {
    const blob = new Blob([plainText()], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${lessonId}-notes.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return say('Allow pop-ups to print')
    const esc = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(lesson.title)} – notes</title>
      <style>body{font-family:'Noto Sans','Noto Sans Devanagari','Noto Sans Kannada','Noto Sans Malayalam','Noto Sans Tamil','Noto Sans Telugu',sans-serif;max-width:720px;margin:32px auto;padding:0 16px;line-height:1.6}pre{white-space:pre-wrap;font:inherit}</style>
      <pre>${esc(plainText())}</pre>`)
    w.document.close()
    w.focus()
    w.print()
  }

  const stamps = [...mine.matchAll(STAMP_RE)].map(m => ({ label: m[0], sec: +m[1] * 60 + +m[2] }))

  return (
    <div className="panel notes">
      <div className="panel-head">
        <div className="tabs">
          <button className={tab === 'lesson' ? 'on' : ''} onClick={() => setTab('lesson')}>Lesson notes</button>
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My notes</button>
        </div>
        <div className="panel-actions">
          <button onClick={addStamp} title="Add a note at the current time">＋ Note at {fmt(t)}</button>
          <button onClick={copy}>Copy</button>
          <button onClick={download}>⬇ .txt</button>
          <button onClick={print}>Print</button>
          {flash && <span className="flash">{flash}</span>}
        </div>
      </div>

      {tab === 'lesson' ? (
        <div className="notes-body">
          {notes.map(n => (
            <section key={n.i} className="note-block">
              <button className="note-head" onClick={() => onSeek(n.start + 0.01)}>
                <span className="note-time">{fmt(n.start)}</span>{n.heading}
              </button>
              {n.lines.map((l, k) => <p key={k}>{l}</p>)}
              {n.code && <pre className="note-code">{n.code}</pre>}
            </section>
          ))}
        </div>
      ) : (
        <div className="notes-body">
          <textarea className="my-notes" value={mine} onChange={e => setMine(e.target.value)}
                    placeholder="Write your own notes here. Use “＋ Note at” to stamp the current time." />
          {stamps.length > 0 && (
            <div className="stamps">
              Jump to: {stamps.map((s, k) => (
                <button key={k} onClick={() => onSeek(s.sec)}>{s.label}</button>
              ))}
            </div>
          )}
          <div className="muted small">Saved automatically in this browser.</div>
        </div>
      )}
    </div>
  )
}
