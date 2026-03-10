import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function InvitePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const token = searchParams.get('token')

  const [invite, setInvite] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) {
      navigate('/')
      return
    }
    if (!token) {
      setError('No invite token provided')
      setLoading(false)
      return
    }
    loadInvite()
  }, [token, user])

  const loadInvite = async () => {
    try {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('token', token)
        .is('used_by', null)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (error || !data) {
        setError('This invite link is invalid or has expired')
        return
      }
      setInvite(data)
      if (data.email) setEmail(data.email)
    } catch {
      setError('Failed to load invite')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            role: 'worker',
          },
        },
      })
      if (authError) throw authError

      const userId = authData.user.id

      const { error: inviteError } = await supabase
        .from('invites')
        .update({ used_by: userId })
        .eq('id', invite.id)
      if (inviteError) throw inviteError

      navigate('/')
    } catch (err) {
      setError(err.message || 'Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading invite...</p>
      </div>
    )
  }

  if (error && !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={() => navigate('/login')}>
            Go to Login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">ComicBoard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You've been invited to join as an artist
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Display Name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={!!invite?.email}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 6 characters"
            minLength={6}
            required
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create Account & Join'}
          </Button>
        </form>
      </div>
    </div>
  )
}
