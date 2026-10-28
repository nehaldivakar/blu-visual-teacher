import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Stage, { findSceneIndex } from './Stage.jsx'
import Notes from './Notes.jsx'
import EditPanel from './EditPanel.jsx'
import ShareQR from './ShareQR.jsx'
import { preloadPics } from './pictures.jsx'

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const clamp01 = (x) => Math.min(1, Math.max(0, x))

// Phones (or ?lite=1) play the finished MP4 instead of drawing every frame live.
// The video already contains the visuals, voice and captions, so it is light and smooth.
const LITE = typeof window !== 'undefined' && (
  new URLSearchParams(window.location.search).get('lite') === '1' ||
  window.matchMedia('(max-width: 760px)').matches
)

export default function Player({ lessonId, exportMode = false, version = 0, onLoaded,
                                 panel = null, setPanel = () => {}, editIndex = 0,
                                 setEditIndex = () => {}, onEdited = () => {} }) {
  const [lesson, setLesson] = useState(null)
  const [timing, setTiming] = useState(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(null)
  const [dual, setDual] = useState(true)
  const [quizChoice, setQuizChoice] = useState(null)   // null = not answered, -1 = skipped
  const [sharing, setSharing] = useState(false)
  const mediaRef = useRef(null)          // <audio> on laptops, <video> in lite mode
  const v = `v=${version}`

  useEffect(() => {
    Promise.all([
      fetch(`/files/${lessonId}/lesson.json?${v}`).then(r => r.json()),
      fetch(`/files/${lessonId}/timing.json?${v}`).then(r => r.json()),
    ]).then(async ([l, tm]) => {
      setLesson(l)
      setTiming(tm)
      if (onLoaded) onLoaded(l)
      await Promise.all([document.fonts.ready, preloadPics(l)])
      window.__seek = (time) => flushSync(() => setT(time))
      window.__total = tm.total
      window.__ready = true
    }).catch(e => setError(String(e)))
  }, [lessonId, version])

  // while playing, the media clock decides what is on screen
  useEffect(() => {
    if (!playing) return
    let raf
    const tick = () => {
      if (mediaRef.current) setT(mediaRef.current.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // interactive quiz: pause when it is time to answer, until the learner picks an option
  useEffect(() => {
    if (LITE || exportMode || !playing || !lesson || !timing || quizChoice != null) return
    const i = findSceneIndex(timing, t)
    const st = timing.scenes[i]
    if (lesson.scenes[i].type !== 'quiz' || st.reveal_at == null) return
    const askAt = st.start + st.reveal_at - (st.think || 3)
    if (t >= askAt + 0.4 && t < st.start + st.reveal_at) {
      mediaRef.current.pause()
      setPlaying(false)
    }
  }, [t, playing, quizChoice, lesson, timing])

  if (error) return <div className="msg">Could not load lesson: {error}</div>
  if (!lesson || !timing) return <div className="msg">Loading…</div>

  if (exportMode) {
    return <div className="export-root"><Stage lesson={lesson} timing={timing} t={t} fit={false} /></div>
  }

  const index = findSceneIndex(timing, t)
  const seekTo = (time) => {
    const x = Math.min(Math.max(0, time), timing.total - 0.05)
    mediaRef.current.currentTime = x
    setT(x)
  }
  const play = () => {
    // pressing play while the quiz waits counts as skipping the question
    const st = timing.scenes[index]
    if (lesson.scenes[index].type === 'quiz' && quizChoice == null && st.reveal_at != null &&
        t >= st.start + st.reveal_at - (st.think || 3)) setQuizChoice(-1)
    mediaRef.current.play()
    setPlaying(true)
  }
  const pause = () => { mediaRef.current.pause(); setPlaying(false) }
  const next = () => {
    const nxt = timing.scenes[index + 1]
    if (nxt) seekTo(nxt.start + 0.01)
  }
  const replay = () => { setQuizChoice(null); seekTo(0); play() }
  const clickTimeline = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    seekTo(((e.clientX - r.left) / r.width) * timing.total)
  }
  const onEnded = () => { setPlaying(false); setT(timing.total) }
  const chooseAnswer = (i) => {
    const st = timing.scenes[index]
    setQuizChoice(i)
    seekTo(st.start + st.reveal_at)
    mediaRef.current.play()
    setPlaying(true)
  }
  const toggle = (name) => setPanel(panel === name ? null : name)
  const hasEnglish = lesson.language !== 'en' && lesson.scenes.some(s => s.narration_en)

  return (
    <>
      <div className={`player ${LITE ? 'lite' : ''}`}>
        {LITE ? (
          <video ref={mediaRef} className="lite-video" src={`/files/${lessonId}/lesson.mp4?${v}`}
                 preload="auto" playsInline onEnded={onEnded}
                 onClick={() => (playing ? pause() : play())} />
        ) : (
          <>
            <Stage lesson={lesson} timing={timing} t={t} dual={dual}
                   quiz={{ chosen: quizChoice >= 0 ? quizChoice : null,
                           onChoose: quizChoice === -1 ? null : chooseAnswer }} />
            <audio ref={mediaRef} src={`/files/${lessonId}/narration.wav?${v}`} preload="auto" onEnded={onEnded} />
          </>
        )}

        <div className="timeline" onClick={clickTimeline} title="Click to jump">
          {timing.scenes.map((s, i) => (
            <div key={i} className={`seg ${i === index ? 'current' : ''}`} style={{ flex: s.duration }}>
              <div className="seg-fill" style={{ width: `${clamp01((t - s.start) / s.duration) * 100}%` }} />
            </div>
          ))}
        </div>

        <div className="player-bar">
          <button className="play" onClick={playing ? pause : play} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button onClick={replay}>↺ Replay</button>
          <button onClick={next} disabled={index >= timing.scenes.length - 1}>Next scene ⏭</button>
          <span className="time">{fmt(Math.min(t, timing.total))} / {fmt(timing.total)}</span>
          <span className="now">{lesson.scenes[index].heading}</span>
          {lesson.source && (
            <span className="source-badge" title={`Explained from ${lesson.source.name}`}>
              📄 {lesson.source.name} · p. {lesson.source.pages.join(', ')}
            </span>
          )}
          <div className="spacer" />
          {LITE && <span className="lite-badge">Phone mode</span>}
          {hasEnglish && !LITE && (
            <button className={dual ? 'on' : ''} onClick={() => setDual(d => !d)} title="Show the English line under the captions">EN captions</button>
          )}
          <button className={panel === 'notes' ? 'on' : ''} onClick={() => toggle('notes')}>📝 Notes</button>
          {!LITE && <button className={panel === 'edit' ? 'on' : ''} onClick={() => toggle('edit')}>✏️ Edit</button>}
          <button onClick={() => setSharing(true)}>📱 Phone</button>
          <a className="btn" href={`/files/${lessonId}/lesson.mp4?${v}`} download={`${lessonId}.mp4`}>⬇ MP4</a>
          <a className="btn" href={`/files/${lessonId}/captions.srt?${v}`} download={`${lessonId}.srt`}>⬇ Captions</a>
        </div>
      </div>

      {panel === 'notes' && (
        <Notes lesson={lesson} timing={timing} lessonId={lessonId} t={t} onSeek={seekTo} />
      )}
      {panel === 'edit' && !LITE && (
        <EditPanel lesson={lesson} lessonId={lessonId}
                   index={Math.min(editIndex, lesson.scenes.length - 1)}
                   onIndex={(i) => { setEditIndex(i); seekTo(timing.scenes[i].start + 0.01) }}
                   onDone={onEdited} />
      )}
      {sharing && <ShareQR lessonId={lessonId} onClose={() => setSharing(false)} />}
    </>
  )
}
