import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  CircleArrowDown,
  Eye,
  Gauge,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { getAnimalEmoji, getClassConfig, OBSERVATION_CATEGORIES } from "../../utils/animalClass";
import { FarmContext } from "../../context/FarmContext";
import ObservationEntry from "../../components/ObservationEntry";
import ObservationCard from "../../components/ObservationCard";
import { getFlockAnimals, deleteObservation, updateObservation } from "../../services/observationsApi";
import {
  deleteAllTodayFeedings,
  deleteFeedingEvent,
  getTodaySession,
  updateFeedingEvent,
  updateProductionLog,
} from "../../services/daySessionApi";
import {
  deleteEvent,
  getQueue,
  getQueueSummary,
  getScaleStatus,
  getTodayEvents,
  logSession,
  openScaleStream,
} from "../../services/scaleHouseApi";
import { supabase } from "../../services/supabaseClient";
import { getLocalDateString } from "../../utils/date";

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
  if (!value) return "";
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

// ─── ScaleHouse ────────────────────────────────────────────────────────────────

function ScaleHouse() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "quick";
  const isDailyMode = mode === "daily";
  const navigate = useNavigate();
  const { userId } = useContext(FarmContext);

  // ── Entry form state ───────────────────────────────────────────────────────
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState([]);
  const [backBanner, setBackBanner] = useState('');
  const [sessionLog, setSessionLog] = useState({});
  const [quickFlockId, setQuickFlockId] = useState("");

  const [headcountChange, setHeadcountChange] = useState(0);
  const [casualtyNotes, setCasualtyNotes] = useState("");
  const [selectedFeed, setSelectedFeed] = useState("");
  const [feedWeight, setFeedWeight] = useState("");
  const [inputMethod, setInputMethod] = useState("manual");
  const [eggCount, setEggCount] = useState("");
  const [waterConsumed, setWaterConsumed] = useState("");
  const [litterCount, setLitterCount] = useState("");
  const [litterSize, setLitterSize] = useState("");
  const [litterNotes, setLitterNotes] = useState("");
  const [birthsToday, setBirthsToday] = useState(false);
  const [productionSkipped, setProductionSkipped] = useState(false);
  const [sessionDate, setSessionDate] = useState(getLocalDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCostDetails, setShowCostDetails] = useState(false);

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

  // ── Panel / review state ───────────────────────────────────────────────────
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showRestartMenu, setShowRestartMenu] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [showFlockPicker, setShowFlockPicker] = useState(false);
  const [flockAnimals,   setFlockAnimals]   = useState([]);
  const [observations,   setObservations]   = useState([]);
  const [showAddObs,     setShowAddObs]     = useState(false);
  const [editingObs,     setEditingObs]     = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [panelDate, setPanelDate] = useState(getLocalDateString());

  // ── Derived entry values ───────────────────────────────────────────────────
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
  const blockReason = !currentFlock
    ? 'No flock selected'
    : !currentFeed
      ? (currentFlock.assigned_feeds?.length ? 'Select a feed type' : 'No feed assigned — add one in Farm Setup')
      : effectiveWeight <= 0
        ? 'Enter a weight greater than 0'
        : headcountChange < 0 && !casualtyNotes.trim()
          ? 'Add notes for the headcount change'
          : '';
  const _classDefaults = getClassConfig(currentFlock?.class_type || 'other');
  const currentAnimalClass = currentFlock ? {
    ..._classDefaults,
    producesEggs:  currentFlock.produces_eggs  ?? _classDefaults.producesEggs,
    producesMilk:  currentFlock.produces_milk  ?? _classDefaults.producesMilk,
    producesYoung: currentFlock.produces_young ?? _classDefaults.producesYoung,
    workingAnimal: currentFlock.working_animal ?? _classDefaults.workingAnimal,
  } : _classDefaults;
  const showEggs = currentFlock && currentAnimalClass.producesEggs && !productionSkipped;
  const showLitter = currentFlock && currentAnimalClass.litterTracking && !productionSkipped;
  const showMilk = currentFlock && currentAnimalClass.producesMilk;
  const showWorking = currentFlock && currentAnimalClass.workingAnimal;
  const showProduction = showEggs || showLitter || showMilk || showWorking;
  const isBackdated = sessionDate !== getLocalDateString();
  const completedPercent = queue.length ? Math.round((completed.length / queue.length) * 100) : 0;
  const currentFlockLog = currentFlock ? sessionLog[currentFlock.flock_id] ?? null : null;
  const alreadyLogged = !!currentFlockLog;

  // ── Data fetchers ──────────────────────────────────────────────────────────
  const refreshQueue = useCallback(async () => {
    if (!userId) return [];
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
    if (!userId) return;
    const [events, nextSummary] = await Promise.all([getTodayEvents(userId), getQueueSummary(userId)]);
    setEventsData(events);
    setSummary(nextSummary);
  }, [userId]);

  const loadSessionData = useCallback(async (date) => {
    setSessionLoading(true);
    try {
      const data = await getTodaySession(date);
      setSessionData(data);
    } catch {
      setSessionData(null);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let eventSource;
    let mounted = true;

    async function boot() {
      if (!userId) { setLoading(false); return; }
      try {
        await Promise.all([refreshQueue(), refreshEvents()]);
        const status = await getScaleStatus();
        if (!mounted) return;
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
      if (eventSource) eventSource.close();
    };
  }, [refreshEvents, refreshQueue, userId]);

  // Detect ?panel=review / ?panel=edit on mount
  useEffect(() => {
    const panelParam = searchParams.get("panel");
    if (panelParam === "review") setShowReviewPanel(true);
    if (panelParam === "edit") setShowEditPanel(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load session data whenever a panel opens or panelDate changes
  useEffect(() => {
    if (showReviewPanel || showEditPanel) {
      loadSessionData(panelDate);
    }
  }, [showReviewPanel, showEditPanel, panelDate, loadSessionData]);

  // Auto-select feed when flock changes
  useEffect(() => {
    if (!currentFlock?.assigned_feeds?.length) { setSelectedFeed(""); return; }
    const stillAssigned = currentFlock.assigned_feeds.some((feed) => feed.feed_type_id === Number(selectedFeed));
    if (!stillAssigned) {
      setSelectedFeed(String(currentFlock.assigned_feeds[0].feed_type_id));
    }
  }, [currentFlock, selectedFeed]);

  // Load individual animals when flock changes (if tracking enabled)
  useEffect(() => {
    setObservations([]);
    setShowAddObs(false);
    setEditingObs(null);
    if (currentFlock?.individual_tracking_enabled && currentFlock.flock_id) {
      getFlockAnimals(currentFlock.flock_id).then(setFlockAnimals).catch(() => setFlockAnimals([]));
    } else {
      setFlockAnimals([]);
    }
  }, [currentFlock?.flock_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-capture stable scale reading
  useEffect(() => {
    if (inputMethod === "scale" && autoCapture && scaleStable && scaleWeight > 0) {
      setFeedWeight(scaleWeight.toFixed(2));
    }
  }, [autoCapture, inputMethod, scaleStable, scaleWeight]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function resetForm() {
    setHeadcountChange(0);
    setCasualtyNotes("");
    setFeedWeight("");
    setInputMethod("manual");
    setEggCount("");
    setWaterConsumed("");
    setLitterCount("");
    setLitterSize("");
    setLitterNotes("");
    setBirthsToday(false);
    setProductionSkipped(false);
    setShowCostDetails(false);
    setObservations([]);
    setShowAddObs(false);
    setEditingObs(null);
  }

  function handleSkip() {
    const flock = queue[currentIndex];
    if (!flock) { setDone(true); return; }
    const nextSkipped = [...new Set([...skipped, flock.flock_id])];
    setSkipped(nextSkipped);
    setQueue((previous) => {
      const next = previous.filter((item) => item.flock_id !== flock.flock_id);
      next.push(flock);
      const hasFeedableFlock = next.some(
        (item) => !completed.includes(item.flock_id) && !nextSkipped.includes(item.flock_id),
      );
      if (!hasFeedableFlock) setDone(true);
      return next;
    });
    setHistory(prev => [...prev, currentIndex]);
    resetForm();
  }

  function handleGoBack() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    const prevFlockId = queue[prev]?.flock_id;
    if (prevFlockId) setCompleted(c => c.filter(id => id !== prevFlockId));
    setCurrentIndex(prev);
    setDone(false);
    resetForm();
    const flockName = queue[prev]?.name || 'previous flock';
    setBackBanner(`Going back to ${flockName}. Previous entry saved — add more observations or edit in the Edit Day panel.`);
    window.setTimeout(() => setBackBanner(''), 4000);
  }

  async function handleSubmit() {
    if (!canLog) { setError("Choose a flock, feed, and weight before saving."); return; }
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
          ? { egg_count: null, water_consumed: null }
          : {
              egg_count: safeId(eggCount),
              water_consumed: waterConsumed === "" ? null : Number(waterConsumed),
              litter_count: litterCount === "" ? null : Number(litterCount),
              litter_size: litterSize === "" ? null : Number(litterSize),
              litter_notes: litterNotes || null,
            },
      });
      setFlash(true);
      window.setTimeout(() => setFlash(false), 600);
      setSessionLog(prev => ({
        ...prev,
        [currentFlock.flock_id]: {
          feedingEvent: {
            feed_type_id: safeId(selectedFeed),
            feed_name:    currentFeed?.name || '',
            total_weight: parseFloat(feedWeight) || 0,
            input_method: inputMethod,
          },
          productionLog: {
            egg_count:      eggCount !== '' ? Number(eggCount) : null,
            water_consumed: waterConsumed !== '' ? Number(waterConsumed) : null,
            litter_count:   birthsToday && litterCount !== '' ? Number(litterCount) : null,
            litter_size:    birthsToday && litterSize !== '' ? Number(litterSize) : null,
          },
          observations: [...observations],
        },
      }));
      setHistory(prev => [...prev, currentIndex]);
      resetForm();
      await Promise.all([refreshQueue(), refreshEvents()]);
    } catch (requestError) {
      setError(requestError.message || "Session could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!window.confirm("Delete this feeding event?")) return;
    await deleteEvent(eventId);
    await Promise.all([refreshQueue(), refreshEvents()]);
  }

  async function handleResetQueue() {
    try {
      const nextQueue = await getQueue(userId);
      setQueue(nextQueue);
      if (nextQueue[0]) setQuickFlockId(String(nextQueue[0].flock_id));
      setCompleted([]);
      setSkipped([]);
      setCurrentIndex(0);
      setDone(false);
      setSessionLog({});
    } catch {
      setError("Could not reload queue.");
    } finally {
      setShowRestartMenu(false);
    }
  }

  async function handleStartOver() {
    try {
      await deleteAllTodayFeedings(getLocalDateString());
      const nextQueue = await getQueue(userId);
      setQueue(nextQueue);
      if (nextQueue[0]) setQuickFlockId(String(nextQueue[0].flock_id));
      setCompleted([]);
      setSkipped([]);
      setCurrentIndex(0);
      setDone(false);
      setSessionLog({});
      await refreshEvents();
      loadSessionData(panelDate);
    } catch {
      setError("Could not restart session.");
    } finally {
      setShowRestartConfirm(false);
      setShowRestartMenu(false);
    }
  }

  function handlePickFlock(index) {
    setCompleted(queue.slice(0, index).map((f) => f.flock_id));
    setSkipped([]);
    setCurrentIndex(index);
    setDone(false);
    setShowFlockPicker(false);
    setShowRestartMenu(false);
  }

  function openReviewPanel() { setPanelDate(getLocalDateString()); setShowReviewPanel(true); }
  function openEditPanel()   { setPanelDate(getLocalDateString()); setShowEditPanel(true); }

  // ── Shared panel renders ───────────────────────────────────────────────────
  const panelProps = {
    date: panelDate,
    setDate: setPanelDate,
    sessionData,
    sessionLoading,
    queue,
    isDailyMode,
    setCurrentIndex,
    setDone,
    loadSessionData,
    navigate,
    userId,
  };

  const completionBreakdown = useMemo(() => eventsData.breakdown || [], [eventsData.breakdown]);

  if (loading) {
    return <section className="panel-card">Loading Scale House...</section>;
  }

  // ── Completion screen ──────────────────────────────────────────────────────
  if (done && isDailyMode) {
    return (
      <section className="grid gap-4 pb-20">
        <DailyModeBanner
          currentIndex={currentIndex}
          done={done}
          queueLength={queue.length}
          showRestartMenu={showRestartMenu}
          setShowRestartMenu={setShowRestartMenu}
          onReview={openReviewPanel}
          onEdit={openEditPanel}
          onResetQueue={handleResetQueue}
          onPickFlock={() => { setShowRestartMenu(false); setShowFlockPicker(true); }}
          onStartOver={() => { setShowRestartMenu(false); setShowRestartConfirm(true); }}
        />

        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-[18px] grid gap-[18px]">
          <h1 className="display-font text-[var(--accent-primary)] text-[40px] leading-none m-0">All done for today {"✓"}</h1>
          <p className="text-[var(--text-muted)] m-0">Completed at {formatTime(new Date().toISOString())}</p>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
            <SummaryTile label="Flocks Logged" value={summary?.flocks_fed || completed.length} />
            <SummaryTile label="Feed Used" value={`${formatNumber(summary?.total_feed_used_lbs)} lbs`} />
            <SummaryTile label="Total Cost" value={formatMoney(summary?.total_feed_cost)} />
            <SummaryTile label="Total Eggs" value={summary?.total_eggs || 0} />
            <SummaryTile label="Cost/Bird" value={formatMoney(summary?.cost_per_bird)} />
            <SummaryTile label="Casualties" value={summary?.casualties || 0} />
          </div>
          <div className="overflow-x-auto">
            <table className="border-collapse w-full min-w-[420px] lg:min-w-[760px]">
              <thead>
                <tr>
                  {["Flock", "Feed Used", "Cost", "Eggs", "Final Count"].map((h) => (
                    <th key={h} className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-primary)] bg-[var(--bg-elevated)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left sticky top-0 z-[1]">{h}</th>
                  ))}
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
          <div className="flex flex-wrap gap-[10px]">
            <button className="primary-button" type="button" onClick={() => navigate("/dashboard")}>
              {"←"} Back to Dashboard
            </button>
            <button className="secondary-button" type="button" onClick={() => navigate("/export")}>
              Export Today's Report
            </button>
            <button className="secondary-button" type="button" onClick={openReviewPanel}>
              Review Today
            </button>
            <button className="secondary-button" type="button" onClick={openEditPanel}>
              Edit an entry
            </button>
            <button
              className="bg-transparent border-0 text-[var(--text-muted)] font-mono text-sm p-0 hover:text-[var(--text-secondary)] cursor-pointer"
              type="button"
              onClick={() => setShowRestartMenu(true)}
            >
              Start over
            </button>
          </div>
          <p className="font-mono text-xs text-[var(--text-muted)] text-center mt-2">
            Missed something? Tap "Edit an entry" above to go back and add observations.
          </p>
        </div>

        {showReviewPanel && (
          <ReviewPanel {...panelProps} onClose={() => setShowReviewPanel(false)} />
        )}
        {showEditPanel && (
          <EditPanel {...panelProps} onClose={() => setShowEditPanel(false)} />
        )}
        {showFlockPicker && (
          <FlockPickerModal queue={queue} onPick={handlePickFlock} onClose={() => setShowFlockPicker(false)} />
        )}
        {showRestartConfirm && (
          <RestartConfirmModal onConfirm={handleStartOver} onClose={() => setShowRestartConfirm(false)} />
        )}
      </section>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <section className={`grid gap-4 pb-20${flash ? " [&_.scale-entry-inner]:shadow-[0_0_0_2px_rgba(76,175,80,0.45)]" : ""}`}>
      {isDailyMode ? (
        <DailyModeBanner
          currentIndex={currentIndex}
          done={done}
          queueLength={queue.length}
          showRestartMenu={showRestartMenu}
          setShowRestartMenu={setShowRestartMenu}
          onReview={openReviewPanel}
          onEdit={openEditPanel}
          onResetQueue={handleResetQueue}
          onPickFlock={() => { setShowRestartMenu(false); setShowFlockPicker(true); }}
          onStartOver={() => { setShowRestartMenu(false); setShowRestartConfirm(true); }}
        />
      ) : (
        <QuickModeBanner navigate={navigate} />
      )}

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

      {backBanner && (
        <div className="bg-[rgba(76,175,80,0.1)] border border-[var(--border)] rounded-lg px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
          {backBanner}
        </div>
      )}

      <div className="grid gap-4 items-start grid-cols-[minmax(0,1fr)_400px] max-[980px]:grid-cols-1">
        <ScaleEntryCard
          adjustedHeadcount={adjustedHeadcount}
          autoCapture={autoCapture}
          blockReason={blockReason}
          casualtyNotes={casualtyNotes}
          canLog={canLog}
          costPerBird={costPerBird}
          costTotal={costTotal}
          currentAnimalClass={currentAnimalClass}
          currentFeed={currentFeed}
          currentFlock={currentFlock}
          effectiveWeight={effectiveWeight}
          eggCount={eggCount}
          feedWeight={feedWeight}
          headcountChange={headcountChange}
          inputMethod={inputMethod}
          isBackdated={isBackdated}
          isDailyMode={isDailyMode}
          litterCount={litterCount}
          litterNotes={litterNotes}
          litterSize={litterSize}
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
          flockAnimals={flockAnimals}
          observations={observations}
          setObservations={setObservations}
          showAddObs={showAddObs}
          setShowAddObs={setShowAddObs}
          editingObs={editingObs}
          setEditingObs={setEditingObs}
          userId={userId}
          setAutoCapture={setAutoCapture}
          setCasualtyNotes={setCasualtyNotes}
          setEggCount={setEggCount}
          setFeedWeight={setFeedWeight}
          setHeadcountChange={setHeadcountChange}
          setInputMethod={setInputMethod}
          birthsToday={birthsToday}
          setBirthsToday={setBirthsToday}
          setLitterCount={setLitterCount}
          setLitterNotes={setLitterNotes}
          setLitterSize={setLitterSize}
          setProductionSkipped={setProductionSkipped}
          setQuickFlockId={setQuickFlockId}
          setSelectedFeed={setSelectedFeed}
          setSessionDate={setSessionDate}
          setShowDatePicker={setShowDatePicker}
          setWaterConsumed={setWaterConsumed}
          showDatePicker={showDatePicker}
          showEggs={showEggs}
          showLitter={showLitter}
          showMilk={showMilk}
          showWorking={showWorking}
          showProduction={showProduction}
          stepLabel={isDailyMode ? `Step ${currentIndex + 1} of ${queue.length}` : "Quick Entry"}
          waterConsumed={waterConsumed}
          weightPerBird={weightPerBird}
          onQuickSubmit={handleSubmit}
          flash={flash}
          showCostDetails={showCostDetails}
          setShowCostDetails={setShowCostDetails}
          alreadyLogged={alreadyLogged}
          currentFlockLog={currentFlockLog}
          openEditPanel={openEditPanel}
          setSessionLog={setSessionLog}
        />

        <TodayLogPanel eventsData={eventsData} onDelete={handleDeleteEvent} />
      </div>

      {isDailyMode ? (
        <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] lg:bottom-0 left-0 lg:left-[240px] right-0 z-[5] flex items-center justify-between gap-3 bg-[rgba(15,26,15,0.95)] border-t border-[var(--border)] py-[14px] px-6">
          <div className="flex items-center gap-2">
            <button
              className={`btn btn-sm btn-ghost font-mono border border-[var(--border)] text-[var(--text-muted)] gap-1${history.length === 0 ? ' opacity-30 cursor-not-allowed' : ''}`}
              type="button"
              disabled={history.length === 0}
              onClick={handleGoBack}
            >
              ← Back
            </button>
            <button className="secondary-button" type="button" onClick={handleSkip}>
              Skip
            </button>
          </div>
          <div className="flex flex-col items-end gap-1">
            {!canLog && !saving && blockReason && (
              <span className="font-mono text-[11px] text-[var(--accent-warn)]">{blockReason}</span>
            )}
            <button className="primary-button" type="button" disabled={!canLog || saving} onClick={handleSubmit}>
              {saving ? "Saving..." : "Complete & Next →"}
            </button>
          </div>
        </div>
      ) : null}

      {showReviewPanel && (
        <ReviewPanel {...panelProps} onClose={() => setShowReviewPanel(false)} />
      )}
      {showEditPanel && (
        <EditPanel {...panelProps} onClose={() => setShowEditPanel(false)} />
      )}
      {showFlockPicker && (
        <FlockPickerModal queue={queue} onPick={handlePickFlock} onClose={() => setShowFlockPicker(false)} />
      )}
      {showRestartConfirm && (
        <RestartConfirmModal onConfirm={handleStartOver} onClose={() => setShowRestartConfirm(false)} />
      )}
    </section>
  );
}

// ─── Mode Banners ─────────────────────────────────────────────────────────────

function DailyModeBanner({
  currentIndex,
  done,
  queueLength,
  showRestartMenu,
  setShowRestartMenu,
  onReview,
  onEdit,
  onResetQueue,
  onPickFlock,
  onStartOver,
}) {
  return (
    <div className="w-full bg-[var(--accent-primary)] rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden="true">🌾</span>
        <span className="font-mono text-sm font-bold text-[var(--bg-base)]">Today's Feeding Session</span>
      </div>

      {queueLength > 0 && (
        <span className="font-mono text-xs text-[var(--bg-base)] opacity-80">
          {done ? "All flocks logged ✓" : `Flock ${Math.min(currentIndex + 1, queueLength)} of ${queueLength}`}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <button
          className="inline-flex items-center gap-1.5 bg-[var(--bg-base)] text-[var(--accent-primary)] font-mono text-xs font-semibold rounded-md px-2.5 py-1.5 border-0 cursor-pointer hover:opacity-90"
          type="button"
          onClick={onReview}
        >
          <Eye size={13} />
          Review
        </button>
        <button
          className="inline-flex items-center gap-1.5 bg-[var(--bg-base)] text-[var(--accent-primary)] font-mono text-xs font-semibold rounded-md px-3 py-1.5 border-0 cursor-pointer hover:opacity-90"
          type="button"
          onClick={onEdit}
        >
          <Pencil size={13} />
          Edit Day
        </button>
        <div className="relative">
          <button
            className="inline-flex items-center justify-center bg-[var(--bg-base)] text-[var(--accent-primary)] font-bold rounded-md h-[30px] w-[30px] border-0 cursor-pointer hover:opacity-90"
            type="button"
            aria-label="Restart options"
            onClick={() => setShowRestartMenu((v) => !v)}
          >
            <MoreHorizontal size={15} />
          </button>
          {showRestartMenu && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[60] overflow-hidden">
              <button
                className="w-full text-left px-4 py-3 font-mono text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] border-b border-[var(--border)]"
                type="button"
                onClick={onResetQueue}
              >
                <strong className="block">Reset queue</strong>
                <span className="text-[var(--text-muted)] text-xs">Re-queue all flocks. Today's entries are kept.</span>
              </button>
              <button
                className="w-full text-left px-4 py-3 font-mono text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] border-b border-[var(--border)]"
                type="button"
                onClick={onPickFlock}
              >
                <strong className="block">Restart from specific flock</strong>
                <span className="text-[var(--text-muted)] text-xs">Pick a flock to continue from.</span>
              </button>
              <button
                className="w-full text-left px-4 py-3 font-mono text-sm text-[var(--accent-danger)] hover:bg-[var(--bg-surface)]"
                type="button"
                onClick={onStartOver}
              >
                <strong className="block">Start day over</strong>
                <span className="text-[var(--text-muted)] text-xs">Delete all today's entries and begin fresh.</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickModeBanner({ navigate }) {
  return (
    <div className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Gauge size={15} className="text-[var(--text-muted)]" />
        <span className="font-mono text-sm font-bold text-[var(--text-secondary)]">Quick Entry</span>
      </div>
      <button
        className="font-mono text-xs text-[var(--accent-primary)] hover:underline bg-transparent border-0 p-0 cursor-pointer"
        type="button"
        onClick={() => navigate("/scale-house?mode=daily")}
      >
        Switch to Daily Mode →
      </button>
    </div>
  );
}

// ─── Review Panel ─────────────────────────────────────────────────────────────

function ReviewPanel({ date, setDate, sessionData, sessionLoading, queue, isDailyMode, setCurrentIndex, setDone, onClose, navigate }) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isToday = date === getLocalDateString();

  const flockMap = useMemo(() => {
    if (!sessionData) return {};
    const map = {};
    for (const feeding of sessionData.feedings) {
      if (!map[feeding.flock_id]) {
        map[feeding.flock_id] = { flock: feeding.flocks, feedings: [], production: [], casualties: [] };
      }
      map[feeding.flock_id].feedings.push(feeding);
    }
    for (const prod of sessionData.production) {
      if (!map[prod.flock_id]) {
        map[prod.flock_id] = { flock: prod.flocks, feedings: [], production: [], casualties: [] };
      }
      map[prod.flock_id].production.push(prod);
    }
    for (const cas of sessionData.casualties) {
      if (!map[cas.flock_id]) {
        map[cas.flock_id] = { flock: cas.flocks, feedings: [], production: [], casualties: [] };
      }
      map[cas.flock_id].casualties.push(cas);
    }
    return map;
  }, [sessionData]);

  const loggedFlockIds = useMemo(() => new Set(Object.keys(flockMap).map(Number)), [flockMap]);
  const unloggedFlocks = useMemo(
    () => queue.filter((f) => !loggedFlockIds.has(f.flock_id)),
    [queue, loggedFlockIds],
  );

  function handleLogNow(flock) {
    const idx = queue.findIndex((f) => f.flock_id === flock.flock_id);
    onClose();
    if (isDailyMode && idx >= 0) {
      setCurrentIndex(idx);
      setDone(false);
    } else {
      navigate("/scale-house?mode=daily");
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[65] bg-[rgba(3,8,3,0.72)]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-[70] w-[520px] max-[640px]:inset-x-0 max-[640px]:w-auto bg-[var(--bg-surface)] border-l border-[var(--border)] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center justify-between px-4 py-3">
          <h2 className="display-font text-xl leading-none m-0">Day Review</h2>
          <button
            type="button" onClick={onClose} aria-label="Close review panel"
            className="btn btn-circle btn-sm bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--accent-danger)] hover:border-[var(--accent-danger)] hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Date selector */}
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm text-[var(--text-primary)]">
              {new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </span>
            <button
              className="font-mono text-xs text-[var(--accent-primary)] hover:underline bg-transparent border-0 p-0 cursor-pointer"
              type="button"
              onClick={() => setShowDatePicker((v) => !v)}
            >
              Change date
            </button>
          </div>
          {showDatePicker && (
            <input
              className="mt-2 bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[36px] py-[7px] px-[10px]"
              type="date"
              value={date}
              max={getLocalDateString()}
              onChange={(e) => { setDate(e.target.value); setShowDatePicker(false); }}
            />
          )}
          {!isToday && (
            <div className="warn-banner mt-2">
              <AlertTriangle size={14} aria-hidden="true" /> Viewing past session
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 grid gap-5 content-start">
          {sessionLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="loading loading-spinner text-[var(--accent-primary)]" />
            </div>
          ) : !sessionData ? (
            <p className="font-mono text-sm text-[var(--text-muted)] text-center py-12">No data for this date.</p>
          ) : (
            <>
              {/* Summary */}
              <div className="bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)] p-4 grid grid-cols-3 gap-4">
                {[
                  { label: "Flocks Fed",  value: sessionData.summary.flocks_fed },
                  { label: "Feed Used",   value: `${formatNumber(sessionData.summary.total_feed_used)} lbs` },
                  { label: "Total Cost",  value: formatMoney(sessionData.summary.total_feed_cost) },
                  { label: "Total Eggs",  value: formatNumber(sessionData.summary.total_eggs, 0) },
                  { label: "Cost/Bird",   value: formatMoney(sessionData.summary.cost_per_bird_avg) },
                  { label: "Casualties",  value: sessionData.summary.total_casualties },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">{label}</div>
                    <div className="number-font text-lg text-[var(--text-primary)] leading-none">{value}</div>
                  </div>
                ))}
              </div>

              {/* Per-flock breakdown */}
              {Object.values(flockMap).map(({ flock, feedings, production, casualties }) => (
                <div
                  key={flock?.id}
                  className="bg-[var(--bg-base)] rounded-lg border border-[var(--border)] p-4 grid gap-2"
                >
                  <h3 className="font-mono text-sm font-bold text-[var(--text-primary)] m-0">{flock?.name}</h3>
                  {feedings.map((f) => (
                    <div key={f.id} className="flex justify-between text-xs font-mono text-[var(--text-secondary)]">
                      <span>{f.feed_types?.name} — {formatNumber(f.total_weight, 1)} lbs · {formatNumber(f.weight_per_bird, 2)} lbs/bird</span>
                      <span className="ml-2 flex-none">{formatMoney(f.cost_total)}</span>
                    </div>
                  ))}
                  {production.map((p) => (
                    <div key={p.id} className="text-xs font-mono text-[var(--text-secondary)]">
                      {p.egg_count != null ? `${p.egg_count} eggs` : "Production skipped"}
                      {p.water_consumed ? ` · ${p.water_consumed} gal water` : ""}
                    </div>
                  ))}
                  {casualties.map((c) => (
                    <div key={c.id} className={`text-xs font-mono ${c.change_amount < 0 ? "text-[var(--accent-danger)]" : "text-[var(--accent-primary)]"}`}>
                      {c.change_amount < 0 ? `${Math.abs(c.change_amount)} casualties` : `+${c.change_amount} additions`}
                      {c.notes ? ` — ${c.notes}` : ""}
                    </div>
                  ))}
                  {feedings.length === 0 && production.length === 0 && casualties.length === 0 && (
                    <p className="font-mono text-xs text-[var(--text-muted)] m-0">No records for this flock today.</p>
                  )}
                </div>
              ))}

              {/* Unlogged flocks */}
              {unloggedFlocks.length > 0 && (
                <div>
                  <h3 className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Not yet logged</h3>
                  <div className="grid gap-2">
                    {unloggedFlocks.map((flock) => (
                      <div
                        key={flock.flock_id}
                        className="flex items-center justify-between bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-4 py-3"
                      >
                        <span className="font-mono text-sm text-[var(--text-secondary)]">{flock.name}</span>
                        <button
                          className="font-mono text-xs text-[var(--accent-primary)] hover:underline bg-transparent border-0 p-0 cursor-pointer"
                          type="button"
                          onClick={() => handleLogNow(flock)}
                        >
                          Log now →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sessionData.feedings.length === 0 && sessionData.production.length === 0 && (
                <p className="font-mono text-sm text-[var(--text-muted)] text-center py-8">
                  No feeding sessions recorded for this date.
                </p>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Edit Panel ───────────────────────────────────────────────────────────────

function EditPanel({ date, setDate, sessionData, sessionLoading, queue, isDailyMode, setCurrentIndex, setDone, loadSessionData, userId, onClose, navigate }) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isToday = date === getLocalDateString();
  const [editingFlock, setEditingFlock] = useState(null);
  const [editForm, setEditForm] = useState({
    feedTypeId: null, feedWeight: '', inputMethod: 'manual', water: '',
    eggCount: 0, litterCount: 0, litterSize: 0, litterNotes: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editObs, setEditObs] = useState([]);
  const [showAddEditObs, setShowAddEditObs] = useState(false);
  const [editingObs, setEditingObs] = useState(null);
  const [editFlockAnimals, setEditFlockAnimals] = useState([]);

  // Reset to Stage 1 list whenever the date changes
  useEffect(() => { setEditingFlock(null); }, [date]);

  // Pre-fill form + load DB observations when a flock is selected
  useEffect(() => {
    if (!editingFlock) { setEditObs([]); setEditFlockAnimals([]); return; }
    const { feedingEvent, productionLog, queueFlock } = editingFlock;
    setEditForm({
      feedTypeId:  feedingEvent?.feed_types?.id ?? null,
      feedWeight:  String(feedingEvent?.total_weight || ''),
      inputMethod: feedingEvent?.input_method || 'manual',
      water:       productionLog?.water_consumed != null ? String(productionLog.water_consumed) : '',
      eggCount:    productionLog?.egg_count ?? 0,
      litterCount: productionLog?.litter_count ?? 0,
      litterSize:  productionLog?.litter_size ?? 0,
      litterNotes: productionLog?.litter_notes || '',
    });
    setEditSuccess('');
    setEditError('');
    setConfirmDelete(false);
    setShowAddEditObs(false);
    setEditingObs(null);
    supabase
      .from('observation_logs')
      .select('*, animals(id, identifier)')
      .eq('flock_id', feedingEvent.flock_id)
      .eq('date', date)
      .order('created_at', { ascending: true })
      .then(({ data }) => setEditObs(data || []))
      .catch(() => setEditObs([]));
    if (queueFlock?.individual_tracking_enabled && queueFlock.flock_id) {
      getFlockAnimals(queueFlock.flock_id).then(setEditFlockAnimals).catch(() => setEditFlockAnimals([]));
    } else {
      setEditFlockAnimals([]);
    }
  }, [editingFlock?.feedingEvent?.id, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const flockMap = useMemo(() => {
    if (!sessionData) return {};
    const map = {};
    for (const feeding of sessionData.feedings || []) {
      if (!map[feeding.flock_id]) map[feeding.flock_id] = { feeding: null, production: null };
      map[feeding.flock_id].feeding = feeding;
    }
    for (const prod of sessionData.production || []) {
      if (!map[prod.flock_id]) map[prod.flock_id] = { feeding: null, production: null };
      map[prod.flock_id].production = prod;
    }
    return map;
  }, [sessionData]);

  const loggedFlockIds = useMemo(() => new Set(Object.keys(flockMap).map(Number)), [flockMap]);
  const unloggedFlocks = useMemo(() => queue.filter(f => !loggedFlockIds.has(f.flock_id)), [queue, loggedFlockIds]);

  function selectFlock(feedingEvent) {
    const productionLog = (sessionData?.production || []).find(p => p.flock_id === feedingEvent.flock_id) || null;
    const queueFlock = queue.find(f => f.flock_id === feedingEvent.flock_id) || null;
    setEditingFlock({ feedingEvent, productionLog, queueFlock });
  }

  function handleLogNow(flock) {
    const idx = queue.findIndex(f => f.flock_id === flock.flock_id);
    onClose();
    if (isDailyMode && idx >= 0) { setCurrentIndex(idx); setDone(false); }
    else navigate('/scale-house?mode=daily');
  }

  async function handleSave() {
    if (!editingFlock) return;
    setEditSaving(true);
    setEditError('');
    try {
      const { feedingEvent, productionLog, queueFlock } = editingFlock;
      const weight = Number(editForm.feedWeight) || 0;
      const headcount = queueFlock?.current_headcount || feedingEvent.flocks?.current_headcount || 1;
      const feedOption = (queueFlock?.assigned_feeds || []).find(f => f.feed_type_id === Number(editForm.feedTypeId))
        || { cost_per_unit: feedingEvent.feed_types?.cost_per_unit ?? 0 };
      const costPerUnit = feedOption.cost_per_unit ?? feedOption.cost_per_lb ?? 0;
      const newCostTotal = weight * costPerUnit;
      await updateFeedingEvent(feedingEvent.id, {
        total_weight:  weight,
        feed_type_id:  Number(editForm.feedTypeId),
        weight_per_bird: headcount > 0 ? weight / headcount : 0,
        cost_total:    newCostTotal,
        cost_per_bird: headcount > 0 ? newCostTotal / headcount : 0,
        input_method:  editForm.inputMethod,
      });
      if (productionLog) {
        await updateProductionLog(productionLog.id, {
          egg_count:      editForm.eggCount || null,
          water_consumed: editForm.water !== '' ? Number(editForm.water) : null,
          litter_count:   editForm.litterCount || null,
          litter_size:    editForm.litterSize || null,
          litter_notes:   editForm.litterNotes || null,
        });
      }
      await loadSessionData(date);
      setEditSuccess('Changes saved ✓');
      setTimeout(() => setEditSuccess(''), 3000);
      setEditingFlock(null);
    } catch (err) {
      setEditError(err.message || 'Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    setEditSaving(true);
    try {
      await deleteFeedingEvent(editingFlock.feedingEvent.id);
      await loadSessionData(date);
      setEditingFlock(null);
      setConfirmDelete(false);
    } catch (err) {
      setEditError(err.message || 'Failed to delete.');
    } finally {
      setEditSaving(false);
    }
  }

  // Derived values for Stage 2 edit card
  const editClassConfig = editingFlock ? (() => {
    const qf = editingFlock.queueFlock;
    const cfg = getClassConfig(qf?.class_type || 'other');
    return {
      ...cfg,
      producesEggs:   qf?.produces_eggs  ?? cfg.producesEggs,
      litterTracking: qf?.produces_young ?? cfg.litterTracking,
      producesMilk:   qf?.produces_milk  ?? cfg.producesMilk,
    };
  })() : null;

  const editFeedOptions = editingFlock ? (() => {
    const origId   = editingFlock.feedingEvent.feed_types?.id;
    const origName = editingFlock.feedingEvent.feed_types?.name;
    const assigned = editingFlock.queueFlock?.assigned_feeds || [];
    const map = new Map(assigned.map(f => [f.feed_type_id, f]));
    if (origId && !map.has(origId)) {
      map.set(origId, { feed_type_id: origId, name: origName, cost_per_unit: editingFlock.feedingEvent.feed_types?.cost_per_unit ?? 0 });
    }
    return [...map.values()];
  })() : [];

  const editCostCalc = editingFlock ? (() => {
    const weight    = Number(editForm.feedWeight) || 0;
    const headcount = editingFlock.queueFlock?.current_headcount || editingFlock.feedingEvent.flocks?.current_headcount || 1;
    const feedOpt   = editFeedOptions.find(f => f.feed_type_id === Number(editForm.feedTypeId));
    const cpu       = feedOpt?.cost_per_unit ?? feedOpt?.cost_per_lb ?? 0;
    const total     = weight * cpu;
    return { total, perBird: headcount > 0 ? total / headcount : 0 };
  })() : { total: 0, perBird: 0 };

  return (
    <>
      <div className="fixed inset-0 z-[65] bg-[rgba(3,8,3,0.72)]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-[70] w-[520px] max-[640px]:inset-x-0 max-[640px]:w-auto bg-[var(--bg-surface)] border-l border-[var(--border)] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {editingFlock && (
              <button type="button" onClick={() => setEditingFlock(null)}
                className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] mr-1">
                ←
              </button>
            )}
            <h2 className="display-font text-xl leading-none m-0">Edit Day</h2>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close edit panel"
            className="btn btn-circle btn-sm bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--accent-danger)] hover:border-[var(--accent-danger)] hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Date selector */}
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm text-[var(--text-primary)]">
              {new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </span>
            <button
              className="font-mono text-xs text-[var(--accent-primary)] hover:underline bg-transparent border-0 p-0 cursor-pointer"
              type="button" onClick={() => setShowDatePicker(v => !v)}
            >
              Change date
            </button>
          </div>
          {showDatePicker && (
            <input
              className="mt-2 bg-[var(--bg-base)] border border-[var(--border)] rounded-md text-[var(--text-primary)] min-h-[36px] py-[7px] px-[10px]"
              type="date" value={date} max={getLocalDateString()}
              onChange={e => { setDate(e.target.value); setShowDatePicker(false); }}
            />
          )}
          {!isToday && (
            <div className="warn-banner mt-2">
              <AlertTriangle size={14} aria-hidden="true" /> Editing past session
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 grid gap-4 content-start">
          {sessionLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="loading loading-spinner text-[var(--accent-primary)]" />
            </div>
          ) : editingFlock ? (
            /* ── STAGE 2 — Edit Card ──────────────────────────────────────────── */
            <div className="grid gap-4">
              <button type="button" onClick={() => setEditingFlock(null)}
                className="font-mono text-xs text-[var(--accent-primary)] hover:underline text-left w-fit">
                ← Back to log
              </button>

              {/* Flock header */}
              <div className="bg-[var(--bg-surface)] rounded-xl border-2 border-[var(--accent-primary)] p-4">
                <p className="font-mono text-[10px] text-[var(--accent-primary)] uppercase tracking-wider m-0 mb-1">Editing:</p>
                <h2 className="display-font text-2xl leading-none m-0 mb-1 text-[var(--text-primary)]">
                  {editingFlock.feedingEvent.flocks?.name}
                </h2>
                <p className="font-mono text-xs text-[var(--text-muted)] m-0">
                  {editingFlock.feedingEvent.flocks?.breeds?.name}
                  {editingFlock.feedingEvent.flocks?.breeds?.animal_types?.name
                    ? ` · ${editingFlock.feedingEvent.flocks.breeds.animal_types.name}` : ''}
                </p>
              </div>

              {/* Feed */}
              <section className="border-t border-[rgba(46,125,50,0.55)] grid gap-3 pt-4">
                <h2 className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-[13px] font-bold m-0 uppercase">Feed</h2>
                {editFeedOptions.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {editFeedOptions.map(f => (
                      <button key={f.feed_type_id} type="button"
                        className={["bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[36px] px-3 py-2 font-mono text-sm",
                          Number(editForm.feedTypeId) === f.feed_type_id ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold" : ""].join(" ")}
                        onClick={() => setEditForm(prev => ({ ...prev, feedTypeId: f.feed_type_id }))}>
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
                {editFeedOptions.length === 1 && (
                  <p className="font-mono text-sm text-[var(--text-secondary)] m-0">{editFeedOptions[0]?.name}</p>
                )}
                <label className="flex items-baseline gap-3">
                  <input
                    className="bg-transparent border-0 border-b border-[var(--border)] text-[var(--text-primary)] font-[JetBrains_Mono,monospace] text-[36px] max-w-[220px] outline-none py-1 px-0"
                    min="0" step="0.01" type="number"
                    value={editForm.feedWeight}
                    onChange={e => setEditForm(prev => ({ ...prev, feedWeight: e.target.value }))}
                  />
                  <span className="text-[var(--text-muted)]">lbs</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {["manual", "scale"].map(m => (
                    <button key={m} type="button"
                      className={["bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[36px] px-3 py-2 font-mono text-sm",
                        editForm.inputMethod === m ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[#071107] font-bold" : ""].join(" ")}
                      onClick={() => setEditForm(prev => ({ ...prev, inputMethod: m }))}>
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>
                {editCostCalc.total > 0 && (
                  <p className="font-mono text-xs text-[var(--text-muted)] m-0">
                    New cost: {formatMoney(editCostCalc.total)} · {formatMoney(editCostCalc.perBird)}/bird
                  </p>
                )}
              </section>

              {/* Water */}
              <section className="border-t border-[rgba(46,125,50,0.55)] grid gap-3 pt-4">
                <h2 className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-[13px] font-bold m-0 uppercase">Water</h2>
                <div className="flex items-center gap-3">
                  <input
                    className="bg-transparent border-0 border-b border-[var(--border)] text-[var(--text-primary)] font-[JetBrains_Mono,monospace] text-[28px] max-w-[150px] outline-none py-1 px-0"
                    min="0" placeholder="0.0" step="0.1" type="number"
                    value={editForm.water}
                    onChange={e => setEditForm(prev => ({ ...prev, water: e.target.value }))}
                  />
                  <span className="text-[var(--text-muted)]">gal</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 5, 10].map(amt => (
                    <button key={amt} type="button"
                      className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[30px] px-3 py-1 text-xs font-mono hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
                      onClick={() => setEditForm(prev => ({ ...prev, water: String(amt) }))}>
                      {amt} gal
                    </button>
                  ))}
                </div>
              </section>

              {/* Egg collection */}
              {editClassConfig?.producesEggs && (
                <section className="border-t border-[rgba(46,125,50,0.55)] grid gap-3 pt-4">
                  <h2 className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-[13px] font-bold m-0 uppercase">Egg Collection</h2>
                  <div className="flex items-center gap-3">
                    <button type="button"
                      className="inline-flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] h-10 w-10 p-0 hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
                      onClick={() => setEditForm(prev => ({ ...prev, eggCount: Math.max(Number(prev.eggCount) - 1, 0) }))}>
                      -
                    </button>
                    <span className="number-font text-[var(--text-primary)] text-[28px] min-w-[54px] text-center">{editForm.eggCount}</span>
                    <button type="button"
                      className="inline-flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] h-10 w-10 p-0 hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
                      onClick={() => setEditForm(prev => ({ ...prev, eggCount: Number(prev.eggCount) + 1 }))}>
                      +
                    </button>
                  </div>
                </section>
              )}

              {/* Litter */}
              {editClassConfig?.litterTracking && (
                <section className="border-t border-[rgba(46,125,50,0.55)] grid gap-3 pt-4">
                  <h2 className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-[13px] font-bold m-0 uppercase">
                    Litter / {editClassConfig.youngTerm}
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="field">
                      <span>Litters born</span>
                      <input type="number" min="0" value={editForm.litterCount}
                        onChange={e => setEditForm(prev => ({ ...prev, litterCount: e.target.value }))} />
                    </label>
                    <label className="field">
                      <span>{editClassConfig.youngTerm} born</span>
                      <input type="number" min="0" value={editForm.litterSize}
                        onChange={e => setEditForm(prev => ({ ...prev, litterSize: e.target.value }))} />
                    </label>
                  </div>
                  <label className="field">
                    <span>Notes</span>
                    <input type="text" maxLength={500} value={editForm.litterNotes}
                      onChange={e => setEditForm(prev => ({ ...prev, litterNotes: e.target.value }))} />
                  </label>
                </section>
              )}

              {/* Observations */}
              <section className="border-t border-[rgba(46,125,50,0.55)] grid gap-3 pt-4">
                <h2 className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-[13px] font-bold m-0 uppercase">Observations</h2>
                {editingObs && (
                  <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4">
                    <ObservationEntry compact
                      flockId={editingFlock.feedingEvent.flock_id}
                      animals={editFlockAnimals}
                      editingObs={editingObs}
                      userId={userId}
                      onSave={updated => { setEditObs(prev => prev.map(o => o.id === updated.id ? updated : o)); setEditingObs(null); }}
                      onCancel={() => setEditingObs(null)}
                    />
                  </div>
                )}
                {editObs.map(obs => (
                  <ObservationCard key={obs.id} obs={obs} showFlock={false} compact
                    onEdit={o => { setShowAddEditObs(false); setEditingObs(o); }}
                    onDelete={async obsId => { await deleteObservation(obsId); setEditObs(prev => prev.filter(o => o.id !== obsId)); }}
                  />
                ))}
                {!editingObs && !showAddEditObs ? (
                  <button type="button" onClick={() => setShowAddEditObs(true)}
                    className="btn btn-sm btn-ghost w-full font-mono border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]">
                    + Add observation
                  </button>
                ) : !editingObs ? (
                  <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4">
                    <ObservationEntry compact
                      flockId={editingFlock.feedingEvent.flock_id}
                      animals={editFlockAnimals}
                      userId={userId}
                      onSave={obs => { setEditObs(prev => [...prev, obs]); setShowAddEditObs(false); }}
                      onCancel={() => setShowAddEditObs(false)}
                    />
                  </div>
                ) : null}
              </section>

              {/* Feedback */}
              {editSuccess && (
                <div className="bg-[rgba(76,175,80,0.1)] border border-[var(--accent-primary)] rounded-lg px-4 py-2 font-mono text-xs text-[var(--accent-primary)]">
                  {editSuccess}
                </div>
              )}
              {editError && (
                <div className="bg-[rgba(198,40,40,0.1)] border border-[rgba(198,40,40,0.4)] rounded-lg px-4 py-2 font-mono text-xs text-[#ef9a9a]">
                  {editError}
                </div>
              )}

              {/* Save */}
              <button type="button" disabled={editSaving || Number(editForm.feedWeight) <= 0}
                onClick={handleSave}
                className="primary-button w-full disabled:opacity-40">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>

              {/* Delete */}
              {confirmDelete ? (
                <div className="flex gap-2">
                  <button type="button" disabled={editSaving} onClick={handleDelete}
                    className="bg-[rgba(198,40,40,0.2)] border border-[rgba(198,40,40,0.5)] rounded-lg text-[#ef9a9a] font-mono text-xs py-2 px-4 flex-1 cursor-pointer hover:bg-[rgba(198,40,40,0.3)] disabled:opacity-50">
                    {editSaving ? '...' : 'Confirm Delete'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="btn btn-ghost font-mono text-[var(--accent-danger)] border border-[var(--accent-danger)] w-full">
                  Delete this entry
                </button>
              )}
            </div>
          ) : !sessionData || sessionData.feedings.length === 0 ? (
            /* ── Empty state ───────────────────────────────────────────────────── */
            <div className="grid gap-4 py-8 text-center">
              <p className="font-mono text-sm text-[var(--text-muted)]">No feeding events to edit for this date.</p>
              {unloggedFlocks.length > 0 && (
                <div className="grid gap-2">
                  <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mb-0">Not yet logged</p>
                  {unloggedFlocks.map(flock => (
                    <div key={flock.flock_id} onClick={() => handleLogNow(flock)}
                      className="flex items-center gap-3 p-4 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] border-l-4 border-l-[var(--accent-warn)] hover:border-[var(--accent-primary)] cursor-pointer transition-all">
                      <span className="text-2xl">{flock.breeds?.animal_types?.emoji || '🐾'}</span>
                      <div className="flex-1">
                        <p className="font-mono text-sm font-bold text-[var(--text-primary)] m-0">{flock.name}</p>
                      </div>
                      <span className="text-[var(--text-muted)] text-xl">›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── STAGE 1 — Flock selection list ────────────────────────────────── */
            <>
              {editSuccess && (
                <div className="bg-[rgba(76,175,80,0.1)] border border-[var(--accent-primary)] rounded-lg px-4 py-2 font-mono text-xs text-[var(--accent-primary)]">
                  {editSuccess}
                </div>
              )}
              <div>
                <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Logged today</p>
                {sessionData.feedings.map(feedingEvent => {
                  const ts = feedingEvent.timestamp
                    ? new Date(feedingEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <div key={feedingEvent.id} onClick={() => selectFlock(feedingEvent)}
                      className="flex items-center gap-3 p-4 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] hover:border-[var(--accent-primary)] cursor-pointer transition-all mb-3">
                      <span className="text-2xl">{feedingEvent.flocks?.breeds?.animal_types?.emoji || '🐾'}</span>
                      <div className="flex-1">
                        <p className="font-mono text-sm font-bold text-[var(--text-primary)] m-0">{feedingEvent.flocks?.name}</p>
                        <p className="font-mono text-xs text-[var(--text-muted)] m-0">
                          {feedingEvent.flocks?.breeds?.name}
                          {feedingEvent.flocks?.breeds?.animal_types?.name
                            ? ` · ${feedingEvent.flocks.breeds.animal_types.name}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-none">
                        <p className="font-mono text-xs text-[var(--text-secondary)] m-0">
                          {formatNumber(feedingEvent.total_weight, 1)} lbs
                        </p>
                        <p className="font-mono text-[10px] text-[var(--text-muted)] m-0">{ts}</p>
                      </div>
                      <span className="text-[var(--text-muted)] text-xl flex-none">›</span>
                    </div>
                  );
                })}
              </div>
              {unloggedFlocks.length > 0 && (
                <div>
                  <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Not yet logged</p>
                  {unloggedFlocks.map(flock => (
                    <div key={flock.flock_id} onClick={() => handleLogNow(flock)}
                      className="flex items-center gap-3 p-4 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] border-l-4 border-l-[var(--accent-warn)] hover:border-[var(--accent-primary)] cursor-pointer transition-all mb-3">
                      <span className="text-2xl">{flock.breeds?.animal_types?.emoji || '🐾'}</span>
                      <div className="flex-1">
                        <p className="font-mono text-sm font-bold text-[var(--text-primary)] m-0">{flock.name}</p>
                        <p className="font-mono text-xs text-[var(--text-muted)] m-0">
                          {flock.breeds?.name}
                          {flock.breeds?.animal_types?.name ? ` · ${flock.breeds.animal_types.name}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-none">
                        <span className="font-mono text-xs bg-[rgba(255,143,0,0.15)] text-[var(--accent-warn)] px-2 py-0.5 rounded-full">
                          Not logged
                        </span>
                      </div>
                      <span className="text-[var(--text-muted)] text-xl flex-none">›</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function FlockPickerModal({ queue, onPick, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-[rgba(3,8,3,0.72)]" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm grid gap-4 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="display-font text-xl leading-none m-0">Restart from flock</h2>
              <p className="font-mono text-xs text-[var(--text-muted)] mt-2 mb-0">
                All flocks before your selection will be marked complete.
              </p>
            </div>
            <button
              className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-transparent border border-[var(--border)] text-[var(--text-muted)] cursor-pointer flex-none"
              type="button"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </div>
          <div className="grid gap-2 max-h-72 overflow-y-auto">
            {queue.map((flock, index) => (
              <button
                key={flock.flock_id}
                className="text-left bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-4 py-3 font-mono text-sm text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] cursor-pointer w-full"
                type="button"
                onClick={() => onPick(index)}
              >
                {flock.name}
                <span className="text-[var(--text-muted)] ml-2 text-xs">#{index + 1}</span>
              </button>
            ))}
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function RestartConfirmModal({ onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[rgba(3,8,3,0.72)]" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm grid gap-4 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
          <h2 className="display-font text-xl text-[var(--accent-danger)] leading-none m-0">Start day over?</h2>
          <p className="font-mono text-sm text-[var(--text-secondary)] m-0">
            This will permanently delete all of today's feeding events. Feed inventory will be restored automatically.
          </p>
          <div className="flex gap-2">
            <button
              className="bg-[rgba(198,40,40,0.2)] border border-[rgba(198,40,40,0.5)] rounded-lg text-[#ef9a9a] font-mono text-sm py-2 px-4 flex-1 cursor-pointer hover:bg-[rgba(198,40,40,0.3)] disabled:opacity-50"
              type="button"
              disabled={busy}
              onClick={handleConfirm}
            >
              {busy ? "Deleting..." : "Delete & Start Over"}
            </button>
            <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Existing sub-components (unchanged) ──────────────────────────────────────

function SummaryTile({ label, value }) {
  return (
    <article className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg grid gap-[7px] p-[14px]">
      <strong className="number-font text-[var(--text-primary)] text-[22px] [overflow-wrap:anywhere]">{value}</strong>
      <span className="text-[var(--text-muted)] text-xs">{label}</span>
    </article>
  );
}

function DailyProgress({ completed, currentFlockId, percent, queue, skipped }) {
  return (
    <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg grid gap-3 p-[14px]">
      <div className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs">
        {completed.length} of {queue.length} flocks fed today
      </div>
      <div className="bg-[rgba(85,139,90,0.25)] rounded-full h-[10px] overflow-hidden">
        <span className="bg-[var(--accent-primary)] block h-full transition-[width_0.3s_ease]" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-[2px]">
        {queue.map((flock) => {
          const isComplete = completed.includes(flock.flock_id);
          const isCurrent = flock.flock_id === currentFlockId;
          const isSkipped = skipped.includes(flock.flock_id);
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
    birthsToday,
    setBirthsToday,
    blockReason,
    casualtyNotes,
    canLog,
    costPerBird,
    costTotal,
    currentAnimalClass,
    currentFeed,
    currentFlock,
    effectiveWeight,
    eggCount,
    feedWeight,
    headcountChange,
    inputMethod,
    isBackdated,
    isDailyMode,
    litterCount,
    litterNotes,
    litterSize,
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
    flockAnimals,
    observations,
    setObservations,
    showAddObs,
    setShowAddObs,
    editingObs,
    setEditingObs,
    userId,
    setAutoCapture,
    setCasualtyNotes,
    setEggCount,
    setFeedWeight,
    setHeadcountChange,
    setInputMethod,
    setLitterCount,
    setLitterNotes,
    setLitterSize,
    setProductionSkipped,
    setQuickFlockId,
    setSelectedFeed,
    setSessionDate,
    setShowDatePicker,
    setWaterConsumed,
    showDatePicker,
    showEggs,
    showLitter,
    showMilk,
    showWorking,
    showProduction,
    stepLabel,
    waterConsumed,
    weightPerBird,
    onQuickSubmit,
    flash,
    showCostDetails,
    setShowCostDetails,
    alreadyLogged,
    currentFlockLog,
    openEditPanel,
    setSessionLog,
  } = props;

  const cardClass = `scale-entry-inner bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-[18px] grid gap-[18px]${flash ? " shadow-[0_0_0_2px_rgba(76,175,80,0.45)]" : ""}`;

  if (!currentFlock) {
    return <section className={cardClass}>No flocks are ready for Scale House.</section>;
  }

  return (
    <section className={cardClass}>
      {/* Date row */}
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <button
          className="bg-transparent border-0 text-[var(--text-secondary)] p-0 text-left"
          type="button"
          onClick={() => setShowDatePicker((value) => !value)}
        >
          Logging for a different date?
        </button>
        {showDatePicker ? (
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

      {/* Currently logging card (daily mode only) */}
      {isDailyMode && (
        <div className="bg-[var(--bg-elevated)] rounded-xl border-2 border-[var(--accent-primary)] p-4">
          <p className="font-mono text-[10px] text-[var(--accent-primary)] uppercase tracking-wider m-0 mb-1">
            Currently logging:
          </p>
          <h2 className="display-font text-2xl leading-none m-0 mb-1 text-[var(--text-primary)]">
            {currentFlock.name}
          </h2>
          <p className="font-mono text-xs text-[var(--text-muted)] m-0">
            {currentFlock.breed_name}{currentFlock.pen_name ? ` · ${currentFlock.pen_name}` : ""}
          </p>
        </div>
      )}

      {/* Flock selector (quick mode only) */}
      {!isDailyMode ? (
        <div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider m-0 mb-1.5">
            Select a flock to log
          </p>
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
        </div>
      ) : null}

      {/* Flock header */}
      <header className="grid gap-[14px] items-start grid-cols-[58px_minmax(0,1fr)_auto] max-[980px]:grid-cols-[48px_minmax(0,1fr)]">
        <div className="flex items-center justify-center bg-[var(--bg-base)] border border-[var(--border)] rounded-lg h-[58px] text-[30px]">
          {getAnimalEmoji(currentFlock)}
        </div>
        <div>
          <h1 className="display-font text-[32px] leading-none m-0">{currentFlock.name}</h1>
          <p className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-[13px] mt-2 m-0">
            {currentFlock.breed_name}
            {currentFlock.pen_name ? ` / ${currentFlock.pen_name}` : ""}
          </p>
        </div>
        <div className="grid gap-2 items-end justify-items-end text-[var(--text-muted)] font-[IBM_Plex_Mono,monospace] text-xs max-[980px]:col-span-full max-[980px]:justify-items-start">
          <span className={[
            "border rounded-full py-1 px-[9px] capitalize",
            currentFlock.designation === "layer" ? "border-[#42a5f5] text-[#90caf9]" :
            currentFlock.designation === "breeder" ? "border-[#ab47bc] text-[#ce93d8]" :
            currentFlock.designation === "meat" ? "border-[var(--accent-warn)] text-[#ffcc80]" :
            "border-[var(--border)] text-[var(--text-secondary)]"
          ].join(" ")}>
            {currentFlock.designation}
          </span>
          <span className="border border-[var(--border)] rounded-full py-1 px-[9px] text-[var(--text-muted)] capitalize">
            {currentAnimalClass.groupTerm}
          </span>
          <span>{stepLabel}</span>
        </div>
      </header>

      {alreadyLogged ? (
        <>
          {/* ── Already-logged review card ─────────────────────────────────── */}
          <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--accent-primary)] p-4">
            <p className="font-mono text-xs font-bold text-[var(--accent-primary)] uppercase tracking-wider mb-3">
              Already logged for this session
            </p>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs text-[var(--text-muted)]">Feed:</span>
              <span className="font-mono text-sm text-[var(--text-primary)]">
                {currentFlockLog.feedingEvent.total_weight} lbs · {currentFlockLog.feedingEvent.feed_name}
              </span>
              <button
                type="button"
                onClick={openEditPanel}
                className="font-mono text-xs text-[var(--accent-primary)] hover:underline ml-auto"
              >
                Edit →
              </button>
            </div>
            {currentFlockLog.productionLog.water_consumed ? (
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-[var(--text-muted)]">Water:</span>
                <span className="font-mono text-sm text-[var(--text-primary)]">{currentFlockLog.productionLog.water_consumed} gal</span>
              </div>
            ) : null}
            {currentFlockLog.productionLog.egg_count != null ? (
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-[var(--text-muted)]">Eggs:</span>
                <span className="font-mono text-sm text-[var(--text-primary)]">{currentFlockLog.productionLog.egg_count}</span>
              </div>
            ) : null}
            {currentFlockLog.productionLog.litter_size != null ? (
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-[var(--text-muted)]">{currentAnimalClass.youngTerm} born:</span>
                <span className="font-mono text-sm text-[var(--text-primary)]">{currentFlockLog.productionLog.litter_size}</span>
              </div>
            ) : null}
            {currentFlockLog.observations.length > 0 ? (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <p className="font-mono text-xs text-[var(--text-muted)] mb-2">
                  {currentFlockLog.observations.length} observation{currentFlockLog.observations.length !== 1 ? 's' : ''} logged
                </p>
                {currentFlockLog.observations.map((obs, i) => (
                  <div key={i} className="font-mono text-xs text-[var(--text-secondary)] mb-1 flex items-center gap-2">
                    <span>{OBSERVATION_CATEGORIES.find(c => c.key === obs.category)?.emoji}</span>
                    <span>{obs.selected_options?.join(', ') || obs.detail}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* ── Add another observation ────────────────────────────────────── */}
          <div className="border-t border-[rgba(46,125,50,0.55)] pt-4">
            <p className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Add another observation
            </p>
            {editingObs && (
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4 mb-1">
                <ObservationEntry
                  compact={true}
                  flockId={currentFlock?.flock_id}
                  animals={flockAnimals}
                  editingObs={editingObs}
                  userId={userId}
                  onSave={(updated) => {
                    const animal = flockAnimals.find(a => a.id === updated.animal_id);
                    setSessionLog(prev => ({
                      ...prev,
                      [currentFlock.flock_id]: {
                        ...prev[currentFlock.flock_id],
                        observations: prev[currentFlock.flock_id].observations.map(o =>
                          o.id === updated.id
                            ? { ...updated, animals: animal ? { id: animal.id, identifier: animal.identifier } : null }
                            : o
                        ),
                      },
                    }));
                    setEditingObs(null);
                  }}
                  onCancel={() => setEditingObs(null)}
                />
              </div>
            )}
            {!editingObs && !showAddObs ? (
              <button
                type="button"
                onClick={() => setShowAddObs(true)}
                className="btn btn-sm btn-ghost w-full font-mono border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
              >
                + Add observation
              </button>
            ) : !editingObs ? (
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4">
                <ObservationEntry
                  compact={true}
                  flockId={currentFlock?.flock_id}
                  animals={flockAnimals}
                  userId={userId}
                  onSave={(obs) => {
                    const animal = flockAnimals.find(a => a.id === obs.animal_id);
                    const obsWithAnimals = { ...obs, animals: animal ? { id: animal.id, identifier: animal.identifier } : null };
                    setSessionLog(prev => ({
                      ...prev,
                      [currentFlock.flock_id]: {
                        ...prev[currentFlock.flock_id],
                        observations: [...prev[currentFlock.flock_id].observations, obsWithAnimals],
                      },
                    }));
                    setShowAddObs(false);
                  }}
                  onCancel={() => setShowAddObs(false)}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <ScaleSection title="Headcount Check">
            <p className="text-[var(--text-muted)] text-xs m-0">Last recorded: {currentFlock.current_headcount} {currentAnimalClass.headTerm.toLowerCase()}</p>
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] h-10 w-10 p-0 hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
                type="button"
                onClick={() => setHeadcountChange((value) => value - 1)}
              >
                -
              </button>
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
              <label className="flex items-baseline gap-3">
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
              <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg grid gap-3 p-[14px]">
                <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)] text-xs">
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
                    <span className="rounded-full text-[11px] font-bold py-[3px] px-[7px] uppercase bg-[rgba(76,175,80,0.16)] text-[var(--accent-primary)]">STABLE</span>
                  ) : null}
                  {scaleLive ? (
                    <span className="rounded-full text-[11px] font-bold py-[3px] px-[7px] uppercase bg-[rgba(255,143,0,0.16)] text-[var(--accent-warn)] [animation:pulse-ring_1.4s_infinite]">LIVE</span>
                  ) : null}
                </div>
                <div className="number-font text-[var(--text-primary)] text-[48px] leading-none">
                  {formatNumber(scaleWeight, 2)} <span className="text-[var(--text-muted)] text-[16px]">lbs</span>
                </div>
                <label className="flex items-center text-[var(--text-secondary)] text-xs gap-2">
                  <input
                    checked={autoCapture}
                    type="checkbox"
                    onChange={(event) => setAutoCapture(event.target.checked)}
                  />
                  Auto-capture first stable reading
                </label>
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

            <p className="text-[var(--text-muted)] text-xs m-0">
              Feed remaining: {currentFeed ? `${formatNumber(currentFeed.current_on_hand)} ${currentFeed.unit}` : "Select feed"}
            </p>
          </ScaleSection>

          <ScaleSection title="Water">
            <div className="flex items-center gap-3">
              <input
                className="bg-transparent border-0 border-b border-[var(--border)] text-[var(--text-primary)] font-[JetBrains_Mono,monospace] text-[28px] max-w-[150px] outline-none py-1 px-0"
                min="0"
                placeholder="0.0"
                step="0.1"
                type="number"
                value={waterConsumed}
                onChange={(event) => setWaterConsumed(event.target.value)}
              />
              <span className="text-[var(--text-muted)]">gal</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 5, 10].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] min-h-[30px] px-3 py-1 text-xs font-mono hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
                  onClick={() => setWaterConsumed(String(amt))}
                >
                  {amt} gal
                </button>
              ))}
            </div>
          </ScaleSection>

          {showEggs ? (
            <ScaleSection title="Egg Collection">
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
              <button
                className="bg-transparent border-0 text-[var(--text-secondary)] p-0 text-left"
                type="button"
                onClick={() => setProductionSkipped(true)}
              >
                Skip production data {"→"}
              </button>
            </ScaleSection>
          ) : null}

          {showLitter ? (
            <ScaleSection title={`Litter / ${currentAnimalClass.youngTerm}`}>
              <label className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
                <input
                  checked={birthsToday}
                  type="checkbox"
                  onChange={(event) => {
                    setBirthsToday(event.target.checked);
                    if (!event.target.checked) {
                      setLitterCount("");
                      setLitterSize("");
                      setLitterNotes("");
                    }
                  }}
                />
                Births Today?
              </label>
              {birthsToday ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="field">
                      <span>Litters born</span>
                      <input
                        min="0"
                        step="1"
                        type="number"
                        value={litterCount}
                        onChange={(event) => setLitterCount(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>{currentAnimalClass.youngTerm} born</span>
                      <input
                        min="0"
                        step="1"
                        type="number"
                        value={litterSize}
                        onChange={(event) => setLitterSize(event.target.value)}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>Notes</span>
                    <input
                      maxLength={500}
                      type="text"
                      value={litterNotes}
                      onChange={(event) => setLitterNotes(event.target.value)}
                    />
                  </label>
                </>
              ) : null}
              <button
                className="bg-transparent border-0 text-[var(--text-secondary)] p-0 text-left"
                type="button"
                onClick={() => setProductionSkipped(true)}
              >
                Skip for now {"→"}
              </button>
            </ScaleSection>
          ) : null}

          {showMilk ? (
            <ScaleSection title="Milk Production">
              <p className="text-[var(--text-muted)] text-xs m-0">🥛 Milk tracking coming soon</p>
            </ScaleSection>
          ) : null}

          {showWorking ? (
            <ScaleSection title="Working Animal">
              <p className="text-[var(--text-muted)] text-xs m-0">🛡️ Guardian — no production metrics tracked</p>
            </ScaleSection>
          ) : null}

          <ScaleSection title="Observations">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-[var(--text-muted)]">Log anything unusual about this flock</span>
              {observations.length > 0 && (
                <span className="badge badge-xs font-mono bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]">
                  {observations.length} logged
                </span>
              )}
            </div>

            {editingObs && (
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4 mb-1">
                <ObservationEntry
                  compact={true}
                  flockId={currentFlock?.flock_id}
                  animals={flockAnimals}
                  editingObs={editingObs}
                  userId={userId}
                  onSave={(updated) => {
                    const animal = flockAnimals.find(a => a.id === updated.animal_id);
                    setObservations(prev =>
                      prev.map(o => o.id === updated.id ? {
                        ...updated,
                        animals: animal ? { id: animal.id, identifier: animal.identifier } : null,
                      } : o)
                    );
                    setEditingObs(null);
                  }}
                  onCancel={() => setEditingObs(null)}
                />
              </div>
            )}

            {observations.map((obs) => (
              <ObservationCard
                key={obs.id}
                obs={obs}
                showFlock={false}
                compact={true}
                onEdit={(o) => { setShowAddObs(false); setEditingObs(o); }}
                onDelete={async (obsId) => {
                  await deleteObservation(obsId);
                  setObservations(prev => prev.filter(o => o.id !== obsId));
                }}
              />
            ))}

            {!editingObs && !showAddObs ? (
              <button
                type="button"
                onClick={() => setShowAddObs(true)}
                className="btn btn-sm btn-ghost w-full font-mono border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
              >
                + Add observation
              </button>
            ) : !editingObs ? (
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4">
                <ObservationEntry
                  compact={true}
                  flockId={currentFlock?.flock_id}
                  animals={flockAnimals}
                  userId={userId}
                  onSave={(obs) => {
                    const animal = flockAnimals.find(a => a.id === obs.animal_id);
                    setObservations(prev => [...prev, {
                      ...obs,
                      animals: animal ? { id: animal.id, identifier: animal.identifier } : null,
                    }]);
                    setShowAddObs(false);
                  }}
                  onCancel={() => setShowAddObs(false)}
                />
              </div>
            ) : null}
          </ScaleSection>

          <div className="border-t border-[rgba(46,125,50,0.55)] pt-4 mt-1">
            <button
              type="button"
              className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors flex items-center gap-1"
              onClick={() => setShowCostDetails(!showCostDetails)}
            >
              {showCostDetails ? "▾" : "▸"} {showCostDetails ? "Hide" : "Show"} cost details
            </button>
            {showCostDetails && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-[var(--bg-elevated)] rounded-lg p-2 border border-[var(--border)] text-center">
                  <p className="font-mono text-xs text-[var(--text-muted)] mb-1 m-0">lbs/bird</p>
                  <p className="font-mono text-sm text-[var(--text-primary)] font-bold m-0">
                    {effectiveWeight > 0 && adjustedHeadcount > 0 ? formatNumber(weightPerBird, 3) : "—"}
                  </p>
                </div>
                <div className="bg-[var(--bg-elevated)] rounded-lg p-2 border border-[var(--border)] text-center">
                  <p className="font-mono text-xs text-[var(--text-muted)] mb-1 m-0">total cost</p>
                  <p className="font-mono text-sm text-[var(--accent-primary)] font-bold m-0">
                    {effectiveWeight > 0 && currentFeed ? formatMoney(costTotal) : "—"}
                  </p>
                </div>
                <div className="bg-[var(--bg-elevated)] rounded-lg p-2 border border-[var(--border)] text-center">
                  <p className="font-mono text-xs text-[var(--text-muted)] mb-1 m-0">cost/bird</p>
                  <p className="font-mono text-sm text-[var(--text-primary)] font-bold m-0">
                    {effectiveWeight > 0 && currentFeed && adjustedHeadcount > 0 ? formatMoney(costPerBird) : "—"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!isDailyMode ? (
            <div className="grid gap-1">
              {!canLog && !saving && blockReason && (
                <span className="font-mono text-[11px] text-[var(--accent-warn)] text-center">{blockReason}</span>
              )}
              <button className="primary-button w-full" disabled={!canLog || saving} type="button" onClick={onQuickSubmit}>
                {saving ? "Logging..." : "Log Feeding"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function ScaleSection({ children, title }) {
  return (
    <section className="border-t border-[rgba(46,125,50,0.55)] grid gap-3 pt-4">
      <h2 className="text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-[13px] font-bold m-0 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function TodayLogPanel({ eventsData, onDelete }) {
  const events = eventsData.events || [];
  const totals = eventsData.totals || {};

  return (
    <aside className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg min-w-0 p-[18px] grid gap-[14px] max-[980px]:static sticky top-14 lg:top-6">
      <header>
        <h2 className="display-font text-[20px] leading-none m-0">Today's Log</h2>
        <p className="text-[var(--text-muted)] font-[IBM_Plex_Mono,monospace] text-xs mt-2 m-0">
          {formatNumber(totals.totalWeight || 0)} lbs {"·"} {formatMoney(totals.totalCost || 0)}{" "}
          {"·"} {totals.eventCount || 0} events
        </p>
      </header>

      <div className="max-h-[620px] overflow-auto">
        <table className="border-collapse w-full min-w-[760px]">
          <thead>
            <tr>
              {["Time", "Flock", "Feed", "Weight", "Water", "Eggs", "Method", ""].map((label, i) => (
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
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{event.flocks?.breeds?.animal_types?.emoji || ""} {event.flocks?.name || ""}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{event.feed_types?.name || ""}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{formatNumber(event.total_weight)} lbs</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{event.water_consumed != null ? `${event.water_consumed} gal` : "—"}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">{event.egg_count != null ? event.egg_count : "—"}</td>
                  <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left">
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
                    <button
                      className="inline-flex items-center justify-center bg-transparent border border-transparent rounded-md text-[var(--text-muted)] min-w-[40px] min-h-[40px] p-0 opacity-50 lg:opacity-0 lg:group-hover:opacity-100 group-hover:border-[rgba(198,40,40,0.6)] group-hover:text-[#ef9a9a]"
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
                <td className="border-b border-[rgba(46,125,50,0.55)] text-[var(--text-secondary)] font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left" colSpan="8">No feedings logged today</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="bg-[var(--bg-surface)] sticky bottom-0 text-[var(--text-primary)] font-bold font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left border-b border-[rgba(46,125,50,0.55)]" colSpan="3">
                Totals
              </td>
              <td className="bg-[var(--bg-surface)] sticky bottom-0 text-[var(--text-primary)] font-bold font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left border-b border-[rgba(46,125,50,0.55)]">
                {formatNumber(totals.totalWeight || 0)} lbs
              </td>
              <td className="bg-[var(--bg-surface)] sticky bottom-0 text-[var(--text-primary)] font-bold font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left border-b border-[rgba(46,125,50,0.55)]" />
              <td className="bg-[var(--bg-surface)] sticky bottom-0 text-[var(--text-primary)] font-bold font-[IBM_Plex_Mono,monospace] text-xs p-[10px] text-left border-b border-[rgba(46,125,50,0.55)]" colSpan="3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </aside>
  );
}

export default ScaleHouse;
