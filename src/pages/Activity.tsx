import { Fragment, useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { ActivityData, ActivityForDateResult, ChromeWebsiteUsageSummary } from '../../shared/ipc-types'
import { IoChevronBack, IoChevronForward, IoChevronDown, IoBarChartOutline, IoClose } from 'react-icons/io5'

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
  const [expandedChrome, setExpandedChrome] = useState(false)
  const [expandedWebsites, setExpandedWebsites] = useState<Set<string>>(() => new Set())

  const loadData = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true)
    }
    try {
      const d = await window.electronAPI.getActivity()
      setData(d)
      if (d.apps.length > 0) {
        const iconResult = await window.electronAPI.getActivityIcons(d.apps.map(a => a.app_name.replace(/\.exe$/i, '')))
        setIcons(iconResult)
      }
    } finally {
      if (!background) {
        setLoading(false)
      }
    }
  }, [])

  const loadDayData = useCallback(async () => {
    try {
      const result = await window.electronAPI.getActivityForDate(selectedDate)
      setDayData(result)
      setExpandedChrome((current) => current && result.chromeWebsites.length > 0)
      setExpandedWebsites((current) => {
        const availableKeys = new Set(result.chromeWebsites.map((website) => website.website_key))
        return new Set([...current].filter((websiteKey) => availableKeys.has(websiteKey)))
      })
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
  }, [loadData])

  useEffect(() => {
    loadDayData()
  }, [loadDayData])

  useEffect(() => {
    setExpandedChrome(false)
    setExpandedWebsites(new Set())
  }, [selectedDate])

  useEffect(() => {
    const interval = setInterval(() => {
      void loadData(true)
      loadDayData()
    }, 60000)
    return () => clearInterval(interval)
  }, [loadData, loadDayData])

  const refreshActivity = async () => {
    await Promise.all([loadDayData(), loadData(true)])
  }

  const handleRemoveAppActivity = async (appName: string) => {
    await window.electronAPI.removeAppActivity(selectedDate, appName)
    await refreshActivity()
  }

  const handleRemoveChromeWebsiteActivity = async (websiteKey: string) => {
    await window.electronAPI.removeChromeWebsiteActivity(selectedDate, websiteKey)
    await refreshActivity()
  }

  const handleRemoveChromePageActivity = async (websiteKey: string, pageKey: string) => {
    await window.electronAPI.removeChromePageActivity(selectedDate, websiteKey, pageKey)
    await refreshActivity()
  }

  const toggleWebsite = (websiteKey: string) => {
    setExpandedWebsites(prev => {
      const next = new Set(prev)
      if (next.has(websiteKey)) next.delete(websiteKey)
      else next.add(websiteKey)
      return next
    })
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
    (dayData?.apps.length ?? 0) > 0 ||
    (dayData?.chromeWebsites.length ?? 0) > 0

  if (!hasAnyActivity) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 12 }}>
        <div style={{ fontSize: 36, color: 'var(--text-muted)' }}><IoBarChartOutline /></div>
        <div style={{ fontSize: 14 }}>Collecting data</div>
      </div>
    )
  }

  const sortedApps = [...(dayData?.apps ?? [])].sort((a, b) => b.total_seconds - a.total_seconds)
  const chromeWebsites = dayData?.chromeWebsites ?? []
  const hasChromeBreakdown = chromeWebsites.length > 0

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
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 44 }} />
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 44 }} />
            </colgroup>
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
                const isChrome = cleanName.toLowerCase() === 'chrome'
                return (
                  <Fragment key={app.app_name}>
                    <tr
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
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cleanName}
                          </span>
                          {isChrome && hasChromeBreakdown && (
                            <button
                              onClick={() => setExpandedChrome(v => !v)}
                              aria-label={expandedChrome ? 'Collapse Chrome website activity' : 'Expand Chrome website activity'}
                              title={expandedChrome ? 'Collapse websites' : 'Expand websites'}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 4,
                                borderRadius: 4,
                                color: 'var(--text-muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flex: '0 0 auto',
                              }}
                            >
                              {expandedChrome ? <IoChevronDown size={14} /> : <IoChevronForward size={14} />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-bright)', borderBottom: '1px solid var(--border)' }}>
                        {formatDuration(app.total_seconds)}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', width: 36, textAlign: 'center' }}>
                        {hoveredRow === app.app_name && (
                          <button
                            onClick={() => handleRemoveAppActivity(app.app_name)}
                            aria-label={`Remove activity for ${cleanName}`}
                            title="Remove activity"
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
                    {isChrome && hasChromeBreakdown && expandedChrome && (
                      <ChromeWebsiteRows
                        websites={chromeWebsites}
                        expandedWebsites={expandedWebsites}
                        onToggleWebsite={toggleWebsite}
                        onRemoveWebsite={handleRemoveChromeWebsiteActivity}
                        onRemovePage={handleRemoveChromePageActivity}
                      />
                    )}
                  </Fragment>
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

function ChromeWebsiteRows({
  websites,
  expandedWebsites,
  onToggleWebsite,
  onRemoveWebsite,
  onRemovePage,
}: {
  websites: ChromeWebsiteUsageSummary[]
  expandedWebsites: Set<string>
  onToggleWebsite: (websiteKey: string) => void
  onRemoveWebsite: (websiteKey: string) => void
  onRemovePage: (websiteKey: string, pageKey: string) => void
}) {
  const [hoveredChromeRow, setHoveredChromeRow] = useState<string | null>(null)
  const titleStyle: React.CSSProperties = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      {websites.map((website) => {
        const hasMultiplePages = website.pages.length > 1
        const expanded = expandedWebsites.has(website.website_key)
        const firstPage = website.pages[0]

        if (!hasMultiplePages && firstPage) {
          return (
            <tr
              key={website.website_key}
              onMouseEnter={() => setHoveredChromeRow(`website:${website.website_key}`)}
              onMouseLeave={() => setHoveredChromeRow(null)}
            >
              <td style={{ borderBottom: '1px solid var(--border)' }} />
              <td style={{ padding: '8px 12px 8px 28px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 190px) minmax(0, 1fr)', gap: 12, alignItems: 'center', minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', ...titleStyle }} title={website.website_label}>
                    {website.website_label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', ...titleStyle }} title={firstPage.title}>
                    {firstPage.title}
                  </span>
                </div>
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-bright)', borderBottom: '1px solid var(--border)' }}>
                {formatDuration(firstPage.total_seconds)}
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                {hoveredChromeRow === `website:${website.website_key}` && (
                  <RemoveActivityButton
                    label={`Remove activity for ${website.website_label}`}
                    onClick={() => onRemoveWebsite(website.website_key)}
                  />
                )}
              </td>
            </tr>
          )
        }

        return (
          <Fragment key={website.website_key}>
            <tr
              onMouseEnter={() => setHoveredChromeRow(`website:${website.website_key}`)}
              onMouseLeave={() => setHoveredChromeRow(null)}
            >
              <td style={{ borderBottom: '1px solid var(--border)' }} />
              <td style={{ padding: '8px 12px 8px 28px', borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => onToggleWebsite(website.website_key)}
                  aria-label={expanded ? `Collapse ${website.website_label} pages` : `Expand ${website.website_label} pages`}
                  title={expanded ? 'Collapse pages' : 'Expand pages'}
                  style={{
                    maxWidth: '100%',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    gap: 6,
                    alignItems: 'center',
                    textAlign: 'left',
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 0, ...titleStyle }} title={website.website_label}>
                    {website.website_label}
                  </span>
                  <span style={{ color: 'var(--text-muted)', display: 'inline-flex', flex: '0 0 auto' }}>
                    {expanded ? <IoChevronDown size={13} /> : <IoChevronForward size={13} />}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {website.pages.length}
                  </span>
                </button>
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-bright)', borderBottom: '1px solid var(--border)' }}>
                {formatDuration(website.total_seconds)}
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                {hoveredChromeRow === `website:${website.website_key}` && (
                  <RemoveActivityButton
                    label={`Remove activity for ${website.website_label}`}
                    onClick={() => onRemoveWebsite(website.website_key)}
                  />
                )}
              </td>
            </tr>
            {expanded && website.pages.map((page) => (
              <tr
                key={page.page_key}
                onMouseEnter={() => setHoveredChromeRow(`page:${website.website_key}:${page.page_key}`)}
                onMouseLeave={() => setHoveredChromeRow(null)}
              >
                <td style={{ borderBottom: '1px solid var(--border)' }} />
                <td style={{ padding: '7px 12px 7px 28px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 190px) minmax(0, 1fr)', gap: 12, alignItems: 'center', minWidth: 0 }}>
                    <span />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }} title={page.title}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: 'var(--text-muted)',
                          opacity: 0.85,
                          flex: '0 0 auto',
                        }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 0, ...titleStyle }}>
                        {page.title}
                      </span>
                    </span>
                  </div>
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-bright)', borderBottom: '1px solid var(--border)' }}>
                  {formatDuration(page.total_seconds)}
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                  {hoveredChromeRow === `page:${website.website_key}:${page.page_key}` && (
                    <RemoveActivityButton
                      label={`Remove activity for ${page.title}`}
                      onClick={() => onRemovePage(website.website_key, page.page_key)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </Fragment>
        )
      })}
    </>
  )
}

function RemoveActivityButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title="Remove activity"
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
  )
}
