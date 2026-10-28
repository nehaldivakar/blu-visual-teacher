// Topic-specific drawings: geometry shapes, coloured equations and bar charts.
// The AI only sends data (which shape, which parts, which symbols); everything is drawn here.
// Like the other scenes, every frame is a pure function of `local` (seconds into the scene).
import { clamp, appear, ease, back, PALETTE, INK, CREAM, W, H, SceneHeading } from './scenes.jsx'
import { Molecule, moleculeFor } from './pictures.jsx'

/* ------------------------------------------------------------------ helpers */
const COLORS = {
  center: INK, radius: '#f26b7f', diameter: '#3fb8c8', circumference: '#ffd23f', area: '#34c27a',
  sides: '#f26b7f', length: '#f26b7f', width: '#3fb8c8', corners: '#ff9f43', diagonal: '#a78bfa',
  perimeter: '#ffd23f', angles: '#ff9f43', base: '#3fb8c8', height: '#a78bfa',
}
const DEFAULT_LABELS = {
  circle: { _shape: 'Circle', center: 'Centre', radius: 'Radius', diameter: 'Diameter', circumference: 'Circumference', area: 'Area' },
  square: { _shape: 'Square', sides: '4 equal sides', corners: '4 right angles', diagonal: 'Diagonal', perimeter: 'Perimeter', area: 'Area' },
  rectangle: { _shape: 'Rectangle', length: 'Length', width: 'Width', corners: '4 right angles', diagonal: 'Diagonal', perimeter: 'Perimeter', area: 'Area' },
  triangle: { _shape: 'Triangle', sides: '3 sides', angles: '3 angles', base: 'Base', height: 'Height', area: 'Area' },
  polygon: { _shape: 'Polygon', sides: 'sides', corners: 'corners', perimeter: 'Perimeter' },
}
const DEFAULT_DEFS = {"circle": {"center": "the middle point of the circle", "radius": "a line from the centre to the edge", "diameter": "a line from edge to edge through the centre", "circumference": "the distance all the way around", "area": "the space inside the circle"}, "square": {"sides": "all four sides are the same length", "corners": "square corners, like the corner of a book", "diagonal": "a line from one corner to the opposite corner", "perimeter": "the distance around the edge", "area": "the space inside the square"}, "rectangle": {"length": "the longer side", "width": "the shorter side", "corners": "square corners, like the corner of a book", "diagonal": "a line from one corner to the opposite corner", "perimeter": "the distance around the edge", "area": "the space inside the rectangle"}, "triangle": {"sides": "three straight sides", "angles": "the three angles always add up to 180°", "base": "the side it sits on", "height": "straight up from the base to the top corner", "area": "the space inside the triangle"}, "polygon": {"sides": "straight edges", "corners": "where two sides meet", "perimeter": "the distance around the edge"}}
const definition = (scene, part) => (scene.labels && scene.labels[`_def_${part}`]) || DEFAULT_DEFS[scene.shape]?.[part] || ''
const POLY_NAMES = { 3: 'Triangle', 4: 'Quadrilateral', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon' }
const label = (scene, key) => (scene.labels && scene.labels[key]) || DEFAULT_LABELS[scene.shape]?.[key] || key

const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
const d = (pts, close = false) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + (close ? ' Z' : '')

// "3 cm" -> {n: 3, unit: "cm"}; used so the maths is done by our code, not guessed by the AI
function parse(v) {
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)\s*([^\s0-9].*)?$/.exec(v || '')
  return m ? { n: parseFloat(m[1]), unit: (m[2] || '').trim() } : null
}
const num = (x) => (Math.round(x * 100) / 100).toLocaleString('en-IN')
const withUnit = (x, u, pow = 1) => `${num(x)}${u ? ` ${u}${pow === 2 ? '²' : ''}` : ''}`

