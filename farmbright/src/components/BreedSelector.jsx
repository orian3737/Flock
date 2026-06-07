import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { createBreed, getAllBreedsGrouped } from "../services/onboardingApi";
import { getClassConfig } from "../utils/animalClass";

function BreedSelector({ value, onChange, userId, className = "" }) {
  const ref = useRef(null);
  const [groups, setGroups] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [expandedTypeId, setExpandedTypeId] = useState(null);
  const [newBreedInput, setNewBreedInput] = useState("");
  const [addingBreed, setAddingBreed] = useState(false);
  const [addError, setAddError] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");

  function findBreedLabel(data, breedId) {
    for (const group of data) {
      for (const type of (group.animal_types || [])) {
        const breed = (type.breeds || []).find(b => b.id === breedId);
        if (breed) return breed.name;
      }
    }
    return "";
  }

  useEffect(() => {
    if (!userId) return;
    getAllBreedsGrouped(userId)
      .then(data => {
        setGroups(data);
        if (value) setSelectedLabel(findBreedLabel(data, value));
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!value) { setSelectedLabel(""); return; }
    setSelectedLabel(findBreedLabel(groups, value));
  }, [value, groups]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (!ref.current?.contains(e.target)) {
        setIsOpen(false);
        setExpandedTypeId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleInlineAddBreed(animalTypeId) {
    const name = newBreedInput.trim();
    if (!name) return;
    setAddingBreed(true);
    setAddError("");
    try {
      const newBreed = await createBreed(animalTypeId, name);
      setGroups(prev =>
        prev.map(g => ({
          ...g,
          animal_types: (g.animal_types || []).map(t =>
            t.id === animalTypeId
              ? { ...t, breeds: [...(t.breeds || []), { id: newBreed.id, name: newBreed.name }] }
              : t
          ),
        }))
      );
      onChange(newBreed.id, newBreed.name);
      setSelectedLabel(newBreed.name);
      setExpandedTypeId(null);
      setNewBreedInput("");
      setIsOpen(false);
    } catch (err) {
      setAddError(err.message || "Could not add breed.");
    } finally {
      setAddingBreed(false);
    }
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        className="w-full flex items-center justify-between bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[38px] py-2 px-[10px] font-mono text-sm"
        type="button"
        onClick={() => setIsOpen(v => !v)}
      >
        {selectedLabel ? (
          <span>{selectedLabel}</span>
        ) : (
          <span className="text-[var(--text-muted)]">Select a breed...</span>
        )}
        <ChevronDown
          size={16}
          className={`text-[var(--text-muted)] transition-transform flex-none ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg max-h-80 overflow-y-auto">
          {groups.length ? (
            groups.map(group => {
              const types = group.animal_types || [];
              const singleType = types.length === 1;
              const classEmoji = singleType
                ? types[0].emoji
                : getClassConfig(group.class_type)?.emoji || '🐾';

              return (
                <div key={group.id}>
                  <div className="px-3 py-2 sticky top-0 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center gap-2">
                    <span>{classEmoji}</span>
                    <span className="font-mono text-xs font-bold text-[var(--accent-primary)] uppercase tracking-wider">
                      {group.name}
                    </span>
                  </div>

                  {!types.length && (
                    <span className="block px-4 py-2 font-mono text-xs text-[var(--text-muted)] italic">
                      No animal types yet
                    </span>
                  )}

                  {types.map(animalType => {
                    const breeds = animalType.breeds || [];
                    return (
                      <div key={animalType.id}>
                        {!singleType && (
                          <div className="px-4 py-1.5 bg-[var(--bg-surface)] text-[var(--text-muted)] font-mono text-xs flex items-center gap-1.5 border-b border-[var(--border)]">
                            <span>{animalType.emoji}</span>
                            <span>{animalType.name}</span>
                          </div>
                        )}

                        {breeds.length ? (
                          breeds.map(breed => (
                            <button
                              key={breed.id}
                              className={`w-full text-left px-4 py-2 font-mono text-sm flex items-center justify-between gap-2 transition-colors ${
                                value === breed.id
                                  ? "bg-[var(--bg-elevated)] text-[var(--accent-primary)]"
                                  : "text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                              }`}
                              type="button"
                              onClick={() => {
                                onChange(breed.id, breed.name);
                                setSelectedLabel(breed.name);
                                setIsOpen(false);
                                setExpandedTypeId(null);
                              }}
                            >
                              <span>{breed.name}</span>
                              {value === breed.id && <Check size={14} />}
                            </button>
                          ))
                        ) : (
                          <span className="block px-4 py-2 font-mono text-xs text-[var(--text-muted)] italic">
                            No breeds yet
                          </span>
                        )}

                        {expandedTypeId === animalType.id ? (
                          <div className="px-3 py-2 flex flex-wrap items-center gap-2 bg-[var(--bg-elevated)] border-t border-[var(--border)]">
                            <input
                              autoFocus
                              className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[30px] py-1 px-2 font-mono text-xs flex-1"
                              placeholder={`New ${animalType.name.toLowerCase()} breed...`}
                              value={newBreedInput}
                              onChange={e => setNewBreedInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleInlineAddBreed(animalType.id);
                                if (e.key === "Escape") setExpandedTypeId(null);
                              }}
                            />
                            <button
                              className="bg-[var(--accent-primary)] text-[var(--bg-base)] rounded-md px-2 py-1 font-mono text-xs border-0 disabled:opacity-40 cursor-pointer"
                              type="button"
                              disabled={addingBreed || !newBreedInput.trim()}
                              onClick={() => handleInlineAddBreed(animalType.id)}
                            >
                              {addingBreed ? "..." : "Add"}
                            </button>
                            <button
                              className="text-[var(--text-muted)] bg-transparent border-0 font-mono text-xs cursor-pointer"
                              type="button"
                              onClick={() => { setExpandedTypeId(null); setAddError(""); }}
                            >
                              ✕
                            </button>
                            {addError && (
                              <p className="w-full text-[var(--accent-danger)] font-mono text-xs m-0">{addError}</p>
                            )}
                          </div>
                        ) : (
                          <button
                            className="w-full text-left px-4 py-2 font-mono text-xs text-[var(--accent-primary)] hover:bg-[var(--bg-elevated)] flex items-center gap-1 border-t border-[var(--border)]"
                            type="button"
                            onClick={() => { setExpandedTypeId(animalType.id); setNewBreedInput(""); setAddError(""); }}
                          >
                            <span>+</span> Add new breed
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">
              No animal classes set up yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BreedSelector;
