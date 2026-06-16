import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { ActivityData, ActivityForDateResult } from '../../shared/ipc-types'
import { IoChevronBack, IoChevronForward, IoBarChartOutline, IoClose } from 'react-icons/io5'

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px 8px',
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

const TOOLTIP_STYLE = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--text-primary)',
}

export function Activity() {
  const [data, setData] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [icons, setIcons] = useState<Record<string, string>>({})
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA')
  })
  const today = new Date().toLocaleDateString('en-CA')
  const [dayData, setDayData] = useState<ActivityForDateResult | null>(null)

  const loadData = (background = false) => {
    if (!background) {
      setLoading(true)
    }
    window.electronAPI.getActivity().then(d => {
      setData(d)
      if (d.apps.length > 0) {
        window.electronAPI.getActivityIcons(d.apps.map(a => a.app_name.replace(/\.exe$/i, ''))).then(setIcons)
      }
    }).finally(() => {
      if (!background) {
        setLoading(false)
      }
    })
  }

  const loadDayData = useCallback(async () => {
    try {
      const result = await window.electronAPI.getActivityForDate(selectedDate)
      setDayData(result)
      if (result.apps.length > 0) {
        const iconResult = await window.electronAPI.getActivityIcons(
          result.apps.map(a => a.app_name)
        )
        setIcons(iconResult)
      }
    } catch (err) {
      console.error('Failed to load day data:', err)
    }
  }, [selectedDate])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    loadDayData()
  }, [loadDayData])

  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true)
      loadDayData()
    }, 60000)
    return () => clearInterval(interval)
  }, [loadDayData])

  const handleHideApp = async (appName: string) => {
    await window.electronAPI.hideApp(appName)
    loadDayData()
    loadData()
  }

  const goToPrevDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const prev = new Date(y, m - 1, d - 1)
    setSelectedDate(prev.toLocaleDateString('en-CA'))
  }

  const goToNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const next = new Date(y, m - 1, d + 1)
    setSelectedDate(next.toLocaleDateString('en-CA'))
  }

  const formatDisplayDate = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        Loading activity...
      </div>
    )
  }

  const hasAnyActivity =
    (data?.apps.length ?? 0) > 0 ||
    (data?.dailyUsage.length ?? 0) > 0 ||
    (dayData?.apps.length ?? 0) > 0

  if (!hasAnyActivity) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 12 }}>
        <div style={{ fontSize: 36, color: 'var(--text-muted)' }}><IoBarChartOutline /></div>
        <div style={{ fontSize: 14 }}>Collecting data</div>
      </div>
    )
  }

  const sortedApps = [...(dayData?.apps ?? [])].sort((a, b) => b.total_seconds - a.total_seconds)

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '4px 24px 24px' }}>
      <div className="text-center mb-4 px-1">
        <h2 className="text-sm font-semibold tracking-widest text-zinc-400">APP USAGE</h2>
        <p className={`text-xs mt-0.5 ${
          dayData?.isToday ? 'text-emerald-400 font-semibold' : 'text-zinc-500'
        }`}>
          {formatDisplayDate(selectedDate)}
          {dayData?.isToday && ' (TODAY)'}
        </p>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        {dayData?.apps.length || 0} apps tracked
      </div>

      <div style={{
        maxHeight: 'calc(100vh - 340px)',
        overflowY: 'auto',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 20,
      }}>
        {sortedApps.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No apps tracked on this day
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', width: 44, textAlign: 'center', verticalAlign: 'middle' }}>
                  <button
                    onClick={goToPrevDay}
                    disabled={!dayData?.hasPrevDay}
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 ${
                      dayData?.hasPrevDay
                        ? 'bg-zinc-600/90 text-zinc-100 hover:bg-zinc-500 hover:text-white shadow-sm'
                        : 'bg-zinc-300/60 text-zinc-300 cursor-not-allowed'
                    }`}
                    style={{ border: 'none', paddingTop: '1px', paddingRight: '1px' }}
                    title="Previous day"
                  >
                    <IoChevronBack size={14} />
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>
                  APP
                </th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>
                  TIME SPENT
                </th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', width: 44, textAlign: 'center', verticalAlign: 'middle' }}>
                  <button
                    onClick={goToNextDay}
                    disabled={!dayData?.hasNextDay || selectedDate >= today}
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 ${
                      dayData?.hasNextDay
                        ? 'bg-zinc-600/90 text-zinc-100 hover:bg-zinc-500 hover:text-white shadow-sm'
                        : 'bg-zinc-300/60 text-zinc-300 cursor-not-allowed'
                    }`}
                    style={{ border: 'none', paddingTop: '1px', paddingLeft: '2px' }}
                    title="Next day"
                  >
                    <IoChevronForward size={14} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedApps.map((app) => {
                const cleanName = app.app_name.replace(/\.exe$/i, '')
                return (
                  <tr
                    key={app.app_name}
                    onMouseEnter={() => setHoveredRow(app.app_name)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{ position: 'relative' }}
                  >
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', width: 44 }}>
                      {icons[cleanName] ? (
                        <img src={icons[cleanName]} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />
                      ) : (
                        <div style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                          {cleanName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      {cleanName}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-bright)', borderBottom: '1px solid var(--border)' }}>
                      {formatDuration(app.total_seconds)}
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', width: 36, textAlign: 'center' }}>
                      {hoveredRow === app.app_name && (
                        <button
                          onClick={() => handleHideApp(app.app_name)}
                          title="Hide from tracking"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            borderRadius: 4,
                            color: 'var(--text-muted)',
                            fontSize: 14,
                            lineHeight: 1,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'color 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                        >
                          <IoClose style={{ fontSize: 14 }} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ChartCard title="DAILY USAGE (LAST 30 DAYS)">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data?.dailyUsage ?? []} margin={{ left: -8, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              allowDecimals={false}
              domain={[0, (dataMax: number) => Math.max(Math.ceil(dataMax / 3600), 1) * 3600]}
              tickFormatter={(v: number) => `${Math.round(v / 3600)}h`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number) => [formatDuration(value), 'Spent Time']}
              labelFormatter={(label: string) => `Date: ${label}`}
            />
            <Bar dataKey="total_seconds" fill="var(--accent)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