function facts(scene, part, n) {
  const v = scene.values || {}
  const L = label(scene, part)
  const r = parse(v.radius) || (parse(v.diameter) && { n: parse(v.diameter).n / 2, unit: parse(v.diameter).unit })
  const side = parse(v.side)
  const l = parse(v.length), w = parse(v.width), b = parse(v.base), h = parse(v.height)
  switch (`${scene.shape}.${part}`) {
    case 'circle.radius': return `${L} (r)${r ? ` = ${withUnit(r.n, r.unit)}` : ''}`
    case 'circle.diameter': return `${L} (d) = 2 × r${r ? ` = ${withUnit(2 * r.n, r.unit)}` : ''}`
    case 'circle.circumference': return `${L} = 2πr${r ? ` ≈ ${withUnit(2 * Math.PI * r.n, r.unit)}` : ''}`
    case 'circle.area': return `${L} = πr²${r ? ` ≈ ${withUnit(Math.PI * r.n * r.n, r.unit, 2)}` : ''}`
    case 'square.sides': return `${L}${side ? ` = ${withUnit(side.n, side.unit)}` : ''}`
    case 'square.corners': case 'rectangle.corners': return `${L} (90°)`
    case 'square.diagonal': return `${L} = side × √2${side ? ` ≈ ${withUnit(side.n * Math.SQRT2, side.unit)}` : ''}`
    case 'square.perimeter': return `${L} = 4 × side${side ? ` = ${withUnit(4 * side.n, side.unit)}` : ''}`
    case 'square.area': return `${L} = side × side${side ? ` = ${withUnit(side.n * side.n, side.unit, 2)}` : ''}`
    case 'rectangle.length': return `${L} (l)${l ? ` = ${withUnit(l.n, l.unit)}` : ''}`
    case 'rectangle.width': return `${L} (w)${w ? ` = ${withUnit(w.n, w.unit)}` : ''}`
    case 'rectangle.diagonal': return `${L} = √(l² + w²)${l && w ? ` ≈ ${withUnit(Math.hypot(l.n, w.n), l.unit)}` : ''}`
    case 'rectangle.perimeter': return `${L} = 2 × (l + w)${l && w ? ` = ${withUnit(2 * (l.n + w.n), l.unit)}` : ''}`
    case 'rectangle.area': return `${L} = l × w${l && w ? ` = ${withUnit(l.n * w.n, l.unit, 2)}` : ''}`
    case 'triangle.angles': return `${L}: ∠A + ∠B + ∠C = 180°`
    case 'triangle.base': return `${L} (b)${b ? ` = ${withUnit(b.n, b.unit)}` : ''}`
    case 'triangle.height': return `${L} (h)${h ? ` = ${withUnit(h.n, h.unit)}` : ''}`
    case 'triangle.area': return `${L} = ½ × b × h${b && h ? ` = ${withUnit(0.5 * b.n * h.n, b.unit, 2)}` : ''}`
    case 'polygon.sides': case 'polygon.corners': return `${n} ${L}`
    default: return L
  }
}

// a thick line with an ink outline, drawn from start to end as k goes 0 -> 1
function Stroke({ pts, k, color, width = 8, dash = false, close = false }) {
  if (k <= 0) return null
  const path = d(pts, close)
  return (
    <g>
      <path d={path} pathLength="1" fill="none" stroke={INK} strokeWidth={width + 6} strokeLinecap="round"
            strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - k} />
      <path d={path} pathLength="1" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
            strokeLinejoin="round" strokeDasharray="1 1" strokeDashoffset={1 - k} />
      {dash && k >= 1 && <path d={path} fill="none" stroke={INK} strokeWidth="3" strokeDasharray="10 12" opacity="0.5" />}
    </g>
  )
}

// a label pill drawn inside the SVG
function Tag({ x, y, text, color, s = 1 }) {
  if (s <= 0) return null
  const w = Math.max(44, Array.from(text).length * 15 + 26)
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-w / 2} y={-22} width={w} height={44} rx={22} fill={color} stroke={INK} strokeWidth="4" />
      <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" className="tag-text">{text}</text>
    </g>
  )
}

function Badge({ x, y, n, s, color = CREAM }) {
  if (s <= 0) return null
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r="19" fill={color} stroke={INK} strokeWidth="4" />
      <text y="1" textAnchor="middle" dominantBaseline="middle" className="badge-text">{n}</text>
    </g>
  )
}

function RightAngle({ at, a, b, size = 24, s = 1, color = '#ff9f43' }) {
  if (s <= 0) return null
  const ua = [(a[0] - at[0]), (a[1] - at[1])], ub = [(b[0] - at[0]), (b[1] - at[1])]
  const la = Math.hypot(...ua), lb = Math.hypot(...ub)
  const p1 = [at[0] + (ua[0] / la) * size, at[1] + (ua[1] / la) * size]
  const p3 = [at[0] + (ub[0] / lb) * size, at[1] + (ub[1] / lb) * size]
  const p2 = [p1[0] + (ub[0] / lb) * size, p1[1] + (ub[1] / lb) * size]
  return <path d={d([at, p1, p2, p3], true)} fill={color} stroke={INK} strokeWidth="3.5" opacity={s} />
}

// trace around a closed outline, with a dot running along it
function Trace({ pts, k, color, local, active }) {
  const loop = [...pts, pts[0]]
  const lens = loop.slice(1).map((p, i) => Math.hypot(p[0] - loop[i][0], p[1] - loop[i][1]))
  const total = lens.reduce((a, b) => a + b, 0)
  let target = (active ? (local * 0.35) % 1 : 1) * total, dot = loop[0]
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i]) { dot = lerp(loop[i], loop[i + 1], target / lens[i]); break }
    target -= lens[i]
  }
  return (
    <g>
      <Stroke pts={loop} k={k} color={color} width={10} />
      {k >= 1 && <circle cx={dot[0]} cy={dot[1]} r="11" fill="#fff" stroke={INK} strokeWidth="4" />}
    </g>
  )
}

