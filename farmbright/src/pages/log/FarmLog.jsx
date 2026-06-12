import React, { useContext, useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { FarmContext } from '../../context/FarmContext'
import { OBSERVATION_CATEGORIES } from '../../utils/animalClass'
import ObservationEntry from '../../components/ObservationEntry'
import { getObservationHistory, resolveFollowUp, deleteObservation, updateObservation } from '../../services/observationsApi'
import { getQueue } from '../../services/scaleHouseApi'
import { getLocalDateString, getDaysAgoString } from '../../utils/date'

const todayStr  = () => getLocalDateString()
const daysAgo   = (n) => getDaysAgoString(n)

function formatDate(date) {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function groupObservations(observations) {
  const grouped = {}
  observations.forEach(obs => {
    const date    = obs.date
    const flockId = obs.flock_id
    if (!grouped[date]) grouped[date] = {}
    if (!grouped[date][flockId]) {
      grouped[date][flockId] = { flock: obs.flocks, observations: [] }
    }
    grouped[date][flockId].observations.push(obs)
  })
  return Object.keys(grouped)
    .sort((a, b) => new Date(b) - new Date(a))
    .map(date => ({
      date,
      flocks: Object.values(grouped[date])
        .sort((a, b) => (a.flock?.name || '').localeCompare(b.flock?.name || ''))
    }))
}

function defaultRange(preset) {
  const today = todayStr()
  if (preset === 'today')  return { start: today, end: today }
  if (preset === 'week')   return { start: daysAgo(6), end: today }
  if (preset === 'month')  return { start: daysAgo(29), end: today }
  return { start: daysAgo(6), end: today }
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
  const [editingObs,      setEditingObs]      = useState(null)

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

  const today = todayStr()

  async function handleResolve(id) {
    await resolveFollowUp(id)
    setResolvedIds(prev => new Set([...prev, id]))
    load()
  }

  async function handleDeleteObs(obsId) {
    await deleteObservation(obsId)
    load()
  }

  const displayed = useMemo(() => {
    if (!searchTerm.trim()) return logs
    const q = searchTerm.toLowerCase()
    return logs.filter(l =>
      (l.detail || '').toLowerCase().includes(q) ||
      (l.flocks?.name || '').toLowerCase().includes(q)
    )
  }, [logs, searchTerm])

  const groupedData = useMemo(() => groupObservations(displayed), [displayed])

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
            {OBSERVATION_CATEGORIES.map(c => (
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
      ) : groupedData.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-8 text-center">
          {filterFollowUp
            ? <p className="font-mono text-sm text-[var(--accent-primary)] m-0">No open follow-ups — all clear ✓</p>
            : <p className="font-mono text-sm text-[var(--text-muted)] m-0">No observations match these filters</p>
          }
        </div>
      ) : (
        <div>
          {groupedData.map(({ date, flocks }) => (
            <div key={date} className="mb-8">

              {/* DATE HEADER */}
              <div className="flex items-center gap-3 mb-4">
                <h3 className="display-font text-lg text-[var(--text-primary)] whitespace-nowrap m-0">
                  {formatDate(date)}
                  {date === today && (
                    <span className="font-mono text-xs text-[var(--accent-primary)] ml-2">Today</span>
                  )}
                </h3>
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="font-mono text-xs text-[var(--text-muted)] whitespace-nowrap">
                  {flocks.reduce((sum, f) => sum + f.observations.length, 0)}{' '}
                  observation{flocks.reduce((sum, f) => sum + f.observations.length, 0) !== 1 ? 's' : ''}
                </span>
              </div>

              {/* FLOCK GROUPS */}
              {flocks.map(({ flock, observations }) => (
                <div key={flock?.id} className="mb-4 rounded-xl overflow-hidden border border-[var(--border)]">

                  {/* Flock header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{flock?.breeds?.animal_types?.emoji || '🐾'}</span>
                      <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{flock?.name}</span>
                      <span className="font-mono text-xs text-[var(--text-muted)]">· {flock?.breeds?.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {observations.some(o => o.severity === 'urgent') && (
                        <span className="badge badge-xs font-mono bg-[var(--accent-danger)] text-white border-none">🚨 Urgent</span>
                      )}
                      {!observations.some(o => o.severity === 'urgent') && observations.some(o => o.severity === 'concern') && (
                        <span className="badge badge-xs font-mono bg-[var(--accent-warn)] text-[var(--bg-base)] border-none">⚠ Concern</span>
                      )}
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">{observations.length} obs</span>
                    </div>
                  </div>

                  {/* Observation rows */}
                  <div className="divide-y divide-[var(--border)] bg-[var(--bg-surface)]">
                    {observations.map(obs => (
                      <div key={obs.id} className={`px-4 py-3 flex items-start justify-between gap-3 border-l-4 ${
                        obs.severity === 'urgent'  ? 'border-l-[var(--accent-danger)]'
                        : obs.severity === 'concern' ? 'border-l-[var(--accent-warn)]'
                        : 'border-l-transparent'
                      }`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
                              {OBSERVATION_CATEGORIES.find(c => c.key === obs.category)?.emoji}
                              {OBSERVATION_CATEGORIES.find(c => c.key === obs.category)?.label}
                            </span>
                            {obs.animals && (
                              <span className="badge badge-xs font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none">
                                🐾 {obs.animals.identifier}
                              </span>
                            )}
                            {obs.follow_up_needed && !obs.follow_up_resolved && !resolvedIds.has(obs.id) && (
                              <span className="badge badge-xs font-mono border border-[var(--accent-warn)] text-[var(--accent-warn)]">
                                Follow-up
                              </span>
                            )}
                          </div>
                          {obs.selected_options?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {obs.selected_options.map(opt => (
                                <span key={opt} className="badge badge-sm font-mono bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)]">
                                  {opt}
                                </span>
                              ))}
                            </div>
                          )}
                          {obs.detail && (
                            <p className="font-mono text-xs text-[var(--text-muted)] leading-relaxed m-0">{obs.detail}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[10px] text-[var(--text-muted)]">
                            {new Date(obs.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button type="button" onClick={() => setEditingObs(obs)}
                            className="btn btn-xs btn-ghost p-1 text-[var(--text-muted)] hover:text-[var(--accent-primary)]">
                            <Pencil size={12} />
                          </button>
                          <button type="button" onClick={() => handleDeleteObs(obs.id)}
                            className="btn btn-xs btn-ghost p-1 text-[var(--text-muted)] hover:text-[var(--accent-danger)]">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      <dialog className={`modal ${editingObs ? 'modal-open' : ''}`}>
        <div className="modal-box bg-[var(--bg-surface)] border border-[var(--border)]">
          <h3 className="font-mono text-lg font-bold text-[var(--text-primary)] mb-4">Edit Observation</h3>
          {editingObs && (
            <ObservationEntry
              flockId={editingObs.flock_id}
              animals={[]}
              editingObs={editingObs}
              userId={userId}
              onSave={() => { setEditingObs(null); load() }}
              onCancel={() => setEditingObs(null)}
            />
          )}
        </div>
        <div className="modal-backdrop" onClick={() => setEditingObs(null)} />
      </dialog>
    </section>
  )
}
