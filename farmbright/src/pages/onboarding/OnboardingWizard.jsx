import React, { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
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
    bag_weight: "50",
    bag_price: "",
    current_on_hand: "",
    par_level: "",
  };
}

function feedCostPerLb(feed) {
  const bagWeight = Number(feed.bag_weight || 0);
  const bagPrice = Number(feed.bag_price || 0);
  return bagWeight > 0 ? bagPrice / bagWeight : 0;
}

function formatError(error) {
  return error?.response?.data?.message || error?.message || "Something went wrong.";
}

function OnboardingWizard() {
  const navigate = useNavigate();
  const { profile, loading: authLoading, markOnboarded } = useAuth();
  const [step, setStep] = useState(1);
  const [farmName, setFarmName] = useState(profile?.farm_name || localStorage.getItem("Flock_farm_name") || "");
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
  const userId = profile?.id;

  useEffect(() => {
    if (profile) {
      setFarmName(profile.farm_name);
      localStorage.setItem("Flock_user_id", String(profile.id));
      localStorage.setItem("Flock_farm_name", profile.farm_name);
    }
  }, [profile]);

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
          bag_weight: Number(item.bag_weight || 0),
          bag_price: Number(item.bag_price || 0),
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

  if (authLoading || !profile) {
    return (
      // route-loading: flex items-center justify-center min-h-screen bg-[--bg-base] px-6 flex-col gap-[14px] text-[--text-secondary]
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-base)] px-6 flex-col gap-[14px] text-[var(--text-secondary)]">
        {/* route-spinner: animate-spin rounded-full border-[3px] border-[rgba(76,175,80,0.2)] border-t-[--accent-primary] h-[42px] w-[42px] */}
        <div
          className="rounded-full border-[3px] border-[rgba(76,175,80,0.2)] border-t-[var(--accent-primary)] h-[42px] w-[42px] [animation:spin_0.8s_linear_infinite]"
          aria-hidden="true"
        />
        <div>Loading...</div>
      </div>
    );
  }

  return (
    // onboarding-screen: bg-[--bg-base] grid grid-cols-[320px_minmax(0,1fr)] min-h-screen; <=980px: grid-cols-1
    <div className="bg-[var(--bg-base)] grid grid-cols-[320px_minmax(0,1fr)] min-h-screen max-[980px]:grid-cols-1">
      {/* onboarding-sidebar: bg-[--bg-surface] border-r border-[--border] flex flex-col justify-between min-h-screen p-6 */}
      <aside className="bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col justify-between min-h-screen p-6">
        <div>
          {/* onboarding-logo (display-font kept): text-[--text-primary] text-[28px] leading-none */}
          <div className="display-font text-[var(--text-primary)] text-[28px] leading-none">🌾 Flock</div>
          {/* onboarding-farm-name: text-[--text-muted] text-[13px] mt-2 */}
          <div className="text-[var(--text-muted)] text-[13px] mt-2">{farmName || profile.farm_name}</div>
          {/* onboarding-fields: grid gap-3 mt-[18px] */}
          <div className="grid gap-3 mt-[18px]">
            {/* label: grid gap-[7px] text-[--text-secondary] text-xs */}
            <label className="grid gap-[7px] text-[var(--text-secondary)] text-xs">
              <span>Farm name</span>
              {/* input: bg-[--bg-base] border border-[--border] rounded-md text-[--text-primary] min-h-[40px] outline-none py-[9px] px-[10px] focus:border-[--accent-primary] */}
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[40px] outline-none py-[9px] px-[10px] focus:border-[var(--accent-primary)]"
                value={farmName}
                onChange={(event) => setFarmName(event.target.value)}
                placeholder="Everyday Acres"
              />
            </label>
          </div>
        </div>

        {/* step-tracker: grid gap-4 list-none m-0 my-8 p-0 */}
        <ol className="grid gap-4 list-none m-0 my-8 p-0">
          {steps.map((label, index) => {
            const number = index + 1;
            const status = number < step ? "complete" : number === step ? "current" : "future";
            // step-item: flex items-center gap-3 text-[--text-muted]
            // complete/current: text-[--text-primary]
            return (
              <li
                className={[
                  "flex items-center gap-3",
                  status === "future" ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]",
                ].join(" ")}
                key={label}
              >
                {/* step-dot: inline-flex items-center justify-center rounded-full bg-[--bg-elevated] border border-[--border] text-[--text-muted] text-xs h-[30px] w-[30px]
                    complete: bg-[--accent-primary] border-[--accent-primary] text-[#071107]
                    current: [animation:pulse-ring_1.4s_infinite] border-[--accent-primary] text-[--text-primary] */}
                <span
                  className={[
                    "inline-flex items-center justify-center rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)] text-xs h-[30px] w-[30px]",
                    status === "complete" ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107]" : "",
                    status === "current" ? "[animation:pulse-ring_1.4s_infinite] border-[var(--accent-primary)] text-[var(--text-primary)]" : "",
                  ].join(" ")}
                >
                  {status === "complete" ? <Check size={14} /> : number}
                </span>
                {/* label text: complete → text-[--text-muted] line-through; current → text-[--text-primary] font-bold */}
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

        {/* signin-link: text-[--text-secondary] text-[13px] */}
        <a className="text-[var(--text-secondary)] text-[13px]" href="/dashboard">
          Already set up? Sign in
        </a>
      </aside>

      {/* onboarding-main: min-w-0 py-6 px-6 pb-24 relative */}
      <main className="min-w-0 py-6 px-6 pb-24 relative">
        {/* onboarding-card: grid gap-5 mx-auto max-w-[1080px] min-h-[calc(100vh-120px)] */}
        <section className="grid gap-5 mx-auto max-w-[1080px] min-h-[calc(100vh-120px)]">
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

          {/* wizard-actions: sticky bottom-0 flex gap-[10px] justify-between mt-auto pt-6 pb-0
              bg gradient to clear content beneath */}
          <footer className="sticky bottom-0 flex gap-[10px] justify-between mt-auto pt-6 [background:linear-gradient(180deg,rgba(15,26,15,0),var(--bg-base)_24%)]">
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
    // wizard-step: grid gap-[18px]
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 1</p>
        <h1 className="display-font">What animals do you raise?</h1>
        {/* step-instruction: text-[--text-secondary] text-[13px] mt-[10px] mb-[6px] */}
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">Start with broad animal types. You can rename or remove them later.</p>
      </header>
      {/* dynamic-list: grid gap-[14px] */}
      <div className="grid gap-[14px]">
        {rows.map((row) => (
          // inline-row: grid gap-[10px] grid-cols-[minmax(0,1fr)_42px]
          <div className="grid gap-[10px] grid-cols-[minmax(0,1fr)_42px]" key={row.tempId}>
            <input
              className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none py-[9px] px-[10px] focus:border-[var(--accent-primary)]"
              value={row.name}
              onChange={(event) => onUpdate(row.tempId, { name: event.target.value })}
              placeholder="Animal type"
            />
            <button className="icon-button" type="button" onClick={() => onRemove(row.tempId)} aria-label="Remove animal type">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button className="secondary-button" type="button" onClick={onAdd}>
        <Plus size={16} /> Add Animal Type
      </button>
      {/* hint-chips: flex flex-wrap gap-2 */}
      <div className="flex flex-wrap gap-2">
        {hintChips.map((hint) => (
          // hint chip button: bg-[--bg-elevated] border border-[--border] rounded-full text-[--text-secondary] min-h-[34px] py-[7px] px-3
          <button
            className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[34px] py-[7px] px-3"
            type="button"
            key={hint}
            onClick={() => onHint(hint)}
          >
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}

function BreedsStep({ animalClasses, rows, onAdd, onRemove, onUpdate }) {
  return (
    // wizard-step: grid gap-[18px]
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 2</p>
        <h1 className="display-font">Define breeds for each animal class</h1>
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">Add the breeds, strains, or varieties you actually keep on your farm.</p>
      </header>
      {animalClasses.map((animalClass) => (
        // section-block: grid gap-[14px] (panel-card kept)
        <section className="panel-card grid gap-[14px]" key={animalClass.id}>
          {/* section-title: text-[--text-secondary] font-bold */}
          <div className="text-[var(--text-secondary)] font-bold">{animalClass.name}</div>
          {rows
            .filter((row) => row.animal_class_id === animalClass.id)
            .map((row) => (
              <div className="grid gap-[10px] grid-cols-[minmax(0,1fr)_42px]" key={row.tempId}>
                <input
                  className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[42px] outline-none py-[9px] px-[10px] focus:border-[var(--accent-primary)]"
                  value={row.name}
                  onChange={(event) => onUpdate(row.tempId, { name: event.target.value })}
                  placeholder="Breed"
                />
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
    // wizard-step: grid gap-[18px]
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 3</p>
        <h1 className="display-font">Create flock groups</h1>
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">Group animals by pen, purpose, or management batch.</p>
      </header>
      {breeds.map((breed) => (
        <section className="panel-card grid gap-[14px]" key={breed.id}>
          <div className="text-[var(--text-secondary)] font-bold">{breed.name}</div>
          {rows
            .filter((row) => row.breed_id === breed.id)
            .map((row) => (
              // flock-card: bg-[rgba(15,26,15,0.62)] border border-[--border] rounded-lg grid gap-3
              //   grid-cols-[repeat(3,minmax(0,1fr))_auto_42px]; <=980px: grid-cols-1
              <div
                className="bg-[rgba(15,26,15,0.62)] border border-[var(--border)] rounded-lg grid gap-3 p-[14px] grid-cols-[repeat(3,minmax(0,1fr))_auto_42px] max-[980px]:grid-cols-1"
                key={row.tempId}
              >
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
                {/* designation-group: flex flex-wrap gap-2 content-end; <=980px buttons still in row */}
                <div className="flex flex-wrap gap-2 content-end" role="group" aria-label="Designation">
                  {designations.map((designation) => (
                    <button
                      className={[
                        "bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-muted)] min-h-[34px] py-[7px] px-3 capitalize",
                        row.designation === designation
                          ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold"
                          : "",
                      ].join(" ")}
                      key={designation}
                      type="button"
                      onClick={() => onUpdate(row.tempId, { designation })}
                    >
                      {designation}
                    </button>
                  ))}
                </div>
                {/* remove-row: icon-button self-end */}
                <button className="icon-button self-end" type="button" onClick={() => onRemove(row.tempId)} aria-label="Remove flock">
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
    // wizard-step: grid gap-[18px]
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 4</p>
        <h1 className="display-font">Set up feed inventory</h1>
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">Define feed stocks and assign them to the flocks that use them.</p>
      </header>
      {/* feed-card-grid: grid gap-[14px] grid-cols-2; <=980px: grid-cols-1 */}
      <div className="grid gap-[14px] grid-cols-2 max-[980px]:grid-cols-1">
        {feedTypes.map((feed) => (
          // feed-card: panel-card + grid gap-[14px]
          <section className="panel-card grid gap-[14px]" key={feed.tempId}>
            <label className="field">
              <span>Feed name</span>
              <input value={feed.name} onChange={(event) => onUpdate(feed.tempId, { name: event.target.value })} />
            </label>
            {/* unit-toggle: flex flex-wrap gap-2 content-end */}
            <div className="flex flex-wrap gap-2 content-end">
              {["lbs", "kg"].map((unit) => (
                <button
                  className={[
                    "bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[34px] py-[7px] px-3",
                    feed.unit === unit
                      ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold"
                      : "",
                  ].join(" ")}
                  type="button"
                  key={unit}
                  onClick={() => onUpdate(feed.tempId, { unit })}
                >
                  {unit}
                </button>
              ))}
            </div>
            {/* feed-bag-grid: grid gap-3 grid-cols-2; <=980px: grid-cols-1 */}
            <div className="grid gap-3 grid-cols-2 max-[980px]:grid-cols-1">
              <label className="field">
                <span>Bag Weight</span>
                <input type="number" min="0" step="0.01" value={feed.bag_weight} onChange={(event) => onUpdate(feed.tempId, { bag_weight: event.target.value })} />
                <small className="text-[var(--text-muted)] text-[11px]">{feed.unit}</small>
              </label>
              <label className="field">
                <span>Bag Price</span>
                <input type="number" min="0" step="0.01" value={feed.bag_price} onChange={(event) => onUpdate(feed.tempId, { bag_price: event.target.value })} />
              </label>
            </div>
            {/* feed-cost-preview: bg-[--bg-base] border border-[rgba(46,125,50,0.65)] rounded-lg grid gap-[6px] p-[10px] */}
            <div className="bg-[var(--bg-base)] border border-[rgba(46,125,50,0.65)] rounded-lg grid gap-[6px] p-[10px]">
              <strong className="text-[var(--accent-primary)] font-[IBM_Plex_Mono,monospace]">Cost per lb: ${feedCostPerLb(feed).toFixed(4)}</strong>
              <span className="text-[var(--text-muted)] text-xs">
                (${Number(feed.bag_price || 0).toFixed(2)} / {Number(feed.bag_weight || 0) || 0} {feed.unit})
              </span>
            </div>
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

      {/* assignment-table-wrap: border border-[--border] rounded-lg overflow-x-auto */}
      <div className="border border-[var(--border)] rounded-lg overflow-x-auto">
        {/* assignment-table: border-collapse w-full min-w-[720px] */}
        <table className="border-collapse w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="border-b border-[rgba(46,125,50,0.55)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-[JetBrains_Mono,monospace] p-3 text-left">Feed</th>
              {flocks.map((flock) => (
                <th className="border-b border-[rgba(46,125,50,0.55)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-[JetBrains_Mono,monospace] p-3 text-left" key={flock.id}>{flock.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {feedTypes.map((feed, rowIndex) => (
              <tr
                className={rowIndex % 2 === 1 ? "bg-[rgba(30,50,30,0.45)]" : ""}
                key={feed.tempId}
              >
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[JetBrains_Mono,monospace] p-3 text-left">{feed.name || "Unnamed feed"}</td>
                {flocks.map((flock) => {
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

function ReviewStep({ animalClasses, breeds, flocks, feedTypes, feedAssignments, onEdit }) {
  return (
    // wizard-step: grid gap-[18px]
    <div className="grid gap-[18px]">
      <header>
        <p className="eyebrow">Step 5</p>
        <h1 className="display-font">Review and launch</h1>
        <p className="text-[var(--text-secondary)] text-[13px] mt-[10px] mb-[6px]">Check your farm structure before opening the dashboard.</p>
      </header>
      {/* review-tree: grid gap-[10px] */}
      <div className="grid gap-[10px]">
        {animalClasses.map((animalClass) => (
          <section className="panel-card grid gap-[10px]" key={animalClass.id}>
            {/* review-row: flex items-center gap-3 justify-between */}
            <div className="flex items-center gap-3 justify-between">
              <strong>{animalClass.name}</strong>
              <button className="secondary-button" type="button" onClick={() => onEdit(1)}>
                Edit
              </button>
            </div>
            {breeds
              .filter((breed) => breed.animal_class_id === animalClass.id)
              .map((breed) => (
                // review-branch: grid gap-[10px] border-l border-[--border] ml-2 pl-[14px]
                <div className="grid gap-[10px] border-l border-[var(--border)] ml-2 pl-[14px]" key={breed.id}>
                  <div className="flex items-center gap-3 justify-between">
                    <span>{breed.name}</span>
                    <button className="secondary-button" type="button" onClick={() => onEdit(2)}>
                      Edit
                    </button>
                  </div>
                  {flocks
                    .filter((flock) => flock.breed_id === breed.id)
                    .map((flock) => (
                      // review-leaf: grid gap-[10px] text-[--text-secondary] ml-3
                      <div className="grid gap-[10px] text-[var(--text-secondary)] ml-3" key={flock.id}>
                        <div className="flex items-center gap-3 justify-between">
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
      <section className="panel-card grid gap-[10px]">
        <div className="flex items-center gap-3 justify-between">
          <strong>Feed setup</strong>
          <button className="secondary-button" type="button" onClick={() => onEdit(4)}>
            Edit
          </button>
        </div>
        {/* feed-summary: grid gap-[10px] grid-cols-3; <=980px: grid-cols-1 */}
        <div className="grid gap-[10px] grid-cols-3 max-[980px]:grid-cols-1">
          {feedTypes.map((feed) => (
            // each span: bg-[--bg-base] border border-[--border] rounded-md text-[--text-secondary] p-[10px]
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
