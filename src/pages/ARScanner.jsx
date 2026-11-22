import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Volume2, VolumeX, Play, X, RotateCcw, RotateCw, Camera, ChevronRight } from 'lucide-react'
import { supabase, mediaUrl } from '../lib/supabase.js'
import { useT } from '../lib/i18n.jsx'

// Loaded at runtime through the importmap in index.html, so MindAR and this
// code share one Three.js instance. Do not turn these into normal imports.
const THREE_SPEC = 'three'
const MINDAR_SPEC = 'mindar-image-three'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function loadAspect(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalHeight / img.naturalWidth)
    img.onerror = () => resolve(0.75)
    img.src = url
  })
}

// Resolves when the video can play and the photo is downloaded; rejects on error or after 20 s.
function whenReady(video, photoUrl) {
  const videoReady = new Promise((resolve, reject) => {
    if (video.readyState >= 3) return resolve()
    const cleanup = () => {
      video.removeEventListener('canplay', ok)
      video.removeEventListener('error', bad)
    }
    const ok = () => { cleanup(); resolve() }
    const bad = () => { cleanup(); reject(new Error('video')) }
    video.addEventListener('canplay', ok)
    video.addEventListener('error', bad)
  })
  const photoReady = new Promise((resolve) => {
    const img = new Image()
    img.onload = img.onerror = () => resolve()
    img.src = photoUrl
  })
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
  return Promise.race([Promise.all([videoReady, photoReady]), timeout])
}

// A bright border that follows the detected photo's edges.
function makeOutline(THREE, aspect) {
  const w = 1, h = aspect, b = 0.03
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2 - b, -h / 2 - b)
  shape.lineTo(w / 2 + b, -h / 2 - b)
  shape.lineTo(w / 2 + b, h / 2 + b)
  shape.lineTo(-w / 2 - b, h / 2 + b)
  shape.closePath()
  const hole = new THREE.Path()
  hole.moveTo(-w / 2, -h / 2)
  hole.lineTo(-w / 2, h / 2)
  hole.lineTo(w / 2, h / 2)
  hole.lineTo(w / 2, -h / 2)
  hole.closePath()
  shape.holes.push(hole)
  const material = new THREE.MeshBasicMaterial({
    color: 0xff7aa8, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false,
  })
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), material)
}

function Ring({ className = '' }) {
  return <div className={`animate-spin rounded-full border-4 border-white/30 border-t-rose ${className}`} aria-hidden="true" />
}

// Fixed frame sized like the album's photos, so the person knows where to place the print.
function GuideFrame({ aspect, vp }) {
  const w = Math.min(vp.w * 0.86, (vp.h * 0.6) / aspect)
  const h = w * aspect
  const corner = 'absolute h-9 w-9 border-white/90'
  return (
    <div className="pointer-events-none absolute inset-0 z-[4] grid place-items-center" aria-hidden="true">
      <div className="relative animate-pulse" style={{ width: w, height: h }}>
        <span className={`${corner} left-0 top-0 rounded-tl-2xl border-l-4 border-t-4`} />
        <span className={`${corner} right-0 top-0 rounded-tr-2xl border-r-4 border-t-4`} />
        <span className={`${corner} bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4`} />
        <span className={`${corner} bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4`} />
      </div>
    </div>
  )
}

const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)] : 0.75
}

