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
      // scale-house-page: grid, gap-4, pb-20
      <section className="grid gap-4 pb-20">
        {/* scale-complete-screen: bg-surface border border-[--border] rounded-lg min-w-0 p-[18px] grid gap-[18px] */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-[18px] grid gap-[18px]">
          {/* scale-complete-screen h1: color accent-primary, font-size 40px, line-height 1, margin 0 */}
          <h1 className="display-font text-[var(--accent-primary)] text-[40px] leading-none m-0">All done for today {"✓"}</h1>
          <p className="text-[var(--text-muted)] m-0">Completed at {formatTime(new Date().toISOString())}</p>
          {/* scale-summary-grid: grid gap-3 grid-cols-6, responsive 1-col */}
          <div className="grid gap-3 grid-cols-6 max-[980px]:grid-cols-1">
            <SummaryTile label="Flocks Logged" value={summary?.flocks_fed || completed.length} />
            <SummaryTile label="Feed Used" value={`${formatNumber(summary?.total_feed_used_lbs)} lbs`} />
            <SummaryTile label="Total Cost" value={formatMoney(summary?.total_feed_cost)} />
            <SummaryTile label="Total Eggs" value={summary?.total_eggs || 0} />
            <SummaryTile label="Cost/Bird" value={formatMoney(summary?.cost_per_bird)} />
            <SummaryTile label="Casualties" value={summary?.casualties || 0} />
          </div>
          {/* scale-breakdown-table: overflow-x-auto */}
          <div className="overflow-x-auto">
            <table className="border-collapse w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-primary)] bg-[var(--bg-elevated)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left sticky top-0 z-[1]">Flock</th>
                  <th className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-primary)] bg-[var(--bg-elevated)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left sticky top-0 z-[1]">Feed Used</th>
                  <th className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-primary)] bg-[var(--bg-elevated)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left sticky top-0 z-[1]">Cost</th>
                  <th className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-primary)] bg-[var(--bg-elevated)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left sticky top-0 z-[1]">Eggs</th>
                  <th className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-primary)] bg-[var(--bg-elevated)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left sticky top-0 z-[1]">Final Count</th>
                </tr>
              </thead>
              <tbody>
                {completionBreakdown.map((row) => (
                  <tr key={row.flock_id}>
                    <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{row.flock_name}</td>
                    <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{formatNumber(row.feed_used_lbs)} lbs</td>
                    <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{formatMoney(row.cost)}</td>
                    <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{row.eggs}</td>
                    <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{row.final_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* scale-complete-actions: flex flex-wrap gap-[10px] */}
          <div className="flex flex-wrap gap-[10px]">
            <button className="primary-button" type="button" onClick={() => navigate("/dashboard")}>
              {"←"} Back to Dashboard
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
    // scale-house-page: grid gap-4 pb-20 (flash adds box-shadow on inner card via JS)
    <section className={`grid gap-4 pb-20${flash ? " [&_.scale-entry-inner]:shadow-[0_0_0_2px_rgba(76,175,80,0.45)]" : ""}`}>
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

      {/* scale-house-main: grid gap-4 items-start, two-col on wide, single-col on <=980px */}
      <div className="grid gap-4 items-start grid-cols-[minmax(0,1fr)_400px] max-[980px]:grid-cols-1">
        <ScaleEntryCard
          adjustedHeadcount={adjustedHeadcount}
          autoCapture={autoCapture}
          casualtyNotes={casualtyNotes}
          canLog={canLog}
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
          flash={flash}
        />

        <TodayLogPanel eventsData={eventsData} onDelete={handleDeleteEvent} />
      </div>

      {isDailyMode ? (
        // scale-bottom-nav: fixed bottom-0 left-[240px] right-0 z-[5] flex items-center justify-between gap-3 bg-[rgba(15,26,15,0.95)] border-t border-[--border] py-[14px] px-6
        // on <=980px: left-0 sticky
        <div className="fixed bottom-0 left-0 lg:left-[240px] right-0 z-[5] flex items-center justify-between gap-3 bg-[rgba(15,26,15,0.95)] border-t border-[var(--border)] py-[14px] px-6">
          <button className="secondary-button" type="button" onClick={handleSkip}>
            Skip - feed later
          </button>
          <button className="primary-button" type="button" disabled={!canLog || saving} onClick={handleSubmit}>
            {saving ? "Saving..." : "Complete & Next →"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SummaryTile({ label, value }) {
  // scale-summary-grid article: bg-[--bg-base] border border-[--border] rounded-lg grid gap-[7px] p-[14px]
  // strong: text-[--text-primary] text-[22px] overflow-wrap-anywhere
  // span: text-[--text-muted] text-xs
  return (
    <article className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg grid gap-[7px] p-[14px]">
      <strong className="number-font text-[var(--text-primary)] text-[22px] [overflow-wrap:anywhere]">{value}</strong>
      <span className="text-[var(--text-muted)] text-xs">{label}</span>
    </article>
  );
}

function DailyProgress({ completed, currentFlockId, percent, queue, skipped }) {
  return (
    // scale-progress-panel: bg-[--bg-surface] border border-[--border] rounded-lg grid gap-3 p-[14px]
    <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg grid gap-3 p-[14px]">
      {/* scale-progress-label: text-[--text-secondary] font-[IBM_Plex_Mono,monospace] text-xs */}
      <div className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs">
        {completed.length} of {queue.length} flocks fed today
      </div>
      {/* scale-progress-track: bg-[rgba(85,139,90,0.25)] rounded-full h-[10px] overflow-hidden */}
      <div className="bg-[rgba(85,139,90,0.25)] rounded-full h-[10px] overflow-hidden">
        {/* inner span: bg-[--accent-primary] block h-full transition-[width_0.3s_ease] */}
        <span className="bg-[var(--accent-primary)] block h-full transition-[width_0.3s_ease]" style={{ width: `${percent}%` }} />
      </div>
      {/* scale-flock-chips: flex gap-2 overflow-x-auto pb-[2px] */}
      <div className="flex gap-2 overflow-x-auto pb-[2px]">
        {queue.map((flock) => {
          const isComplete = completed.includes(flock.flock_id);
          const isCurrent = flock.flock_id === currentFlockId;
          const isSkipped = skipped.includes(flock.flock_id);
          // scale-flock-chip base: inline-flex items-center flex-none gap-[7px] min-h-[34px] px-3 py-[7px] rounded-full bg-[--bg-base] border border-[--border] text-[--text-muted]
          // .complete: bg-[rgba(76,175,80,0.16)] text-[--text-primary]
          // .current: [animation:pulse-ring_1.4s_infinite] text-[--text-primary] font-bold
          // .skipped: text-[--accent-warn]
          const chipClass = [
            "inline-flex items-center flex-none gap-[7px] min-h-[34px] px-3 py-[7px] rounded-full bg-[var(--bg-base)] border border-[var(--border)] text-[var(--text-muted)]",
            isComplete ? "bg-[rgba(76,175,80,0.16)] text-[var(--text-primary)]" : "",
            isCurrent ? "[animation:pulse-ring_1.4s_infinite] text-[var(--text-primary)] font-bold" : "",
            isSkipped ? "text-[var(--accent-warn)]" : "",
          ].filter(Boolean).join(" ");
          return (
            <span className={chipClass} key={flock.flock_id}>
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
    flash,
  } = props;

  // scale-entry-card base: bg-[--bg-surface] border border-[--border] rounded-lg min-w-0 p-[18px] grid gap-[18px]
  const cardClass = `scale-entry-inner bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-[18px] grid gap-[18px]${flash ? " shadow-[0_0_0_2px_rgba(76,175,80,0.45)]" : ""}`;

  if (!currentFlock) {
    return <section className={cardClass}>No flocks are ready for Scale House.</section>;
  }

  return (
    <section className={cardClass}>
      {/* scale-date-row: flex flex-wrap items-center justify-between gap-[10px] */}
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        {/* scale-link-button: bg-transparent border-0 text-[--text-secondary] p-0 text-left */}
        <button
          className="bg-transparent border-0 text-[var(--text-secondary)] p-0 text-left"
          type="button"
          onClick={() => setShowDatePicker((value) => !value)}
        >
          Logging for a different date?
        </button>
        {showDatePicker ? (
          // date input styled like scale-date-row input
          <input
            className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[36px] py-[7px] px-[10px]"
            type="date"
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
          />
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

      {/* scale-flock-header: grid gap-[14px] items-start grid-cols-[58px_minmax(0,1fr)_auto], <=980px: grid-cols-[48px_minmax(0,1fr)] */}
      <header className="grid gap-[14px] items-start grid-cols-[58px_minmax(0,1fr)_auto] max-[980px]:grid-cols-[48px_minmax(0,1fr)]">
        {/* scale-animal-icon: flex items-center justify-center bg-[--bg-base] border border-[--border] rounded-lg h-[58px] text-[30px] */}
        <div className="flex items-center justify-center bg-[var(--bg-base)] border border-[var(--border)] rounded-lg h-[58px] text-[30px]">
          {flockIcon(currentFlock.animal_class_name)}
        </div>
        <div>
          {/* scale-flock-header h1: text-[32px] leading-none m-0 */}
          <h1 className="display-font text-[32px] leading-none m-0">{currentFlock.name}</h1>
          {/* scale-flock-header p: text-[--text-secondary] font-[IBM_Plex_Mono,monospace] text-[13px] mt-2 m-0 */}
          <p className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-[13px] mt-2 m-0">
            {currentFlock.breed_name}
            {currentFlock.pen_name ? ` / ${currentFlock.pen_name}` : ""}
          </p>
        </div>
        {/* scale-header-meta: grid gap-2 items-end justify-items-end text-[--text-muted] font-[IBM_Plex_Mono,monospace] text-xs
            on <=980px: col-span-full justify-items-start */}
        <div className="grid gap-2 items-end justify-items-end text-[var(--text-muted)] font-[IBM_Plex_Mono,monospace] text-xs max-[980px]:col-span-full max-[980px]:justify-items-start">
          {/* scale-designation-badge: border border-[--border] rounded-full text-[--text-secondary] py-1 px-[9px] capitalize
              modifier colors handled inline */}
          <span className={[
            "border rounded-full py-1 px-[9px] capitalize",
            currentFlock.designation === "layer" ? "border-[#42a5f5] text-[#90caf9]" :
            currentFlock.designation === "breeder" ? "border-[#ab47bc] text-[#ce93d8]" :
            currentFlock.designation === "meat" ? "border-[var(--accent-warn)] text-[#ffcc80]" :
            "border-[var(--border)] text-[var(--text-secondary)]"
          ].join(" ")}>
            {currentFlock.designation}
          </span>
          <span>{stepLabel}</span>
        </div>
      </header>

      <ScaleSection title="Headcount Check">
        {/* scale-muted: text-[--text-muted] text-xs m-0 */}
        <p className="text-[var(--text-muted)] text-xs m-0">Last recorded: {currentFlock.current_headcount} birds</p>
        {/* headcount-stepper: flex items-center gap-3 */}
        <div className="flex items-center gap-3">
          {/* stepper buttons: inline-flex items-center justify-center bg-[--bg-elevated] border border-[--border] rounded-full text-[--text-secondary] h-10 w-10 p-0 hover:border-[--accent-primary] hover:text-[--text-primary] */}
          <button
            className="inline-flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] h-10 w-10 p-0 hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
            type="button"
            onClick={() => setHeadcountChange((value) => value - 1)}
          >
            -
          </button>
          {/* stepper span: text-[--text-primary] text-[28px] min-w-[54px] text-center */}
          <span className="number-font text-[var(--text-primary)] text-[28px] min-w-[54px] text-center">{headcountChange}</span>
          <button
            className="inline-flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] h-10 w-10 p-0 hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
            type="button"
            onClick={() => setHeadcountChange((value) => value + 1)}
          >
            +
          </button>
        </div>
        {headcountChange < 0 ? (
          // headcount-note danger: grid gap-2, strong color danger
          <div className="grid gap-2">
            <strong className="text-[var(--accent-danger)]">{headcountChange} casualties</strong>
            <textarea
              className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[92px] outline-none p-[10px] resize-y w-full"
              maxLength={500}
              placeholder="Casualty notes required..."
              value={casualtyNotes}
              onChange={(event) => setCasualtyNotes(event.target.value)}
            />
          </div>
        ) : headcountChange > 0 ? (
          // headcount-note success: grid gap-2, strong color primary
          <div className="grid gap-2">
            <strong className="text-[var(--accent-primary)]">+{headcountChange} additions</strong>
            <textarea
              className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[92px] outline-none p-[10px] resize-y w-full"
              maxLength={500}
              placeholder="Addition notes..."
              value={casualtyNotes}
              onChange={(event) => setCasualtyNotes(event.target.value)}
            />
          </div>
        ) : (
          <p className="text-[var(--text-muted)] text-xs m-0">{"✓"} No changes</p>
        )}
      </ScaleSection>

      <ScaleSection title="Feed">
        {/* feed-pill-row: flex flex-wrap gap-2 */}
        <div className="flex flex-wrap gap-2">
          {currentFlock.assigned_feeds?.length ? (
            currentFlock.assigned_feeds.map((feed) => (
              <button
                className={[
                  "bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[36px] px-3 py-2",
                  Number(selectedFeed) === feed.feed_type_id ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold" : "",
                ].join(" ")}
                key={feed.feed_type_id}
                type="button"
                onClick={() => setSelectedFeed(String(feed.feed_type_id))}
              >
                {feed.name}
              </button>
            ))
          ) : (
            <span className="text-[var(--text-muted)] text-xs m-0">No feed assigned.</span>
          )}
        </div>

        {/* scale-method-toggle: flex flex-wrap gap-2 */}
        <div className="flex flex-wrap gap-2">
          <button
            className={[
              "bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[36px] px-3 py-2",
              inputMethod === "manual" ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold" : "",
            ].join(" ")}
            type="button"
            onClick={() => setInputMethod("manual")}
          >
            MANUAL
          </button>
          <button
            className={[
              "bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[36px] px-3 py-2",
              inputMethod === "scale" ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold" : "",
            ].join(" ")}
            type="button"
            onClick={() => setInputMethod("scale")}
          >
            SCALE
          </button>
        </div>

        {inputMethod === "manual" ? (
          // manual-weight-input: flex items-baseline gap-3
          <label className="flex items-baseline gap-3">
            {/* input: bg-transparent border-0 border-b border-[--border] text-[--text-primary] font-[JetBrains_Mono,monospace] text-[36px] max-w-[220px] outline-none py-1 px-0 */}
            <input
              className="bg-transparent border-0 border-b border-[var(--border)] text-[var(--text-primary)] font-[JetBrains_Mono,monospace] text-[36px] max-w-[220px] outline-none py-1 px-0"
              min="0"
              step="0.01"
              type="number"
              value={feedWeight}
              onChange={(event) => setFeedWeight(event.target.value)}
            />
            <span className="text-[var(--text-muted)]">lbs</span>
          </label>
        ) : (
          // scale-live-panel: bg-[--bg-base] border border-[--border] rounded-lg grid gap-3 p-[14px]
          <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg grid gap-3 p-[14px]">
            {/* scale-status-line: flex flex-wrap items-center gap-2 text-[--text-secondary] text-xs */}
            <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)] text-xs">
              {/* scale-status-dot: inline-block rounded-full h-[10px] w-[10px] bg-[--text-muted]; connected adds animation + bg-[--accent-primary] */}
              <span
                className={[
                  "inline-block rounded-full h-[10px] w-[10px]",
                  scaleConnected
                    ? "bg-[var(--accent-primary)] [animation:pulse-ring_1.4s_infinite]"
                    : "bg-[var(--text-muted)]",
                ].join(" ")}
              />
              {scaleConnected ? "Dymo S400 Live" : "Scale Not Detected"}
              {scaleStable ? (
                // scale-stable-badge: rounded-full text-[11px] font-bold py-[3px] px-[7px] uppercase bg-[rgba(76,175,80,0.16)] text-[--accent-primary]
                <span className="rounded-full text-[11px] font-bold py-[3px] px-[7px] uppercase bg-[rgba(76,175,80,0.16)] text-[var(--accent-primary)]">STABLE</span>
              ) : null}
              {scaleLive ? (
                // scale-live-badge: rounded-full text-[11px] font-bold py-[3px] px-[7px] uppercase bg-[rgba(255,143,0,0.16)] text-[--accent-warn] + animation
                <span className="rounded-full text-[11px] font-bold py-[3px] px-[7px] uppercase bg-[rgba(255,143,0,0.16)] text-[var(--accent-warn)] [animation:pulse-ring_1.4s_infinite]">LIVE</span>
              ) : null}
            </div>
            {/* scale-weight-display: number-font text-[--text-primary] text-[48px] leading-none */}
            <div className="number-font text-[var(--text-primary)] text-[48px] leading-none">
              {formatNumber(scaleWeight, 2)} <span className="text-[var(--text-muted)] text-[16px]">lbs</span>
            </div>
            {/* scale-toggle: flex items-center text-[--text-secondary] text-xs gap-2 */}
            <label className="flex items-center text-[var(--text-secondary)] text-xs gap-2">
              <input
                checked={autoCapture}
                type="checkbox"
                onChange={(event) => setAutoCapture(event.target.checked)}
              />
              Auto-capture first stable reading
            </label>
            {/* manual-override-input: grid gap-2 text-[--text-secondary] text-xs */}
            <label className="grid gap-2 text-[var(--text-secondary)] text-xs">
              Manual override
              <input
                className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[38px] py-2 px-[10px]"
                min="0"
                step="0.01"
                type="number"
                value={feedWeight}
                onChange={(event) => setFeedWeight(event.target.value)}
              />
            </label>
          </div>
        )}

        {/* computed-chip-row: flex flex-wrap gap-2 */}
        <div className="flex flex-wrap gap-2">
          {/* each span: bg-[--bg-elevated] border border-[--border] rounded-full text-[--text-secondary] min-h-[36px] py-2 px-3 */}
          <span className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[36px] py-2 px-3">{formatNumber(weightPerBird, 2)} lbs/bird</span>
          <span className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[36px] py-2 px-3">{formatMoney(costTotal)} total</span>
          <span className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[36px] py-2 px-3">{formatMoney(costPerBird)}/bird</span>
        </div>
        <p className="text-[var(--text-muted)] text-xs m-0">
          Feed remaining: {currentFeed ? `${formatNumber(currentFeed.current_on_hand)} ${currentFeed.unit}` : "Select feed"}
        </p>
      </ScaleSection>

      {showProduction ? (
        <ScaleSection title="Production">
          {/* egg-stepper: flex items-center gap-3 */}
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] h-10 w-10 p-0 hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
              type="button"
              onClick={() => setEggCount(Math.max(Number(eggCount || 0) - 1, 0))}
            >
              -
            </button>
            <span className="number-font text-[var(--text-primary)] text-[28px] min-w-[54px] text-center">{eggCount || 0}</span>
            <button
              className="inline-flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] h-10 w-10 p-0 hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
              type="button"
              onClick={() => setEggCount(Number(eggCount || 0) + 1)}
            >
              +
            </button>
          </div>
          {/* field scale-water-field: field kept, max-w-[180px] added */}
          <label className="field" style={{ maxWidth: "180px" }}>
            <span>Water</span>
            <input
              min="0"
              step="0.1"
              type="number"
              value={waterConsumed}
              onChange={(event) => setWaterConsumed(event.target.value)}
            />
            <small className="text-[var(--text-muted)]">gal</small>
          </label>
          <button
            className="bg-transparent border-0 text-[var(--text-secondary)] p-0 text-left"
            type="button"
            onClick={() => setProductionSkipped(true)}
          >
            Skip production data {"→"}
          </button>
        </ScaleSection>
      ) : null}

      <ScaleSection title="Notes">
        <textarea
          className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[92px] outline-none p-[10px] resize-y w-full"
          maxLength={500}
          placeholder="Behavior, condition, anything unusual..."
          value={sessionNotes}
          onChange={(event) => setSessionNotes(event.target.value)}
        />
        {/* notes-count: text-[--text-muted] text-xs justify-self-end; warn variant: text-[--accent-warn] */}
        <span className={`text-xs justify-self-end ${sessionNotes.length >= 400 ? "text-[var(--accent-warn)]" : "text-[var(--text-muted)]"}`}>
          {sessionNotes.length}/500
        </span>
      </ScaleSection>

      {!isDailyMode ? (
        <button className="primary-button w-full" disabled={!canLog || saving} type="button" onClick={onQuickSubmit}>
          {saving ? "Logging..." : "Log Feeding"}
        </button>
      ) : null}
    </section>
  );
}

function ScaleSection({ children, title }) {
  // scale-form-section: border-t border-[rgba(46,125,50,0.55)] grid gap-3 pt-4
  return (
    <section className="border-t border-[rgba(46,125,50,0.55)] grid gap-3 pt-4">
      {/* h2: text-[--text-secondary] font-[IBM_Plex_Mono,monospace] text-[13px] font-bold m-0 uppercase */}
      <h2 className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-[13px] font-bold m-0 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function TodayLogPanel({ eventsData, onDelete }) {
  const events = eventsData.events || [];
  const totals = eventsData.totals || {};

  return (
    // today-log-panel: bg-[--bg-surface] border border-[--border] rounded-lg min-w-0 p-[18px] grid gap-[14px] sticky top-6
    // <=980px: position static
    <aside className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-[18px] grid gap-[14px] max-[980px]:static sticky top-14 lg:top-6">
      <header>
        {/* h2: text-[20px] leading-none m-0 */}
        <h2 className="display-font text-[20px] leading-none m-0">Today's Log</h2>
        {/* p: text-[--text-muted] font-[IBM_Plex_Mono,monospace] text-xs mt-2 m-0 */}
        <p className="text-[var(--text-muted)] font-[IBM_Plex_Mono,monospace] text-xs mt-2 m-0">
          {formatNumber(totals.total_weight_today || 0)} lbs {"·"} {formatMoney(totals.total_cost_today || 0)}{" "}
          {"·"} {totals.event_count || 0} events
        </p>
      </header>

      {/* today-log-table-wrap: max-h-[620px] overflow-auto */}
      <div className="max-h-[620px] overflow-auto">
        {/* today-log-table: border-collapse w-full min-w-[760px] */}
        <table className="border-collapse w-full min-w-[760px]">
          <thead>
            <tr>
              {["Time","Flock","Feed","Weight","Wt/Bird","Cost","$/Bird","Method",""].map((label, i) => (
                <th
                  key={i}
                  className="border-b border-[rgba(46,125,50,0.55)] bg-[var(--bg-elevated)] text-[var(--text-primary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left sticky top-0 z-[1]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.length ? (
              events.map((event) => (
                <tr key={event.id} className="group">
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{formatTime(event.timestamp)}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{event.flock_name}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{event.feed_name}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{formatNumber(event.total_weight)} lbs</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{formatNumber(event.weight_per_bird, 2)}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{formatMoney(event.cost_total)}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{formatMoney(event.cost_per_bird)}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">
                    {/* method-badge: rounded-full text-[11px] font-bold py-[3px] px-[7px] uppercase */}
                    <span className={[
                      "rounded-full text-[11px] font-bold py-[3px] px-[7px] uppercase",
                      event.input_method === "scale"
                        ? "bg-[rgba(76,175,80,0.16)] text-[var(--accent-primary)]"
                        : "bg-[var(--bg-elevated)] text-[var(--text-muted)]",
                    ].join(" ")}>
                      {event.input_method}
                    </span>
                  </td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">
                    {/* delete-event-button: inline-flex items-center justify-center bg-transparent border border-transparent rounded-md text-[--text-muted] h-7 w-7 p-0 opacity-0; on row hover: opacity-100 border-[rgba(198,40,40,0.6)] text-[#ef9a9a] */}
                    <button
                      className="inline-flex items-center justify-center bg-transparent border border-transparent rounded-md text-[var(--text-muted)] h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-hover:border-[rgba(198,40,40,0.6)] group-hover:text-[#ef9a9a]"
                      type="button"
                      onClick={() => onDelete(event.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left" colSpan="9">No feedings logged today</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td
                className="bg-[var(--bg-surface)] sticky bottom-0 text-[var(--text-primary)] font-bold font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left border-b border-[rgba(46,125,50,0.55)]"
                colSpan="3"
              >
                Totals
              </td>
              <td className="bg-[var(--bg-surface)] sticky bottom-0 text-[var(--text-primary)] font-bold font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left border-b border-[rgba(46,125,50,0.55)]">
                {formatNumber(totals.total_weight_today || 0)} lbs
              </td>
              <td className="bg-[var(--bg-surface)] sticky bottom-0 text-[var(--text-primary)] font-bold font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left border-b border-[rgba(46,125,50,0.55)]" />
              <td className="bg-[var(--bg-surface)] sticky bottom-0 text-[var(--text-primary)] font-bold font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left border-b border-[rgba(46,125,50,0.55)]">
                {formatMoney(totals.total_cost_today || 0)}
              </td>
              <td className="bg-[var(--bg-surface)] sticky bottom-0 text-[var(--text-primary)] font-bold font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left border-b border-[rgba(46,125,50,0.55)]" colSpan="3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </aside>
  );
}

export default ScaleHouse;
