import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useT } from '../lib/i18n.jsx'

export default function ProtectedRoute() {
  const { session, isAdmin, loading } = useAuth()
  const { t } = useT()
  if (loading) return <p className="p-8 text-center">{t('loading')}</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin) return <p className="p-8 text-center">{t('notAdmin')}</p>
  return <Outlet />
}