export default function ARScanner() {
  const { slug } = useParams()
  const { t } = useT()

  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const loaderRef = useRef(null)
  const sessionRef = useRef(null)
  const anchorGroupRef = useRef(null)
  const phaseRef = useRef('search')
  const currentRef = useRef(null)
  const runIdRef = useRef(0)
  const startTokenRef = useRef(0)
  const aliveRef = useRef(true)
  const mutedRef = useRef(false)
  const ignoreUntilRef = useRef(0)
  const loggedRef = useRef(new Set())

  const [data, setData] = useState(undefined) // { album, memories } | null
  const [status, setStatus] = useState('starting') // starting | running | error
  const [errorKey, setErrorKey] = useState('')
  const [phase, setPhaseState] = useState('search') // search | detected | playing | ended
  const [current, setCurrent] = useState(null)
  const [needTap, setNeedTap] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [muted, setMuted] = useState(false)
  const [toast, setToast] = useState('')
  const [frameAspect, setFrameAspect] = useState(0.75)
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  const go = (p) => { phaseRef.current = p; setPhaseState(p) }

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
    sessionRef.current = null
    const v = videoRef.current
    if (v) v.pause()
    if (!s) return
    try { s.renderer.setAnimationLoop(null) } catch { /* ignore */ }
    try { s.mindar.stop() } catch { /* ignore */ }
    for (const o of s.outlines) {
      try { o.geometry.dispose(); o.material.dispose() } catch { /* ignore */ }
    }
    try { s.renderer.dispose() } catch { /* ignore */ }
  }

  // Leaving the page: stop camera and WebGL, leave full screen.
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      startTokenRef.current += 1
      stopSession()
      // Deferred so React's dev-only double mount does not drop full screen.
      setTimeout(() => {
        if (!aliveRef.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      }, 0)
    }
  }, [])

  // Make the camera picture fill the screen (cover) and re-measure after
  // full screen or rotation, when the page size changes.
  function layoutCamera() {
    const s = sessionRef.current
    const box = containerRef.current
    if (!s || !box) return
    try { s.mindar.resize?.() } catch { /* ignore */ }
    const cam = box.querySelector('video')
    if (cam) {
      const set = (k, v) => cam.style.setProperty(k, v, 'important')
      set('position', 'absolute'); set('top', '0'); set('left', '0')
      set('width', '100%'); set('height', '100%')
      set('max-width', 'none'); set('object-fit', 'cover')
    }
  }

  useEffect(() => {
    const onResize = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight })
      setTimeout(layoutCamera, 80)
      setTimeout(layoutCamera, 400)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    document.addEventListener('fullscreenchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      document.removeEventListener('fullscreenchange', onResize)
    }
  }, [])

  // Start the camera automatically once the album is loaded.
  useEffect(() => {
    if (data && data.album.target_path && data.memories.length > 0) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  function showToast(text) {
    setToast(text)
    setTimeout(() => setToast(''), 4000)
  }

  async function playNow() {
    const v = videoRef.current
    if (!v) return
    v.muted = mutedRef.current
    try {
      await v.play()
      setNeedTap(false)
    } catch {
      // Browsers can block sound without a tap: retry silently, keep the unmute button.
      if (!v.muted) {
        v.muted = true
        mutedRef.current = true
        setMuted(true)
        try { await v.play(); setNeedTap(false); return } catch { /* fall through */ }
      }
      setNeedTap(true)
    }
  }

  function videoFailed() {
    runIdRef.current += 1
    currentRef.current = null
    setCurrent(null)
    go('search')
    ignoreUntilRef.current = Date.now() + 2000
    showToast(t('videoError'))
  }

  async function openMemory(m, fromDetection) {
    const v = videoRef.current
    if (!v) return
    const id = ++runIdRef.current
    currentRef.current = m
    setCurrent(m)
    setNeedTap(false)
    v.pause()
    const photoUrl = mediaUrl(m.photo_path)
    v.poster = photoUrl
    v.src = mediaUrl(m.video_path)
    v.load()
    if (fromDetection) {
      go('detected')
      try {
        await Promise.all([whenReady(v, photoUrl), sleep(900)])
      } catch {
        if (id === runIdRef.current) videoFailed()
        return
      }
      if (id !== runIdRef.current) return
    } else {
      setBuffering(true)
    }
    go('playing')
    await playNow()
  }

  function backToCamera() {
    runIdRef.current += 1
    videoRef.current?.pause()
    currentRef.current = null
    setCurrent(null)
    setNeedTap(false)
    setBuffering(false)
    ignoreUntilRef.current = Date.now() + 2000
    go('search')
  }

  function replay() {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    go('playing')
    playNow()
  }

  function toggleSound() {
    mutedRef.current = !mutedRef.current
    if (videoRef.current) videoRef.current.muted = mutedRef.current
    setMuted(mutedRef.current)
  }

  async function start() {
    if (!data) return
    const { album, memories } = data
    const token = ++startTokenRef.current
    const stale = () => token !== startTokenRef.current
    setStatus('starting'); setErrorKey('')
    go('search')
    try {
      const [THREE, { MindARThree }] = await Promise.all([
        import(/* @vite-ignore */ THREE_SPEC),
        import(/* @vite-ignore */ MINDAR_SPEC),
      ])
      if (stale()) return

      // Memories saved without a stored aspect ratio: read it from the photo.
      const aspects = await Promise.all(
        memories.map((m) => (m.aspect ? m.aspect : loadAspect(mediaUrl(m.photo_path)))),
      )
      if (stale()) return
      setFrameAspect(median(aspects))

      const mindar = new MindARThree({
        container: containerRef.current,
        imageTargetSrc: mediaUrl(album.target_path),
        missTolerance: 10,
        uiLoading: 'no',
        uiScanning: 'no',
        uiError: 'no',
      })
      const { renderer, scene, camera } = mindar

      const outlines = memories.map((m, i) => {
        const outline = makeOutline(THREE, aspects[i])
        const anchor = mindar.addAnchor(m.target_index)
        anchor.group.add(outline)
        anchor.onTargetFound = () => {
          if (phaseRef.current !== 'search' || Date.now() < ignoreUntilRef.current) return
          anchorGroupRef.current = anchor.group
          openMemory(m, true)
          if (!loggedRef.current.has(m.id)) {
            loggedRef.current.add(m.id)
            supabase.from('scan_history').insert({
              memory_id: m.id,
              device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            }).then(() => {})
          }
        }
        return outline
      })

      sessionRef.current = { mindar, renderer, outlines }
      await mindar.start()
      if (stale()) { try { mindar.stop() } catch { /* ignore */ } return }

      const v3 = new THREE.Vector3()
      renderer.setAnimationLoop(() => {
        const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 150)
        for (const o of outlines) o.material.opacity = pulse
        // Keep the loader on the detected photo's centre.
        const el = loaderRef.current
        const box = containerRef.current
        if (phaseRef.current === 'detected' && anchorGroupRef.current && el && box) {
          anchorGroupRef.current.getWorldPosition(v3)
          v3.project(camera)
          const x = (v3.x * 0.5 + 0.5) * box.clientWidth
          const y = (-v3.y * 0.5 + 0.5) * box.clientHeight
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
        }
        renderer.render(scene, camera)
      })
      layoutCamera()
      requestAnimationFrame(layoutCamera)
      setTimeout(layoutCamera, 600)
      setStatus('running')
    } catch (err) {
      if (stale()) return
      console.error(err)
      stopSession()
      setErrorKey(err?.name === 'NotAllowedError' ? 'cameraDenied' : 'scanError')
      setStatus('error')
    }
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

  const { memories } = data
  const running = status === 'running'
  const showPlayer = phase === 'playing' || phase === 'ended'
  const idx = current ? memories.findIndex((m) => m.id === current.id) : -1
  const next = idx >= 0 ? memories[idx + 1] : undefined
  // Suggest turning the phone when the photos' shape does not match the screen.
  const screenPortrait = vp.h >= vp.w
  const rotateHint = frameAspect < 0.9 && screenPortrait ? 'rotateLandscape'
    : frameAspect > 1.1 && !screenPortrait ? 'rotatePortrait' : ''
  const softBtn = 'inline-flex items-center justify-center gap-2 rounded-full bg-white/15 px-4 py-3 font-semibold text-white backdrop-blur'

  return (
    <div className="fixed inset-0 z-50 select-none bg-black text-white">
      {/* Camera (MindAR draws here) */}
      <div ref={containerRef} className="ar-stage absolute inset-0 overflow-hidden" />

      {running && phase === 'search' && <GuideFrame aspect={frameAspect} vp={vp} />}

      {running && phase === 'search' && rotateHint && (
        <p className="absolute inset-x-0 top-20 z-10 mx-auto flex w-fit max-w-xs items-center gap-2 rounded-2xl bg-black/65 px-4 py-2 text-center text-sm">
          <RotateCw size={18} className="shrink-0" aria-hidden="true" />{t(rotateHint)}
        </p>
      )}

      {/* Loader that sits on the detected photo */}
      <div ref={loaderRef} className={`pointer-events-none absolute left-0 top-0 z-[6] ${running && phase === 'detected' ? '' : 'hidden'}`}>
        <Ring className="h-12 w-12" />
      </div>

      {running && phase === 'search' && (
        <p className="absolute inset-x-0 bottom-10 z-10 mx-auto max-w-xs rounded-2xl bg-black/60 px-4 py-3 text-center">
          {t('pointCamera')}
        </p>
      )}
      {running && phase === 'detected' && (
        <p className="absolute inset-x-0 bottom-10 z-10 mx-auto w-fit rounded-full bg-black/60 px-4 py-2 text-center">
          {t('detected')}
        </p>
      )}

      {/* Full-screen player: hides the camera while the video plays */}
      <div className={`absolute inset-0 z-20 bg-black transition-opacity duration-300 ${showPlayer ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          playsInline
          preload="auto"
          onWaiting={() => setBuffering(true)}
          onPlaying={() => { setBuffering(false); setNeedTap(false) }}
          onCanPlay={() => setBuffering(false)}
          onEnded={() => go('ended')}
          onError={() => { if (currentRef.current) videoFailed() }}
        />
        {showPlayer && buffering && phase === 'playing' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center"><Ring className="h-12 w-12" /></div>
        )}
        {showPlayer && needTap && phase === 'playing' && (
          <button onClick={playNow} className="btn absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
            <Play size={18} fill="currentColor" />{t('tapToPlay')}
          </button>
        )}
        {phase === 'ended' && (
          <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 pb-8 pt-16">
            <div className="mx-auto max-w-sm space-y-3">
              {next && (
                <button onClick={() => openMemory(next, false)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/15 p-2 pr-3 text-left backdrop-blur">
                  <img src={mediaUrl(next.photo_path)} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  <span className="flex-1">
                    <span className="block text-xs text-white/70">{t('nextUp')}</span>
                    <span className="block font-bold">{next.title}</span>
                  </span>
                  <ChevronRight size={22} aria-hidden="true" />
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={replay} className={`${softBtn} flex-1`}><RotateCcw size={18} aria-hidden="true" />{t('replay')}</button>
                <button onClick={backToCamera} className={`${softBtn} flex-1 !bg-rose`}><Camera size={18} aria-hidden="true" />{t('backToCamera')}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Close / back */}
      {showPlayer
        ? (
          <button onClick={backToCamera} aria-label={t('backToCamera')}
            className="absolute left-3 top-3 z-30 grid h-11 w-11 place-items-center rounded-full bg-black/55">
            <X size={22} />
          </button>
        )
        : (
          <Link to={`/album/${slug}`} aria-label={t('back')}
            className="absolute left-3 top-3 z-30 grid h-11 w-11 place-items-center rounded-full bg-black/55">
            <X size={22} />
          </Link>
        )}

      {showPlayer && (
        <button onClick={toggleSound} aria-label={muted ? t('soundOff') : t('soundOn')}
          className="absolute right-3 top-3 z-30 grid h-11 w-11 place-items-center rounded-full bg-black/55">
          {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
      )}

      {toast && (
        <p role="alert" className="absolute inset-x-0 top-20 z-40 mx-auto w-fit max-w-xs rounded-2xl bg-black/75 px-4 py-3 text-center">
          {toast}
        </p>
      )}

      {/* Camera starting / failed */}
      {status !== 'running' && (
        <div className="absolute inset-0 z-[5] grid place-items-center px-6 text-center">
          <div className="max-w-sm">
            <h1 className="text-2xl font-bold">{data.album.title}</h1>
            {status === 'starting' && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <Ring className="h-12 w-12" />
                <p className="text-white/80">{t('starting')}</p>
              </div>
            )}
            {status === 'error' && (
              <>
                <p role="alert" className="mt-4 text-rose-soft">{t(errorKey)}</p>
                <button onClick={start} className="btn mt-6">{t('retry')}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
