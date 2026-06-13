import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { CLASS_CONFIG, SPECIES_MAP } from "../../utils/animalClass";
import { useAuth } from "../../context/AuthContext";
import CustomSpeciesForm from "../../components/CustomSpeciesForm";
import InlineFeedback from "../../components/InlineFeedback";
import { supabase } from "../../services/supabaseClient";
import {
  createBreed,
  deleteAnimalClass,
  deleteAnimalType,
  deleteBreed,
  deleteFeedType,
  deleteFlock,
  getOnboardingSummary,
  updateAnimalClass,
  updateAnimalType,
  updateBreed,
  updateFeedType,
  updateFlock,
} from "../../services/onboardingApi";

function classTypeEmoji(classType) {
  return Object.values(SPECIES_MAP).find(s => s.class_type === classType)?.emoji || '🐾';
}

const designations = ["layer", "breeder", "meat", "mixed"];

function FarmSetup() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState({ animal_classes: [], feed_types: [] });
  const [openPanels, setOpenPanels] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingBreedId, setEditingBreedId] = useState(null);
  const [editingBreedName, setEditingBreedName] = useState("");
  const [newBreedName, setNewBreedName] = useState({});
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [newFeed, setNewFeed] = useState({ name: '', unit: 'lbs', bag_weight: '', bag_price: '', on_hand: '0', par_level: '50' });
  const [assignModalFlockId, setAssignModalFlockId] = useState(null);
  const [assignModalFlock, setAssignModalFlock] = useState(null);
  const [selectedFeedIds, setSelectedFeedIds] = useState([]);

  async function loadSummary() {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const data = await getOnboardingSummary(profile.id);
      setSummary(data);
      setOpenPanels(current => {
        if (current.size) return current;
        return new Set(data.animal_classes.map(ac => ac.id));
      });
      return true;
    } catch (err) {
      setFeedback({ type: "error", message: formatError(err) });
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSummary(); }, [profile?.id]);

  function beginEdit(type, item) {
    setEditing({ type, id: item.id });
    setDraft({ ...item });
    setFeedback(null);
  }

  function cancelEdit() { setEditing(null); setDraft({}); }

  function isEditing(type, id) { return editing?.type === type && editing?.id === id; }

  function updateDraft(key, value) { setDraft(c => ({ ...c, [key]: value })); }

  function togglePanel(id) {
    setOpenPanels(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function saveEdit(type, id) {
    setFeedback(null);
    try {
      if (type === "animalClass") {
        await updateAnimalClass(id, { name: draft.name, class_type: draft.class_type });
      }
      if (type === "flock") {
        await updateFlock(id, {
          name: draft.name, designation: draft.designation,
          pen_name: draft.pen_name, current_headcount: Number(draft.current_headcount || 0),
          egg_price_per_dozen: Number(draft.egg_price_per_dozen || 0),
          meat_price_per_lb: Number(draft.meat_price_per_lb || 0),
          meat_price_per_bird: Number(draft.meat_price_per_bird || 0),
        });
      }
      if (type === "feedType") {
        await updateFeedType(id, {
          name: draft.name, unit: draft.unit,
          bag_weight: Number(draft.bag_weight || 0), bag_price: Number(draft.bag_price || 0),
          par_level: Number(draft.par_level || 0), current_on_hand: Number(draft.current_on_hand || 0),
        });
      }
      cancelEdit();
      if (await loadSummary()) setFeedback({ type: "success", message: "Saved changes." });
    } catch (err) {
      setFeedback({ type: "error", message: formatError(err) });
    }
  }

  async function deleteItem(type, id) {
    setFeedback(null);
    try {
      if (type === "animalClass") await deleteAnimalClass(id);
      if (type === "animalType") await deleteAnimalType(id);
      if (type === "breed") await deleteBreed(id);
      if (type === "flock") await deleteFlock(id);
      if (type === "feedType") await deleteFeedType(id);
      if (await loadSummary()) setFeedback({ type: "success", message: "Deleted." });
    } catch (err) {
      setFeedback({ type: "error", message: formatError(err) });
    }
  }

  async function handleFlagToggle(animalTypeId, flagKey, newValue) {
    setFeedback(null);
    try {
      const patch = { [flagKey]: newValue };
      if (flagKey === 'working_animal' && newValue) patch.produces_meat = false;
      await updateAnimalType(animalTypeId, patch);
      if (await loadSummary()) setFeedback({ type: 'success', message: 'Updated.' });
    } catch (err) {
      setFeedback({ type: 'error', message: formatError(err) });
    }
  }

  async function handleAddBreed(animalTypeId) {
    const name = newBreedName[animalTypeId]?.trim();
    if (!name) return;
    setFeedback(null);
    try {
      await createBreed(animalTypeId, name);
      setNewBreedName(prev => ({ ...prev, [animalTypeId]: "" }));
      if (await loadSummary()) setFeedback({ type: "success", message: "Breed added." });
    } catch (err) {
      setFeedback({ type: "error", message: formatError(err) });
    }
  }

  async function saveBreedEdit(breedId) {
    const name = editingBreedName.trim();
    if (!name) return;
    setFeedback(null);
    try {
      await updateBreed(breedId, name);
      setEditingBreedId(null);
      if (await loadSummary()) setFeedback({ type: "success", message: "Breed updated." });
    } catch (err) {
      setFeedback({ type: "error", message: formatError(err) });
    }
  }

  async function handleDeleteBreed(breedId, breedName) {
    if (!window.confirm(`Delete breed "${breedName}"? This cannot be undone.`)) return;
    setFeedback(null);
    try {
      await deleteBreed(breedId);
      if (await loadSummary()) setFeedback({ type: "success", message: "Breed deleted." });
    } catch (err) {
      setFeedback({ type: "error", message: formatError(err) });
    }
  }

  async function handleAddFeedType() {
    if (!newFeed.name.trim() || !newFeed.bag_weight || !newFeed.bag_price) return;
    const costPerUnit = parseFloat(newFeed.bag_price) / parseFloat(newFeed.bag_weight);
    setFeedback(null);
    try {
      const { error } = await supabase.from('feed_types').insert({
        user_id:         profile.id,
        name:            newFeed.name.trim(),
        unit:            newFeed.unit,
        bag_weight:      parseFloat(newFeed.bag_weight),
        bag_price:       parseFloat(newFeed.bag_price),
        cost_per_unit:   isNaN(costPerUnit) ? 0 : costPerUnit,
        current_on_hand: parseFloat(newFeed.on_hand) || 0,
        par_level:       parseFloat(newFeed.par_level) || 50,
      });
      if (error) throw error;
      setNewFeed({ name: '', unit: 'lbs', bag_weight: '', bag_price: '', on_hand: '0', par_level: '50' });
      if (await loadSummary()) setFeedback({ type: 'success', message: 'Feed type added.' });
    } catch (err) {
      setFeedback({ type: 'error', message: formatError(err) });
    }
  }

  function closeAssignModal() {
    setAssignModalFlockId(null);
    setAssignModalFlock(null);
    setSelectedFeedIds([]);
  }

  function openAssignModal(flock) {
    const current = flock.feed_assignments?.map(fa => fa.feed_type_id) || [];
    setAssignModalFlockId(flock.id);
    setAssignModalFlock(flock);
    setSelectedFeedIds(current);
  }

  async function handleSaveFeedAssignments() {
    const flockId = assignModalFlockId;
    if (!flockId) {
      setFeedback({ type: 'error', message: 'Choose a flock before assigning feeds.' });
      return false;
    }
    setFeedback(null);
    try {
      const { error: deleteError } = await supabase
        .from('feed_assignments')
        .delete()
        .eq('flock_id', flockId);
      if (deleteError) throw deleteError;

      if (selectedFeedIds.length > 0) {
        const { error: insertError } = await supabase
          .from('feed_assignments')
          .insert(
            selectedFeedIds.map(feedId => ({
              flock_id:     flockId,
              feed_type_id: feedId,
            }))
          );
        if (insertError) throw insertError;
      }
      closeAssignModal();
      if (await loadSummary()) setFeedback({ type: 'success', message: 'Feeds updated.' });
      return true;
    } catch (err) {
      setFeedback({ type: 'error', message: formatError(err) });
      return false;
    }
  }

  return (
    <section className="settings-page">
      <header className="page-header">
        <div>
          <h1 className="display-font">Farm Setup</h1>
          <p className="settings-subheader">Edit your animals, flocks, and feed settings</p>
        </div>
      </header>

      <InlineFeedback message={feedback?.message} type={feedback?.type} />
      {loading ? <div className="panel-card">Loading farm setup...</div> : null}

      <div className="settings-stack">
        {summary.animal_classes.map(animalClass => {
          const open = openPanels.has(animalClass.id);
          return (
            <section className="settings-panel" key={animalClass.id}>
              <div className="settings-panel-header">
                <button className="accordion-toggle" type="button" onClick={() => togglePanel(animalClass.id)}>
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <InlineNameEditor
                  className="display-font text-[28px] leading-none text-[#e8f5e9]"
                  editing={isEditing("animalClass", animalClass.id)}
                  value={isEditing("animalClass", animalClass.id) ? draft.name : animalClass.name}
                  onChange={value => updateDraft("name", value)}
                />
                <RowActions
                  editing={isEditing("animalClass", animalClass.id)}
                  onCancel={cancelEdit}
                  onDelete={() => deleteItem("animalClass", animalClass.id)}
                  onEdit={() => beginEdit("animalClass", animalClass)}
                  onSave={() => saveEdit("animalClass", animalClass.id)}
                />
              </div>

              {isEditing("animalClass", animalClass.id) && (
                <div className="px-4 pb-3 grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(CLASS_CONFIG).map(type => (
                      <button
                        key={type}
                        type="button"
                        className={[
                          "bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[32px] py-[6px] px-3 text-xs capitalize",
                          (draft.class_type || 'other') === type
                            ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold"
                            : "",
                        ].join(" ")}
                        onClick={() => updateDraft("class_type", type)}
                      >
                        {classTypeEmoji(type)} {type}
                      </button>
                    ))}
                  </div>
                  <p className="text-[var(--text-muted)] text-xs m-0">
                    Animal category controls terminology and designation options.
                  </p>
                </div>
              )}

              {open && (
                <div className="settings-panel-body">
                  {(animalClass.animal_types || []).map(animalType => (
                    <div key={animalType.id} className="mb-4">
                      <div className="flex items-center gap-2 px-1 pb-2 border-b border-[var(--border)] mb-2">
                        <span className="text-lg">{animalType.emoji}</span>
                        <span className="font-mono text-sm text-[var(--text-secondary)] font-bold flex-1">{animalType.name}</span>
                        <button
                          className="icon-button danger"
                          type="button"
                          aria-label="Delete type"
                          onClick={() => deleteItem("animalType", animalType.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-1 pb-2 mb-2">
                        {[
                          { key: 'produces_eggs',  emoji: '🥚', label: 'Eggs' },
                          { key: 'produces_milk',  emoji: '🥛', label: 'Milk' },
                          { key: 'produces_meat',  emoji: '🥩', label: 'Meat' },
                          { key: 'produces_young', emoji: '🐣', label: 'Young' },
                          { key: 'working_animal', emoji: '🛡️', label: 'Working' },
                        ].map(({ key, emoji, label }) => {
                          const active = Boolean(animalType[key]);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleFlagToggle(animalType.id, key, !active)}
                              className={active
                                ? 'btn btn-sm font-mono font-bold gap-2 bg-[var(--accent-primary)] text-white border-2 border-[var(--accent-primary)] shadow-lg shadow-green-900/50'
                                : 'btn btn-sm font-mono gap-2 bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--accent-primary)] hover:text-[var(--text-secondary)] transition-colors'
                              }
                            >
                              <span className="text-base">{emoji}</span> {label}
                            </button>
                          );
                        })}
                        <p className="w-full font-mono text-[10px] text-[var(--text-muted)] mt-2 mb-0">
                          Tap to toggle what this animal produces
                        </p>
                      </div>

                      {(animalType.breeds || []).map(breed => (
                        <section className="breed-editor" key={breed.id}>
                          <div className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                            {editingBreedId === breed.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <input
                                  autoFocus
                                  className="settings-inline-input flex-1"
                                  value={editingBreedName}
                                  onChange={e => setEditingBreedName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") saveBreedEdit(breed.id);
                                    if (e.key === "Escape") setEditingBreedId(null);
                                  }}
                                />
                                <button className="icon-button" type="button" onClick={() => saveBreedEdit(breed.id)} aria-label="Save">
                                  <Save size={16} />
                                </button>
                                <button className="icon-button" type="button" onClick={() => setEditingBreedId(null)} aria-label="Cancel">
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="font-mono text-sm text-[var(--text-primary)]">{breed.name}</span>
                                <div className="settings-actions">
                                  <button
                                    className="icon-button"
                                    type="button"
                                    aria-label="Edit"
                                    onClick={() => { setEditingBreedId(breed.id); setEditingBreedName(breed.name); }}
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button
                                    className="icon-button danger"
                                    type="button"
                                    aria-label="Delete"
                                    onClick={() => handleDeleteBreed(breed.id, breed.name)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          <div className="flock-editor-list">
                            {(breed.flocks || []).map(flock => (
                              <FlockEditor
                                animalType={animalType}
                                draft={draft}
                                editing={isEditing("flock", flock.id)}
                                feedTypes={summary.feed_types}
                                flock={flock}
                                key={flock.id}
                                onCancel={cancelEdit}
                                onChange={updateDraft}
                                onDelete={() => deleteItem("flock", flock.id)}
                                onEdit={() => beginEdit("flock", flock)}
                                onOpenAssignModal={openAssignModal}
                                onSave={() => saveEdit("flock", flock.id)}
                              />
                            ))}
                          </div>
                        </section>
                      ))}

                      <div className="flex items-center gap-2 mt-2 px-1">
                        <input
                          className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[36px] py-2 px-[10px] flex-1 font-mono text-sm"
                          placeholder={`Add ${animalType.name.toLowerCase()} breed...`}
                          value={newBreedName[animalType.id] || ""}
                          onChange={e => setNewBreedName(prev => ({ ...prev, [animalType.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") handleAddBreed(animalType.id); }}
                        />
                        <button
                          className="primary-button"
                          type="button"
                          disabled={!newBreedName[animalType.id]?.trim()}
                          onClick={() => handleAddBreed(animalType.id)}
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>
                    </div>
                  ))}

                  {!(animalClass.animal_types || []).length && (
                    <p className="text-[var(--text-muted)] text-xs px-1 py-2">No animal types configured for this class.</p>
                  )}
                </div>
              )}
            </section>
          );
        })}

        <section className="settings-panel">
          <div className="settings-panel-header">
            <strong className="display-font text-[22px] leading-none text-[#e8f5e9]">+ Add Custom Animal Type</strong>
            <button className="secondary-button" type="button" onClick={() => setShowCustomForm(v => !v)}>
              {showCustomForm ? 'Cancel' : 'Add'}
            </button>
          </div>
          {showCustomForm && (
            <div className="px-4 pb-4">
              <CustomSpeciesForm
                userId={profile?.id}
                onAdd={newClass => {
                  setShowCustomForm(false);
                  loadSummary();
                  setFeedback({ type: 'success', message: `${newClass.name} added.` });
                }}
              />
            </div>
          )}
        </section>

        <section className="settings-panel">
          <div className="settings-panel-header">
            <strong className="display-font text-[28px] leading-none text-[#e8f5e9]">Feed Types</strong>
          </div>
          <div className="settings-panel-body">
            <div className="bg-[var(--bg-surface)] rounded-xl border border-dashed border-[var(--border)] p-5 mb-6">
              <p className="font-mono text-xs font-bold text-[var(--accent-primary)] uppercase tracking-wider mb-4">+ Add Feed Type</p>

              <div className="form-control mb-3">
                <label className="label pb-1">
                  <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">Feed Name</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Layer Pellets 16%"
                  value={newFeed.name}
                  onChange={e => setNewFeed(f => ({ ...f, name: e.target.value }))}
                  className="input input-bordered font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="form-control">
                  <label className="label pb-1">
                    <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">Unit</span>
                  </label>
                  <select
                    value={newFeed.unit}
                    onChange={e => setNewFeed(f => ({ ...f, unit: e.target.value }))}
                    className="select select-bordered font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] w-full"
                  >
                    <option value="lbs">lbs</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label pb-1">
                    <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">Bag Weight</span>
                  </label>
                  <input
                    type="number" min="0" step="0.01" placeholder="50"
                    value={newFeed.bag_weight}
                    onChange={e => setNewFeed(f => ({ ...f, bag_weight: e.target.value }))}
                    className="input input-bordered font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="form-control">
                  <label className="label pb-1">
                    <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">Bag Price ($)</span>
                  </label>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={newFeed.bag_price}
                    onChange={e => setNewFeed(f => ({ ...f, bag_price: e.target.value }))}
                    className="input input-bordered font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] w-full"
                  />
                </div>
                <div className="form-control">
                  <label className="label pb-1">
                    <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">Cost/{newFeed.unit}</span>
                    <span className="label-text-alt font-mono text-[10px] text-[var(--text-muted)]">Auto-calculated</span>
                  </label>
                  <input
                    disabled
                    value={
                      newFeed.bag_weight && newFeed.bag_price
                        ? (parseFloat(newFeed.bag_price) / parseFloat(newFeed.bag_weight)).toFixed(4)
                        : '—'
                    }
                    className="input input-bordered font-mono bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)] w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="form-control">
                  <label className="label pb-1">
                    <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">Current Stock</span>
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    value={newFeed.on_hand}
                    onChange={e => setNewFeed(f => ({ ...f, on_hand: e.target.value }))}
                    className="input input-bordered font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] w-full"
                  />
                </div>
                <div className="form-control">
                  <label className="label pb-1">
                    <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">Par Level</span>
                    <span className="label-text-alt font-mono text-[10px] text-[var(--text-muted)]">Alert when below</span>
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    value={newFeed.par_level}
                    onChange={e => setNewFeed(f => ({ ...f, par_level: e.target.value }))}
                    className="input input-bordered font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] w-full"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={!newFeed.name.trim() || !newFeed.bag_weight || !newFeed.bag_price}
                onClick={handleAddFeedType}
                className="btn w-full font-mono font-bold bg-[var(--accent-primary)] text-[var(--bg-base)] border-none disabled:opacity-40"
              >
                + Add Feed Type
              </button>
            </div>

            <div className="feed-type-editor-list">
              {summary.feed_types.map(feedType => (
                <FeedTypeEditor
                  draft={draft}
                  editing={isEditing("feedType", feedType.id)}
                  feedType={feedType}
                  key={feedType.id}
                  onCancel={cancelEdit}
                  onChange={updateDraft}
                  onDelete={() => deleteItem("feedType", feedType.id)}
                  onEdit={() => beginEdit("feedType", feedType)}
                  onSave={() => saveEdit("feedType", feedType.id)}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      {assignModalFlockId && (
        <FeedAssignModal
          flock={assignModalFlock}
          feedTypes={summary.feed_types}
          selectedFeedIds={selectedFeedIds}
          setSelectedFeedIds={setSelectedFeedIds}
          onSave={handleSaveFeedAssignments}
          onClose={closeAssignModal}
        />
      )}
    </section>
  );
}

function InlineNameEditor({ className = "", editing, onChange, value }) {
  if (editing) {
    return <input className="settings-inline-input" value={value || ""} onChange={e => onChange(e.target.value)} />;
  }
  return <strong className={className}>{value}</strong>;
}

function RowActions({ editing, onCancel, onDelete, onEdit, onSave }) {
  return (
    <div className="settings-actions">
      {editing ? (
        <>
          <button className="icon-button" type="button" onClick={onSave} aria-label="Save"><Save size={16} /></button>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Cancel"><X size={16} /></button>
        </>
      ) : (
        <button className="icon-button" type="button" onClick={onEdit} aria-label="Edit"><Pencil size={16} /></button>
      )}
      <button className="icon-button danger" type="button" onClick={onDelete} aria-label="Delete"><Trash2 size={16} /></button>
    </div>
  );
}

function FlockEditor({ animalType, draft, editing, feedTypes, flock, onCancel, onChange, onDelete, onEdit, onSave, onOpenAssignModal }) {
  const source = editing ? draft : flock;
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] overflow-hidden mb-3">
      <div className="flex items-center gap-4 px-4 py-3 flex-wrap">
        {editing ? (
          <>
            <label className="field flex-1 min-w-[110px]">
              <span>Name</span>
              <input value={source.name || ""} onChange={e => onChange("name", e.target.value)} />
            </label>
            <label className="field min-w-[90px]">
              <span>Pen</span>
              <input value={source.pen_name || ""} onChange={e => onChange("pen_name", e.target.value)} />
            </label>
            <label className="field min-w-[80px]">
              <span>Headcount</span>
              <input min="0" type="number" value={source.current_headcount ?? 0} onChange={e => onChange("current_headcount", e.target.value)} />
            </label>
            <label className="field min-w-[100px]">
              <span>Designation</span>
              <select value={source.designation || "mixed"} onChange={e => onChange("designation", e.target.value)}>
                {designations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            {animalType?.produces_eggs ? (
              <label className="field min-w-[150px]">
                <span>Egg benchmark/dozen</span>
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={source.egg_price_per_dozen ?? ""}
                  onChange={e => onChange("egg_price_per_dozen", e.target.value)}
                  placeholder="6.00"
                />
              </label>
            ) : null}
            {animalType?.produces_meat ? (
              <>
                <label className="field min-w-[145px]">
                  <span>Meat benchmark/lb</span>
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    value={source.meat_price_per_lb ?? ""}
                    onChange={e => onChange("meat_price_per_lb", e.target.value)}
                    placeholder="4.00"
                  />
                </label>
                <label className="field min-w-[155px]">
                  <span>Meat benchmark/head</span>
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    value={source.meat_price_per_bird ?? ""}
                    onChange={e => onChange("meat_price_per_bird", e.target.value)}
                    placeholder="120.00"
                  />
                </label>
              </>
            ) : null}
            <div className="ml-auto flex gap-2 shrink-0">
              <button type="button" onClick={onSave}
                className="btn btn-xs font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none">
                <Save size={12} /> Save
              </button>
              <button type="button" onClick={onCancel}
                className="btn btn-xs btn-ghost font-mono border border-[var(--border)]">
                <X size={12} /> Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="font-mono text-xs text-[var(--text-muted)] m-0">Name</p>
              <p className="font-mono text-sm font-bold text-[var(--text-primary)] m-0">{flock.name}</p>
            </div>
            <div>
              <p className="font-mono text-xs text-[var(--text-muted)] m-0">Pen</p>
              <p className="font-mono text-sm text-[var(--text-primary)] m-0">{flock.pen_name || '—'}</p>
            </div>
            <div>
              <p className="font-mono text-xs text-[var(--text-muted)] m-0">Headcount</p>
              <p className="font-mono text-sm text-[var(--text-primary)] m-0">{flock.current_headcount}</p>
            </div>
            <div>
              <p className="font-mono text-xs text-[var(--text-muted)] m-0">Designation</p>
              <p className="font-mono text-sm text-[var(--text-primary)] capitalize m-0">{flock.designation}</p>
            </div>
            <div className="ml-auto flex gap-2 shrink-0">
              <button type="button" onClick={onEdit} aria-label={`Edit ${flock.name}`}
                className="btn btn-xs btn-ghost text-[var(--text-muted)] hover:text-[var(--accent-primary)]">
                <Pencil size={14} />
              </button>
              <button type="button" onClick={onDelete} aria-label={`Delete ${flock.name}`}
                className="btn btn-xs btn-ghost text-[var(--text-muted)] hover:text-[var(--accent-danger)]">
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Assigned Feeds
          </span>
          <button type="button" onClick={() => onOpenAssignModal(flock)}
            className="font-mono text-xs text-[var(--accent-primary)] hover:underline">
            Manage →
          </button>
        </div>
        {flock.feed_assignments?.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {flock.feed_assignments.map(fa => (
              <span key={fa.feed_type_id}
                className="px-3 py-1 rounded-full font-mono text-xs bg-[var(--bg-elevated)] border border-[var(--accent-primary)] text-[var(--text-primary)]">
                {fa.feed_types?.name || (feedTypes || []).find(ft => ft.id === fa.feed_type_id)?.name || 'Feed'}
              </span>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => onOpenAssignModal(flock)}
            className="font-mono text-xs text-[var(--text-muted)] italic hover:text-[var(--accent-primary)]">
            No feeds assigned — tap to assign
          </button>
        )}
      </div>
    </div>
  );
}

function FeedAssignModal({ flock, feedTypes, selectedFeedIds, setSelectedFeedIds, onSave, onClose }) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await onSave();
      if (!saved) setSaving(false);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop farm-setup-feed-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-modal="true"
        className="modal-card farm-setup-feed-card"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="display-font text-[24px] leading-none text-[var(--text-primary)] m-0">
            Assign Feeds to {flock?.name}
          </h3>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close feed assignment modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-2">
          {feedTypes.length === 0 ? (
            <p className="font-mono text-sm text-[var(--text-muted)] text-center py-4">
              No feed types created yet. Add feeds in the Feed Types section below.
            </p>
          ) : feedTypes.map(feed => (
            <label key={feed.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] cursor-pointer hover:border-[var(--accent-primary)] transition-colors">
              <input
                type="checkbox"
                checked={selectedFeedIds.includes(feed.id)}
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedFeedIds(prev => [...prev, feed.id]);
                  } else {
                    setSelectedFeedIds(prev => prev.filter(id => id !== feed.id));
                  }
                }}
                className="checkbox checkbox-sm checkbox-primary"
              />
              <div className="flex-1">
                <p className="font-mono text-sm text-[var(--text-primary)] m-0">{feed.name}</p>
                <p className="font-mono text-xs text-[var(--text-muted)] m-0">
                  {feed.unit} · ${feed.cost_per_unit?.toFixed(4)}/lb · {feed.current_on_hand} on hand
                </p>
              </div>
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}
            className="secondary-button flex-1">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="primary-button flex-1 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  );
}

function FeedTypeEditor({ draft, editing, feedType, onCancel, onChange, onDelete, onEdit, onSave }) {
  const source = editing ? draft : feedType;
  const costPerUnit = Number(source.cost_per_lb ?? source.cost_per_unit ?? 0).toFixed(4);

  return (
    <div className="bg-[var(--bg-base)] border border-[rgba(46,125,50,0.65)] rounded-lg p-4 grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <label className="field flex-1 min-w-0">
          <span>Name</span>
          {editing ? (
            <input value={source.name || ""} onChange={e => onChange("name", e.target.value)} />
          ) : (
            <span className="font-mono text-lg text-[var(--text-primary)] font-bold">{source.name || "Unnamed feed"}</span>
          )}
        </label>

        <div className="settings-actions">
          {editing ? (
            <>
              <button className="icon-button" type="button" onClick={onSave} aria-label="Save feed type">
                <Save size={16} />
              </button>
              <button className="icon-button" type="button" onClick={onCancel} aria-label="Cancel feed type edit">
                <X size={16} />
              </button>
            </>
          ) : (
            <button className="icon-button" type="button" onClick={onEdit} aria-label={`Edit ${feedType.name}`}>
              <Pencil size={16} />
            </button>
          )}
          <button className="icon-button danger" type="button" onClick={onDelete} aria-label={`Delete ${feedType.name}`}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
        <FeedTypeField
          editing={editing}
          label="Unit"
          select
          value={source.unit || "lbs"}
          onChange={value => onChange("unit", value)}
        />
        <FeedTypeField
          editing={editing}
          label="Bag weight"
          numeric
          value={source.bag_weight ?? 50}
          onChange={value => onChange("bag_weight", value)}
        />
        <FeedTypeField
          editing={editing}
          label="Bag price"
          numeric
          value={source.bag_price ?? 0}
          onChange={value => onChange("bag_price", value)}
        />
        <ReadOnlyMetric label="Cost/lb" value={costPerUnit} />
        <FeedTypeField
          editing={editing}
          label="On hand"
          numeric
          value={source.current_on_hand ?? 0}
          onChange={value => onChange("current_on_hand", value)}
        />
        <FeedTypeField
          editing={editing}
          label="Par"
          numeric
          value={source.par_level ?? 0}
          onChange={value => onChange("par_level", value)}
        />
      </div>
    </div>
  );
}

function FeedTypeField({ editing, label, numeric = false, onChange, select = false, value }) {
  return (
    <label className="field min-w-0">
      <span>{label}</span>
      {editing && select ? (
        <select value={value} onChange={event => onChange(event.target.value)}>
          <option value="lbs">lbs</option>
          <option value="kg">kg</option>
        </select>
      ) : editing ? (
        <input
          min={numeric ? "0" : undefined}
          step={numeric ? "0.01" : undefined}
          type={numeric ? "number" : "text"}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      ) : (
        <span className="font-mono text-base text-[var(--text-primary)]">{value}</span>
      )}
    </label>
  );
}

function ReadOnlyMetric({ label, value }) {
  return (
    <div className="field min-w-0">
      <span>{label}</span>
      <span className="font-mono text-base text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function formatError(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Something went wrong.";
}

export default FarmSetup;
