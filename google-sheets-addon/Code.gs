/**
 * Muxro AI Addon for Google Sheets
 * 
 * This Google Apps Script creates a custom menu and sidebar
 * to interact with Ollama LLM via the localhost connector.
 * 
 * Setup:
 * 1. Open Google Sheets > Extensions > Apps Script
 * 2. Create files: Code.gs, Sidebar.html, Config.html
 * 3. Copy-paste the respective code into each file
 * 4. Save and reload the spreadsheet
 */

// ─── Configuration ───────────────────────────────────────────────────────────
const CONNECTOR_URL = 'http://localhost:9100';
const DEFAULT_MODEL = 'gemma3:1b';

// ─── Menu Setup ──────────────────────────────────────────────────────────────
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 Muxro AI')
    .addItem('Open AI Sidebar', 'showSidebar')
    .addItem('Generate Formula', 'showFormulaDialog')
    .addSeparator()
    .addSubMenu(ui.createMenu('Quick Actions')
      .addItem('Summarize Selection', 'summarizeSelection')
      .addItem('Translate Selection', 'translateSelection')
      .addItem('Fill with AI', 'fillWithAI'))
    .addSeparator()
    .addItem('Analyze Sheet Data', 'analyzeSheetData')
    .addItem('📄 Extract Invoice', 'showInvoiceUpload')
    .addItem('Settings', 'showSettings')
    .addToUi();
}

// ─── Show Sidebar ────────────────────────────────────────────────────────────
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Muxro AI Assistant')
    .setWidth(350);
  SpreadsheetApp.getUi().showSidebar(html);
}

// ─── Show Formula Dialog ─────────────────────────────────────────────────────
function showFormulaDialog() {
  const html = HtmlService.createHtmlOutputFromFile('FormulaDialog')
    .setWidth(500)
    .setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, 'AI Formula Generator');
}

// ─── Show Settings ───────────────────────────────────────────────────────────
function showSettings() {
  const html = HtmlService.createHtmlOutputFromFile('Config')
    .setWidth(400)
    .setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'Muxro AI Settings');
}

// ─── Get Selected Data ──────────────────────────────────────────────────────
function getSelectedData() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  if (!range) return { error: 'No selection' };

  const values = range.getValues();
  const headers = sheet.getRange(1, range.getColumn(), 1, range.getNumColumns()).getValues()[0];

  return {
    data: values,
    headers: headers,
    range: range.getA1Notation(),
    sheetName: sheet.getName(),
  };
}

// ─── Get All Sheet Data (for analysis) ──────────────────────────────────────
function getAllSheetData() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getDataRange();
  const values = range.getValues();

  return {
    data: values,
    sheetName: sheet.getName(),
    rows: values.length,
    cols: values[0].length,
  };
}

// ─── Write AI Response to Cells ─────────────────────────────────────────────
function writeToCell(value, row, col) {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (row && col) {
    sheet.getRange(row, col).setValue(value);
  } else {
    sheet.getActiveRange().getCell(1, 1).setValue(value);
  }
}

function writeToRange(values, startRow, startCol) {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (values.length > 0 && values[0].length > 0) {
    sheet.getRange(startRow, startCol, values.length, values[0].length).setValues(values);
  }
}

// ─── Insert AI result next to selection ─────────────────────────────────────
function insertResultNextToSelection(results) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  if (!range) return;

  const startRow = range.getRow();
  const startCol = range.getLastColumn() + 1;

  if (Array.isArray(results)) {
    for (let i = 0; i < results.length; i++) {
      sheet.getRange(startRow + i, startCol).setValue(results[i]);
    }
  } else {
    sheet.getRange(startRow, startCol).setValue(results);
  }
}

