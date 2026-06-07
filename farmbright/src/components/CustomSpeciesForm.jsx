import React, { useState } from 'react';
import { buildCustomSpeciesPayload, CLASS_CONFIG, SPECIES_MAP } from '../utils/animalClass';
import { createAnimalClass } from '../services/onboardingApi';

function classTypeEmoji(classType) {
  return Object.values(SPECIES_MAP).find((s) => s.class_type === classType)?.emoji || '🐾';
}

const BLANK = {
  name: '', emoji: '🐾', class_type: 'other',
  produces_eggs: false, produces_milk: false,
  produces_meat: true, produces_young: true,
  working_animal: false,
};

const FLAGS = [
  { key: 'produces_eggs',  label: '🥚 Eggs' },
  { key: 'produces_milk',  label: '🥛 Milk' },
  { key: 'produces_meat',  label: '🥩 Meat' },
  { key: 'produces_young', label: '🐣 Young' },
  { key: 'working_animal', label: '🛡️ Working' },
];

function CustomSpeciesForm({ userId, onAdd }) {
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'working_animal' && value) next.produces_meat = false;
      return next;
    });
  }

  async function handleSubmit() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const payload = buildCustomSpeciesPayload(userId, form);
      const newClass = await createAnimalClass(payload);
      onAdd(newClass);
      setForm({ ...BLANK });
    } catch (err) {
      setError(err.message || 'Could not add animal type.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 grid gap-3">
      <div className="flex gap-3 items-end">
        <label className="field flex-1">
          <span>Animal name</span>
          <input
            placeholder="e.g. Alpaca, Peacock, Donkey"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          />
        </label>
        <label className="field" style={{ width: '76px' }}>
          <span>Emoji</span>
          <input
            className="text-center text-xl"
            maxLength={2}
            placeholder="🐾"
            value={form.emoji}
            onChange={(e) => setField('emoji', e.target.value || '🐾')}
          />
        </label>
      </div>

      <div>
        <span className="text-[var(--text-muted)] text-xs block mb-2">Animal type</span>
        <div className="flex flex-wrap gap-2">
          {Object.keys(CLASS_CONFIG).map((type) => (
            <button
              key={type}
              type="button"
              className={[
                'border rounded-full text-xs px-3 py-1 font-mono capitalize',
                form.class_type === type
                  ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold'
                  : 'bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-secondary)]',
              ].join(' ')}
              onClick={() => setField('class_type', type)}
            >
              {classTypeEmoji(type)} {type}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-[var(--text-muted)] text-xs block mb-2">What does this animal produce?</span>
        <div className="flex flex-wrap gap-2">
          {FLAGS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={[
                'border rounded-full text-xs px-3 py-1 font-mono',
                form[key]
                  ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold'
                  : 'bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-secondary)]',
              ].join(' ')}
              onClick={() => setField(key, !form[key])}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[var(--accent-danger)] font-mono text-xs m-0">{error}</p>}

      <button
        className="primary-button"
        type="button"
        disabled={!form.name.trim() || saving}
        onClick={handleSubmit}
      >
        {saving ? '...' : `+ Add ${form.name.trim() || 'Custom Animal'}`}
      </button>
    </div>
  );
}

export default CustomSpeciesForm;
