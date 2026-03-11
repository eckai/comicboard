import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Sun, Moon, Lock } from 'lucide-react'

export default function SettingsPage() {
  const { profile } = useAuth()
  const { onMenuToggle } = useOutletContext()
  const { theme, toggleTheme } = useTheme()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const handleChangePassword = async () => {
    setMessage(null)

    if (!newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all fields.' })
      return
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setSaving(true)
    try {
      // Verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      })
      if (signInError) {
        setMessage({ type: 'error', text: 'Current password is incorrect.' })
        return
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage({ type: 'success', text: 'Password updated successfully.' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update password.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Header title="Settings" onMenuToggle={onMenuToggle} />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 max-w-2xl">
        {/* Theme */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Appearance</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Theme</p>
                <p className="text-xs text-muted-foreground">Switch between light and dark mode</p>
              </div>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                {theme === 'light' ? (
                  <>
                    <Sun className="h-4 w-4" /> Light
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4" /> Dark
                  </>
                )}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4" /> Change Password
            </h3>
            <div className="space-y-3">
              <Input
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />

              {message && (
                <p className={`text-sm ${message.type === 'error' ? 'text-destructive' : 'text-approved'}`}>
                  {message.text}
                </p>
              )}

              <Button onClick={handleChangePassword} disabled={saving}>
                {saving ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Account</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span>{profile?.display_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{profile?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <span className="capitalize">{profile?.role}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
