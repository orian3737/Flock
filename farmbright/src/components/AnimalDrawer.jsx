import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getAnimalDetail, getFlockAnimals, logWeight, updateAnimal } from '../services/observationsApi'
import { OBSERVATION_CATEGORIES } from '../utils/animalClass'
import { getLocalDateString } from '../utils/date'

const todayStr = () => getLocalDateString()

function categoryEmoji(key) { return OBSERVATION_CATEGORIES.find(c => c.key === key)?.emoji || '📝' }
function categoryLabel(key) { return OBSERVATION_CATEGORIES.find(c => c.key === key)?.label || key }

const LOG_TYPE_LABELS = {
  observation: 'Observation', treatment: 'Treatment',
  injury: 'Injury', illness: 'Illness', recovery: 'Recovery', other: 'Other',
}

// Age display helper
function getAgeDisplay(dateOfBirth) {
  if (!dateOfBirth) return '—'
  const dob  = new Date(dateOfBirth)
  const now  = new Date()
  const months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth())
  if (months < 1)  return '< 1 mo'
  if (months < 12) return `${months} mo`
  const years = Math.floor(months / 12)
  const rem   = months % 12
  return rem > 0 ? `${years}y ${rem}mo` : `${years}y`
}

const STATUS_OPTIONS = [
  {
    status: 'sold',
    label: 'Sold',
    className: 'btn flex-1 font-mono font-bold bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]',
  },
  {
    status: 'deceased',
    label: 'Deceased',
    className: 'btn flex-1 font-mono btn-ghost border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-warn)] hover:text-[var(--accent-warn)]',
  },
  {
    status: 'culled',
    label: 'Culled',
    className: 'btn flex-1 font-mono btn-ghost border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-danger)] hover:text-[var(--accent-danger)]',
  },
]

