import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function usePayments(projectId) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState({ totalOwed: 0, totalPaid: 0, totalOutstanding: 0 })

  const fetchPayments = useCallback(async () => {
    if (!projectId) return

    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          tile:tiles!payments_tile_id_fkey(
            id,
            title,
            project_id,
            current_stage_id,
            total_value,
            status
          ),
          stage:workflow_stages!payments_stage_id_fkey(
            id,
            name,
            stage_order
          )
        `)
        .eq('tile.project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Filter out rows where tile is null (join filter artifact)
      const filtered = (data || []).filter((p) => p.tile !== null)
      setPayments(filtered)
      computeSummary(filtered)
    } catch (err) {
      console.error('Error fetching payments:', err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const computeSummary = useCallback((paymentsList) => {
    const totalOwed = paymentsList.reduce((sum, p) => sum + (p.amount || 0), 0)
    const totalPaid = paymentsList
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0)
    const totalOutstanding = totalOwed - totalPaid

    setSummary({ totalOwed, totalPaid, totalOutstanding })
  }, [])

  const markAsPaid = useCallback(async (paymentId) => {
    try {
      const { data: payment, error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', paymentId)
        .select('*, tile:tiles!payments_tile_id_fkey(id, current_stage_id, total_value, status, project_id)')
        .single()

      if (updateError) throw updateError

      // Check if all payments for this tile are paid
      const tileId = payment.tile?.id
      if (tileId) {
        const { data: tilePayments, error: fetchError } = await supabase
          .from('payments')
          .select('status')
          .eq('tile_id', tileId)

        if (fetchError) throw fetchError

        const allPaid = tilePayments.every((p) => p.status === 'paid')

        if (allPaid && payment.tile) {
          // Check if tile is at the final stage of its workflow
          const { data: project, error: projError } = await supabase
            .from('projects')
            .select('workflow_id')
            .eq('id', payment.tile.project_id)
            .single()

          if (projError) throw projError

          const { data: stages, error: stagesError } = await supabase
            .from('workflow_stages')
            .select('id, stage_order')
            .eq('workflow_id', project.workflow_id)
            .order('stage_order', { ascending: false })
            .limit(1)

          if (stagesError) throw stagesError

          const isFinalStage = stages.length > 0 && stages[0].id === payment.tile.current_stage_id

          if (isFinalStage) {
            const { error: tileUpdateError } = await supabase
              .from('tiles')
              .update({ status: 'completed' })
              .eq('id', tileId)

            if (tileUpdateError) throw tileUpdateError
          }
        }
      }

      return { data: payment, error: null }
    } catch (err) {
      console.error('Error marking payment as paid:', err.message)
      return { data: null, error: err }
    }
  }, [])

  return {
    payments,
    loading,
    summary,
    fetchPayments,
    markAsPaid,
  }
}
