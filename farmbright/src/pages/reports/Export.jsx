import React, { useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle, Download, FileText, Sheet } from "lucide-react";

import { FarmContext } from "../../context/FarmContext";
import { generateExport, getExportPreview } from "../../services/exportApi";
import { getQueue } from "../../services/scaleHouseApi";

const todayString = () => new Date().toISOString().slice(0, 10);

const reportOptions = [
  { id: "feeding_log", label: "Feeding Log" },
  { id: "production_log", label: "Production" },
  { id: "financial_summary", label: "Financials" },
  { id: "inventory", label: "Inventory" },
];

const formatCards = [
  { id: "csv", label: "CSV", icon: FileText, description: "Spreadsheet-ready" },
  { id: "pdf", label: "PDF", icon: FileText, deferred: true, description: "Printable report" },
  { id: "xlsx", label: "XLSX", icon: Sheet, deferred: true, description: "Multi-tab workbook" },
];

function Export() {
  const { farmName, userId } = useContext(FarmContext);
  const [format, setFormat] = useState("csv");
  const [reportType, setReportType] = useState("feeding_log");
  const [allFlocks, setAllFlocks] = useState(true);
  const [flockIds, setFlockIds] = useState([]);
  const [flocks, setFlocks] = useState([]);
  const [rangePreset, setRangePreset] = useState("month");
  const [dateRange, setDateRange] = useState(defaultRange("month"));
  const [preview, setPreview] = useState({ headers: [], rows: [] });
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(() => JSON.parse(localStorage.getItem("Flock_recent_exports") || "[]"));
  const [error, setError] = useState("");

  const effectiveReportType = format === "xlsx" ? "full" : reportType;

  useEffect(() => {
    if (!userId) return;
    getQueue().then(setFlocks).catch(() => setFlocks([]));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    getExportPreview({ user_id: userId, report_type: effectiveReportType, ...dateRange })
      .then(setPreview)
      .catch(() => setPreview({ headers: [], rows: [] }));
  }, [userId, effectiveReportType, dateRange.start_date, dateRange.end_date]);

  const selectedFlockIds = allFlocks ? [] : flockIds;
  const previewSections = useMemo(() => ["Summary", "Feeding Log", "Production", "Inventory", "Financials"], []);

  function updatePreset(nextPreset) {
    setRangePreset(nextPreset);
    if (nextPreset !== "custom") {
      setDateRange(defaultRange(nextPreset));
    }
  }

  function toggleFlock(flockId) {
    setFlockIds((previous) =>
      previous.includes(flockId) ? previous.filter((id) => id !== flockId) : [...previous, flockId]
    );
  }

  async function handleGenerate(overridePayload = null) {
    const payload = overridePayload || {
      user_id: userId,
      format,
      report_type: effectiveReportType,
      flock_ids: selectedFlockIds,
      ...dateRange,
    };
    setLoading(true);
    setError("");
    try {
      const response = await generateExport(payload);
      const blob = new Blob([response.data], { type: response.headers["content-type"] });
      const url = URL.createObjectURL(blob);
      const filename = `Flock_${payload.report_type}_${todayString()}.${payload.format}`;
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      const nextRecent = [
        { date: new Date().toLocaleString(), format: payload.format, reportType: payload.report_type, payload },
        ...recent,
      ].slice(0, 5);
      setRecent(nextRecent);
      localStorage.setItem("Flock_recent_exports", JSON.stringify(nextRecent));
    } catch (requestError) {
      setError(requestError.message || "Export could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="min-h-screen bg-[var(--bg-base)] p-6">
      <header className="mb-6">
        <p className="eyebrow">Reports</p>
        <h1 className="display-font text-3xl text-[var(--text-primary)] mb-2 m-0">Export Data</h1>
        <p className="font-mono text-sm text-[var(--text-muted)] m-0">
          Download your farm data in CSV, PDF, or XLSX format.
        </p>
      </header>

      <div className="flex gap-6 items-start flex-wrap lg:flex-nowrap">
        {/* Left — Config */}
        <aside className="w-full lg:w-[400px] shrink-0 flex flex-col gap-4">
          {/* Format selector */}
          <div className="grid grid-cols-3 gap-3">
            {formatCards.map((card) => {
              const Icon = card.icon;
              const selected = format === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={card.deferred}
                  title={card.deferred ? "Coming soon" : undefined}
                  className={
                    selected
                      ? "flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-[var(--accent-primary)] bg-[var(--bg-elevated)] cursor-pointer"
                      : "flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] cursor-pointer hover:border-[var(--accent-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  }
                  onClick={() => !card.deferred && setFormat(card.id)}
                >
                  <Icon size={24} aria-hidden="true" className="text-[var(--accent-primary)]" />
                  <span className="font-mono text-xs font-bold text-[var(--text-primary)]">{card.label}</span>
                  {card.deferred ? (
                    <span className="font-mono text-[10px] text-[var(--text-muted)] text-center">soon</span>
                  ) : (
                    <span className="font-mono text-[10px] text-[var(--text-muted)] text-center">{card.description}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Report type */}
          {format !== "xlsx" ? (
            <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-4">
              <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 m-0">
                Report Type
              </h2>
              {reportOptions.map((option) => (
                <label key={option.id} className="flex items-center gap-3 py-2 cursor-pointer">
                  <input
                    checked={reportType === option.id}
                    type="radio"
                    name="report-type"
                    className="radio radio-sm [--chkbg:var(--accent-primary)]"
                    onChange={() => setReportType(option.id)}
                  />
                  <span className="font-mono text-sm text-[var(--text-primary)]">{option.label}</span>
                </label>
              ))}
            </div>
          ) : null}

          {/* Flock selector */}
          <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-4">
            <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 m-0">
              Flocks
            </h2>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-sm text-[var(--text-primary)]">All Flocks</span>
              <input
                checked={allFlocks}
                type="checkbox"
                className="toggle toggle-sm [--tglbg:var(--accent-primary)]"
                onChange={(e) => setAllFlocks(e.target.checked)}
              />
            </div>
            {!allFlocks ? (
              <div className="grid gap-1">
                {flocks.map((flock) => (
                  <label key={flock.flock_id} className="flex items-center gap-3 py-2 cursor-pointer">
                    <input
                      checked={flockIds.includes(flock.flock_id)}
                      type="checkbox"
                      className="checkbox checkbox-sm [--chkbg:var(--accent-primary)]"
                      onChange={() => toggleFlock(flock.flock_id)}
                    />
                    <span className="font-mono text-sm text-[var(--text-primary)]">{flock.name}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          {/* Date range */}
          <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-4">
            <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 m-0">
              Date Range
            </h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {["today", "week", "month", "custom"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={
                    rangePreset === preset
                      ? "btn btn-xs font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none capitalize"
                      : "btn btn-xs btn-ghost font-mono border border-[var(--border)] text-[var(--text-secondary)] capitalize"
                  }
                  onClick={() => updatePreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            {rangePreset === "custom" ? (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateRange.start_date}
                  className="input input-sm font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] flex-1"
                  onChange={(e) => setDateRange((range) => ({ ...range, start_date: e.target.value }))}
                />
                <input
                  type="date"
                  value={dateRange.end_date}
                  className="input input-sm font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] flex-1"
                  onChange={(e) => setDateRange((range) => ({ ...range, end_date: e.target.value }))}
                />
              </div>
            ) : null}
          </div>

          {error ? <div className="error-banner">{error}</div> : null}

          <button
            className={`btn w-full font-mono font-bold bg-[var(--accent-primary)] text-[var(--bg-base)] border-none hover:bg-[var(--accent-muted)] h-12 text-sm${loading ? " loading" : ""}`}
            type="button"
            disabled={loading}
            onClick={() => handleGenerate()}
          >
            {!loading && <Download size={17} aria-hidden="true" />}
            {loading ? "Generating..." : `Generate ${format.toUpperCase()} Export`}
          </button>
        </aside>

        {/* Right — Preview + Recent */}
        <main className="flex-1 flex flex-col gap-4 min-w-0">
          <PreviewPanel
            dateRange={dateRange}
            farmName={farmName}
            format={format}
            preview={preview}
            reportType={effectiveReportType}
            sections={previewSections}
          />

          <section className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-5">
            <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 m-0">
              Recent Exports
            </h2>
            {recent.length ? (
              recent.map((item, index) => (
                <div
                  key={`${item.date}-${index}`}
                  className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-0 flex-wrap"
                >
                  <span className="font-mono text-xs text-[var(--text-muted)]">{item.date}</span>
                  <span
                    className={`badge badge-xs font-mono${
                      item.format === "csv"
                        ? " bg-[var(--accent-primary)] text-[var(--bg-base)]"
                        : item.format === "pdf"
                        ? " bg-[var(--accent-warn)] text-[var(--bg-base)]"
                        : " bg-blue-600 text-white"
                    }`}
                  >
                    {item.format}
                  </span>
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    {item.reportType.replaceAll("_", " ")}
                  </span>
                  <button
                    type="button"
                    className="font-mono text-xs text-[var(--accent-primary)] hover:underline cursor-pointer bg-transparent border-0 p-0"
                    onClick={() => handleGenerate({ user_id: userId, ...item.payload })}
                  >
                    Download again
                  </button>
                </div>
              ))
            ) : (
              <p className="font-mono text-xs text-[var(--text-muted)] text-center py-4 m-0">
                No exports yet.
              </p>
            )}
          </section>
        </main>
      </div>
    </section>
  );
}

function PreviewPanel({ dateRange, farmName, format, preview, reportType, sections }) {
  if (format === "pdf") {
    return (
      <section className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-5">
        <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 m-0">
          Preview
        </h2>
        <div className="bg-[var(--bg-elevated)] rounded-lg p-6 border border-[var(--border)]">
          <h3 className="display-font text-xl text-[var(--text-primary)] mb-1 m-0">
            {farmName || "Flock Farm"}
          </h3>
          <p className="font-mono text-xs text-[var(--text-muted)] mb-4 m-0">
            {dateRange.start_date} — {dateRange.end_date}
          </p>
          <div className="grid gap-2">
            {sections.map((section) => (
              <div key={section} className="flex items-center gap-2 font-mono text-xs text-[var(--text-secondary)]">
                <CheckCircle size={14} className="text-[var(--accent-primary)] flex-none" />
                {section}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (format === "xlsx") {
    return (
      <section className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-5">
        <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 m-0">
          Preview — Workbook Tabs
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {sections.map((section) => (
            <span
              key={section}
              className="badge badge-sm font-mono bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]"
            >
              {section}
            </span>
          ))}
        </div>
        <div className="grid gap-2 bg-[var(--bg-elevated)] rounded p-3">
          <div className="grid grid-cols-6 gap-2">
            {["Date", "Flock", "Feed", "Weight", "Cost", "Notes"].map((header) => (
              <span key={header} className="font-mono text-[10px] text-[var(--accent-primary)] uppercase font-bold">
                {header}
              </span>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] p-5 overflow-auto">
      <h2 className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 m-0">
        Preview — {reportType.replaceAll("_", " ")}
      </h2>
      {preview.headers.length ? (
        <table className="table table-xs font-mono w-full">
          <thead className="bg-[var(--bg-elevated)]">
            <tr>
              {preview.headers.map((header) => (
                <th key={header} className="text-[var(--accent-primary)] text-[10px] uppercase">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 5).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="text-[var(--text-secondary)] text-[11px]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="font-mono text-xs text-[var(--text-muted)] m-0">No preview data available.</p>
      )}
    </section>
  );
}

function defaultRange(preset) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (preset === "today") {
    return { start_date: end, end_date: end };
  }
  if (preset === "week") {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { start_date: start.toISOString().slice(0, 10), end_date: end };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start_date: start.toISOString().slice(0, 10), end_date: end };
}

export default Export;
