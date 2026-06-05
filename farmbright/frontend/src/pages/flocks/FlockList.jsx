import React, { useContext, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { FarmContext } from "../../context/FarmContext";
import { useToast } from "../../context/ToastContext";
import { getFlocks } from "../../services/flocksApi";
import { createFeedAssignment, createFlock, getOnboardingSummary } from "../../services/onboardingApi";

const designations = ["layer", "breeder", "meat", "mixed"];

function FlockList() {
  const navigate = useNavigate();
  const { userId } = useContext(FarmContext);
  const { showError, showSuccess } = useToast();
  const [flocks, setFlocks] = useState([]);
  const [setup, setSetup] = useState({ animal_classes: [], feed_types: [] });
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const breedOptions = useMemo(() => {
    return setup.animal_classes.flatMap((animalClass) =>
      animalClass.breeds.map((breed) => ({
        id: breed.id,
        label: `${breed.name} (${animalClass.name})`,
      }))
    );
  }, [setup.animal_classes]);

  async function refresh() {
    if (!userId) return;
    setLoading(true);
    try {
      const [flockRows, setupRows] = await Promise.all([getFlocks(userId), getOnboardingSummary(userId)]);
      setFlocks(flockRows);
      setSetup(setupRows);
    } catch (error) {
      showError(formatError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [userId]);

  async function submitFlock(payload) {
    try {
      const saved = await createFlock(payload.flock);
      await Promise.all(
        payload.feed_type_ids.map((feedTypeId) =>
          createFeedAssignment({ flock_id: saved.id, feed_type_id: feedTypeId })
        )
      );
      showSuccess("Flock added");
      setModalOpen(false);
      await refresh();
    } catch (error) {
      showError(formatError(error));
    }
  }

  return (
    <section className="flocks-page">
      <header className="page-header flocks-header">
        <div>
          <h1 className="display-font">Flocks</h1>
          <span className="flock-count-badge">{flocks.length} flocks</span>
        </div>
        <button className="secondary-button" type="button" onClick={() => setModalOpen(true)}>
          <Plus size={16} aria-hidden="true" />
          Add Flock
        </button>
      </header>

      {loading ? <div className="panel-card">Loading flocks...</div> : null}

      {!loading && !flocks.length ? (
        <div className="empty-flocks-state">
          <div aria-hidden="true">🐓</div>
          <h2 className="display-font">No flocks yet</h2>
          <Link to="/farm-setup">Go to Farm Setup to add your first flock</Link>
        </div>
      ) : null}

      <div className="flock-grid">
        {flocks.map((flock) => (
          <button className="flock-card" key={flock.id} type="button" onClick={() => navigate(`/flocks/${flock.id}`)}>
            <div className="flock-card-top">
              <span className={`designation-badge ${flock.designation}`}>{flock.designation}</span>
            </div>
            <div className="flock-card-title">
              <span aria-hidden="true">{animalEmoji(flock.animal_class_name)}</span>
              <h2 className="display-font">{flock.name}</h2>
            </div>
            <p className="flock-card-meta">
              {flock.breed_name}
              {flock.pen_name ? ` · ${flock.pen_name}` : ""}
            </p>

            <div className="flock-headcount-row">
              <strong>{flock.current_headcount}</strong>
              <span>birds</span>
              <em className={flock.today_fed ? "fed" : ""}>
                <i />
                {flock.today_fed ? "Fed today" : "Not yet fed"}
              </em>
            </div>

            <div className="flock-mini-stats">
              <span>
                <small>All-time cost</small>
                {formatMoney(flock.total_feed_cost_alltime)}
              </span>
              <span>
                <small>All-time eggs</small>
                {formatNumber(flock.total_eggs_alltime)}
              </span>
              <span>
                <small>Last fed</small>
                {formatLastFed(flock.last_fed)}
              </span>
            </div>

            <div className="assigned-feed-pills">
              {flock.assigned_feeds?.length ? (
                flock.assigned_feeds.map((feed) => <span key={feed.feed_type_id}>{feed.name}</span>)
              ) : (
                <span>No feeds assigned</span>
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
    setFeedIds((current) =>
      current.includes(feedId) ? current.filter((id) => id !== feedId) : [...current, feedId]
    );
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
      <form className="modal-card add-flock-modal" onSubmit={submit}>
        <div className="modal-header">
          <h2 className="display-font">Add Flock</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="settings-form-grid">
          <label className="field">
            <span>Flock name</span>
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>Breed</span>
            <select required value={breedId} onChange={(event) => setBreedId(event.target.value)}>
              {breedOptions.map((breed) => (
                <option key={breed.id} value={breed.id}>
                  {breed.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Pen name</span>
            <input value={penName} onChange={(event) => setPenName(event.target.value)} />
          </label>
          <label className="field">
            <span>Headcount</span>
            <input min="0" required type="number" value={headcount} onChange={(event) => setHeadcount(event.target.value)} />
          </label>
        </div>
        <div className="designation-picker">
          {designations.map((item) => (
            <button
              className={designation === item ? "active" : ""}
              key={item}
              type="button"
              onClick={() => setDesignation(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="feed-multiselect">
          <span>Assigned feeds</span>
          {feedTypes.map((feed) => (
            <label key={feed.id}>
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
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Add Flock
          </button>
        </div>
      </form>
    </div>
  );
}

function animalEmoji(animalClassName = "") {
  const lower = animalClassName.toLowerCase();
  if (lower.includes("goat")) return "🐐";
  if (lower.includes("swine") || lower.includes("pig")) return "🐖";
  if (lower.includes("cattle") || lower.includes("cow")) return "🐄";
  if (lower.includes("rabbit")) return "🐇";
  return "🐓";
}

function formatMoney(value = 0) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

function formatNumber(value = 0) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function formatLastFed(value) {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatError(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Something went wrong.";
}

export default FlockList;
