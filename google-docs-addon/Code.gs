/**
 * Muxro AI Addon for Google Docs
 * 
 * This Google Apps Script creates a custom menu and sidebar
 * to interact with Ollama LLM via the localhost connector.
 * 
 * Setup:
 * 1. Open Google Docs > Extensions > Apps Script
 * 2. Create files: Code.gs, Sidebar.html, Config.html
 * 3. Copy-paste the respective code into each file
 * 4. Save and reload the document
 */

// ─── Configuration ───────────────────────────────────────────────────────────
const CONNECTOR_URL = 'http://localhost:9100';
const DEFAULT_MODEL = 'qwen3:0.6b';

// ─── Menu Setup ──────────────────────────────────────────────────────────────
function onOpen() {
  const ui = DocumentApp.getUi();
  ui.createMenu('🤖 Muxro AI')
    .addItem('Open AI Sidebar', 'showSidebar')
    .addSeparator()
    .addSubMenu(ui.createMenu('Selected Text')
      .addItem('Summarize', 'summarizeSelected')
      .addItem('Expand', 'expandSelected')
      .addItem('Rewrite', 'rewriteSelected')
      .addItem('Proofread', 'proofreadSelected')
      .addItem('Make Formal', 'makeFormal')
      .addItem('Make Casual', 'makeCasual')
      .addItem('To Bullet Points', 'toBulletPoints'))
    .addSeparator()
    .addSubMenu(ui.createMenu('Generate')
      .addItem('Article', 'generateArticle')
      .addItem('Email', 'generateEmail')
      .addItem('Report', 'generateReport')
      .addItem('Blog Post', 'generateBlog')
      .addItem('Custom...', 'generateCustom'))
    .addSeparator()
    .addItem('🔬 Deep Research', 'showResearchSidebar')
    .addItem('Summarize Entire Document', 'summarizeDocument')
    .addItem('Settings', 'showSettings')
    .addToUi();
}

// ─── Show Sidebar ────────────────────────────────────────────────────────────
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Muxro AI Writer')
    .setWidth(350);
  DocumentApp.getUi().showSidebar(html);
}

// ─── Show Settings ───────────────────────────────────────────────────────────
function showSettings() {
  const html = HtmlService.createHtmlOutputFromFile('Config')
    .setWidth(400)
    .setHeight(300);
  DocumentApp.getUi().showModalDialog(html, 'Muxro AI Settings');
}
// ─── Show Deep Research Sidebar ──────────────────────────────────────────
function showResearchSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Research')
    .setTitle('🔬 Deep Research')
    .setWidth(400);
  DocumentApp.getUi().showSidebar(html);
}
// ─── Get Selected Text ──────────────────────────────────────────────────────
function getSelectedText() {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();

  if (!selection) return { error: 'No text selected' };

  const elements = selection.getRangeElements();
  let text = '';

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (element.getElement().editAsText) {
      const textElement = element.getElement().editAsText();
      if (element.isPartial()) {
        text += textElement.getText().substring(element.getStartOffset(), element.getEndOffsetInclusive() + 1);
      } else {
        text += textElement.getText();
      }
      if (i < elements.length - 1) text += '\n';
    }
  }

  return { text: text, length: text.length };
}

// ─── Get Full Document Text ─────────────────────────────────────────────────
function getDocumentText() {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  return { text: body.getText(), title: doc.getName() };
}

// ─── Insert Text at Cursor ──────────────────────────────────────────────────
function insertAtCursor(text) {
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();

  if (cursor) {
    cursor.insertText(text);
  } else {
    // If no cursor, append to end
    const body = doc.getBody();
    body.appendParagraph(text);
  }
}

// ─── Replace Selected Text ──────────────────────────────────────────────────
function replaceSelectedText(newText) {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();

  if (!selection) {
    insertAtCursor(newText);
    return;
  }

  const elements = selection.getRangeElements();

  // Replace first element's text
  if (elements.length > 0) {
    const firstEl = elements[0];
    const textElement = firstEl.getElement().editAsText();

    if (firstEl.isPartial()) {
      textElement.deleteText(firstEl.getStartOffset(), firstEl.getEndOffsetInclusive());
      textElement.insertText(firstEl.getStartOffset(), newText);
    } else {
      textElement.setText(newText);
    }

    // Remove subsequent selected elements
    for (let i = elements.length - 1; i > 0; i--) {
      const el = elements[i].getElement();
      if (el.getParent()) {
        el.getParent().removeChild(el);
      }
    }
  }
}

// ─── Append Text After Selection ────────────────────────────────────────────
function appendAfterSelection(text) {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();

  if (!selection) {
    insertAtCursor(text);
    return;
  }

  const elements = selection.getRangeElements();
  const lastElement = elements[elements.length - 1].getElement();
  const parent = lastElement.getParent();
  const body = doc.getBody();
  const index = body.getChildIndex(parent);

  // Insert new paragraph after selection
  const paragraph = body.insertParagraph(index + 1, text);
  return paragraph;
}

