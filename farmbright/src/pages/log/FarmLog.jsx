import React, { useContext, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FarmContext } from '../../context/FarmContext'
import { CATEGORIES } from '../../components/ObservationEntry'
import { getObservationHistory, getOpenFollowUps, resolveFollowUp } from '../../services/observationsApi'
import { getQueue } from '../../services/scaleHouseApi'

const todayStr  = () => new Date().toISOString().slice(0, 10)
const daysAgo   = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

function defaultRange(preset) {
  const today = todayStr()
  if (preset === 'today')  return { start: today, end: today }
  if (preset === 'week')   return { start: daysAgo(6), end: today }
  if (preset === 'month')  return { start: daysAgo(29), end: today }
  return { start: daysAgo(6), end: today }
}

function categoryEmoji(key) { return CATEGORIES.find(c => c.key === key)?.emoji || '📝' }
function categoryLabel(key) { return CATEGORIES.find(c => c.key === key)?.label || key }

function severityBorderClass(s) {
  if (s === 'urgent')  return 'border-l-4 border-l-[var(--accent-danger)] bg-red-950/20'
  if (s === 'concern') return 'border-l-4 border-l-[var(--accent-warn)] bg-amber-950/20'
  return 'border-l-4 border-l-[var(--accent-primary)] bg-[var(--bg-elevated)]'
}

function formatTime(ts) {
  if (!ts) return ''
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(ts))
}

