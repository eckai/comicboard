import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { CheckCircle, XCircle, DollarSign, ArrowRight } from 'lucide-react'

export default function TileDetailModal({ tile, stages, isManager, onClose, onApprove, onReject, onMarkPaid }) {
  if (!tile) return null

  const currentStage = stages.find(s => s.id === tile.current_stage_id)
  const currentStageIndex = stages.findIndex(s => s.id === tile.current_stage_id)
  const pendingTransition = tile.pending_transition
  const payments = tile.payments || []
  const totalValue = Number(tile.total_value) || 0
  const paidAmount = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0)
  const owedPayments = payments.filter(p => p.status === 'owed')

  return (
    <Modal open={!!tile} onClose={onClose} title={tile.title} className="max-w-md">
      <div className="space-y-4">
        {/* Stage progress */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase">Progress</label>
          <div className="mt-2 flex items-center gap-1">
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
              Worker moved this tile to "{stages.find(s => s.id === pendingTransition.to_stage_id)?.name}"
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

        {/* Payment info */}
        {totalValue > 0 && (
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase">Payments</label>
            <div className="mt-2 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Value</span>
                <span className="font-medium">${totalValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-approved">${paidAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-medium text-pending">${(totalValue - paidAmount).toFixed(2)}</span>
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
                          <p className="text-xs text-muted-foreground">${Number(payment.amount).toFixed(2)}</p>
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
      </div>
    </Modal>
  )
}