/* ------------------------------------------------------------------ shapes */
const CX = 320, CY = 200

function CircleShape({ P, on, local }) {
  const R = 160
  const ring = Array.from({ length: 73 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2 - Math.PI / 2
    return [CX + R * Math.cos(a), CY + R * Math.sin(a)]
  })
  const areaK = P('area')
  const sweep = Math.PI * 2 * areaK
  const wedge = areaK >= 1
    ? `M ${CX - R} ${CY} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0`
    : `M ${CX} ${CY} L ${CX} ${CY - R} A ${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${CX + R * Math.sin(sweep)} ${CY - R * Math.cos(sweep)} Z`
  const rAngle = -0.6
  const rEnd = [CX + R * Math.cos(rAngle), CY + R * Math.sin(rAngle)]
  const rk = P('radius'), dk = P('diameter')
  return (
    <>
      {areaK > 0 && <path d={wedge} fill={COLORS.area} opacity="0.75" />}
      {P('circumference') > 0 && <Trace pts={ring.slice(0, 72)} k={P('circumference')} color={COLORS.circumference} local={local} active={on('circumference')} />}
      <Stroke pts={[[CX - R, CY], [CX + R, CY]]} k={dk} color={COLORS.diameter} />
      {dk > 0 && <Tag x={CX - 70} y={CY + 34} text="d" color={COLORS.diameter} s={back(dk)} />}
      <Stroke pts={[[CX, CY], lerp([CX, CY], rEnd, 1)]} k={rk} color={COLORS.radius} />
      {rk > 0 && <Tag x={(CX + rEnd[0]) / 2 + 8} y={(CY + rEnd[1]) / 2 - 34} text="r" color={COLORS.radius} s={back(rk)} />}
      {(P('center') > 0 || rk > 0 || dk > 0) && (
        <g transform={`translate(${CX} ${CY}) scale(${back(Math.max(P('center'), rk, dk))})`}>
          <circle r="11" fill={INK} /><circle r="5" fill="#fff" />
        </g>
      )}
      {P('center') > 0 && <text x={CX - 18} y={CY - 18} className="pt-label" opacity={P('center')}>O</text>}
    </>
  )
}

function QuadShape({ shape, P, on, local }) {
  const [w, h] = shape === 'square' ? [290, 290] : [430, 250]
  const A = [CX - w / 2, CY - h / 2], B = [CX + w / 2, CY - h / 2], C = [CX + w / 2, CY + h / 2], D = [CX - w / 2, CY + h / 2]
  const sides = [[A, B], [B, C], [C, D], [D, A]]
  const out = [[0, -38], [42, 0], [0, 38], [-42, 0]]
  const sk = P('sides')
  const [cols, rows] = shape === 'square' ? [5, 5] : [8, 5]
  const cells = cols * rows
  const shown = Math.floor(P('area') * cells)
  return (
    <>
      {Array.from({ length: shown }, (_, k) => {
        const c = k % cols, r = Math.floor(k / cols)
        return <rect key={k} x={A[0] + (c * w) / cols} y={A[1] + (r * h) / rows} width={w / cols} height={h / rows}
                     fill={COLORS.area} stroke={INK} strokeOpacity="0.35" strokeWidth="2" opacity="0.8" />
      })}
      {/* sides one by one (square), or length and width (rectangle) */}
      {sides.map(([p, q], i) => {
        const k = shape === 'square' ? clamp(sk * 4 - i) : (i % 2 === 0 ? P('length') : P('width'))
        const color = shape === 'square' ? COLORS.sides : (i % 2 === 0 ? COLORS.length : COLORS.width)
        const mid = lerp(p, q, 0.5)
        const ticks = shape === 'square' ? 1 : (i % 2 === 0 ? 1 : 2)
        return (
          <g key={i}>
            <Stroke pts={[p, q]} k={k} color={color} />
            {k >= 1 && Array.from({ length: ticks }, (_, t) => {
              const horiz = i % 2 === 0, off = (t - (ticks - 1) / 2) * 12
              return <line key={t} x1={mid[0] + (horiz ? off : -14)} y1={mid[1] + (horiz ? -14 : off)}
                           x2={mid[0] + (horiz ? off : 14)} y2={mid[1] + (horiz ? 14 : off)} stroke={INK} strokeWidth="4" />
            })}
            {shape === 'square' && k > 0 && <Badge x={mid[0] + out[i][0]} y={mid[1] + out[i][1]} n={i + 1} s={back(k)} color={COLORS.sides} />}
          </g>
        )
      })}
      {shape === 'rectangle' && P('length') > 0 && <Tag x={CX} y={A[1] - 38} text="l" color={COLORS.length} s={back(P('length'))} />}
      {shape === 'rectangle' && P('width') > 0 && <Tag x={A[0] - 46} y={CY} text="w" color={COLORS.width} s={back(P('width'))} />}
      {[[A, B, D], [B, C, A], [C, D, B], [D, A, C]].map(([at, a, b], i) =>
        <RightAngle key={i} at={at} a={a} b={b} s={back(clamp(P('corners') * 4 - i))} />)}
      <Stroke pts={[A, C]} k={P('diagonal')} color={COLORS.diagonal} width={6} dash />
      {P('perimeter') > 0 && <Trace pts={[A, B, C, D]} k={P('perimeter')} color={COLORS.perimeter} local={local} active={on('perimeter')} />}
    </>
  )
}

