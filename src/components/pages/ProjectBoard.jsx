import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import KanbanBoard from '@/components/board/KanbanBoard'
import TileDetailModal from '@/components/board/TileDetailModal'
import TileListView from '@/components/list/TileListView'
import ExportDialog from '@/components/payments/ExportDialog'
import { Plus, LayoutGrid, List, Download, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'

export default function ProjectBoard() {
  const { projectId } = useParams()
  const { profile, isManager } = useAuth()
  const { onMenuToggle } = useOutletContext()

  const [project, setProject] = useState(null)
  const [workflows, setWorkflows] = useState([])
  const [stagesByWorkflow, setStagesByWorkflow] = useState({})
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null)
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
  const [newWorkflowId, setNewWorkflowId] = useState('')
  const [bulkPrefix, setBulkPrefix] = useState('Page')
  const [bulkStart, setBulkStart] = useState('1')
  const [bulkEnd, setBulkEnd] = useState('10')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkWorkflowId, setBulkWorkflowId] = useState('')

  // Derived: stages for the currently selected workflow tab
  const stages = useMemo(() => {
    if (!selectedWorkflowId) return []
    return stagesByWorkflow[selectedWorkflowId] || []
  }, [selectedWorkflowId, stagesByWorkflow])

  // Derived: tiles filtered by selected workflow
  const filteredTiles = useMemo(() => {
    if (!selectedWorkflowId) return tiles
    return tiles.filter(t => t.workflow_id === selectedWorkflowId)
  }, [tiles, selectedWorkflowId])

  // Derived: active tiles (for kanban columns, excluding completed)
  const activeTiles = useMemo(() => {
    return filteredTiles.filter(t => t.status !== 'completed')
  }, [filteredTiles])

  // Derived: finished tiles (completed but not yet archived)
  const finishedTiles = useMemo(() => {
    return filteredTiles.filter(t => t.status === 'completed')
  }, [filteredTiles])

  // Derived: payment summary across ALL tiles in the project (not filtered)
  const paymentSummary = useMemo(() => {
    let totalValue = 0
    let totalPaid = 0
    let totalOwed = 0
    for (const tile of tiles) {
      totalValue += tile.total_value || 0
      for (const p of tile.payments || []) {
        if (p.status === 'paid') {
          totalPaid += p.amount || 0
        } else {
          totalOwed += p.amount || 0
        }
      }
    }
    return { totalValue, totalPaid, totalOwed }
  }, [tiles])

  const loadProject = useCallback(async () => {
    try {
      const { data: proj } = await supabase
        .from('projects')
        .select('*, worker:worker_id(display_name)')
        .eq('id', projectId)
        .single()

      if (!proj) return
      setProject(proj)

      // Load all tiles for the project (non-archived) to discover workflow IDs
      const { data: tileData } = await supabase
        .from('tiles')
        .select('*')
        .eq('project_id', projectId)
        .neq('status', 'archived')
        .order('created_at', { ascending: true })

      const allTiles = tileData || []

      // Collect distinct workflow IDs from tiles
      const tileWorkflowIds = [...new Set(allTiles.map(t => t.workflow_id).filter(Boolean))]

      // Load all workflows owned by the manager (for creating new tiles)
      // and also any workflows referenced by existing tiles
      let managerWorkflowIds = []
      if (isManager && profile?.id) {
        const { data: managerWorkflows } = await supabase
          .from('workflows')
          .select('id')
          .eq('manager_id', profile.id)
        managerWorkflowIds = (managerWorkflows || []).map(w => w.id)
      }

      const allWorkflowIds = [...new Set([...tileWorkflowIds, ...managerWorkflowIds])]

      if (allWorkflowIds.length === 0) {
        setWorkflows([])
        setStagesByWorkflow({})
        setTiles([])
        setLoading(false)
        return
      }

      // Load workflow details
      const { data: workflowData } = await supabase
        .from('workflows')
        .select('*')
        .in('id', allWorkflowIds)

      const loadedWorkflows = workflowData || []
      setWorkflows(loadedWorkflows)

      // Load stages for all workflows
      const { data: allStages } = await supabase
        .from('workflow_stages')
        .select('*')
        .in('workflow_id', allWorkflowIds)
        .order('stage_order', { ascending: true })

      const grouped = {}
      for (const stage of allStages || []) {
        if (!grouped[stage.workflow_id]) grouped[stage.workflow_id] = []
        grouped[stage.workflow_id].push(stage)
      }
      setStagesByWorkflow(grouped)

      // Default to first workflow that has tiles, or first available
      if (!selectedWorkflowId || !allWorkflowIds.includes(selectedWorkflowId)) {
        const defaultId = tileWorkflowIds[0] || allWorkflowIds[0]
        setSelectedWorkflowId(defaultId)
      }

      // Enrich tiles with payments and transitions
      await enrichAndSetTiles(allTiles)
    } catch (err) {
      console.error('Load project error:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId, isManager, profile?.id])

  const enrichAndSetTiles = async (tileData) => {
    const tileIds = tileData.map(t => t.id)
    if (tileIds.length === 0) {
      setTiles([])
      return
    }

    const [paymentsRes, transitionsRes] = await Promise.all([
      supabase.from('payments').select('*').in('tile_id', tileIds),
      supabase.from('stage_transitions').select('*').in('tile_id', tileIds).is('approved_by', null).eq('rejected', false),
    ])

    const payments = paymentsRes.data || []
    const transitions = transitionsRes.data || []

    const enriched = tileData.map(tile => ({
      ...tile,
      payments: payments.filter(p => p.tile_id === tile.id),
      pending_transition: transitions.find(t => t.tile_id === tile.id) || null,
    }))

    setTiles(enriched)
  }

  const loadTiles = useCallback(async () => {
    try {
      const { data: tileData } = await supabase
        .from('tiles')
        .select('*')
        .eq('project_id', projectId)
        .neq('status', 'archived')
        .order('created_at', { ascending: true })

      if (!tileData) return
      await enrichAndSetTiles(tileData)
    } catch (err) {
      console.error('Load tiles error:', err)
    }
  }, [projectId])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  // Helper: get stages for a specific workflow
  const getStagesForWorkflow = useCallback((workflowId) => {
    return stagesByWorkflow[workflowId] || []
  }, [stagesByWorkflow])

  const handleCreateTile = async () => {
    if (!newTitle.trim()) return
    const workflowId = newWorkflowId || selectedWorkflowId
    if (!workflowId) return

    const wfStages = getStagesForWorkflow(workflowId)
    const firstStageId = wfStages[0]?.id

    try {
      const { data, error } = await supabase.from('tiles').insert({
        project_id: projectId,
        workflow_id: workflowId,
        title: newTitle,
        current_stage_id: firstStageId,
        total_value: parseFloat(newValue) || 0,
      }).select()

      if (error) {
        console.error('Create tile error:', error)
        return
      }

      setNewTitle('')
      setNewValue('')
      setNewWorkflowId('')
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

    const workflowId = bulkWorkflowId || selectedWorkflowId
    if (!workflowId) return

    const wfStages = getStagesForWorkflow(workflowId)
    const firstStageId = wfStages[0]?.id

    try {
      const newTiles = []
      for (let i = start; i <= end; i++) {
        newTiles.push({
          project_id: projectId,
          workflow_id: workflowId,
          title: `${bulkPrefix} ${i}`,
          current_stage_id: firstStageId,
          total_value: parseFloat(bulkValue) || 0,
        })
      }

      const { data, error } = await supabase.from('tiles').insert(newTiles).select()

      if (error) {
        console.error('Bulk create error:', error)
        return
      }

      setShowBulkCreate(false)
      setBulkPrefix('Page')
      setBulkStart('1')
      setBulkEnd('10')
      setBulkValue('')
      setBulkWorkflowId('')
      loadTiles()
    } catch (err) {
      console.error('Bulk create error:', err)
    }
  }

  const handleDeleteTile = async (tileId) => {
    try {
      const { error } = await supabase.from('tiles').delete().eq('id', tileId)
      if (error) {
        console.error('Delete tile error:', error)
        return
      }
      setSelectedTile(null)
      loadTiles()
    } catch (err) {
      console.error('Delete tile error:', err)
    }
  }

  const handleMoveTile = async (tile, fromStageId, toStageId) => {
    // Determine the stages for this tile's workflow
    const tileStages = getStagesForWorkflow(tile.workflow_id)

    try {
      // Create transition record
      await supabase.from('stage_transitions').insert({
        tile_id: tile.id,
        from_stage_id: fromStageId,
        to_stage_id: toStageId,
        moved_by: profile.id,
      })

      const toStageIndex = tileStages.findIndex(s => s.id === toStageId)
      const isLastStage = toStageIndex === tileStages.length - 1

      // If manager moves it, auto-approve. If approval not required, also auto-approve.
      if (isManager || !project.approval_required) {
        // Update tile stage directly
        await supabase.from('tiles').update({
          current_stage_id: toStageId,
          status: isLastStage ? 'completed' : 'active',
          completed_at: isLastStage ? new Date().toISOString() : null,
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

          await createPaymentForStage(tile, toStageId, tileStages)
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

  const createPaymentForStage = async (tile, stageId, tileStages) => {
    const stgs = tileStages || getStagesForWorkflow(tile.workflow_id)
    if (!project || !tile.total_value || tile.total_value <= 0) return

    const stageIndex = stgs.findIndex(s => s.id === stageId)
    const isLastStage = stageIndex === stgs.length - 1

    if (project.payment_mode === 'on_completion') {
      if (isLastStage) {
        await supabase.from('payments').insert({
          tile_id: tile.id,
          stage_id: stageId,
          amount: tile.total_value,
        })
      }
    } else if (project.payment_mode === 'incremental_even') {
      const perStage = tile.total_value / stgs.length
      await supabase.from('payments').insert({
        tile_id: tile.id,
        stage_id: stageId,
        amount: perStage,
      })
    } else if (project.payment_mode === 'incremental_custom') {
      const stage = stgs.find(s => s.id === stageId)
      const pct = stage?.payment_pct || (100 / stgs.length)
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
      const tileStages = tile ? getStagesForWorkflow(tile.workflow_id) : []

      // Check if this is the last stage
      const toStageIndex = tileStages.findIndex(s => s.id === transition.to_stage_id)
      const isLastStage = toStageIndex === tileStages.length - 1

      await supabase.from('tiles').update({
        status: isLastStage ? 'completed' : 'active',
        completed_at: isLastStage ? new Date().toISOString() : null,
      }).eq('id', transition.tile_id)

      if (tile) {
        await createPaymentForStage(tile, transition.to_stage_id, tileStages)
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

  // Format currency using project setting
  const currency = project?.currency || 'USD'
  const fmt = (v) => formatCurrency(v, currency)

  // Workflow options for select dropdowns
  const workflowOptions = useMemo(() => {
    return workflows.map(w => ({ value: w.id, label: w.name }))
  }, [workflows])

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

  // Build kanban stages: workflow stages + virtual "Finished" column
  const kanbanStages = [
    ...stages,
    { id: '__finished__', name: 'Finished', stage_order: 9999, virtual: true },
  ]

  // Build kanban tiles: active tiles in their stages + finished tiles mapped to the virtual column
  const kanbanTiles = [
    ...activeTiles,
    ...finishedTiles.map(t => ({ ...t, current_stage_id: '__finished__' })),
  ]

  return (
    <>
      <Header title={project.name} onMenuToggle={onMenuToggle}>
        <div className="flex items-center gap-2">
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

      {/* Payment summary bar - manager only */}
      {isManager && (
        <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Total Value:</span>
            <span className="font-medium">{fmt(paymentSummary.totalValue)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Paid:</span>
            <span className="font-medium text-green-600">{fmt(paymentSummary.totalPaid)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Owed:</span>
            <span className="font-medium text-amber-600">{fmt(paymentSummary.totalOwed)}</span>
          </div>
        </div>
      )}

      {/* Workflow tabs */}
      {workflows.length > 1 && (
        <div className="border-b border-border px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-muted-foreground mr-1 shrink-0">Workflow:</span>
          {workflows.map(wf => (
            <button
              key={wf.id}
              onClick={() => setSelectedWorkflowId(wf.id)}
              className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${
                selectedWorkflowId === wf.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {wf.name}
              <span className="ml-1.5 text-xs opacity-60">
                ({tiles.filter(t => t.workflow_id === wf.id).length})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Single workflow badge when only one */}
      {workflows.length === 1 && (
        <div className="border-b border-border px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Workflow:</span>
          <Badge>{workflows[0].name}</Badge>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {view === 'kanban' ? (
          <KanbanBoard
            stages={kanbanStages}
            tiles={kanbanTiles}
            onMoveTile={handleMoveTile}
            onTileClick={setSelectedTile}
            isManager={isManager}
            currency={currency}
          />
        ) : (
          <TileListView
            tiles={filteredTiles}
            stages={stages}
            isManager={isManager}
            onTileClick={setSelectedTile}
            onApprove={handleApprove}
            onMarkPaid={handleMarkPaid}
            currency={currency}
          />
        )}
      </div>

      {/* Tile detail modal */}
      <TileDetailModal
        tile={selectedTile}
        stages={selectedTile ? getStagesForWorkflow(selectedTile.workflow_id) : stages}
        isManager={isManager}
        onClose={() => setSelectedTile(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onMarkPaid={handleMarkPaid}
        onDelete={handleDeleteTile}
        onTileUpdate={loadTiles}
        currency={currency}
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
          {workflows.length > 1 && (
            <Select
              label="Workflow"
              value={newWorkflowId || selectedWorkflowId || ''}
              onChange={(e) => setNewWorkflowId(e.target.value)}
              options={workflowOptions}
              placeholder="Select workflow..."
            />
          )}
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
          {workflows.length > 1 && (
            <Select
              label="Workflow"
              value={bulkWorkflowId || selectedWorkflowId || ''}
              onChange={(e) => setBulkWorkflowId(e.target.value)}
              options={workflowOptions}
              placeholder="Select workflow..."
            />
          )}
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
        stages={Object.values(stagesByWorkflow).flat()}
        projectName={project.name}
      />
    </>
  )
}
