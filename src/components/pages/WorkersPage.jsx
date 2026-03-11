import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { Plus, Copy, Users, UserPlus } from 'lucide-react'

export default function WorkersPage() {
  const { profile } = useAuth()
  const { onMenuToggle } = useOutletContext()
  const [workers, setWorkers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  // Create account modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newWorkerName, setNewWorkerName] = useState('')
  const [newWorkerEmail, setNewWorkerEmail] = useState('')
  const [newWorkerPassword, setNewWorkerPassword] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdCreds, setCreatedCreds] = useState(null)
  const [credsCopied, setCredsCopied] = useState(false)
  const [managerPassword, setManagerPassword] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)

  useEffect(() => {
    loadData()
  }, [profile])

  const loadData = async () => {
    if (!profile) return
    try {
      // Load all workers directly from users table
      const { data: workerData } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'worker')
        .order('created_at', { ascending: false })

      setWorkers(workerData || [])

      // Load invites
      const { data: inviteData } = await supabase
        .from('invites')
        .select('*, used_user:used_by(id, email, display_name)')
        .eq('manager_id', profile.id)
        .order('created_at', { ascending: false })

      setInvites(inviteData || [])
    } catch (err) {
      console.error('Load workers error:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateInvite = async () => {
    setCreating(true)
    setGeneratedLink('')

    try {
      const token = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const { error } = await supabase.from('invites').insert({
        token,
        manager_id: profile.id,
        email: inviteEmail || null,
        expires_at: expiresAt.toISOString(),
      })

      if (error) throw error

      const link = `${window.location.origin}/invite?token=${token}`
      setGeneratedLink(link)
      loadData()
    } catch (err) {
      console.error('Generate invite error:', err)
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = generatedLink
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const createWorkerAccount = async () => {
    if (!newWorkerEmail || !newWorkerPassword || !newWorkerName || !managerPassword) return
    setCreatingAccount(true)
    setCreateError('')

    const managerEmail = profile.email

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: newWorkerEmail,
        password: newWorkerPassword,
        options: {
          data: {
            display_name: newWorkerName,
            role: 'worker',
          },
        },
      })

      if (authError) throw authError

      // Sign back in as manager immediately
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: managerEmail,
        password: managerPassword,
      })

      if (loginError) {
        setNeedsReauth(true)
        throw new Error('Worker created but failed to re-authenticate. Please log in again.')
      }

      setCreatedCreds({
        name: newWorkerName,
        email: newWorkerEmail,
        password: newWorkerPassword,
      })

      setTimeout(() => loadData(), 1000)
    } catch (err) {
      setCreateError(err.message || 'Failed to create worker account')
    } finally {
      setCreatingAccount(false)
    }
  }

  const copyCredentials = async () => {
    if (!createdCreds) return
    const text = `ComicBoard Login Credentials\nName: ${createdCreds.name}\nEmail: ${createdCreds.email}\nPassword: ${createdCreds.password}\nLogin at: ${window.location.origin}`
    try {
      await navigator.clipboard.writeText(text)
      setCredsCopied(true)
      setTimeout(() => setCredsCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCredsCopied(true)
      setTimeout(() => setCredsCopied(false), 2000)
    }
  }

  const resetCreateModal = () => {
    setCreateModalOpen(false)
    setNewWorkerName('')
    setNewWorkerEmail('')
    setNewWorkerPassword('')
    setManagerPassword('')
    setCreateError('')
    setCreatedCreds(null)
    setNeedsReauth(false)
  }

  return (
    <>
      <Header title="Workers" onMenuToggle={onMenuToggle}>
        <div className="flex gap-2">
          <Button onClick={() => { setInviteModalOpen(true); setGeneratedLink(''); setInviteEmail('') }} size="sm" variant="outline">
            <Plus className="mr-1 h-4 w-4" /> Invite Link
          </Button>
          <Button onClick={() => resetCreateModal() || setCreateModalOpen(true)} size="sm">
            <UserPlus className="mr-1 h-4 w-4" /> Create Account
          </Button>
        </div>
      </Header>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div>
              <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" /> Active Workers
              </h2>
              {workers.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">No workers yet. Create an account or send an invite link to get started.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {workers.map(worker => (
                    <Card key={worker.id}>
                      <CardContent className="p-4">
                        <p className="font-medium">{worker.display_name}</p>
                        <p className="text-sm text-muted-foreground">{worker.email}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="mb-3 text-lg font-semibold">Invite History</h2>
              {invites.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invites sent yet.</p>
              ) : (
                <div className="space-y-2">
                  {invites.map(invite => (
                    <Card key={invite.id}>
                      <CardContent className="flex items-center justify-between p-3">
                        <div>
                          <p className="text-sm">
                            {invite.email || 'Open invite'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Created {new Date(invite.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={invite.used_by ? 'approved' : new Date(invite.expires_at) < new Date() ? 'archived' : 'pending'}>
                          {invite.used_by ? `Used by ${invite.used_user?.display_name || 'worker'}` : new Date(invite.expires_at) < new Date() ? 'Expired' : 'Pending'}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Invite Link Modal */}
      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Worker"
      >
        <div className="space-y-4">
          <Input
            label="Worker Email (optional)"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="worker@example.com"
          />
          <p className="text-xs text-muted-foreground">
            Leave email blank to create an open invite link. The link expires in 7 days.
          </p>

          {!generatedLink ? (
            <Button onClick={generateInvite} disabled={creating} className="w-full">
              {creating ? 'Generating...' : 'Generate Invite Link'}
            </Button>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Invite Link</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={generatedLink}
                  className="flex h-9 w-full rounded-md border border-input bg-secondary px-3 text-xs"
                />
                <Button variant="outline" size="sm" onClick={copyLink}>
                  <Copy className="mr-1 h-3 w-3" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-approved">Send this link to your worker so they can create their account.</p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setInviteModalOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* Create Worker Account Modal */}
      <Modal
        open={createModalOpen}
        onClose={resetCreateModal}
        title="Create Worker Account"
      >
        {!createdCreds ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create an account for a worker. You'll get their login credentials to send to them.
            </p>
            <Input
              label="Worker Name"
              type="text"
              value={newWorkerName}
              onChange={(e) => setNewWorkerName(e.target.value)}
              placeholder="Artist name"
              required
            />
            <Input
              label="Worker Email"
              type="email"
              value={newWorkerEmail}
              onChange={(e) => setNewWorkerEmail(e.target.value)}
              placeholder="worker@example.com"
              required
            />
            <Input
              label="Password"
              type="text"
              value={newWorkerPassword}
              onChange={(e) => setNewWorkerPassword(e.target.value)}
              placeholder="Create a password for them"
              required
            />
            <p className="text-xs text-muted-foreground">
              The password is shown in plain text so you can share it with the worker. They can change it later.
            </p>

            <div className="border-t border-border pt-3">
              <Input
                label="Your password (to stay logged in)"
                type="password"
                value={managerPassword}
                onChange={(e) => setManagerPassword(e.target.value)}
                placeholder="Enter your manager password"
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Required to keep your session active after creating the worker account.
              </p>
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetCreateModal}>Cancel</Button>
              <Button onClick={createWorkerAccount} disabled={creatingAccount || !newWorkerName || !newWorkerEmail || !newWorkerPassword || !managerPassword}>
                {creatingAccount ? 'Creating...' : 'Create Account'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-approved/30 bg-approved/5 p-4">
              <p className="text-sm font-medium text-approved mb-3">Account created successfully!</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{createdCreds.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{createdCreds.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Password:</span>
                  <span className="font-medium">{createdCreds.password}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Login URL:</span>
                  <span className="font-medium text-xs">{window.location.origin}</span>
                </div>
              </div>
            </div>

            <Button onClick={copyCredentials} variant="outline" className="w-full">
              <Copy className="mr-1 h-3 w-3" />
              {credsCopied ? 'Copied to clipboard!' : 'Copy credentials to clipboard'}
            </Button>

            <p className="text-xs text-muted-foreground">
              Send these credentials to the worker. They should change their password after first login.
            </p>

            <div className="flex justify-end pt-2">
              <Button onClick={resetCreateModal}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
