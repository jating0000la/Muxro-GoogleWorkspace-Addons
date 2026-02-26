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
const DEFAULT_MODEL = 'qwen3:0.6b';

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
  sheet.getRange(row, col).setValue(value);
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
  const targetLang = response.getResponseText();

  const data = getSelectedData();
  if (data.error) { ui.alert(data.error); return; }

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div id="status" style="font-family:Arial;padding:20px;">Translating to ${targetLang}...</div>
    <script>
      $.ajax({
        url: '${CONNECTOR_URL}/api/sheets/analyze',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          data: ${JSON.stringify(JSON.stringify(data.data))},
          instruction: 'translate all text content to ${targetLang}. Return ONLY the translated data as CSV rows, one row per line.'
        })
      }).done(function(resp) {
        var text = resp.response || resp;
        var rows = text.trim().split('\\n').map(function(r) { return r.split(',').map(function(c) { return c.trim().replace(/^"|"$/g, ''); }); });
        google.script.run.withSuccessHandler(function() {
          document.getElementById('status').innerHTML = '<b>Translation complete!</b>';
          setTimeout(function() { google.script.host.close(); }, 1500);
        }).insertResultNextToSelection(rows.map(function(r) { return r.join(', '); }));
      }).fail(function() {
        document.getElementById('status').innerHTML = '<span style="color:red">Cannot connect. Is the Muxro AI Connector running?</span>';
      });
    </script>`)
    .setWidth(350).setHeight(150);
  ui.showModalDialog(html, 'Translating...');
}

// ─── Fill with AI ────────────────────────────────────────────────────────────
function fillWithAI() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Fill with AI', 'Describe what data to generate (e.g., "10 random company names"):', ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div id="status" style="font-family:Arial;padding:20px;">Generating data...</div>
    <script>
      $.ajax({
        url: '${CONNECTOR_URL}/api/generate',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          prompt: 'Generate the following data for a spreadsheet: ${response.getResponseText().replace(/'/g, "\\'")}. Output ONLY CSV format, no headers unless asked, no explanations.',
          system: 'You are a data generator. Output clean CSV data only. No markdown, no explanations.'
        })
      }).done(function(resp) {
        var text = (resp.response || resp).trim();
        var rows = text.split('\\n').filter(function(r) { return r.trim(); });
        var arr = rows.map(function(r) {
          return r.split(',').map(function(c) { return c.trim().replace(/^"|"$/g, ''); });
        });
        google.script.run.withSuccessHandler(function() {
          document.getElementById('status').innerHTML = '<b>Data generated!</b>';
          setTimeout(function() { google.script.host.close(); }, 1500);
        }).writeToRange(arr, SpreadsheetApp.getActiveSheet().getActiveRange().getRow(), SpreadsheetApp.getActiveSheet().getActiveRange().getColumn());
      }).fail(function() {
        document.getElementById('status').innerHTML = '<span style="color:red">Cannot connect. Is the Muxro AI Connector running?</span>';
      });
    </script>`)
    .setWidth(350).setHeight(150);
  ui.showModalDialog(html, 'Generating...');
}

// ─── Analyze Sheet Data ─────────────────────────────────────────────────────
function analyzeSheetData() {
  showSidebar();
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
