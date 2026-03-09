import { useState } from 'react'
import { DndContext, DragOverlay, pointerWithin, closestCenter } from '@dnd-kit/core'
import KanbanColumn from './KanbanColumn'
import TileCard from './TileCard'

export default function KanbanBoard({ stages, tiles, onMoveTile, onTileClick, isManager }) {
  const [activeTile, setActiveTile] = useState(null)

  const tilesByStage = stages.reduce((acc, stage) => {
    acc[stage.id] = tiles.filter(t => t.current_stage_id === stage.id)
    return acc
  }, {})

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

    // Don't do anything if same stage
    if (tile.current_stage_id === targetStageId) return

    const currentStageIndex = stages.findIndex(s => s.id === tile.current_stage_id)
    const targetStageIndex = stages.findIndex(s => s.id === targetStageId)

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
        {stages.map(stage => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            tiles={tilesByStage[stage.id] || []}
            onTileClick={onTileClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTile ? (
          <div className="w-72">
            <TileCard tile={activeTile} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
