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
import { Plus, Copy, Users } from 'lucide-react'

export default function WorkersPage() {
  const { profile } = useAuth()
  const { onMenuToggle } = useOutletContext()
  const [workers, setWorkers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadData()
  }, [profile])

  const loadData = async () => {
    if (!profile) return
    try {
      // Get all workers who have used invites from this manager
      const { data: inviteData } = await supabase
        .from('invites')
        .select('*, used_user:used_by(id, email, display_name)')
        .eq('manager_id', profile.id)
        .order('created_at', { ascending: false })

      setInvites(inviteData || [])

      // Get unique workers
      const workerIds = [...new Set((inviteData || []).filter(i => i.used_by).map(i => i.used_by))]
      if (workerIds.length > 0) {
        const { data: workerData } = await supabase
          .from('users')
          .select('*')
          .in('id', workerIds)
        setWorkers(workerData || [])
      }
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
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 day expiry

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
      // Fallback
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

  return (
    <>
      <Header title="Workers" onMenuToggle={onMenuToggle}>
        <Button onClick={() => { setModalOpen(true); setGeneratedLink(''); setInviteEmail('') }} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Invite Worker
        </Button>
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
                    <p className="text-muted-foreground">No workers yet. Send an invite link to get started.</p>
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
            </div>
          </>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
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
            <Button variant="outline" onClick={() => setModalOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
