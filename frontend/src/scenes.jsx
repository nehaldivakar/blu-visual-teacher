// Every visual here is a pure function of `local` (seconds since the scene started),
// so live playback and the MP4 export always draw exactly the same frame.
// Style: flat "illustrated explainer" look - bold colours, thick ink outlines, bouncy pop-ins.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const appear = (local, at, len = 0.4) => clamp((local - at) / len)
export const ease = (x) => 1 - Math.pow(1 - clamp(x), 3)
// overshoots a little, then settles: the "pop" in pop-in
export const back = (x) => { const c = 1.9; x = clamp(x) - 1; return 1 + (c + 1) * x * x * x + c * x * x }
// falls and bounces, like a book dropped on a pile
function bounce(x) {
  x = clamp(x)
  const n = 7.5625, d = 2.75
  if (x < 1 / d) return n * x * x
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375
  return n * (x -= 2.625 / d) * x + 0.984375
}

export const PALETTE = ['#f26b7f', '#ffd23f', '#3fb8c8', '#34c27a', '#ff9f43', '#a78bfa']
export const INK = '#1a1033'
export const CREAM = '#fbf6ea'

export const W = 1168   // drawing area inside the 1280x720 frame
export const H = 400

/* ---------------- small geometry helpers ---------------- */
const pathD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
const polyLength = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)
function pointAt(pts, f) {
  const total = polyLength(pts)
  let target = clamp(f) * total
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    if (target <= seg && seg > 0) {
      const k = target / seg
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]
    }
    target -= seg
  }
  return pts[pts.length - 1]
}
const inRect = (p, r, pad = 14) =>
  p[0] > r.left - pad && p[0] < r.left + r.w + pad && p[1] > r.top - pad && p[1] < r.top + r.h + pad
// keep only the longest run of points that sits outside every card
function trimOutside(points, rects, keep = () => true) {
  let best = [], run = []
  for (const p of points) {
    if (keep(p) && !rects.some(r => inRect(p, r))) run.push(p)
    else { if (run.length > best.length) best = run; run = [] }
  }
  return run.length > best.length ? run : best
}

/* ---------------- timing: one item at a time, spread over the narration ---------------- */
function steps(n, audioDuration, start = 0.7) {
  const step = Math.max(0.7, (audioDuration - start) / Math.max(1, n))
  return { step, at: (i) => start + i * step }
}
const currentIndex = (n, local, t) => (local < t.at(0) ? -1 : Math.min(n - 1, Math.floor((local - t.at(0)) / t.step)))
const stateOf = (i, cur) => (cur < 0 ? '' : i === cur ? 'active' : i < cur ? 'done' : '')
const linkProgress = (local, at) => ease((local - (at - 0.4)) / 0.4)

/* ---------------- typewriter: letters appear one by one, with a blinking cursor ---------------- */
export function Typewriter({ text, local, start = 0.2, cps = 28, highlight = 0, cursor = true }) {
  const chars = Array.from(text || '')                  // keeps Indian-script letters whole
  const shown = Math.max(0, Math.min(chars.length, Math.floor((local - start) * cps)))
  const typing = shown < chars.length
  const blinkOn = typing || Math.floor(local * 2) % 2 === 0
  // the last `highlight` words are drawn in colour (the key words)
  let cut = chars.length
  if (highlight > 0) {
    const words = text.trimEnd().split(/\s+/)
    const tail = words.slice(-highlight).join(' ').replace(/[?.!:]+$/, '')
    const idx = text.lastIndexOf(tail)
    if (idx > 0) cut = Array.from(text.slice(0, idx)).length
  }
  const a = chars.slice(0, Math.min(shown, cut)).join('')
  const b = shown > cut ? chars.slice(cut, shown).join('') : ''
  return (
    <span className="tw">
      {a}{b && <span className="tw-key">{b}</span>}
      {cursor && <span className="tw-cursor" style={{ opacity: blinkOn ? 1 : 0 }} />}
    </span>
  )
}

