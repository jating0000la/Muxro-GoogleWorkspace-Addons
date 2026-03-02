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
      .addItem('To Bullet Points', 'toBulletPoints')
      .addItem('Convert Markdown to Formatted', 'convertMarkdownSelection'))
    .addSeparator()
    .addSubMenu(ui.createMenu('Generate')
      .addItem('Article', 'generateArticle')
      .addItem('Email', 'generateEmail')
      .addItem('Report', 'generateReport')
      .addItem('Blog Post', 'generateBlog')
      .addItem('Custom...', 'generateCustom'))
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

// ─── Detect Markdown Content ─────────────────────────────────────────────────
/**
 * Returns true if text appears to contain markdown syntax.
 */
function hasMarkdown_(text) {
  if (!text) return false;
  // Check for common markdown patterns
  return /^#{1,6}\s/m.test(text) ||           // headings
         /^[-*+]\s+/m.test(text) ||           // bullet lists
         /^\d+\.\s+/m.test(text) ||           // numbered lists
         /\*\*[^*]+\*\*/m.test(text) ||       // bold
         /\*[^*]+\*/m.test(text) ||            // italic
         /__[^_]+__/m.test(text) ||             // bold (underscore)
         /_[^_]+_/m.test(text) ||               // italic (underscore)
         /^```/m.test(text) ||                  // code blocks
         /^>{1}\s/m.test(text) ||              // blockquotes
         /^[-*_]{3,}$/m.test(text) ||           // horizontal rules
         /~~[^~]+~~/m.test(text) ||             // strikethrough
         /`[^`]+`/m.test(text) ||               // inline code
         /\[.+\]\(.+\)/m.test(text) ||        // links
         /^\|.+\|$/m.test(text);               // tables
}

// ─── Insert Text at Cursor (plain) ──────────────────────────────────────────
function insertAtCursor(text) {
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();

  if (cursor) {
    cursor.insertText(text);
  } else {
    const body = doc.getBody();
    body.appendParagraph(text);
  }
}

// ─── Insert Formatted Markdown at Cursor ────────────────────────────────────
/**
 * Smart insert: detects markdown and inserts as formatted Google Docs elements.
 * Falls back to plain text insert if no markdown detected.
 */
function insertFormattedAtCursor(text) {
  if (!hasMarkdown_(text)) {
    insertAtCursor(text);
    return;
  }
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  let insertIndex = body.getNumChildren();
  const cursor = doc.getCursor();
  if (cursor) {
    let parent = cursor.getElement();
    while (parent && parent.getParent() && parent.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
      parent = parent.getParent();
    }
    if (parent && parent.getParent()) {
      insertIndex = body.getChildIndex(parent) + 1;
    }
  }
  insertMarkdownAtIndex_(body, text, insertIndex);
}

// ─── Replace Selection with Formatted Markdown ──────────────────────────────
/**
 * Replaces the current selection with formatted markdown content.
 * If text has markdown syntax, removes selected elements and inserts
 * properly formatted headings, lists, bold, etc.
 * Falls back to plain text if no markdown detected.
 */
function replaceSelectedWithFormatted(markdownText) {
  if (!hasMarkdown_(markdownText)) {
    replaceSelectedText(markdownText);
    return;
  }
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();
  if (!selection) {
    insertFormattedAtCursor(markdownText);
    return;
  }
  const body = doc.getBody();
  const elements = selection.getRangeElements();

  // Find body-level insert index from the first selected element
  let firstParent = elements[0].getElement();
  while (firstParent.getParent() && firstParent.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
    firstParent = firstParent.getParent();
  }
  const insertIndex = body.getChildIndex(firstParent);

  // Collect unique body-level parents to remove
  const parentsToRemove = [];
  const seen = {};
  for (let i = 0; i < elements.length; i++) {
    let parent = elements[i].getElement();
    while (parent.getParent() && parent.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
      parent = parent.getParent();
    }
    const idx = body.getChildIndex(parent);
    if (!seen[idx]) {
      seen[idx] = true;
      parentsToRemove.push(parent);
    }
  }

  // Insert formatted markdown first
  insertMarkdownAtIndex_(body, markdownText, insertIndex);

  // Remove the original selected elements
  for (let i = parentsToRemove.length - 1; i >= 0; i--) {
    try { body.removeChild(parentsToRemove[i]); } catch (e) {}
  }
}

// ─── Insert Formatted Markdown After Selection ──────────────────────────────
/**
 * Inserts formatted markdown after the current selection.
 * Falls back to plain paragraph if no markdown detected.
 */
function insertFormattedAfterSelection(markdownText) {
  if (!hasMarkdown_(markdownText)) {
    appendAfterSelection(markdownText);
    return;
  }
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();
  if (!selection) {
    insertFormattedAtCursor(markdownText);
    return;
  }
  const body = doc.getBody();
  const elements = selection.getRangeElements();
  const lastElement = elements[elements.length - 1].getElement();
  let parent = lastElement;
  while (parent.getParent() && parent.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
    parent = parent.getParent();
  }
  const insertIndex = body.getChildIndex(parent) + 1;
  insertMarkdownAtIndex_(body, markdownText, insertIndex);
}

// ─── Insert Markdown Report as Formatted Doc ────────────────────────────────
/**
 * Parses markdown text and inserts properly formatted elements into the doc.
 * Supports: headings (#-###), bold (**), italic (*), bullet/numbered lists,
 * horizontal rules (---), and regular paragraphs.
 */
function insertMarkdownReport(markdown) {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();

  // Find insert position: after cursor, or end of doc
  let insertIndex = body.getNumChildren();
  const cursor = doc.getCursor();
  if (cursor) {
    const cursorEl = cursor.getElement();
    let parent = cursorEl;
    while (parent && parent.getParent() && parent.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
      parent = parent.getParent();
    }
    if (parent && parent.getParent()) {
      insertIndex = body.getChildIndex(parent) + 1;
    }
  }

  const lines = markdown.split('\n');
  let idx = insertIndex;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Skip empty lines (they act as spacing — we get natural spacing from paragraphs)
    if (raw.trim() === '') continue;

    // --- Horizontal rule (---, ***, ___, - - -, etc.) ---
    var trimmed = raw.trim();
    if (/^[-]{3,}$/.test(trimmed) || /^[*]{3,}$/.test(trimmed) || /^[_]{3,}$/.test(trimmed) ||
        /^(- ){2,}-$/.test(trimmed) || /^(\* ){2,}\*$/.test(trimmed) || /^(_ ){2,}_$/.test(trimmed)) {
      var hrPara = body.insertParagraph(idx, '');
      hrPara.appendHorizontalRule();
      if (hrPara.getNumChildren() > 1) {
        try { hrPara.getChild(0).removeFromParent(); } catch(e) {}
      }
      idx++;
      continue;
    }

    // --- Headings (### text, ###text, ### text ###) ---
    var headingMatch = raw.match(/^(#{1,6})\s*(.*?)\s*#*\s*$/);
    if (headingMatch) {
      var level = headingMatch[1].length;
      var headingText = (headingMatch[2] || '').trim() || 'Heading ' + level;
      var para = body.insertParagraph(idx, '');
      var headingMap = {
        1: DocumentApp.ParagraphHeading.HEADING1,
        2: DocumentApp.ParagraphHeading.HEADING2,
        3: DocumentApp.ParagraphHeading.HEADING3,
        4: DocumentApp.ParagraphHeading.HEADING4,
        5: DocumentApp.ParagraphHeading.HEADING5,
        6: DocumentApp.ParagraphHeading.HEADING6,
      };
      para.setHeading(headingMap[level] || DocumentApp.ParagraphHeading.HEADING3);
      applyInlineFormatting_(para, headingText);
      idx++;
      continue;
    }

    // --- Unordered list (-, *, +) ---
    var ulMatch = raw.match(/^[\s]*[-*+]\s+(.+)/);
    if (ulMatch) {
      var item = body.insertListItem(idx, '');
      item.setGlyphType(DocumentApp.GlyphType.BULLET);
      applyInlineFormatting_(item, ulMatch[1]);
      // Detect nesting (2+ spaces or tab)
      var indent = raw.match(/^(\s*)/)[1].length;
      if (indent >= 2) item.setNestingLevel(Math.min(Math.floor(indent / 2), 3));
      idx++;
      continue;
    }

    // --- Ordered list (1. 2. etc.) ---
    var olMatch = raw.match(/^[\s]*\d+\.\s+(.+)/);
    if (olMatch) {
      var item = body.insertListItem(idx, '');
      item.setGlyphType(DocumentApp.GlyphType.NUMBER);
      applyInlineFormatting_(item, olMatch[1]);
      var indent = raw.match(/^(\s*)/)[1].length;
      if (indent >= 2) item.setNestingLevel(Math.min(Math.floor(indent / 2), 3));
      idx++;
      continue;
    }

    // --- Regular paragraph ---
    var para = body.insertParagraph(idx, '');
    para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    applyInlineFormatting_(para, raw);
    idx++;
  }
}

/**
 * Apply inline bold/italic formatting to a paragraph or list item.
 * Processes **bold**, *italic*, and ***bold-italic*** markers.
 */
function applyInlineFormatting_(element, text) {
  // First pass: find all bold/italic segments and build a flat string + style map
  var segments = [];
  var regex = /(\*{1,3})((?:(?!\1).)+?)\1/g;
  var lastIndex = 0;
  var match;

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.substring(lastIndex, match.index), bold: false, italic: false });
    }
    var stars = match[1].length;
    segments.push({
      text: match[2],
      bold: stars >= 2,
      italic: stars === 1 || stars === 3,
    });
    lastIndex = regex.lastIndex;
  }
  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.substring(lastIndex), bold: false, italic: false });
  }

  // Build the full plain string
  var fullText = segments.map(function(s) { return s.text; }).join('');
  element.setText(fullText);

  // Apply formatting ranges
  var textEl = element.editAsText();
  var offset = 0;
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    var end = offset + seg.text.length - 1;
    if (end >= offset) {
      if (seg.bold) textEl.setBold(offset, end, true);
      if (seg.italic) textEl.setItalic(offset, end, true);
    }
    offset = end + 1;
  }
}

