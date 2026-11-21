import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Volume2, VolumeX, Play, X } from 'lucide-react'
import { supabase, mediaUrl } from '../lib/supabase.js'
import { useT } from '../lib/i18n.jsx'

// Loaded at runtime through the importmap in index.html, so MindAR and this
// code share one Three.js instance. Do not turn these into normal imports.
const THREE_SPEC = 'three'
const MINDAR_SPEC = 'mindar-image-three'

export default function ARScanner() {
  const { memoryId } = useParams()
  const { t } = useT()
  const containerRef = useRef(null)
  const sessionRef = useRef(null)
  const loggedRef = useRef(false)

  const [memory, setMemory] = useState(undefined)
  const [status, setStatus] = useState('idle') // idle | starting | running | error
  const [errorKey, setErrorKey] = useState('')
  const [found, setFound] = useState(false)
  const [needTap, setNeedTap] = useState(false)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    supabase.from('memories').select('*').eq('id', memoryId).maybeSingle()
      .then(({ data }) => setMemory(data ?? null))
  }, [memoryId])

  function stopSession() {
    const s = sessionRef.current
    if (!s) return
    sessionRef.current = null
    try { s.renderer.setAnimationLoop(null) } catch { /* ignore */ }
    try { s.mindar.stop() } catch { /* ignore */ }
    try {
      s.texture.dispose()
      s.plane.geometry.dispose()
      s.plane.material.dispose()
      s.renderer.dispose()
    } catch { /* ignore */ }
    s.video.pause()
    s.video.removeAttribute('src')
    s.video.load()
  }

  // Release camera, video and WebGL resources when leaving the page.
  useEffect(() => stopSession, [])

  async function start() {
    setStatus('starting'); setErrorKey(''); setFound(false); setNeedTap(false)
    try {
      const [THREE, { MindARThree }] = await Promise.all([
        import(/* @vite-ignore */ THREE_SPEC),
        import(/* @vite-ignore */ MINDAR_SPEC),
      ])

      // The video plane takes the photo's proportions so it fits the print.
      const photo = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = mediaUrl(memory.photo_path)
      })
      const aspect = photo.naturalHeight / photo.naturalWidth

      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.loop = true
      video.muted = true
      video.playsInline = true
      video.setAttribute('playsinline', '')
      video.preload = 'auto'
      video.src = mediaUrl(memory.video_path)

      const mindar = new MindARThree({
        container: containerRef.current,
        imageTargetSrc: mediaUrl(memory.target_path),
        uiLoading: 'no',
        uiScanning: 'no',
        uiError: 'no',
      })
      const { renderer, scene, camera } = mindar

      const texture = new THREE.VideoTexture(video)
      texture.colorSpace = THREE.SRGBColorSpace
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, aspect),
        new THREE.MeshBasicMaterial({ map: texture }),
      )
      const anchor = mindar.addAnchor(0)
      anchor.group.add(plane)

      anchor.onTargetFound = () => {
        setFound(true)
        video.play().then(() => setNeedTap(false)).catch(() => setNeedTap(true))
        if (!loggedRef.current) {
          loggedRef.current = true
          supabase.from('scan_history').insert({
            memory_id: memory.id,
            device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          }).then(() => {})
        }
      }
      anchor.onTargetLost = () => {
        setFound(false)
        video.pause()
      }

      sessionRef.current = { mindar, renderer, video, texture, plane }
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
    s.video.muted = !s.video.muted
    setMuted(s.video.muted)
  }

  function playNow() {
    sessionRef.current?.video.play().then(() => setNeedTap(false)).catch(() => {})
  }

  if (memory === undefined) return <p className="p-8 text-center">{t('loading')}</p>
  if (memory === null || !memory.target_path) {
    return (
      <div className="p-10 text-center">
        <p>{t('memoryNotFound')}</p>
        <Link to="/" className="btn btn-ghost mt-6">{t('back')}</Link>
      </div>
    )
  }

  const running = status === 'running'

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

      <Link to={-1} aria-label={t('back')}
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
            <h1 className="text-2xl font-bold">{memory.title}</h1>
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
