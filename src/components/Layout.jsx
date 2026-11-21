import { Link, Outlet } from 'react-router-dom'
import { Images } from 'lucide-react'
import { useT } from '../lib/i18n.jsx'
import { useAuth } from '../lib/auth.jsx'

export default function Layout() {
  const { t, lang, setLang } = useT()
  const { session, isAdmin, signOut } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-ink/10">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold text-ink">
            <Images className="text-rose" size={22} aria-hidden="true" />
            {t('appName')}
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {isAdmin && <Link to="/admin" className="px-3 py-1.5 rounded-full hover:bg-rose-soft">{t('admin')}</Link>}
            {session
              ? <button onClick={signOut} className="px-3 py-1.5 rounded-full hover:bg-rose-soft">{t('logout')}</button>
              : <Link to="/login" className="px-3 py-1.5 rounded-full hover:bg-rose-soft">{t('login')}</Link>}
            <div className="flex rounded-full p-0.5 bg-rose-soft" role="group" aria-label="Language">
              {[['te', 'తెలుగు'], ['en', 'EN']].map(([code, label]) => (
                <button key={code} onClick={() => setLang(code)} aria-pressed={lang === code}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${lang === code ? 'bg-rose text-white' : 'text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="py-6 text-center text-sm text-ink/60">{t('tagline')}</footer>
    </div>
  )
}