// ─── Convert Markdown Selection to Formatted Doc ───────────────────────────
/**
 * Takes the currently selected text (assumed to be markdown), removes the
 * selection, and inserts properly formatted Google Docs elements in its place.
 * Supports: headings (#-######), bold (**), italic (*), bold-italic (***),
 * strikethrough (~~), inline code (`), code blocks (```), blockquotes (>),
 * bullet lists (- * +), numbered lists (1.), horizontal rules (---), and links.
 */
function convertMarkdownSelection() {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();

  if (!selection) {
    DocumentApp.getUi().alert('Please select the markdown text you want to convert.');
    return;
  }

  // Gather the full selected text
  const elements = selection.getRangeElements();
  let markdownText = '';
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.getElement().editAsText) {
      const textEl = el.getElement().editAsText();
      if (el.isPartial()) {
        markdownText += textEl.getText().substring(el.getStartOffset(), el.getEndOffsetInclusive() + 1);
      } else {
        markdownText += textEl.getText();
      }
      if (i < elements.length - 1) markdownText += '\n';
    }
  }

  if (!markdownText.trim()) {
    DocumentApp.getUi().alert('Selected text is empty.');
    return;
  }

  const body = doc.getBody();

  // Find the body-level index of the first selected element
  let firstParent = elements[0].getElement();
  while (firstParent.getParent() && firstParent.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
    firstParent = firstParent.getParent();
  }
  const insertIndex = body.getChildIndex(firstParent);

  // Remove selected body-level elements (collect unique parents first)
  const parentsToRemove = [];
  const seen = {};
  for (let i = 0; i < elements.length; i++) {
    let parent = elements[i].getElement();
    while (parent.getParent() && parent.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
      parent = parent.getParent();
    }
    const idx = body.getChildIndex(parent);
    if (!seen[idx]) {
      seen[idx] = true;
      parentsToRemove.push(parent);
    }
  }

  // Insert formatted markdown at the insertion point first, then remove old elements
  const newIdx = insertMarkdownAtIndex_(body, markdownText, insertIndex);

  // Remove the original elements (they have shifted by the number of inserted elements)
  const inserted = newIdx - insertIndex;
  for (let i = parentsToRemove.length - 1; i >= 0; i--) {
    // Recalculate since indices shift
    try {
      body.removeChild(parentsToRemove[i]);
    } catch (e) {
      // Element may already have been removed if partial overlap
    }
  }
}

