import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download, Link2, Share2 } from 'lucide-react'
import { useT } from '../lib/i18n.jsx'
import { shareLink, siteUrl } from '../lib/share.js'

export default function QrCard({ album }) {
  const { t } = useT()
  const [kind, setKind] = useState('album') // album | scanner
  const [dataUrl, setDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const url = `${siteUrl()}/album/${album.slug}${kind === 'scanner' ? '/scan' : ''}`

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M' })
      .then((d) => { if (!cancelled) setDataUrl(d) })
      .catch(() => { if (!cancelled) setDataUrl('') })
    return () => { cancelled = true }
  }, [url])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">{t('qrTitle')}</h2>
      <p className="mt-1 text-sm text-ink/60">{t('qrHint')}</p>
      {!album.is_public && <p className="mt-2 text-sm text-rose-deep">{t('qrUnpublished')}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t('qrTitle')}>
        {[['album', 'qrTargetAlbum'], ['scanner', 'qrTargetScanner']].map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${kind === k ? 'bg-rose text-white' : 'bg-rose-soft'}`}>
            {t(label)}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-5">
        {dataUrl && <img src={dataUrl} alt="QR" className="h-44 w-44 rounded-xl border border-ink/10" />}
        <div className="min-w-0 flex-1 space-y-3">
          <p className="break-all text-sm text-ink/70">{url}</p>
          <div className="flex flex-wrap gap-2">
            <a href={dataUrl} download={`${album.slug}-qr.png`} className="btn !py-2 text-sm">
              <Download size={16} aria-hidden="true" />{t('qrDownload')}
            </a>
            <button onClick={copy} className="btn btn-ghost !py-2 text-sm">
              <Link2 size={16} aria-hidden="true" />{copied ? t('copied') : t('copyLink')}
            </button>
            <button onClick={() => shareLink({ title: album.title, url })} className="btn btn-ghost !py-2 text-sm">
              <Share2 size={16} aria-hidden="true" />{t('share')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
