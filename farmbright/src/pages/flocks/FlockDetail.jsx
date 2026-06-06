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

  useEffect(() => { refresh(); }, [id]);

  async function submitProduction(payload) {
    setFeedback(null);
    try {
      await logProduction(id, payload);
      setModal(null);
      if (await refresh()) setFeedback({ type: "success", message: "Production logged" });
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
    }
  }

  async function submitCasualty(payload) {
    setFeedback(null);
    try {
      await logCasualty(id, payload);
      setModal(null);
      if (await refresh()) setFeedback({ type: "success", message: "Headcount updated" });
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
    }
  }

  if (loading) return <div className="panel-card">Loading flock detail...</div>;
  if (!flock)  return <div className="panel-card">Flock not found.</div>;

  return (
    <section className="grid gap-[18px]">
      <header
        className="grid gap-4 items-start"
        style={{ gridTemplateColumns: "40px minmax(0,1fr) auto" }}
      >
        <button className="icon-button" type="button" onClick={() => navigate("/flocks")} aria-label="Back to flocks">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-start gap-3">
          <span className="text-[30px]" aria-hidden="true">{animalEmoji(flock.animal_class_name)}</span>
          <div>
            <h1 className="display-font text-[32px] leading-none m-0">{flock.name}</h1>
            <p className="text-[var(--text-secondary)] text-xs m-0 mt-1">
              {flock.breed_name} &gt; {flock.animal_class_name}
            </p>
            <div className="flex items-center gap-2.5 mt-1">
              <span className={`designation-badge ${flock.designation}`}>{flock.designation}</span>
              {flock.pen_name ? <span className="text-[var(--text-secondary)] text-xs">{flock.pen_name}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
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

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Current Headcount" value={formatNumber(flock.current_headcount)} />
        <StatCard label="All-time Feed Cost" value={formatMoney(stats.total_feed_cost_alltime)} />
        {showProduction ? <StatCard label="All-time Eggs" value={formatNumber(stats.total_eggs_alltime)} /> : null}
        {showProduction ? (
          <StatCard
            label="Cost per Dozen"
            value={stats.current_cost_per_dozen == null ? "N/A" : formatMoney(stats.current_cost_per_dozen)}
          />
        ) : null}
      </div>

      <div className="grid gap-[18px] items-start lg:[grid-template-columns:minmax(0,1fr)_320px]">
        <div className="grid gap-3.5">
          <section className="settings-panel">
            <div className="section-title-row" style={{ padding: "14px 18px" }}>
              <h2 className="display-font">Recent Feedings</h2>
              <button className="text-link-button" type="button" onClick={() => navigate(`/scale-house?mode=quick&flock=${flock.id}`)}>
                View all
              </button>
            </div>
            <div style={{ padding: "0 18px 18px" }}>
              <DataTable
                columns={["Date", "Feed", "Weight", "Wt/Bird", "Cost", "$/Bird"]}
                rows={(detail.recent_feedings || []).map((e) => [
                  e.date,
                  e.feed_name,
                  `${formatNumber(e.total_weight, 2)} lbs`,
                  formatNumber(e.weight_per_bird, 3),
                  formatMoney(e.cost_total),
                  formatMoney(e.cost_per_bird),
                ])}
                empty="No feeding logged yet"
              />
            </div>
          </section>

          {showProduction ? (
            <section className="settings-panel">
              <div className="section-title-row" style={{ padding: "14px 18px" }}>
                <h2 className="display-font">Production</h2>
                <button className="text-link-button" type="button" onClick={() => setModal("production")}>
                  Log today's production
                </button>
              </div>
              <div style={{ padding: "0 18px 18px" }}>
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
              </div>
            </section>
          ) : null}

          <section className="settings-panel" style={{ padding: "18px" }}>
            <h2 className="display-font">Headcount History</h2>
            <p className="headcount-current">Current: {formatNumber(flock.current_headcount)} birds</p>
            <div className="headcount-timeline mt-2">
              {(detail.casualty_history || []).length ? (
                detail.casualty_history.map((entry) => (
                  <div className="timeline-entry" key={entry.id}>
                    <span>{entry.date}</span>
                    <strong className={entry.change_amount >= 0 ? "positive" : "negative"}>
                      {entry.change_amount >= 0 ? "+" : ""}{entry.change_amount}
                    </strong>
                    <p>{entry.notes || "No notes"}</p>
                  </div>
                ))
              ) : (
                <p className="text-[var(--text-muted)] text-xs">No headcount changes logged yet</p>
              )}
            </div>
          </section>
        </div>

        <aside className="grid gap-3.5">
          <section className="settings-panel" style={{ padding: "18px" }}>
            <div className="section-title-row mb-3">
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
            <button className="text-link-button mt-2" type="button" onClick={() => navigate("/farm-setup")}>
              Manage feeds
            </button>
          </section>

          <section className="settings-panel" style={{ padding: "18px" }}>
            <h2 className="display-font mb-3">Flock Info</h2>
            <dl className="flock-info-list">
              <div><dt>Designation</dt><dd>{flock.designation}</dd></div>
              <div><dt>Pen/Living area</dt><dd>{flock.pen_name || "Not set"}</dd></div>
              <div>
                <dt>Date added</dt>
                <dd>{flock.created_at ? new Date(flock.created_at).toLocaleDateString() : "Unknown"}</dd>
              </div>
            </dl>
            <button className="text-link-button mt-2" type="button" onClick={() => navigate("/farm-setup")}>
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
    <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg grid gap-1 p-2.5 number-font">
      <strong className="text-[var(--text-primary)] text-[32px] leading-none">{value}</strong>
      <span className="text-[var(--text-muted)] text-[11px]">{label}</span>
    </div>
  );
}

function DataTable({ columns, empty, rows }) {
  if (!rows.length) return <p className="text-[var(--text-muted)] text-xs">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs w-full" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="border-b border-[var(--border)] p-2.5 text-left whitespace-nowrap bg-[var(--bg-base)] text-[var(--text-secondary)]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row[0]}-${i}`}>
              {row.map((cell, j) => (
                <td key={`${cell}-${j}`} className="border-b border-[var(--border)] p-2.5 text-left whitespace-nowrap">
                  {cell}
                </td>
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
          <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>Egg count</span><input min="0" step="1" type="number" value={eggCount} onChange={(e) => setEggCount(e.target.value)} /></label>
          <label className="field"><span>Water (gal)</span><input min="0" step="0.01" type="number" value={waterConsumed} onChange={(e) => setWaterConsumed(e.target.value)} /></label>
          <label className="field"><span>Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        <div className="modal-actions mt-2">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit">Save Production</button>
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
          <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">
            <span>Change type</span>
            <select value={changeType} onChange={(e) => setChangeType(e.target.value)}>
              <option value="addition">Addition</option>
              <option value="casualty">Casualty</option>
            </select>
          </label>
          <label className="field"><span>Count</span><input min="1" required step="1" type="number" value={count} onChange={(e) => setCount(e.target.value)} /></label>
          <label className="field"><span>Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        <div className="modal-actions mt-2">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit">Save Change</button>
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

function animalEmoji(name = "") {
  const l = name.toLowerCase();
  if (l.includes("goat")) return "🐐";
  if (l.includes("swine") || l.includes("pig")) return "🐖";
  if (l.includes("cattle") || l.includes("cow")) return "🐄";
  if (l.includes("rabbit")) return "🐇";
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
