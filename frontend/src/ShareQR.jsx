import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ShareQR({ lessonId, onClose }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    const port = window.location.port || '5173'
    fetch(`/api/share/${lessonId}?port=${port}`)
      .then(r => r.json()).then(setData)
      .catch(() => setErr('Cannot reach the backend.'))
  }, [lessonId])

  // rendered at the top of the page so nothing can cover it
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal glass" onClick={e => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        <h3>📱 Watch on your phone</h3>
        {!data && !err && <p className="muted">Finding this laptop on the network…</p>}
        {err && <p className="error">{err}</p>}
        {data && data.urls.length === 0 && (
          <p className="muted">This laptop is not on a local network. Turn on a Wi-Fi network or phone
            hotspot (no internet needed), then start the website with <code>npm run dev -- --host</code>.</p>
        )}
        {data && data.urls.length > 0 && (
          <>
            {data.svg
              ? <div className="qr" dangerouslySetInnerHTML={{ __html: data.svg }} />
              : <p className="muted">Install the QR package to show a code: <code>pip install qrcode</code></p>}
            <p className="muted small">Scan with a phone on the same Wi-Fi or hotspot. Works without internet.</p>
            <div className="share-urls">{data.urls.map(u => <code key={u}>{u}</code>)}</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
