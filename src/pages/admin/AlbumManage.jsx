import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, mediaUrl, BUCKET } from '../../lib/supabase.js'
import { useT } from '../../lib/i18n.jsx'

const MB = 1024 * 1024
const ext = (f) => (f.name.split('.').pop() || '').toLowerCase()

export default function AlbumManage() {
  const { id } = useParams()
  const { t } = useT()
  const [album, setAlbum] = useState(null)
  const [memories, setMemories] = useState([])
  const [title, setTitle] = useState('')
  const [photo, setPhoto] = useState(null)
  const [video, setVideo] = useState(null)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [formKey, setFormKey] = useState(0)

  const load = useCallback(async () => {
    const { data: a } = await supabase.from('albums').select('*').eq('id', id).maybeSingle()
    setAlbum(a)
    const { data: m } = await supabase.from('memories').select('*').eq('album_id', id).order('created_at')
    setMemories(m || [])
  }, [id])
  useEffect(() => { load() }, [load])

  function validate() {
    if (!title.trim() || !photo || !video || !target) return t('requiredFields')
    if (!['jpg', 'jpeg', 'png'].includes(ext(photo))) return `${t('wrongType')} ${photo.name}`
    if (photo.size > 10 * MB) return `${t('fileTooBig')} ${photo.name}`
    if (ext(video) !== 'mp4') return `${t('wrongType')} ${video.name}`
    if (video.size > 50 * MB) return `${t('fileTooBig')} ${video.name}`
    if (ext(target) !== 'mind') return `${t('wrongType')} ${target.name}`
    if (target.size > 10 * MB) return `${t('fileTooBig')} ${target.name}`
    return null
  }

  async function submit(e) {
    e.preventDefault()
    const problem = validate()
    if (problem) { setMsg({ type: 'error', text: problem }); return }
    setBusy(true); setMsg({ type: '', text: '' })

    const base = `${id}/${crypto.randomUUID()}`
    const uploaded = []
    const put = async (file, name, contentType) => {
      const path = `${base}/${name}.${ext(file)}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType, cacheControl: '3600' })
      if (error) throw error
      uploaded.push(path)
      return path
    }
    try {
      const photo_path = await put(photo, 'photo', ext(photo) === 'png' ? 'image/png' : 'image/jpeg')
      const video_path = await put(video, 'video', 'video/mp4')
      const target_path = await put(target, 'target', 'application/octet-stream')
      const { error } = await supabase.from('memories').insert({
        album_id: id, title: title.trim(), photo_path, video_path, target_path,
      })
      if (error) throw error
      setMsg({ type: 'ok', text: t('uploaded') })
      setTitle(''); setPhoto(null); setVideo(null); setTarget(null); setFormKey((k) => k + 1)
      load()
    } catch (err) {
      console.error(err)
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
      setMsg({ type: 'error', text: `${t('error')} (${err.message || ''})` })
    } finally {
      setBusy(false)
    }
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

      <form key={formKey} onSubmit={submit} className="mt-8 bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="text-xl font-bold">{t('addMemory')}</h2>
        <label className="block">
          <span className="text-sm font-medium">{t('memoryTitle')}</span>
          <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t('photoFile')}</span>
          <input className="input mt-1" type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setPhoto(e.target.files[0] || null)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t('videoFile')}</span>
          <input className="input mt-1" type="file" accept=".mp4,video/mp4" onChange={(e) => setVideo(e.target.files[0] || null)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t('targetFile')}</span>
          <span className="block text-sm text-ink/60">{t('targetHint')}</span>
          <input className="input mt-1" type="file" accept=".mind" onChange={(e) => setTarget(e.target.files[0] || null)} />
        </label>
        {busy && <p>{t('uploading')}</p>}
        {msg.text && <p role="alert" className={msg.type === 'ok' ? 'text-green-700' : 'text-rose-deep'}>{msg.text}</p>}
        <button className="btn" disabled={busy}>{t('upload')}</button>
      </form>

      <h2 className="text-xl font-bold mt-12 mb-4">{t('memories')}</h2>
      {memories.length === 0 && <p>{t('noMemories')}</p>}
      <ul className="space-y-3">
        {memories.map((m) => (
          <li key={m.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-4">
            <img src={mediaUrl(m.photo_path)} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <p className="flex-1 font-bold">{m.title}</p>
            <button onClick={() => removeMemory(m)} className="btn btn-ghost !py-1.5 text-sm text-rose-deep">{t('delete')}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
