import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Badge from '@/components/ui/Badge'

export default function TileCard({ tile, onClick, isDragging }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: tile.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const statusBadge = () => {
    switch (tile.status) {
      case 'pending_approval':
        return <Badge variant="pending">Awaiting Approval</Badge>
      case 'completed':
        return <Badge variant="approved">Completed</Badge>
      case 'archived':
        return <Badge variant="archived">Archived</Badge>
      default:
        return null
    }
  }

  const paidAmount = tile.payments?.filter(p => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0) || 0
  const owedAmount = tile.payments?.filter(p => p.status === 'owed').reduce((sum, p) => sum + Number(p.amount), 0) || 0
  const totalValue = Number(tile.total_value) || 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onClick?.(tile) }}
      className="cursor-grab rounded-lg border border-border bg-white p-3 shadow-sm hover:shadow-md transition-shadow active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{tile.title}</p>
        {statusBadge()}
      </div>

      {totalValue > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            ${paidAmount.toFixed(2)} / ${totalValue.toFixed(2)}
          </span>
          {owedAmount > 0 && (
            <Badge variant="pending">${owedAmount.toFixed(2)} owed</Badge>
          )}
        </div>
      )}

      {/* Reserved space for future thumbnail */}
      <div className="mt-2 h-0" />
    </div>
  )
}
