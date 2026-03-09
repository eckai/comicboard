import * as XLSX from 'xlsx'

export function exportToSpreadsheet(data, fields, filename, format = 'xlsx') {
  const headers = fields.map((f) => f.label)
  const rows = data.map((row) => fields.map((f) => row[f.key] ?? ''))

  const worksheetData = [headers, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')

  const extension = format === 'csv' ? 'csv' : 'xlsx'
  const bookType = format === 'csv' ? 'csv' : 'xlsx'

  XLSX.writeFile(workbook, `${filename}.${extension}`, { bookType })
}

export function buildExportData(tiles, stages) {
  const stageMap = {}
  for (const stage of stages) {
    stageMap[stage.id] = stage
  }

  return tiles.map((tile) => {
    const currentStage = stageMap[tile.current_stage_id]
    const payments = tile.payments || []
    const paidAmount = payments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount), 0)
    const owedAmount = payments
      .filter((p) => p.status === 'owed')
      .reduce((sum, p) => sum + Number(p.amount), 0)

    const paymentDetails = payments
      .map((p) => {
        const stage = stageMap[p.stage_id]
        return `${stage?.name || 'Unknown'}: $${Number(p.amount).toFixed(2)} (${p.status})`
      })
      .join('; ')

    const stageHistory = payments
      .map((p) => stageMap[p.stage_id]?.name)
      .filter(Boolean)
      .join(' -> ')

    return {
      tile_title: tile.title,
      current_stage: currentStage?.name || '',
      status: tile.status,
      total_value: Number(tile.total_value || 0).toFixed(2),
      paid_amount: paidAmount.toFixed(2),
      owed_amount: owedAmount.toFixed(2),
      payment_details: paymentDetails,
      created_at: tile.created_at ? new Date(tile.created_at).toLocaleDateString() : '',
      completed_at: tile.completed_at ? new Date(tile.completed_at).toLocaleDateString() : '',
      stage_history: stageHistory,
    }
  })
}
