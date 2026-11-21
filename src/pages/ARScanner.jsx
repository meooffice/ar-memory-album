import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Volume2, VolumeX, Play, X } from 'lucide-react'
import { supabase, mediaUrl } from '../lib/supabase.js'
import { useT } from '../lib/i18n.jsx'

// Loaded at runtime through the importmap in index.html, so MindAR and this
// code share one Three.js instance. Do not turn these into normal imports.
const THREE_SPEC = 'three'
const MINDAR_SPEC = 'mindar-image-three'

function loadAspect(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalHeight / img.naturalWidth)
    img.onerror = () => resolve(0.75)
    img.src = url
  })
}

export default function ARScanner() {
  const { slug } = useParams()
  const { t } = useT()
  const containerRef = useRef(null)
  const sessionRef = useRef(null)
  const activeVideoRef = useRef(null)
  const mutedRef = useRef(true)
  const loggedRef = useRef(new Set())

  const [data, setData] = useState(undefined) // { album, memories } | null
  const [status, setStatus] = useState('idle') // idle | starting | running | error
  const [errorKey, setErrorKey] = useState('')
  const [found, setFound] = useState(false)
  const [needTap, setNeedTap] = useState(false)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: album } = await supabase.from('albums').select('*').eq('slug', slug).maybeSingle()
      if (!album) { if (!cancelled) setData(null); return }
      const { data: memories } = await supabase.from('memories').select('*')
        .eq('album_id', album.id).eq('is_active', true).not('target_index', 'is', null).order('target_index')
      if (!cancelled) setData({ album, memories: memories || [] })
    }
    load()
    return () => { cancelled = true }
  }, [slug])

  function stopSession() {
    const s = sessionRef.current
    if (!s) return
    sessionRef.current = null
    try { s.renderer.setAnimationLoop(null) } catch { /* ignore */ }
    try { s.mindar.stop() } catch { /* ignore */ }
    for (const it of s.items) {
      try {
        it.texture.dispose()
        it.plane.geometry.dispose()
        it.plane.material.dispose()
      } catch { /* ignore */ }
      it.video.pause()
      it.video.removeAttribute('src')
      it.video.load()
    }
    try { s.renderer.dispose() } catch { /* ignore */ }
  }

  // Release camera, videos and WebGL resources when leaving the page.
  useEffect(() => stopSession, [])

  async function start() {
    const { album, memories } = data
    setStatus('starting'); setErrorKey(''); setFound(false); setNeedTap(false)
    try {
      const [THREE, { MindARThree }] = await Promise.all([
        import(/* @vite-ignore */ THREE_SPEC),
        import(/* @vite-ignore */ MINDAR_SPEC),
      ])

      // Older memories saved without a stored aspect ratio: read it from the photo.
      const aspects = await Promise.all(
        memories.map((m) => (m.aspect ? m.aspect : loadAspect(mediaUrl(m.photo_path)))),
      )

      const mindar = new MindARThree({
        container: containerRef.current,
        imageTargetSrc: mediaUrl(album.target_path),
        uiLoading: 'no',
        uiScanning: 'no',
        uiError: 'no',
      })
      const { renderer, scene, camera } = mindar

      const items = memories.map((m, i) => {
        // Videos load only when their photo is first seen, so 30 memories don't all download at once.
        const video = document.createElement('video')
        video.crossOrigin = 'anonymous'
        video.loop = true
        video.muted = true
        video.playsInline = true
        video.setAttribute('playsinline', '')
        video.preload = 'none'

        const texture = new THREE.VideoTexture(video)
        texture.colorSpace = THREE.SRGBColorSpace
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(1, aspects[i]),
          new THREE.MeshBasicMaterial({ map: texture }),
        )
        const anchor = mindar.addAnchor(m.target_index)
        anchor.group.add(plane)

        anchor.onTargetFound = () => {
          setFound(true)
          activeVideoRef.current = video
          if (!video.getAttribute('src')) {
            video.src = mediaUrl(m.video_path)
            video.load()
          }
          video.muted = mutedRef.current
          video.play().then(() => setNeedTap(false)).catch(() => setNeedTap(true))
          if (!loggedRef.current.has(m.id)) {
            loggedRef.current.add(m.id)
            supabase.from('scan_history').insert({
              memory_id: m.id,
              device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            }).then(() => {})
          }
        }
        anchor.onTargetLost = () => {
          setFound(false)
          video.pause()
        }
        return { video, texture, plane }
      })

      sessionRef.current = { mindar, renderer, items }
      await mindar.start()
      renderer.setAnimationLoop(() => renderer.render(scene, camera))
      setStatus('running')
    } catch (err) {
      console.error(err)
      stopSession()
      setErrorKey(err?.name === 'NotAllowedError' ? 'cameraDenied' : 'scanError')
      setStatus('error')
    }
  }

  function toggleSound() {
    const s = sessionRef.current
    if (!s) return
    mutedRef.current = !mutedRef.current
    s.items.forEach((it) => { it.video.muted = mutedRef.current })
    setMuted(mutedRef.current)
  }

  function playNow() {
    activeVideoRef.current?.play().then(() => setNeedTap(false)).catch(() => {})
  }

  if (data === undefined) return <p className="p-8 text-center">{t('loading')}</p>
  if (data === null || !data.album.target_path || data.memories.length === 0) {
    return (
      <div className="p-10 text-center">
        <p>{data === null ? t('notFound') : t('notReady')}</p>
        <Link to={data ? `/album/${slug}` : '/'} className="btn btn-ghost mt-6">{t('back')}</Link>
      </div>
    )
  }

  const running = status === 'running'

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      <Link to={`/album/${slug}`} aria-label={t('back')}
        className="absolute top-3 left-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/55">
        <X size={22} />
      </Link>

      {running && (
        <button onClick={toggleSound} aria-label={muted ? t('soundOff') : t('soundOn')}
          className="absolute top-3 right-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/55">
          {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
      )}

      {running && !found && (
        <p className="absolute bottom-10 inset-x-0 z-10 mx-auto max-w-xs rounded-2xl bg-black/60 px-4 py-3 text-center">
          {t('pointCamera')}
        </p>
      )}

      {running && found && needTap && (
        <button onClick={playNow} className="btn absolute bottom-10 left-1/2 z-10 -translate-x-1/2">
          <Play size={18} fill="currentColor" />{t('tapToPlay')}
        </button>
      )}

      {!running && (
        <div className="absolute inset-0 z-[5] grid place-items-center px-6 text-center">
          <div className="max-w-sm">
            <h1 className="text-2xl font-bold">{data.album.title}</h1>
            <p className="mt-3 text-white/80">{t('pointCamera')}</p>
            {status === 'error' && <p role="alert" className="mt-4 text-rose-soft">{t(errorKey)}</p>}
            <button onClick={start} disabled={status === 'starting'} className="btn mt-6">
              {status === 'starting' ? t('starting') : t('startCamera')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}