function TriangleShape({ P, on, local }) {
  const A = [CX, 30], B = [CX - 225, 360], C = [CX + 225, 360]
  const sides = [[A, B], [B, C], [C, A]]
  const sk = P('sides'), ak = P('angles')
  const Hft = [CX, 360]
  const wedge = (V, p1, p2, r = 46) => {
    const a1 = Math.atan2(p1[1] - V[1], p1[0] - V[0]), a2 = Math.atan2(p2[1] - V[1], p2[0] - V[0])
    let dd = a2 - a1
    while (dd > Math.PI) dd -= 2 * Math.PI
    while (dd < -Math.PI) dd += 2 * Math.PI
    const s1 = [V[0] + r * Math.cos(a1), V[1] + r * Math.sin(a1)], s2 = [V[0] + r * Math.cos(a2), V[1] + r * Math.sin(a2)]
    return `M ${V[0]} ${V[1]} L ${s1[0]} ${s1[1]} A ${r} ${r} 0 0 ${dd > 0 ? 1 : 0} ${s2[0]} ${s2[1]} Z`
  }
  const angleColors = ['#ff9f43', '#3fb8c8', '#f26b7f']
  return (
    <>
      {P('area') > 0 && <path d={d([A, B, C], true)} fill={COLORS.area} opacity={0.75 * P('area')} />}
      {[[A, B, C], [B, C, A], [C, A, B]].map(([V, p, q], i) => {
        const k = clamp(ak * 3 - i)
        return k > 0 && <path key={i} d={wedge(V, p, q)} fill={angleColors[i]} stroke={INK} strokeWidth="3.5" opacity={k} />
      })}
      {sides.map(([p, q], i) => {
        const k = clamp(sk * 3 - i), mid = lerp(p, q, 0.5)
        const off = [[-44, -6], [0, 42], [44, -6]][i]
        return (
          <g key={i}>
            <Stroke pts={[p, q]} k={k} color={COLORS.sides} />
            {k > 0 && <Badge x={mid[0] + off[0]} y={mid[1] + off[1]} n={i + 1} s={back(k)} color={COLORS.sides} />}
          </g>
        )
      })}
      <Stroke pts={[B, C]} k={P('base')} color={COLORS.base} width={10} />
      {P('base') > 0 && <Tag x={CX + 120} y={398} text="b" color={COLORS.base} s={back(P('base'))} />}
      <Stroke pts={[A, Hft]} k={P('height')} color={COLORS.height} width={6} dash />
      {P('height') >= 1 && <RightAngle at={Hft} a={A} b={C} size={22} color={COLORS.height} />}
      {P('height') > 0 && <Tag x={CX + 34} y={200} text="h" color={COLORS.height} s={back(P('height'))} />}
      {ak >= 1 && <Tag x={CX} y={250} text="180°" color="#ffd23f" s={back(clamp(ak * 3 - 2.4))} />}
      {['A', 'B', 'C'].map((n, i) => {
        const V = [A, B, C][i], off = [[0, -12], [-30, 26], [30, 26]][i]
        return (sk > 0 || ak > 0) && <text key={n} x={V[0] + off[0]} y={V[1] + off[1]} className="pt-label" textAnchor="middle">{n}</text>
      })}
    </>
  )
}

function PolygonShape({ n, P, on, local }) {
  const R = 170
  const pts = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [CX + R * Math.cos(a), CY + 4 + R * Math.sin(a)]
  })
  const sk = P('sides'), ck = P('corners')
  return (
    <>
      {pts.map((p, i) => {
        const q = pts[(i + 1) % n], k = clamp(sk * n - i), mid = lerp(p, q, 0.5)
        const out = lerp([CX, CY], mid, 1.28)
        return (
          <g key={i}>
            <Stroke pts={[p, q]} k={k} color={COLORS.sides} />
            {k > 0 && <Badge x={out[0]} y={out[1]} n={i + 1} s={back(k)} color={COLORS.sides} />}
          </g>
        )
      })}
      {pts.map((p, i) => {
        const k = back(clamp(ck * n - i))
        return k > 0 && <circle key={i} cx={p[0]} cy={p[1]} r={13 * k} fill={COLORS.corners} stroke={INK} strokeWidth="4" />
      })}
      {P('perimeter') > 0 && <Trace pts={pts} k={P('perimeter')} color={COLORS.perimeter} local={local} active={on('perimeter')} />}
    </>
  )
}

