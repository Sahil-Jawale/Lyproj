import { create } from 'zustand'
import { getMe, logout as apiLogout } from '../services/auth'
import { setUnauthorizedHandler } from '../services/api'

/**
 * Who is signed in. `status` starts as 'loading' so guarded routes wait for the
 * first /me instead of bouncing a signed-in user to the login page on refresh.
 *
 * Nothing sensitive lives here — the session token is an HttpOnly cookie that
 * this code cannot read. This is only the profile the API reported.
 */
export const useAuthStore = create((set) => ({
  status: 'loading', // 'loading' | 'anon' | 'authed'
  user: null,
  // Set when the API rejected a session mid-use, so the login page can say why.
  expired: false,

  refresh: async () => {
    try {
      const user = await getMe()
      set({ user, status: 'authed', expired: false })
      return user
    } catch {
      set({ user: null, status: 'anon' })
      return null
    }
  },

  setUser: (user) => set({ user, status: 'authed', expired: false }),

  logout: async () => {
    try { await apiLogout() } catch { /* the cookie is cleared server-side either way */ }
    set({ user: null, status: 'anon', expired: false })
  },

  markExpired: () => set((s) => (s.status === 'authed' ? { user: null, status: 'anon', expired: true } : s)),
}))

setUnauthorizedHandler(() => useAuthStore.getState().markExpired())
