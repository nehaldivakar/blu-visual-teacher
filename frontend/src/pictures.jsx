// Pictures that match the topic: animals walk in, birds fly, fish swim, plants grow,
// planets orbit the sun. Pictures come from the offline pack in /public/pics (Fluent Emoji, MIT);
// planets and molecules are drawn here. Every frame is a pure function of `local`.
import { clamp, appear, ease, back, PALETTE, INK, CREAM, W, H, SceneHeading } from './scenes.jsx'
import { motionOf } from './picinfo.js'

export const picUrl = (pic) => `/pics/${pic}.svg`

export function picsOfLesson(lesson) {
  const all = new Set()
  for (const s of lesson.scenes || []) for (const p of s.pics || []) if (p && !p.startsWith('planet-')) all.add(p)
  return [...all]
}

// wait until every picture is downloaded, so the exported video never shows an empty frame
export function preloadPics(lesson) {
  return Promise.all(picsOfLesson(lesson).map(p => new Promise(done => {
    const img = new Image()
    img.onload = img.onerror = () => done()
    img.src = picUrl(p)
  })))
}

/* ------------------------------------------------------------------ planets */
const PLANETS = {
  mercury: { c: '#a8a39d', d: '#7d7873', r: 0.62 },
  venus: { c: '#f0c76e', d: '#d39b45', r: 0.82 },
  earth: { c: '#3f8fe0', d: '#34c27a', r: 0.86 },
  mars: { c: '#e2603f', d: '#a8432c', r: 0.72 },
  jupiter: { c: '#e2b47c', d: '#b9784a', r: 1.15, bands: true },
  saturn: { c: '#efd08a', d: '#c9a45a', r: 1.0, ring: true },
  uranus: { c: '#8fe0e8', d: '#5fbdc9', r: 0.92 },
  neptune: { c: '#4f73e8', d: '#3653b8', r: 0.9 },
  pluto: { c: '#d8c2a8', d: '#a98d70', r: 0.5 },
}
export const planetScale = (pic) => (PLANETS[pic.replace('planet-', '')] || { r: 0.8 }).r

// a flat cartoon planet inside a size x size box (centered at 0,0)
export function PlanetArt({ pic, size, spin = 0, id }) {
  const p = PLANETS[pic.replace('planet-', '')] || PLANETS.mars
  const r = size / 2 - 5
  const clip = `pl-${id}`
  return (
    <g>
      {p.ring && <ellipse rx={r * 1.75} ry={r * 0.5} fill="none" stroke={INK} strokeWidth={r * 0.34 + 6} transform="rotate(-14)" />}
      {p.ring && <ellipse rx={r * 1.75} ry={r * 0.5} fill="none" stroke="#f6e3b0" strokeWidth={r * 0.34} transform="rotate(-14)" />}
      <clipPath id={clip}><circle r={r} /></clipPath>
      <circle r={r} fill={p.c} stroke={INK} strokeWidth="5" />
      <g clipPath={`url(#${clip})`}>
        {p.bands && [-0.55, -0.15, 0.3, 0.62].map((y, k) => (
          <rect key={k} x={-r} y={r * y} width={r * 2} height={r * (k % 2 ? 0.14 : 0.2)} fill={p.d} opacity="0.85" />
        ))}
        {pic === 'planet-earth' && (
          <g transform={`translate(${((spin * 18) % (r * 4)) - r * 2} 0)`}>
            {[-1, 1].map(k => (
              <g key={k} transform={`translate(${k * r * 2} 0)`}>
                <path d={`M${-r * 0.6} ${-r * 0.5} q ${r * 0.4} ${-r * 0.3} ${r * 0.7} 0 q ${r * 0.1} ${r * 0.5} ${-r * 0.3} ${r * 0.6} q ${-r * 0.5} 0 ${-r * 0.4} ${-r * 0.6} z`} fill={p.d} />
                <path d={`M${r * 0.2} ${r * 0.1} q ${r * 0.5} ${-r * 0.1} ${r * 0.6} ${r * 0.3} q ${-r * 0.1} ${r * 0.4} ${-r * 0.5} ${r * 0.4} q ${-r * 0.3} ${-r * 0.3} ${-r * 0.1} ${-r * 0.7} z`} fill={p.d} />
              </g>
            ))}
          </g>
        )}
        {pic !== 'planet-earth' && !p.bands && (
          <>
            <circle cx={-r * 0.35} cy={-r * 0.2} r={r * 0.18} fill={p.d} opacity="0.7" />
            <circle cx={r * 0.3} cy={r * 0.35} r={r * 0.12} fill={p.d} opacity="0.7" />
          </>
        )}
        <circle cx={r * 0.35} cy={r * 0.35} r={r} fill="none" stroke={INK} strokeOpacity="0.18" strokeWidth={r * 0.5} />
      </g>
      <circle r={r} fill="none" stroke={INK} strokeWidth="5" />
      {p.ring && <path d={`M ${-r * 1.75} 0 A ${r * 1.75} ${r * 0.5} 0 0 0 ${r * 1.75} 0`} fill="none" stroke={INK}
                       strokeWidth={r * 0.34 + 6} transform="rotate(-14)" />}
      {p.ring && <path d={`M ${-r * 1.75} 0 A ${r * 1.75} ${r * 0.5} 0 0 0 ${r * 1.75} 0`} fill="none" stroke="#f6e3b0"
                       strokeWidth={r * 0.34} transform="rotate(-14)" />}
    </g>
  )
}

