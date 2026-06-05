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

const moneyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});

function formatMoney(value = 0) {
  return moneyFormatter.format(Number(value) || 0);
}

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
  const [feeds, setFeeds] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [transactions, setTransactions] = useState({});
  const [expandedFeedId, setExpandedFeedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const alertFeeds = useMemo(
    () => alerts.filter((alert) => Number(alert.current_on_hand) <= Number(alert.par_level)),
    [alerts],
  );

  async function refreshInventory() {
    if (!userId) {
      setLoading(false);
      return;
    }

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

  useEffect(() => {
    refreshInventory();
  }, [userId]);

  async function loadTransactions(feedId) {
    if (expandedFeedId === feedId) {
      setExpandedFeedId(null);
      return;
    }

    const rows = await getFeedTransactions(feedId);
    setTransactions((previous) => ({ ...previous, [feedId]: rows }));
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
    if (!editing) {
      return;
    }

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

  if (loading) {
    return <section className="panel-card">Loading inventory...</section>;
  }

  return (
    <section className="inventory-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Feed ledger</p>
          <h1 className="display-font">Inventory</h1>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      {alertFeeds.length ? (
        <section className="inventory-alert-banner">
          <AlertTriangle size={22} aria-hidden="true" />
          <div>
            <strong>Feed at or below par</strong>
            <div className="inventory-alert-list">
              {alertFeeds.map((alert) => (
                <div key={alert.alert_id}>
                  <span>
                    {alert.feed_name}: {formatNumber(alert.current_on_hand)} {alert.unit} remaining
                  </span>
                  <button type="button" onClick={() => dismissAlert(alert.alert_id)} aria-label={`Dismiss ${alert.feed_name}`}>
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="inventory-grid">
        {feeds.map((feed) => (
          <article className="inventory-card" key={feed.id}>
            <header className="inventory-card-header">
              <div>
                <h2>{feed.name}</h2>
                <span className="unit-badge">{feed.unit}</span>
              </div>
              <span className={`inventory-status ${feed.status}`}>
                <span />
                {statusLabel(feed.status)}
              </span>
            </header>

            <StockMeter feed={feed} />

            <div className="inventory-stat-row">
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

            <footer className="inventory-card-actions">
              <button type="button" onClick={() => setModal({ type: "purchase", feed })}>
                <PackagePlus size={16} aria-hidden="true" />
                Purchase
              </button>
              <button type="button" onClick={() => loadTransactions(feed.id)}>
                <History size={16} aria-hidden="true" />
                History
              </button>
              <button type="button" onClick={() => setModal({ type: "adjustment", feed })}>
                <SlidersHorizontal size={16} aria-hidden="true" />
                Adjust
              </button>
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
  const parPercent = Math.min(100, Math.max(0, (feed.par_level / denominator) * 100));

  return (
    <div className="stock-meter">
      <div className="stock-meter-track">
        <span className={`stock-meter-fill ${feed.status}`} style={{ width: `${fillPercent}%` }} />
        <span className="stock-par-tick" style={{ left: `${parPercent}%` }} />
      </div>
      <div className="stock-meter-labels">
        <span>0</span>
        <span style={{ left: `${parPercent}%` }}>Par {formatNumber(feed.par_level)}</span>
        <span>{formatNumber(denominator)}</span>
      </div>
    </div>
  );
}

function InventoryStat({ label, value }) {
  return (
    <div className="inventory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EditableStat({ editing, editValue, feed, field, label, onBeginEdit, onSave, setEditValue, value }) {
  const isEditing = editing?.feedId === feed.id && editing?.field === field;

  return (
    <div className="inventory-stat editable" onClick={() => !isEditing && onBeginEdit(feed, field)}>
      <span>{label}</span>
      {isEditing ? (
        <div className="inline-stat-edit">
          <input
            autoFocus
            min="0"
            step="0.01"
            type="number"
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            onClick={(event) => event.stopPropagation()}
          />
          <button type="button" onClick={onSave} aria-label={`Save ${label}`}>
            <Check size={15} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <strong>{value}</strong>
      )}
    </div>
  );
}

function EditableBagStat({ editing, editValue, feed, onBeginEdit, onSave, setEditValue }) {
  const isEditing = editing?.feedId === feed.id && editing?.field === "bag";
  const bagWeight = isEditing ? Number(editValue.bag_weight || 0) : Number(feed.bag_weight || 0);
  const bagPrice = isEditing ? Number(editValue.bag_price || 0) : Number(feed.bag_price || 0);

  return (
    <div className="inventory-stat editable" onClick={() => !isEditing && onBeginEdit(feed, "bag")}>
      <span>Bag Size</span>
      {isEditing ? (
        <div className="inline-bag-edit" onClick={(event) => event.stopPropagation()}>
          <input
            min="0"
            step="0.01"
            type="number"
            value={editValue.bag_weight}
            onChange={(event) => setEditValue((value) => ({ ...value, bag_weight: event.target.value }))}
          />
          <input
            min="0"
            step="0.01"
            type="number"
            value={editValue.bag_price}
            onChange={(event) => setEditValue((value) => ({ ...value, bag_price: event.target.value }))}
          />
          <button type="button" onClick={onSave} aria-label="Save bag details">
            <Check size={15} aria-hidden="true" />
          </button>
          <small>{formatMoney(bagWeight > 0 ? bagPrice / bagWeight : 0)}/lb</small>
        </div>
      ) : (
        <strong>
          {formatNumber(feed.bag_weight || 0)} {feed.unit} @ {formatMoney(feed.bag_price || 0)}
        </strong>
      )}
    </div>
  );
}

function TransactionHistory({ rows, unit }) {
  return (
    <div className="transaction-history">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Qty Change</th>
            <th>Running Balance</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>
                  <span className={`transaction-badge ${row.transaction_type}`}>{row.transaction_type}</span>
                </td>
                <td>
                  {row.quantity_change > 0 ? "+" : ""}
                  {formatNumber(row.quantity_change)} {unit}
                </td>
                <td>
                  {formatNumber(row.running_balance)} {unit}
                </td>
                <td>{row.notes || "-"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5">No transactions recorded.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PurchaseModal({ feed, onClose, onSubmit }) {
  const [numBags, setNumBags] = useState("1");
  const [bagWeight, setBagWeight] = useState(feed.bag_weight || 50);
  const [bagPrice, setBagPrice] = useState(feed.bag_price || "");
  const [date, setDate] = useState(todayString());
  const [supplier, setSupplier] = useState("");
  const totalAdded = Number(numBags || 0) * Number(bagWeight || 0);
  const costPerLb = Number(bagWeight || 0) > 0 ? Number(bagPrice || 0) / Number(bagWeight || 0) : 0;
  const totalCost = Number(numBags || 0) * Number(bagPrice || 0);

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
      <form className="inventory-modal-form" onSubmit={submit}>
        <label>
          How many bags?
          <input min="0" required step="1" type="number" value={numBags} onChange={(event) => setNumBags(event.target.value)} />
        </label>
        <label>
          Bag weight ({feed.unit})
          <input min="0" required step="0.01" type="number" value={bagWeight} onChange={(event) => setBagWeight(event.target.value)} />
        </label>
        <label>
          Bag price
          <input min="0" required step="0.01" type="number" value={bagPrice} onChange={(event) => setBagPrice(event.target.value)} />
        </label>
        <label>
          Date
          <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          Supplier
          <input value={supplier} onChange={(event) => setSupplier(event.target.value)} />
        </label>
        <div className="purchase-computed">
          <span>Total added to inventory: {formatNumber(totalAdded)} {feed.unit}</span>
          <span>Cost per lb: {formatMoney(costPerLb)}</span>
          <span>Total purchase cost: {formatMoney(totalCost)}</span>
        </div>
        <button className="primary-button full-width" type="submit">
          Save Purchase
        </button>
      </form>
    </ModalFrame>
  );
}

function AdjustmentModal({ feed, onClose, onSubmit }) {
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayString());

  function submit(event) {
    event.preventDefault();
    onSubmit({
      feed_type_id: feed.id,
      quantity_change: Number(quantityChange),
      reason,
      date,
    });
  }

  return (
    <ModalFrame title={`Adjust ${feed.name}`} onClose={onClose}>
      <form className="inventory-modal-form" onSubmit={submit}>
        <div className="warn-banner">This directly modifies your on-hand balance</div>
        <label>
          Quantity change (+/-)
          <input required step="0.01" type="number" value={quantityChange} onChange={(event) => setQuantityChange(event.target.value)} />
        </label>
        <label>
          Reason
          <textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <label>
          Date
          <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button className="primary-button full-width" type="submit">
          Save Adjustment
        </button>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({ children, onClose, title }) {
  return (
    <div className="inventory-modal-backdrop" role="presentation">
      <div className="inventory-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2 className="display-font">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close modal">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default Inventory;
