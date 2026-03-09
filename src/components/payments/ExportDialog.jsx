import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { exportToSpreadsheet, buildExportData } from '@/lib/export'
import { Download } from 'lucide-react'

const AVAILABLE_FIELDS = [
  { key: 'tile_title', label: 'Page/Tile Title', default: true },
  { key: 'current_stage', label: 'Current Stage', default: true },
  { key: 'status', label: 'Status', default: true },
  { key: 'total_value', label: 'Total Value', default: true },
  { key: 'paid_amount', label: 'Amount Paid', default: true },
  { key: 'owed_amount', label: 'Amount Owed', default: true },
  { key: 'payment_details', label: 'Payment Details (per stage)', default: false },
  { key: 'created_at', label: 'Created Date', default: false },
  { key: 'completed_at', label: 'Completed Date', default: false },
  { key: 'stage_history', label: 'Stage History', default: false },
]

export default function ExportDialog({ open, onClose, tiles, stages, projectName }) {
  const [selectedFields, setSelectedFields] = useState(
    AVAILABLE_FIELDS.filter(f => f.default).map(f => f.key)
  )
  const [format, setFormat] = useState('xlsx')

  const toggleField = (key) => {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const handleExport = () => {
    const data = buildExportData(tiles, stages)
    const fields = AVAILABLE_FIELDS.filter(f => selectedFields.includes(f.key))
    const filename = `${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_export`
    exportToSpreadsheet(data, fields, filename, format)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Export Spreadsheet">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Select fields to include:</label>
          <div className="mt-2 space-y-2">
            {AVAILABLE_FIELDS.map(field => (
              <label key={field.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field.key)}
                  onChange={() => toggleField(field.key)}
                  className="rounded border-input"
                />
                {field.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Format:</label>
          <div className="mt-2 flex gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="format"
                value="xlsx"
                checked={format === 'xlsx'}
                onChange={() => setFormat('xlsx')}
              />
              Excel (.xlsx)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="format"
                value="csv"
                checked={format === 'csv'}
                onChange={() => setFormat('csv')}
              />
              CSV (.csv)
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleExport} disabled={selectedFields.length === 0}>
            <Download className="mr-1 h-3 w-3" /> Export {tiles.length} tiles
          </Button>
        </div>
      </div>
    </Modal>
  )
}
