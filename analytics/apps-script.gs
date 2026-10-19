/**
 * BNEF Summit kiosk — tap analytics receiver.
 *
 * Paste this whole file into a Google Sheet's Extensions > Apps Script editor,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access:
 * Anyone). Put the web-app URL into analyticsUrl in assets/js/config.js.
 *
 * Each kiosk sends batches of anonymous tap events; one row per event is
 * appended to the "Taps" tab. No personal data is collected.
 */
const SHEET_NAME = 'Taps';
const HEADERS = ['Received', 'Time (London)', 'Kiosk', 'Visit', 'Step', 'Event', 'Screen',
                 'Item type', 'Item ID', 'Item', 'Detail', 'Visit length (s)', 'Test', 'Event ID'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_();
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const events = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
    const received = new Date();
    const rows = events.map(function (ev) {
      return [received, ev.time, ev.kiosk, ev.visit, ev.seq, ev.event, ev.screen, ev.itemType,
              ev.itemId, ev.item, ev.detail, ev.duration, ev.test ? 'yes' : '', ev.id].map(clean_);
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Visiting the URL in a browser shows this, so you can check it's live.
function doGet() {
  return ContentService.createTextOutput('BNEF kiosk analytics endpoint is running.');
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// Keep values plain: stop text that starts with = + - @ being read as a formula.
function clean_(v) {
  if (v === undefined || v === null) return '';
  if (v instanceof Date || typeof v === 'number') return v;
  v = String(v).slice(0, 500);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