// where the teacher's stick points for each part of each shape (drawing coordinates)
function anchorOf(shape, part, n) {
  const R = 160
  if (shape === 'circle') return ({ center: [CX, CY], radius: [CX + 66, CY - 45], diameter: [CX - 100, CY],
    circumference: [CX - 113, CY + 113], area: [CX - 40, CY + 70] })[part]
  if (shape === 'square' || shape === 'rectangle') {
    const [w, h] = shape === 'square' ? [290, 290] : [430, 250]
    return ({ sides: [CX, CY - h / 2], length: [CX, CY - h / 2], width: [CX - w / 2, CY], corners: [CX - w / 2 + 12, CY - h / 2 + 12],
      diagonal: [CX - w / 4, CY - h / 4], perimeter: [CX - w / 2, CY + h / 2], area: [CX, CY + 30] })[part]
  }
  if (shape === 'triangle') return ({ sides: [CX - 112, 195], angles: [CX - 190, 335], base: [CX, 360],
    height: [CX, 200], area: [CX - 40, 290] })[part]
  const a = -Math.PI / 2, b = a + (2 * Math.PI) / n
  const p = [CX + 170 * Math.cos(a), CY + 4 + 170 * Math.sin(a)], q = [CX + 170 * Math.cos(b), CY + 4 + 170 * Math.sin(b)]
  return ({ sides: lerp(p, q, 0.5), corners: p, perimeter: q })[part] || [CX, CY - R / 2]
}

