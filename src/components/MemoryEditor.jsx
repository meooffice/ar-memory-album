import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase, BUCKET } from '../lib/supabase.js'
import { uploadWithProgress } from '../lib/upload.js'
import { checkPhoto, checkVideo, readAspect, ext } from '../lib/files.js'
import UploadProgress from './UploadProgress.jsx'
import { useT } from '../lib/i18n.jsx'

export default function MemoryEditor({ memory, onSaved, onCancel }) {
  const { t } = useT()
  const [title, setTitle] = useState(memory.title)
  const [photo, setPhoto] = useState(null)
  const [video, setVideo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!title.trim()) { setError(t('requiredFields')); return }
    const problem = (photo && checkPhoto(photo, t)) || (video && checkVideo(video, t)) || null
    if (problem) { setError(problem); return }

    setBusy(true); setError(''); setProgress(0)
    const base = `${memory.album_id}/${crypto.randomUUID()}`
    const uploaded = []
    const changes = { title: title.trim() }
    const total = (photo?.size || 0) + (video?.size || 0)
    const loaded = { photo: 0, video: 0 }
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
      if (photo) {
        changes.aspect = await readAspect(photo)
        changes.photo_path = await put(photo, 'photo', ext(photo) === 'png' ? 'image/png' : 'image/jpeg')
      }
      if (video) changes.video_path = await put(video, 'video', 'video/mp4')

      const { error: upErr } = await supabase.from('memories').update(changes).eq('id', memory.id)
      if (upErr) throw upErr

      // Remove the replaced files only after the new ones are saved.
      const old = []
      if (photo) old.push(memory.photo_path)
      if (video) old.push(memory.video_path)
      if (old.length) await supabase.storage.from(BUCKET).remove(old)
      onSaved()
    } catch (err) {
      console.error(err)
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
      setError(`${t('error')} (${err.message || ''})`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-ink/10 pt-3">
      <label className="block">
        <span className="text-sm font-medium">{t('memoryTitle')}</span>
        <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">{t('newPhotoOptional')}</span>
        <input className="input mt-1" type="file" accept=".jpg,.jpeg,.png" onChange={(e) => setPhoto(e.target.files[0] || null)} />
      </label>
      {photo && <p className="text-sm text-rose-deep">{t('photoChangeWarning')}</p>}
      <label className="block">
        <span className="text-sm font-medium">{t('newVideoOptional')}</span>
        <input className="input mt-1" type="file" accept=".mp4,video/mp4" onChange={(e) => setVideo(e.target.files[0] || null)} />
      </label>
      {busy && (photo || video) && <UploadProgress percent={progress} label={t('uploading')} />}
      {error && <p role="alert" className="text-rose-deep">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={busy}>
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}{t('save')}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost">{t('cancel')}</button>
      </div>
    </form>
  )
}