// one picture (pack image or drawn planet) centered at 0,0 inside an SVG
export function PicArt({ pic, size, local = 0, id = 0 }) {
  if (pic.startsWith('planet-')) return <PlanetArt pic={pic} size={size} spin={local} id={id} />
  return <image href={picUrl(pic)} x={-size / 2} y={-size / 2} width={size} height={size} />
}

/* ------------------------------------------------------------------ motion */
// returns the SVG transform for a picture: how it enters, then how it moves while on screen
function moveFor(kind, e, local, i, active) {
  const k = ease(e)
  const lift = active ? Math.abs(Math.sin(local * 5)) * -10 : 0
  switch (kind) {
    case 'walk': {   // trots in from the left with little hops, then bobs
      const x = (1 - k) * -460
      const hop = e < 1 ? -Math.abs(Math.sin(e * Math.PI * 4)) * 34 * (1 - e) : -Math.abs(Math.sin(local * 3 + i)) * 5
      return { x, y: hop + lift, r: e < 1 ? Math.sin(e * Math.PI * 8) * 6 : 0, s: 1 }
    }
    case 'fly': {    // swoops down from the top right, then hovers
      const x = (1 - k) * 380, y = (1 - k) * -300 + Math.sin(e * Math.PI) * 30
      return { x, y: y + Math.sin(local * 3 + i) * 10 + lift, r: Math.sin(local * 2.5 + i) * 6, s: 1 }
    }
    case 'swim': {   // swims in from the right on a wavy path
      const x = (1 - k) * 460 + Math.sin(local * 1.6 + i) * 10
      return { x, y: Math.sin(e * Math.PI * 4 + local * 2) * 12 + lift, r: Math.sin(local * 2 + i) * 6, s: 1 }
    }
    case 'grow':     // grows up from the ground, then sways
      return { x: 0, y: lift, r: e < 1 ? 0 : Math.sin(local * 1.5 + i) * 4, s: back(e), grow: true }
    case 'space':    // spins in, then turns slowly and twinkles
      return { x: 0, y: Math.sin(local * 1.2 + i) * 6 + lift, r: (1 - k) * -200 + Math.sin(local * 0.8 + i) * 5, s: back(e) }
    default:         // pops in, then floats
      return { x: 0, y: Math.sin(local * 2 + i) * 6 + lift, r: (1 - k) * 10, s: back(e) }
  }
}

