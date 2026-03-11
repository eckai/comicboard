import { useState } from 'react'
import { DndContext, DragOverlay, pointerWithin, closestCenter } from '@dnd-kit/core'
import KanbanColumn from './KanbanColumn'
import TileCard from './TileCard'

export default function KanbanBoard({ stages, tiles, onMoveTile, onTileClick, isManager, currency }) {
  const [activeTile, setActiveTile] = useState(null)

  const realStages = stages.filter(s => !s.virtual)

  const tilesByStage = stages.reduce((acc, stage) => {
    acc[stage.id] = tiles.filter(t => t.current_stage_id === stage.id)
    return acc
  }, {})

  const finishedTiles = tilesByStage['__finished__'] || []

  const handleDragStart = (event) => {
    const tile = tiles.find(t => t.id === event.active.id)
    setActiveTile(tile)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    setActiveTile(null)

    if (!over) return

    const tile = tiles.find(t => t.id === active.id)
    if (!tile) return

    // Determine the target stage - could be dropping on a column or on another tile
    let targetStageId = over.id
    const overTile = tiles.find(t => t.id === over.id)
    if (overTile) {
      targetStageId = overTile.current_stage_id
    }

    // Don't allow dropping on the finished column
    if (targetStageId === '__finished__') return

    // Don't do anything if same stage
    if (tile.current_stage_id === targetStageId) return

    // Filter out virtual stages for index calculations
    const realStages = stages.filter(s => !s.virtual)
    const currentStageIndex = realStages.findIndex(s => s.id === tile.current_stage_id)
    const targetStageIndex = realStages.findIndex(s => s.id === targetStageId)

    // Workers can only move forward by one stage
    if (!isManager) {
      if (targetStageIndex !== currentStageIndex + 1) return
    }

    onMoveTile(tile, tile.current_stage_id, targetStageId)
  }

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto p-4 pb-8">
        {realStages.map(stage => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            tiles={tilesByStage[stage.id] || []}
            onTileClick={onTileClick}
            currency={currency}
          />
        ))}

        {/* Finished column - not a drop target */}
        <div className="flex w-72 shrink-0 flex-col rounded-xl bg-approved/5">
          <div className="flex items-center justify-between p-3 pb-2">
            <h3 className="text-sm font-semibold text-foreground">Finished</h3>
            <span className="rounded-full bg-approved/15 px-2 py-0.5 text-xs text-muted-foreground">
              {finishedTiles.length}
            </span>
          </div>
          <div
            className="flex-1 space-y-2 overflow-y-auto p-2 pt-0"
            style={{ minHeight: '100px', maxHeight: 'calc(100vh - 200px)' }}
          >
            {finishedTiles.map(tile => (
              <TileCard key={tile.id} tile={tile} onClick={onTileClick} currency={currency} />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeTile ? (
          <div className="w-72">
            <TileCard tile={activeTile} isDragging currency={currency} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
