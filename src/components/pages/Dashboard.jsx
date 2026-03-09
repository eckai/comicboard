import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import Card, { CardHeader, CardContent } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { FolderKanban, DollarSign, Clock, CheckCircle } from 'lucide-react'

export default function Dashboard() {
  const { profile, isManager } = useAuth()
  const { onMenuToggle } = useOutletContext()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ projects: 0, pendingApprovals: 0, totalOwed: 0, completedTiles: 0 })
  const [recentProjects, setRecentProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [profile])

  const loadDashboard = async () => {
    if (!profile) return
    try {
      const projectFilter = isManager
        ? supabase.from('projects').select('*, workflows(name)').eq('manager_id', profile.id)
        : supabase.from('projects').select('*, workflows(name)').eq('worker_id', profile.id)

      const { data: projects } = await projectFilter.order('created_at', { ascending: false })
      setRecentProjects(projects || [])

      const projectIds = (projects || []).map(p => p.id)
      if (projectIds.length === 0) {
        setStats({ projects: 0, pendingApprovals: 0, totalOwed: 0, completedTiles: 0 })
        setLoading(false)
        return
      }

      const [tilesRes, paymentsRes] = await Promise.all([
        supabase.from('tiles').select('id, status').in('project_id', projectIds),
        supabase.from('payments').select('amount, status').in('tile_id',
          (await supabase.from('tiles').select('id').in('project_id', projectIds)).data?.map(t => t.id) || []
        ),
      ])

      const tiles = tilesRes.data || []
      const payments = paymentsRes.data || []

      setStats({
        projects: projectIds.length,
        pendingApprovals: tiles.filter(t => t.status === 'pending_approval').length,
        totalOwed: payments.filter(p => p.status === 'owed').reduce((sum, p) => sum + Number(p.amount), 0),
        completedTiles: tiles.filter(t => t.status === 'completed' || t.status === 'archived').length,
      })
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { icon: FolderKanban, label: 'Projects', value: stats.projects, color: 'text-primary' },
    { icon: Clock, label: 'Pending Approvals', value: stats.pendingApprovals, color: 'text-pending' },
    { icon: DollarSign, label: 'Total Owed', value: `$${stats.totalOwed.toFixed(2)}`, color: 'text-destructive' },
    { icon: CheckCircle, label: 'Completed Tiles', value: stats.completedTiles, color: 'text-approved' },
  ]

  return (
    <>
      <Header title="Dashboard" onMenuToggle={onMenuToggle} />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {loading ? (
          <p className="text-muted-foreground">Loading dashboard...</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {statCards.map(stat => {
                const Icon = stat.icon
                return (
                  <Card key={stat.label}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Icon className={`h-8 w-8 ${stat.color}`} />
                        <div>
                          <p className="text-2xl font-bold">{stat.value}</p>
                          <p className="text-xs text-muted-foreground">{stat.label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <div>
              <h2 className="mb-3 text-lg font-semibold">Recent Projects</h2>
              {recentProjects.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">
                      {isManager ? 'No projects yet. Create one to get started!' : 'No projects assigned to you yet.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recentProjects.slice(0, 6).map(project => (
                    <Card
                      key={project.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <CardContent className="p-4">
                        <h3 className="font-medium">{project.name}</h3>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge>{project.workflows?.name || 'No workflow'}</Badge>
                          <Badge variant="default">{project.payment_mode.replace(/_/g, ' ')}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
