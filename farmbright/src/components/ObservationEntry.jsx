import { useState } from 'react'
import {
  OBSERVATION_CATEGORIES,
  OBSERVATION_OPTIONS,
} from '../utils/animalClass'
import { logObservation, updateObservation } from '../services/observationsApi'
import { getLocalDateString } from '../utils/date'

export default function ObservationEntry({
  flockId,
  animals = [],
  onSave,
  onCancel,
  compact = false,
  editingObs = null,
  userId,
}) {
  const isEditing = !!editingObs

  const [category,       setCategory]       = useState(editingObs?.category || null)
  const [selectedOptions,setSelectedOptions] = useState(editingObs?.selected_options || [])
  const [customOption,   setCustomOption]   = useState('')
  const [showCustom,     setShowCustom]     = useState(false)
  const [detail,         setDetail]         = useState(editingObs?.detail || '')
  const [severity,       setSeverity]       = useState(editingObs?.severity || 'normal')
  const [followUp,       setFollowUp]       = useState(editingObs?.follow_up_needed || false)
  const [selectedAnimal, setSelectedAnimal] = useState(
    editingObs?.animal_id
      ? animals.find(a => a.id === editingObs.animal_id) || null
      : null
  )
  const [showAnimalPick, setShowAnimalPick] = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState(null)

  function toggleOption(opt) {
    setSelectedOptions(prev =>
      prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
    )
  }

  function addCustomOption() {
    const trimmed = customOption.trim()
    if (!trimmed) return
    if (!selectedOptions.includes(trimmed)) {
      setSelectedOptions(prev => [...prev, trimmed])
    }
    setCustomOption('')
    setShowCustom(false)
  }

  function removeOption(opt) {
    setSelectedOptions(prev => prev.filter(o => o !== opt))
  }

  async function handleSave() {
    if (!category) { setError('Please select a category'); return }
    if (selectedOptions.length === 0 && !detail.trim()) {
      setError('Please select at least one option or add a note')
      return
    }
    setSaving(true)
    setError(null)
    try {
      let result
      if (isEditing) {
        result = await updateObservation(editingObs.id, {
          category,
          selected_options: selectedOptions,
          detail:           detail.trim() || null,
          severity,
          follow_up_needed: followUp,
        })
      } else {
        result = await logObservation({
          flock_id:         flockId,
          animal_id:        selectedAnimal?.id || null,
          date:             getLocalDateString(),
          category,
          selected_options: selectedOptions,
          detail:           detail.trim() || null,
          severity,
          follow_up_needed: followUp,
          created_by:       userId || null,
        })
      }
      onSave?.(result)
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">

      {!category ? (
        <div>
          <p className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            What are you observing?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {OBSERVATION_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-all cursor-pointer font-mono text-xs"
              >
                <span className="text-2xl">{cat.emoji}</span>
                <span className="text-center leading-tight">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {/* Category header with back button */}
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                setCategory(null)
                setSelectedOptions([])
                setShowCustom(false)
                setCustomOption('')
              }}
              className="btn btn-xs btn-ghost font-mono border-[var(--border)] text-[var(--text-muted)]"
            >
              ← Back
            </button>
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
              {OBSERVATION_CATEGORIES.find(c => c.key === category)?.emoji}{' '}
              {OBSERVATION_CATEGORIES.find(c => c.key === category)?.label}
            </span>
          </div>

          {/* Preset option pills */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
            {OBSERVATION_OPTIONS[category]?.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggleOption(opt)}
                className={
                  selectedOptions.includes(opt)
                    ? 'btn font-mono text-sm font-bold bg-[var(--accent-primary)] text-[var(--bg-base)] border-none rounded-xl px-4 py-3 h-auto min-h-[48px] leading-snug text-left'
                    : 'btn btn-ghost font-mono text-sm border-2 border-[var(--border)] text-[var(--text-secondary)] rounded-xl px-4 py-3 h-auto min-h-[48px] leading-snug text-left hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-all'
                }
              >
                {selectedOptions.includes(opt) && '✓ '}
                {opt}
              </button>
            ))}

            {!showCustom && (
              <button
                type="button"
                onClick={() => setShowCustom(true)}
                className="btn btn-sm btn-ghost font-mono border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
              >
                + Custom
              </button>
            )}

            {showCustom && (
              <div className="flex gap-2 w-full mt-1">
                <input
                  type="text"
                  value={customOption}
                  onChange={e => setCustomOption(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addCustomOption()
                    if (e.key === 'Escape') { setShowCustom(false); setCustomOption('') }
                  }}
                  placeholder="Describe what you see..."
                  autoFocus
                  className="input input-sm font-mono flex-1 bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] focus:border-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  onClick={addCustomOption}
                  disabled={!customOption.trim()}
                  className="btn btn-sm btn-ghost font-mono text-[var(--accent-primary)] disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCustom(false); setCustomOption('') }}
                  className="btn btn-sm btn-ghost font-mono text-[var(--text-muted)]"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Selected options summary */}
          {selectedOptions.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3 p-2 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)]">
              <span className="font-mono text-[10px] text-[var(--text-muted)] w-full mb-1">Selected:</span>
              {selectedOptions.map(opt => (
                <span
                  key={opt}
                  className="inline-flex items-center gap-1 badge badge-sm font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none"
                >
                  {opt}
                  <button type="button" onClick={() => removeOption(opt)} className="hover:opacity-70 ml-1">×</button>
                </span>
              ))}
            </div>
          )}

          {/* Additional notes */}
          <div className="mb-3">
            <p className="font-mono text-[10px] text-[var(--text-muted)] mb-1">Additional notes (optional)</p>
            <textarea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder="Any extra detail worth noting..."
              className="textarea w-full font-mono text-sm bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] min-h-[60px] resize-none focus:border-[var(--accent-primary)]"
              maxLength={500}
            />
          </div>

          {/* Animal selector */}
          {animals.length > 0 && !isEditing && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setShowAnimalPick(!showAnimalPick)}
                className="font-mono text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1"
              >
                🐾 {selectedAnimal ? `Tagged: ${selectedAnimal.identifier} ×` : 'Tag a specific animal (optional)'}
              </button>
              {showAnimalPick && (
                <div className="mt-2 flex flex-wrap gap-2 p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => { setSelectedAnimal(null); setShowAnimalPick(false) }}
                    className="btn btn-xs btn-ghost font-mono border-[var(--border)]"
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
                          : 'btn-ghost border-[var(--border)]'
                      }`}
                    >
                      {a.identifier}
                      {a.open_health_issues > 0 && (
                        <span className="badge badge-xs bg-[var(--accent-warn)] text-[var(--bg-base)] ml-1 border-none">!</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Severity */}
          <div className="flex gap-2 mb-3">
            {[
              { key: 'normal',  label: 'Normal',     active: 'bg-[var(--bg-elevated)] border-[var(--accent-primary)] text-[var(--text-primary)] font-bold', inactive: 'btn-ghost border-[var(--border)] text-[var(--text-muted)]' },
              { key: 'concern', label: '⚠ Concern',  active: 'bg-[var(--accent-warn)] text-[var(--bg-base)] border-none font-bold',                         inactive: 'btn-ghost border-[var(--border)] text-[var(--text-muted)]' },
              { key: 'urgent',  label: '🚨 Urgent',  active: 'bg-[var(--accent-danger)] text-white border-none font-bold',                                  inactive: 'btn-ghost border-[var(--border)] text-[var(--text-muted)]' },
            ].map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSeverity(s.key)}
                className={`btn btn-sm font-mono flex-1 ${severity === s.key ? s.active : s.inactive}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Follow-up toggle */}
          <div className="flex items-center gap-3 mb-4">
            <input
              type="checkbox"
              checked={followUp}
              onChange={e => setFollowUp(e.target.checked)}
              className="checkbox checkbox-sm [--chkbg:var(--accent-primary)]"
            />
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              Needs follow-up — adds to action items on dashboard
            </span>
          </div>

          {error && <p className="font-mono text-xs text-[var(--accent-danger)] mb-3">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-sm btn-ghost font-mono border-[var(--border)] text-[var(--text-muted)] flex-1"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (!selectedOptions.length && !detail.trim())}
              className="btn btn-sm font-mono font-bold bg-[var(--accent-primary)] text-[var(--bg-base)] border-none flex-1 disabled:opacity-40"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Observation'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