export function SceneHeading({ text, local }) {
  return (
    <h2 className="scene-heading">
      <Typewriter text={text} local={local} start={0.25} cps={40} cursor={local < 2.2} />
    </h2>
  )
}

/* ---------------- shared pieces ---------------- */
function Defs() {
  return (
    <defs>
      <marker id="vArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill={CREAM} stroke={INK} strokeWidth="1.5" />
      </marker>
      <marker id="vArrowOn" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#ffd23f" stroke={INK} strokeWidth="1.5" />
      </marker>
    </defs>
  )
}

function Link({ pts, p, active, local }) {
  if (pts.length < 2) return null
  const len = polyLength(pts)
  const d = pathD(pts)
  const dot = active && p >= 1 ? pointAt(pts, (local * 0.7) % 1) : null
  return (
    <g>
      <path d={d} className="vlink-track" opacity={clamp(p * 3)} />
      <path d={d} className="vlink-ink" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
      <path d={d} className={`vlink ${active ? 'active' : ''}`}
            strokeDasharray={len} strokeDashoffset={len * (1 - p)}
            markerEnd={p > 0.98 ? (active ? 'url(#vArrowOn)' : 'url(#vArrow)') : undefined} />
      {dot && <circle cx={dot[0]} cy={dot[1]} r="8" className="vdot" />}
    </g>
  )
}

// a card that pops in with a bounce and a small tilt
function Card({ r, d, size = '' }) {
  const s = back(d.o)
  const tilt = (1 - ease(d.o)) * (d.i % 2 ? 8 : -8)
  return (
    <div className={`vnode ${d.state} ${size}`}
         style={{
           left: r.left, top: r.top, width: r.w, height: r.h,
           opacity: clamp(d.o * 3),
           transform: `scale(${0.4 + 0.6 * s}) rotate(${tilt}deg)`,
         }}>
      {d.pic && !d.pic.startsWith('planet-')
        ? <img className="vpic" src={`/pics/${d.pic}.svg`} alt=""
               style={{ transform: `rotate(${d.state === 'active' ? Math.sin(d.local * 6) * 6 : 0}deg)` }} />
        : <div className="vbadge" style={{ background: PALETTE[d.i % PALETTE.length] }}>{d.icon || d.i + 1}</div>}
      <div className="vlabel">{d.label}</div>
      {d.detail ? <div className="vdetail">{d.detail}</div> : null}
    </div>
  )
}

/* ---------------- layout: flow (steps in order) ---------------- */
function FlowLayout({ data, t, cur, local }) {
  const n = data.length
  const gap = n > 4 ? 44 : 64
  const w = Math.min(280, (W - gap * (n - 1)) / n)
  const h = data.some(d => d.detail) ? 220 : 150
  const x0 = (W - (n * w + (n - 1) * gap)) / 2
  const top = (H - h) / 2
  const rects = data.map(d => ({ left: x0 + d.i * (w + gap), top, w, h }))
  return (
    <>
      <svg className="vsvg" width={W} height={H}>
        <Defs />
        {data.slice(1).map(d => (
          <Link key={d.i} local={local} active={cur === d.i}
                p={linkProgress(local, t.at(d.i))}
                pts={[[rects[d.i - 1].left + w + 10, H / 2], [rects[d.i].left - 14, H / 2]]} />
        ))}
      </svg>
      {data.map(d => <Card key={d.i} r={rects[d.i]} d={d} size={n > 4 ? 'sm' : ''} />)}
    </>
  )
}

/* ---------------- layout: cycle (steps that repeat) ---------------- */
function ringLayout(n, w, h, rx, ry, startDeg = -90) {
  const cx = W / 2, cy = H / 2
  const ang = (i) => ((startDeg + (360 * i) / n) * Math.PI) / 180
  const pos = (i) => [cx + rx * Math.cos(ang(i)), cy + ry * Math.sin(ang(i))]
  const rects = Array.from({ length: n }, (_, i) => {
    const [x, y] = pos(i)
    return { left: x - w / 2, top: y - h / 2, w, h }
  })
  return { cx, cy, ang, pos, rects }
}

