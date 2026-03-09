import { useState, useEffect, useCallback } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import KanbanBoard from '@/components/board/KanbanBoard'
import TileDetailModal from '@/components/board/TileDetailModal'
import TileListView from '@/components/list/TileListView'
import ExportDialog from '@/components/payments/ExportDialog'
import { Plus, LayoutGrid, List, Download } from 'lucide-react'

export default function ProjectBoard() {
  const { projectId } = useParams()
  const { profile, isManager } = useAuth()
  const { onMenuToggle } = useOutletContext()

  const [project, setProject] = useState(null)
  const [stages, setStages] = useState([])
  const [tiles, setTiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('kanban')
  const [selectedTile, setSelectedTile] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showBulkCreate, setShowBulkCreate] = useState(false)

  // Create tile form
  const [newTitle, setNewTitle] = useState('')
  const [newValue, setNewValue] = useState('')
  const [bulkPrefix, setBulkPrefix] = useState('Page')
  const [bulkStart, setBulkStart] = useState('1')
  const [bulkEnd, setBulkEnd] = useState('10')
  const [bulkValue, setBulkValue] = useState('')

  const loadProject = useCallback(async () => {
    try {
      const { data: proj } = await supabase
        .from('projects')
        .select('*, workflows(name), worker:worker_id(display_name)')
        .eq('id', projectId)
        .single()

      if (!proj) return
      setProject(proj)

      const { data: stageData } = await supabase
        .from('workflow_stages')
        .select('*')
        .eq('workflow_id', proj.workflow_id)
        .order('stage_order', { ascending: true })

      setStages(stageData || [])
      await loadTiles(stageData || [])
    } catch (err) {
      console.error('Load project error:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadTiles = useCallback(async (stagesData) => {
    const stgs = stagesData || stages
    try {
      const { data: tileData } = await supabase
        .from('tiles')
        .select('*')
        .eq('project_id', projectId)
        .neq('status', 'archived')
        .order('created_at', { ascending: true })

      if (!tileData) return

      // Load payments and pending transitions for all tiles
      const tileIds = tileData.map(t => t.id)
      const [paymentsRes, transitionsRes] = await Promise.all([
        tileIds.length > 0
          ? supabase.from('payments').select('*').in('tile_id', tileIds)
          : { data: [] },
        tileIds.length > 0
          ? supabase.from('stage_transitions').select('*').in('tile_id', tileIds).is('approved_by', null).eq('rejected', false)
          : { data: [] },
      ])

      const payments = paymentsRes.data || []
      const transitions = transitionsRes.data || []

      const enriched = tileData.map(tile => ({
        ...tile,
        payments: payments.filter(p => p.tile_id === tile.id),
        pending_transition: transitions.find(t => t.tile_id === tile.id) || null,
      }))

      setTiles(enriched)
    } catch (err) {
      console.error('Load tiles error:', err)
    }
  }, [projectId, stages])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  const handleCreateTile = async () => {
    if (!newTitle.trim()) return
    try {
      await supabase.from('tiles').insert({
        project_id: projectId,
        title: newTitle,
        current_stage_id: stages[0]?.id,
        total_value: parseFloat(newValue) || 0,
      })
      setNewTitle('')
      setNewValue('')
      setShowCreateModal(false)
      loadTiles()
    } catch (err) {
      console.error('Create tile error:', err)
    }
  }

  const handleBulkCreate = async () => {
    const start = parseInt(bulkStart)
    const end = parseInt(bulkEnd)
    if (isNaN(start) || isNaN(end) || start > end) return

    try {
      const newTiles = []
      for (let i = start; i <= end; i++) {
        newTiles.push({
          project_id: projectId,
          title: `${bulkPrefix} ${i}`,
          current_stage_id: stages[0]?.id,
          total_value: parseFloat(bulkValue) || 0,
        })
      }
      await supabase.from('tiles').insert(newTiles)
      setShowBulkCreate(false)
      setBulkPrefix('Page')
      setBulkStart('1')
      setBulkEnd('10')
      setBulkValue('')
      loadTiles()
    } catch (err) {
      console.error('Bulk create error:', err)
    }
  }

  const handleMoveTile = async (tile, fromStageId, toStageId) => {
    try {
      // Create transition record
      await supabase.from('stage_transitions').insert({
        tile_id: tile.id,
        from_stage_id: fromStageId,
        to_stage_id: toStageId,
        moved_by: profile.id,
      })

      // If manager moves it, auto-approve. If approval not required, also auto-approve.
      if (isManager || !project.approval_required) {
        // Update tile stage directly
        await supabase.from('tiles').update({
          current_stage_id: toStageId,
          status: 'active',
        }).eq('id', tile.id)

        // Auto-approve the transition
        const { data: trans } = await supabase
          .from('stage_transitions')
          .select('id')
          .eq('tile_id', tile.id)
          .eq('to_stage_id', toStageId)
          .is('approved_by', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (trans) {
          await supabase.from('stage_transitions').update({
            approved_by: profile.id,
            approved_at: new Date().toISOString(),
          }).eq('id', trans.id)

          await createPaymentForStage(tile, toStageId)
        }
      } else {
        // Worker moved, needs approval - update stage but mark pending
        await supabase.from('tiles').update({
          current_stage_id: toStageId,
          status: 'pending_approval',
        }).eq('id', tile.id)
      }

      loadTiles()
    } catch (err) {
      console.error('Move tile error:', err)
    }
  }

  const createPaymentForStage = async (tile, stageId) => {
    if (!project || !tile.total_value || tile.total_value <= 0) return

    const stageIndex = stages.findIndex(s => s.id === stageId)
    const isLastStage = stageIndex === stages.length - 1

    if (project.payment_mode === 'on_completion') {
      if (isLastStage) {
        await supabase.from('payments').insert({
          tile_id: tile.id,
          stage_id: stageId,
          amount: tile.total_value,
        })
      }
    } else if (project.payment_mode === 'incremental_even') {
      const perStage = tile.total_value / stages.length
      await supabase.from('payments').insert({
        tile_id: tile.id,
        stage_id: stageId,
        amount: perStage,
      })
    } else if (project.payment_mode === 'incremental_custom') {
      const stage = stages.find(s => s.id === stageId)
      const pct = stage?.payment_pct || (100 / stages.length)
      const amount = (tile.total_value * pct) / 100
      await supabase.from('payments').insert({
        tile_id: tile.id,
        stage_id: stageId,
        amount,
      })
    }
  }

  const handleApprove = async (transition) => {
    try {
      await supabase.from('stage_transitions').update({
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      }).eq('id', transition.id)

      const tile = tiles.find(t => t.id === transition.tile_id)

      // Check if this is the last stage
      const toStageIndex = stages.findIndex(s => s.id === transition.to_stage_id)
      const isLastStage = toStageIndex === stages.length - 1

      await supabase.from('tiles').update({
        status: isLastStage ? 'completed' : 'active',
        completed_at: isLastStage ? new Date().toISOString() : null,
      }).eq('id', transition.tile_id)

      if (tile) {
        await createPaymentForStage(tile, transition.to_stage_id)
      }

      setSelectedTile(null)
      loadTiles()
    } catch (err) {
      console.error('Approve error:', err)
    }
  }

  const handleReject = async (transition) => {
    try {
      await supabase.from('stage_transitions').update({
        rejected: true,
      }).eq('id', transition.id)

      await supabase.from('tiles').update({
        current_stage_id: transition.from_stage_id,
        status: 'active',
      }).eq('id', transition.tile_id)

      setSelectedTile(null)
      loadTiles()
    } catch (err) {
      console.error('Reject error:', err)
    }
  }

  const handleMarkPaid = async (paymentId) => {
    try {
      await supabase.from('payments').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      }).eq('id', paymentId)

      // Check if all payments for this tile are paid
      const payment = tiles.flatMap(t => t.payments).find(p => p.id === paymentId)
      if (payment) {
        const tile = tiles.find(t => t.id === payment.tile_id)
        if (tile) {
          const allPayments = tile.payments.map(p => p.id === paymentId ? { ...p, status: 'paid' } : p)
          const allPaid = allPayments.every(p => p.status === 'paid')
          if (allPaid && tile.status === 'completed') {
            await supabase.from('tiles').update({ status: 'archived' }).eq('id', tile.id)
          }
        }
      }

      loadTiles()
      // Refresh selected tile data
      if (selectedTile) {
        const updated = tiles.find(t => t.id === selectedTile.id)
        if (updated) setSelectedTile(updated)
      }
    } catch (err) {
      console.error('Mark paid error:', err)
    }
  }

  if (loading) {
    return (
      <>
        <Header title="Loading..." onMenuToggle={onMenuToggle} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </>
    )
  }

  if (!project) {
    return (
      <>
        <Header title="Not Found" onMenuToggle={onMenuToggle} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Project not found.</p>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title={project.name} onMenuToggle={onMenuToggle}>
        <div className="flex items-center gap-2">
          <Badge>{project.workflows?.name}</Badge>
          {project.worker && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Artist: {project.worker.display_name}
            </span>
          )}

          <div className="flex rounded-lg border border-border">
            <button
              onClick={() => setView('kanban')}
              className={`p-1.5 ${view === 'kanban' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1.5 ${view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={() => setShowExport(true)}>
            <Download className="mr-1 h-3 w-3" /> Export
          </Button>

          {isManager && (
            <div className="flex gap-1">
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus className="mr-1 h-3 w-3" /> Tile
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowBulkCreate(true)}>
                <Plus className="mr-1 h-3 w-3" /> Bulk
              </Button>
            </div>
          )}
        </div>
      </Header>

      <div className="flex-1 overflow-hidden">
        {view === 'kanban' ? (
          <KanbanBoard
            stages={stages}
            tiles={tiles}
            onMoveTile={handleMoveTile}
            onTileClick={setSelectedTile}
            isManager={isManager}
          />
        ) : (
          <TileListView
            tiles={tiles}
            stages={stages}
            isManager={isManager}
            onTileClick={setSelectedTile}
            onApprove={handleApprove}
            onMarkPaid={handleMarkPaid}
          />
        )}
      </div>

      {/* Tile detail modal */}
      <TileDetailModal
        tile={selectedTile}
        stages={stages}
        isManager={isManager}
        onClose={() => setSelectedTile(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onMarkPaid={handleMarkPaid}
      />

      {/* Create single tile modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Tile">
        <div className="space-y-4">
          <Input
            label="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder='e.g. "Page 1"'
          />
          <Input
            label="Total Value ($)"
            type="number"
            min="0"
            step="0.01"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="0.00"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreateTile}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Bulk create modal */}
      <Modal open={showBulkCreate} onClose={() => setShowBulkCreate(false)} title="Bulk Create Tiles">
        <div className="space-y-4">
          <Input
            label="Prefix"
            value={bulkPrefix}
            onChange={(e) => setBulkPrefix(e.target.value)}
            placeholder="Page"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Number"
              type="number"
              min="1"
              value={bulkStart}
              onChange={(e) => setBulkStart(e.target.value)}
            />
            <Input
              label="End Number"
              type="number"
              min="1"
              value={bulkEnd}
              onChange={(e) => setBulkEnd(e.target.value)}
            />
          </div>
          <Input
            label="Value per Tile ($)"
            type="number"
            min="0"
            step="0.01"
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground">
            This will create {Math.max(0, (parseInt(bulkEnd) || 0) - (parseInt(bulkStart) || 0) + 1)} tiles
            named "{bulkPrefix} {bulkStart}" through "{bulkPrefix} {bulkEnd}"
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowBulkCreate(false)}>Cancel</Button>
            <Button onClick={handleBulkCreate}>Create Tiles</Button>
          </div>
        </div>
      </Modal>

      {/* Export dialog */}
      <ExportDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        tiles={tiles}
        stages={stages}
        projectName={project.name}
      />
    </>
  )
}
