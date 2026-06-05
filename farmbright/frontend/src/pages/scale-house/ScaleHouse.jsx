import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  CircleArrowDown,
  Trash2,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { FarmContext } from "../../context/FarmContext";
import {
  deleteEvent,
  getQueue,
  getQueueSummary,
  getScaleStatus,
  getTodayEvents,
  logSession,
  openScaleStream,
} from "../../services/scaleHouseApi";

const todayString = () => new Date().toISOString().slice(0, 10);

const moneyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});

const animalIcons = {
  cattle: "\u{1f404}",
  chicken: "\u{1f413}",
  duck: "\u{1f986}",
  goat: "\u{1f410}",
  pig: "\u{1f416}",
  swine: "\u{1f416}",
};

function formatMoney(value = 0) {
  return moneyFormatter.format(Number(value) || 0);
}

function formatNumber(value = 0, digits = 1) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function flockIcon(animalClassName = "") {
  const lower = animalClassName.toLowerCase();
  const match = Object.keys(animalIcons).find((key) => lower.includes(key));
  return match ? animalIcons[match] : "\u{1f43e}";
}

function safeId(value) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}

function ScaleHouse() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "quick";
  const isDailyMode = mode === "daily";
  const navigate = useNavigate();
  const { userId } = useContext(FarmContext);

  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [done, setDone] = useState(false);
  const [quickFlockId, setQuickFlockId] = useState("");

  const [headcountChange, setHeadcountChange] = useState(0);
  const [casualtyNotes, setCasualtyNotes] = useState("");
  const [selectedFeed, setSelectedFeed] = useState("");
  const [feedWeight, setFeedWeight] = useState("");
  const [inputMethod, setInputMethod] = useState("manual");
  const [eggCount, setEggCount] = useState("");
  const [waterConsumed, setWaterConsumed] = useState("");
  const [productionSkipped, setProductionSkipped] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionDate, setSessionDate] = useState(todayString());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [scaleWeight, setScaleWeight] = useState(0);
  const [scaleStable, setScaleStable] = useState(false);
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleLive, setScaleLive] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);

  const [eventsData, setEventsData] = useState({ events: [], totals: {}, breakdown: [] });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);

  const currentFlock = isDailyMode
    ? queue[currentIndex] || null
    : queue.find((flock) => flock.flock_id === Number(quickFlockId)) || queue[0] || null;
  const currentFeed = currentFlock?.assigned_feeds?.find((feed) => feed.feed_type_id === Number(selectedFeed));
  const effectiveWeight = Number(feedWeight) || 0;
  const adjustedHeadcount = Math.max((currentFlock?.current_headcount || 0) + headcountChange, 0);
  const weightPerBird = adjustedHeadcount ? effectiveWeight / adjustedHeadcount : 0;
  const costTotal = currentFeed ? effectiveWeight * (currentFeed.cost_per_lb ?? currentFeed.cost_per_unit ?? 0) : 0;
  const costPerBird = adjustedHeadcount ? costTotal / adjustedHeadcount : 0;
  const canLog = currentFlock && currentFeed && effectiveWeight > 0 && (headcountChange >= 0 || casualtyNotes.trim());
  const showProduction = currentFlock && ["layer", "breeder"].includes(currentFlock.designation) && !productionSkipped;
  const isBackdated = sessionDate !== todayString();

  const completedPercent = queue.length ? Math.round((completed.length / queue.length) * 100) : 0;

  const refreshQueue = useCallback(async () => {
    if (!userId) {
      return [];
    }

    const nextQueue = await getQueue(userId);
    setQueue(nextQueue);
    if (!quickFlockId && nextQueue[0]) {
      setQuickFlockId(String(nextQueue[0].flock_id));
    }

    if (isDailyMode) {
      const fedIds = nextQueue.filter((flock) => flock.fed_today).map((flock) => flock.flock_id);
      setCompleted(fedIds);
      const nextIndex = nextQueue.findIndex((flock) => !fedIds.includes(flock.flock_id));
      setCurrentIndex(nextIndex >= 0 ? nextIndex : 0);
      setDone(Boolean(nextQueue.length) && nextIndex < 0);
    }

    return nextQueue;
  }, [isDailyMode, quickFlockId, userId]);

  const refreshEvents = useCallback(async () => {
    if (!userId) {
      return;
    }

    const [events, nextSummary] = await Promise.all([getTodayEvents(userId), getQueueSummary(userId)]);
    setEventsData(events);
    setSummary(nextSummary);
  }, [userId]);

  useEffect(() => {
    let eventSource;
    let mounted = true;

    async function boot() {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        await Promise.all([refreshQueue(), refreshEvents()]);
        const status = await getScaleStatus();
        if (!mounted) {
          return;
        }
        setScaleConnected(status.connected);
        if (status.connected) {
          eventSource = openScaleStream(
            (reading) => {
              setScaleLive(true);
              setScaleConnected(reading.connected);
              setScaleWeight(reading.weight_lbs);
              setScaleStable(reading.stable);
            },
            () => {
              setScaleLive(false);
              setScaleStable(false);
            },
          );
        }
        setError("");
      } catch (requestError) {
        setError(requestError.response?.data?.message || "Scale House could not be loaded.");
      } finally {
        setLoading(false);
      }
    }

    boot();

    return () => {
      mounted = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [refreshEvents, refreshQueue, userId]);

  useEffect(() => {
    if (!currentFlock?.assigned_feeds?.length) {
      setSelectedFeed("");
      return;
    }

    const stillAssigned = currentFlock.assigned_feeds.some((feed) => feed.feed_type_id === Number(selectedFeed));
    if (!stillAssigned) {
      setSelectedFeed(String(currentFlock.assigned_feeds[0].feed_type_id));
    }
  }, [currentFlock, selectedFeed]);

  useEffect(() => {
    if (inputMethod === "scale" && autoCapture && scaleStable && scaleWeight > 0) {
      setFeedWeight(scaleWeight.toFixed(2));
    }
  }, [autoCapture, inputMethod, scaleStable, scaleWeight]);

  function resetForm() {
    setHeadcountChange(0);
    setCasualtyNotes("");
    setFeedWeight("");
    setInputMethod("manual");
    setEggCount("");
    setWaterConsumed("");
    setProductionSkipped(false);
    setSessionNotes("");
  }

  function handleSkip() {
    const flock = queue[currentIndex];
    if (!flock) {
      setDone(true);
      return;
    }

    const nextSkipped = [...new Set([...skipped, flock.flock_id])];
    setSkipped(nextSkipped);
    setQueue((previous) => {
      const next = previous.filter((item) => item.flock_id !== flock.flock_id);
      next.push(flock);
      const hasFeedableFlock = next.some(
        (item) => !completed.includes(item.flock_id) && !nextSkipped.includes(item.flock_id),
      );
      if (!hasFeedableFlock) {
        setDone(true);
      }
      return next;
    });
    resetForm();
  }

  async function handleSubmit() {
    if (!canLog) {
      setError("Choose a flock, feed, and weight before saving.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await logSession({
        user_id: userId,
        flock_id: currentFlock.flock_id,
        date: sessionDate,
        headcount_change: headcountChange,
        casualty_notes: casualtyNotes || null,
        feeding: {
          feed_type_id: safeId(selectedFeed),
          total_weight: effectiveWeight,
          input_method: inputMethod,
        },
        production: productionSkipped
          ? { egg_count: null, water_consumed: null, notes: sessionNotes || null }
          : {
              egg_count: safeId(eggCount),
              water_consumed: waterConsumed === "" ? null : Number(waterConsumed),
              notes: sessionNotes || null,
            },
      });

      setFlash(true);
      window.setTimeout(() => setFlash(false), 600);
      resetForm();
      await Promise.all([refreshQueue(), refreshEvents()]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Session could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!window.confirm("Delete this feeding event?")) {
      return;
    }

    await deleteEvent(eventId);
    await Promise.all([refreshQueue(), refreshEvents()]);
  }

  const completionBreakdown = useMemo(() => eventsData.breakdown || [], [eventsData.breakdown]);

  if (loading) {
    return <section className="panel-card">Loading Scale House...</section>;
  }

  if (done && isDailyMode) {
    return (
      <section className="scale-house-page">
        <div className="scale-complete-screen">
          <h1 className="display-font">All done for today {"\u2713"}</h1>
          <p>Completed at {formatTime(new Date().toISOString())}</p>
          <div className="scale-summary-grid">
            <SummaryTile label="Flocks Logged" value={summary?.flocks_fed || completed.length} />
            <SummaryTile label="Feed Used" value={`${formatNumber(summary?.total_feed_used_lbs)} lbs`} />
            <SummaryTile label="Total Cost" value={formatMoney(summary?.total_feed_cost)} />
            <SummaryTile label="Total Eggs" value={summary?.total_eggs || 0} />
            <SummaryTile label="Cost/Bird" value={formatMoney(summary?.cost_per_bird)} />
            <SummaryTile label="Casualties" value={summary?.casualties || 0} />
          </div>
          <div className="scale-breakdown-table">
            <table>
              <thead>
                <tr>
                  <th>Flock</th>
                  <th>Feed Used</th>
                  <th>Cost</th>
                  <th>Eggs</th>
                  <th>Final Count</th>
                </tr>
              </thead>
              <tbody>
                {completionBreakdown.map((row) => (
                  <tr key={row.flock_id}>
                    <td>{row.flock_name}</td>
                    <td>{formatNumber(row.feed_used_lbs)} lbs</td>
                    <td>{formatMoney(row.cost)}</td>
                    <td>{row.eggs}</td>
                    <td>{row.final_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="scale-complete-actions">
            <button className="primary-button" type="button" onClick={() => navigate("/dashboard")}>
              {"\u2190"} Back to Dashboard
            </button>
            <button className="secondary-button" type="button" onClick={() => navigate("/export")}>
              Export Today's Report
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`scale-house-page ${flash ? "scale-flash" : ""}`}>
      {isDailyMode ? (
        <DailyProgress
          completed={completed}
          currentFlockId={currentFlock?.flock_id}
          percent={completedPercent}
          queue={queue}
          skipped={skipped}
        />
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}

      <div className={`scale-house-main ${isDailyMode ? "daily" : "quick"}`}>
        <ScaleEntryCard
          adjustedHeadcount={adjustedHeadcount}
          autoCapture={autoCapture}
          casualtyNotes={casualtyNotes}
          costPerBird={costPerBird}
          costTotal={costTotal}
          currentFeed={currentFeed}
          currentFlock={currentFlock}
          effectiveWeight={effectiveWeight}
          eggCount={eggCount}
          feedWeight={feedWeight}
          headcountChange={headcountChange}
          inputMethod={inputMethod}
          isBackdated={isBackdated}
          isDailyMode={isDailyMode}
          mode={mode}
          productionSkipped={productionSkipped}
          queue={queue}
          quickFlockId={quickFlockId}
          saving={saving}
          scaleConnected={scaleConnected}
          scaleLive={scaleLive}
          scaleStable={scaleStable}
          scaleWeight={scaleWeight}
          selectedFeed={selectedFeed}
          sessionDate={sessionDate}
          sessionNotes={sessionNotes}
          setAutoCapture={setAutoCapture}
          setCasualtyNotes={setCasualtyNotes}
          setEggCount={setEggCount}
          setFeedWeight={setFeedWeight}
          setHeadcountChange={setHeadcountChange}
          setInputMethod={setInputMethod}
          setProductionSkipped={setProductionSkipped}
          setQuickFlockId={setQuickFlockId}
          setSelectedFeed={setSelectedFeed}
          setSessionDate={setSessionDate}
          setSessionNotes={setSessionNotes}
          setShowDatePicker={setShowDatePicker}
          setWaterConsumed={setWaterConsumed}
          showDatePicker={showDatePicker}
          showProduction={showProduction}
          stepLabel={isDailyMode ? `Step ${currentIndex + 1} of ${queue.length}` : "Quick Entry"}
          waterConsumed={waterConsumed}
          weightPerBird={weightPerBird}
          onQuickSubmit={handleSubmit}
          canLog={canLog}
        />

        <TodayLogPanel eventsData={eventsData} onDelete={handleDeleteEvent} />
      </div>

      {isDailyMode ? (
        <div className="scale-bottom-nav">
          <button className="secondary-button" type="button" onClick={handleSkip}>
            Skip - feed later
          </button>
          <button className="primary-button" type="button" disabled={!canLog || saving} onClick={handleSubmit}>
            {saving ? "Saving..." : "Complete & Next \u2192"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SummaryTile({ label, value }) {
  return (
    <article>
      <strong className="number-font">{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function DailyProgress({ completed, currentFlockId, percent, queue, skipped }) {
  return (
    <section className="scale-progress-panel">
      <div className="scale-progress-label">
        {completed.length} of {queue.length} flocks fed today
      </div>
      <div className="scale-progress-track">
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="scale-flock-chips">
        {queue.map((flock) => {
          const isComplete = completed.includes(flock.flock_id);
          const isCurrent = flock.flock_id === currentFlockId;
          const isSkipped = skipped.includes(flock.flock_id);
          return (
            <span
              className={`scale-flock-chip${isComplete ? " complete" : ""}${isCurrent ? " current" : ""}${
                isSkipped ? " skipped" : ""
              }`}
              key={flock.flock_id}
            >
              {isComplete ? <Check size={14} /> : isSkipped ? <CircleArrowDown size={14} /> : <Circle size={14} />}
              {flock.name}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function ScaleEntryCard(props) {
  const {
    adjustedHeadcount,
    autoCapture,
    casualtyNotes,
    canLog,
    costPerBird,
    costTotal,
    currentFeed,
    currentFlock,
    effectiveWeight,
    eggCount,
    feedWeight,
    headcountChange,
    inputMethod,
    isBackdated,
    isDailyMode,
    productionSkipped,
    queue,
    quickFlockId,
    saving,
    scaleConnected,
    scaleLive,
    scaleStable,
    scaleWeight,
    selectedFeed,
    sessionDate,
    sessionNotes,
    setAutoCapture,
    setCasualtyNotes,
    setEggCount,
    setFeedWeight,
    setHeadcountChange,
    setInputMethod,
    setProductionSkipped,
    setQuickFlockId,
    setSelectedFeed,
    setSessionDate,
    setSessionNotes,
    setShowDatePicker,
    setWaterConsumed,
    showDatePicker,
    showProduction,
    stepLabel,
    waterConsumed,
    weightPerBird,
    onQuickSubmit,
  } = props;

  if (!currentFlock) {
    return <section className="scale-entry-card">No flocks are ready for Scale House.</section>;
  }

  return (
    <section className="scale-entry-card">
      <div className="scale-date-row">
        <button className="scale-link-button" type="button" onClick={() => setShowDatePicker((value) => !value)}>
          Logging for a different date?
        </button>
        {showDatePicker ? (
          <input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} />
        ) : null}
      </div>

      {isBackdated ? (
        <div className="warn-banner">
          <AlertTriangle size={16} aria-hidden="true" />
          Logging for {new Date(`${sessionDate}T00:00:00`).toLocaleDateString()}
        </div>
      ) : null}

      {!isDailyMode ? (
        <label className="field">
          <span>Flock</span>
          <select value={quickFlockId || currentFlock.flock_id} onChange={(event) => setQuickFlockId(event.target.value)}>
            {queue.map((flock) => (
              <option key={flock.flock_id} value={flock.flock_id}>
                {flock.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <header className="scale-flock-header">
        <div className="scale-animal-icon">{flockIcon(currentFlock.animal_class_name)}</div>
        <div>
          <h1 className="display-font">{currentFlock.name}</h1>
          <p>
            {currentFlock.breed_name}
            {currentFlock.pen_name ? ` / ${currentFlock.pen_name}` : ""}
          </p>
        </div>
        <div className="scale-header-meta">
          <span className={`scale-designation-badge ${currentFlock.designation}`}>{currentFlock.designation}</span>
          <span>{stepLabel}</span>
        </div>
      </header>

      <ScaleSection title="Headcount Check">
        <p className="scale-muted">Last recorded: {currentFlock.current_headcount} birds</p>
        <div className="headcount-stepper">
          <button type="button" onClick={() => setHeadcountChange((value) => value - 1)}>
            -
          </button>
          <span className="number-font">{headcountChange}</span>
          <button type="button" onClick={() => setHeadcountChange((value) => value + 1)}>
            +
          </button>
        </div>
        {headcountChange < 0 ? (
          <div className="headcount-note danger">
            <strong>{headcountChange} casualties</strong>
            <textarea
              maxLength={500}
              placeholder="Casualty notes required..."
              value={casualtyNotes}
              onChange={(event) => setCasualtyNotes(event.target.value)}
            />
          </div>
        ) : headcountChange > 0 ? (
          <div className="headcount-note success">
            <strong>+{headcountChange} additions</strong>
            <textarea
              maxLength={500}
              placeholder="Addition notes..."
              value={casualtyNotes}
              onChange={(event) => setCasualtyNotes(event.target.value)}
            />
          </div>
        ) : (
          <p className="scale-muted">{"\u2713"} No changes</p>
        )}
      </ScaleSection>

      <ScaleSection title="Feed">
        <div className="feed-pill-row">
          {currentFlock.assigned_feeds?.length ? (
            currentFlock.assigned_feeds.map((feed) => (
              <button
                className={Number(selectedFeed) === feed.feed_type_id ? "selected" : ""}
                key={feed.feed_type_id}
                type="button"
                onClick={() => setSelectedFeed(String(feed.feed_type_id))}
              >
                {feed.name}
              </button>
            ))
          ) : (
            <span className="scale-muted">No feed assigned.</span>
          )}
        </div>

        <div className="scale-method-toggle">
          <button className={inputMethod === "manual" ? "selected" : ""} type="button" onClick={() => setInputMethod("manual")}>
            MANUAL
          </button>
          <button className={inputMethod === "scale" ? "selected" : ""} type="button" onClick={() => setInputMethod("scale")}>
            SCALE
          </button>
        </div>

        {inputMethod === "manual" ? (
          <label className="manual-weight-input">
            <input
              min="0"
              step="0.01"
              type="number"
              value={feedWeight}
              onChange={(event) => setFeedWeight(event.target.value)}
            />
            <span>lbs</span>
          </label>
        ) : (
          <div className="scale-live-panel">
            <div className="scale-status-line">
              <span className={`scale-status-dot ${scaleConnected ? "connected" : ""}`} />
              {scaleConnected ? "Dymo S400 Live" : "Scale Not Detected"}
              {scaleStable ? <span className="scale-stable-badge">STABLE</span> : null}
              {scaleLive ? <span className="scale-live-badge">LIVE</span> : null}
            </div>
            <div className="number-font scale-weight-display">
              {formatNumber(scaleWeight, 2)} <span>lbs</span>
            </div>
            <label className="scale-toggle">
              <input
                checked={autoCapture}
                type="checkbox"
                onChange={(event) => setAutoCapture(event.target.checked)}
              />
              Auto-capture first stable reading
            </label>
            <label className="manual-override-input">
              Manual override
              <input
                min="0"
                step="0.01"
                type="number"
                value={feedWeight}
                onChange={(event) => setFeedWeight(event.target.value)}
              />
            </label>
          </div>
        )}

        <div className="computed-chip-row">
          <span>{formatNumber(weightPerBird, 2)} lbs/bird</span>
          <span>{formatMoney(costTotal)} total</span>
          <span>{formatMoney(costPerBird)}/bird</span>
        </div>
        <p className="scale-muted">
          Feed remaining: {currentFeed ? `${formatNumber(currentFeed.current_on_hand)} ${currentFeed.unit}` : "Select feed"}
        </p>
      </ScaleSection>

      {showProduction ? (
        <ScaleSection title="Production">
          <div className="egg-stepper">
            <button type="button" onClick={() => setEggCount(Math.max(Number(eggCount || 0) - 1, 0))}>
              -
            </button>
            <span className="number-font">{eggCount || 0}</span>
            <button type="button" onClick={() => setEggCount(Number(eggCount || 0) + 1)}>
              +
            </button>
          </div>
          <label className="field scale-water-field">
            <span>Water</span>
            <input
              min="0"
              step="0.1"
              type="number"
              value={waterConsumed}
              onChange={(event) => setWaterConsumed(event.target.value)}
            />
            <small>gal</small>
          </label>
          <button className="scale-link-button" type="button" onClick={() => setProductionSkipped(true)}>
            Skip production data {"\u2192"}
          </button>
        </ScaleSection>
      ) : null}

      <ScaleSection title="Notes">
        <textarea
          className="scale-session-notes"
          maxLength={500}
          placeholder="Behavior, condition, anything unusual..."
          value={sessionNotes}
          onChange={(event) => setSessionNotes(event.target.value)}
        />
        <span className={`notes-count ${sessionNotes.length >= 400 ? "warn" : ""}`}>{sessionNotes.length}/500</span>
      </ScaleSection>

      {!isDailyMode ? (
        <button className="primary-button scale-submit-button" disabled={!canLog || saving} type="button" onClick={onQuickSubmit}>
          {saving ? "Logging..." : "Log Feeding"}
        </button>
      ) : null}
    </section>
  );
}

function ScaleSection({ children, title }) {
  return (
    <section className="scale-form-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function TodayLogPanel({ eventsData, onDelete }) {
  const events = eventsData.events || [];
  const totals = eventsData.totals || {};

  return (
    <aside className="today-log-panel">
      <header>
        <h2 className="display-font">Today's Log</h2>
        <p>
          {formatNumber(totals.total_weight_today || 0)} lbs {"\u00b7"} {formatMoney(totals.total_cost_today || 0)}{" "}
          {"\u00b7"} {totals.event_count || 0} events
        </p>
      </header>

      <div className="today-log-table-wrap">
        <table className="today-log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Flock</th>
              <th>Feed</th>
              <th>Weight</th>
              <th>Wt/Bird</th>
              <th>Cost</th>
              <th>$/Bird</th>
              <th>Method</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {events.length ? (
              events.map((event) => (
                <tr key={event.id}>
                  <td>{formatTime(event.timestamp)}</td>
                  <td>{event.flock_name}</td>
                  <td>{event.feed_name}</td>
                  <td>{formatNumber(event.total_weight)} lbs</td>
                  <td>{formatNumber(event.weight_per_bird, 2)}</td>
                  <td>{formatMoney(event.cost_total)}</td>
                  <td>{formatMoney(event.cost_per_bird)}</td>
                  <td>
                    <span className={`method-badge ${event.input_method}`}>{event.input_method}</span>
                  </td>
                  <td>
                    <button className="delete-event-button" type="button" onClick={() => onDelete(event.id)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9">No feedings logged today</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="3">Totals</td>
              <td>{formatNumber(totals.total_weight_today || 0)} lbs</td>
              <td />
              <td>{formatMoney(totals.total_cost_today || 0)}</td>
              <td colSpan="3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </aside>
  );
}

export default ScaleHouse;