function Hub({ cx, cy, r, local, text, spin = false }) {
  const s = back(appear(local, 0.15, 0.5))
  return (
    <>
      {spin && (
        <svg className="vsvg" width={W} height={H} style={{ pointerEvents: 'none' }}>
          <g transform={`rotate(${local * 30} ${cx} ${cy})`} opacity={clamp(s)}>
            <circle cx={cx} cy={cy} r={r + 16} className="vring" />
            <circle cx={cx + r + 16} cy={cy} r="6" fill="#ffd23f" stroke={INK} strokeWidth="2.5" />
          </g>
        </svg>
      )}
      <div className="vcenter" style={{
        left: cx - r, top: cy - r, width: r * 2, height: r * 2,
        transform: `scale(${0.3 + 0.7 * s})`, opacity: clamp(s * 2),
      }}>{text}</div>
    </>
  )
}

function CycleLayout({ data, t, cur, local, center }) {
  const n = data.length
  const w = n > 4 ? 196 : 228
  const h = data.some(d => d.detail) ? 116 : 88
  const rx = 420, ry = 136
  const { cx, cy, ang, rects } = ringLayout(n, w, h, rx, ry)
  const arc = (i) => {
    const a0 = ang(i), a1 = a0 + (2 * Math.PI) / n
    const pts = Array.from({ length: 48 }, (_, k) => {
      const a = a0 + ((a1 - a0) * k) / 47
      return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
    })
    return trimOutside(pts, rects)
  }
  const lastAt = t.at(n - 1) + Math.min(0.8, t.step * 0.5)
  return (
    <>
      <svg className="vsvg" width={W} height={H}>
        <Defs />
        {data.map(d => {
          const into = (d.i + 1) % n
          const at = into === 0 ? lastAt : t.at(into)
          return <Link key={d.i} local={local} active={cur === into && into !== 0}
                       p={linkProgress(local, at)} pts={arc(d.i)} />
        })}
      </svg>
      <Hub cx={cx} cy={cy} r={50} local={local} text={center || '↻'} spin />
      {data.map(d => <Card key={d.i} r={rects[d.i]} d={d} size="sm" />)}
    </>
  )
}

/* ---------------- layout: hub (one idea, its parts around it) ---------------- */
function HubLayout({ data, t, cur, local, center }) {
  const n = data.length
  const w = n > 4 ? 196 : 228
  const h = data.some(d => d.detail) ? 116 : 88
  const { cx, cy, pos, rects } = ringLayout(n, w, h, 420, 136, -90 + 180 / n)
  const R = 70
  const spoke = (i) => {
    const [x, y] = pos(i)
    const pts = Array.from({ length: 60 }, (_, k) => [cx + ((x - cx) * k) / 59, cy + ((y - cy) * k) / 59])
    return trimOutside(pts, rects, p => Math.hypot(p[0] - cx, p[1] - cy) > R + 12)
  }
  const pulse = (local * 0.8) % 1
  return (
    <>
      <svg className="vsvg" width={W} height={H}>
        <Defs />
        <circle cx={cx} cy={cy} r={R + 10 + pulse * 46} className="vpulse" opacity={(1 - pulse) * 0.8 * appear(local, 0.3, 0.4)} />
        {data.map(d => (
          <Link key={d.i} local={local} active={cur === d.i}
                p={linkProgress(local, t.at(d.i))} pts={spoke(d.i)} />
        ))}
      </svg>
      <Hub cx={cx} cy={cy} r={R} local={local} text={center} />
      {data.map(d => <Card key={d.i} r={rects[d.i]} d={d} size="sm" />)}
    </>
  )
}

