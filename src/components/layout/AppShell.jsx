import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless toggled */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:relative lg:z-0 ${mobileOpen ? 'block' : 'hidden lg:block'}`}>
        <Sidebar
          collapsed={collapsed}
          onToggle={() => {
            setCollapsed(!collapsed)
            setMobileOpen(false)
          }}
        />
      </div>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet context={{ onMenuToggle: () => setMobileOpen(!mobileOpen) }} />
      </main>
    </div>
  )
}
