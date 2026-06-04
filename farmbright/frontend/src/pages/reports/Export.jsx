import React, { useContext, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";

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
  { id: "csv", label: "CSV", icon: FileText },
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "xlsx", label: "XLSX", icon: Sheet },
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
    if (!userId) {
      return;
    }
    getQueue(userId).then(setFlocks).catch(() => setFlocks([]));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
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
      previous.includes(flockId) ? previous.filter((id) => id !== flockId) : [...previous, flockId],
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
      setError(requestError.response?.data?.message || "Export could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="export-page">
      <aside className="export-config-panel">
        <div>
          <p className="eyebrow">Reports</p>
          <h1 className="display-font">Export</h1>
        </div>

        <div className="export-format-grid">
          {formatCards.map((card) => {
            const Icon = card.icon;
            return (
              <button className={format === card.id ? "selected" : ""} key={card.id} type="button" onClick={() => setFormat(card.id)}>
                <Icon size={22} aria-hidden="true" />
                {card.label}
              </button>
            );
          })}
        </div>

        {format !== "xlsx" ? (
          <div className="export-option-block">
            <h2>Report Type</h2>
            {reportOptions.map((option) => (
              <label key={option.id}>
                <input checked={reportType === option.id} type="radio" onChange={() => setReportType(option.id)} />
                {option.label}
              </label>
            ))}
          </div>
        ) : null}

        <div className="export-option-block">
          <h2>Flocks</h2>
          <label>
            <input checked={allFlocks} type="checkbox" onChange={(event) => setAllFlocks(event.target.checked)} />
            All Flocks
          </label>
          {!allFlocks ? (
            <div className="export-flock-list">
              {flocks.map((flock) => (
                <label key={flock.flock_id}>
                  <input checked={flockIds.includes(flock.flock_id)} type="checkbox" onChange={() => toggleFlock(flock.flock_id)} />
                  {flock.name}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="export-option-block">
          <h2>Date Range</h2>
          <div className="export-date-presets">
            {["today", "week", "month", "custom"].map((preset) => (
              <button className={rangePreset === preset ? "selected" : ""} key={preset} type="button" onClick={() => updatePreset(preset)}>
                {preset}
              </button>
            ))}
          </div>
          {rangePreset === "custom" ? (
            <div className="export-date-inputs">
              <input type="date" value={dateRange.start_date} onChange={(event) => setDateRange((range) => ({ ...range, start_date: event.target.value }))} />
              <input type="date" value={dateRange.end_date} onChange={(event) => setDateRange((range) => ({ ...range, end_date: event.target.value }))} />
            </div>
          ) : null}
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <button className="primary-button full-width" type="button" onClick={() => handleGenerate()} disabled={loading}>
          <Download size={17} aria-hidden="true" />
          {loading ? "Generating..." : `Generate ${format.toUpperCase()} Export`}
        </button>
      </aside>

      <main className="export-preview-panel">
        <PreviewPanel
          dateRange={dateRange}
          farmName={farmName}
          format={format}
          preview={preview}
          reportType={effectiveReportType}
          sections={previewSections}
        />

        <section className="recent-exports">
          <h2>Recent Exports</h2>
          {recent.length ? (
            recent.map((item, index) => (
              <div key={`${item.date}-${index}`}>
                <span>{item.date}</span>
                <span className={`export-format-badge ${item.format}`}>{item.format}</span>
                <span>{item.reportType.replaceAll("_", " ")}</span>
                <button type="button" onClick={() => handleGenerate({ user_id: userId, ...item.payload })}>Download again</button>
              </div>
            ))
          ) : (
            <p className="muted">No exports yet.</p>
          )}
        </section>
      </main>
    </section>
  );
}

function PreviewPanel({ dateRange, farmName, format, preview, reportType, sections }) {
  if (format === "pdf") {
    return (
      <section className="export-preview-card pdf">
        <h2 className="display-font">{farmName || "Flock Farm"}</h2>
        <p>{reportType.replaceAll("_", " ").toUpperCase()}</p>
        <p>{dateRange.start_date} to {dateRange.end_date}</p>
      </section>
    );
  }

  if (format === "xlsx") {
    return (
      <section className="export-preview-card">
        <div className="xlsx-tabs">{sections.map((section) => <span key={section}>{section}</span>)}</div>
        <div className="xlsx-header-row">
          {["Date", "Flock", "Feed", "Weight", "Cost", "Notes"].map((header) => <span key={header}>{header}</span>)}
        </div>
      </section>
    );
  }

  return (
    <section className="export-preview-card">
      <table>
        <thead>
          <tr>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {preview.rows.slice(0, 5).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
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