/* ---------------- layout: compare (2-3 things side by side) ---------------- */
function CompareLayout({ data, local }) {
  const cols = data.slice(0, 3)
  const k = cols.length
  const gap = 96
  const w = (W - gap * (k - 1)) / k
  const h = 330
  const top = (H - h) / 2
  return (
    <>
      {cols.map(d => <Card key={d.i} d={d} size="big" r={{ left: d.i * (w + gap), top, w, h }} />)}
      {cols.slice(1).map(d => {
        const s = back(d.o)
        return (
          <div key={d.i} className="vvs"
               style={{ left: d.i * (w + gap) - gap / 2, top: H / 2, opacity: clamp(d.o * 3),
                        transform: `scale(${s}) rotate(${(1 - s) * 90 + Math.sin(local * 3) * 4}deg)` }}>VS</div>
        )
      })}
    </>
  )
}

/* ---------------- layout: layers (stacked levels that drop in like books) ---------------- */
function LayersLayout({ data }) {
  const n = data.length
  const gapY = 10
  const bh = Math.min(80, (H - gapY * (n - 1)) / n)
  const top0 = (H - (n * bh + (n - 1) * gapY)) / 2
  return (
    <>
      {data.map(d => {
        const w = n === 1 ? 900 : 560 + (d.i * 520) / (n - 1)
        const fall = bounce(d.o)
        return (
          <div key={d.i} className={`vlayer ${d.state}`}
               style={{
                 left: (W - w) / 2, top: top0 + d.i * (bh + gapY), width: w, height: bh,
                 background: d.state === 'active' ? '#ffd23f' : PALETTE[(d.i + 2) % PALETTE.length],
                 opacity: clamp(d.o * 4), transform: `translateY(${(1 - fall) * -120}px)`,
               }}>
            {d.pic && !d.pic.startsWith('planet-')
              ? <img className="vpic" src={`/pics/${d.pic}.svg`} alt="" />
              : <span className="vbadge">{d.icon || d.i + 1}</span>}
            <span className="vlabel">{d.label}</span>
            {d.detail ? <span className="vdetail">{d.detail}</span> : null}
          </div>
        )
      })}
    </>
  )
}

/* ---------------- layout: timeline (events in time order) ---------------- */
function TimelineLayout({ data, t, cur, local }) {
  const n = data.length
  const x0 = 40, x1 = W - 40, y = H / 2
  const xs = data.map(d => (n === 1 ? (x0 + x1) / 2 : x0 + 40 + (d.i * (x1 - x0 - 80)) / (n - 1)))
  const w = Math.min(250, (2 * (x1 - x0)) / n - 24)
  const h = data.some(d => d.detail) ? 120 : 84
  const lineTo = cur < 0 ? 0 : xs[cur] + (cur === n - 1 ? 40 : 0)
  const grow = ease((local - 0.3) / 0.5)
  return (
    <>
      <svg className="vsvg" width={W} height={H}>
        <line x1={x0} y1={y} x2={x1} y2={y} className="tl-track" />
        <line x1={x0} y1={y} x2={x0 + (Math.max(lineTo, x0) - x0) * grow} y2={y} className="tl-line" />
        {data.map(d => {
          const s = back(d.o)
          const up = d.i % 2 === 0
          return (
            <g key={d.i} opacity={clamp(d.o * 3)}>
              <line x1={xs[d.i]} y1={y} x2={xs[d.i]} y2={up ? y - 40 : y + 40} className="tl-stem" />
              <circle cx={xs[d.i]} cy={y} r={12 * s} className={`tl-dot ${d.state}`} />
            </g>
          )
        })}
      </svg>
      {data.map(d => {
        const up = d.i % 2 === 0
        return <Card key={d.i} d={d} size="sm"
                     r={{ left: xs[d.i] - w / 2, top: up ? y - 40 - h : y + 40, w, h }} />
      })}
    </>
  )
}

const LAYOUTS = { flow: FlowLayout, cycle: CycleLayout, hub: HubLayout, compare: CompareLayout,
                  layers: LayersLayout, timeline: TimelineLayout }

