import { useEffect, useState } from 'react'

const fmt = (s) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`)
const LANG = { en: 'English', hi: 'हिन्दी', kn: 'ಕನ್ನಡ', ml: 'മലയാളം', ta: 'தமிழ்', te: 'తెలుగు' }

export default function Library({ refresh, current, onOpen }) {
  const [items, setItems] = useState(null)

  useEffect(() => {
    fetch('/api/lessons').then(r => r.json()).then(setItems).catch(() => setItems([]))
  }, [refresh])

  if (!items || items.length === 0) return null

  return (
    <section className="library" id="library">
      <div className="section-head">
        <h2>Lesson library</h2>
        <span className="muted small">{items.length} lesson{items.length > 1 ? 's' : ''} · saved on this laptop, never generated twice</span>
      </div>
      <div className="lib-grid">
        {items.map(x => (
          <button key={x.lesson_id} className={`lib-card glass ${x.lesson_id === current ? 'on' : ''}`}
                  onClick={() => onOpen(x.lesson_id)}>
            <span className="lib-lang">{LANG[x.language] || x.language}</span>
            <span className="lib-title">{x.title}</span>
            <span className="lib-meta">
              {fmt(x.total)} · {x.scenes} scenes{x.quiz ? ' · quiz' : ''}{x.voice ? ` · ${x.voice}` : ''}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