// ─── Text Operations via Modal (for menu items) ─────────────────────────────
function processSelectedText(operation, customInstruction) {
  const selected = getSelectedText();
  if (selected.error) {
    DocumentApp.getUi().alert('Please select some text first.');
    return;
  }

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div style="font-family:Arial;padding:20px;">
      <div id="status">
        <div style="text-align:center;">
          <div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <div style="margin-top:8px;color:#5f6368;">Processing with AI...</div>
        </div>
      </div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    <script>
      $.ajax({
        url: '${CONNECTOR_URL}/api/docs/process',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          text: ${JSON.stringify(selected.text)},
          operation: '${operation}',
          customInstruction: ${JSON.stringify(customInstruction || '')}
        }),
        timeout: 300000
      }).done(function(resp) {
        var result = resp.response || '';
        google.script.run.withSuccessHandler(function() {
          document.getElementById('status').innerHTML = '<div style="color:#1e8e3e;font-weight:bold;">✅ Done! Text replaced.</div>';
          setTimeout(function() { google.script.host.close(); }, 1500);
        }).replaceSelectedText(result);
      }).fail(function() {
        document.getElementById('status').innerHTML = '<div style="color:#d93025;">Cannot connect. Is the Muxro AI Connector running?</div>';
      });
    </script>`).setWidth(300).setHeight(120);

  DocumentApp.getUi().showModalDialog(html, 'Processing...');
}

function summarizeSelected() { processSelectedText('summarize'); }
function expandSelected() { processSelectedText('expand'); }
function rewriteSelected() { processSelectedText('rewrite'); }
function proofreadSelected() { processSelectedText('proofread'); }
function makeFormal() { processSelectedText('tone_formal'); }
function makeCasual() { processSelectedText('tone_casual'); }
function toBulletPoints() { processSelectedText('bullet_points'); }

// ─── Generate Content ────────────────────────────────────────────────────────
function showGenerateDialog(type) {
  const ui = DocumentApp.getUi();
  const response = ui.prompt('Generate ' + type, 'Enter the topic or subject:', ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() !== ui.Button.OK) return;
  const topic = response.getResponseText();

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div style="font-family:Arial;padding:20px;">
      <div id="status">
        <div style="text-align:center;">
          <div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <div style="margin-top:8px;color:#5f6368;">Generating ${type}...</div>
        </div>
      </div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    <script>
      $.ajax({
        url: '${CONNECTOR_URL}/api/docs/generate',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ topic: ${JSON.stringify(topic)}, type: '${type}' }),
        timeout: 300000
      }).done(function(resp) {
        google.script.run.withSuccessHandler(function() {
          document.getElementById('status').innerHTML = '<div style="color:#1e8e3e;font-weight:bold;">✅ Content generated!</div>';
          setTimeout(function() { google.script.host.close(); }, 1500);
        }).insertAtCursor(resp.response || '');
      }).fail(function() {
        document.getElementById('status').innerHTML = '<div style="color:#d93025;">Cannot connect. Is the Muxro AI Connector running?</div>';
      });
    </script>`).setWidth(300).setHeight(120);

  ui.showModalDialog(html, 'Generating...');
}

function generateArticle() { showGenerateDialog('article'); }
function generateEmail() { showGenerateDialog('email'); }
function generateReport() { showGenerateDialog('report'); }
function generateBlog() { showGenerateDialog('blog'); }
function generateCustom() {
  const ui = DocumentApp.getUi();
  const response = ui.prompt('Generate Custom Content', 'Describe what you want to generate:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() === ui.Button.OK) {
    const html = HtmlService.createHtmlOutput(`
      <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
      <div style="font-family:Arial;padding:20px;" id="status">
        <div style="text-align:center;">
          <div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <div style="margin-top:8px;color:#5f6368;">Generating...</div>
        </div>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
      <script>
        $.ajax({
          url: '${CONNECTOR_URL}/api/generate',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({ prompt: ${JSON.stringify(response.getResponseText())}, system: 'You are a professional content writer. Write well-structured content.' }),
          timeout: 300000
        }).done(function(resp) {
          google.script.run.withSuccessHandler(function() {
            document.getElementById('status').innerHTML = '<div style="color:#1e8e3e;font-weight:bold;">✅ Done!</div>';
            setTimeout(function() { google.script.host.close(); }, 1500);
          }).insertAtCursor(resp.response || '');
        }).fail(function() {
          document.getElementById('status').innerHTML = '<div style="color:#d93025;">Cannot connect.</div>';
        });
      </script>`).setWidth(300).setHeight(120);
    ui.showModalDialog(html, 'Generating...');
  }
}

// ─── Summarize Entire Document ──────────────────────────────────────────────
function summarizeDocument() {
  const docData = getDocumentText();
  if (!docData.text.trim()) {
    DocumentApp.getUi().alert('Document is empty.');
    return;
  }

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div style="font-family:Arial;padding:20px;" id="status">
      <div style="text-align:center;">
        <div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <div style="margin-top:8px;color:#5f6368;">Summarizing document...</div>
      </div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    <script>
      $.ajax({
        url: '${CONNECTOR_URL}/api/docs/process',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          text: ${JSON.stringify(docData.text.substring(0, 15000))},
          operation: 'summarize'
        }),
        timeout: 300000
      }).done(function(resp) {
        document.getElementById('status').innerHTML = 
          '<h3 style="color:#1967d2;">Document Summary</h3>' +
          '<div style="background:#f8f9fa;padding:12px;border-radius:6px;white-space:pre-wrap;max-height:300px;overflow-y:auto;">' +
          (resp.response || '') + '</div>' +
          '<button onclick="google.script.host.close()" style="margin-top:12px;padding:8px 16px;background:#4285f4;color:white;border:none;border-radius:6px;cursor:pointer;">Close</button>';
      }).fail(function() {
        document.getElementById('status').innerHTML = '<div style="color:#d93025;">Cannot connect. Is the Muxro AI Connector running?</div>';
      });
    </script>`).setWidth(500).setHeight(400);

  DocumentApp.getUi().showModalDialog(html, 'Document Summary');
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
