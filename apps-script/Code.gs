/**
 * Live stock feed for the lookup site.
 *
 * Paste this into the inventory sheet's Extensions → Apps Script, then
 * Deploy → New deployment → Web app, Execute as: Me, Who has access: Anyone.
 *
 * It returns ONLY the product rows (Brand, Fragrance, Type, Volume, Price,
 * Stock, Left). Buyer rows are never read into the response, and the sheet
 * itself stays private.
 *
 * GET <web app url>?tab=Sept-Oct   (no tab = first tab)
 */

const FIELDS = {
  brand: ['brand'],
  fragrance: ['fragrance'],
  type: ['type'],
  volume: ['volume'],
  price: ['price'],
  stock: ['stock'],
  left: ['left'],
};
const LABEL_ROWS_TO_SCAN = 15; // row labels live in column A near the top

function doGet(e) {
  const ss = SpreadsheetApp.getActive();
  const tab = e && e.parameter && e.parameter.tab;
  const sheet = tab ? ss.getSheetByName(tab) : ss.getSheets()[0];
  if (!sheet) return json({ error: 'Tab not found: ' + tab });

  const width = sheet.getLastColumn();
  const labels = sheet.getRange(1, 1, LABEL_ROWS_TO_SCAN, 1).getValues().map(r => norm(r[0]));
  const fieldRow = {};
  for (const [field, names] of Object.entries(FIELDS)) {
    const i = labels.findIndex(l => names.includes(l));
    if (i >= 0) fieldRow[field] = i;
  }
  if (!('brand' in fieldRow) && fieldRow.fragrance > 0) fieldRow.brand = fieldRow.fragrance - 1;
  const missing = Object.keys(FIELDS).filter(f => !(f in fieldRow));
  if (missing.length) return json({ error: 'Missing rows: ' + missing.join(', ') });

  // Read only down to the last product row, then fill merged cells (brand headers).
  const lastRow = Math.max(...Object.values(fieldRow)) + 1;
  const range = sheet.getRange(1, 1, lastRow, width);
  const values = range.getValues();
  for (const m of range.getMergedRanges()) {
    const r0 = m.getRow() - 1, c0 = m.getColumn() - 1;
    const v = values[r0][c0];
    for (let r = r0; r < Math.min(m.getLastRow(), lastRow); r++)
      for (let c = c0; c < m.getLastColumn(); c++) values[r][c] = v;
  }

  const fields = {};
  for (const [field, row] of Object.entries(fieldRow))
    fields[field] = values[row].slice(1).map(v => String(v));
  return json({ tab: sheet.getName(), fetched: new Date().toISOString(), fields });
}

function norm(s) {
  return String(s).normalize('NFD').replace(/[^\x00-\x7f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
