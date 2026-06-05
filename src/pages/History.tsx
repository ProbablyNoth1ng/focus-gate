import { useState, useEffect } from 'react'
import type { IntentionLog } from '../../shared/ipc-types'
import { IoSwapVertical, IoArrowUp, IoArrowDown, IoArrowForward, IoDocumentTextOutline } from 'react-icons/io5'

type SortKey = 'timestamp' | 'app_name' | 'word_count'
type SortDir = 'ASC' | 'DESC'

export function History() {
  const [logs, setLogs] = useState<IntentionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('timestamp')
  const [sortDir, setSortDir] = useState<SortDir>('DESC')
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await window.electronAPI.getLogs({ search, dateFrom, dateTo, sortBy, sortDir })
      setLogs(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search, dateFrom, dateTo, sortBy, sortDir])

  const handleSort = (col: SortKey) => {
    if (col === sortBy) {
      setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC')
    } else {
      setSortBy(col)
      setSortDir('DESC')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortBy) return <IoSwapVertical style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 13 }} />
    return sortDir === 'ASC'
      ? <IoArrowUp style={{ color: 'var(--accent)', marginLeft: 4, fontSize: 13 }} />
      : <IoArrowDown style={{ color: 'var(--accent)', marginLeft: 4, fontSize: 13 }} />
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filters */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        <input
          type="search"
          placeholder="Search by app or keyword…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 200px', minWidth: 160 }}
        />
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          title="From date"
          style={{ width: 140 }}
        />
        <IoArrowForward style={{ color: 'var(--text-muted)', fontSize: 12 }} />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          title="To date"
          style={{ width: 140 }}
        />
        {(search || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Clear
          </button>
        )}
        <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 'auto' }}>
          {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 12, color: 'var(--text-muted)' }}><IoDocumentTextOutline /></div>
            {search ? 'No results found' : 'No intention logs yet'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {[
                  { key: 'timestamp' as SortKey, label: 'Date / Time', width: '22%' },
                  { key: 'app_name' as SortKey, label: 'App', width: '18%' },
                  { key: null, label: 'Intention', width: '46%' },
                  { key: 'word_count' as SortKey, label: 'Words', width: '14%' },
                ].map(col => (
                  <th
                    key={col.label}
                    onClick={col.key ? () => handleSort(col.key!) : undefined}
                    style={{
                      width: col.width,
                      textAlign: 'left',
                      padding: '8px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      cursor: col.key ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
                    {col.label}
                    {col.key && <SortIcon col={col.key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <>
                  <tr
                    key={log.id}
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {[
                      <td key="ts" style={{ padding: '10px 10px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', borderRadius: '6px 0 0 6px', border: '1px solid var(--border)', borderRight: 'none' }}>
                        {formatDate(log.timestamp)}
                      </td>,
                      <td key="app" style={{ padding: '10px 10px', fontWeight: 500, fontSize: 13, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none' }}>
                        {log.app_name}
                      </td>,
                      <td key="purpose" style={{ padding: '10px 10px', color: 'var(--text-secondary)', fontSize: 13, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded === log.id ? 'normal' : 'nowrap' }}>
                        {log.purpose}
                      </td>,
                      <td key="wc" style={{ padding: '10px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-bright)', background: 'var(--bg-elevated)', borderRadius: '0 6px 6px 0', border: '1px solid var(--border)', borderLeft: 'none' }}>
                        {log.word_count}w
                      </td>,
                    ]}
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
