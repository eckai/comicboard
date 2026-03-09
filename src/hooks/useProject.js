import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useProjects() {
  const { user, isManager } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let query

      if (isManager) {
        query = supabase
          .from('projects')
          .select('*, worker:users!projects_worker_id_fkey(*)')
          .eq('manager_id', user.id)
          .order('created_at', { ascending: false })
      } else {
        query = supabase
          .from('projects')
          .select('*, manager:users!projects_manager_id_fkey(*)')
          .eq('worker_id', user.id)
          .order('created_at', { ascending: false })
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError
      setProjects(data || [])
    } catch (err) {
      console.error('Error fetching projects:', err.message)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user, isManager])

  const createProject = useCallback(async (name, workerId, workflowId, paymentMode) => {
    setError(null)

    try {
      const { data, error: insertError } = await supabase
        .from('projects')
        .insert({
          name,
          manager_id: user.id,
          worker_id: workerId,
          workflow_id: workflowId,
          payment_mode: paymentMode,
        })
        .select()
        .single()

      if (insertError) throw insertError
      return { data, error: null }
    } catch (err) {
      console.error('Error creating project:', err.message)
      setError(err.message)
      return { data: null, error: err }
    }
  }, [user])

  const updateProject = useCallback(async (id, updates) => {
    setError(null)

    try {
      const { data, error: updateError } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError
      return { data, error: null }
    } catch (err) {
      console.error('Error updating project:', err.message)
      setError(err.message)
      return { data: null, error: err }
    }
  }, [])

  const deleteProject = useCallback(async (id) => {
    setError(null)

    try {
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      return { error: null }
    } catch (err) {
      console.error('Error deleting project:', err.message)
      setError(err.message)
      return { error: err }
    }
  }, [])

  return {
    projects,
    loading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  }
}