export default function FarmLog() {
  const { userId } = useContext(FarmContext)
  const [logs,            setLogs]            = useState([])
  const [flocks,          setFlocks]          = useState([])
  const [loading,         setLoading]         = useState(true)
  const [preset,          setPreset]          = useState('week')
  const [dateRange,       setDateRange]       = useState(defaultRange('week'))
  const [filterSeverity,  setFilterSeverity]  = useState('all')
  const [filterCategory,  setFilterCategory]  = useState('all')
  const [filterFlock,     setFilterFlock]     = useState('all')
  const [filterFollowUp,  setFilterFollowUp]  = useState(false)
  const [searchTerm,      setSearchTerm]      = useState('')
  const [resolvedIds,     setResolvedIds]     = useState(new Set())

  useEffect(() => {
    if (!userId) return
    getQueue().then(q => setFlocks(q)).catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!userId) return
    load()
  }, [userId, dateRange.start, dateRange.end, filterSeverity, filterCategory, filterFlock, filterFollowUp])

  async function load() {
    setLoading(true)
    try {
      const filters = {}
      if (filterSeverity !== 'all')  filters.severity    = filterSeverity
      if (filterCategory !== 'all')  filters.category    = filterCategory
      if (filterFlock    !== 'all')  filters.flockId     = Number(filterFlock)
      if (filterFollowUp)            filters.followUpOnly = true
      const data = await getObservationHistory(userId, dateRange.start, dateRange.end, filters)
      setLogs(data)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  function updatePreset(p) {
    setPreset(p)
    if (p !== 'custom') setDateRange(defaultRange(p))
  }

  async function handleResolve(id) {
    await resolveFollowUp(id)
    setResolvedIds(prev => new Set([...prev, id]))
  }

  const displayed = useMemo(() => {
    if (!searchTerm.trim()) return logs
    const q = searchTerm.toLowerCase()
    return logs.filter(l =>
      (l.detail || '').toLowerCase().includes(q) ||
      (l.flocks?.name || '').toLowerCase().includes(q)
    )
  }, [logs, searchTerm])

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map()
    for (const obs of displayed) {
      const key = obs.date
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(obs)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [displayed])

  const urgentCount  = logs.filter(l => l.severity === 'urgent').length
  const followUpOpen = logs.filter(l => l.follow_up_needed && !l.follow_up_resolved && !resolvedIds.has(l.id)).length

  return (
    <section className="grid gap-4">
      <header className="page-header">
        <div>
          <p className="eyebrow">Records</p>
          <h1 className="display-font text-3xl text-[var(--text-primary)] mb-1 m-0">Farm Log</h1>
          <p className="font-mono text-sm text-[var(--text-muted)] m-0">
            All field observations · Searchable by date, flock, or type
          </p>
        </div>
      </header>

      {/* Filter bar */}
      <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-4 grid gap-3">
        {/* Date presets */}
        <div className="flex flex-wrap gap-2">
          {['today', 'week', 'month', 'custom'].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => updatePreset(p)}
              className={preset === p
                ? 'btn btn-xs font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none capitalize'
                : 'btn btn-xs btn-ghost font-mono border border-[var(--border)] text-[var(--text-secondary)] capitalize'
              }
            >
              {p === 'week' ? 'Last 7 Days' : p === 'month' ? 'This Month' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex gap-2 mt-1 w-full">
              <input
                type="date" value={dateRange.start}
                onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))}
                className="input input-sm font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] flex-1"
              />
              <input
                type="date" value={dateRange.end}
                onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))}
                className="input input-sm font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] flex-1"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Severity filter */}
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="select select-sm font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-secondary)]"
          >
            <option value="all">All Severities</option>
            <option value="urgent">🚨 Urgent</option>
            <option value="concern">⚠️ Concern</option>
            <option value="normal">Normal</option>
          </select>

          {/* Category filter */}
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="select select-sm font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-secondary)]"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
            ))}
          </select>

          {/* Flock filter */}
          <select
            value={filterFlock}
            onChange={e => setFilterFlock(e.target.value)}
            className="select select-sm font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-secondary)]"
          >
            <option value="all">All Flocks</option>
            {flocks.map(f => (
              <option key={f.flock_id} value={f.flock_id}>{f.emoji} {f.name}</option>
            ))}
          </select>

          {/* Follow-up toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterFollowUp}
              onChange={e => setFilterFollowUp(e.target.checked)}
              className="checkbox checkbox-sm [--chkbg:var(--accent-warn)]"
            />
            <span className="font-mono text-xs text-[var(--text-secondary)]">Open follow-ups only</span>
          </label>

          {/* Search */}
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search notes..."
            className="input input-sm font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] flex-1 min-w-[160px]"
          />
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-3 text-center">
          <p className="font-mono text-2xl font-bold text-[var(--text-primary)] m-0">{logs.length}</p>
          <p className="font-mono text-xs text-[var(--text-muted)] m-0">Total observations</p>
        </div>
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-3 text-center">
          <p className={`font-mono text-2xl font-bold m-0 ${followUpOpen > 0 ? 'text-[var(--accent-warn)]' : 'text-[var(--text-primary)]'}`}>{followUpOpen}</p>
          <p className="font-mono text-xs text-[var(--text-muted)] m-0">Open follow-ups</p>
        </div>
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-3 text-center">
          <p className={`font-mono text-2xl font-bold m-0 ${urgentCount > 0 ? 'text-[var(--accent-danger)]' : 'text-[var(--text-primary)]'}`}>{urgentCount}</p>
          <p className="font-mono text-xs text-[var(--text-muted)] m-0">Urgent</p>
        </div>
      </div>

      {/* Log entries */}
      {loading ? (
        <p className="font-mono text-sm text-[var(--text-muted)] text-center py-8">Loading...</p>
      ) : grouped.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-8 text-center">
          {filterFollowUp
            ? <p className="font-mono text-sm text-[var(--accent-primary)] m-0">No open follow-ups — all clear ✓</p>
            : <p className="font-mono text-sm text-[var(--text-muted)] m-0">No observations match these filters</p>
          }
        </div>
      ) : (
        <div className="grid gap-4">
          {grouped.map(([date, entries]) => (
            <div key={date}>
              <p className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              <div className="grid gap-2">
                {entries.map(obs => {
                  const resolved = resolvedIds.has(obs.id) || obs.follow_up_resolved
                  return (
                    <div
                      key={obs.id}
                      className={`rounded-xl border border-[var(--border)] p-3 font-mono text-xs ${severityBorderClass(obs.severity)}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span>{categoryEmoji(obs.category)}</span>
                            <span className="font-bold text-[var(--text-primary)]">{categoryLabel(obs.category)}</span>
                            <span className="text-[var(--text-muted)]">·</span>
                            <span className="text-[var(--text-secondary)]">
                              {obs.flocks?.breeds?.animal_types?.emoji} {obs.flocks?.name}
                            </span>
                            {obs.animals && (
                              <span className="text-[var(--accent-primary)]">· {obs.animals.identifier}</span>
                            )}
                            {obs.severity !== 'normal' && (
                              <span className={`badge badge-xs border-none ${obs.severity === 'urgent' ? 'bg-[var(--accent-danger)] text-white' : 'bg-[var(--accent-warn)] text-[var(--bg-base)]'}`}>
                                {obs.severity.toUpperCase()}
                              </span>
                            )}
                            {obs.follow_up_needed && !resolved && (
                              <span className="badge badge-xs bg-[var(--accent-warn)] text-[var(--bg-base)] border-none">follow-up</span>
                            )}
                            {resolved && obs.follow_up_needed && (
                              <span className="badge badge-xs bg-[var(--bg-elevated)] text-[var(--text-muted)] border-none">resolved ✓</span>
                            )}
                          </div>
                          {obs.detail && (
                            <p className="text-[var(--text-secondary)] leading-relaxed m-0">{obs.detail}</p>
                          )}
                          <p className="text-[var(--text-muted)] mt-1 m-0">{formatTime(obs.created_at)}</p>
                        </div>
                        {obs.follow_up_needed && !resolved && (
                          <button
                            type="button"
                            onClick={() => handleResolve(obs.id)}
                            className="btn btn-xs font-mono shrink-0 bg-[var(--accent-primary)] text-[var(--bg-base)] border-none"
                          >
                            Resolve ✓
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