export default function AnimalDrawer({ animalId, onClose, onUpdate }) {
  const [animal,     setAnimal]     = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState('health')
  const [showWeightForm, setShowWeightForm] = useState(false)
  const [weightForm, setWeightForm] = useState({ date: todayStr(), weight_lbs: '', input_method: 'manual', notes: '' })
  const [savingWt,   setSavingWt]   = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)
  const [editingLineage, setEditingLineage] = useState(false)
  const [editSireId, setEditSireId] = useState(null)
  const [editDamId,  setEditDamId]  = useState(null)
  const [flockAnimals, setFlockAnimals] = useState([])

  useEffect(() => {
    load()
  }, [animalId])

  useEffect(() => {
    if (animal?.flock_id) {
      getFlockAnimals(animal.flock_id, 'active')
        .then(setFlockAnimals)
        .catch(console.error)
    }
  }, [animal?.flock_id])

  async function load() {
    setLoading(true)
    try {
      const data = await getAnimalDetail(animalId)
      setAnimal(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  async function handleLogWeight() {
    if (!weightForm.weight_lbs) return
    setSavingWt(true)
    try {
      await logWeight(animalId, {
        date:         weightForm.date,
        weight_lbs:   Number(weightForm.weight_lbs),
        input_method: weightForm.input_method,
        notes:        weightForm.notes || null,
      })
      setShowWeightForm(false)
      setWeightForm({ date: todayStr(), weight_lbs: '', input_method: 'manual', notes: '' })
      await load()
      onUpdate?.()
    } catch {
      // silent
    } finally {
      setSavingWt(false)
    }
  }

  async function handleStatusChange(status) {
    if (!window.confirm(`Mark ${animal?.identifier || 'this animal'} as ${status}?`)) return
    setStatusChanging(true)
    try {
      await updateAnimal(animalId, { status })
      await load()
      onUpdate?.()
    } catch {
      // silent
    } finally {
      setStatusChanging(false)
    }
  }

  function openLineageEditor() {
    setEditSireId(animal?.sire_id ?? null)
    setEditDamId(animal?.dam_id ?? null)
    setEditingLineage(true)
  }

  async function handleSaveLineage() {
    try {
      await updateAnimal(animalId, {
        sire_id: editSireId ? Number(editSireId) : null,
        dam_id:  editDamId  ? Number(editDamId)  : null,
      })
      setEditingLineage(false)
      await load()
      onUpdate?.()
    } catch (err) {
      console.error('Save lineage error:', err)
    }
  }

  const weights = animal?.animal_weight_logs
    ?.slice()
    .sort((a, b) => b.date.localeCompare(a.date)) || []

  const healthIssues = animal?.animal_health_logs
    ?.slice()
    .sort((a, b) => b.date.localeCompare(a.date)) || []

  const animalObs = animal?.observation_logs
    ?.slice()
    .sort((a, b) => b.date.localeCompare(a.date)) || []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside className="fixed top-0 right-0 h-screen w-full max-w-[480px] z-[80] bg-[var(--bg-surface)] border-l border-[var(--border)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--border)]">
          <div>
            {loading ? (
              <p className="font-mono text-sm text-[var(--text-muted)]">Loading...</p>
            ) : (
              <>
                <h2 className="display-font text-2xl text-[var(--text-primary)] m-0">{animal?.identifier}</h2>
                <div className="flex gap-2 mt-1">
                  <span className="badge badge-sm font-mono bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)] capitalize">{animal?.sex}</span>
                  <span className={`badge badge-sm font-mono border-none capitalize ${animal?.status === 'active' ? 'bg-[var(--accent-primary)] text-[var(--bg-base)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>{animal?.status}</span>
                  <span className="badge badge-sm font-mono bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)]">
                    {getAgeDisplay(animal?.date_of_birth)}
                  </span>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center bg-transparent border border-[var(--border)] rounded-md text-[var(--text-secondary)] h-10 w-10 p-0 flex-none hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {[['health', 'Health & Obs'], ['weight', 'Weight'], ['lineage', 'Lineage']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex-1 font-mono text-xs py-3 px-2 border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-b-[var(--accent-primary)] text-[var(--text-primary)] font-bold'
                  : 'border-b-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="font-mono text-sm text-[var(--text-muted)] text-center py-8">Loading...</p>
          ) : (
            <>
              {/* Health & Obs tab */}
              {activeTab === 'health' && (
                <div className="grid gap-3">
                  {healthIssues.filter(h => !h.resolved).length > 0 && (
                    <div>
                      <p className="font-mono text-xs font-bold text-[var(--accent-warn)] uppercase tracking-wider mb-2">Open Health Issues</p>
                      {healthIssues.filter(h => !h.resolved).map(issue => (
                        <div key={issue.id} className="mb-2 p-3 rounded-xl bg-amber-950/20 border border-[var(--border)] border-l-4 border-l-[var(--accent-warn)] font-mono text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="badge badge-xs font-mono bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)] capitalize">{LOG_TYPE_LABELS[issue.log_type] || issue.log_type}</span>
                            <span className="text-[var(--text-muted)]">{issue.date}</span>
                          </div>
                          <p className="text-[var(--text-secondary)] m-0">{issue.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {animalObs.length > 0 && (
                    <div>
                      <p className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Linked Observations</p>
                      {animalObs.map(obs => (
                        <div key={obs.id} className="mb-2 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] font-mono text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span>{categoryEmoji(obs.category)}</span>
                            <span className="font-bold text-[var(--text-primary)]">{categoryLabel(obs.category)}</span>
                            <span className="text-[var(--text-muted)]">{obs.date}</span>
                          </div>
                          {obs.detail && <p className="text-[var(--text-secondary)] m-0">{obs.detail}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {healthIssues.filter(h => !h.resolved).length === 0 && animalObs.length === 0 && (
                    <p className="font-mono text-sm text-[var(--text-muted)] text-center py-6 m-0">No health records yet</p>
                  )}
                </div>
              )}

              {/* Weight tab */}
              {activeTab === 'weight' && (
                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => setShowWeightForm(!showWeightForm)}
                    className="btn btn-sm font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none w-full"
                  >
                    + Log Weight
                  </button>

                  {showWeightForm && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-3 grid gap-3">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="field">
                          <span>Date</span>
                          <input type="date" value={weightForm.date} onChange={e => setWeightForm(f => ({ ...f, date: e.target.value }))} />
                        </label>
                        <label className="field">
                          <span>Weight (lbs)</span>
                          <input type="number" min="0" step="0.1" value={weightForm.weight_lbs} onChange={e => setWeightForm(f => ({ ...f, weight_lbs: e.target.value }))} />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        {['manual', 'scale'].map(m => (
                          <button key={m} type="button" onClick={() => setWeightForm(f => ({ ...f, input_method: m }))}
                            className={`btn btn-xs font-mono flex-1 capitalize ${weightForm.input_method === m ? 'bg-[var(--accent-primary)] text-[var(--bg-base)] border-none' : 'btn-ghost border border-[var(--border)]'}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={handleLogWeight} disabled={savingWt}
                        className="btn btn-sm font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none disabled:opacity-50">
                        {savingWt ? 'Saving...' : 'Save Weight'}
                      </button>
                    </div>
                  )}

                  {weights.length > 0 ? (
                    <table className="w-full font-mono text-xs border-collapse">
                      <thead>
                        <tr>
                          {['Date', 'Weight', 'Change', 'Method'].map(h => (
                            <th key={h} className="text-left text-[var(--text-muted)] pb-2 pr-3 uppercase text-[10px] tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {weights.map((w, i) => {
                          const prev = weights[i + 1]
                          const change = prev ? (w.weight_lbs - prev.weight_lbs) : null
                          return (
                            <tr key={w.id} className="border-t border-[var(--border)]">
                              <td className="py-2 pr-3 text-[var(--text-secondary)]">{w.date}</td>
                              <td className="py-2 pr-3 text-[var(--text-primary)] font-bold">{w.weight_lbs} lbs</td>
                              <td className={`py-2 pr-3 font-bold ${change == null ? 'text-[var(--text-muted)]' : change > 0 ? 'text-[var(--accent-primary)]' : 'text-[var(--accent-danger)]'}`}>
                                {change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}
                              </td>
                              <td className="py-2 text-[var(--text-muted)] capitalize">{w.input_method}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="font-mono text-sm text-[var(--text-muted)] text-center py-6 m-0">No weight records yet</p>
                  )}
                </div>
              )}

              {/* Lineage tab */}
              {activeTab === 'lineage' && (
                <div className="grid gap-4">
                  <div>
                    <p className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Parents</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[['Sire', animal?.sire], ['Dam', animal?.dam]].map(([role, parent]) => (
                        <div key={role} className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-3">
                          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1 m-0">{role}</p>
                          <p className="font-mono text-sm text-[var(--text-primary)] font-bold m-0">
                            {parent ? parent.identifier : <span className="text-[var(--text-muted)] font-normal">Unknown</span>}
                          </p>
                        </div>
                      ))}
                    </div>

                    {!editingLineage ? (
                      <button
                        type="button"
                        onClick={openLineageEditor}
                        className="btn btn-sm btn-ghost font-mono border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] mt-3"
                      >
                        ✎ Edit lineage
                      </button>
                    ) : (
                      <div className="mt-3 flex flex-col gap-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4">
                        <p className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider m-0">
                          Set Parents
                        </p>

                        <div className="form-control">
                          <label className="label">
                            <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">Sire (father)</span>
                          </label>
                          <select
                            value={editSireId || ''}
                            onChange={e => setEditSireId(e.target.value || null)}
                            className="select select-bordered font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)]"
                          >
                            <option value="">Unknown</option>
                            {flockAnimals
                              .filter(a => a.sex === 'male' && a.id !== animal?.id)
                              .map(a => (
                                <option key={a.id} value={a.id}>{a.identifier}</option>
                              ))}
                          </select>
                        </div>

                        <div className="form-control">
                          <label className="label">
                            <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">Dam (mother)</span>
                          </label>
                          <select
                            value={editDamId || ''}
                            onChange={e => setEditDamId(e.target.value || null)}
                            className="select select-bordered font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)]"
                          >
                            <option value="">Unknown</option>
                            {flockAnimals
                              .filter(a => a.sex === 'female' && a.id !== animal?.id)
                              .map(a => (
                                <option key={a.id} value={a.id}>{a.identifier}</option>
                              ))}
                          </select>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingLineage(false)}
                            className="btn btn-sm btn-ghost font-mono border-[var(--border)] flex-1"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveLineage}
                            className="btn btn-sm font-mono flex-1 bg-[var(--accent-primary)] text-[var(--bg-base)] border-none"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="font-mono text-xs text-[var(--text-muted)] text-center m-0">Offspring tracking coming soon</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Status change footer */}
        {animal?.status === 'active' && (
          <div className="p-4 border-t border-[var(--border)]">
            <p className="font-mono text-[10px] text-[var(--text-muted)] text-center mb-2">
              Change status — irreversible for deceased/culled
            </p>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(({ status, label, className }) => (
                <button
                  key={status}
                  type="button"
                  disabled={statusChanging}
                  onClick={() => handleStatusChange(status)}
                  className={`${className} disabled:opacity-50`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
