import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ScanLine, Link2 } from 'lucide-react'
import { supabase, mediaUrl } from '../lib/supabase.js'
import { useT } from '../lib/i18n.jsx'

export default function AlbumDetails() {
  const { slug } = useParams()
  const { t } = useT()
  const [album, setAlbum] = useState(undefined)
  const [memories, setMemories] = useState([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: a } = await supabase.from('albums').select('*').eq('slug', slug).maybeSingle()
      if (cancelled) return
      setAlbum(a ?? null)
      if (a) {
        const { data: m } = await supabase.from('memories').select('*')
          .eq('album_id', a.id).eq('is_active', true).order('target_index', { nullsFirst: false }).order('created_at')
        if (!cancelled) setMemories(m || [])
      }
    }
    load()
    return () => { cancelled = true }
  }, [slug])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  if (album === undefined) return <p className="p-8 text-center">{t('loading')}</p>
  if (album === null) return <p className="p-8 text-center">{t('notFound')}</p>

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link to="/" className="text-sm text-rose-deep hover:underline">{t('back')}</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{album.title}</h1>
          {album.description && <p className="mt-2 text-ink/75 max-w-xl">{album.description}</p>}
        </div>
        <button onClick={copyLink} className="btn btn-ghost">
          <Link2 size={18} aria-hidden="true" />{copied ? t('copied') : t('copyLink')}
        </button>
      </div>

      {album.target_path
        ? (
          <Link to={`/album/${album.slug}/scan`} className="btn mt-8 !px-6 !py-3 text-lg">
            <ScanLine size={20} aria-hidden="true" />{t('scanAlbum')}
          </Link>
        )
        : <p className="mt-8 text-ink/60">{t('notReady')}</p>}

      {memories.length === 0 && <p className="mt-10">{t('noMemories')}</p>}
      <div className="mt-10 grid gap-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        {memories.map((m, i) => (
          <div key={m.id} className={`polaroid ${i % 2 === 0 ? '-rotate-1' : 'rotate-1'}`}>
            <img src={mediaUrl(m.photo_path)} alt={m.title} loading="lazy" className="w-full aspect-[4/3] object-cover" />
            <h3 className="py-3 font-bold">{m.title}</h3>
          </div>
        ))}
      </div>
    </div>
  )
}