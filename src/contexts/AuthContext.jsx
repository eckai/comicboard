import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      setProfile(data)
    } catch (err) {
      console.error('Error fetching profile:', err.message)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error

        if (session?.user) {
          setUser(session.user)
          await fetchProfile(session.user.id)
        }
      } catch (err) {
        console.error('Error getting session:', err.message)
        // Clear corrupted session data so the user can log in fresh
        await supabase.auth.signOut({ scope: 'local' })
        setUser(null)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'TOKEN_REFRESHED' && !session) {
          // Token refresh failed — clear stale local session
          await supabase.auth.signOut({ scope: 'local' })
          setUser(null)
          setProfile(null)
        } else if (session?.user) {
          setUser(session.user)
          await fetchProfile(session.user.id)
        } else {
          setUser(null)
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signUp = useCallback(async (email, password, displayName, role) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            role,
          },
        },
      })

      if (authError) throw authError

      return { data: authData, error: null }
    } catch (err) {
      console.error('Error signing up:', err.message)
      return { data: null, error: err }
    }
  }, [])

  const signIn = useCallback(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error
      return { data, error: null }
    } catch (err) {
      console.error('Error signing in:', err.message)
      return { data: null, error: err }
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (err) {
      console.error('Error signing out:', err.message)
      // Force local cleanup even if server-side signout fails
      // (e.g. expired/corrupted token)
      await supabase.auth.signOut({ scope: 'local' })
    } finally {
      setUser(null)
      setProfile(null)
    }
    return { error: null }
  }, [])

  const isManager = profile?.role === 'manager'

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    isManager,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
