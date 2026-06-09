import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { supabase } from './supabaseClient';

// ── Theme constants ───────────────────────────────────────────────────────────
const DARK_GREEN   = [15,  26,  15];
const MID_GREEN    = [26,  58,  26];
const ACCENT_GREEN = [76, 175, 80];
const LIGHT_GREEN  = [232, 245, 233];
const MUTED_GREEN  = [110, 168, 113];
const ALT_ROW      = [241, 248, 241];

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchFlocks(userId) {
  const { data, error } = await supabase
    .from('flocks')
    .select(`
      id, name, designation, current_headcount,
      breeds (
        name,
        animal_types (
          name, emoji,
          animal_classes ( name, user_id )
        )
      )
    `)
    .order('name');
  if (error) throw error;
  return (data || []).filter(
    (f) => f.breeds?.animal_types?.animal_classes?.user_id === parseInt(userId)
  );
}

async function fetchFeedingLog(flockIds, startDate, endDate) {
  let query = supabase
    .from('feeding_events')
    .select(`
      date, timestamp,
      total_weight, cost_per_lb_at_time, input_method,
      flocks ( name, current_headcount,
        breeds ( name,
          animal_types ( name, emoji )
        )
      ),
      feed_types ( name )
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });
  if (flockIds?.length > 0) query = query.in('flock_id', flockIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((r) => {
    const hc = Math.max(r.flocks?.current_headcount || 1, 1);
    const cost_total = (r.total_weight || 0) * (r.cost_per_lb_at_time || 0);
    return {
      ...r,
      weight_per_bird: (r.total_weight || 0) / hc,
      cost_total,
      cost_per_bird: cost_total / hc,
    };
  });
}

async function fetchProductionLog(flockIds, startDate, endDate) {
  let query = supabase
    .from('production_logs')
    .select(`
      date, egg_count, water_consumed,
      litter_count, litter_size, notes,
      flocks ( name,
        breeds ( name,
          animal_types ( name, produces_eggs )
        )
      )
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });
  if (flockIds?.length > 0) query = query.in('flock_id', flockIds);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchInventory(userId) {
  const { data, error } = await supabase
    .from('feed_types')
    .select('name, unit, current_on_hand, par_level, bag_price, bag_weight, cost_per_unit')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return data || [];
}

async function fetchFinancials(flockIds, startDate, endDate) {
  let query = supabase
    .from('feeding_events')
    .select('date, flock_id, total_weight, cost_per_lb_at_time, flocks ( name )')
    .gte('date', startDate)
    .lte('date', endDate);
  if (flockIds?.length > 0) query = query.in('flock_id', flockIds);
  const { data, error } = await query;
  if (error) throw error;

  const byFlock = {};
  (data || []).forEach((r) => {
    const name = r.flocks?.name || 'Unknown';
    if (!byFlock[name]) byFlock[name] = { name, total_cost: 0 };
    byFlock[name].total_cost += (r.total_weight || 0) * (r.cost_per_lb_at_time || 0);
  });
  return Object.values(byFlock);
}

// ── Download helper ───────────────────────────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── CSV ───────────────────────────────────────────────────────────────────────

