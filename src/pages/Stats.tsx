import { useState, useEffect } from 'react'
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { StatsData } from '../../shared/ipc-types'

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${accent ? 'rgba(124,110,245,0.3)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      flex: '1 1 160px',
      minWidth: 140,
    }}>
      <div style={{
        fontSize: 28,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: accent ? 'var(--accent-bright)' : 'var(--text-primary)',
        marginBottom: 4,
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
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

export function Stats() {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.getStats().then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        Loading stats…
      </div>
    )
  }

  if (!data) return null

  const completionRate = data.totalInterceptions > 0
    ? Math.round((data.completedInterceptions / data.totalInterceptions) * 100)
    : 0

  const pieData = [
    { name: 'Completed', value: data.completedInterceptions },
    { name: 'Skipped', value: Math.max(0, data.totalInterceptions - data.completedInterceptions) },
  ]

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '4px 24px 24px' }}>
      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Launched today" value={data.launchedToday} />
        <StatCard label="Unique apps ever" value={data.uniqueAppsEver} />
        <StatCard label="Interceptions this week" value={data.interceptionsThisWeek} accent />
        <StatCard label="Completion rate" value={`${completionRate}%`} accent />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Top apps */}
        <ChartCard title="Top 10 Most Launched Apps">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.topApps} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={90} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--bg-hover)' }} />
              <Bar dataKey="count" fill="var(--accent)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Hourly activity */}
        <ChartCard title="Launches by Hour of Day (Today)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.hourlyActivity} margin={{ left: -8, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hour" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={h => `${h}h`} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={h => `${h}:00`} />
              <Area type="monotone" dataKey="count" stroke="var(--accent)" fill="url(#hourGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        {/* Daily interceptions */}
        <ChartCard title="Interceptions (Last 30 Days)">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.dailyInterceptions} margin={{ left: -8, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="count" stroke="var(--success)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Completion donut */}
        <ChartCard title="Completion Rate">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 8 }}>
            <div style={{ position: 'relative', width: 130, height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={58}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell fill="var(--success)" />
                    <Cell fill="var(--bg-active)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                  {completionRate}%
                </span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              {data.completedInterceptions} completed<br />
              {data.totalInterceptions} total
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
