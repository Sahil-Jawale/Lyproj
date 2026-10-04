import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { ROLE_HOME } from '../../services/auth'

/**
 * Route guard. The server enforces access on every request; this only keeps
 * the UI from rendering a screen whose data it is not allowed to load.
 */
export default function RequireAuth({ roles, children }) {
  const { status, user } = useAuthStore()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-24 text-ink-500">
        <Loader2 size={22} className="animate-spin text-care-700" />
      </div>
    )
  }
  if (status !== 'authed') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />
  }
  return children
}
