import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useT } from '../lib/i18n.jsx'

export default function Login() {
  const { t } = useT()
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (session) return <Navigate to="/admin" replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setFailed(false)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setFailed(true)
    else navigate('/admin')
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold mb-6">{t('login')}</h1>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">{t('email')}</span>
          <input className="input mt-1" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t('password')}</span>
          <input className="input mt-1" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {failed && <p role="alert" className="text-rose-deep">{t('loginError')}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? t('loading') : t('signIn')}</button>
      </form>
    </div>
  )
}