export function Shape({ scene, local, audioDuration }) {
  const parts = scene.parts || []
  const n = parts.length
  const outlineStart = 0.4, outlineEnd = 1.5
  const step = Math.max(0.9, (audioDuration - outlineEnd - 0.2) / Math.max(1, n))
  const at = (i) => outlineEnd + i * step
  const cur = local < at(0) ? -1 : Math.min(n - 1, Math.floor((local - at(0)) / step))
  const idx = Object.fromEntries(parts.map((p, i) => [p, i]))
  const P = (p) => (p in idx ? clamp((local - at(idx[p])) / Math.min(step * 0.85, 1.6)) : 0)
  const on = (p) => cur === idx[p]
  const draw = ease((local - outlineStart) / (outlineEnd - outlineStart))
  const sides = scene.sides || 6

  // the outline of the shape, drawn first
  let outline
  if (scene.shape === 'circle') {
    outline = Array.from({ length: 73 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2 - Math.PI / 2
      return [CX + 160 * Math.cos(a), CY + 160 * Math.sin(a)]
    })
  } else if (scene.shape === 'square' || scene.shape === 'rectangle') {
    const [w, h] = scene.shape === 'square' ? [290, 290] : [430, 250]
    outline = [[CX - w / 2, CY - h / 2], [CX + w / 2, CY - h / 2], [CX + w / 2, CY + h / 2], [CX - w / 2, CY + h / 2], [CX - w / 2, CY - h / 2]]
  } else if (scene.shape === 'triangle') {
    outline = [[CX, 30], [CX - 225, 360], [CX + 225, 360], [CX, 30]]
  } else {
    outline = Array.from({ length: sides + 1 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides
      return [CX + 170 * Math.cos(a), CY + 4 + 170 * Math.sin(a)]
    })
  }
  const Body = { circle: CircleShape, square: QuadShape, rectangle: QuadShape, triangle: TriangleShape, polygon: PolygonShape }[scene.shape] || PolygonShape

  return (
    <div className="scene-body">
      <SceneHeading text={scene.heading} local={local} />
      <div className="viz shape-viz" style={{ width: W, height: H }}>
        <svg className="vsvg" width={W} height={H}>
          <path d={d(outline)} fill={CREAM} opacity={draw} />
          <Body shape={scene.shape} n={sides} P={P} on={on} local={local} />
          {cur >= 0 && anchorOf(scene.shape, parts[cur], sides) && (
            <circle cx={anchorOf(scene.shape, parts[cur], sides)[0]} cy={anchorOf(scene.shape, parts[cur], sides)[1]}
                    r="2" opacity="0" data-point="1" />
          )}
          <path d={d(outline)} pathLength="1" fill="none" stroke={INK} strokeWidth="7" strokeLinejoin="round"
                strokeDasharray="1 1" strokeDashoffset={1 - draw} />
        </svg>
        <div className="facts">
          <div className="facts-title" style={{ opacity: clamp(draw * 2), transform: `scale(${0.7 + 0.3 * back(draw)})` }}>
            {scene.shape !== 'polygon' ? label(scene, '_shape')
              : scene.labels ? `${sides}-${label(scene, '_shape')}` : (POLY_NAMES[sides] || `${sides}-sided polygon`)}
          </div>
          {parts.map((p, i) => {
            const o = appear(local, at(i) - 0.1, 0.45)
            return (
              <div key={p} className={`fact ${i === cur ? 'on' : ''}`}
                   style={{ opacity: clamp(o * 3), transform: `translateX(${(1 - back(o)) * 40}px)` }}>
                <span className="fact-dot" style={{ background: COLORS[p] || PALETTE[i % PALETTE.length] }} />
                <span className="fact-text">
                  <span>{facts(scene, p, sides)}</span>
                  {definition(scene, p) && <span className="fact-def">{definition(scene, p)}</span>}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ equations */
const TERM_COLORS = ['#f26b7f', '#3fb8c8', '#ffd23f', '#34c27a', '#ff9f43', '#a78bfa']
const OPS = ['<=>', '<->', '->', '=>', '→', '⇌', '≈', '=', '+', '−', '-', '×', '*', '÷', '/', '(', ')', '·']
const OP_SHOW = { '->': '→', '=>': '→', '<->': '⇌', '<=>': '⇌', '*': '×', '-': '−' }

function readSup(s, j) {           // reads what follows "^": 2, -1, (n+1), {n+1}
  if (s[j] === '(' || s[j] === '{') {
    const close = s[j] === '(' ? ')' : '}'
    const end = s.indexOf(close, j)
    return end < 0 ? [s.slice(j + 1), s.length] : [s.slice(j + 1, end), end + 1]
  }
  const m = /^[-+]?[0-9A-Za-z]+/.exec(s.slice(j))
  return m ? [m[0], j + m[0].length] : ['', j]
}

export function tokenize(eq, symbols) {
  const syms = [...new Set(symbols)].filter(Boolean).sort((a, b) => b.length - a.length)
  const toks = []
  let i = 0
  while (i < eq.length) {
    const ch = eq[i]
    if (/\s/.test(ch)) { i++; continue }
    const sym = syms.find(s => eq.startsWith(s, i))
    if (sym) {
      let j = i + sym.length, sup = ''
      if (eq[j] === '^') { [sup, j] = readSup(eq, j + 1) }
      toks.push({ kind: 'term', sym, text: sym, sup })
      i = j
      continue
    }
    const op = OPS.find(o => eq.startsWith(o, i))
    if (op) { toks.push({ kind: 'op', text: OP_SHOW[op] || op }); i += op.length; continue }
    if (ch === '^') {
      const [sup, j] = readSup(eq, i + 1)
      if (toks.length) toks[toks.length - 1].sup = (toks[toks.length - 1].sup || '') + sup
      i = j
      continue
    }
    const m = /^[0-9]+(?:\.[0-9]+)?/.exec(eq.slice(i)) || /^[^\s=+\-−×*÷/()^→⇌≈·]+/.exec(eq.slice(i))
    const text = m ? m[0] : ch
    toks.push({ kind: /^[0-9.]+$/.test(text) ? 'num' : 'var', text })
    i += text.length
  }
  return toks
}

// chemistry and maths formatting: H2O -> H₂O, c^2 -> c²
export function Rich({ text, sup }) {
  const out = []
  let buf = '', i = 0
  while (i < text.length) {
    const ch = text[i]
    if (/[0-9]/.test(ch) && i > 0 && /[A-Za-z)\]]/.test(text[i - 1])) {
      if (buf) { out.push(buf); buf = '' }
      let j = i
      while (j < text.length && /[0-9]/.test(text[j])) j++
      out.push(<sub key={i}>{text.slice(i, j)}</sub>)
      i = j
      continue
    }
    buf += ch
    i++
  }
  if (buf) out.push(buf)
  if (sup) out.push(<sup key="s">{sup}</sup>)
  return out
}

export function Equation({ scene, local, audioDuration }) {
  const terms = scene.terms || []
  const colorOf = Object.fromEntries(terms.map((t, i) => [t.symbol, TERM_COLORS[i % TERM_COLORS.length]]))
  const toks = tokenize(scene.equation || '', terms.map(t => t.symbol))
  const typeEnd = 0.5 + toks.length * 0.12
  const start = typeEnd + 0.2
  const step = Math.max(0.8, (audioDuration - start) / Math.max(1, terms.length))
  const cur = local < start ? -1 : Math.min(terms.length - 1, Math.floor((local - start) / step))
  const activeSym = cur >= 0 ? terms[cur].symbol : null
  const chars = toks.reduce((a, t) => a + t.text.length + (t.sup || '').length, 0)
  const size = chars > 26 ? 'tiny' : chars > 14 ? 'small' : ''
  const board = back(appear(local, 0.15, 0.5))
  return (
    <div className="scene-body">
      <SceneHeading text={scene.heading} local={local} />
      <div className="eq-board" style={{ transform: `scale(${0.6 + 0.4 * board})`, opacity: clamp(board * 2) }}>
        <div className={`eq ${size}`}>
          {toks.map((tk, k) => {
            const o = appear(local, 0.5 + k * 0.12, 0.35)
            const color = tk.kind === 'term' ? colorOf[tk.sym] : null
            const active = tk.kind === 'term' && tk.sym === activeSym
            return (
              <span key={k} className={`eq-tok ${tk.kind} ${active ? 'on' : ''}`}
                    style={{ opacity: clamp(o * 2), color: color || undefined, '--c': color || 'transparent',
                             transform: `translateY(${(1 - back(o)) * -28}px) scale(${active ? 1.14 : 1})` }}>
                <Rich text={tk.text} sup={tk.sup} />
              </span>
            )
          })}
        </div>
      </div>
      <div className="eq-terms">
        {terms.map((t, i) => {
          const o = appear(local, start + i * step - 0.1, 0.45)
          return (
            <div key={t.symbol} className={`eq-card ${i === cur ? 'on' : ''}`}
                 style={{ opacity: clamp(o * 3), transform: `translateY(${(1 - back(o)) * 30}px)`, '--c': TERM_COLORS[i % TERM_COLORS.length] }}>
              <span className="eq-sym"><span><Rich text={t.symbol} /></span></span>
              {moleculeFor(t.symbol) && <Molecule symbol={t.symbol} size={58} local={local} />}
              <span className="eq-mean">{t.meaning}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ charts: bar, line, pie */
function BarChart({ items, values, local, step, cur, unit }) {
  const n = items.length
  const max = Math.max(...values, 1)
  const left = 70, right = W - 30, top = 40, base = 330
  const slot = (right - left) / n
  const bw = Math.min(120, slot * 0.6)
  const axis = ease((local - 0.2) / 0.5)
  return (
    <svg className="vsvg" width={W} height={H}>
      {[0.25, 0.5, 0.75, 1].map(g => (
        <line key={g} x1={left} x2={left + (right - left) * axis} y1={base - (base - top) * g} y2={base - (base - top) * g} className="grid-line" />
      ))}
      <line x1={left} x2={left + (right - left) * axis} y1={base} y2={base} stroke={INK} strokeWidth="6" strokeLinecap="round" />
      {unit && <text x={left} y={top - 14} className="axis-unit" opacity={axis}>{unit}</text>}
      {items.map((label, i) => {
        const g = back(appear(local, 0.8 + i * step, 0.7))
        const h = Math.max(0, (values[i] / max) * (base - top) * g)
        const x = left + slot * i + (slot - bw) / 2
        const color = i === cur ? '#ffd23f' : PALETTE[i % PALETTE.length]
        return (
          <g key={i} opacity={clamp(g * 4)}>
            <rect x={x} y={base - h} width={bw} height={h} rx="8" fill={color} stroke={INK} strokeWidth="5" />
            <text x={x + bw / 2} y={base - h - 14} textAnchor="middle" className="bar-value">{num(values[i] * clamp(g))}</text>
            <text x={x + bw / 2} y={base + 36} textAnchor="middle" className="bar-label">{label}</text>
            {i === cur && <circle cx={x + 10} cy={base - h / 2} r="2" opacity="0" data-point="1" />}
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ items, values, local, step, cur, unit }) {
  const n = items.length
  const max = Math.max(...values, 1), min = Math.min(...values, 0)
  const left = 90, right = W - 60, top = 40, base = 330
  const xOf = (i) => (n === 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1))
  const yOf = (v) => base - ((v - min) / (max - min || 1)) * (base - top)
  const axis = ease((local - 0.2) / 0.5)
  // the line is drawn up to the point being explained
  const reach = clamp((local - 0.8) / (step * Math.max(1, n - 1) + 0.01)) * (n - 1)
  const pts = []
  for (let i = 0; i < n; i++) {
    if (i <= reach) pts.push([xOf(i), yOf(values[i])])
    else if (i - 1 < reach) {
      const k = reach - (i - 1)
      pts.push([xOf(i - 1) + (xOf(i) - xOf(i - 1)) * k, yOf(values[i - 1]) + (yOf(values[i]) - yOf(values[i - 1])) * k])
    }
  }
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = pts.length > 1 ? `${path} L ${pts[pts.length - 1][0]} ${base} L ${pts[0][0]} ${base} Z` : ''
  return (
    <svg className="vsvg" width={W} height={H}>
      {[0.25, 0.5, 0.75, 1].map(g => (
        <line key={g} x1={left} x2={left + (right - left) * axis} y1={base - (base - top) * g} y2={base - (base - top) * g} className="grid-line" />
      ))}
      <line x1={left} x2={left + (right - left) * axis} y1={base} y2={base} stroke={INK} strokeWidth="6" strokeLinecap="round" />
      {unit && <text x={left} y={top - 14} className="axis-unit" opacity={axis}>{unit}</text>}
      {area && <path d={area} fill="#3fb8c8" opacity="0.35" />}
      {pts.length > 1 && <path d={path} fill="none" stroke={INK} strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" />}
      {pts.length > 1 && <path d={path} fill="none" stroke="#ffd23f" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />}
      {items.map((label, i) => {
        const o = back(appear(local, 0.8 + i * step, 0.45))
        if (o <= 0) return null
        const x = xOf(i), y = yOf(values[i])
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={(i === cur ? 14 : 10) * o} fill={i === cur ? '#f26b7f' : CREAM} stroke={INK} strokeWidth="4" />
            <text x={x} y={y - 24} textAnchor="middle" className="bar-value" opacity={clamp(o)}>{num(values[i])}</text>
            <text x={x} y={base + 36} textAnchor="middle" className="bar-label" opacity={clamp(o)}>{label}</text>
            {i === cur && <circle cx={x} cy={y} r="2" opacity="0" data-point="1" />}
          </g>
        )
      })}
    </svg>
  )
}

function PieChart({ items, values, local, step, cur, unit }) {
  const total = values.reduce((a, b) => a + b, 0) || 1
  const cx = 300, cy = 200, R = 170
  let acc = 0
  const slices = values.map((v, i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2
    acc += v
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2
    return { i, a0, a1, mid: (a0 + a1) / 2, share: v / total }
  })
  return (
    <>
      <svg className="vsvg" width={W} height={H}>
        <circle cx={cx + 10} cy={cy + 12} r={R} fill={INK} opacity={clamp(local * 3)} />
        {slices.map(sl => {
          const g = ease(appear(local, 0.8 + sl.i * step, 0.8))
          if (g <= 0) return null
          const a1 = sl.a0 + (sl.a1 - sl.a0) * g
          const out = sl.i === cur ? 18 : 0
          const ox = Math.cos(sl.mid) * out, oy = Math.sin(sl.mid) * out
          const large = a1 - sl.a0 > Math.PI ? 1 : 0
          const p0 = [cx + R * Math.cos(sl.a0), cy + R * Math.sin(sl.a0)], p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)]
          const dd = sl.share >= 0.999 && g >= 1
            ? `M ${cx - R} ${cy} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0`
            : `M ${cx} ${cy} L ${p0[0]} ${p0[1]} A ${R} ${R} 0 ${large} 1 ${p1[0]} ${p1[1]} Z`
          const lx = cx + R * 0.62 * Math.cos(sl.mid), ly = cy + R * 0.62 * Math.sin(sl.mid)
          return (
            <g key={sl.i} transform={`translate(${ox} ${oy})`}>
              <path d={dd} fill={sl.i === cur ? '#ffd23f' : PALETTE[sl.i % PALETTE.length]} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
              {g >= 1 && sl.share > 0.06 && (
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="pie-pct">{Math.round(sl.share * 100)}%</text>
              )}
              {sl.i === cur && <circle cx={lx} cy={ly} r="2" opacity="0" data-point="1" />}
            </g>
          )
        })}
      </svg>
      <div className="pie-legend">
        {items.map((label, i) => {
          const o = appear(local, 0.8 + i * step, 0.45)
          return (
            <div key={i} className={`fact ${i === cur ? 'on' : ''}`}
                 style={{ opacity: clamp(o * 3), transform: `translateX(${(1 - back(o)) * 40}px)` }}>
              <span className="fact-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span>{label}: {num(values[i])}{unit ? (unit === '%' ? '%' : ` ${unit}`) : ''}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

export function Chart({ scene, local, audioDuration }) {
  const items = scene.items || [], values = scene.numbers || []
  const n = items.length
  const step = Math.max(0.6, (audioDuration - 0.8) / Math.max(1, n))
  const cur = local < 0.8 ? -1 : Math.min(n - 1, Math.floor((local - 0.8) / step))
  const Kind = { line: LineChart, pie: PieChart }[scene.kind] || BarChart
  return (
    <div className="scene-body">
      <SceneHeading text={scene.heading} local={local} />
      <div className="viz" style={{ width: W, height: H }}>
        <Kind items={items} values={values} local={local} step={step} cur={cur} unit={scene.unit} />
      </div>
    </div>
  )
}
