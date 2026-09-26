// The survey's receiver: a Google Apps Script web app on the DSS maintainer's Harvard Google account.
// The survey page POSTs each response here as JSON; this appends it as a row to a Google Sheet in the same
// account, one tab per survey year. The Sheet is created on first use and found again through the script's
// properties, so nothing here names it by ID. Deployed with `clasp` (see the README).

const SHEET_NAME = 'DSS training survey responses';
const MAX_CELL = 2000;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    // The honeypot: a field hidden from people and filled in only by bots. Report success and keep nothing.
    if (data.website) return reply_({ ok: true });
    const tab = String(data.survey || '').replace(/[^\w-]/g, '').slice(0, 30) || 'unknown';
    const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      append_(tab, answers, data.seconds);
    } finally {
      lock.releaseLock();
    }
    return reply_({ ok: true });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'The response could not be saved.' });
  }
}

// Opening the web app's address confirms it is running, and on the owner's first visit Google asks them to
// authorize it; that visit also creates the Sheet, so it exists before the first response arrives.
function doGet() {
  spreadsheet_();
  return ContentService.createTextOutput('The DSS survey receiver is running.');
}

function append_(tab, answers, seconds) {
  const ss = spreadsheet_();
  const sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
  const headers = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  // Columns come from the answers themselves, so a new question next year becomes a new column on its own.
  ['received', ...Object.keys(answers), 'seconds'].forEach(k => { if (!headers.includes(k)) headers.push(k); });
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const extra = { received: new Date(), seconds: Number(seconds) || '' };
  sh.appendRow(headers.map(h => (h in extra ? extra[h] : cell_(answers[h]))));
}

// A cell from one answer: lists joined, length capped, and anything a spreadsheet would read as a formula
// prefixed with an apostrophe so it is stored as text.
function cell_(v) {
  if (v === undefined || v === null) return '';
  let s = Array.isArray(v) ? v.map(String).join('; ') : String(v);
  s = s.slice(0, MAX_CELL);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function spreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create(SHEET_NAME);
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
