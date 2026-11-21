import { Link } from 'react-router-dom'
import { mediaUrl } from '../lib/supabase.js'
import { useT } from '../lib/i18n.jsx'

export default function AlbumCard({ album, index = 0 }) {
  const { t } = useT()
  const active = (album.memories || []).filter((m) => m.is_active)
  const cover = active[0]?.photo_path
  const tilt = index % 2 === 0 ? '-rotate-1' : 'rotate-1'

  return (
    <Link to={`/album/${album.slug}`} className={`polaroid block ${tilt} hover:rotate-0 transition-transform`}>
      <div className="aspect-[4/3] bg-rose-soft overflow-hidden">
        {cover && <img src={mediaUrl(cover)} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="py-3">
        <h3 className="text-lg font-bold">{album.title}</h3>
        <p className="text-sm text-ink/60">{active.length} {t('memories')}</p>
      </div>
    </Link>
  )
}
