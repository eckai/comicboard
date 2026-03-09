import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useTiles(projectId) {
  const [tiles, setTiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchTiles = useCallback(async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)

    try {
      const { data: tilesData, error: tilesError } = await supabase
        .from('tiles')
        .select(`
          *,
          current_stage:workflow_stages!tiles_current_stage_id_fkey(*),
          stage_transitions(
            id,
            from_stage_id,
            to_stage_id,
            moved_by,
            approved_by,
            approved_at,
            rejected,
            created_at
          )
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })

      if (tilesError) throw tilesError

      // Attach latest transition to each tile for pending approval check
      const enrichedTiles = (tilesData || []).map((tile) => {
        const transitions = tile.stage_transitions || []
        const latestTransition = transitions.length > 0
          ? transitions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
          : null
        const pendingApproval = latestTransition
          ? !latestTransition.approved_at && !latestTransition.rejected
          : false

        return {
          ...tile,
          latest_transition: latestTransition,
          pending_approval: pendingApproval,
        }
      })

      setTiles(enrichedTiles)
    } catch (err) {
      console.error('Error fetching tiles:', err.message)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const createTile = useCallback(async (projId, title, firstStageId, totalValue) => {
    setError(null)

    try {
      const { data, error: insertError } = await supabase
        .from('tiles')
        .insert({
          project_id: projId,
          title,
          current_stage_id: firstStageId,
          total_value: totalValue,
          status: 'active',
        })
        .select()
        .single()

      if (insertError) throw insertError
      return { data, error: null }
    } catch (err) {
      console.error('Error creating tile:', err.message)
      setError(err.message)
      return { data: null, error: err }
    }
  }, [])

  const createBulkTiles = useCallback(async (projId, prefix, startNum, endNum, firstStageId, totalValue) => {
    setError(null)

    try {
      const tilesToInsert = []
      for (let i = startNum; i <= endNum; i++) {
        tilesToInsert.push({
          project_id: projId,
          title: `${prefix} ${i}`,
          current_stage_id: firstStageId,
          total_value: totalValue,
          status: 'active',
        })
      }

      const { data, error: insertError } = await supabase
        .from('tiles')
        .insert(tilesToInsert)
        .select()

      if (insertError) throw insertError
      return { data, error: null }
    } catch (err) {
      console.error('Error creating bulk tiles:', err.message)
      setError(err.message)
      return { data: null, error: err }
    }
  }, [])

  const moveTile = useCallback(async (tileId, fromStageId, toStageId, userId) => {
    setError(null)

    try {
      const { error: transitionError } = await supabase
        .from('stage_transitions')
        .insert({
          tile_id: tileId,
          from_stage_id: fromStageId,
          to_stage_id: toStageId,
          moved_by: userId,
        })

      if (transitionError) throw transitionError

      const { error: updateError } = await supabase
        .from('tiles')
        .update({
          current_stage_id: toStageId,
          status: 'pending_approval',
        })
        .eq('id', tileId)

      if (updateError) throw updateError
      return { error: null }
    } catch (err) {
      console.error('Error moving tile:', err.message)
      setError(err.message)
      return { error: err }
    }
  }, [])

  const approveTile = useCallback(async (transitionId, tileId, stageId, project) => {
    setError(null)

    try {
      const { error: approveError } = await supabase
        .from('stage_transitions')
        .update({
          approved_by: project.manager_id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', transitionId)

      if (approveError) throw approveError

      const { error: tileError } = await supabase
        .from('tiles')
        .update({ status: 'active' })
        .eq('id', tileId)

      if (tileError) throw tileError

      // Create payment record based on payment mode
      if (project.payment_mode === 'per_stage') {
        // Get the stage to determine payment amount
        const { data: stageData, error: stageError } = await supabase
          .from('workflow_stages')
          .select('*')
          .eq('id', stageId)
          .single()

        if (stageError) throw stageError

        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            tile_id: tileId,
            stage_id: stageId,
            amount: stageData.payment_amount || 0,
            status: 'unpaid',
          })

        if (paymentError) throw paymentError
      } else if (project.payment_mode === 'per_tile') {
        // Get tile to use total_value
        const { data: tileData, error: tileFetchError } = await supabase
          .from('tiles')
          .select('total_value')
          .eq('id', tileId)
          .single()

        if (tileFetchError) throw tileFetchError

        // Check if this is the final stage in the workflow
        const { data: stages, error: stagesError } = await supabase
          .from('workflow_stages')
          .select('id, stage_order')
          .eq('workflow_id', project.workflow_id)
          .order('stage_order', { ascending: false })
          .limit(1)

        if (stagesError) throw stagesError

        const isFinalStage = stages.length > 0 && stages[0].id === stageId

        if (isFinalStage) {
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              tile_id: tileId,
              stage_id: stageId,
              amount: tileData.total_value || 0,
              status: 'unpaid',
            })

          if (paymentError) throw paymentError
        }
      }

      return { error: null }
    } catch (err) {
      console.error('Error approving tile:', err.message)
      setError(err.message)
      return { error: err }
    }
  }, [])

  const rejectTile = useCallback(async (transitionId, tileId, fromStageId) => {
    setError(null)

    try {
      const { error: rejectError } = await supabase
        .from('stage_transitions')
        .update({ rejected: true })
        .eq('id', transitionId)

      if (rejectError) throw rejectError

      const { error: tileError } = await supabase
        .from('tiles')
        .update({
          current_stage_id: fromStageId,
          status: 'active',
        })
        .eq('id', tileId)

      if (tileError) throw tileError
      return { error: null }
    } catch (err) {
      console.error('Error rejecting tile:', err.message)
      setError(err.message)
      return { error: err }
    }
  }, [])

  const archiveTile = useCallback(async (tileId) => {
    setError(null)

    try {
      const { error: archiveError } = await supabase
        .from('tiles')
        .update({ status: 'archived' })
        .eq('id', tileId)

      if (archiveError) throw archiveError
      return { error: null }
    } catch (err) {
      console.error('Error archiving tile:', err.message)
      setError(err.message)
      return { error: err }
    }
  }, [])

  return {
    tiles,
    loading,
    error,
    fetchTiles,
    createTile,
    createBulkTiles,
    moveTile,
    approveTile,
    rejectTile,
    archiveTile,
  }
}
