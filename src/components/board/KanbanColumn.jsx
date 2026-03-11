import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TileCard from './TileCard'

export default function KanbanColumn({ stage, tiles, onTileClick, currency }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-secondary/50">
      <div className="flex items-center justify-between p-3 pb-2">
        <h3 className="text-sm font-semibold text-foreground">{stage.name}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          {tiles.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto p-2 pt-0 transition-colors ${isOver ? 'bg-primary/5' : ''}`}
        style={{ minHeight: '100px', maxHeight: 'calc(100vh - 200px)' }}
      >
        <SortableContext items={tiles.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tiles.map(tile => (
            <TileCard key={tile.id} tile={tile} onClick={onTileClick} currency={currency} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
