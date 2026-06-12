import React, { useContext, useEffect, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import InlineFeedback from "../../components/InlineFeedback";
import ObservationEntry from "../../components/ObservationEntry";
import ObservationCard from "../../components/ObservationCard";
import AnimalDrawer from "../../components/AnimalDrawer";
import { FarmContext } from "../../context/FarmContext";
import { getFlockDetail, logCasualty, logProduction } from "../../services/flocksApi";
import { getFlockYoungSales, logYoungSale } from "../../services/revenueApi";
import { getFlockAnimals, getObservationHistory, enableFlockTracking, createAnimal, deleteObservation, resolveFollowUp } from "../../services/observationsApi";
import { supabase } from "../../services/supabaseClient";
import { getClassConfig } from "../../utils/animalClass";
import { useAnimalClass } from "../../hooks/useAnimalClass";
import { getLocalDateString, getDaysAgoString } from "../../utils/date";

const todayString = () => getLocalDateString();

function FlockDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { userId } = useContext(FarmContext);
  const [detail, setDetail] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [showLitterModal, setShowLitterModal] = useState(false);
  const [litterForm, setLitterForm] = useState({ date: todayString(), litter_count: 1, litter_size: 0, litter_notes: '' });
  const [youngSales, setYoungSales] = useState([]);
  const [litterLogs, setLitterLogs] = useState([]);
  const [detailTab, setDetailTab] = useState('observations');
  const [flockObs, setFlockObs] = useState([]);
  const [flockAnimals, setFlockAnimals] = useState([]);
  const [showObsEntry, setShowObsEntry] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState(null);
  const [showAddAnimal, setShowAddAnimal] = useState(false);
  const [addAnimalForm, setAddAnimalForm] = useState({ identifier: '', sex: 'female', source: 'hatched', date_of_birth: null });
  const [savingAnimal, setSavingAnimal] = useState(false);
  const [enablingTracking, setEnablingTracking] = useState(false);
  const [editingObs,       setEditingObs]       = useState(null);

  const flock = detail?.flock;
  const stats = detail?.stats || {};
  const animalClass = useAnimalClass(flock);
  const showProduction = Boolean(flock && animalClass.producesEggs && !animalClass.workingAnimal);
  const showWorking = Boolean(flock && animalClass.workingAnimal);

  async function refresh() {
    setLoading(true);
    try {
      const [flockDetail, sales] = await Promise.all([
        getFlockDetail(id),
        getFlockYoungSales(id).catch(() => []),
      ]);
      setDetail(flockDetail);
      setYoungSales(sales);
      const classType = flockDetail?.flock?.class_type || 'other';
      if (getClassConfig(classType).litterTracking) {
        const { data: litters } = await supabase
          .from('production_logs')
          .select('id, date, litter_count, litter_size, litter_notes')
          .eq('flock_id', id)
          .not('litter_count', 'is', null)
          .order('date', { ascending: false });
        setLitterLogs(litters || []);
      } else {
        setLitterLogs([]);
      }
      return true;
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [id]);

  useEffect(() => {
    if (!id) return;
    const today = getLocalDateString();
    const startDate = getDaysAgoString(90);
    getObservationHistory(null, startDate, today, { flockId: Number(id) }).then(setFlockObs).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!flock?.individual_tracking_enabled) { setFlockAnimals([]); return; }
    getFlockAnimals(id).then(setFlockAnimals).catch(() => {});
  }, [id, flock?.individual_tracking_enabled]);

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

  async function submitYoungSale(payload) {
    setFeedback(null);
    try {
      await logYoungSale({ ...payload, flock_id: Number(id) });
      setModal(null);
      if (await refresh()) setFeedback({ type: "success", message: `${animalClass.youngTerm} sale recorded` });
    } catch (error) {
      setFeedback({ type: "error", message: formatError(error) });
    }
  }

  async function handleEnableTracking() {
    setEnablingTracking(true);
    try {
      await enableFlockTracking(id, true);
      await refresh();
    } catch {
      // silent
    } finally {
      setEnablingTracking(false);
    }
  }

  async function handleSaveAnimal() {
    if (!addAnimalForm.identifier) return;
    setSavingAnimal(true);
    try {
      await createAnimal({ ...addAnimalForm, flock_id: Number(id) });
      setShowAddAnimal(false);
      setAddAnimalForm({ identifier: '', sex: 'female', source: 'hatched', date_of_birth: null });
      const animals = await getFlockAnimals(id).catch(() => flockAnimals);
      setFlockAnimals(animals);
    } catch {
      // silent
    } finally {
      setSavingAnimal(false);
    }
  }

  async function reloadObs() {
    const today = getLocalDateString();
    const startDate = getDaysAgoString(90);
    const updated = await getObservationHistory(null, startDate, today, { flockId: Number(id) }).catch(() => flockObs);
    setFlockObs(updated);
  }

  if (loading) return <div className="panel-card">Loading flock detail...</div>;
  if (!flock)  return <div className="panel-card">Flock not found.</div>;

  return (
    <section className="grid gap-[18px]">
      <header className="grid gap-4 items-start grid-cols-[40px_minmax(0,1fr)]">
        <button className="icon-button" type="button" onClick={() => navigate("/flocks")} aria-label="Back to flocks">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-[30px]" aria-hidden="true">{animalClass.emoji}</span>
          <div className="min-w-0">
            <h1 className="display-font text-3xl lg:text-4xl text-[var(--text-primary)] leading-tight break-words">{flock.name}</h1>
            <p className="text-[var(--text-secondary)] text-xs m-0 mt-1">
              {[flock.breed_name, flock.animal_type_name, flock.animal_class_name].filter(Boolean).join(" · ")}
            </p>
            <div className="flex items-center gap-2.5 mt-1">
              <span className={`designation-badge ${flock.designation}`}>{flock.designation}</span>
              {flock.pen_name ? <span className="text-[var(--text-secondary)] text-xs">{flock.pen_name}</span> : null}
            </div>
          </div>
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-2 xl:grid-cols-4 xl:gap-3">
          <button
            className="col-span-2 xl:col-span-1 primary-button"
            type="button"
            onClick={() => navigate(`/scale-house?mode=quick&flock=${flock.id}`)}
          >
            Start Feeding
          </button>
          {showProduction && (
            <button className="btn btn-ghost font-mono text-sm border border-[var(--border)]" type="button" onClick={() => setModal("production")}>
              Log Production
            </button>
          )}
          {animalClass.litterTracking && (
            <button className="btn btn-ghost font-mono text-sm border border-[var(--border)]" type="button" onClick={() => setShowLitterModal(true)}>
              Log Litter
            </button>
          )}
          {animalClass.producesYoung && (
            <button className="btn btn-ghost font-mono text-sm border border-[var(--border)]" type="button" onClick={() => setModal("young_sale")}>
              Sell {animalClass.youngTerm}
            </button>
          )}
          <button className="btn btn-ghost font-mono text-sm border border-[var(--border)]" type="button" onClick={() => setModal("casualty")}>
            Log Headcount Change
          </button>
        </div>
      </header>

      <InlineFeedback message={feedback?.message} type={feedback?.type} />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label={`Current ${animalClass.headTerm}`} value={formatNumber(flock.current_headcount)} />
        <StatCard label="All-time Feed Cost" value={formatMoney(stats.total_feed_cost_alltime)} />
        {animalClass.producesEggs && (
          <StatCard label="All-time Eggs" value={formatNumber(stats.total_eggs_alltime)} />
        )}
        {animalClass.producesEggs && (
          <StatCard
            label="Cost per Dozen"
            value={stats.current_cost_per_dozen == null ? "N/A" : formatMoney(stats.current_cost_per_dozen)}
          />
        )}
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

          {animalClass.litterTracking ? (
            <section className="settings-panel">
              <div className="section-title-row" style={{ padding: "14px 18px" }}>
                <h2 className="display-font">Litter History</h2>
                <button className="text-link-button" type="button" onClick={() => setShowLitterModal(true)}>
                  Log litter
                </button>
              </div>
              <div style={{ padding: "0 18px 18px" }}>
                <DataTable
                  columns={["Date", "Litters", `${animalClass.youngTerm} Born`, "Notes"]}
                  rows={litterLogs.map((e) => [
                    e.date,
                    e.litter_count ?? "",
                    e.litter_size != null ? e.litter_count * e.litter_size : "",
                    e.litter_notes || "",
                  ])}
                  empty="No litter events logged yet"
                />
              </div>
            </section>
          ) : null}

          {animalClass.producesYoung && youngSales.length > 0 ? (
            <section className="settings-panel">
              <div className="section-title-row" style={{ padding: "14px 18px" }}>
                <h2 className="display-font">{animalClass.youngTerm} Sales</h2>
                <button className="text-link-button" type="button" onClick={() => setModal("young_sale")}>
                  Record sale
                </button>
              </div>
              <div style={{ padding: "0 18px 18px" }}>
                <DataTable
                  columns={["Date", "Qty", "$/Head", "Total", "Notes"]}
                  rows={youngSales.map((s) => [
                    s.date,
                    s.quantity,
                    formatMoney(s.price_per_head),
                    formatMoney(s.total_amount),
                    s.notes || "",
                  ])}
                  empty="No sales recorded"
                />
              </div>
            </section>
          ) : null}

          {animalClass.producesMilk && !showWorking ? (
            <section className="settings-panel" style={{ padding: "18px" }}>
              <h2 className="display-font mb-3">Milk Production</h2>
              <div className="opacity-50">
                <span className="font-mono text-xs text-[var(--text-muted)]">
                  🥛 Milk tracking — coming soon
                </span>
              </div>
            </section>
          ) : null}

          {showWorking ? (
            <section className="settings-panel" style={{ padding: "18px" }}>
              <h2 className="display-font mb-3">Working Animal</h2>
              <p className="text-[var(--text-muted)] text-sm m-0">
                🛡️ This is a guardian / working animal. Production metrics (eggs, milk, litter) are not tracked.
              </p>
            </section>
          ) : null}

          <section className="settings-panel" style={{ padding: "18px" }}>
            <h2 className="display-font">Headcount History</h2>
            <p className="headcount-current">
              Current: {formatNumber(flock.current_headcount)} {animalClass.headTerm.toLowerCase()}
            </p>
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

      {/* ── Observations / Animals tab section ── */}
      <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="flex border-b border-[var(--border)]">
          {[['observations', '🔭 Observations'], ['animals', '🐾 Animals']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDetailTab(key)}
              className={`flex-1 font-mono text-xs py-3 px-4 border-b-2 transition-colors ${
                detailTab === key
                  ? 'border-b-[var(--accent-primary)] text-[var(--text-primary)] font-bold bg-[var(--bg-elevated)]'
                  : 'border-b-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {label}
              {key === 'observations' && flockObs.length > 0 && (
                <span className="ml-1.5 badge badge-xs font-mono bg-[var(--bg-base)] border border-[var(--border)] text-[var(--text-muted)]">{flockObs.length}</span>
              )}
              {key === 'animals' && flockAnimals.length > 0 && (
                <span className="ml-1.5 badge badge-xs font-mono bg-[var(--bg-base)] border border-[var(--border)] text-[var(--text-muted)]">{flockAnimals.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {detailTab === 'observations' && (
            <div className="grid gap-3">
              {editingObs ? (
                <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4">
                  <ObservationEntry
                    flockId={Number(id)}
                    animals={flockAnimals}
                    editingObs={editingObs}
                    userId={userId}
                    onSave={async () => { setEditingObs(null); await reloadObs(); }}
                    onCancel={() => setEditingObs(null)}
                  />
                </div>
              ) : !showObsEntry ? (
                <button
                  type="button"
                  onClick={() => setShowObsEntry(true)}
                  className="btn btn-sm btn-ghost w-full font-mono border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
                >
                  + Add observation
                </button>
              ) : (
                <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4">
                  <ObservationEntry
                    flockId={Number(id)}
                    animals={flockAnimals}
                    userId={userId}
                    onSave={async () => { setShowObsEntry(false); await reloadObs(); }}
                    onCancel={() => setShowObsEntry(false)}
                  />
                </div>
              )}
              {flockObs.length === 0 && !showObsEntry && !editingObs ? (
                <p className="font-mono text-xs text-[var(--text-muted)] text-center py-4 m-0">No observations in the last 90 days</p>
              ) : (
                <div className="grid gap-1">
                  {flockObs.map((obs) => (
                    <ObservationCard
                      key={obs.id}
                      obs={obs}
                      showFlock={false}
                      onEdit={(o) => { setShowObsEntry(false); setEditingObs(o); }}
                      onDelete={async (obsId) => { await deleteObservation(obsId); await reloadObs(); }}
                      onResolve={async (obsId) => { await resolveFollowUp(obsId); await reloadObs(); }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {detailTab === 'animals' && (
            <div className="grid gap-3">
              {!flock.individual_tracking_enabled ? (
                <div className="text-center py-6">
                  <p className="font-mono text-sm text-[var(--text-secondary)] mb-3 m-0">🐾 Individual tracking is not enabled for this flock.</p>
                  <p className="font-mono text-xs text-[var(--text-muted)] mb-4 m-0">Enable it to track weight, health records, and observations per animal.</p>
                  <button
                    type="button"
                    onClick={handleEnableTracking}
                    disabled={enablingTracking}
                    className="btn btn-sm font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none disabled:opacity-50"
                  >
                    {enablingTracking ? 'Enabling...' : 'Enable Individual Tracking'}
                  </button>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[var(--text-muted)]">{flockAnimals.length} animals tracked</span>
                    <button
                      type="button"
                      onClick={() => setShowAddAnimal(true)}
                      className="btn btn-xs font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none"
                    >
                      + Add Animal
                    </button>
                  </div>
                  {showAddAnimal && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)] p-4 grid gap-3">
                      <p className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider m-0">New Animal</p>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="field">
                          <span>Identifier / Tag</span>
                          <input type="text" value={addAnimalForm.identifier} placeholder="e.g. A001, Daisy"
                            onChange={(e) => setAddAnimalForm((f) => ({ ...f, identifier: e.target.value }))} />
                        </label>
                        <label className="field">
                          <span>Sex</span>
                          <select value={addAnimalForm.sex} onChange={(e) => setAddAnimalForm((f) => ({ ...f, sex: e.target.value }))}>
                            <option value="female">Female</option>
                            <option value="male">Male</option>
                            <option value="unknown">Unknown</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Source</span>
                          <select value={addAnimalForm.source} onChange={(e) => setAddAnimalForm((f) => ({ ...f, source: e.target.value }))}>
                            <option value="hatched">Hatched</option>
                            <option value="purchased">Purchased</option>
                            <option value="born">Born</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Date of Birth</span>
                          <input type="date" value={addAnimalForm.date_of_birth || ''}
                            onChange={(e) => setAddAnimalForm((f) => ({ ...f, date_of_birth: e.target.value || null }))} />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={handleSaveAnimal} disabled={savingAnimal || !addAnimalForm.identifier}
                          className="btn btn-sm font-mono flex-1 bg-[var(--accent-primary)] text-[var(--bg-base)] border-none disabled:opacity-50">
                          {savingAnimal ? 'Saving...' : 'Save Animal'}
                        </button>
                        <button type="button" onClick={() => setShowAddAnimal(false)}
                          className="btn btn-sm btn-ghost font-mono border border-[var(--border)]">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {flockAnimals.length === 0 ? (
                    <p className="font-mono text-xs text-[var(--text-muted)] text-center py-4 m-0">No animals added yet</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full font-mono text-xs border-collapse">
                        <thead>
                          <tr>
                            {['ID / Tag', 'Sex', 'Status', 'Latest Wt', 'Issues', ''].map((h) => (
                              <th key={h} className="text-left text-[var(--text-muted)] pb-2 pr-3 uppercase text-[10px] tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {flockAnimals.map((a) => (
                            <tr key={a.id} className="border-t border-[var(--border)]">
                              <td className="py-2 pr-3 font-bold text-[var(--text-primary)]">{a.identifier}</td>
                              <td className="py-2 pr-3 text-[var(--text-secondary)] capitalize">{a.sex}</td>
                              <td className="py-2 pr-3">
                                <span className={`badge badge-xs font-mono border-none capitalize ${a.status === 'active' ? 'bg-[var(--accent-primary)] text-[var(--bg-base)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>
                                  {a.status}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-[var(--text-secondary)]">{a.latest_weight ? `${a.latest_weight} lbs` : '—'}</td>
                              <td className="py-2 pr-3">
                                {a.open_health_issues > 0
                                  ? <span className="badge badge-xs bg-[var(--accent-warn)] text-[var(--bg-base)] border-none">{a.open_health_issues}</span>
                                  : <span className="text-[var(--text-muted)]">—</span>}
                              </td>
                              <td className="py-2">
                                <button type="button" onClick={() => setSelectedAnimalId(a.id)}
                                  className="btn btn-xs btn-ghost font-mono border border-[var(--border)] text-[var(--text-secondary)]">
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {selectedAnimalId && (
        <AnimalDrawer
          animalId={selectedAnimalId}
          onClose={() => setSelectedAnimalId(null)}
          onUpdate={async () => {
            const animals = await getFlockAnimals(id).catch(() => flockAnimals);
            setFlockAnimals(animals);
          }}
        />
      )}

      {modal === "production" ? (
        <ProductionModal onClose={() => setModal(null)} onSubmit={submitProduction} />
      ) : null}
      {showLitterModal ? (
        <LitterModal
          form={litterForm}
          onChange={setLitterForm}
          youngTerm={animalClass.youngTerm}
          onClose={() => setShowLitterModal(false)}
          onSubmit={async () => {
            await logProduction(id, {
              date: litterForm.date,
              litter_count: Number(litterForm.litter_count) || null,
              litter_size: Number(litterForm.litter_size) || null,
              litter_notes: litterForm.litter_notes || null,
            });
            setShowLitterModal(false);
            setLitterForm({ date: todayString(), litter_count: 1, litter_size: 0, litter_notes: '' });
            await refresh();
            setFeedback({ type: 'success', message: `${animalClass.youngTerm} logged.` });
          }}
        />
      ) : null}
      {modal === "young_sale" ? (
        <YoungSaleModal
          youngTerm={animalClass.youngTerm}
          onClose={() => setModal(null)}
          onSubmit={submitYoungSale}
        />
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

function HeadcountModal({ additionOnly = false, additionLabel, title, onClose, onSubmit }) {
  const [date, setDate] = useState(todayString());
  const [changeType, setChangeType] = useState("addition");
  const [count, setCount] = useState("");
  const [notes, setNotes] = useState("");

  function submit(event) {
    event.preventDefault();
    const amount = Number(count || 0);
    const type = additionOnly ? "addition" : changeType;
    onSubmit({
      date,
      change_amount: type === "casualty" ? -Math.abs(amount) : Math.abs(amount),
      notes,
    });
  }

  return (
    <ModalFrame title={title || "Log Headcount Change"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="settings-form-grid">
          <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {!additionOnly && (
            <label className="field">
              <span>Change type</span>
              <select value={changeType} onChange={(e) => setChangeType(e.target.value)}>
                <option value="addition">Addition</option>
                <option value="casualty">Casualty</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>{additionLabel || "Count"}</span>
            <input min="1" required step="1" type="number" value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <label className="field"><span>Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        <div className="modal-actions mt-2">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit">Save</button>
        </div>
      </form>
    </ModalFrame>
  );
}

function YoungSaleModal({ youngTerm, onClose, onSubmit }) {
  const [date, setDate] = useState(todayString());
  const [quantity, setQuantity] = useState("");
  const [pricePerHead, setPricePerHead] = useState("");
  const [notes, setNotes] = useState("");

  function submit(event) {
    event.preventDefault();
    onSubmit({
      date,
      quantity: Number(quantity),
      price_per_head: Number(pricePerHead),
      notes,
    });
  }

  const total = (Number(quantity) || 0) * (Number(pricePerHead) || 0);

  return (
    <ModalFrame title={`Sell ${youngTerm}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="settings-form-grid">
          <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">
            <span>{youngTerm} sold</span>
            <input min="1" required step="1" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="field">
            <span>Price per head ($)</span>
            <input min="0" required step="0.01" type="number" value={pricePerHead} onChange={(e) => setPricePerHead(e.target.value)} />
          </label>
          <label className="field"><span>Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        {total > 0 && (
          <p className="font-mono text-xs text-[var(--accent-primary)] mt-2">
            Total: {formatMoney(total)}
          </p>
        )}
        <div className="modal-actions mt-2">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit">Record Sale</button>
        </div>
      </form>
    </ModalFrame>
  );
}

function LitterModal({ form, onChange, youngTerm, onClose, onSubmit }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSubmit();
    } catch (e) {
      setErr(e.message || 'Could not log litter.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame title="Log Litter" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="settings-form-grid">
          {err && <p className="text-[var(--accent-danger)] text-xs m-0">{err}</p>}
          <label className="field">
            <span>Date</span>
            <input type="date" value={form.date} onChange={(e) => onChange(f => ({ ...f, date: e.target.value }))} />
          </label>
          <label className="field">
            <span>Litters</span>
            <input type="number" min="0" value={form.litter_count} onChange={(e) => onChange(f => ({ ...f, litter_count: e.target.value }))} />
          </label>
          <label className="field">
            <span>{youngTerm} Born</span>
            <input type="number" min="0" value={form.litter_size} onChange={(e) => onChange(f => ({ ...f, litter_size: e.target.value }))} />
          </label>
          <label className="field">
            <span>Notes</span>
            <input type="text" value={form.litter_notes} maxLength={500} onChange={(e) => onChange(f => ({ ...f, litter_notes: e.target.value }))} />
          </label>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Litter'}</button>
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
          <button className="inline-flex items-center justify-center flex-none h-12 w-12 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[#e8f5e9] hover:bg-[rgba(198,40,40,0.18)] hover:border-[rgba(198,40,40,0.7)] hover:text-[var(--accent-danger)] transition-colors p-0" type="button" onClick={onClose} aria-label="Close">
            <X size={28} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
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

const formatError = (error) => error?.message || 'An unexpected error occurred';

export default FlockDetail;
