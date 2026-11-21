import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { supabase, mediaUrl } from '../lib/supabase.js'
import { useT } from '../lib/i18n.jsx'
import AlbumCard from '../components/AlbumCard.jsx'

export default function Home() {
  const { t } = useT()
  const [albums, setAlbums] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    supabase.from('albums')
      .select('id,title,slug,memories(photo_path,is_active)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => (error ? setFailed(true) : setAlbums(data)))
  }, [])

  // Hero card shows the first photo found in any published album.
  const heroPhoto = albums
    ?.flatMap((a) => (a.memories || []).filter((m) => m.is_active).map((m) => m.photo_path))
    .find(Boolean)

  return (
    <>
      <section className="mx-auto max-w-5xl px-4 py-12 md:py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h1 className="text-3xl md:text-5xl font-bold">{t('tagline')}</h1>
          <p className="mt-5 text-lg text-ink/75 max-w-md">{t('heroSub')}</p>
          <a href="#albums" className="btn mt-8">{t('browse')}</a>
        </div>
        <div className="polaroid -rotate-2 max-w-xs mx-auto w-full" aria-hidden="true">
          <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-rose-soft to-[#e9c7d4] grid place-items-center">
            {heroPhoto && <img src={mediaUrl(heroPhoto)} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <span className="relative z-[1] grid place-items-center h-16 w-16 rounded-full bg-white/90 text-rose shadow">
              <Play size={28} fill="currentColor" />
            </span>
          </div>
          <div className="h-12" />
        </div>
      </section>

      <section id="albums" className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-2xl font-bold mb-8">{t('albums')}</h2>
        {failed && <p>{t('error')}</p>}
        {!failed && albums === null && <p>{t('loading')}</p>}
        {albums?.length === 0 && <p>{t('noAlbums')}</p>}
        <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {albums?.map((a, i) => <AlbumCard key={a.id} album={a} index={i} />)}
        </div>
      </section>
    </>
  )
}