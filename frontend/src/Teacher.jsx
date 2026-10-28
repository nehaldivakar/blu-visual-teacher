// A cartoon teacher who stands beside the lesson and points at whatever is being explained,
// using a pointer stick. The stick finds the "active" thing on screen (the highlighted card,
// the shape part being drawn, the planet being named...) and glides to it.
import { useLayoutEffect, useRef, useState } from 'react'

const INK = '#1a1033'
const SKIN = '#f2bd94'
// what to point at, most specific first
const TARGETS = ['[data-point]', '.vnode.active', '.vlayer.active', '.eq-tok.on', '.fact.on', '.code-line.active',
                 '.quiz-opt.correct', '.quiz-opt.picked', '.pic-label.on', '.quiz-q', '.screen h1']
const BASE = [128, 606]            // where the teacher's feet stand (stage pixels)
const SHOULDER = [BASE[0] + 32, BASE[1] - 214]
const REST = [330, 300]            // where the stick points when there is nothing to point at

const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x ** 3 : 1 - Math.pow(-2 * x + 2, 3) / 2 }
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

export default function Teacher({ stageRef, t, speaking }) {
  const [target, setTarget] = useState(null)
  const glide = useRef({ from: REST, to: REST, at: -10, shown: REST })

  // find the thing to point at after every frame is drawn (also works frame by frame in the MP4 export)
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let next = null
    for (const sel of TARGETS) {
      const el = stage.querySelector(`.scene ${sel}`)
      if (!el) continue
      const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect()
      const k = s.width / 1280 || 1
      if (r.width === 0 && r.height === 0 && sel !== '[data-point]') continue
      const small = r.width < 40
      // touch big things on their left edge (nearest the teacher), small markers in the middle
      next = [(r.left - s.left + (small ? r.width / 2 : 4)) / k,
              (r.top - s.top + r.height / 2) / k]
      break
    }
    if (next && next[0] < SHOULDER[0] + 90) next = null     // never point back at itself
    if ((next === null) !== (target === null) || (next && dist(next, target) > 0.5)) setTarget(next)
  })

  // glide smoothly when the target jumps; follow it directly while it moves a little (a moving planet)
  const g = glide.current
  const goal = target || REST
  // a jump in time (seeking) snaps the stick; normal playback glides
  if (t < g.at || g.lastT == null || Math.abs(t - g.lastT) > 1) { g.from = goal; g.at = t - 1; g.to = goal; g.snapT = t }
  else if (dist(goal, g.to) > 50) {
    if (t === g.snapT) { g.from = goal; g.at = t - 1 }      // first frame after a seek: just be there
    else { g.from = g.shown; g.at = t }
  }
  g.to = goal
  const k = ease((t - g.at) / 0.5)
  let tip = [g.from[0] + (goal[0] - g.from[0]) * k, g.from[1] + (goal[1] - g.from[1]) * k]
  g.shown = tip
  g.lastT = t

  const bob = Math.sin(t * 2.2) * 2
  const sh = [SHOULDER[0], SHOULDER[1] + bob]
  const dx = tip[0] - sh[0], dy = tip[1] - sh[1]
  const len = Math.hypot(dx, dy) || 1
  const u = [dx / len, dy / len]
  // a little "tap" when the stick arrives
  const since = t - g.at - 0.5
  const tap = target && since > 0 && since < 0.35 ? Math.sin((since / 0.35) * Math.PI) * 10 : 0
  tip = [tip[0] - u[0] * (6 + tap), tip[1] - u[1] * (6 + tap)]
  const hand = [sh[0] + u[0] * 62, sh[1] + u[1] * 62]
  const elbow = [sh[0] + u[0] * 30 + 8, sh[1] + u[1] * 30 + 14]
  const butt = [hand[0] - u[0] * 16, hand[1] - u[1] * 16]

  const blink = (t % 3.7) < 0.13
  const mouth = speaking ? 2 + 7 * Math.abs(Math.sin(t * 13)) * (0.5 + 0.5 * Math.abs(Math.sin(t * 4.1))) : 1.5
  const [bx, by] = [BASE[0], BASE[1] + bob]

  return (
    <>
    {/* the stick goes BEHIND the lesson, so it never covers any words; only its tip sits on top */}
    <svg className="teacher back" width="1280" height="720" viewBox="0 0 1280 720">
      <line x1={butt[0]} y1={butt[1]} x2={tip[0]} y2={tip[1]} stroke={INK} strokeWidth="11" strokeLinecap="round" />
      <line x1={butt[0]} y1={butt[1]} x2={tip[0]} y2={tip[1]} stroke="#b9763c" strokeWidth="6" strokeLinecap="round" />
    </svg>
    <svg className="teacher" width="1280" height="720" viewBox="0 0 1280 720">
      {/* shadow */}
      <ellipse cx={BASE[0]} cy={BASE[1] + 4} rx="74" ry="11" fill={INK} opacity="0.3" />
      <g>
        {/* legs and shoes */}
        <rect x={bx - 34} y={by - 112} width="28" height="108" rx="10" fill="#2b2f6b" stroke={INK} strokeWidth="4" />
        <rect x={bx + 6} y={by - 112} width="28" height="108" rx="10" fill="#2b2f6b" stroke={INK} strokeWidth="4" />
        <path d={`M${bx - 44} ${by} q 0 -16 20 -16 h 18 v 16 z`} fill={INK} />
        <path d={`M${bx + 44} ${by} q 0 -16 -20 -16 h -18 v 16 z`} fill={INK} />
        {/* body: shirt with collar and a pocket pen */}
        <path d={`M${bx - 52} ${by - 104} q -4 -96 22 -122 q 30 -16 60 0 q 26 26 22 122 z`}
              fill="#3fb8c8" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        <path d={`M${bx - 20} ${by - 226} l 20 24 l 20 -24`} fill="#fbf6ea" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        <rect x={bx - 38} y={by - 176} width="24" height="22" rx="4" fill="#2e9aa8" stroke={INK} strokeWidth="3" />
        <rect x={bx - 32} y={by - 186} width="5" height="18" rx="2" fill="#f26b7f" stroke={INK} strokeWidth="2" />
        {/* resting arm */}
        <path d={`M${bx - 44} ${by - 206} q -26 40 -12 86`} fill="none" stroke={INK} strokeWidth="26" strokeLinecap="round" />
        <path d={`M${bx - 44} ${by - 206} q -26 40 -12 86`} fill="none" stroke="#3fb8c8" strokeWidth="17" strokeLinecap="round" />
        <circle cx={bx - 56} cy={by - 114} r="12" fill={SKIN} stroke={INK} strokeWidth="4" />
        {/* neck and head */}
        <rect x={bx - 11} y={by - 246} width="22" height="24" fill={SKIN} stroke={INK} strokeWidth="4" />
        <circle cx={bx + 30} cy={by - 334} r="17" fill="#3a2350" stroke={INK} strokeWidth="4" />
        <circle cx={bx} cy={by - 284} r="44" fill={SKIN} stroke={INK} strokeWidth="5" />
        <path d={`M${bx - 45} ${by - 284} q -2 -50 45 -52 q 46 2 45 46 q -20 -26 -50 -30 q -16 18 -40 36 z`}
              fill="#3a2350" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        {/* glasses, eyes and a talking mouth */}
        <circle cx={bx - 16} cy={by - 282} r="13" fill="#fff" fillOpacity="0.5" stroke={INK} strokeWidth="4" />
        <circle cx={bx + 18} cy={by - 282} r="13" fill="#fff" fillOpacity="0.5" stroke={INK} strokeWidth="4" />
        <line x1={bx - 3} y1={by - 283} x2={bx + 5} y2={by - 283} stroke={INK} strokeWidth="4" />
        {blink
          ? <><line x1={bx - 21} y1={by - 281} x2={bx - 11} y2={by - 281} stroke={INK} strokeWidth="3" />
              <line x1={bx + 13} y1={by - 281} x2={bx + 23} y2={by - 281} stroke={INK} strokeWidth="3" /></>
          : <><circle cx={bx - 14 + u[0] * 3} cy={by - 282 + u[1] * 3} r="4" fill={INK} />
              <circle cx={bx + 20 + u[0] * 3} cy={by - 282 + u[1] * 3} r="4" fill={INK} /></>}
        <circle cx={bx - 30} cy={by - 266} r="6" fill="#f26b7f" opacity="0.45" />
        <circle cx={bx + 32} cy={by - 266} r="6" fill="#f26b7f" opacity="0.45" />
        <ellipse cx={bx + 2} cy={by - 258} rx="9" ry={mouth} fill="#7a2335" stroke={INK} strokeWidth="3" />
      </g>
      {/* pointing arm and the stick */}
      {/* the first bit of stick in the hand, drawn in front */}
      <line x1={butt[0]} y1={butt[1]} x2={hand[0] + u[0] * 40} y2={hand[1] + u[1] * 40} stroke={INK} strokeWidth="11" strokeLinecap="round" />
      <line x1={butt[0]} y1={butt[1]} x2={hand[0] + u[0] * 40} y2={hand[1] + u[1] * 40} stroke="#b9763c" strokeWidth="6" strokeLinecap="round" />
      <circle cx={tip[0]} cy={tip[1]} r="8" fill="#f26b7f" stroke={INK} strokeWidth="3.5" />
      <path d={`M${sh[0]} ${sh[1]} Q ${elbow[0]} ${elbow[1]} ${hand[0]} ${hand[1]}`} fill="none"
            stroke={INK} strokeWidth="26" strokeLinecap="round" />
      <path d={`M${sh[0]} ${sh[1]} Q ${elbow[0]} ${elbow[1]} ${hand[0]} ${hand[1]}`} fill="none"
            stroke="#3fb8c8" strokeWidth="17" strokeLinecap="round" />
      <circle cx={hand[0]} cy={hand[1]} r="13" fill={SKIN} stroke={INK} strokeWidth="4" />
    </svg>
    </>
  )
}
