import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, mediaUrl, BUCKET } from '../../lib/supabase.js'
import { Loader2 } from 'lucide-react'
import { useT } from '../../lib/i18n.jsx'
import { uploadWithProgress } from '../../lib/upload.js'
import UploadProgress from '../../components/UploadProgress.jsx'

const MB = 1024 * 1024
const MAX = 30
const ext = (f) => (f.name.split('.').pop() || '').toLowerCase()

function readAspect(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve(img.naturalHeight / img.naturalWidth); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
    img.src = url
  })
}

export default function AlbumManage() {
  const { id } = useParams()
  const { t } = useT()
  const [album, setAlbum] = useState(null)
  const [memories, setMemories] = useState([])

  const [title, setTitle] = useState('')
  const [photo, setPhoto] = useState(null)
  const [video, setVideo] = useState(null)
  const [slotInput, setSlotInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [targetProgress, setTargetProgress] = useState(0)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const memFormRef = useRef(null)
  const targetFormRef = useRef(null)

  const [targetFile, setTargetFile] = useState(null)
  const [targetBusy, setTargetBusy] = useState(false)
  const [targetMsg, setTargetMsg] = useState({ type: '', text: '' })

  const load = useCallback(async () => {
    const { data: a } = await supabase.from('albums').select('*').eq('id', id).maybeSingle()
    setAlbum(a)
    const { data: m } = await supabase.from('memories').select('*').eq('album_id', id)
      .order('target_index', { nullsFirst: false }).order('created_at')
    setMemories(m || [])
  }, [id])
  useEffect(() => { load() }, [load])

  // Warn before closing the tab while an upload is running.
  const uploading = busy || targetBusy
  useEffect(() => {
    if (!uploading) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  const used = memories.map((m) => m.target_index).filter((n) => n !== null)
  const nextSlot = used.length ? Math.max(...used) + 2 : 1 // displayed 1-based
  const slotValue = slotInput || String(nextSlot)
  const duplicates = used.length !== new Set(used).size

  async function uploadTarget(e) {
    e.preventDefault()
    if (!targetFile) return
    if (ext(targetFile) !== 'mind') { setTargetMsg({ type: 'error', text: `${t('wrongType')} ${targetFile.name}` }); return }
    if (targetFile.size > 10 * MB) { setTargetMsg({ type: 'error', text: `${t('fileTooBig')} ${targetFile.name}` }); return }
    setTargetBusy(true); setTargetProgress(0); setTargetMsg({ type: '', text: '' })
    try {
      // A new file name each time avoids stale cached copies.
      const path = `${id}/album-${crypto.randomUUID()}.mind`
      await uploadWithProgress(path, targetFile, {
        contentType: 'application/octet-stream',
        onProgress: (f) => setTargetProgress(Math.round(f * 100)),
      })
      const { error: upErr } = await supabase.from('albums').update({ target_path: path, updated_at: new Date().toISOString() }).eq('id', id)
      if (upErr) { await supabase.storage.from(BUCKET).remove([path]); throw upErr }
      if (album?.target_path) await supabase.storage.from(BUCKET).remove([album.target_path])
      setTargetMsg({ type: 'ok', text: t('targetReady') })
      setTargetFile(null); targetFormRef.current?.reset()
      load()
    } catch (err) {
      console.error(err)
      setTargetMsg({ type: 'error', text: `${t('error')} (${err.message || ''})` })
    } finally {
      setTargetBusy(false)
    }
  }

  function validate() {
    if (memories.length >= MAX) return t('maxMemories')
    if (!title.trim() || !photo || !video) return t('requiredFields')
    const n = parseInt(slotValue, 10)
    if (!(n >= 1 && n <= MAX)) return t('invalidSlot')
    if (!['jpg', 'jpeg', 'png'].includes(ext(photo))) return `${t('wrongType')} ${photo.name}`
    if (photo.size > 10 * MB) return `${t('fileTooBig')} ${photo.name}`
    if (ext(video) !== 'mp4') return `${t('wrongType')} ${video.name}`
    if (video.size > 50 * MB) return `${t('fileTooBig')} ${video.name}`
    return null
  }

  async function submit(e) {
    e.preventDefault()
    const problem = validate()
    if (problem) { setMsg({ type: 'error', text: problem }); return }
    setBusy(true); setMsg({ type: '', text: '' })

    const base = `${id}/${crypto.randomUUID()}`
    const uploaded = []
    // Overall progress is weighted by file size (photo + video).
    const total = photo.size + video.size
    const loaded = { photo: 0, video: 0 }
    setProgress(0)
    const put = async (file, name, contentType) => {
      const path = `${base}/${name}.${ext(file)}`
      await uploadWithProgress(path, file, {
        contentType,
        onProgress: (f) => {
          loaded[name] = f * file.size
          setProgress(Math.round(((loaded.photo + loaded.video) / total) * 100))
        },
      })
      uploaded.push(path)
      return path
    }
    try {
      const aspect = await readAspect(photo)
      const photo_path = await put(photo, 'photo', ext(photo) === 'png' ? 'image/png' : 'image/jpeg')
      const video_path = await put(video, 'video', 'video/mp4')
      const { error } = await supabase.from('memories').insert({
        album_id: id, title: title.trim(), photo_path, video_path,
        target_index: parseInt(slotValue, 10) - 1, aspect,
      })
      if (error) throw error
      setMsg({ type: 'ok', text: t('uploaded') })
      setTitle(''); setPhoto(null); setVideo(null); setSlotInput(''); memFormRef.current?.reset()
      load()
    } catch (err) {
      console.error(err)
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
      setMsg({ type: 'error', text: `${t('error')} (${err.message || ''})` })
    } finally {
      setBusy(false)
    }
  }

  async function saveSlot(m, value) {
    const n = parseInt(value, 10)
    if (!(n >= 1 && n <= MAX) || n - 1 === m.target_index) { load(); return }
    await supabase.from('memories').update({ target_index: n - 1 }).eq('id', m.id)
    load()
  }

  async function removeMemory(m) {
    if (!window.confirm(t('confirmDeleteMemory'))) return
    await supabase.storage.from(BUCKET).remove([m.photo_path, m.video_path, m.target_path].filter(Boolean))
    await supabase.from('memories').delete().eq('id', m.id)
    load()
  }

  if (!album) return <p className="p-8 text-center">{t('loading')}</p>

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/admin" className="text-sm text-rose-deep hover:underline">{t('back')}</Link>
      <h1 className="text-3xl font-bold mt-2">{album.title}</h1>

      <form ref={targetFormRef} onSubmit={uploadTarget} className="mt-8 bg-white rounded-2xl p-5 shadow-sm space-y-3">
        <h2 className="text-xl font-bold">{t('albumTarget')}</h2>
        <p className="text-sm text-ink/60">{t('albumTargetHint')}</p>
        <p className="text-sm text-ink/60">{t('recompileHint')}</p>
        <p className={album.target_path ? 'text-green-700' : 'text-rose-deep'}>
          {album.target_path ? t('targetReady') : t('targetMissing')}
        </p>
        <input className="input" type="file" accept=".mind" onChange={(e) => setTargetFile(e.target.files[0] || null)} />
        {targetBusy && <UploadProgress percent={targetProgress} label={t('uploading')} />}
        {targetMsg.type === 'error' && <p role="alert" className="text-rose-deep">{targetMsg.text}</p>}
        <button className="btn" disabled={targetBusy || !targetFile}>
          {targetBusy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}{t('uploadTarget')}
        </button>
      </form>

      <form ref={memFormRef} onSubmit={submit} className="mt-8 bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="text-xl font-bold">{t('addMemory')}</h2>
        <label className="block">
          <span className="text-sm font-medium">{t('memoryTitle')}</span>
          <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t('slotLabel')}</span>
          <input className="input mt-1 max-w-[8rem]" type="number" min="1" max={MAX} value={slotValue} onChange={(e) => setSlotInput(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t('photoFile')}</span>
          <input className="input mt-1" type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setPhoto(e.target.files[0] || null)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t('videoFile')}</span>
          <input className="input mt-1" type="file" accept=".mp4,video/mp4" onChange={(e) => setVideo(e.target.files[0] || null)} />
        </label>
        {busy && <UploadProgress percent={progress} label={t('uploading')} />}
        {msg.text && <p role="alert" className={msg.type === 'ok' ? 'text-green-700' : 'text-rose-deep'}>{msg.text}</p>}
        <button className="btn" disabled={busy}>
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}{t('upload')}
        </button>
      </form>

      <h2 className="text-xl font-bold mt-12 mb-4">{t('memories')} ({memories.length}/{MAX})</h2>
      {duplicates && <p role="alert" className="mb-3 text-rose-deep">{t('duplicateSlot')}</p>}
      {memories.length === 0 && <p>{t('noMemories')}</p>}
      <ul className="space-y-3">
        {memories.map((m) => (
          <li key={m.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-4">
            <img src={mediaUrl(m.photo_path)} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <p className="flex-1 font-bold">{m.title}</p>
            <label className="text-sm">
              <span className="sr-only">{t('slotShort')}</span>
              <input key={`${m.id}-${m.target_index}`} className="input !w-16 !px-2 !py-1.5 text-center" type="number" min="1" max={MAX}
                aria-label={t('slotShort')} defaultValue={m.target_index === null ? '' : m.target_index + 1}
                onBlur={(e) => saveSlot(m, e.target.value)} />
            </label>
            <button onClick={() => removeMemory(m)} className="btn btn-ghost !py-1.5 text-sm text-rose-deep">{t('delete')}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
