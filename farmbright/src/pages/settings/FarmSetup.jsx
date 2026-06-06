import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Save, Trash2, X } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import InlineFeedback from "../../components/InlineFeedback";
import {
  deleteAnimalClass,
  deleteBreed,
  deleteFeedType,
  deleteFlock,
  getOnboardingSummary,
  updateAnimalClass,
  updateBreed,
  updateFeedType,
  updateFlock,
} from "../../services/onboardingApi";

const designations = ["layer", "breeder", "meat", "mixed"];

function FarmSetup() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState({ animal_classes: [], feed_types: [] });
  const [openPanels, setOpenPanels] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadSummary() {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const data = await getOnboardingSummary(profile.id);
      setSummary(data);
      setOpenPanels((current) => {
        if (current.size) return current;
        return new Set(data.animal_classes.map((animalClass) => animalClass.id));
      });
      return true;
    } catch (err) {
      const message = formatError(err);
      setFeedback({ type: "error", message });
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, [profile?.id]);

  function beginEdit(type, item) {
    setEditing({ type, id: item.id });
    setDraft({ ...item });
    setFeedback(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft({});
  }

  function isEditing(type, id) {
    return editing?.type === type && editing?.id === id;
  }

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function togglePanel(id) {
    setOpenPanels((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function saveEdit(type, id) {
    setFeedback(null);
    try {
      if (type === "animalClass") {
        await updateAnimalClass(id, { name: draft.name });
      }
      if (type === "breed") {
        await updateBreed(id, { name: draft.name });
      }
      if (type === "flock") {
        await updateFlock(id, {
          name: draft.name,
          designation: draft.designation,
          pen_name: draft.pen_name,
          current_headcount: Number(draft.current_headcount || 0),
        });
      }
      if (type === "feedType") {
        await updateFeedType(id, {
          name: draft.name,
          unit: draft.unit,
          bag_weight: Number(draft.bag_weight || 0),
          bag_price: Number(draft.bag_price || 0),
          par_level: Number(draft.par_level || 0),
          current_on_hand: Number(draft.current_on_hand || 0),
        });
      }
      cancelEdit();
      if (await loadSummary()) {
        setFeedback({ type: "success", message: "Saved changes." });
      }
    } catch (err) {
      const message = formatError(err);
      setFeedback({ type: "error", message });
    }
  }

  async function deleteItem(type, id) {
    setFeedback(null);
    try {
      if (type === "animalClass") await deleteAnimalClass(id);
      if (type === "breed") await deleteBreed(id);
      if (type === "flock") await deleteFlock(id);
      if (type === "feedType") await deleteFeedType(id);
      if (await loadSummary()) {
        setFeedback({ type: "success", message: "Deleted." });
      }
    } catch (err) {
      const message = formatError(err);
      setFeedback({ type: "error", message });
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
        {summary.animal_classes.map((animalClass) => {
          const open = openPanels.has(animalClass.id);
          return (
            <section className="settings-panel" key={animalClass.id}>
              <div className="settings-panel-header">
                <button className="accordion-toggle" type="button" onClick={() => togglePanel(animalClass.id)}>
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <InlineNameEditor
                  editing={isEditing("animalClass", animalClass.id)}
                  value={isEditing("animalClass", animalClass.id) ? draft.name : animalClass.name}
                  onChange={(value) => updateDraft("name", value)}
                />
                <RowActions
                  editing={isEditing("animalClass", animalClass.id)}
                  onCancel={cancelEdit}
                  onDelete={() => deleteItem("animalClass", animalClass.id)}
                  onEdit={() => beginEdit("animalClass", animalClass)}
                  onSave={() => saveEdit("animalClass", animalClass.id)}
                />
              </div>

              {open ? (
                <div className="settings-panel-body">
                  {animalClass.breeds.map((breed) => (
                    <section className="breed-editor" key={breed.id}>
                      <div className="settings-row">
                        <InlineNameEditor
                          editing={isEditing("breed", breed.id)}
                          value={isEditing("breed", breed.id) ? draft.name : breed.name}
                          onChange={(value) => updateDraft("name", value)}
                        />
                        <RowActions
                          editing={isEditing("breed", breed.id)}
                          onCancel={cancelEdit}
                          onDelete={() => deleteItem("breed", breed.id)}
                          onEdit={() => beginEdit("breed", breed)}
                          onSave={() => saveEdit("breed", breed.id)}
                        />
                      </div>

                      <div className="flock-editor-list">
                        {breed.flocks.map((flock) => (
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
                </div>
              ) : null}
            </section>
          );
        })}

        <section className="settings-panel">
          <div className="settings-panel-header">
            <strong>Feed Types</strong>
          </div>
          <div className="settings-panel-body">
            <div className="feed-type-editor-list">
              {summary.feed_types.map((feedType) => (
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

function InlineNameEditor({ editing, onChange, value }) {
  if (editing) {
    return <input className="settings-inline-input" value={value || ""} onChange={(event) => onChange(event.target.value)} />;
  }
  return <strong>{value}</strong>;
}

function RowActions({ editing, onCancel, onDelete, onEdit, onSave }) {
  return (
    <div className="settings-actions">
      {editing ? (
        <>
          <button className="icon-button" type="button" onClick={onSave} aria-label="Save">
            <Save size={16} />
          </button>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Cancel">
            <X size={16} />
          </button>
        </>
      ) : (
        <button className="icon-button" type="button" onClick={onEdit} aria-label="Edit">
          <Pencil size={16} />
        </button>
      )}
      <button className="icon-button danger" type="button" onClick={onDelete} aria-label="Delete">
        <Trash2 size={16} />
      </button>
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
          <input disabled={!editing} value={source.name || ""} onChange={(event) => onChange("name", event.target.value)} />
        </label>
        <label className="field">
          <span>Pen</span>
          <input disabled={!editing} value={source.pen_name || ""} onChange={(event) => onChange("pen_name", event.target.value)} />
        </label>
        <label className="field">
          <span>Headcount</span>
          <input
            disabled={!editing}
            min="0"
            type="number"
            value={source.current_headcount ?? 0}
            onChange={(event) => onChange("current_headcount", event.target.value)}
          />
        </label>
        <label className="field">
          <span>Designation</span>
          <select disabled={!editing} value={source.designation || "mixed"} onChange={(event) => onChange("designation", event.target.value)}>
            {designations.map((designation) => (
              <option key={designation} value={designation}>
                {designation}
              </option>
            ))}
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
          <input disabled={!editing} value={source.name || ""} onChange={(event) => onChange("name", event.target.value)} />
        </label>
        <label className="field">
          <span>Unit</span>
          <select disabled={!editing} value={source.unit || "lbs"} onChange={(event) => onChange("unit", event.target.value)}>
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
        </label>
        <label className="field">
          <span>Bag weight</span>
          <input disabled={!editing} min="0" step="0.01" type="number" value={source.bag_weight ?? 50} onChange={(event) => onChange("bag_weight", event.target.value)} />
        </label>
        <label className="field">
          <span>Bag price</span>
          <input disabled={!editing} min="0" step="0.01" type="number" value={source.bag_price ?? 0} onChange={(event) => onChange("bag_price", event.target.value)} />
        </label>
        <label className="field">
          <span>Cost/lb</span>
          <input disabled value={Number(source.cost_per_lb ?? source.cost_per_unit ?? 0).toFixed(4)} />
        </label>
        <label className="field">
          <span>On hand</span>
          <input disabled={!editing} min="0" step="0.01" type="number" value={source.current_on_hand ?? 0} onChange={(event) => onChange("current_on_hand", event.target.value)} />
        </label>
        <label className="field">
          <span>Par</span>
          <input disabled={!editing} min="0" step="0.01" type="number" value={source.par_level ?? 0} onChange={(event) => onChange("par_level", event.target.value)} />
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
