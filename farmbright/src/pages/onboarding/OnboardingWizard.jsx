import React, { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { CLASS_CONFIG, SPECIES_MAP } from "../../utils/animalClass";
import { useAuth } from "../../context/AuthContext";
import {
  createAnimalClass,
  createAnimalType,
  createBreed,
  createFeedAssignment,
  createFeedType,
  createFlock,
} from "../../services/onboardingApi";

const STEPS = ["Animals", "Breeds", "Groups", "Feed Setup", "Review"];

const CLASS_TYPE_NAMES = {
  poultry: "Poultry", swine: "Swine", goat: "Goats", cattle: "Cattle",
  rabbit: "Rabbits", guardian: "Guardian Animals", other: "Other Animals",
};

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function blankBreed(animalTypeId = null) {
  return { tempId: makeId("breed"), id: null, animal_type_id: animalTypeId, name: "" };
}

function blankFlock(breedId = null) {
  return {
    tempId: makeId("flock"), id: null, breed_id: breedId,
    name: "", pen_name: "", current_headcount: 0, designation: "mixed",
  };
}

function blankFeedType() {
  return {
    tempId: makeId("feed"), id: null,
    name: "", unit: "lbs", bag_weight: "50", bag_price: "", current_on_hand: "", par_level: "",
  };
}

function feedCostPerLb(feed) {
  const w = Number(feed.bag_weight || 0);
  const p = Number(feed.bag_price || 0);
  return w > 0 ? p / w : 0;
}

function formatError(error) {
  return error?.response?.data?.message || error?.message || "Something went wrong.";
}

function updateCollection(setter, tempId, patch) {
  setter(items => items.map(item => (item.tempId === tempId ? { ...item, ...patch } : item)));
}

function removeFromCollection(setter, tempId) {
  setter(items => items.filter(item => item.tempId !== tempId));
}

function OnboardingWizard() {
  const navigate = useNavigate();
  const { profile, loading: authLoading, markOnboarded } = useAuth();
  const [step, setStep] = useState(1);
  const [farmName, setFarmName] = useState(profile?.farm_name || localStorage.getItem("Flock_farm_name") || "");
  const [selectedSpecies, setSelectedSpecies] = useState(new Set());
  const [animalClasses, setAnimalClasses] = useState([]);
  const [animalTypes, setAnimalTypes] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [feedTypes, setFeedTypes] = useState([blankFeedType()]);
  const [feedAssignments, setFeedAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const userId = profile?.id;

  useEffect(() => {
    if (profile) {
      setFarmName(profile.farm_name);
      localStorage.setItem("Flock_user_id", String(profile.id));
      localStorage.setItem("Flock_farm_name", profile.farm_name);
    }
  }, [profile]);

  const createdBreeds = breeds.filter(b => b.id);
  const createdFlocks = flocks.filter(f => f.id);

  const assignmentKeys = useMemo(
    () => new Set(feedAssignments.map(a => `${a.feed_type_id || a.feedTempId}:${a.flock_id}`)),
    [feedAssignments]
  );

  function toggleSpecies(key) {
    setSelectedSpecies(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function saveStep1() {
    if (selectedSpecies.size === 0) throw new Error("Select at least one animal type.");
    localStorage.setItem("Flock_user_id", userId);
    localStorage.setItem("Flock_farm_name", farmName);

    const byClassType = new Map();
    for (const key of selectedSpecies) {
      const sp = SPECIES_MAP[key];
      if (!sp) continue;
      if (!byClassType.has(sp.class_type)) byClassType.set(sp.class_type, []);
      byClassType.get(sp.class_type).push({ speciesKey: key, ...sp });
    }

    const savedClasses = [];
    const savedTypes = [];

    for (const [classType, speciesList] of byClassType) {
      const className = CLASS_TYPE_NAMES[classType] || classType;
      const savedClass = await createAnimalClass(userId, { name: className, class_type: classType });
      savedClasses.push(savedClass);

      for (const sp of speciesList) {
        const savedType = await createAnimalType(savedClass.id, {
          name: sp.label,
          species: sp.speciesKey,
          emoji: sp.emoji,
          produces_eggs:  sp.produces_eggs,
          produces_milk:  sp.produces_milk,
          produces_meat:  sp.produces_meat,
          produces_young: sp.produces_young,
          working_animal: sp.working_animal,
        });
        savedTypes.push({ ...savedType, animal_class_id: savedClass.id });
      }
    }

    setAnimalClasses(savedClasses);
    setAnimalTypes(savedTypes);
    setBreeds(savedTypes.map(t => blankBreed(t.id)));
  }

  async function saveStep2() {
    const rows = breeds.filter(b => b.animal_type_id && b.name.trim());
    if (!rows.length) throw new Error("Add at least one breed.");

    const next = [];
    for (const item of breeds) {
      if (!item.name.trim()) continue;
      if (item.id) { next.push(item); continue; }
      const saved = await createBreed(item.animal_type_id, item.name.trim());
      next.push({ ...item, ...saved });
    }
    setBreeds(next);

    const savedBreeds = next.filter(b => b.id);
    setFlocks(current => {
      const updated = [...current];
      savedBreeds.forEach(breed => {
        if (!updated.some(f => f.breed_id === breed.id)) {
          updated.push(blankFlock(breed.id));
        }
      });
      return updated;
    });
  }

  async function saveStep3() {
    const rows = flocks.filter(f => f.breed_id && f.name.trim());
    if (!rows.length) throw new Error("Add at least one flock.");

    const next = [];
    for (const item of flocks) {
      if (!item.name.trim()) continue;
      if (item.id) { next.push(item); continue; }
      const saved = await createFlock({
        breed_id:         item.breed_id,
        name:             item.name.trim(),
        designation:      item.designation,
        pen_name:         item.pen_name?.trim() || "",
        current_headcount: Number(item.current_headcount || 0),
      });
      next.push({ ...item, ...saved });
    }
    setFlocks(next);
  }

  async function saveFeedSetup() {
    const rows = feedTypes.filter(f => f.name.trim());
    if (!rows.length) throw new Error("Add at least one feed type.");

    const savedFeeds = [];
    for (const item of feedTypes) {
      if (!item.name.trim()) continue;
      if (item.id) { savedFeeds.push(item); continue; }
      const saved = await createFeedType({
        user_id: userId,
        name: item.name.trim(),
        unit: item.unit,
        bag_weight:     Number(item.bag_weight || 0),
        bag_price:      Number(item.bag_price || 0),
        par_level:      Number(item.par_level || 0),
        current_on_hand: Number(item.current_on_hand || 0),
      });
      savedFeeds.push({ ...item, ...saved });
    }
    setFeedTypes(savedFeeds);

    const postedAssignments = [];
    for (const assignment of feedAssignments) {
      const feed = savedFeeds.find(f => f.tempId === assignment.feedTempId || f.id === assignment.feed_type_id);
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
      if (step === 1) await saveStep1();
      if (step === 2) await saveStep2();
      if (step === 3) await saveStep3();
      if (step === 4) await saveFeedSetup();
      setStep(s => Math.min(s + 1, 5));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleAssignment(feed, flock) {
    const key = `${feed.id || feed.tempId}:${flock.id}`;
    const exists = assignmentKeys.has(key);
    setFeedAssignments(items => {
      if (exists) {
        return items.filter(a => `${a.feed_type_id || a.feedTempId}:${a.flock_id}` !== key);
      }
      return [...items, { tempId: makeId("asgn"), feedTempId: feed.tempId, feed_type_id: feed.id, flock_id: flock.id }];
    });
  }

  function launch() {
    localStorage.setItem("Flock_farm_name", farmName || "Flock Farm");
    markOnboarded();
    navigate("/dashboard");
  }

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-base)] px-6 flex-col gap-[14px] text-[var(--text-secondary)]">
        <div className="rounded-full border-[3px] border-[rgba(76,175,80,0.2)] border-t-[var(--accent-primary)] h-[42px] w-[42px] [animation:spin_0.8s_linear_infinite]" aria-hidden="true" />
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-base)] grid grid-cols-[320px_minmax(0,1fr)] min-h-screen max-[980px]:grid-cols-1">
      <aside className="bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col justify-between min-h-screen p-6">
        <div>
          <div className="display-font text-[var(--text-primary)] text-[28px] leading-none">🌾 Flock</div>
          <div className="text-[var(--text-muted)] text-[13px] mt-2">{farmName || profile.farm_name}</div>
          <div className="grid gap-3 mt-[18px]">
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Farm name</span>
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[40px] outline-none py-[9px] px-[10px] focus:border-[var(--accent-primary)]"
                value={farmName}
                onChange={e => setFarmName(e.target.value)}
                placeholder="Everyday Acres"
              />
            </label>
          </div>
        </div>

        <ol className="grid gap-4 list-none m-0 my-8 p-0">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const status = number < step ? "complete" : number === step ? "current" : "future";
            return (
              <li
                className={["flex items-center gap-3", status === "future" ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"].join(" ")}
                key={label}
              >
                <span
                  className={[
                    "inline-flex items-center justify-center rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)] text-xs h-[30px] w-[30px]",
                    status === "complete" ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107]" : "",
                    status === "current" ? "[animation:pulse-ring_1.4s_infinite] border-[var(--accent-primary)] text-[var(--text-primary)]" : "",
                  ].join(" ")}
                >
                  {status === "complete" ? <Check size={14} /> : number}
                </span>
                <span
                  className={[
                    status === "complete" ? "text-[var(--text-muted)] line-through" : "",
                    status === "current" ? "text-[var(--text-primary)] font-bold" : "",
                  ].join(" ")}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        <a className="text-[var(--text-secondary)] text-[13px]" href="/dashboard">
          Already set up? Sign in
        </a>
      </aside>

      <main className="min-w-0 py-6 px-6 pb-24 relative">
        <section className="grid gap-5 mx-auto max-w-[1080px] min-h-[calc(100vh-120px)]">
          {error && <div className="error-banner">{error}</div>}

          {step === 1 && (
            <SpeciesPickerStep
              selectedSpecies={selectedSpecies}
              onToggle={toggleSpecies}
            />
          )}
          {step === 2 && (
            <BreedsStep
              animalTypes={animalTypes}
              rows={breeds}
              onAdd={typeId => setBreeds(b => [...b, blankBreed(typeId)])}
              onRemove={tempId => removeFromCollection(setBreeds, tempId)}
              onUpdate={(tempId, patch) => updateCollection(setBreeds, tempId, patch)}
            />
          )}
          {step === 3 && (
            <FlocksStep
              animalTypes={animalTypes}
              animalClasses={animalClasses}
              breeds={createdBreeds}
              rows={flocks}
              onAdd={breedId => setFlocks(f => [...f, blankFlock(breedId)])}
              onRemove={tempId => removeFromCollection(setFlocks, tempId)}
              onUpdate={(tempId, patch) => updateCollection(setFlocks, tempId, patch)}
            />
          )}
          {step === 4 && (
            <FeedSetupStep
              feedTypes={feedTypes}
              flocks={createdFlocks}
              assignments={assignmentKeys}
              onAdd={() => setFeedTypes(f => [...f, blankFeedType()])}
              onRemove={tempId => removeFromCollection(setFeedTypes, tempId)}
              onToggleAssignment={toggleAssignment}
              onUpdate={(tempId, patch) => updateCollection(setFeedTypes, tempId, patch)}
            />
          )}
          {step === 5 && (
            <ReviewStep
              animalClasses={animalClasses}
              animalTypes={animalTypes}
              breeds={createdBreeds}
              flocks={createdFlocks}
              feedTypes={feedTypes.filter(f => f.id)}
              feedAssignments={feedAssignments}
              onEdit={setStep}
            />
          )}

          <footer className="sticky bottom-0 flex gap-[10px] justify-between mt-auto pt-6 [background:linear-gradient(180deg,rgba(15,26,15,0),var(--bg-base)_24%)]">
            <button className="secondary-button" disabled={step === 1 || loading} onClick={() => setStep(s => Math.max(s - 1, 1))}>
              Back
            </button>
            {step < 5 ? (
              <button className="primary-button" disabled={loading} onClick={handleNext}>
                {loading ? <Loader2 className="spin" size={16} /> : null}
                Next
              </button>
            ) : (
              <button className="primary-button" onClick={launch}>
                Launch Flock →
              </button>
            )}
          </footer>
        </section>
      </main>
    </div>
  );
}

function SpeciesPickerStep({ selectedSpecies, onToggle }) {
  return (
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 1</p>
        <h1 className="display-font">What animals do you raise?</h1>
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">
          Select every species you keep. You can always add more later.
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        {Object.entries(SPECIES_MAP).map(([key, sp]) => {
          const selected = selectedSpecies.has(key);
          return (
            <button
              key={key}
              type="button"
              className={[
                "flex flex-col items-center gap-2 border rounded-xl p-4 transition-all text-center cursor-pointer",
                selected
                  ? "bg-[rgba(76,175,80,0.15)] border-[var(--accent-primary)] text-[var(--text-primary)]"
                  : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[rgba(76,175,80,0.4)]",
              ].join(" ")}
              onClick={() => onToggle(key)}
            >
              <span className="text-[36px] leading-none">{sp.emoji}</span>
              <span className="font-mono text-sm font-bold">{sp.label}</span>
              {selected && (
                <span className="inline-flex items-center justify-center bg-[var(--accent-primary)] rounded-full h-5 w-5 text-[#071107]">
                  <Check size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedSpecies.size > 0 && (
        <p className="text-[var(--text-muted)] text-xs">
          {selectedSpecies.size} animal type{selectedSpecies.size !== 1 ? "s" : ""} selected
        </p>
      )}
    </div>
  );
}

function BreedsStep({ animalTypes, rows, onAdd, onRemove, onUpdate }) {
  return (
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 2</p>
        <h1 className="display-font">Add breeds for each animal type</h1>
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">
          Add the breeds, strains, or varieties you actually keep on your farm.
        </p>
      </header>

      {animalTypes.map(animalType => (
        <section className="panel-card grid gap-[14px]" key={animalType.id}>
          <div className="flex items-center gap-2 text-[var(--text-secondary)] font-bold">
            <span className="text-xl">{animalType.emoji}</span>
            <span>{animalType.name}</span>
          </div>
          {rows
            .filter(row => row.animal_type_id === animalType.id)
            .map(row => (
              <div className="grid gap-[10px] grid-cols-[minmax(0,1fr)_42px]" key={row.tempId}>
                <input
                  className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none py-[9px] px-[10px] focus:border-[var(--accent-primary)]"
                  value={row.name}
                  onChange={e => onUpdate(row.tempId, { name: e.target.value })}
                  placeholder="Breed name"
                />
                <button className="icon-button" type="button" onClick={() => onRemove(row.tempId)} aria-label="Remove">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          <button className="secondary-button" type="button" onClick={() => onAdd(animalType.id)}>
            <Plus size={16} /> Add Breed
          </button>
        </section>
      ))}
    </div>
  );
}

function FlocksStep({ animalTypes, animalClasses, breeds, rows, onAdd, onRemove, onUpdate }) {
  function getDesignationsForBreed(breed) {
    const at = animalTypes.find(t => t.id === breed.animal_type_id);
    const ac = at ? animalClasses.find(c => c.id === at.animal_class_id) : null;
    const classType = ac?.class_type || 'other';
    return (CLASS_CONFIG[classType] || CLASS_CONFIG.other).designations;
  }

  return (
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 3</p>
        <h1 className="display-font">Create flock groups</h1>
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">
          Group animals by pen, purpose, or management batch.
        </p>
      </header>

      {breeds.map(breed => {
        const at = animalTypes.find(t => t.id === breed.animal_type_id);
        const designations = getDesignationsForBreed(breed);
        return (
          <section className="panel-card grid gap-[14px]" key={breed.id}>
            <div className="flex items-center gap-2 text-[var(--text-secondary)] font-bold">
              {at && <span>{at.emoji}</span>}
              <span>{breed.name}</span>
            </div>
            {rows
              .filter(row => row.breed_id === breed.id)
              .map(row => (
                <div
                  className="bg-[rgba(15,26,15,0.62)] border border-[var(--border)] rounded-lg grid gap-3 p-[14px] grid-cols-[repeat(3,minmax(0,1fr))_auto_42px] max-[980px]:grid-cols-1"
                  key={row.tempId}
                >
                  <label className="field">
                    <span>Group name</span>
                    <input value={row.name} onChange={e => onUpdate(row.tempId, { name: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Pen name</span>
                    <input value={row.pen_name} onChange={e => onUpdate(row.tempId, { pen_name: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Headcount</span>
                    <input min="0" type="number" value={row.current_headcount} onChange={e => onUpdate(row.tempId, { current_headcount: e.target.value })} />
                  </label>
                  <div className="flex flex-wrap gap-2 content-end" role="group" aria-label="Designation">
                    {designations.map(designation => (
                      <button
                        key={designation}
                        className={[
                          "bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-muted)] min-h-[34px] py-[7px] px-3 capitalize",
                          row.designation === designation
                            ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold"
                            : "",
                        ].join(" ")}
                        type="button"
                        onClick={() => onUpdate(row.tempId, { designation })}
                      >
                        {designation}
                      </button>
                    ))}
                  </div>
                  <button className="icon-button self-end" type="button" onClick={() => onRemove(row.tempId)} aria-label="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            <button className="secondary-button" type="button" onClick={() => onAdd(breed.id)}>
              <Plus size={16} /> Add Group
            </button>
          </section>
        );
      })}
    </div>
  );
}

function FeedSetupStep({ feedTypes, flocks, assignments, onAdd, onRemove, onToggleAssignment, onUpdate }) {
  return (
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 4</p>
        <h1 className="display-font">Set up feed inventory</h1>
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">
          Define feed stocks and assign them to the flocks that use them.
        </p>
      </header>

      <div className="grid gap-[14px] grid-cols-2 max-[980px]:grid-cols-1">
        {feedTypes.map(feed => (
          <section className="panel-card grid gap-[14px]" key={feed.tempId}>
            <label className="field">
              <span>Feed name</span>
              <input value={feed.name} onChange={e => onUpdate(feed.tempId, { name: e.target.value })} />
            </label>
            <div className="flex flex-wrap gap-2 content-end">
              {["lbs", "kg"].map(unit => (
                <button
                  key={unit}
                  className={["bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[34px] py-[7px] px-3",
                    feed.unit === unit ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold" : ""].join(" ")}
                  type="button"
                  onClick={() => onUpdate(feed.tempId, { unit })}
                >
                  {unit}
                </button>
              ))}
            </div>
            <div className="grid gap-3 grid-cols-2 max-[980px]:grid-cols-1">
              <label className="field">
                <span>Bag Weight</span>
                <input type="number" min="0" step="0.01" value={feed.bag_weight} onChange={e => onUpdate(feed.tempId, { bag_weight: e.target.value })} />
                <small className="text-[var(--text-muted)] text-[11px]">{feed.unit}</small>
              </label>
              <label className="field">
                <span>Bag Price</span>
                <input type="number" min="0" step="0.01" value={feed.bag_price} onChange={e => onUpdate(feed.tempId, { bag_price: e.target.value })} />
              </label>
            </div>
            <div className="bg-[var(--bg-base)] border border-[rgba(46,125,50,0.65)] rounded-lg grid gap-[6px] p-[10px]">
              <strong className="text-[var(--accent-primary)] font-[IBM_Plex_Mono,monospace]">Cost per lb: ${feedCostPerLb(feed).toFixed(4)}</strong>
              <span className="text-[var(--text-muted)] text-xs">
                (${Number(feed.bag_price || 0).toFixed(2)} / {Number(feed.bag_weight || 0) || 0} {feed.unit})
              </span>
            </div>
            <label className="field">
              <span>Stock on hand</span>
              <input type="number" min="0" step="0.01" value={feed.current_on_hand} onChange={e => onUpdate(feed.tempId, { current_on_hand: e.target.value })} />
            </label>
            <label className="field">
              <span>Par level</span>
              <input type="number" min="0" step="0.01" value={feed.par_level} onChange={e => onUpdate(feed.tempId, { par_level: e.target.value })} />
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

      <div className="border border-[var(--border)] rounded-lg overflow-x-auto">
        <table className="border-collapse w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="border-b border-[rgba(46,125,50,0.55)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-[JetBrains_Mono,monospace] p-3 text-left">Feed</th>
              {flocks.map(flock => (
                <th className="border-b border-[rgba(46,125,50,0.55)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-[JetBrains_Mono,monospace] p-3 text-left" key={flock.id}>{flock.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {feedTypes.map((feed, rowIndex) => (
              <tr className={rowIndex % 2 === 1 ? "bg-[rgba(30,50,30,0.45)]" : ""} key={feed.tempId}>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[JetBrains_Mono,monospace] p-3 text-left">{feed.name || "Unnamed feed"}</td>
                {flocks.map(flock => {
                  const key = `${feed.id || feed.tempId}:${flock.id}`;
                  return (
                    <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[JetBrains_Mono,monospace] p-3 text-left" key={flock.id}>
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

function ReviewStep({ animalClasses, animalTypes, breeds, flocks, feedTypes, feedAssignments, onEdit }) {
  return (
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 5</p>
        <h1 className="display-font">Review and launch</h1>
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">
          Check your farm structure before opening the dashboard.
        </p>
      </header>

      <div className="grid gap-[10px]">
        {animalClasses.map(ac => (
          <section className="panel-card grid gap-[10px]" key={ac.id}>
            <div className="flex items-center gap-3 justify-between">
              <strong>{ac.name}</strong>
              <button className="secondary-button" type="button" onClick={() => onEdit(1)}>Edit</button>
            </div>
            {animalTypes
              .filter(at => at.animal_class_id === ac.id)
              .map(at => (
                <div className="border-l border-[var(--border)] ml-2 pl-[14px] grid gap-[10px]" key={at.id}>
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <span>{at.emoji}</span>
                    <span className="font-mono text-sm">{at.name}</span>
                  </div>
                  {breeds
                    .filter(b => b.animal_type_id === at.id)
                    .map(breed => (
                      <div className="border-l border-[var(--border)] ml-2 pl-3 grid gap-2" key={breed.id}>
                        <div className="flex items-center gap-3 justify-between">
                          <span className="font-mono text-sm">{breed.name}</span>
                          <button className="secondary-button" type="button" onClick={() => onEdit(2)}>Edit</button>
                        </div>
                        {flocks
                          .filter(f => f.breed_id === breed.id)
                          .map(flock => (
                            <div className="flex items-center gap-3 justify-between text-[var(--text-muted)] text-xs ml-3" key={flock.id}>
                              <span>{flock.name} — {flock.current_headcount} head — {flock.designation}</span>
                              <button className="secondary-button" type="button" onClick={() => onEdit(3)}>Edit</button>
                            </div>
                          ))}
                      </div>
                    ))}
                </div>
              ))}
          </section>
        ))}
      </div>

      <section className="panel-card grid gap-[10px]">
        <div className="flex items-center gap-3 justify-between">
          <strong>Feed setup</strong>
          <button className="secondary-button" type="button" onClick={() => onEdit(4)}>Edit</button>
        </div>
        <div className="grid gap-[10px] grid-cols-3 max-[980px]:grid-cols-1">
          {feedTypes.map(feed => (
            <span className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-secondary)] p-[10px]" key={feed.id}>
              {feed.name}: {feed.current_on_hand} {feed.unit} @ ${Number(feed.cost_per_lb || feed.cost_per_unit || feedCostPerLb(feed)).toFixed(4)}/{feed.unit}
            </span>
          ))}
        </div>
        <p className="muted">{feedAssignments.length} feed assignments configured.</p>
      </section>
    </div>
  );
}

export default OnboardingWizard;
