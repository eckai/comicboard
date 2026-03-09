import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import Card, { CardHeader, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { Plus, Trash2, GripVertical } from 'lucide-react'

export default function WorkflowsPage() {
  const { profile } = useAuth()
  const { onMenuToggle } = useOutletContext()
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState(null)
  const [workflowName, setWorkflowName] = useState('')
  const [stages, setStages] = useState([{ name: '', stage_order: 1 }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadWorkflows()
  }, [profile])

  const loadWorkflows = async () => {
    if (!profile) return
    try {
      const { data } = await supabase
        .from('workflows')
        .select('*, workflow_stages(*)')
        .eq('manager_id', profile.id)
        .order('created_at', { ascending: false })

      const sorted = (data || []).map(w => ({
        ...w,
        workflow_stages: (w.workflow_stages || []).sort((a, b) => a.stage_order - b.stage_order),
      }))
      setWorkflows(sorted)
    } catch (err) {
      console.error('Load workflows error:', err)
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingWorkflow(null)
    setWorkflowName('')
    setStages([{ name: '', stage_order: 1 }])
    setModalOpen(true)
  }

  const openEditModal = (workflow) => {
    setEditingWorkflow(workflow)
    setWorkflowName(workflow.name)
    setStages(workflow.workflow_stages.map(s => ({ id: s.id, name: s.name, stage_order: s.stage_order })))
    setModalOpen(true)
  }

  const addStage = () => {
    setStages([...stages, { name: '', stage_order: stages.length + 1 }])
  }

  const removeStage = (index) => {
    if (stages.length <= 1) return
    const updated = stages.filter((_, i) => i !== index).map((s, i) => ({ ...s, stage_order: i + 1 }))
    setStages(updated)
  }

  const updateStageName = (index, name) => {
    const updated = [...stages]
    updated[index] = { ...updated[index], name }
    setStages(updated)
  }

  const handleSave = async () => {
    if (!workflowName.trim() || stages.some(s => !s.name.trim())) return
    setSaving(true)

    try {
      if (editingWorkflow) {
        await supabase.from('workflows').update({ name: workflowName }).eq('id', editingWorkflow.id)
        await supabase.from('workflow_stages').delete().eq('workflow_id', editingWorkflow.id)
        await supabase.from('workflow_stages').insert(
          stages.map(s => ({
            workflow_id: editingWorkflow.id,
            name: s.name,
            stage_order: s.stage_order,
          }))
        )
      } else {
        const { data: workflow } = await supabase
          .from('workflows')
          .insert({ name: workflowName, manager_id: profile.id })
          .select()
          .single()

        await supabase.from('workflow_stages').insert(
          stages.map(s => ({
            workflow_id: workflow.id,
            name: s.name,
            stage_order: s.stage_order,
          }))
        )
      }

      setModalOpen(false)
      loadWorkflows()
    } catch (err) {
      console.error('Save workflow error:', err)
    } finally {
      setSaving(false)
    }
  }

  const deleteWorkflow = async (id) => {
    if (!confirm('Delete this workflow? Projects using it will need a new workflow.')) return
    try {
      await supabase.from('workflows').delete().eq('id', id)
      loadWorkflows()
    } catch (err) {
      console.error('Delete workflow error:', err)
    }
  }

  return (
    <>
      <Header title="Workflows" onMenuToggle={onMenuToggle}>
        <Button onClick={openCreateModal} size="sm">
          <Plus className="mr-1 h-4 w-4" /> New Workflow
        </Button>
      </Header>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {loading ? (
          <p className="text-muted-foreground">Loading workflows...</p>
        ) : workflows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No workflows yet. Create one to define your production pipeline.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map(workflow => (
              <Card key={workflow.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{workflow.name}</h3>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(workflow)}>Edit</Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteWorkflow(workflow.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {workflow.workflow_stages.map((stage, i) => (
                      <span key={stage.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                        {i > 0 && <span className="text-border">&rarr;</span>}
                        <span className="rounded bg-secondary px-2 py-0.5">{stage.name}</span>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingWorkflow ? 'Edit Workflow' : 'New Workflow'}
      >
        <div className="space-y-4">
          <Input
            label="Workflow Name"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            placeholder='e.g. "Full Render Pipeline"'
          />

          <div>
            <label className="text-sm font-medium">Stages (in order)</label>
            <div className="mt-2 space-y-2">
              {stages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                  <input
                    className="flex h-8 w-full rounded-md border border-input bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={stage.name}
                    onChange={(e) => updateStageName(i, e.target.value)}
                    placeholder={`Stage ${i + 1} name`}
                  />
                  {stages.length > 1 && (
                    <button onClick={() => removeStage(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addStage} className="mt-2">
              <Plus className="mr-1 h-3 w-3" /> Add Stage
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Workflow'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
