import React, { useContext, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AuthContext } from "../../context/AuthContext";
import {
  createAnimalClass,
  createBreed,
  createFeedAssignment,
  createFeedType,
  createFlock,
} from "../../services/onboardingApi";

const steps = ["Animal Classes", "Breeds", "Flocks", "Feed Setup", "Review"];
const hintChips = ["Poultry", "Swine", "Goats", "Cattle", "Rabbits"];
const designations = ["layer", "breeder", "meat", "mixed"];

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function blankAnimalClass(name = "") {
  return { tempId: makeId("class"), id: null, name };
}

function blankBreed(animalClassId = null) {
  return { tempId: makeId("breed"), id: null, animal_class_id: animalClassId, name: "" };
}

function blankFlock(breedId = null) {
  return {
    tempId: makeId("flock"),
    id: null,
    breed_id: breedId,
    name: "",
    pen_name: "",
    current_headcount: 0,
    designation: "mixed",
  };
}

function blankFeedType() {
  return {
    tempId: makeId("feed"),
    id: null,
    name: "",
    unit: "lbs",
    cost_per_unit: "",
    current_on_hand: "",
    par_level: "",
  };
}

function formatError(error) {
  return error?.response?.data?.message || error?.message || "Something went wrong.";
}

function OnboardingWizard() {
  const navigate = useNavigate();
  const { dbUser, loading: authLoading, markOnboarded } = useContext(AuthContext);
  const [step, setStep] = useState(1);
  const [farmName, setFarmName] = useState(dbUser?.farm_name || localStorage.getItem("Flock_farm_name") || "");
  const [animalClasses, setAnimalClasses] = useState([blankAnimalClass()]);
  const [breeds, setBreeds] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [feedTypes, setFeedTypes] = useState([blankFeedType()]);
  const [feedAssignments, setFeedAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createdClasses = animalClasses.filter((item) => item.id);
  const createdBreeds = breeds.filter((item) => item.id);
  const createdFlocks = flocks.filter((item) => item.id);
  const userId = dbUser?.id;

  useEffect(() => {
    if (dbUser) {
      setFarmName(dbUser.farm_name);
      localStorage.setItem("Flock_user_id", String(dbUser.id));
      localStorage.setItem("Flock_farm_name", dbUser.farm_name);
    }
  }, [dbUser]);

  const assignmentKeys = useMemo(
    () => new Set(feedAssignments.map((item) => `${item.feed_type_id || item.feedTempId}:${item.flock_id}`)),
    [feedAssignments]
  );

  function updateCollection(setter, tempId, patch) {
    setter((items) => items.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item)));
  }

  function removeFromCollection(setter, tempId) {
    setter((items) => items.filter((item) => item.tempId !== tempId));
  }

  function addHint(name) {
    setAnimalClasses((items) => {
      const emptyIndex = items.findIndex((item) => !item.name.trim());
      if (emptyIndex === -1) return [...items, blankAnimalClass(name)];
      return items.map((item, index) => (index === emptyIndex ? { ...item, name } : item));
    });
  }

  function syncBreedRows(classes) {
    setBreeds((current) => {
      const next = [...current];
      classes.forEach((animalClass) => {
        const hasRow = next.some((breed) => breed.animal_class_id === animalClass.id);
        if (!hasRow) next.push(blankBreed(animalClass.id));
      });
      return next;
    });
  }

  function syncFlockRows(breedRows) {
    setFlocks((current) => {
      const next = [...current];
      breedRows.forEach((breed) => {
        const hasRow = next.some((flock) => flock.breed_id === breed.id);
        if (!hasRow) next.push(blankFlock(breed.id));
      });
      return next;
    });
  }

  async function saveAnimalClasses() {
    const names = animalClasses.map((item) => item.name.trim()).filter(Boolean);
    if (!userId || !names.length) throw new Error("Add at least one animal type.");

    const next = [];
    for (const item of animalClasses) {
      if (!item.name.trim()) continue;
      if (item.id) {
        next.push(item);
      } else {
        const saved = await createAnimalClass({ user_id: userId, name: item.name.trim() });
        next.push({ ...item, ...saved });
      }
    }
    setAnimalClasses(next);
    syncBreedRows(next);
  }

  async function saveBreeds() {
    const rows = breeds.filter((item) => item.animal_class_id && item.name.trim());
    if (!rows.length) throw new Error("Add at least one breed.");

    const next = [];
    for (const item of breeds) {
      if (!item.name.trim()) continue;
      if (item.id) {
        next.push(item);
      } else {
        const saved = await createBreed({
          animal_class_id: item.animal_class_id,
          name: item.name.trim(),
        });
        next.push({ ...item, ...saved });
      }
    }
    setBreeds(next);
    syncFlockRows(next);
  }

  async function saveFlocks() {
    const rows = flocks.filter((item) => item.breed_id && item.name.trim());
    if (!rows.length) throw new Error("Add at least one flock.");

    const next = [];
    for (const item of flocks) {
      if (!item.name.trim()) continue;
      if (item.id) {
        next.push(item);
      } else {
        const saved = await createFlock({
          breed_id: item.breed_id,
          name: item.name.trim(),
          designation: item.designation,
          pen_name: item.pen_name.trim(),
          current_headcount: Number(item.current_headcount || 0),
        });
        next.push({ ...item, ...saved });
      }
    }
    setFlocks(next);
  }

  async function saveFeedSetup() {
    const rows = feedTypes.filter((item) => item.name.trim());
    if (!rows.length) throw new Error("Add at least one feed type.");

    const savedFeeds = [];
    for (const item of feedTypes) {
      if (!item.name.trim()) continue;
      if (item.id) {
        savedFeeds.push(item);
      } else {
        const saved = await createFeedType({
          user_id: userId,
          name: item.name.trim(),
          unit: item.unit,
          cost_per_unit: Number(item.cost_per_unit || 0),
          par_level: Number(item.par_level || 0),
          current_on_hand: Number(item.current_on_hand || 0),
        });
        savedFeeds.push({ ...item, ...saved });
      }
    }
    setFeedTypes(savedFeeds);

    const postedAssignments = [];
    for (const assignment of feedAssignments) {
      const feed = savedFeeds.find((item) => item.tempId === assignment.feedTempId || item.id === assignment.feed_type_id);
      if (!feed?.id || !assignment.flock_id || assignment.id) {
        if (assignment.id) postedAssignments.push(assignment);
        continue;
      }
      const saved = await createFeedAssignment({ flock_id: assignment.flock_id, feed_type_id: feed.id });
      postedAssignments.push({ ...assignment, ...saved, feedTempId: feed.tempId });
    }
    setFeedAssignments(postedAssignments);
  }

  async function handleNext() {
    setLoading(true);
    setError("");

    try {
      localStorage.setItem("Flock_user_id", userId);
      localStorage.setItem("Flock_farm_name", farmName);

      if (step === 1) await saveAnimalClasses();
      if (step === 2) await saveBreeds();
      if (step === 3) await saveFlocks();
      if (step === 4) await saveFeedSetup();

      setStep((current) => Math.min(current + 1, 5));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleAssignment(feed, flock) {
    const key = `${feed.id || feed.tempId}:${flock.id}`;
    const exists = assignmentKeys.has(key);
    setFeedAssignments((items) => {
      if (exists) {
        return items.filter((item) => `${item.feed_type_id || item.feedTempId}:${item.flock_id}` !== key);
      }
      return [...items, { tempId: makeId("assignment"), feedTempId: feed.tempId, feed_type_id: feed.id, flock_id: flock.id }];
    });
  }

  function launch() {
    localStorage.setItem("Flock_farm_name", farmName || "Flock Farm");
    markOnboarded();
    navigate("/dashboard");
  }

  if (authLoading || !dbUser) {
    return (
      <div className="route-loading">
        <div className="route-spinner" aria-hidden="true" />
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="onboarding-screen">
      <aside className="onboarding-sidebar">
        <div>
          <div className="display-font onboarding-logo">🌾 Flock</div>
          <div className="onboarding-farm-name">{farmName || dbUser.farm_name}</div>
          <div className="onboarding-fields">
            <label>
              <span>Farm name</span>
              <input value={farmName} onChange={(event) => setFarmName(event.target.value)} placeholder="Everyday Acres" />
            </label>
          </div>
        </div>

        <ol className="step-tracker">
          {steps.map((label, index) => {
            const number = index + 1;
            const status = number < step ? "complete" : number === step ? "current" : "future";
            return (
              <li className={`step-item ${status}`} key={label}>
                <span className="step-dot">{status === "complete" ? <Check size={14} /> : number}</span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>

        <a className="signin-link" href="/dashboard">
          Already set up? Sign in
        </a>
      </aside>

      <main className="onboarding-main">
        <section className="onboarding-card">
          {error && <div className="error-banner">{error}</div>}
          {step === 1 && (
            <AnimalClassesStep
              rows={animalClasses}
              onAdd={() => setAnimalClasses((items) => [...items, blankAnimalClass()])}
              onHint={addHint}
              onRemove={(id) => removeFromCollection(setAnimalClasses, id)}
              onUpdate={(id, patch) => updateCollection(setAnimalClasses, id, patch)}
            />
          )}
          {step === 2 && (
            <BreedsStep
              animalClasses={createdClasses}
              rows={breeds}
              onAdd={(animalClassId) => setBreeds((items) => [...items, blankBreed(animalClassId)])}
              onRemove={(id) => removeFromCollection(setBreeds, id)}
              onUpdate={(id, patch) => updateCollection(setBreeds, id, patch)}
            />
          )}
          {step === 3 && (
            <FlocksStep
              breeds={createdBreeds}
              rows={flocks}
              onAdd={(breedId) => setFlocks((items) => [...items, blankFlock(breedId)])}
              onRemove={(id) => removeFromCollection(setFlocks, id)}
              onUpdate={(id, patch) => updateCollection(setFlocks, id, patch)}
            />
          )}
          {step === 4 && (
            <FeedSetupStep
              feedTypes={feedTypes}
              flocks={createdFlocks}
              assignments={assignmentKeys}
              onAdd={() => setFeedTypes((items) => [...items, blankFeedType()])}
              onRemove={(id) => removeFromCollection(setFeedTypes, id)}
              onToggleAssignment={toggleAssignment}
              onUpdate={(id, patch) => updateCollection(setFeedTypes, id, patch)}
            />
          )}
          {step === 5 && (
            <ReviewStep
              animalClasses={createdClasses}
              breeds={createdBreeds}
              flocks={createdFlocks}
              feedTypes={feedTypes.filter((item) => item.id)}
              feedAssignments={feedAssignments}
              onEdit={setStep}
            />
          )}

          <footer className="wizard-actions">
            <button className="secondary-button" disabled={step === 1 || loading} onClick={() => setStep((current) => current - 1)}>
              Back
            </button>
            {step < 5 ? (
              <button className="primary-button" disabled={loading} onClick={handleNext}>
                {loading ? <Loader2 className="spin" size={16} /> : null}
                Next
              </button>
            ) : (
              <button className="primary-button" onClick={launch}>
                Launch Flock -&gt;
              </button>
            )}
          </footer>
        </section>
      </main>
    </div>
  );
}

function AnimalClassesStep({ rows, onAdd, onHint, onRemove, onUpdate }) {
  return (
    <div className="wizard-step">
      <header>
        <p className="eyebrow">Step 1</p>
        <h1 className="display-font">What animals do you raise?</h1>
        <p className="step-instruction">Start with broad animal types. You can rename or remove them later.</p>
      </header>
      <div className="dynamic-list">
        {rows.map((row) => (
          <div className="inline-row" key={row.tempId}>
            <input value={row.name} onChange={(event) => onUpdate(row.tempId, { name: event.target.value })} placeholder="Animal type" />
            <button className="icon-button" type="button" onClick={() => onRemove(row.tempId)} aria-label="Remove animal type">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button className="secondary-button" type="button" onClick={onAdd}>
        <Plus size={16} /> Add Animal Type
      </button>
      <div className="hint-chips">
        {hintChips.map((hint) => (
          <button type="button" key={hint} onClick={() => onHint(hint)}>
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}

function BreedsStep({ animalClasses, rows, onAdd, onRemove, onUpdate }) {
  return (
    <div className="wizard-step">
      <header>
        <p className="eyebrow">Step 2</p>
        <h1 className="display-font">Define breeds for each animal class</h1>
        <p className="step-instruction">Add the breeds, strains, or varieties you actually keep on your farm.</p>
      </header>
      {animalClasses.map((animalClass) => (
        <section className="panel-card section-block" key={animalClass.id}>
          <div className="section-title">{animalClass.name}</div>
          {rows
            .filter((row) => row.animal_class_id === animalClass.id)
            .map((row) => (
              <div className="inline-row" key={row.tempId}>
                <input value={row.name} onChange={(event) => onUpdate(row.tempId, { name: event.target.value })} placeholder="Breed" />
                <button className="icon-button" type="button" onClick={() => onRemove(row.tempId)} aria-label="Remove breed">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          <button className="secondary-button" type="button" onClick={() => onAdd(animalClass.id)}>
            <Plus size={16} /> Add Breed
          </button>
        </section>
      ))}
    </div>
  );
}

function FlocksStep({ breeds, rows, onAdd, onRemove, onUpdate }) {
  return (
    <div className="wizard-step">
      <header>
        <p className="eyebrow">Step 3</p>
        <h1 className="display-font">Create flock groups</h1>
        <p className="step-instruction">Group animals by pen, purpose, or management batch.</p>
      </header>
      {breeds.map((breed) => (
        <section className="panel-card section-block" key={breed.id}>
          <div className="section-title">{breed.name}</div>
          {rows
            .filter((row) => row.breed_id === breed.id)
            .map((row) => (
              <div className="flock-card" key={row.tempId}>
                <label className="field">
                  <span>Group name</span>
                  <input value={row.name} onChange={(event) => onUpdate(row.tempId, { name: event.target.value })} />
                </label>
                <label className="field">
                  <span>Pen name</span>
                  <input value={row.pen_name} onChange={(event) => onUpdate(row.tempId, { pen_name: event.target.value })} />
                </label>
                <label className="field">
                  <span>Headcount</span>
                  <input
                    min="0"
                    type="number"
                    value={row.current_headcount}
                    onChange={(event) => onUpdate(row.tempId, { current_headcount: event.target.value })}
                  />
                </label>
                <div className="designation-group" role="group" aria-label="Designation">
                  {designations.map((designation) => (
                    <button
                      className={row.designation === designation ? "selected" : ""}
                      key={designation}
                      type="button"
                      onClick={() => onUpdate(row.tempId, { designation })}
                    >
                      {designation}
                    </button>
                  ))}
                </div>
                <button className="icon-button remove-row" type="button" onClick={() => onRemove(row.tempId)} aria-label="Remove flock">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          <button className="secondary-button" type="button" onClick={() => onAdd(breed.id)}>
            <Plus size={16} /> Add Group
          </button>
        </section>
      ))}
    </div>
  );
}

function FeedSetupStep({ feedTypes, flocks, assignments, onAdd, onRemove, onToggleAssignment, onUpdate }) {
  return (
    <div className="wizard-step">
      <header>
        <p className="eyebrow">Step 4</p>
        <h1 className="display-font">Set up feed inventory</h1>
        <p className="step-instruction">Define feed stocks and assign them to the flocks that use them.</p>
      </header>
      <div className="feed-card-grid">
        {feedTypes.map((feed) => (
          <section className="panel-card feed-card" key={feed.tempId}>
            <label className="field">
              <span>Feed name</span>
              <input value={feed.name} onChange={(event) => onUpdate(feed.tempId, { name: event.target.value })} />
            </label>
            <div className="unit-toggle">
              {["lbs", "kg"].map((unit) => (
                <button className={feed.unit === unit ? "selected" : ""} type="button" key={unit} onClick={() => onUpdate(feed.tempId, { unit })}>
                  {unit}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Cost/unit</span>
              <input type="number" min="0" step="0.01" value={feed.cost_per_unit} onChange={(event) => onUpdate(feed.tempId, { cost_per_unit: event.target.value })} />
            </label>
            <label className="field">
              <span>Stock on hand</span>
              <input type="number" min="0" step="0.01" value={feed.current_on_hand} onChange={(event) => onUpdate(feed.tempId, { current_on_hand: event.target.value })} />
            </label>
            <label className="field">
              <span>Par level</span>
              <input type="number" min="0" step="0.01" value={feed.par_level} onChange={(event) => onUpdate(feed.tempId, { par_level: event.target.value })} />
            </label>
            <button className="secondary-button" type="button" onClick={() => onRemove(feed.tempId)}>
              <Trash2 size={16} /> Remove Feed
            </button>
          </section>
        ))}
      </div>
      <button className="secondary-button" type="button" onClick={onAdd}>
        <Plus size={16} /> Add Feed Type
      </button>

      <div className="assignment-table-wrap">
        <table className="assignment-table">
          <thead>
            <tr>
              <th>Feed</th>
              {flocks.map((flock) => (
                <th key={flock.id}>{flock.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {feedTypes.map((feed) => (
              <tr key={feed.tempId}>
                <td>{feed.name || "Unnamed feed"}</td>
                {flocks.map((flock) => {
                  const key = `${feed.id || feed.tempId}:${flock.id}`;
                  return (
                    <td key={flock.id}>
                      <input type="checkbox" checked={assignments.has(key)} onChange={() => onToggleAssignment(feed, flock)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewStep({ animalClasses, breeds, flocks, feedTypes, feedAssignments, onEdit }) {
  return (
    <div className="wizard-step">
      <header>
        <p className="eyebrow">Step 5</p>
        <h1 className="display-font">Review and launch</h1>
        <p className="step-instruction">Check your farm structure before opening the dashboard.</p>
      </header>
      <div className="review-tree">
        {animalClasses.map((animalClass) => (
          <section className="panel-card section-block" key={animalClass.id}>
            <div className="review-row">
              <strong>{animalClass.name}</strong>
              <button className="secondary-button" type="button" onClick={() => onEdit(1)}>
                Edit
              </button>
            </div>
            {breeds
              .filter((breed) => breed.animal_class_id === animalClass.id)
              .map((breed) => (
                <div className="review-branch" key={breed.id}>
                  <div className="review-row">
                    <span>{breed.name}</span>
                    <button className="secondary-button" type="button" onClick={() => onEdit(2)}>
                      Edit
                    </button>
                  </div>
                  {flocks
                    .filter((flock) => flock.breed_id === breed.id)
                    .map((flock) => (
                      <div className="review-leaf" key={flock.id}>
                        <div className="review-row">
                          <span>
                            {flock.name} - {flock.current_headcount} head - {flock.designation}
                          </span>
                          <button className="secondary-button" type="button" onClick={() => onEdit(3)}>
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              ))}
          </section>
        ))}
      </div>
      <section className="panel-card section-block">
        <div className="review-row">
          <strong>Feed setup</strong>
          <button className="secondary-button" type="button" onClick={() => onEdit(4)}>
            Edit
          </button>
        </div>
        <div className="feed-summary">
          {feedTypes.map((feed) => (
            <span key={feed.id}>
              {feed.name}: {feed.current_on_hand} {feed.unit}
            </span>
          ))}
        </div>
        <p className="muted">{feedAssignments.length} feed assignments configured.</p>
      </section>
    </div>
  );
}

export default OnboardingWizard;
