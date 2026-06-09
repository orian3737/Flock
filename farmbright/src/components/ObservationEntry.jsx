import React, { useContext, useState } from 'react'
import { FarmContext } from '../context/FarmContext'
import { logObservation } from '../services/observationsApi'

export const CATEGORIES = [
  { key: 'feed_intake',  label: 'Feed Intake',  emoji: '🍽️', placeholder: 'e.g. Eating well / reduced / refused entirely' },
  { key: 'water_intake', label: 'Water Intake', emoji: '💧',  placeholder: 'e.g. Drinking normally / not drinking' },
  { key: 'behavior',     label: 'Behavior',     emoji: '🏃',  placeholder: 'e.g. Active and alert / lethargic / isolating' },
  { key: 'physical',     label: 'Physical',     emoji: '👁️',  placeholder: 'e.g. Appears healthy / limping / injury noted' },
  { key: 'environment',  label: 'Environment',  emoji: '🏠',  placeholder: 'e.g. Pen clean / water line needs attention' },
  { key: 'general',      label: 'General',      emoji: '📝',  placeholder: 'Any other observation worth noting' },
]

const SEVERITIES = [
  { key: 'normal',  label: 'Normal' },
  { key: 'concern', label: 'Concern' },
  { key: 'urgent',  label: 'Urgent 🚨' },
]

function severityClass(key, active) {
  if (!active) return 'btn btn-sm font-mono flex-1 btn-ghost border border-[var(--border)] text-[var(--text-muted)]'
  if (key === 'urgent')  return 'btn btn-sm font-mono flex-1 bg-[var(--accent-danger)] text-white border-none'
  if (key === 'concern') return 'btn btn-sm font-mono flex-1 bg-[var(--accent-warn)] text-[var(--bg-base)] border-none'
  return 'btn btn-sm font-mono flex-1 bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--accent-primary)]'
}

export default function ObservationEntry({
  flockId,
  flockName,
  animals = [],
  onSave,
  onCancel,
  compact = false,
}) {
  const { userId } = useContext(FarmContext)
  const [category,        setCategory]        = useState('general')
  const [detail,          setDetail]          = useState('')
  const [severity,        setSeverity]        = useState('normal')
  const [followUp,        setFollowUp]        = useState(false)
  const [selectedAnimal,  setSelectedAnimal]  = useState(null)
  const [showAnimalPick,  setShowAnimalPick]  = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')

  const cols = compact ? 'grid-cols-2' : 'grid-cols-3'
  const placeholder = CATEGORIES.find(c => c.key === category)?.placeholder || ''

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const obs = await logObservation({
        flock_id:         flockId,
        animal_id:        selectedAnimal?.id || null,
        date:             new Date().toISOString().split('T')[0],
        category,
        detail:           detail.trim() || null,
        severity,
        follow_up_needed: followUp,
        created_by:       userId || null,
      })
      onSave?.(obs)
      setCategory('general')
      setDetail('')
      setSeverity('normal')
      setFollowUp(false)
      setSelectedAnimal(null)
      setShowAnimalPick(false)
    } catch (err) {
      setError(err.message || 'Could not save observation.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3">
      {/* Category grid */}
      <div>
        <p className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          What are you observing?
        </p>
        <div className={`grid ${cols} gap-2`}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategory(cat.key)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all font-mono text-xs ${
                category === cat.key
                  ? 'border-[var(--accent-primary)] bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold'
                  : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--accent-primary)]'
              }`}
            >
              <span className="text-xl">{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Detail textarea */}
      <textarea
        value={detail}
        onChange={e => setDetail(e.target.value)}
        placeholder={placeholder}
        className={`textarea w-full font-mono text-sm bg-[var(--bg-base)] border border-[var(--border)] text-[var(--text-primary)] focus:border-[var(--accent-primary)] outline-none rounded-lg p-3 resize-y ${compact ? 'min-h-[60px]' : 'min-h-[80px]'}`}
      />

      {/* Animal selector */}
      {animals?.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowAnimalPick(!showAnimalPick)}
            className="font-mono text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1"
          >
            🐾 {selectedAnimal ? `Tagged: ${selectedAnimal.identifier}` : 'Tag a specific animal (optional)'}
          </button>
          {showAnimalPick && (
            <div className="mt-2 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setSelectedAnimal(null); setShowAnimalPick(false) }}
                  className="btn btn-xs btn-ghost font-mono border border-[var(--border)]"
                >
                  None
                </button>
                {animals.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setSelectedAnimal(a); setShowAnimalPick(false) }}
                    className={`btn btn-xs font-mono ${
                      selectedAnimal?.id === a.id
                        ? 'bg-[var(--accent-primary)] text-[var(--bg-base)] border-none'
                        : 'btn-ghost border border-[var(--border)]'
                    }`}
                  >
                    {a.identifier}
                    {a.open_health_issues > 0 && (
                      <span className="badge badge-xs bg-[var(--accent-warn)] text-[var(--bg-base)] ml-1 border-none">
                        {a.open_health_issues}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Severity */}
      <div className="flex gap-2">
        {SEVERITIES.map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSeverity(s.key)}
            className={severityClass(s.key, severity === s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Follow-up */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={followUp}
          onChange={e => setFollowUp(e.target.checked)}
          className="checkbox checkbox-sm [--chkbg:var(--accent-primary)]"
        />
        <span className="font-mono text-xs text-[var(--text-secondary)]">
          Follow-up needed — adds to action items
        </span>
      </label>

      {error && <p className="font-mono text-xs text-[var(--accent-danger)]">{error}</p>}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn flex-1 font-mono font-bold bg-[var(--accent-primary)] text-[var(--bg-base)] border-none disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Observation'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-ghost font-mono border border-[var(--border)]"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