export async function generateCSV({ userId, reportTypes, flockIds, startDate, endDate }) {
  const results = [];

  if (reportTypes.includes('feeding_log')) {
    const data = await fetchFeedingLog(flockIds, startDate, endDate);
    const headers = [
      'Date', 'Time', 'Flock', 'Breed', 'Type',
      'Feed', 'Weight (lbs)', 'Wt/Bird',
      'Cost ($)', 'Cost/Bird ($)', 'Method',
    ];
    const rows = data.map((r) => [
      r.date,
      r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '',
      r.flocks?.name || '',
      r.flocks?.breeds?.name || '',
      r.flocks?.breeds?.animal_types?.name || '',
      r.feed_types?.name || '',
      r.total_weight?.toFixed(2) || '0',
      r.weight_per_bird?.toFixed(3) || '0',
      r.cost_total?.toFixed(2) || '0',
      r.cost_per_bird?.toFixed(4) || '0',
      r.input_method || '',
    ]);
    results.push({ name: 'Feeding Log', headers, rows });
  }

  if (reportTypes.includes('production_log')) {
    const data = await fetchProductionLog(flockIds, startDate, endDate);
    const headers = ['Date', 'Flock', 'Eggs', 'Water (gal)', 'Litters', 'Young Born', 'Notes'];
    const rows = data.map((r) => [
      r.date,
      r.flocks?.name || '',
      r.egg_count ?? '—',
      r.water_consumed ?? '—',
      r.litter_count ?? '—',
      r.litter_size ?? '—',
      r.notes || '',
    ]);
    results.push({ name: 'Production Log', headers, rows });
  }

  if (reportTypes.includes('inventory')) {
    const data = await fetchInventory(userId);
    const headers = ['Feed', 'Unit', 'On Hand', 'Par Level', 'Bag Price', 'Cost/lb'];
    const rows = data.map((r) => [
      r.name,
      r.unit,
      r.current_on_hand?.toFixed(1) || '0',
      r.par_level?.toFixed(1) || '0',
      `$${r.bag_price?.toFixed(2) || '0'}`,
      `$${r.cost_per_unit?.toFixed(4) || '0'}`,
    ]);
    results.push({ name: 'Inventory', headers, rows });
  }

  if (reportTypes.includes('financial_summary')) {
    const data = await fetchFinancials(flockIds, startDate, endDate);
    const headers = ['Flock', 'Total Feed Cost ($)'];
    const rows = data.map((r) => [r.name, r.total_cost?.toFixed(2) || '0']);
    results.push({ name: 'Financials', headers, rows });
  }

  let csv = '';
  results.forEach((section) => {
    csv += `${section.name}\n`;
    csv += section.headers.map((h) => `"${h}"`).join(',') + '\n';
    csv += section.rows
      .map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
    csv += '\n\n';
  });

  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    `flock_export_${startDate}_${endDate}.csv`
  );
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export async function generatePDF({ userId, farmName, reportTypes, flockIds, startDate, endDate }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ── Cover page ────────────────────────────────────────────────────────────
  doc.setFillColor(...DARK_GREEN);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(...ACCENT_GREEN);
  doc.rect(0, 0, pageW, 8, 'F');

  doc.setTextColor(...ACCENT_GREEN);
  doc.setFontSize(36);
  doc.setFont('helvetica', 'bold');
  doc.text('🐓 Flock', 20, 50);

  doc.setTextColor(...LIGHT_GREEN);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'normal');
  doc.text(farmName || 'Farm Report', 20, 65);

  doc.setTextColor(...MUTED_GREEN);
  doc.setFontSize(11);
  doc.text(`${startDate}  to  ${endDate}`, 20, 78);
  doc.text(
    `Generated ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
    20, 86
  );

  doc.setTextColor(...LIGHT_GREEN);
  doc.setFontSize(12);
  doc.text('Report Contents:', 20, 105);
  doc.setTextColor(...MUTED_GREEN);
  doc.setFontSize(10);
  let yPos = 114;
  const labels = {
    feeding_log:       '• Feeding Log',
    production_log:    '• Production Log',
    financial_summary: '• Financial Summary',
    inventory:         '• Feed Inventory',
  };
  reportTypes.forEach((type) => {
    doc.text(labels[type] || `• ${type}`, 25, yPos);
    yPos += 8;
  });

  doc.setFillColor(...MID_GREEN);
  doc.rect(0, pageH - 12, pageW, 12, 'F');
  doc.setTextColor(...MUTED_GREEN);
  doc.setFontSize(8);
  doc.text('Generated by Flock — Farm Management', 20, pageH - 4);

  // ── Shared table styles ───────────────────────────────────────────────────
  const headStyles   = { fillColor: MID_GREEN, textColor: LIGHT_GREEN, fontStyle: 'bold', fontSize: 9 };
  const bodyStyles   = { fontSize: 8, textColor: [30, 30, 30] };
  const altStyles    = { fillColor: ALT_ROW };

  function addSectionHeader(title) {
    doc.addPage();
    doc.setFillColor(...DARK_GREEN);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setFillColor(...ACCENT_GREEN);
    doc.rect(0, 0, pageW, 4, 'F');
    doc.setTextColor(...ACCENT_GREEN);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 13);
    doc.setTextColor(...MUTED_GREEN);
    doc.setFontSize(8);
    doc.text(`${startDate} to ${endDate}`, pageW - 14, 13, { align: 'right' });
    return 24;
  }

  if (reportTypes.includes('feeding_log')) {
    const startY = addSectionHeader('Feeding Log');
    const data = await fetchFeedingLog(flockIds, startDate, endDate);
    autoTable(doc, {
      startY,
      head: [['Date', 'Flock', 'Type', 'Feed', 'Weight', 'Wt/Bird', 'Cost', 'Method']],
      body: data.map((r) => [
        r.date,
        r.flocks?.name || '',
        r.flocks?.breeds?.animal_types?.name || '',
        r.feed_types?.name || '',
        `${r.total_weight?.toFixed(2)} lbs`,
        `${r.weight_per_bird?.toFixed(3)} lbs`,
        `$${r.cost_total?.toFixed(2)}`,
        r.input_method || '',
      ]),
      headStyles, bodyStyles, alternateRowStyles: altStyles,
      margin: { left: 14, right: 14 },
      styles: { overflow: 'ellipsize' },
    });
  }

  if (reportTypes.includes('production_log')) {
    const startY = addSectionHeader('Production Log');
    const data = await fetchProductionLog(flockIds, startDate, endDate);
    autoTable(doc, {
      startY,
      head: [['Date', 'Flock', 'Eggs', 'Water (gal)', 'Litters', 'Young', 'Notes']],
      body: data.map((r) => [
        r.date,
        r.flocks?.name || '',
        r.egg_count ?? '—',
        r.water_consumed ?? '—',
        r.litter_count ?? '—',
        r.litter_size ?? '—',
        r.notes || '',
      ]),
      headStyles, bodyStyles, alternateRowStyles: altStyles,
      margin: { left: 14, right: 14 },
    });
  }

  if (reportTypes.includes('inventory')) {
    const startY = addSectionHeader('Feed Inventory');
    const data = await fetchInventory(userId);
    autoTable(doc, {
      startY,
      head: [['Feed', 'Unit', 'On Hand', 'Par Level', 'Bag Price', 'Cost/lb', 'Status']],
      body: data.map((r) => {
        const status =
          r.current_on_hand <= r.par_level ? 'LOW'
          : r.current_on_hand <= r.par_level * 2 ? 'WARNING'
          : 'OK';
        return [
          r.name, r.unit,
          `${r.current_on_hand?.toFixed(1)}`,
          `${r.par_level?.toFixed(1)}`,
          `$${r.bag_price?.toFixed(2)}`,
          `$${r.cost_per_unit?.toFixed(4)}`,
          status,
        ];
      }),
      headStyles, bodyStyles, alternateRowStyles: altStyles,
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.column.index === 6 && data.section === 'body') {
          if (data.cell.text[0] === 'LOW')     data.cell.styles.textColor = [198, 40, 40];
          else if (data.cell.text[0] === 'WARNING') data.cell.styles.textColor = [255, 143, 0];
          else                                  data.cell.styles.textColor = [76, 175, 80];
        }
      },
    });
  }

  if (reportTypes.includes('financial_summary')) {
    const startY = addSectionHeader('Financial Summary');
    const data = await fetchFinancials(flockIds, startDate, endDate);
    const total = data.reduce((s, r) => s + r.total_cost, 0);
    autoTable(doc, {
      startY,
      head: [['Flock', 'Total Feed Cost']],
      body: [
        ...data.map((r) => [r.name, `$${r.total_cost?.toFixed(2)}`]),
        ['TOTAL', `$${total.toFixed(2)}`],
      ],
      headStyles, bodyStyles, alternateRowStyles: altStyles,
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        const lastRow = data.table.body.length - 1;
        if (data.row.index === lastRow) {
          data.cell.styles.fontStyle  = 'bold';
          data.cell.styles.fillColor  = MID_GREEN;
          data.cell.styles.textColor  = LIGHT_GREEN;
        }
      },
    });
  }

  // ── Page numbers ──────────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (i === 1) continue;
    doc.setFillColor(...MID_GREEN);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setTextColor(...MUTED_GREEN);
    doc.setFontSize(7);
    doc.text('Flock — Farm Management', 14, pageH - 3);
    doc.text(`Page ${i} of ${pageCount}`, pageW - 14, pageH - 3, { align: 'right' });
  }

  doc.save(`flock_report_${startDate}_${endDate}.pdf`);
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

export async function generateXLSX({ userId, farmName, flockIds, startDate, endDate }) {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Flock';
  wb.created  = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A1A' } };
  const HEADER_FONT = { bold: true, color: { argb: 'FFE8F5E9' }, size: 11, name: 'Calibri' };
  const ALT_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F8F1' } };
  const BORDER = {
    top:    { style: 'thin', color: { argb: 'FF2E7D32' } },
    bottom: { style: 'thin', color: { argb: 'FF2E7D32' } },
    left:   { style: 'thin', color: { argb: 'FF2E7D32' } },
    right:  { style: 'thin', color: { argb: 'FF2E7D32' } },
  };

  function styleHeader(sheet, columns) {
    sheet.columns = columns;
    const headerRow = sheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.fill      = HEADER_FILL;
      cell.font      = HEADER_FONT;
      cell.border    = BORDER;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  function styleDataRows(sheet, startRow, endRow) {
    for (let i = startRow; i <= endRow; i++) {
      const row = sheet.getRow(i);
      const useAlt = (i - startRow) % 2 === 1;
      row.eachCell((cell) => {
        if (useAlt) cell.fill = ALT_FILL;
        cell.border    = BORDER;
        cell.alignment = { vertical: 'middle' };
      });
    }
  }

  function autoWidth(sheet) {
    sheet.columns.forEach((col) => {
      let max = col.header?.length || 10;
      col.eachCell({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 3, 40);
    });
  }

  // ── Summary sheet ─────────────────────────────────────────────────────────
  const summarySheet = wb.addWorksheet('Summary');
  styleHeader(summarySheet, [
    { header: 'Report', key: 'report', width: 30 },
    { header: 'Value',  key: 'value',  width: 20 },
  ]);
  summarySheet.addRows([
    { report: 'Farm',       value: farmName || 'Farm' },
    { report: 'Date Range', value: `${startDate} to ${endDate}` },
    { report: 'Generated',  value: new Date().toLocaleString() },
    { report: 'Created by', value: 'Flock — Farm Management' },
  ]);
  styleDataRows(summarySheet, 2, 5);

  // ── Feeding Log sheet ─────────────────────────────────────────────────────
  const feedSheet = wb.addWorksheet('Feeding Log');
  styleHeader(feedSheet, [
    { header: 'Date',          key: 'date',     width: 12 },
    { header: 'Time',          key: 'time',     width: 10 },
    { header: 'Flock',         key: 'flock',    width: 20 },
    { header: 'Breed',         key: 'breed',    width: 18 },
    { header: 'Type',          key: 'type',     width: 12 },
    { header: 'Feed',          key: 'feed',     width: 22 },
    { header: 'Weight (lbs)',  key: 'weight',   width: 12 },
    { header: 'Wt/Bird',       key: 'wtbird',   width: 10 },
    { header: 'Cost ($)',      key: 'cost',     width: 10 },
    { header: 'Cost/Bird ($)', key: 'costbird', width: 12 },
    { header: 'Method',        key: 'method',   width: 10 },
  ]);

  const feedData = await fetchFeedingLog(flockIds, startDate, endDate);
  feedData.forEach((r) => {
    feedSheet.addRow({
      date:     r.date,
      time:     r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '',
      flock:    r.flocks?.name || '',
      breed:    r.flocks?.breeds?.name || '',
      type:     r.flocks?.breeds?.animal_types?.name || '',
      feed:     r.feed_types?.name || '',
      weight:   r.total_weight,
      wtbird:   r.weight_per_bird,
      cost:     r.cost_total,
      costbird: r.cost_per_bird,
      method:   r.input_method,
    });
  });

  feedSheet.getColumn('weight').numFmt   = '0.00';
  feedSheet.getColumn('wtbird').numFmt   = '0.000';
  feedSheet.getColumn('cost').numFmt     = '$#,##0.00';
  feedSheet.getColumn('costbird').numFmt = '$#,##0.0000';

  const feedLastRow = feedSheet.rowCount;
  const feedTotals  = feedSheet.addRow({
    flock:  'TOTAL',
    weight: { formula: `SUM(G2:G${feedLastRow})` },
    cost:   { formula: `SUM(I2:I${feedLastRow})` },
  });
  feedTotals.font = { bold: true };
  feedTotals.fill = HEADER_FILL;
  feedTotals.getCell('flock').font = HEADER_FONT;

  styleDataRows(feedSheet, 2, feedLastRow);
  autoWidth(feedSheet);

  // ── Production sheet ──────────────────────────────────────────────────────
  const prodSheet = wb.addWorksheet('Production');
  styleHeader(prodSheet, [
    { header: 'Date',        key: 'date',    width: 12 },
    { header: 'Flock',       key: 'flock',   width: 20 },
    { header: 'Eggs',        key: 'eggs',    width: 8  },
    { header: 'Water (gal)', key: 'water',   width: 12 },
    { header: 'Litters',     key: 'litters', width: 10 },
    { header: 'Young Born',  key: 'young',   width: 12 },
    { header: 'Notes',       key: 'notes',   width: 30 },
  ]);

  const prodData = await fetchProductionLog(flockIds, startDate, endDate);
  prodData.forEach((r) => {
    prodSheet.addRow({
      date:    r.date,
      flock:   r.flocks?.name || '',
      eggs:    r.egg_count,
      water:   r.water_consumed,
      litters: r.litter_count,
      young:   r.litter_size,
      notes:   r.notes || '',
    });
  });
  styleDataRows(prodSheet, 2, prodSheet.rowCount);
  autoWidth(prodSheet);

  // ── Inventory sheet ───────────────────────────────────────────────────────
  const invSheet = wb.addWorksheet('Inventory');
  styleHeader(invSheet, [
    { header: 'Feed',          key: 'feed',     width: 25 },
    { header: 'Unit',          key: 'unit',     width: 8  },
    { header: 'On Hand',       key: 'onhand',   width: 12 },
    { header: 'Par Level',     key: 'par',      width: 12 },
    { header: 'Bag Price ($)', key: 'bagprice', width: 14 },
    { header: 'Cost/lb ($)',   key: 'costlb',   width: 12 },
    { header: 'Status',        key: 'status',   width: 10 },
  ]);

  const invData = await fetchInventory(userId);
  invData.forEach((r) => {
    const status =
      r.current_on_hand <= r.par_level ? 'LOW'
      : r.current_on_hand <= r.par_level * 2 ? 'WARNING'
      : 'OK';
    const row = invSheet.addRow({
      feed:     r.name,
      unit:     r.unit,
      onhand:   r.current_on_hand,
      par:      r.par_level,
      bagprice: r.bag_price,
      costlb:   r.cost_per_unit,
      status,
    });
    const statusCell = row.getCell('status');
    if (status === 'LOW')     statusCell.font = { bold: true, color: { argb: 'FFC62828' } };
    else if (status === 'WARNING') statusCell.font = { bold: true, color: { argb: 'FFFF8F00' } };
    else                      statusCell.font = { bold: true, color: { argb: 'FF4CAF50' } };
  });

  invSheet.getColumn('onhand').numFmt   = '0.0';
  invSheet.getColumn('par').numFmt      = '0.0';
  invSheet.getColumn('bagprice').numFmt = '$#,##0.00';
  invSheet.getColumn('costlb').numFmt   = '$#,##0.0000';
  styleDataRows(invSheet, 2, invSheet.rowCount);
  autoWidth(invSheet);

  // ── Financials sheet ──────────────────────────────────────────────────────
  const finSheet = wb.addWorksheet('Financials');
  styleHeader(finSheet, [
    { header: 'Flock',           key: 'flock', width: 25 },
    { header: 'Total Feed Cost', key: 'cost',  width: 18 },
  ]);

  const finData = await fetchFinancials(flockIds, startDate, endDate);
  finData.forEach((r) => {
    finSheet.addRow({ flock: r.name, cost: r.total_cost });
  });

  const finLast  = finSheet.rowCount;
  const finTotal = finSheet.addRow({
    flock: 'TOTAL',
    cost:  { formula: `SUM(B2:B${finLast})` },
  });
  finTotal.font = { bold: true };
  finTotal.fill = HEADER_FILL;
  finTotal.eachCell((c) => { c.font = HEADER_FONT; });

  finSheet.getColumn('cost').numFmt = '$#,##0.00';
  styleDataRows(finSheet, 2, finLast);
  autoWidth(finSheet);

  // ── Write and download ────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `flock_export_${startDate}_${endDate}.xlsx`
  );
}
