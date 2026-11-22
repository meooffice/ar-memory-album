// Uses the phone's share sheet when available; otherwise opens WhatsApp.
export async function shareLink({ title, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url })
      return
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, '_blank', 'noopener')
}

// Public site address. Set VITE_SITE_URL if QR codes are made while running locally.
export const siteUrl = () => (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '')
