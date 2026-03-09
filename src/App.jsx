import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/components/auth/LoginPage'
import InvitePage from '@/components/auth/InvitePage'
import Dashboard from '@/components/pages/Dashboard'
import ProjectsPage from '@/components/pages/ProjectsPage'
import ProjectBoard from '@/components/pages/ProjectBoard'
import WorkflowsPage from '@/components/pages/WorkflowsPage'
import WorkersPage from '@/components/pages/WorkersPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function ProtectedRoute({ children, requireManager = false }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (requireManager && profile?.role !== 'manager') return <Navigate to="/" replace />

  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/invite" element={<InvitePage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectBoard />} />
        <Route
          path="workflows"
          element={
            <ProtectedRoute requireManager>
              <WorkflowsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="workers"
          element={
            <ProtectedRoute requireManager>
              <WorkersPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
