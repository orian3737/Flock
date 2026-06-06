import React, { useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, History, PackagePlus, SlidersHorizontal, X } from "lucide-react";

import { FarmContext } from "../../context/FarmContext";
import {
  adjustFeed,
  dismissInventoryAlert,
  getFeedTransactions,
  getInventory,
  getInventoryAlerts,
  purchaseFeed,
  updateFeed,
} from "../../services/inventoryApi";

const todayString = () => new Date().toISOString().slice(0, 10);
const moneyFormatter = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });

function formatMoney(value = 0) { return moneyFormatter.format(Number(value) || 0); }
function formatNumber(value = 0, digits = 1) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}
function statusLabel(status) {
  return status === "critical" ? "Critical" : status === "warning" ? "Warning" : "OK";
}

function Inventory() {
  const { userId } = useContext(FarmContext);
  const [feeds, setFeeds]               = useState([]);
  const [alerts, setAlerts]             = useState([]);
  const [transactions, setTransactions] = useState({});
  const [expandedFeedId, setExpandedFeedId] = useState(null);
  const [editing, setEditing]           = useState(null);
  const [editValue, setEditValue]       = useState("");
  const [modal, setModal]               = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");

  const alertFeeds = useMemo(
    () => alerts.filter((a) => Number(a.current_on_hand) <= Number(a.par_level)),
    [alerts],
  );

  async function refreshInventory() {
    if (!userId) { setLoading(false); return; }
    try {
      const [inventoryData, alertData] = await Promise.all([getInventory(userId), getInventoryAlerts(userId)]);
      setFeeds(inventoryData);
      setAlerts(alertData);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Inventory could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshInventory(); }, [userId]);

  async function loadTransactions(feedId) {
    if (expandedFeedId === feedId) { setExpandedFeedId(null); return; }
    const rows = await getFeedTransactions(feedId);
    setTransactions((p) => ({ ...p, [feedId]: rows }));
    setExpandedFeedId(feedId);
  }

  function beginEdit(feed, field) {
    setEditing({ feedId: feed.id, field });
    if (field === "bag") {
      setEditValue({ bag_weight: String(feed.bag_weight || ""), bag_price: String(feed.bag_price || "") });
    } else {
      setEditValue(String(feed[field]));
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const payload = editing.field === "bag" ? editValue : { [editing.field]: editValue };
    await updateFeed(editing.feedId, payload);
    setEditing(null);
    setEditValue("");
    await refreshInventory();
  }

  async function dismissAlert(alertId) {
    await dismissInventoryAlert(alertId);
    await refreshInventory();
  }

  async function submitPurchase(payload) {
    await purchaseFeed(payload);
    setModal(null);
    await refreshInventory();
    if (expandedFeedId === payload.feed_type_id) {
      await loadTransactions(payload.feed_type_id);
      setExpandedFeedId(payload.feed_type_id);
    }
  }

  async function submitAdjustment(payload) {
    await adjustFeed(payload);
    setModal(null);
    await refreshInventory();
    if (expandedFeedId === payload.feed_type_id) {
      await loadTransactions(payload.feed_type_id);
      setExpandedFeedId(payload.feed_type_id);
    }
  }

  if (loading) return <section className="panel-card">Loading inventory...</section>;

  return (
    <section className="grid gap-4">
      <header className="page-header">
        <div>
          <p className="eyebrow">Feed ledger</p>
          <h1 className="display-font">Inventory</h1>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      {alertFeeds.length ? (
        <section className="flex gap-3 items-start bg-[rgba(255,143,0,0.14)] border border-[rgba(255,143,0,0.4)] border-l-[8px] border-l-[var(--accent-warn)] rounded-lg text-[var(--text-primary)] p-4">
          <AlertTriangle size={22} className="text-[var(--accent-warn)] flex-none" aria-hidden="true" />
          <div className="flex-1">
            <strong className="block mb-2">Feed at or below par</strong>
            <div className="grid gap-[7px]">
              {alertFeeds.map((alert) => (
                <div key={alert.alert_id} className="flex items-center gap-2.5 justify-between">
                  <span className="text-sm">
                    {alert.feed_name}: {formatNumber(alert.current_on_hand)} {alert.unit} remaining
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center bg-transparent border border-[rgba(255,143,0,0.45)] rounded-md text-[var(--text-primary)] h-[28px] w-[28px] p-0"
                    onClick={() => dismissAlert(alert.alert_id)}
                    aria-label={`Dismiss ${alert.feed_name}`}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {feeds.map((feed) => (
          <article className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg grid gap-4 min-w-0 p-4" key={feed.id}>
            <header className="flex items-start gap-3 justify-between">
              <div>
                <h2 className="text-[var(--text-primary)] text-[15px] font-bold m-0 mb-2 break-words"
                    style={{ fontFamily: "IBM Plex Mono, monospace" }}>
                  {feed.name}
                </h2>
                <span className="inline-flex border border-[var(--border)] rounded-full text-[var(--text-secondary)] text-[11px] px-2 py-[3px]">
                  {feed.unit}
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-[7px] text-[var(--text-secondary)] text-xs flex-none ${
                  feed.status === "critical" ? "text-[var(--accent-danger)]"
                  : feed.status === "warning" ? "text-[var(--accent-warn)]"
                  : ""
                }`}
              >
                <span
                  className="inline-block rounded-full h-[10px] w-[10px]"
                  style={{
                    background: feed.status === "critical" ? "var(--accent-danger)"
                      : feed.status === "warning" ? "var(--accent-warn)"
                      : "var(--accent-primary)",
                  }}
                />
                {statusLabel(feed.status)}
              </span>
            </header>

            <StockMeter feed={feed} />

            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
              <InventoryStat label="On Hand" value={`${formatNumber(feed.current_on_hand)} ${feed.unit}`} />
              <EditableBagStat
                editing={editing}
                editValue={editValue}
                feed={feed}
                setEditValue={setEditValue}
                onBeginEdit={beginEdit}
                onSave={saveEdit}
              />
              <InventoryStat label="Cost per lb" value={formatMoney(feed.cost_per_lb ?? feed.cost_per_unit)} />
            </div>

            <footer className="grid gap-2" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
              {[
                { icon: PackagePlus, label: "Purchase",  onClick: () => setModal({ type: "purchase", feed }) },
                { icon: History,     label: "History",   onClick: () => loadTransactions(feed.id) },
                { icon: SlidersHorizontal, label: "Adjust", onClick: () => setModal({ type: "adjustment", feed }) },
              ].map(({ icon: Icon, label, onClick }) => (
                <button
                  key={label}
                  type="button"
                  className="inline-flex items-center justify-center gap-[7px] bg-transparent border border-[var(--border)] rounded-md text-[var(--text-secondary)] min-h-[36px] p-2"
                  onClick={onClick}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </footer>

            {expandedFeedId === feed.id ? (
              <TransactionHistory rows={transactions[feed.id] || []} unit={feed.unit} />
            ) : null}
          </article>
        ))}
      </div>

      {!feeds.length ? <div className="panel-card">No feed types configured yet.</div> : null}

      {modal?.type === "purchase" ? (
        <PurchaseModal feed={modal.feed} onClose={() => setModal(null)} onSubmit={submitPurchase} />
      ) : null}
      {modal?.type === "adjustment" ? (
        <AdjustmentModal feed={modal.feed} onClose={() => setModal(null)} onSubmit={submitAdjustment} />
      ) : null}
    </section>
  );
}

function StockMeter({ feed }) {
  const denominator = feed.par_level * 3 || 1;
  const fillPercent = Math.min(100, Math.max(0, (feed.current_on_hand / denominator) * 100));
  const parPercent  = Math.min(100, Math.max(0, (feed.par_level / denominator) * 100));
  const fillColor   = feed.status === "critical" ? "var(--accent-danger)"
    : feed.status === "warning" ? "var(--accent-warn)"
    : "var(--accent-primary)";

  return (
    <div className="grid gap-2">
      <div className="relative bg-[rgba(85,139,90,0.22)] rounded-full h-3">
        <span
          className="block h-full rounded-[inherit]"
          style={{ width: `${fillPercent}%`, background: fillColor }}
        />
        <span
          className="absolute top-[-4px] w-[2px] h-5 rounded-sm bg-[var(--text-primary)]"
          style={{ left: `${parPercent}%`, transform: "translateX(-1px)" }}
        />
      </div>
      <div className="relative h-[18px] text-[var(--text-muted)] text-[11px]">
        <span className="absolute top-0 left-0">0</span>
        <span className="absolute top-0" style={{ left: `${parPercent}%`, transform: "translateX(-50%)" }}>
          Par {formatNumber(feed.par_level)}
        </span>
        <span className="absolute top-0 right-0">{formatNumber(denominator)}</span>
      </div>
    </div>
  );
}

function InventoryStat({ label, value }) {
  return (
    <div className="bg-[var(--bg-base)] border border-[rgba(46,125,50,0.65)] rounded-lg grid gap-1.5 min-h-[72px] p-2.5">
      <span className="text-[var(--text-muted)] text-[11px]">{label}</span>
      <strong className="text-[var(--text-primary)] break-words" style={{ fontFamily: "JetBrains Mono, monospace" }}>
        {value}
      </strong>
    </div>
  );
}

function EditableStat({ editing, editValue, feed, field, label, onBeginEdit, onSave, setEditValue, value }) {
  const isEditing = editing?.feedId === feed.id && editing?.field === field;
  return (
    <div
      className="bg-[var(--bg-base)] border border-[rgba(46,125,50,0.65)] rounded-lg grid gap-1.5 min-h-[72px] p-2.5 cursor-pointer"
      onClick={() => !isEditing && onBeginEdit(feed, field)}
    >
      <span className="text-[var(--text-muted)] text-[11px]">{label}</span>
      {isEditing ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            min="0"
            step="0.01"
            type="number"
            value={editValue}
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-w-0 p-[7px] w-full"
            onChange={(e) => setEditValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="inline-flex items-center justify-center bg-[var(--accent-primary)] border-0 rounded-md text-[#071107] h-8 w-[34px] p-0 flex-none"
            onClick={onSave}
            aria-label={`Save ${label}`}
          >
            <Check size={15} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <strong className="text-[var(--text-primary)] break-words" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          {value}
        </strong>
      )}
    </div>
  );
}

function EditableBagStat({ editing, editValue, feed, onBeginEdit, onSave, setEditValue }) {
  const isEditing = editing?.feedId === feed.id && editing?.field === "bag";
  const bagWeight = isEditing ? Number(editValue.bag_weight || 0) : Number(feed.bag_weight || 0);
  const bagPrice  = isEditing ? Number(editValue.bag_price  || 0) : Number(feed.bag_price  || 0);

  return (
    <div
      className="bg-[var(--bg-base)] border border-[rgba(46,125,50,0.65)] rounded-lg grid gap-1.5 min-h-[72px] p-2.5 cursor-pointer"
      onClick={() => !isEditing && onBeginEdit(feed, "bag")}
    >
      <span className="text-[var(--text-muted)] text-[11px]">Bag Size</span>
      {isEditing ? (
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) 34px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            min="0" step="0.01" type="number" value={editValue.bag_weight}
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-w-0 p-[7px] w-full"
            onChange={(e) => setEditValue((v) => ({ ...v, bag_weight: e.target.value }))}
          />
          <input
            min="0" step="0.01" type="number" value={editValue.bag_price}
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-w-0 p-[7px] w-full"
            onChange={(e) => setEditValue((v) => ({ ...v, bag_price: e.target.value }))}
          />
          <button
            type="button"
            className="inline-flex items-center justify-center bg-[var(--accent-primary)] border-0 rounded-md text-[#071107] h-8 w-[34px] p-0"
            onClick={onSave}
            aria-label="Save bag details"
          >
            <Check size={15} aria-hidden="true" />
          </button>
          <small className="col-span-full text-[var(--text-muted)] text-[11px]">
            {formatMoney(bagWeight > 0 ? bagPrice / bagWeight : 0)}/lb
          </small>
        </div>
      ) : (
        <strong className="text-[var(--text-primary)] break-words" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          {formatNumber(feed.bag_weight || 0)} {feed.unit} @ {formatMoney(feed.bag_price || 0)}
        </strong>
      )}
    </div>
  );
}

function TransactionHistory({ rows, unit }) {
  return (
    <div className="border border-[rgba(46,125,50,0.65)] rounded-lg overflow-x-auto">
      <table className="border-collapse w-full" style={{ minWidth: "620px" }}>
        <thead>
          <tr>
            {["Date", "Type", "Qty Change", "Running Balance", "Notes"].map((h) => (
              <th
                key={h}
                className="border-b border-[rgba(46,125,50,0.55)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-xs p-2.5 text-left"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-2.5">{row.date}</td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-2.5">
                  <span
                    className={`inline-flex rounded-full text-[11px] font-bold px-[7px] py-[3px] uppercase ${
                      row.transaction_type === "purchase"
                        ? "bg-[rgba(76,175,80,0.16)] text-[var(--accent-primary)]"
                        : row.transaction_type === "feeding"
                        ? "bg-[rgba(66,165,245,0.16)] text-[#90caf9]"
                        : "bg-[rgba(255,143,0,0.16)] text-[var(--accent-warn)]"
                    }`}
                  >
                    {row.transaction_type}
                  </span>
                </td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-2.5">
                  {row.quantity_change > 0 ? "+" : ""}{formatNumber(row.quantity_change)} {unit}
                </td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-2.5">
                  {formatNumber(row.running_balance)} {unit}
                </td>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] text-xs p-2.5">
                  {row.notes || "-"}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5" className="p-2.5 text-xs text-[var(--text-muted)]">No transactions recorded.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PurchaseModal({ feed, onClose, onSubmit }) {
  const [numBags, setNumBags]     = useState("1");
  const [bagWeight, setBagWeight] = useState(feed.bag_weight || 50);
  const [bagPrice, setBagPrice]   = useState(feed.bag_price || "");
  const [date, setDate]           = useState(todayString());
  const [supplier, setSupplier]   = useState("");

  const totalAdded = Number(numBags || 0) * Number(bagWeight || 0);
  const costPerLb  = Number(bagWeight || 0) > 0 ? Number(bagPrice || 0) / Number(bagWeight || 0) : 0;
  const totalCost  = Number(numBags || 0) * Number(bagPrice || 0);

  function submit(event) {
    event.preventDefault();
    onSubmit({
      feed_type_id: feed.id,
      num_bags: Number(numBags),
      bag_weight: Number(bagWeight),
      bag_price: Number(bagPrice),
      date,
      supplier: supplier || null,
    });
  }

  return (
    <ModalFrame title={`Purchase ${feed.name}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="field">How many bags?<input min="0" required step="1" type="number" value={numBags} onChange={(e) => setNumBags(e.target.value)} /></label>
        <label className="field">Bag weight ({feed.unit})<input min="0" required step="0.01" type="number" value={bagWeight} onChange={(e) => setBagWeight(e.target.value)} /></label>
        <label className="field">Bag price<input min="0" required step="0.01" type="number" value={bagPrice} onChange={(e) => setBagPrice(e.target.value)} /></label>
        <label className="field">Date<input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">Supplier<input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></label>
        <div className="bg-[var(--bg-base)] border border-[rgba(46,125,50,0.65)] rounded-lg grid gap-1.5 p-2.5">
          <span className="text-[var(--text-muted)] text-xs">Total added: {formatNumber(totalAdded)} {feed.unit}</span>
          <span className="text-[var(--text-muted)] text-xs">Cost per lb: {formatMoney(costPerLb)}</span>
          <span className="text-[var(--text-muted)] text-xs">Total cost: {formatMoney(totalCost)}</span>
        </div>
        <button className="primary-button full-width" type="submit">Save Purchase</button>
      </form>
    </ModalFrame>
  );
}

function AdjustmentModal({ feed, onClose, onSubmit }) {
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason]                 = useState("");
  const [date, setDate]                     = useState(todayString());

  function submit(event) {
    event.preventDefault();
    onSubmit({ feed_type_id: feed.id, quantity_change: Number(quantityChange), reason, date });
  }

  return (
    <ModalFrame title={`Adjust ${feed.name}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <div className="warn-banner">This directly modifies your on-hand balance</div>
        <label className="field">
          Quantity change (+/-)
          <input required step="0.01" type="number" value={quantityChange} onChange={(e) => setQuantityChange(e.target.value)} />
        </label>
        <label className="field">
          Reason
          <textarea required value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[96px] resize-y" />
        </label>
        <label className="field">Date<input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <button className="primary-button full-width" type="submit">Save Adjustment</button>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({ children, onClose, title }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-[0_24px_80px_rgba(0,0,0,0.45)] p-[18px] w-full max-w-[460px] max-h-[calc(100vh-40px)] overflow-auto"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between gap-3 mb-4">
          <h2 className="display-font text-2xl leading-none m-0">{title}</h2>
          <button
            className="icon-button h-[34px] w-[34px] p-0"
            type="button"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default Inventory;
