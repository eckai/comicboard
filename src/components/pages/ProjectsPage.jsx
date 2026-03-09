import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { Plus, FolderKanban } from 'lucide-react'

export default function ProjectsPage() {
  const { profile, isManager } = useAuth()
  const { onMenuToggle } = useOutletContext()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    worker_id: '',
    workflow_id: '',
    payment_mode: 'on_completion',
  })

  useEffect(() => {
    loadData()
  }, [profile])

  const loadData = async () => {
    if (!profile) return
    try {
      const projectQuery = isManager
        ? supabase.from('projects').select('*, workflows(name), worker:worker_id(display_name)').eq('manager_id', profile.id)
        : supabase.from('projects').select('*, workflows(name), manager:manager_id(display_name)').eq('worker_id', profile.id)

      const { data: projectData } = await projectQuery.order('created_at', { ascending: false })
      setProjects(projectData || [])

      if (isManager) {
        const [wfRes, invRes] = await Promise.all([
          supabase.from('workflows').select('id, name').eq('manager_id', profile.id),
          supabase.from('invites').select('used_by').eq('manager_id', profile.id).not('used_by', 'is', null),
        ])
        setWorkflows(wfRes.data || [])

        const workerIds = [...new Set((invRes.data || []).map(i => i.used_by))]
        if (workerIds.length > 0) {
          const { data: workerData } = await supabase.from('users').select('id, display_name, email').in('id', workerIds)
          setWorkers(workerData || [])
        }
      }
    } catch (err) {
      console.error('Load projects error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!form.name || !form.worker_id || !form.workflow_id) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: form.name,
          manager_id: profile.id,
          worker_id: form.worker_id,
          workflow_id: form.workflow_id,
          payment_mode: form.payment_mode,
        })
        .select()
        .single()

      if (error) throw error
      setModalOpen(false)
      setForm({ name: '', worker_id: '', workflow_id: '', payment_mode: 'on_completion' })
      loadData()
    } catch (err) {
      console.error('Create project error:', err)
    } finally {
      setSaving(false)
    }
  }

  const paymentModeOptions = [
    { value: 'on_completion', label: 'Pay on completion' },
    { value: 'incremental_even', label: 'Pay per stage (even split)' },
    { value: 'incremental_custom', label: 'Pay per stage (custom %)' },
  ]

  return (
    <>
      <Header title="Projects" onMenuToggle={onMenuToggle}>
        {isManager && (
          <Button onClick={() => setModalOpen(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" /> New Project
          </Button>
        )}
      </Header>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {loading ? (
          <p className="text-muted-foreground">Loading projects...</p>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FolderKanban className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                {isManager ? 'No projects yet. Create your first project!' : 'No projects assigned to you.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(project => (
              <Card
                key={project.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg">{project.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isManager ? `Artist: ${project.worker?.display_name || 'Unassigned'}` : `Manager: ${project.manager?.display_name || ''}`}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Badge>{project.workflows?.name || 'No workflow'}</Badge>
                    <Badge variant="default">{project.payment_mode.replace(/_/g, ' ')}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Project">
        <div className="space-y-4">
          <Input
            label="Project Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder='e.g. "Issue #1 - Origins"'
          />
          <Select
            label="Assign Worker"
            value={form.worker_id}
            onChange={(e) => setForm({ ...form, worker_id: e.target.value })}
            placeholder="Select a worker..."
            options={workers.map(w => ({ value: w.id, label: `${w.display_name} (${w.email})` }))}
          />
          <Select
            label="Workflow"
            value={form.workflow_id}
            onChange={(e) => setForm({ ...form, workflow_id: e.target.value })}
            placeholder="Select a workflow..."
            options={workflows.map(w => ({ value: w.id, label: w.name }))}
          />
          <Select
            label="Payment Mode"
            value={form.payment_mode}
            onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
            options={paymentModeOptions}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
