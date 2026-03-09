/**
 * Muxro AI Sheets — Library Wrapper Code.gs
 * 
 * For new users who have added the MuxroAISheets library.
 * 
 * SETUP:
 * 1. In your Apps Script project, go to Libraries (+)
 * 2. Add the MuxroAISheets library using its Script ID
 * 3. Replace your Code.gs contents with this file
 * 4. Also copy Sidebar.html, Config.html, FormulaDialog.html, and InvoiceUpload.html
 *    into your project (google.script.run calls land here, not in the library)
 * 5. Save and reload your Google Sheet
 */

// ─── Menu & UI ───────────────────────────────────────────────────────────────
function onOpen() {
  MuxroAISheets.onOpen();
}

function showSidebar() {
  MuxroAISheets.showSidebar();
}

function showFormulaDialog() {
  MuxroAISheets.showFormulaDialog();
}

function showSettings() {
  MuxroAISheets.showSettings();
}

function showInvoiceUpload() {
  MuxroAISheets.showInvoiceUpload();
}

// ─── Data Access (return values required) ────────────────────────────────────
function getSelectedData() {
  return MuxroAISheets.getSelectedData();
}

function getAllSheetData() {
  return MuxroAISheets.getAllSheetData();
}

function getSheetHeaders() {
  return MuxroAISheets.getSheetHeaders();
}

// ─── Write Operations ────────────────────────────────────────────────────────
function writeToCell(value, row, col) {
  MuxroAISheets.writeToCell(value, row, col);
}

function writeToRange(values, startRow, startCol) {
  MuxroAISheets.writeToRange(values, startRow, startCol);
}

function insertResultNextToSelection(results) {
  MuxroAISheets.insertResultNextToSelection(results);
}

function appendInvoiceRows(rows) {
  MuxroAISheets.appendInvoiceRows(rows);
}

// ─── Menu Actions ────────────────────────────────────────────────────────────
function summarizeSelection() {
  MuxroAISheets.summarizeSelection();
}

function translateSelection() {
  MuxroAISheets.translateSelection();
}

function fillWithAI() {
  MuxroAISheets.fillWithAI();
}

function analyzeSheetData() {
  MuxroAISheets.analyzeSheetData();
}

// ─── Settings (return value required for loadSettings) ───────────────────────
function saveSettings(settings) {
  MuxroAISheets.saveSettings(settings);
}

function loadSettings() {
  return MuxroAISheets.loadSettings();
}
