/**
 * Muxro AI Writer — Library Wrapper Code.gs
 * 
 * For new users who have added the MuxroAIWriter library.
 * 
 * SETUP:
 * 1. In your Apps Script project, go to Libraries (+)
 * 2. Add the MuxroAIWriter library using its Script ID
 * 3. Replace your Code.gs contents with this file
 * 4. Also copy Sidebar.html and Config.html into your project
 *    (Required because google.script.run calls land here, not in the library)
 * 5. Save and reload your Google Doc
 */

// ─── Menu & UI ───────────────────────────────────────────────────────────────
function onOpen() {
  MuxroAIWriter.onOpen();
}

function showSidebar() {
  MuxroAIWriter.showSidebar();
}

function showSettings() {
  MuxroAIWriter.showSettings();
}

// ─── Document Access (return values required) ────────────────────────────────
function getSelectedText() {
  return MuxroAIWriter.getSelectedText();
}

function getDocumentText() {
  return MuxroAIWriter.getDocumentText();
}

// ─── Insert / Replace Operations ─────────────────────────────────────────────
function insertAtCursor(text) {
  MuxroAIWriter.insertAtCursor(text);
}

function insertFormattedAtCursor(text) {
  MuxroAIWriter.insertFormattedAtCursor(text);
}

function replaceSelectedWithFormatted(markdownText) {
  MuxroAIWriter.replaceSelectedWithFormatted(markdownText);
}

function insertFormattedAfterSelection(markdownText) {
  MuxroAIWriter.insertFormattedAfterSelection(markdownText);
}

function insertMarkdownReport(markdown) {
  MuxroAIWriter.insertMarkdownReport(markdown);
}

function convertMarkdownSelection() {
  MuxroAIWriter.convertMarkdownSelection();
}

function replaceSelectedText(newText) {
  MuxroAIWriter.replaceSelectedText(newText);
}

function appendAfterSelection(text) {
  MuxroAIWriter.appendAfterSelection(text);
}

// ─── Text Processing (menu-triggered) ────────────────────────────────────────
function processSelectedText(operation, customInstruction) {
  MuxroAIWriter.processSelectedText(operation, customInstruction);
}

function summarizeSelected()  { MuxroAIWriter.summarizeSelected(); }
function expandSelected()     { MuxroAIWriter.expandSelected(); }
function rewriteSelected()    { MuxroAIWriter.rewriteSelected(); }
function proofreadSelected()  { MuxroAIWriter.proofreadSelected(); }
function makeFormal()         { MuxroAIWriter.makeFormal(); }
function makeCasual()         { MuxroAIWriter.makeCasual(); }
function toBulletPoints()     { MuxroAIWriter.toBulletPoints(); }

// ─── Generate Content ────────────────────────────────────────────────────────
function showGenerateDialog(type) {
  MuxroAIWriter.showGenerateDialog(type);
}

function generateArticle() { MuxroAIWriter.generateArticle(); }
function generateEmail()   { MuxroAIWriter.generateEmail(); }
function generateReport()  { MuxroAIWriter.generateReport(); }
function generateBlog()    { MuxroAIWriter.generateBlog(); }
function generateCustom()  { MuxroAIWriter.generateCustom(); }

// ─── Document Summary ────────────────────────────────────────────────────────
function summarizeDocument() {
  MuxroAIWriter.summarizeDocument();
}

// ─── Settings (return value required for loadSettings) ───────────────────────
function saveSettings(settings) {
  MuxroAIWriter.saveSettings(settings);
}

function loadSettings() {
  return MuxroAIWriter.loadSettings();
}
