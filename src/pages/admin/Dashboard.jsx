import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, BUCKET } from '../../lib/supabase.js'
import { useAuth } from '../../lib/auth.jsx'
import { useT } from '../../lib/i18n.jsx'
import HowToGuide from '../../components/HowToGuide.jsx'

function makeSlug(title) {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${base || 'album'}-${Math.random().toString(36).slice(2, 7)}`
}

export default function Dashboard() {
  const { t } = useT()
  const { user } = useAuth()
  const [albums, setAlbums] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('albums').select('*').order('created_at', { ascending: false })
    setAlbums(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function createAlbum(e) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('albums').insert({
      owner_id: user.id, title: title.trim(), description: description.trim() || null, slug: makeSlug(title),
    })
    setBusy(false)
    if (error) { setMsg(t('error')); return }
    setTitle(''); setDescription(''); load()
  }

  async function togglePublic(a) {
    await supabase.from('albums').update({ is_public: !a.is_public, updated_at: new Date().toISOString() }).eq('id', a.id)
    load()
  }

  async function removeAlbum(a) {
    if (!window.confirm(t('confirmDeleteAlbum'))) return
    const { data: mems } = await supabase.from('memories').select('photo_path,video_path,target_path').eq('album_id', a.id)
    const paths = [a.target_path, ...(mems || []).flatMap((m) => [m.photo_path, m.video_path, m.target_path])].filter(Boolean)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    await supabase.from('albums').delete().eq('id', a.id)
    load()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t('dashboard')}</h1>

      <Link to="/admin/stats" className="btn btn-ghost mt-4">{t('stats')}</Link>

      <HowToGuide />

      <form onSubmit={createAlbum} className="mt-8 bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="text-xl font-bold">{t('newAlbum')}</h2>
        <input className="input" required placeholder={t('albumTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input" rows={2} placeholder={t('albumDescription')} value={description} onChange={(e) => setDescription(e.target.value)} />
        {msg && <p role="alert" className="text-rose-deep">{msg}</p>}
        <button className="btn" disabled={busy}>{t('create')}</button>
      </form>

      <h2 className="text-xl font-bold mt-12 mb-4">{t('yourAlbums')}</h2>
      {albums.length === 0 && <p>{t('noAlbumsAdmin')}</p>}
      <ul className="space-y-3">
        {albums.map((a) => (
          <li key={a.id} className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold">{a.title}</p>
              <p className={`text-sm ${a.is_public ? 'text-green-700' : 'text-ink/60'}`}>{a.is_public ? t('published') : t('draft')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/admin/album/${a.id}`} className="btn !py-1.5 text-sm">{t('manage')}</Link>
              <Link to={`/album/${a.slug}`} className="btn btn-ghost !py-1.5 text-sm">{t('viewPublic')}</Link>
              <button onClick={() => togglePublic(a)} className="btn btn-ghost !py-1.5 text-sm">{a.is_public ? t('unpublish') : t('publish')}</button>
              <button onClick={() => removeAlbum(a)} className="btn btn-ghost !py-1.5 text-sm text-rose-deep">{t('delete')}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