/* ================= scene types ================= */

// little shapes that pop in around the title, then float
const CONFETTI = [
  { x: 120, y: 70, c: '#ffd23f', shape: 'circle', at: 0.5 },
  { x: 1040, y: 90, c: '#f26b7f', shape: 'square', at: 0.7 },
  { x: 180, y: 370, c: '#3fb8c8', shape: 'triangle', at: 0.9 },
  { x: 990, y: 360, c: '#ffd23f', shape: 'triangle', at: 1.1 },
  { x: 70, y: 220, c: '#f26b7f', shape: 'circle', at: 1.3 },
  { x: 1100, y: 230, c: '#a78bfa', shape: 'square', at: 1.5 },
]

export function TitleCard({ scene, local, audioDuration = 4 }) {
  const card = back(appear(local, 0.05, 0.55))
  const cps = Math.max(18, Array.from(scene.heading || '').length / Math.max(1.2, audioDuration * 0.45))
  return (
    <div className="title-card">
      <svg className="title-art" width={W} height={440}>
        {CONFETTI.map((c, i) => {
          const s = back(appear(local, c.at, 0.45))
          const y = c.y + Math.sin(local * 1.6 + i) * 8
          const rot = local * (i % 2 ? 40 : -40)
          return (
            <g key={i} transform={`translate(${c.x} ${y}) rotate(${rot}) scale(${s})`}>
              {c.shape === 'circle' && <circle r="16" fill={c.c} stroke={INK} strokeWidth="4" />}
              {c.shape === 'square' && <rect x="-14" y="-14" width="28" height="28" rx="4" fill={c.c} stroke={INK} strokeWidth="4" />}
              {c.shape === 'triangle' && <path d="M0,-18 L17,13 L-17,13 Z" fill={c.c} stroke={INK} strokeWidth="4" strokeLinejoin="round" />}
            </g>
          )
        })}
      </svg>
      <div className="screen" style={{ transform: `scale(${0.5 + 0.5 * card})`, opacity: clamp(card * 2) }}>
        <div className="screen-bar"><i /><i /><i /></div>
        <h1><Typewriter text={scene.heading} local={local} start={0.5} cps={cps} highlight={2} /></h1>
      </div>
    </div>
  )
}

