import { useEffect, useRef, useState } from 'react'
import { TitleCard, CodeWalkthrough, Diagram, Quiz } from './scenes.jsx'
import { Shape, Equation, Chart } from './visuals.jsx'
import { Picture } from './pictures.jsx'
import Teacher from './Teacher.jsx'

const SCENES = { title_card: TitleCard, code_walkthrough: CodeWalkthrough, diagram: Diagram, quiz: Quiz,
                 shape: Shape, equation: Equation, chart: Chart, picture: Picture }
// the teacher with the pointer stick can be hidden with ?teacher=0
const SHOW_TEACHER = typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('teacher') !== '0'
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const WIPE_COLORS = ['#f26b7f', '#ffd23f', '#3fb8c8', '#34c27a']
const WIPE = 0.75         // seconds the colour wipe takes at the start of a scene

export function findSceneIndex(timing, t) {
  const s = timing.scenes
  for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].start) return i
  return 0
}

// What the caption says at local time `local`, and when that line is spoken
export function captionFor(scene, st, local) {
  const revealed = st.reveal_at != null && local >= st.reveal_at
  if (revealed) {
    return { text: scene.answer_narration || '', en: scene.answer_narration_en,
             from: st.reveal_at, to: st.audio_duration }
  }
  const to = st.reveal_at != null ? st.reveal_at - (st.think || 3) : st.audio_duration
  return { text: scene.narration, en: scene.narration_en, from: 0, to }
}

// Karaoke captions: each word lights up as it is spoken.
// Word times are estimated from word length across the clip's real duration.
function SpokenWords({ text, local, from, to }) {
  const words = text.split(/\s+/).filter(Boolean)
  const weights = words.map(w => Array.from(w).length + 2)
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const p = clamp((local - from) / Math.max(0.3, to - from)) * total
  let acc = 0
  return words.map((w, i) => {
    const startW = acc
    acc += weights[i]
    const state = p >= acc ? 'w-said' : p >= startW ? 'w-now' : 'w-next'
    return <span key={i} className={state}>{w} </span>
  })
}

// Soft drifting dots joined by lines, behind every scene (like a knowledge network)
const NODES = Array.from({ length: 16 }, (_, i) => ({
  x: (i * 337) % 1280, y: 60 + ((i * 211) % 560), sp: 0.15 + (i % 5) * 0.05, ph: i * 1.7,
}))
function Network({ t }) {
  const pts = NODES.map(n => [n.x + Math.sin(t * n.sp + n.ph) * 30, n.y + Math.cos(t * n.sp * 1.3 + n.ph) * 22])
  const lines = []
  pts.forEach((a, i) => pts.slice(i + 1).forEach((b, j) => {
    const d = Math.hypot(a[0] - b[0], a[1] - b[1])
    if (d < 260) lines.push({ a, b, o: 1 - d / 260, k: `${i}-${j}` })
  }))
  return (
    <svg className="network" width="1280" height="720">
      {lines.map(l => <line key={l.k} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} strokeOpacity={0.18 * l.o} />)}
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i % 3 ? 3 : 5} />)}
    </svg>
  )
}

export default function Stage({ lesson, timing, t, fit = true, dual = true, quiz = null }) {
  const frameRef = useRef(null)
  const stageRef = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!fit) return
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1280))
    ro.observe(frameRef.current)
    return () => ro.disconnect()
  }, [fit])

  const index = findSceneIndex(timing, t)
  const scene = lesson.scenes[index]
  const st = timing.scenes[index]
  const local = Math.max(0, t - st.start)
  const SceneComponent = SCENES[scene.type] || TitleCard
  const cap = captionFor(scene, st, local)
  const showEn = dual && cap.en && lesson.language !== 'en'
  const long = cap.text.length + (showEn ? cap.en.length * 0.6 : 0) > 170
  const theme = scene.type === 'title_card' ? 'bg-green' : 'bg-purple'
  // colour wipe: a slanted panel slides off to the right as the new scene starts
  const wipe = index === 0 ? 1 : clamp(local / WIPE)
  // the teacher's mouth moves only while the narrator is speaking
  const thinkFrom = st.reveal_at != null ? st.reveal_at - (st.think || 3) : Infinity
  const speaking = local < st.audio_duration && !(local >= thinkFrom && local < (st.reveal_at ?? 0))
  const wipeEase = wipe < 0.5 ? 4 * wipe ** 3 : 1 - Math.pow(-2 * wipe + 2, 3) / 2   // ease in-out

  return (
    <div className="stage-frame" ref={frameRef}
         style={fit ? { height: 720 * scale } : undefined}>
      <div className={`stage ${theme} ${SHOW_TEACHER ? 'with-teacher' : ''}`} ref={stageRef}
           style={{ transform: `scale(${scale})` }}>
        <Network t={t} />
        <div className="stage-top">
          <span className="brand-chip"><b>B</b> {lesson.title}</span>
          <span className="count-chip">{index + 1} / {lesson.scenes.length}</span>
        </div>
        <div className="scene" key={index}>
          <SceneComponent scene={scene} local={local} audioDuration={st.audio_duration}
                          revealAt={st.reveal_at} think={st.think}
                          chosen={quiz ? quiz.chosen : null}
                          onChoose={quiz ? quiz.onChoose : null} />
        </div>
        {SHOW_TEACHER && <Teacher stageRef={stageRef} t={t} speaking={speaking} />}
        <div className={`caption-bar ${long ? 'long' : ''}`}>
          <div className="cap-main"><SpokenWords text={cap.text} local={local} from={cap.from} to={cap.to} /></div>
          {showEn && <div className="cap-en">{cap.en}</div>}
        </div>
        <div className="progress">
          <div className="progress-fill"
               style={{ width: `${Math.min(100, (t / timing.total) * 100)}%` }} />
        </div>
        {wipe < 1 && (
          <div className="wipe" style={{
            background: WIPE_COLORS[index % WIPE_COLORS.length],
            transform: `translateX(${wipeEase * 125}%) skewX(-14deg)`,
          }} />
        )}
      </div>
    </div>
  )
}
