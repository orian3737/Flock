import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { CLASS_CONFIG, SPECIES_MAP } from "../../utils/animalClass";
import { useAuth } from "../../context/AuthContext";
import CustomSpeciesForm from "../../components/CustomSpeciesForm";
import InlineFeedback from "../../components/InlineFeedback";
import {
  createBreed,
  deleteAnimalClass,
  deleteAnimalType,
  deleteBreed,
  deleteFeedType,
  deleteFlock,
  getOnboardingSummary,
  updateAnimalClass,
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
                                draft={draft}
                                editing={isEditing("flock", flock.id)}
                                flock={flock}
                                key={flock.id}
                                onCancel={cancelEdit}
                                onChange={updateDraft}
                                onDelete={() => deleteItem("flock", flock.id)}
                                onEdit={() => beginEdit("flock", flock)}
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

function FlockEditor({ draft, editing, flock, onCancel, onChange, onDelete, onEdit, onSave }) {
  const source = editing ? draft : flock;
  return (
    <div className="settings-edit-card">
      <div className="settings-edit-grid">
        <label className="field">
          <span>Name</span>
          <input disabled={!editing} value={source.name || ""} onChange={e => onChange("name", e.target.value)} />
        </label>
        <label className="field">
          <span>Pen</span>
          <input disabled={!editing} value={source.pen_name || ""} onChange={e => onChange("pen_name", e.target.value)} />
        </label>
        <label className="field">
          <span>Headcount</span>
          <input disabled={!editing} min="0" type="number" value={source.current_headcount ?? 0} onChange={e => onChange("current_headcount", e.target.value)} />
        </label>
        <label className="field">
          <span>Designation</span>
          <select disabled={!editing} value={source.designation || "mixed"} onChange={e => onChange("designation", e.target.value)}>
            {designations.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>
      <RowActions editing={editing} onCancel={onCancel} onDelete={onDelete} onEdit={onEdit} onSave={onSave} />
    </div>
  );
}

function FeedTypeEditor({ draft, editing, feedType, onCancel, onChange, onDelete, onEdit, onSave }) {
  const source = editing ? draft : feedType;
  return (
    <div className="settings-edit-card">
      <div className="settings-edit-grid feed-type-grid">
        <label className="field">
          <span>Name</span>
          <input disabled={!editing} value={source.name || ""} onChange={e => onChange("name", e.target.value)} />
        </label>
        <label className="field">
          <span>Unit</span>
          <select disabled={!editing} value={source.unit || "lbs"} onChange={e => onChange("unit", e.target.value)}>
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
        </label>
        <label className="field">
          <span>Bag weight</span>
          <input disabled={!editing} min="0" step="0.01" type="number" value={source.bag_weight ?? 50} onChange={e => onChange("bag_weight", e.target.value)} />
        </label>
        <label className="field">
          <span>Bag price</span>
          <input disabled={!editing} min="0" step="0.01" type="number" value={source.bag_price ?? 0} onChange={e => onChange("bag_price", e.target.value)} />
        </label>
        <label className="field">
          <span>Cost/lb</span>
          <input disabled value={Number(source.cost_per_lb ?? source.cost_per_unit ?? 0).toFixed(4)} />
        </label>
        <label className="field">
          <span>On hand</span>
          <input disabled={!editing} min="0" step="0.01" type="number" value={source.current_on_hand ?? 0} onChange={e => onChange("current_on_hand", e.target.value)} />
        </label>
        <label className="field">
          <span>Par</span>
          <input disabled={!editing} min="0" step="0.01" type="number" value={source.par_level ?? 0} onChange={e => onChange("par_level", e.target.value)} />
        </label>
      </div>
      <RowActions editing={editing} onCancel={onCancel} onDelete={onDelete} onEdit={onEdit} onSave={onSave} />
    </div>
  );
}

function formatError(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Something went wrong.";
}

export default FarmSetup;
