import { useState, useMemo } from 'react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { CheckCircle, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'

export default function TileListView({ tiles, stages, isManager, onTileClick, onApprove, onMarkPaid, currency = 'USD' }) {
  const [filterStage, setFilterStage] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [sortField, setSortField] = useState('title')
  const [sortDir, setSortDir] = useState('asc')

  const filteredTiles = useMemo(() => {
    let result = [...tiles]

    if (filterStage) {
      result = result.filter(t => t.current_stage_id === filterStage)
    }
    if (filterStatus) {
      result = result.filter(t => t.status === filterStatus)
    }
    if (filterPayment === 'owed') {
      result = result.filter(t => t.payments?.some(p => p.status === 'owed'))
    } else if (filterPayment === 'paid') {
      result = result.filter(t => t.payments?.every(p => p.status === 'paid') && t.payments?.length > 0)
    } else if (filterPayment === 'none') {
      result = result.filter(t => !t.payments?.length)
    }

    result.sort((a, b) => {
      let aVal, bVal
      if (sortField === 'title') {
        // Natural sort for "Page 1", "Page 2", etc.
        aVal = a.title
        bVal = b.title
        return sortDir === 'asc'
          ? aVal.localeCompare(bVal, undefined, { numeric: true })
          : bVal.localeCompare(aVal, undefined, { numeric: true })
      }
      if (sortField === 'value') {
        aVal = Number(a.total_value) || 0
        bVal = Number(b.total_value) || 0
      }
      if (sortField === 'stage') {
        aVal = stages.findIndex(s => s.id === a.current_stage_id)
        bVal = stages.findIndex(s => s.id === b.current_stage_id)
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })

    return result
  }, [tiles, filterStage, filterStatus, filterPayment, sortField, sortDir, stages])

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value)}
          className="rounded-md border border-input bg-white px-2 py-1 text-sm"
        >
          <option value="">All Stages</option>
          {stages.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-input bg-white px-2 py-1 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={filterPayment}
          onChange={(e) => setFilterPayment(e.target.value)}
          className="rounded-md border border-input bg-white px-2 py-1 text-sm"
        >
          <option value="">All Payments</option>
          <option value="owed">Has Owed</option>
          <option value="paid">Fully Paid</option>
          <option value="none">No Payments</option>
        </select>
        <span className="text-sm text-muted-foreground self-center">
          {filteredTiles.length} of {tiles.length} tiles
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-3 py-2 text-left font-medium cursor-pointer hover:text-primary" onClick={() => toggleSort('title')}>
                Title <SortIcon field="title" />
              </th>
              <th className="px-3 py-2 text-left font-medium cursor-pointer hover:text-primary" onClick={() => toggleSort('stage')}>
                Stage <SortIcon field="stage" />
              </th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium cursor-pointer hover:text-primary" onClick={() => toggleSort('value')}>
                Value <SortIcon field="value" />
              </th>
              <th className="px-3 py-2 text-right font-medium">Paid</th>
              {isManager && <th className="px-3 py-2 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredTiles.map(tile => {
              const stage = stages.find(s => s.id === tile.current_stage_id)
              const paidAmount = tile.payments?.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0) || 0
              const owedPayments = tile.payments?.filter(p => p.status === 'owed') || []

              return (
                <tr
                  key={tile.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer"
                  onClick={() => onTileClick(tile)}
                >
                  <td className="px-3 py-2 font-medium">{tile.title}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-secondary px-2 py-0.5 text-xs">{stage?.name || '-'}</span>
                  </td>
                  <td className="px-3 py-2">
                    {tile.status === 'pending_approval' ? (
                      <Badge variant="pending">Pending</Badge>
                    ) : tile.status === 'completed' ? (
                      <Badge variant="approved">Done</Badge>
                    ) : (
                      <Badge>Active</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(tile.total_value, currency)}</td>
                  <td className="px-3 py-2 text-right text-approved">{formatCurrency(paidAmount, currency)}</td>
                  {isManager && (
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {tile.status === 'pending_approval' && tile.pending_transition && (
                          <Button size="sm" variant="outline" onClick={() => onApprove(tile.pending_transition)}>
                            <CheckCircle className="h-3 w-3" />
                          </Button>
                        )}
                        {owedPayments.length > 0 && (
                          <Button size="sm" variant="outline" onClick={() => onMarkPaid(owedPayments[0].id)}>
                            <DollarSign className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
