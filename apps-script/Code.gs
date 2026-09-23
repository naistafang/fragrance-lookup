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
const CACHE_SECONDS = 600;     // safety net; any edit in the sheet clears the cache right away

// Reading the sheet takes several seconds, so the finished feed is cached and
// only rebuilt after an edit (see onEdit) or when the cache expires.
function doGet(e) {
  const tab = (e && e.parameter && e.parameter.tab) || '';
  const cache = CacheService.getScriptCache();
  const hit = cache.get(cacheKey(tab));
  if (hit) return text(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(hit), 'application/x-gzip')).getDataAsString());

  const started = Date.now();
  const feed = buildFeed(tab);
  feed.buildMs = Date.now() - started;
  const out = JSON.stringify(feed);
  // Cache entries max out at 100 KB, so store the feed gzipped.
  if (!feed.error) {
    try { cache.put(cacheKey(tab), Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(out)).getBytes()), CACHE_SECONDS); }
    catch (err) { /* too big to cache: still serve it */ }
  }
  return text(out);
}

// Simple trigger: runs on every edit made in the sheet, and drops the cached feed.
function onEdit(e) {
  const name = e && e.range ? e.range.getSheet().getName() : '';
  CacheService.getScriptCache().removeAll([cacheKey(name), cacheKey('')]);
}

function cacheKey(tab) {
  return 'feed:' + tab;
}

function buildFeed(tab) {
  const ss = SpreadsheetApp.getActive();
  const sheet = tab ? ss.getSheetByName(tab) : ss.getSheets()[0];
  if (!sheet) return { error: 'Tab not found: ' + tab };

  const width = sheet.getLastColumn();
  const labels = sheet.getRange(1, 1, LABEL_ROWS_TO_SCAN, 1).getValues().map(r => norm(r[0]));
  const fieldRow = {};
  for (const [field, names] of Object.entries(FIELDS)) {
    const i = labels.findIndex(l => names.includes(l));
    if (i >= 0) fieldRow[field] = i;
  }
  if (!('brand' in fieldRow) && fieldRow.fragrance > 0) fieldRow.brand = fieldRow.fragrance - 1;
  const missing = Object.keys(FIELDS).filter(f => !(f in fieldRow));
  if (missing.length) return { error: 'Missing rows: ' + missing.join(', ') };

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
  return { tab: sheet.getName(), fetched: new Date().toISOString(), fields };
}

function norm(s) {
  return String(s).normalize('NFD').replace(/[^\x00-\x7f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function text(json) {
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