/**
 * Insert parsed markdown as formatted elements at a specific body index.
 * Returns the next index after all inserted elements.
 */
function insertMarkdownAtIndex_(body, markdown, startIndex) {
  const lines = markdown.split('\n');
  let idx = startIndex;
  let inCodeBlock = false;
  let codeBlockLines = [];
  let codeBlockLang = '';
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // --- Code block fences (```) ---
    if (/^\s*```/.test(raw)) {
      // Flush any pending table
      if (inTable) { idx = flushTable_(body, tableRows, idx); inTable = false; tableRows = []; }
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = raw.replace(/^\s*```/, '').trim();
        codeBlockLines = [];
        continue;
      } else {
        // End of code block — insert as a single monospace paragraph
        var codeContent = codeBlockLines.join('\n');
        if (codeContent === '') codeContent = ' '; // avoid empty text error
        var codePara = body.insertParagraph(idx, codeContent);
        codePara.setHeading(DocumentApp.ParagraphHeading.NORMAL);
        var codeText = codePara.editAsText();
        codeText.setFontFamily('Courier New');
        codeText.setFontSize(10);
        codeText.setBackgroundColor('#f5f5f5');
        codeText.setForegroundColor('#333333');
        codePara.setLeftIndent(18);
        codePara.setRightIndent(12);
        idx++;
        inCodeBlock = false;
        codeBlockLines = [];
        continue;
      }
    }
    if (inCodeBlock) {
      codeBlockLines.push(raw);
      continue;
    }

    // --- Markdown table detection (| col | col |) ---
    var tableMatch = raw.match(/^\s*\|(.+)\|\s*$/);
    if (tableMatch) {
      // Check if it's a separator row (|---|---| or |:---:|)
      var isSep = /^[\s|:\-]+$/.test(raw);
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      if (!isSep) {
        // Parse cells
        var cells = tableMatch[1].split('|').map(function(c) { return c.trim(); });
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      // End of table — flush
      idx = flushTable_(body, tableRows, idx);
      inTable = false;
      tableRows = [];
      // Fall through to process current line normally
    }

    // Skip empty lines
    if (raw.trim() === '') continue;

    // --- Horizontal rule (---, ***, ___, - - -, etc.) ---
    var trimmed = raw.trim();
    if (/^[-]{3,}$/.test(trimmed) || /^[*]{3,}$/.test(trimmed) || /^[_]{3,}$/.test(trimmed) ||
        /^(- ){2,}-$/.test(trimmed) || /^(\* ){2,}\*$/.test(trimmed) || /^(_ ){2,}_$/.test(trimmed)) {
      var hrPara = body.insertParagraph(idx, '');
      hrPara.appendHorizontalRule();
      if (hrPara.getNumChildren() > 1) {
        try { hrPara.getChild(0).removeFromParent(); } catch(e) {}
      }
      idx++;
      continue;
    }

    // --- Headings (### text, ###text, ### text ###) ---
    var headingMatch = raw.match(/^(#{1,6})\s*(.*?)\s*#*\s*$/);
    if (headingMatch) {
      var level = headingMatch[1].length;
      var headingText = (headingMatch[2] || '').trim() || 'Heading ' + level;
      var para = body.insertParagraph(idx, '');
      var headingMap = {
        1: DocumentApp.ParagraphHeading.HEADING1,
        2: DocumentApp.ParagraphHeading.HEADING2,
        3: DocumentApp.ParagraphHeading.HEADING3,
        4: DocumentApp.ParagraphHeading.HEADING4,
        5: DocumentApp.ParagraphHeading.HEADING5,
        6: DocumentApp.ParagraphHeading.HEADING6,
      };
      para.setHeading(headingMap[level] || DocumentApp.ParagraphHeading.HEADING3);
      applyRichInlineFormatting_(para, headingText);
      idx++;
      continue;
    }

    // --- Blockquote (>) with nesting support ---
    var bqMatch = raw.match(/^(>+)\s?(.*)/);
    if (bqMatch) {
      var bqLevel = bqMatch[1].length;
      var para = body.insertParagraph(idx, '');
      para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
      para.setLeftIndent(24 * bqLevel);
      applyRichInlineFormatting_(para, bqMatch[2] || '');
      para.editAsText().setItalic(true);
      para.editAsText().setForegroundColor('#5f6368');
      idx++;
      continue;
    }

    // --- Task list (- [ ] or - [x]) ---
    var taskMatch = raw.match(/^([\s]*)[-*+]\s+\[([ xX])\]\s+(.+)/);
    if (taskMatch) {
      var isChecked = (taskMatch[2].toLowerCase() === 'x');
      var item = body.insertListItem(idx, '');
      item.setGlyphType(DocumentApp.GlyphType.BULLET);
      var taskText = (isChecked ? '☑ ' : '☐ ') + taskMatch[3];
      applyRichInlineFormatting_(item, taskText);
      if (isChecked) {
        item.editAsText().setStrikethrough(2, 2 + taskMatch[3].length - 1, true);
        item.editAsText().setForegroundColor(2, 2 + taskMatch[3].length - 1, '#9aa0a6');
      }
      var indent = taskMatch[1].length;
      if (indent >= 2) item.setNestingLevel(Math.min(Math.floor(indent / 2), 3));
      idx++;
      continue;
    }

    // --- Unordered list (-, *, +) ---
    var ulMatch = raw.match(/^([\s]*)([-*+])\s+(.+)/);
    if (ulMatch) {
      var item = body.insertListItem(idx, '');
      item.setGlyphType(DocumentApp.GlyphType.BULLET);
      applyRichInlineFormatting_(item, ulMatch[3]);
      var indent = ulMatch[1].length;
      if (indent >= 2) item.setNestingLevel(Math.min(Math.floor(indent / 2), 3));
      idx++;
      continue;
    }

    // --- Ordered list (1. 2. etc.) ---
    var olMatch = raw.match(/^([\s]*)\d+\.\s+(.+)/);
    if (olMatch) {
      var item = body.insertListItem(idx, '');
      item.setGlyphType(DocumentApp.GlyphType.NUMBER);
      applyRichInlineFormatting_(item, olMatch[2]);
      var indent = olMatch[1].length;
      if (indent >= 2) item.setNestingLevel(Math.min(Math.floor(indent / 2), 3));
      idx++;
      continue;
    }

    // --- Regular paragraph ---
    var para = body.insertParagraph(idx, '');
    para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    applyRichInlineFormatting_(para, raw);
    idx++;
  }

  // Flush any pending table at end of text
  if (inTable && tableRows.length > 0) {
    idx = flushTable_(body, tableRows, idx);
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    var codeContent = codeBlockLines.join('\n') || ' ';
    var codePara = body.insertParagraph(idx, codeContent);
    codePara.editAsText().setFontFamily('Courier New');
    codePara.editAsText().setFontSize(10);
    codePara.editAsText().setBackgroundColor('#f5f5f5');
    codePara.editAsText().setForegroundColor('#333333');
    codePara.setLeftIndent(18);
    idx++;
  }

  return idx;
}

/**
 * Flush collected markdown table rows as a Google Docs table.
 * First row is treated as header (bold).
 */
function flushTable_(body, rows, idx) {
  if (!rows || rows.length === 0) return idx;
  var numCols = rows[0].length;
  var numRows = rows.length;

  var table = body.insertTable(idx, []);
  // Remove the default empty row that insertTable may create
  while (table.getNumRows() > 0) table.removeRow(0);

  for (var r = 0; r < numRows; r++) {
    var row = table.appendTableRow();
    for (var c = 0; c < numCols; c++) {
      var cellText = (rows[r][c] || '').trim();
      var cell = row.appendTableCell('');
      if (r === 0) {
        // Header row: bold
        applyRichInlineFormatting_(cell.getChild(0).asParagraph(), cellText);
        cell.getChild(0).asParagraph().editAsText().setBold(true);
        cell.setBackgroundColor('#f1f3f4');
      } else {
        applyRichInlineFormatting_(cell.getChild(0).asParagraph(), cellText);
      }
    }
  }
  return idx + 1;
}

/**
 * Enhanced inline formatting: supports **bold**, *italic*, ***bold-italic***,
 * ~~strikethrough~~, `inline code`, and [links](url).
 */
function applyRichInlineFormatting_(element, text) {
  var segments = [];
  // Combined regex: handles */**/***, __/__bold__, ~~strike~~, `code`, [link](url), ![img](url)
  // Order matters: longer patterns first to avoid partial matches
  var regex = /(\*{1,3})((?:(?!\1).)+?)\1|(__)((?:(?!__).)+?)__|(_)((?:(?!_).)+?)_|~~(.+?)~~|`([^`]+)`|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)/g;
  var lastIndex = 0;
  var match;

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.substring(lastIndex, match.index), bold: false, italic: false, strike: false, code: false, link: null });
    }

    if (match[1]) {
      // Asterisk bold/italic: *, **, ***
      var stars = match[1].length;
      segments.push({
        text: match[2],
        bold: stars >= 2,
        italic: stars === 1 || stars === 3,
        strike: false, code: false, link: null
      });
    } else if (match[3] !== undefined && match[3] === '__') {
      // __bold__ (underscore double)
      segments.push({ text: match[4], bold: true, italic: false, strike: false, code: false, link: null });
    } else if (match[5] !== undefined && match[5] === '_') {
      // _italic_ (underscore single)
      segments.push({ text: match[6], bold: false, italic: true, strike: false, code: false, link: null });
    } else if (match[7] !== undefined) {
      // ~~Strikethrough~~
      segments.push({ text: match[7], bold: false, italic: false, strike: true, code: false, link: null });
    } else if (match[8] !== undefined) {
      // `inline code`
      segments.push({ text: match[8], bold: false, italic: false, strike: false, code: true, link: null });
    } else if (match[9] !== undefined) {
      // ![alt](url) — image: show as linked text since Docs can't inline-insert from URL in Apps Script
      var altText = match[9] || 'Image';
      segments.push({ text: '🖼 ' + altText, bold: false, italic: false, strike: false, code: false, link: match[10] });
    } else if (match[11] !== undefined) {
      // [text](url) — link
      segments.push({ text: match[11], bold: false, italic: false, strike: false, code: false, link: match[12] });
    }

    lastIndex = regex.lastIndex;
  }
  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.substring(lastIndex), bold: false, italic: false, strike: false, code: false, link: null });
  }

  // Build plain string
  var fullText = segments.map(function(s) { return s.text; }).join('');
  if (!fullText) fullText = ' '; // Avoid empty text error
  element.setText(fullText);

  // Apply formatting ranges
  var textEl = element.editAsText();
  var offset = 0;
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    var end = offset + seg.text.length - 1;
    if (end >= offset && seg.text.length > 0) {
      if (seg.bold)   textEl.setBold(offset, end, true);
      if (seg.italic) textEl.setItalic(offset, end, true);
      if (seg.strike) textEl.setStrikethrough(offset, end, true);
      if (seg.code) {
        textEl.setFontFamily(offset, end, 'Courier New');
        textEl.setBackgroundColor(offset, end, '#f5f5f5');
        textEl.setFontSize(offset, end, 10);
      }
      if (seg.link) {
        textEl.setLinkUrl(offset, end, seg.link);
        textEl.setForegroundColor(offset, end, '#1a73e8');
        textEl.setUnderline(offset, end, true);
      }
    }
    offset = end + 1;
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
