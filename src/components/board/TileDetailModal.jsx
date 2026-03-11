import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { CheckCircle, XCircle, DollarSign, ArrowRight, Trash2, Pencil, Send, EyeOff, Eye } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function TileDetailModal({ tile, stages, isManager, onClose, onApprove, onReject, onMarkPaid, onDelete, onTileUpdate, currency = 'USD' }) {
  const { profile } = useAuth()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    if (tile) {
      setTitleValue(tile.title)
      setEditingTitle(false)
      setNewNote('')
      loadNotes()
    }
  }, [tile?.id])

  const loadNotes = async () => {
    if (!tile) return
    const { data } = await supabase
      .from('tile_notes')
      .select('*, author:author_id(display_name)')
      .eq('tile_id', tile.id)
      .order('created_at', { ascending: true })
    setNotes(data || [])
  }

  const saveTitle = async () => {
    if (!titleValue.trim() || titleValue === tile.title) {
      setEditingTitle(false)
      return
    }
    setSavingTitle(true)
    try {
      const { error } = await supabase
        .from('tiles')
        .update({ title: titleValue.trim() })
        .eq('id', tile.id)
      if (!error) {
        onTileUpdate?.()
        setEditingTitle(false)
      }
    } finally {
      setSavingTitle(false)
    }
  }

  const addNote = async () => {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      const { error } = await supabase.from('tile_notes').insert({
        tile_id: tile.id,
        author_id: profile.id,
        content: newNote.trim(),
        visible_to_worker: true,
      })
      if (!error) {
        setNewNote('')
        setNoteVisible(true)
        loadNotes()
      }
    } finally {
      setSavingNote(false)
    }
  }

  const toggleNoteVisibility = async (note) => {
    await supabase.from('tile_notes').update({ visible_to_worker: !note.visible_to_worker }).eq('id', note.id)
    loadNotes()
  }

  const deleteNote = async (noteId) => {
    await supabase.from('tile_notes').delete().eq('id', noteId)
    loadNotes()
  }

  if (!tile) return null

  const currentStageIndex = stages.findIndex(s => s.id === tile.current_stage_id)
  const pendingTransition = tile.pending_transition
  const payments = tile.payments || []
  const totalValue = Number(tile.total_value) || 0
  const paidAmount = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0)
  const owedPayments = payments.filter(p => p.status === 'owed')

  const modalTitle = editingTitle ? (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={titleValue}
        onChange={(e) => setTitleValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setTitleValue(tile.title) } }}
        className="flex-1 rounded-md border border-input bg-white px-2 py-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button size="sm" onClick={saveTitle} disabled={savingTitle}>Save</Button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <span>{tile.title}</span>
      <button onClick={() => setEditingTitle(true)} className="text-muted-foreground hover:text-foreground">
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  )

  return (
    <Modal open={!!tile} onClose={onClose} title={modalTitle} className="max-w-md">
      <div className="space-y-4">
        {/* Stage progress */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase">Progress</label>
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            {stages.map((stage, i) => (
              <div key={stage.id} className="flex items-center gap-1">
                {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                <span className={`rounded px-2 py-1 text-xs font-medium ${
                  i < currentStageIndex ? 'bg-approved/10 text-approved' :
                  i === currentStageIndex ? 'bg-primary/10 text-primary ring-1 ring-primary/30' :
                  'bg-secondary text-muted-foreground'
                }`}>
                  {stage.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase">Status</label>
          <div className="mt-1">
            {tile.status === 'pending_approval' ? (
              <Badge variant="pending">Awaiting Approval</Badge>
            ) : tile.status === 'completed' ? (
              <Badge variant="approved">Completed</Badge>
            ) : tile.status === 'archived' ? (
              <Badge variant="archived">Archived</Badge>
            ) : (
              <Badge>Active</Badge>
            )}
          </div>
        </div>

        {/* Approval actions */}
        {isManager && tile.status === 'pending_approval' && pendingTransition && (
          <div className="rounded-lg border border-pending/30 bg-pending/5 p-3">
            <p className="text-sm font-medium text-pending">Approval Required</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Worker moved this tile to &quot;{stages.find(s => s.id === pendingTransition.to_stage_id)?.name}&quot;
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => onApprove(pendingTransition)}>
                <CheckCircle className="mr-1 h-3 w-3" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onReject(pendingTransition)}>
                <XCircle className="mr-1 h-3 w-3" /> Reject
              </Button>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="border-t border-border pt-3">
          <label className="text-xs font-medium text-muted-foreground uppercase">Notes</label>
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {notes.length === 0 && (
              <p className="text-xs text-muted-foreground">No notes yet.</p>
            )}
            {notes.map(note => (
              <div key={note.id} className={`rounded-md border p-2 text-sm ${
                note.visible_to_worker ? 'border-border bg-white' : 'border-amber-200 bg-amber-50'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                  {isManager && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => toggleNoteVisibility(note)}
                        className={`hover:opacity-80 ${note.visible_to_worker ? 'text-muted-foreground' : 'text-amber-600'}`}
                        title={note.visible_to_worker ? 'Visible to artist — click to hide' : 'Hidden from artist — click to show'}
                      >
                        {note.visible_to_worker ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{note.author?.display_name || 'Unknown'}</span>
                  <span>{new Date(note.created_at).toLocaleString()}</span>
                  {isManager && !note.visible_to_worker && (
                    <span className="text-amber-600">Manager only</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add note */}
          <div className="mt-3 flex gap-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              rows={1}
              className="flex-1 rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote() } }}
            />
            <Button size="sm" className="shrink-0 self-end" onClick={addNote} disabled={savingNote || !newNote.trim()}>
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Payment info */}
        {totalValue > 0 && (
          <div className="border-t border-border pt-3">
            <label className="text-xs font-medium text-muted-foreground uppercase">Payments</label>
            <div className="mt-2 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Value</span>
                <span className="font-medium">{formatCurrency(totalValue, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-approved">{formatCurrency(paidAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-medium text-pending">{formatCurrency(totalValue - paidAmount, currency)}</span>
              </div>

              {/* Progress bar */}
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-approved transition-all"
                  style={{ width: `${totalValue > 0 ? (paidAmount / totalValue) * 100 : 0}%` }}
                />
              </div>

              {/* Owed payments - manager can mark as paid */}
              {isManager && owedPayments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {owedPayments.map(payment => {
                    const paymentStage = stages.find(s => s.id === payment.stage_id)
                    return (
                      <div key={payment.id} className="flex items-center justify-between rounded-md border border-border p-2">
                        <div>
                          <p className="text-xs font-medium">{paymentStage?.name || 'Completion'}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(payment.amount, currency)}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => onMarkPaid(payment.id)}>
                          <DollarSign className="mr-1 h-3 w-3" /> Mark Paid
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="border-t border-border pt-3">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Created: {new Date(tile.created_at).toLocaleDateString()}</span>
            {tile.completed_at && <span>Completed: {new Date(tile.completed_at).toLocaleDateString()}</span>}
          </div>
        </div>

        {/* Delete */}
        {isManager && onDelete && (
          <div className="border-t border-border pt-3">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => {
                if (confirm(`Delete "${tile.title}"? This will remove the tile and all its payments.`)) {
                  onDelete(tile.id)
                }
              }}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete Tile
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