export function CodeWalkthrough({ scene, local, audioDuration }) {
  const lines = (scene.code || '').split('\n')
  const hl = scene.highlight_lines || []
  // type the code out, then step the highlight through the important lines
  const total = lines.reduce((s, l) => s + l.length + 4, 0)
  const typeTime = Math.min(2.6, Math.max(0.8, audioDuration * 0.35))
  const cps = total / typeTime
  const start = 0.5
  let budget = Math.max(0, (local - start) * cps)
  const typed = lines.map(l => { const n = Math.min(l.length + 4, budget); budget -= n; return Math.max(0, Math.min(l.length, Math.floor(n))) })
  const typingLine = typed.findIndex((n, i) => n < lines[i].length)
  const revealEnd = start + typeTime
  const stepTime = Math.max(0.5, (audioDuration - revealEnd) / Math.max(1, hl.length))
  const active = local < revealEnd || hl.length === 0
    ? -1
    : hl[Math.min(hl.length - 1, Math.floor((local - revealEnd) / stepTime))]
  const win = back(appear(local, 0.1, 0.5))
  const blink = Math.floor(local * 2) % 2 === 0

  return (
    <div className="scene-body">
      <SceneHeading text={scene.heading} local={local} />
      <div className="code-window" style={{ transform: `scale(${0.6 + 0.4 * win})`, opacity: clamp(win * 2) }}>
        <div className="code-head"><i /><i /><i /><span>code</span></div>
        <pre className="code-box">
          {lines.map((line, i) => (
            <div key={i} className={`code-line ${i + 1 === active ? 'active' : ''}`}
                 style={{ opacity: typed[i] > 0 || i === typingLine ? 1 : 0.18 }}>
              <span className="line-no">{i + 1 === active ? '▶' : i + 1}</span>
              <span className="line-text">
                {line.slice(0, typed[i]) || (i === typingLine ? '' : ' ')}
                {i === typingLine && <span className="tw-cursor code" style={{ opacity: blink ? 1 : 0 }} />}
              </span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

export function Diagram({ scene, local, audioDuration }) {
  const items = (scene.items || []).slice(0, 6)
  const layout = LAYOUTS[scene.layout] ? scene.layout : 'flow'
  const n = items.length
  const t = steps(n, audioDuration)
  const cur = currentIndex(n, local, t)
  const data = items.map((label, i) => ({
    i, label,
    detail: (scene.details && scene.details[i]) || '',
    icon: (scene.icons && scene.icons[i]) || '',
    pic: (scene.pics && scene.pics[i]) || '',
    local,
    o: appear(local, t.at(i) - 0.2, 0.55),
    state: stateOf(i, cur),
  }))
  const center = scene.center || String(scene.heading || '').replace(/^[^:]*:\s*/, '')
  const Layout = LAYOUTS[layout]
  return (
    <div className="scene-body">
      <SceneHeading text={scene.heading} local={local} />
      <div className={`viz viz-${layout}`} style={{ width: W, height: H }}>
        <Layout data={data} t={t} cur={cur} local={local} center={center} />
      </div>
    </div>
  )
}

export function Quiz({ scene, local, revealAt, think = 3, chosen = null, onChoose = null }) {
  const options = scene.options || []
  const revealed = revealAt != null && local >= revealAt
  const askAt = revealAt != null ? revealAt - think : Infinity
  const thinking = !revealed && local >= askAt
  const remaining = Math.max(1, Math.ceil(revealAt - local))
  const waitingForLearner = onChoose && thinking && chosen == null
  const pop = revealed ? back(appear(local, revealAt, 0.4)) : 1
  return (
    <div className="scene-body quiz">
      <SceneHeading text={`❓ ${scene.heading}`} local={local} />
      <div className="quiz-q"><Typewriter text={scene.narration} local={local} start={0.4} cps={45} cursor={false} /></div>
      <div className="quiz-opts">
        {options.map((opt, i) => {
          const correct = i === scene.answer
          const cls = revealed
            ? (correct ? 'correct' : chosen === i ? 'wrong' : 'dim')
            : (chosen === i ? 'picked' : '')
          const o = appear(local, 0.9 + i * 0.3, 0.45)
          const s = revealed && correct ? pop : back(o)
          return (
            <button key={i} className={`quiz-opt ${cls}`}
                    style={{ opacity: clamp(o * 3),
                             transform: `translateX(${(1 - ease(o)) * -60}px) scale(${revealed && correct ? 0.92 + 0.08 * s : 0.85 + 0.15 * s})` }}
                    onClick={onChoose && !revealed ? () => onChoose(i) : undefined}
                    disabled={!onChoose || revealed}>
              <span className="quiz-letter" style={{ background: PALETTE[i] }}>{'ABC'[i]}</span>
              <span className="quiz-text">{opt}</span>
              {revealed && correct && <span className="quiz-mark">✓</span>}
              {revealed && !correct && chosen === i && <span className="quiz-mark">✗</span>}
            </button>
          )
        })}
      </div>
      {thinking && (
        <div className="quiz-timer" style={{ transform: `scale(${1 + 0.08 * Math.sin(local * 8)})` }}>
          {waitingForLearner ? 'Pick an answer' : `Think… ${remaining}`}
        </div>
      )}
      {revealed && chosen != null && (
        <div className={`quiz-result ${chosen === scene.answer ? 'ok' : 'no'}`}>
          {chosen === scene.answer ? '🎉 Correct!' : 'Not quite. See the right answer above.'}
        </div>
      )}
    </div>
  )
}
