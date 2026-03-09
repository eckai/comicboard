import { useAuth } from '@/contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, Workflow, Users, LogOut, ChevronLeft } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function Sidebar({ collapsed, onToggle }) {
  const { profile, signOut, isManager } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/', show: true },
    { icon: FolderKanban, label: 'Projects', path: '/projects', show: true },
    { icon: Workflow, label: 'Workflows', path: '/workflows', show: isManager },
    { icon: Users, label: 'Workers', path: '/workers', show: isManager },
  ]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className={`flex flex-col border-r border-border bg-white transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        {!collapsed && <span className="text-lg font-bold text-primary">ComicBoard</span>}
        <button
          onClick={onToggle}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.filter(item => item.show).map(item => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-border p-2">
        {!collapsed && (
          <div className="mb-2 px-3 py-1">
            <p className="text-sm font-medium text-foreground truncate">{profile?.display_name}</p>
            <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
