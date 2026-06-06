import React, { useEffect, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import InlineFeedback from "../../components/InlineFeedback";
import { getFlockDetail, logCasualty, logProduction } from "../../services/flocksApi";

const todayString = () => new Date().toISOString().slice(0, 10);

function FlockDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const flock = detail?.flock;
  const stats = detail?.stats || {};
  const showProduction = flock && ["layer", "breeder"].includes(flock.designation);

  async function refresh() {
    setLoading(true);
    try {
      setDetail(await getFlockDetail(id));
      return true;
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [id]);

  async function submitProduction(payload) {
    setFeedback(null);
    try {
      await logProduction(id, payload);
      setModal(null);
      if (await refresh()) {
        setFeedback({ type: "success", message: "Production logged" });
      }
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
    }
  }

  async function submitCasualty(payload) {
    setFeedback(null);
    try {
      await logCasualty(id, payload);
      setModal(null);
      if (await refresh()) {
        setFeedback({ type: "success", message: "Headcount updated" });
      }
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
    }
  }

  if (loading) {
    return <div className="panel-card">Loading flock detail...</div>;
  }

  if (!flock) {
    return <div className="panel-card">Flock not found.</div>;
  }

  return (
    <section className="flock-detail-page">
      <header className="flock-detail-header">
        <button className="icon-button" type="button" onClick={() => navigate("/flocks")} aria-label="Back to flocks">
          <ArrowLeft size={18} />
        </button>
        <div className="flock-detail-title">
          <span aria-hidden="true">{animalEmoji(flock.animal_class_name)}</span>
          <div>
            <h1 className="display-font">{flock.name}</h1>
            <p>
              {flock.breed_name} &gt; {flock.animal_class_name}
            </p>
            <div className="flock-title-meta">
              <span className={`designation-badge ${flock.designation}`}>{flock.designation}</span>
              {flock.pen_name ? <span>{flock.pen_name}</span> : null}
            </div>
          </div>
        </div>
        <div className="flock-quick-actions">
          <button className="secondary-button" type="button" onClick={() => setModal("production")}>
            Log Production
          </button>
          <button className="secondary-button" type="button" onClick={() => setModal("casualty")}>
            Log Headcount Change
          </button>
          <button className="primary-button" type="button" onClick={() => navigate(`/scale-house?mode=quick&flock=${flock.id}`)}>
            Start Feeding
          </button>
        </div>
      </header>

      <InlineFeedback message={feedback?.message} type={feedback?.type} />

      <div className="flock-stats-bar">
        <StatCard label="Current Headcount" value={formatNumber(flock.current_headcount)} />
        <StatCard label="All-time Feed Cost" value={formatMoney(stats.total_feed_cost_alltime)} />
        {showProduction ? <StatCard label="All-time Eggs" value={formatNumber(stats.total_eggs_alltime)} /> : null}
        {showProduction ? <StatCard label="Cost per Dozen" value={stats.current_cost_per_dozen == null ? "N/A" : formatMoney(stats.current_cost_per_dozen)} /> : null}
      </div>

      <div className="flock-detail-layout">
        <div className="flock-detail-main">
          <section className="settings-panel">
            <div className="section-title-row">
              <h2 className="display-font">Recent Feedings</h2>
              <button className="text-link-button" type="button" onClick={() => navigate(`/scale-house?mode=quick&flock=${flock.id}`)}>
                View all
              </button>
            </div>
            <DataTable
              columns={["Date", "Feed", "Weight", "Wt/Bird", "Cost", "$/Bird"]}
              rows={(detail.recent_feedings || []).map((event) => [
                event.date,
                event.feed_name,
                `${formatNumber(event.total_weight, 2)} lbs`,
                formatNumber(event.weight_per_bird, 3),
                formatMoney(event.cost_total),
                formatMoney(event.cost_per_bird),
              ])}
              empty="No feeding logged yet"
            />
          </section>

          {showProduction ? (
            <section className="settings-panel">
              <div className="section-title-row">
                <h2 className="display-font">Production</h2>
                <button className="text-link-button" type="button" onClick={() => setModal("production")}>
                  Log today's production
                </button>
              </div>
              <DataTable
                columns={["Date", "Eggs", "Water", "Notes"]}
                rows={(detail.recent_production || []).map((log) => [
                  log.date,
                  log.egg_count ?? "",
                  log.water_consumed == null ? "" : `${formatNumber(log.water_consumed, 1)} gal`,
                  log.notes || "",
                ])}
                empty="No production logged yet"
              />
            </section>
          ) : null}

          <section className="settings-panel">
            <h2 className="display-font">Headcount History</h2>
            <p className="headcount-current">Current: {formatNumber(flock.current_headcount)} birds</p>
            <div className="headcount-timeline">
              {(detail.casualty_history || []).length ? (
                detail.casualty_history.map((entry) => (
                  <div className="timeline-entry" key={entry.id}>
                    <span>{entry.date}</span>
                    <strong className={entry.change_amount >= 0 ? "positive" : "negative"}>
                      {entry.change_amount >= 0 ? "+" : ""}
                      {entry.change_amount}
                    </strong>
                    <p>{entry.notes || "No notes"}</p>
                  </div>
                ))
              ) : (
                <p className="empty-table">No headcount changes logged yet</p>
              )}
            </div>
          </section>
        </div>

        <aside className="flock-detail-side">
          <section className="settings-panel">
            <div className="section-title-row">
              <h2 className="display-font">Assigned Feeds</h2>
            </div>
            <div className="assigned-feed-list">
              {(detail.assigned_feeds || []).map((feed) => (
                <div className="assigned-feed-row" key={feed.feed_type_id}>
                  <strong>{feed.name}</strong>
                  <span className={feed.status}>Stock: {formatNumber(feed.current_on_hand, 2)} {feed.unit}</span>
                  <small>Cost/lb: {formatMoney(feed.cost_per_lb)}</small>
                </div>
              ))}
            </div>
            <button className="text-link-button" type="button" onClick={() => navigate("/farm-setup")}>
              Manage feeds
            </button>
          </section>

          <section className="settings-panel">
            <h2 className="display-font">Flock Info</h2>
            <dl className="flock-info-list">
              <div>
                <dt>Designation</dt>
                <dd>{flock.designation}</dd>
              </div>
              <div>
                <dt>Pen/Living area</dt>
                <dd>{flock.pen_name || "Not set"}</dd>
              </div>
              <div>
                <dt>Date added</dt>
                <dd>{flock.created_at ? new Date(flock.created_at).toLocaleDateString() : "Unknown"}</dd>
              </div>
            </dl>
            <button className="text-link-button" type="button" onClick={() => navigate("/farm-setup")}>
              Edit flock
            </button>
          </section>
        </aside>
      </div>

      {modal === "production" ? (
        <ProductionModal onClose={() => setModal(null)} onSubmit={submitProduction} />
      ) : null}
      {modal === "casualty" ? (
        <HeadcountModal onClose={() => setModal(null)} onSubmit={submitCasualty} />
      ) : null}
    </section>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="flock-stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DataTable({ columns, empty, rows }) {
  if (!rows.length) {
    return <p className="empty-table">{empty}</p>;
  }
  return (
    <div className="flock-table-wrap">
      <table className="flock-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductionModal({ onClose, onSubmit }) {
  const [date, setDate] = useState(todayString());
  const [eggCount, setEggCount] = useState("");
  const [waterConsumed, setWaterConsumed] = useState("");
  const [notes, setNotes] = useState("");

  function submit(event) {
    event.preventDefault();
    onSubmit({
      date,
      egg_count: eggCount === "" ? null : Number(eggCount),
      water_consumed: waterConsumed === "" ? null : Number(waterConsumed),
      notes,
    });
  }

  return (
    <ModalFrame title="Log Production" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="settings-form-grid">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Egg count</span>
            <input min="0" step="1" type="number" value={eggCount} onChange={(event) => setEggCount(event.target.value)} />
          </label>
          <label className="field">
            <span>Water (gal)</span>
            <input min="0" step="0.01" type="number" value={waterConsumed} onChange={(event) => setWaterConsumed(event.target.value)} />
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save Production
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function HeadcountModal({ onClose, onSubmit }) {
  const [date, setDate] = useState(todayString());
  const [changeType, setChangeType] = useState("addition");
  const [count, setCount] = useState("");
  const [notes, setNotes] = useState("");

  function submit(event) {
    event.preventDefault();
    const amount = Number(count || 0);
    onSubmit({
      date,
      change_amount: changeType === "casualty" ? -Math.abs(amount) : Math.abs(amount),
      notes,
    });
  }

  return (
    <ModalFrame title="Log Headcount Change" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="settings-form-grid">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Change type</span>
            <select value={changeType} onChange={(event) => setChangeType(event.target.value)}>
              <option value="addition">Addition</option>
              <option value="casualty">Casualty</option>
            </select>
          </label>
          <label className="field">
            <span>Count</span>
            <input min="1" required step="1" type="number" value={count} onChange={(event) => setCount(event.target.value)} />
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save Change
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({ children, onClose, title }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="display-font">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
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

function formatNumber(value = 0, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number(value) || 0);
}

function formatError(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Something went wrong.";
}

export default FlockDetail;
