import { useState } from 'react'
import { CheckCircle, Pencil, Trash2 } from 'lucide-react'
import { OBSERVATION_CATEGORIES } from '../utils/animalClass'

export default function ObservationCard({
  obs,
  onEdit,
  onDelete,
  onResolve,
  showFlock = true,
  compact = false,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const cat = OBSERVATION_CATEGORIES.find(c => c.key === obs.category)

  const borderColor =
    obs.severity === 'urgent'  ? 'border-l-[var(--accent-danger)]' :
    obs.severity === 'concern' ? 'border-l-[var(--accent-warn)]' :
                                 'border-l-[var(--accent-primary)]'

  const bgColor =
    obs.severity === 'urgent'  ? 'bg-red-950/20' :
    obs.severity === 'concern' ? 'bg-amber-950/20' :
                                 'bg-[var(--bg-surface)]'

  return (
    <div className={`rounded-xl border border-[var(--border)] border-l-4 ${borderColor} ${bgColor} p-3 mb-2`}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">

          <span className="font-mono text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
            {cat?.emoji} {cat?.label}
          </span>

          {showFlock && obs.flocks && (
            <span className="font-mono text-xs text-[var(--text-muted)]">
              · {obs.flocks.breeds?.animal_types?.emoji}{obs.flocks.name}
            </span>
          )}

          {obs.animals && (
            <span className="badge badge-xs font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none">
              🐾 {obs.animals.identifier}
            </span>
          )}

          {obs.severity !== 'normal' && (
            <span className={`badge badge-xs font-mono border-none font-bold ${
              obs.severity === 'urgent'
                ? 'bg-[var(--accent-danger)] text-white'
                : 'bg-[var(--accent-warn)] text-[var(--bg-base)]'
            }`}>
              {obs.severity === 'urgent' ? '🚨' : '⚠'} {obs.severity.toUpperCase()}
            </span>
          )}

          {obs.follow_up_needed && !obs.follow_up_resolved && (
            <span className="badge badge-xs font-mono bg-[var(--bg-elevated)] text-[var(--accent-warn)] border border-[var(--accent-warn)]">
              Follow-up needed
            </span>
          )}
          {obs.follow_up_resolved && (
            <span className="badge badge-xs font-mono bg-[var(--bg-elevated)] text-[var(--accent-primary)] border border-[var(--accent-primary)]">
              ✓ Resolved
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {new Date(obs.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(obs)}
              className="btn btn-xs btn-ghost text-[var(--text-muted)] hover:text-[var(--accent-primary)] p-1"
            >
              <Pencil size={12} />
            </button>
          )}
          {onDelete && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn btn-xs btn-ghost text-[var(--text-muted)] hover:text-[var(--accent-danger)] p-1"
            >
              <Trash2 size={12} />
            </button>
          )}
          {confirmDelete && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onDelete(obs.id)}
                className="btn btn-xs font-mono bg-[var(--accent-danger)] text-white border-none"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="btn btn-xs btn-ghost font-mono border-[var(--border)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Selected options */}
      {obs.selected_options?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {obs.selected_options.map(opt => (
            <span
              key={opt}
              className="badge badge-sm font-mono bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)]"
            >
              {opt}
            </span>
          ))}
        </div>
      )}

      {/* Additional detail */}
      {obs.detail && (
        <p className="font-mono text-xs text-[var(--text-secondary)] leading-relaxed mt-2">
          {obs.detail}
        </p>
      )}

      {/* Resolve button */}
      {obs.follow_up_needed && !obs.follow_up_resolved && onResolve && (
        <button
          type="button"
          onClick={() => onResolve(obs.id)}
          className="btn btn-xs font-mono mt-2 bg-[var(--accent-primary)] text-[var(--bg-base)] border-none gap-1"
        >
          <CheckCircle size={10} /> Mark resolved
        </button>
      )}
    </div>
  )
}