function steps(n, audioDuration, start = 0.6) {
  const step = Math.max(0.8, (audioDuration - start) / Math.max(1, n))
  return { step, at: (i) => start + i * step }
}

/* ------------------------------------------------------------------ gallery */
function Gallery({ scene, local, audioDuration }) {
  const items = scene.items.slice(0, 6), pics = scene.pics || []
  const n = items.length
  const t = steps(n, audioDuration)
  const cur = local < t.at(0) ? -1 : Math.min(n - 1, Math.floor((local - t.at(0)) / t.step))
  const size = [0, 250, 230, 205, 175, 150, 132][n]
  const slot = W / n
  const cy = 150
  const hasDetails = (scene.details || []).some(Boolean)
  return (
    <>
      <svg className="vsvg" width={W} height={H} style={{ overflow: 'visible' }}>
        {items.map((_, i) => {
          const e = appear(local, t.at(i) - 0.25, 1.0)
          if (e <= 0) return null
          const active = i === cur
          const kind = motionOf(pics[i])
          const m = moveFor(kind, e, local, i, active)
          const cx = slot * i + slot / 2
          const grow = active ? 1.12 : 1
          const ground = cy + size / 2
          return (
            <g key={i} opacity={clamp(e * 4)}>
              {/* shadow on the ground */}
              <ellipse cx={cx + m.x * 0.6} cy={ground + 6} rx={size * 0.34 * clamp(e * 1.3)} ry={10} fill={INK} opacity="0.25" />
              {active && (
                <circle cx={cx} cy={cy} r={size * 0.62 + Math.sin(local * 4) * 5} fill="none" stroke="#ffd23f" strokeWidth="6"
                        strokeDasharray="18 14" strokeLinecap="round" transform={`rotate(${local * 40} ${cx} ${cy})`} />
              )}
              <g transform={m.grow
                ? `translate(${cx} ${ground}) scale(${grow} ${m.s * grow}) rotate(${m.r}) translate(0 ${-size / 2})`
                : `translate(${cx + m.x} ${cy + m.y}) rotate(${m.r}) scale(${m.s * grow})`}>
                <PicArt pic={pics[i]} size={size} local={local} id={i} />
              </g>
              {active && <circle cx={cx} cy={cy - size * 0.2} r="2" opacity="0" data-point="1" />}
            </g>
          )
        })}
      </svg>
      {items.map((label, i) => {
        const o = appear(local, t.at(i) + 0.35, 0.45)
        if (o <= 0) return null
        const w = Math.min(slot - 18, 280)
        return (
          <div key={i} className={`pic-label ${i === cur ? 'on' : ''}`}
               style={{ left: slot * i + (slot - w) / 2, top: cy + size / 2 + 26, width: w,
                        opacity: clamp(o * 3), transform: `translateY(${(1 - back(o)) * 24}px)` }}>
            <span className="pic-name">{label}</span>
            {hasDetails && scene.details[i] ? <span className="pic-detail">{scene.details[i]}</span> : null}
          </div>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------------ solar system */
const SUNS = new Set(['sun', 'sun-with-face', 'glowing-star', 'star'])

function Orbit({ scene, local, audioDuration }) {
  const items = scene.items.slice(0, 9), pics = scene.pics || []
  const n = items.length
  const t = steps(n, audioDuration, 0.5)
  const cur = local < t.at(0) ? -1 : Math.min(n - 1, Math.floor((local - t.at(0)) / t.step))
  const sunIdx = pics.findIndex(p => SUNS.has(p))
  const cx = W / 2, cy = H / 2 + 10
  const others = items.map((_, i) => i).filter(i => i !== sunIdx)
  const m = others.length
  const rx0 = 150, rx1 = 560
  const sunSize = 130
  const sunE = appear(local, sunIdx >= 0 ? t.at(sunIdx) - 0.3 : 0.2, 0.8)
  const bodies = others.map((i, k) => {
    const rx = m === 1 ? 300 : rx0 + ((rx1 - rx0) * k) / (m - 1)
    const ry = rx * 0.3
    const w = 0.55 / (1 + k * 0.45)
    const a = 0.6 + k * 1.9 + local * w
    const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a)
    const size = pics[i].startsWith('planet-') ? Math.max(34, 62 * planetScale(pics[i])) : 58
    return { i, k, rx, ry, x, y, size, front: Math.sin(a) > 0, e: appear(local, t.at(i) - 0.2, 0.7) }
  })
  const label = (b) => (b.i === cur || n <= 5)
  const drawBody = (b) => b.e > 0 && (
    <g key={b.i} opacity={clamp(b.e * 3)}>
      {b.i === cur && <circle cx={b.x} cy={b.y} r={b.size * 0.8 + Math.sin(local * 5) * 3} fill="none" stroke="#ffd23f" strokeWidth="5"
                                 strokeDasharray="12 10" strokeLinecap="round" transform={`rotate(${local * 60} ${b.x} ${b.y})`} />}
      <g transform={`translate(${b.x} ${b.y}) scale(${back(b.e) * (b.i === cur ? 1.25 : 1)})`}>
        <PicArt pic={pics[b.i]} size={b.size} local={local} id={b.i} />
      </g>
      {b.i === cur && <circle cx={b.x} cy={b.y} r="2" opacity="0" data-point="1" />}
      {label(b) && (
        <text x={b.x} y={b.y + b.size * 0.5 + 24} textAnchor="middle"
              className={`orbit-name ${b.i === cur ? 'on' : ''}`}>{items[b.i]}</text>
      )}
    </g>
  )
  const active = cur >= 0 ? cur : -1
  return (
    <>
      <svg className="vsvg" width={W} height={H} style={{ overflow: 'visible' }}>
        {bodies.map(b => (
          <ellipse key={`o${b.i}`} cx={cx} cy={cy} rx={b.rx} ry={b.ry} className="orbit-path"
                   pathLength="1" strokeDasharray={`${clamp(b.e * 1.4)} 1`} />
        ))}
        {bodies.filter(b => !b.front).map(drawBody)}
        {sunE > 0 && (
          <g transform={`translate(${cx} ${cy}) scale(${back(sunE) * (sunIdx === cur ? 1.12 : 1)})`}>
            <g transform={`rotate(${local * 25})`}>
              {Array.from({ length: 12 }, (_, k) => (
                <path key={k} d="M -9 -84 L 0 -112 L 9 -84 Z" fill="#ffd23f" stroke={INK} strokeWidth="4"
                      strokeLinejoin="round" transform={`rotate(${k * 30})`} />
              ))}
            </g>
            <circle r={sunSize * 0.6 + Math.sin(local * 3) * 4} fill="#ff9f43" opacity="0.45" />
            <PicArt pic={pics[sunIdx] || 'sun'} size={sunSize} local={local} />
            {sunIdx === cur && <circle r="2" opacity="0" data-point="1" />}
          </g>
        )}
        {bodies.filter(b => b.front).map(drawBody)}
      </svg>
      {active >= 0 && (
        <div className="orbit-card" key={active}
             style={{ opacity: clamp(appear(local, t.at(active), 0.3) * 3),
                      transform: `scale(${0.8 + 0.2 * back(appear(local, t.at(active), 0.4))})` }}>
          <b>{items[active]}</b>
          {scene.details && scene.details[active] ? <span>{scene.details[active]}</span> : null}
        </div>
      )}
    </>
  )
}

export function Picture({ scene, local, audioDuration }) {
  const pics = scene.pics || []
  const spacey = pics.filter(p => p.startsWith('planet-') || motionOf(p) === 'space').length
  const orbit = pics.some(p => SUNS.has(p)) && spacey >= 2 && pics.length >= 2
  return (
    <div className="scene-body">
      <SceneHeading text={scene.heading} local={local} />
      <div className="viz pic-viz" style={{ width: W, height: H }}>
        {orbit ? <Orbit scene={scene} local={local} audioDuration={audioDuration} />
               : <Gallery scene={scene} local={local} audioDuration={audioDuration} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ molecules */
const ATOM = {
  H: { c: '#ffffff', r: 9 }, C: { c: '#3d3d3d', r: 13 }, O: { c: '#f0453a', r: 12 }, N: { c: '#4f73e8', r: 12 },
  Cl: { c: '#38c25a', r: 14 }, Na: { c: '#a06be0', r: 14 }, S: { c: '#ffd23f', r: 14 },
}
const hexRing = Array.from({ length: 6 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / 3
  return [k === 0 ? 'O' : 'C', 22 * Math.cos(a), 22 * Math.sin(a)]
})
const MOLECULES = {
  H2: { atoms: [['H', -12, 0], ['H', 12, 0]], bonds: [[0, 1, 1]] },
  O2: { atoms: [['O', -14, 0], ['O', 14, 0]], bonds: [[0, 1, 2]] },
  N2: { atoms: [['N', -14, 0], ['N', 14, 0]], bonds: [[0, 1, 3]] },
  Cl2: { atoms: [['Cl', -15, 0], ['Cl', 15, 0]], bonds: [[0, 1, 1]] },
  H2O: { atoms: [['O', 0, -6], ['H', -20, 12], ['H', 20, 12]], bonds: [[0, 1, 1], [0, 2, 1]] },
  CO2: { atoms: [['O', -28, 0], ['C', 0, 0], ['O', 28, 0]], bonds: [[0, 1, 2], [1, 2, 2]] },
  CH4: { atoms: [['C', 0, 0], ['H', 0, -24], ['H', 24, 0], ['H', 0, 24], ['H', -24, 0]], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]] },
  NH3: { atoms: [['N', 0, -4], ['H', -22, 12], ['H', 22, 12], ['H', 0, -28]], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] },
  HCl: { atoms: [['H', -14, 0], ['Cl', 12, 0]], bonds: [[0, 1, 1]] },
  NaCl: { atoms: [['Na', -15, 0], ['Cl', 15, 0]], bonds: [] },
  C6H12O6: { atoms: hexRing, bonds: hexRing.map((_, k) => [k, (k + 1) % 6, 1]) },
}
export const moleculeFor = (symbol) => MOLECULES[String(symbol || '').replace(/^[0-9]+/, '').trim()] || null

export function Molecule({ symbol, size = 64, local = 0 }) {
  const m = moleculeFor(symbol)
  if (!m) return null
  const sway = Math.sin(local * 2) * 6
  return (
    <svg className="molecule" width={size} height={size} viewBox="-36 -36 72 72">
      <g transform={`rotate(${sway})`}>
        {m.bonds.map(([a, b, order], k) => {
          const [, x1, y1] = m.atoms[a], [, x2, y2] = m.atoms[b]
          const len = Math.hypot(x2 - x1, y2 - y1) || 1
          const nx = -(y2 - y1) / len, ny = (x2 - x1) / len
          return Array.from({ length: order }, (_, o) => {
            const off = (o - (order - 1) / 2) * 5
            return <line key={`${k}-${o}`} x1={x1 + nx * off} y1={y1 + ny * off} x2={x2 + nx * off} y2={y2 + ny * off}
                         stroke={INK} strokeWidth="3" />
          })
        })}
        {m.atoms.map(([el, x, y], k) => (
          <circle key={k} cx={x} cy={y} r={(ATOM[el] || ATOM.C).r} fill={(ATOM[el] || ATOM.C).c} stroke={INK} strokeWidth="2.5" />
        ))}
      </g>
    </svg>
  )
}

export { PALETTE, CREAM }
