import React, { useContext, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import InlineFeedback from "../../components/InlineFeedback";
import { FarmContext } from "../../context/FarmContext";
import { getFlocks } from "../../services/flocksApi";
import { createFeedAssignment, createFlock, getOnboardingSummary } from "../../services/onboardingApi";
import { getAnimalEmoji, getClassConfig } from "../../utils/animalClass";

const designations = ["layer", "breeder", "meat", "mixed"];

function FlockList() {
  const navigate = useNavigate();
  const { userId } = useContext(FarmContext);
  const [flocks, setFlocks] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [setup, setSetup] = useState({ animal_classes: [], feed_types: [] });
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const breedOptions = useMemo(() => {
    return setup.animal_classes.flatMap((ac) =>
      ac.breeds.map((b) => ({ id: b.id, label: `${b.name} (${ac.name})` }))
    );
  }, [setup.animal_classes]);

  async function refresh() {
    if (!userId) return false;
    setLoading(true);
    try {
      const [flockRows, setupRows] = await Promise.all([getFlocks(), getOnboardingSummary(userId)]);
      setFlocks(flockRows);
      setSetup(setupRows);
      return true;
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [userId]);

  async function submitFlock(payload) {
    setFeedback(null);
    try {
      const saved = await createFlock(payload.flock);
      await Promise.all(
        payload.feed_type_ids.map((id) => createFeedAssignment({ flock_id: saved.id, feed_type_id: id }))
      );
      setModalOpen(false);
      if (await refresh()) setFeedback({ type: "success", message: "Flock added" });
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
    }
  }

  return (
    <section className="grid gap-[18px]">
      <header className="page-header">
        <div>
          <h1 className="display-font">Flocks</h1>
          <span className="text-[var(--text-muted)] text-xs mt-1.5 block">{flocks.length} flocks</span>
        </div>
        <button className="secondary-button" type="button" onClick={() => setModalOpen(true)}>
          <Plus size={16} aria-hidden="true" />
          Add Flock
        </button>
      </header>

      <InlineFeedback message={feedback?.message} type={feedback?.type} />

      {loading ? <div className="panel-card">Loading flocks...</div> : null}

      {!loading && !flocks.length ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-[var(--border)] rounded-lg min-h-[280px] p-8 text-center text-[var(--text-secondary)] gap-3">
          <div className="text-[30px]" aria-hidden="true">🐓</div>
          <h2 className="display-font m-0">No flocks yet</h2>
          <Link to="/farm-setup" className="text-[var(--accent-primary)] text-xs">
            Go to Farm Setup to add your first flock
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {flocks.map((flock) => (
          <button
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] cursor-pointer grid gap-3.5 min-h-[260px] p-4 text-left transition-all duration-150 hover:border-[var(--accent-primary)] hover:-translate-y-px hover:shadow-[0_0_0_1px_rgba(76,175,80,0.26)]"
            key={flock.id}
            type="button"
            onClick={() => navigate(`/flocks/${flock.id}`)}
          >
            <div className="flex items-center justify-between gap-2.5">
              <span className={`designation-badge ${flock.designation}`}>{flock.designation}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-[30px]" aria-hidden="true">
                {getAnimalEmoji(flock.class_type, flock.breed_name)}
              </span>
              <h2 className="display-font m-0">{flock.name}</h2>
            </div>

            <p className="text-[var(--text-secondary)] text-xs m-0">
              {flock.breed_name}{flock.pen_name ? ` · ${flock.pen_name}` : ""}
            </p>

            <div
              className="items-end grid gap-2"
              style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}
            >
              <strong className="text-[var(--text-primary)] number-font text-[32px] leading-none">
                {flock.current_headcount}
              </strong>
              <span className="text-[var(--text-muted)] text-xs pb-1">
                {getClassConfig({ class_type: flock.class_type }).headTerm.toLowerCase()}
              </span>
              <em
                className={`inline-flex items-center gap-1.5 text-xs not-italic pb-1 ${
                  flock.today_fed ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"
                }`}
              >
                <i
                  className="rounded-full h-2 w-2 flex-none"
                  style={{ background: flock.today_fed ? "var(--accent-primary)" : "var(--text-muted)" }}
                />
                {flock.today_fed ? "Fed today" : "Not yet fed"}
              </em>
            </div>

            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
              {[
                { label: "All-time cost", value: formatMoney(flock.total_feed_cost_alltime) },
                { label: "All-time eggs",  value: formatNumber(flock.total_eggs_alltime) },
                { label: "Last fed",       value: formatLastFed(flock.last_fed) },
              ].map(({ label, value }) => (
                <span
                  key={label}
                  className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg number-font grid gap-1 p-2.5"
                >
                  <small className="text-[var(--text-muted)] text-[11px]">{label}</small>
                  {value}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {flock.assigned_feeds?.length ? (
                flock.assigned_feeds.map((feed) => (
                  <span
                    key={feed.feed_type_id}
                    className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] text-[11px] px-2 py-1"
                  >
                    {feed.name}
                  </span>
                ))
              ) : (
                <span className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] text-[11px] px-2 py-1">
                  No feeds assigned
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {modalOpen ? (
        <AddFlockModal
          breedOptions={breedOptions}
          feedTypes={setup.feed_types}
          onClose={() => setModalOpen(false)}
          onSubmit={submitFlock}
        />
      ) : null}
    </section>
  );
}

function AddFlockModal({ breedOptions, feedTypes, onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [breedId, setBreedId] = useState(breedOptions[0]?.id || "");
  const [penName, setPenName] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [designation, setDesignation] = useState("mixed");
  const [feedIds, setFeedIds] = useState([]);

  function toggleFeed(feedId) {
    setFeedIds((c) => c.includes(feedId) ? c.filter((id) => id !== feedId) : [...c, feedId]);
  }

  function submit(event) {
    event.preventDefault();
    onSubmit({
      flock: {
        breed_id: Number(breedId),
        name,
        designation,
        pen_name: penName,
        current_headcount: Number(headcount || 0),
      },
      feed_type_ids: feedIds,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-header">
          <h2 className="display-font">Add Flock</h2>
          <button className="inline-flex items-center justify-center flex-none h-12 w-12 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[#e8f5e9] hover:bg-[rgba(198,40,40,0.18)] hover:border-[rgba(198,40,40,0.7)] hover:text-[var(--accent-danger)] transition-colors p-0" type="button" onClick={onClose} aria-label="Close">
            <X size={28} />
          </button>
        </div>
        <div className="settings-form-grid">
          <label className="field">
            <span>Flock name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Breed</span>
            <select required value={breedId} onChange={(e) => setBreedId(e.target.value)}>
              {breedOptions.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Pen name</span>
            <input value={penName} onChange={(e) => setPenName(e.target.value)} />
          </label>
          <label className="field">
            <span>Headcount</span>
            <input min="0" required type="number" value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {designations.map((item) => (
            <button
              className={`rounded-full px-3 py-[7px] text-xs capitalize border transition-colors ${
                designation === item
                  ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold"
                  : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)]"
              }`}
              key={item}
              type="button"
              onClick={() => setDesignation(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[var(--text-muted)] text-xs">Assigned feeds</span>
          {feedTypes.map((feed) => (
            <label key={feed.id} className="inline-flex items-center gap-2 text-[var(--text-secondary)] text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={feedIds.includes(feed.id)}
                onChange={() => toggleFeed(feed.id)}
              />
              {feed.name}
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit">Add Flock</button>
        </div>
      </form>
    </div>
  );
}

function formatMoney(value = 0) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

function formatNumber(value = 0) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function formatLastFed(value) {
  if (!value) return "Never";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatError(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Something went wrong.";
}

export default FlockList;