// ─── Summarize Selection ─────────────────────────────────────────────────────
function summarizeSelection() {
  const data = getSelectedData();
  if (data.error) {
    SpreadsheetApp.getUi().alert(data.error);
    return;
  }

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div id="status" style="font-family:Arial;padding:20px;">Connecting to Muxro AI...</div>
    <script>
      $.ajax({
        url: '${CONNECTOR_URL}/api/sheets/analyze',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          data: ${JSON.stringify(JSON.stringify(data.data))},
          instruction: 'provide a brief summary of this data'
        })
      }).done(function(resp) {
        google.script.run.withSuccessHandler(function() {
          document.getElementById('status').innerHTML = '<b>Summary inserted!</b><br>Check the cell next to your selection.';
          setTimeout(function() { google.script.host.close(); }, 2000);
        }).insertResultNextToSelection(resp.response || resp);
      }).fail(function() {
        document.getElementById('status').innerHTML = '<span style="color:red">Cannot connect. Is the Muxro AI Connector running?</span>';
      });
    </script>`)
    .setWidth(350).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, 'Summarizing...');
}

// ─── Translate Selection ─────────────────────────────────────────────────────
function translateSelection() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Translate', 'Enter target language:', ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() !== ui.Button.OK) return;
  const targetLang = response.getResponseText().trim();
  if (!targetLang) { ui.alert('Please enter a target language.'); return; }

  const data = getSelectedData();
  if (data.error) { ui.alert(data.error); return; }

  // Safely encode data for embedding into the HTML template
  const safeData = JSON.stringify(JSON.stringify(data.data));
  const safeLang = JSON.stringify(targetLang);

  const html = HtmlService.createHtmlOutput(
    '<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>' +
    '<div id="status" style="font-family:Arial;padding:20px;">' +
    '<div style="text-align:center;"><div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>' +
    '<div style="margin-top:8px;color:#5f6368;">Translating to ' + targetLang.replace(/</g, '&lt;') + '...</div></div></div>' +
    '<style>@keyframes spin { to { transform: rotate(360deg); } }</style>' +
    '<script>' +
    'var targetLang = ' + safeLang + ';' +
    'var sourceData = ' + safeData + ';' +
    '$.ajax({' +
    '  url: "' + CONNECTOR_URL + '/api/generate",' +
    '  method: "POST",' +
    '  contentType: "application/json",' +
    '  data: JSON.stringify({' +
    '    prompt: "Translate each cell value to " + targetLang + ". Input data (JSON 2D array): " + sourceData + "\\n\\nRespond with ONLY a JSON 2D array of translated strings. Same structure, same number of rows and columns. Example: [[\\"translated1\\",\\"translated2\\"],[\\"translated3\\",\\"translated4\\"]]. JSON array only, no explanations.",' +
    '    model: "translategemma:4b",'+
    '  }),' +
    '  timeout: 120000' +
    '}).done(function(resp) {' +
    '  try {' +
    '    var text = (resp.response || "").trim();' +
    '    var match = text.match(/\\[\\s*\\[[\\s\\S]*\\]\\s*\\]/);' +
    '    if (match) {' +
    '      var translated = JSON.parse(match[0]);' +
    '      var flat = translated.map(function(row) {' +
    '        if (Array.isArray(row)) return row.join(", ");' +
    '        return String(row);' +
    '      });' +
    '      google.script.run' +
    '        .withSuccessHandler(function() {' +
    '          document.getElementById("status").innerHTML = "<div style=\\"color:#1e8e3e;font-weight:bold;text-align:center;\\">\u2705 Translation complete! Check the column next to your selection.</div>";' +
    '          setTimeout(function() { google.script.host.close(); }, 2000);' +
    '        })' +
    '        .withFailureHandler(function(err) {' +
    '          document.getElementById("status").innerHTML = "<div style=\\"color:#d93025;\\">Error writing: " + (err.message || err) + "</div>";' +
    '        })' +
    '        .insertResultNextToSelection(flat);' +
    '    } else {' +
    '      var lines = text.split("\\n").filter(function(l) { return l.trim(); });' +
    '      google.script.run' +
    '        .withSuccessHandler(function() {' +
    '          document.getElementById("status").innerHTML = "<div style=\\"color:#1e8e3e;font-weight:bold;text-align:center;\\">\u2705 Translation inserted!</div>";' +
    '          setTimeout(function() { google.script.host.close(); }, 2000);' +
    '        })' +
    '        .withFailureHandler(function(err) {' +
    '          document.getElementById("status").innerHTML = "<div style=\\"color:#d93025;\\">Error: " + (err.message || err) + "</div>";' +
    '        })' +
    '        .insertResultNextToSelection(lines);' +
    '    }' +
    '  } catch(e) {' +
    '    document.getElementById("status").innerHTML = "<div style=\\"color:#d93025;\\">Parse error: " + e.message + "<br><pre style=\\"font-size:10px;max-height:100px;overflow:auto;\\">" + (resp.response || "") + "</pre></div>";' +
    '  }' +
    '}).fail(function() {' +
    '  document.getElementById("status").innerHTML = \'<div style="color:#d93025;">Cannot connect. Is the Muxro AI Connector running on port 9100?</div>\';' +
    '});' +
    '</script>'
  ).setWidth(400).setHeight(180);
  ui.showModalDialog(html, 'Translating...');
}

// ─── Fill with AI ────────────────────────────────────────────────────────────
function fillWithAI() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Fill with AI', 'Describe what data to generate (e.g., "10 random company names"):', ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() !== ui.Button.OK) return;
  const desc = response.getResponseText().trim();
  if (!desc) return;

  // Get active cell position server-side before showing the dialog
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  const startRow = range ? range.getRow() : 1;
  const startCol = range ? range.getColumn() : 1;
  const safeDesc = JSON.stringify(desc);

  const html = HtmlService.createHtmlOutput(
    '<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>' +
    '<div id="status" style="font-family:Arial;padding:20px;text-align:center;">' +
    '<div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>' +
    '<div style="margin-top:8px;color:#5f6368;">Generating data...</div></div>' +
    '<style>@keyframes spin { to { transform: rotate(360deg); } }</style>' +
    '<script>' +
    '$.ajax({' +
    '  url: "' + CONNECTOR_URL + '/api/generate",' +
    '  method: "POST",' +
    '  contentType: "application/json",' +
    '  data: JSON.stringify({' +
    '    prompt: "Generate the following data for a spreadsheet: " + ' + safeDesc + ' + ". Output ONLY CSV format, no headers unless asked, no explanations.",' +
    '    model: "gemma3:1b",' +
    '    system: "You are a data generator. Output clean CSV data only. No markdown, no explanations."' +
    '  }),' +
    '  timeout: 120000' +
    '}).done(function(resp) {' +
    '  var text = (resp.response || "").trim();' +
    '  var rows = text.split("\\n").filter(function(r) { return r.trim(); });' +
    '  var arr = rows.map(function(r) {' +
    '    return r.split(",").map(function(c) { return c.trim().replace(/^"|"$/g, ""); });' +
    '  });' +
    '  google.script.run' +
    '    .withSuccessHandler(function() {' +
    '      document.getElementById("status").innerHTML = "<div style=\\"color:#1e8e3e;font-weight:bold;\\">\\u2705 Data generated!</div>";' +
    '      setTimeout(function() { google.script.host.close(); }, 1500);' +
    '    })' +
    '    .withFailureHandler(function(err) {' +
    '      document.getElementById("status").innerHTML = "<div style=\\"color:#d93025;\\">Error: " + (err.message || err) + "</div>";' +
    '    })' +
    '    .writeToRange(arr, ' + startRow + ', ' + startCol + ');' +
    '}).fail(function() {' +
    '  document.getElementById("status").innerHTML = \'<div style="color:#d93025;">Cannot connect. Is the Muxro AI Connector running?</div>\';' +
    '});' +
    '</script>'
  ).setWidth(350).setHeight(150);
  ui.showModalDialog(html, 'Generating...');
}

// ─── Analyze Sheet Data ─────────────────────────────────────────────────────
function analyzeSheetData() {
  showSidebar();
}
// ─── Invoice Upload Dialog ───────────────────────────────────────────────
function showInvoiceUpload() {
  const html = HtmlService.createHtmlOutputFromFile('InvoiceUpload')
    .setWidth(520)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, '📄 Extract Invoice Data');
}

// ─── Get Sheet Headers (first row) ───────────────────────────────────────
function getSheetHeaders() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return { headers: [], sheetName: sheet.getName() };
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h).trim();
  }).filter(function(h) { return h !== ''; });
  return { headers: headers, sheetName: sheet.getName() };
}

// ─── Append Invoice Rows to Sheet ────────────────────────────────────────
function appendInvoiceRows(rows) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return;
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = Math.max(sheet.getLastRow(), 1); // at least row 1 for headers
  const numCols = sheet.getLastColumn() || rows[0].length;
  // Pad or trim each row to match sheet columns
  const normalized = rows.map(function(row) {
    var r = Array.isArray(row) ? row : [row];
    while (r.length < numCols) r.push('');
    return r.slice(0, numCols);
  });
  sheet.getRange(lastRow + 1, 1, normalized.length, numCols).setValues(normalized);
  SpreadsheetApp.flush();
}
// ─── Save/Load User Settings ─────────────────────────────────────────────────
function saveSettings(settings) {
  const props = PropertiesService.getUserProperties();
  props.setProperty('OLLAMA_MODEL', settings.model || DEFAULT_MODEL);
  props.setProperty('CONNECTOR_URL', settings.connectorUrl || CONNECTOR_URL);
}

function loadSettings() {
  const props = PropertiesService.getUserProperties();
  return {
    model: props.getProperty('OLLAMA_MODEL') || DEFAULT_MODEL,
    connectorUrl: props.getProperty('CONNECTOR_URL') || CONNECTOR_URL,
  };
}
