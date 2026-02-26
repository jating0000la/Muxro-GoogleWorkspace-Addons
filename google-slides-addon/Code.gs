/**
 * Muxro AI Addon for Google Slides
 * 
 * This Google Apps Script creates a custom menu and sidebar
 * to interact with Ollama LLM via the localhost connector.
 * 
 * Setup:
 * 1. Open Google Slides > Extensions > Apps Script
 * 2. Create files: Code.gs, Sidebar.html, Config.html
 * 3. Copy-paste the respective code into each file
 * 4. Save and reload the presentation
 */

// ─── Configuration ───────────────────────────────────────────────────────────
const CONNECTOR_URL = 'http://localhost:9100';
const DEFAULT_MODEL = 'gemma3:1b';

// ─── Menu Setup ──────────────────────────────────────────────────────────────
function onOpen() {
  const ui = SlidesApp.getUi();
  ui.createMenu('🤖 Muxro AI')
    .addItem('Open AI Sidebar', 'showSidebar')
    .addSeparator()
    .addSubMenu(ui.createMenu('Generate')
      .addItem('New Presentation Outline', 'generatePresentation')
      .addItem('Slide Content for Current Slide', 'generateSlideContent')
      .addItem('Speaker Notes', 'generateSpeakerNotes'))
    .addSeparator()
    .addSubMenu(ui.createMenu('Improve')
      .addItem('Improve Current Slide', 'improveCurrentSlide')
      .addItem('Improve All Slides', 'improveAllSlides')
      .addItem('Add Speaker Notes to All', 'addSpeakerNotesAll'))
    .addSeparator()
    .addItem('Summarize Presentation', 'summarizePresentation')
    .addItem('Settings', 'showSettings')
    .addToUi();
}

// ─── Show Sidebar ────────────────────────────────────────────────────────────
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Muxro AI for Slides')
    .setWidth(350);
  SlidesApp.getUi().showSidebar(html);
}

// ─── Show Settings ───────────────────────────────────────────────────────────
function showSettings() {
  const html = HtmlService.createHtmlOutputFromFile('Config')
    .setWidth(400)
    .setHeight(300);
  SlidesApp.getUi().showModalDialog(html, 'Muxro AI Settings');
}

// ─── Get Presentation Info ──────────────────────────────────────────────────
function getPresentationInfo() {
  const presentation = SlidesApp.getActivePresentation();
  const slides = presentation.getSlides();

  const slideData = slides.map((slide, index) => {
    const shapes = slide.getShapes();
    let textContent = '';
    let title = '';

    shapes.forEach(shape => {
      if (shape.getText) {
        const text = shape.getText().asString().trim();
        if (text) {
          // First text shape with content is likely the title
          if (!title && index === 0 || shape.getPlaceholderType && shape.getPlaceholderType() === SlidesApp.PlaceholderType.TITLE) {
            title = text;
          }
          textContent += text + '\n';
        }
      }
    });

    return {
      index: index + 1,
      title: title || 'Slide ' + (index + 1),
      content: textContent.trim(),
      notes: slide.getNotesPage().getSpeakerNotesShape().getText().asString().trim(),
    };
  });

  return {
    title: presentation.getName(),
    slideCount: slides.length,
    slides: slideData,
  };
}

// ─── Get Current Slide Info ─────────────────────────────────────────────────
function getCurrentSlideInfo() {
  const presentation = SlidesApp.getActivePresentation();
  const selection = presentation.getSelection();
  const currentPage = selection.getCurrentPage();

  if (!currentPage) return { error: 'No slide selected' };

  const slide = currentPage.asSlide();
  const shapes = slide.getShapes();
  let textContent = '';
  let title = '';

  shapes.forEach(shape => {
    if (shape.getText) {
      const text = shape.getText().asString().trim();
      if (text) {
        if (!title) title = text;
        textContent += text + '\n';
      }
    }
  });

  return {
    index: presentation.getSlides().indexOf(slide) + 1,
    title: title,
    content: textContent.trim(),
    notes: slide.getNotesPage().getSpeakerNotesShape().getText().asString().trim(),
  };
}

// ─── Normalize a bullet that may be a string or an object ───────────────────
function normalizeBulletItem(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    // Explicitly check typeof string to avoid returning nested objects
    const candidates = [item.text, item.content, item.point, item.bullet,
                        item.description, item.item, item.value, item.label];
    for (const c of candidates) {
      if (typeof c === 'string' && c) return c;
    }
    // Fall back to any string-valued property
    const strVals = Object.values(item).filter(v => typeof v === 'string' && v);
    if (strVals.length) return strVals[0];
    // Recurse one level if value is itself an object
    const objVals = Object.values(item).filter(v => v && typeof v === 'object');
    if (objVals.length) return normalizeBulletItem(objVals[0]);
    return JSON.stringify(item);
  }
  return String(item);
}

// ─── Create Slides from AI Generated Content ────────────────────────────────
function createSlidesFromData(slidesData) {
  const presentation = SlidesApp.getActivePresentation();

  slidesData.forEach((slideInfo, index) => {
    const slide = presentation.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
    const shapes = slide.getShapes();

    let titleSet = false;
    let bodySet = false;

    shapes.forEach(shape => {
      if (!shape.getText) return;
      const pType = shape.getPlaceholderType ? shape.getPlaceholderType() : null;

      // Match any title-like placeholder
      if (!titleSet && (
        pType === SlidesApp.PlaceholderType.TITLE ||
        pType === SlidesApp.PlaceholderType.CENTER_TITLE ||
        pType === SlidesApp.PlaceholderType.SUBTITLE
      )) {
        shape.getText().setText(slideInfo.title || 'Slide ' + (index + 1));
        titleSet = true;
      }
      // Match any body-like placeholder
      else if (!bodySet && (
        pType === SlidesApp.PlaceholderType.BODY ||
        pType === SlidesApp.PlaceholderType.OBJECT ||
        pType === SlidesApp.PlaceholderType.SLIDE_NUMBER
      )) {
        if (pType !== SlidesApp.PlaceholderType.SLIDE_NUMBER) {
          const bullets = (slideInfo.bullets || []).map(normalizeBulletItem);
          shape.getText().setText(bullets.join('\n'));
          bodySet = true;
        }
      }
    });

    // Fallback: if no placeholders matched, use first two shapes by position
    if (!titleSet || !bodySet) {
      const textShapes = shapes
        .filter(s => s.getText && s.getPlaceholderType &&
          s.getPlaceholderType() !== SlidesApp.PlaceholderType.NONE)
        .sort((a, b) => a.getTop() - b.getTop());

      if (!titleSet && textShapes[0]) {
        textShapes[0].getText().setText(slideInfo.title || 'Slide ' + (index + 1));
      }
      if (!bodySet && textShapes[1]) {
        const bullets = (slideInfo.bullets || []).map(normalizeBulletItem);
        textShapes[1].getText().setText(bullets.join('\n'));
      }
    }

    // Set speaker notes
    if (slideInfo.notes) {
      try {
        slide.getNotesPage().getSpeakerNotesShape().getText().setText(slideInfo.notes);
      } catch(e) { /* notes optional */ }
    }
  });

  return slidesData.length;
}

// ─── Update Current Slide Content ───────────────────────────────────────────
function updateCurrentSlideContent(title, bodyText, notes) {
  const presentation = SlidesApp.getActivePresentation();
  const selection = presentation.getSelection();
  const currentPage = selection.getCurrentPage();

  if (!currentPage) return false;

  const slide = currentPage.asSlide();
  const shapes = slide.getShapes();

  // Update shapes
  let titleSet = false;
  let bodySet = false;

  shapes.forEach(shape => {
    if (shape.getText) {
      const pType = shape.getPlaceholderType ? shape.getPlaceholderType() : null;
      if (!titleSet && (pType === SlidesApp.PlaceholderType.TITLE || pType === SlidesApp.PlaceholderType.CENTER_TITLE)) {
        if (title) shape.getText().setText(title);
        titleSet = true;
      } else if (!bodySet && pType === SlidesApp.PlaceholderType.BODY) {
        if (bodyText) shape.getText().setText(bodyText);
        bodySet = true;
      }
    }
  });

  // Update notes
  if (notes) {
    slide.getNotesPage().getSpeakerNotesShape().getText().setText(notes);
  }

  return true;
}

// ─── Add Speaker Notes to Current Slide ─────────────────────────────────────
function addSpeakerNotesToSlide(slideIndex, notes) {
  const presentation = SlidesApp.getActivePresentation();
  const slides = presentation.getSlides();

  if (slideIndex >= 0 && slideIndex < slides.length) {
    slides[slideIndex].getNotesPage().getSpeakerNotesShape().getText().setText(notes);
    return true;
  }
  return false;
}

// ─── Menu Action Handlers ────────────────────────────────────────────────────
function generatePresentation() {
  const ui = SlidesApp.getUi();
  const response = ui.prompt('Generate Presentation', 'Enter the topic for the presentation:', ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() !== ui.Button.OK) return;
  const topic = response.getResponseText();

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div style="font-family:Arial;padding:20px;" id="status">
      <div style="text-align:center;">
        <div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <div style="margin-top:8px;color:#5f6368;">Generating presentation about "${topic}"...</div>
        <div style="margin-top:4px;font-size:11px;color:#80868b;">This may take a minute...</div>
      </div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    <script>
      $.ajax({
        url: '${CONNECTOR_URL}/api/slides/generate',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ topic: ${JSON.stringify(topic)}, slideCount: 8 }),
        timeout: 300000
      }).done(function(resp) {
        try {
          var text = resp.response || '';
          // Extract JSON from response
          var match = text.match(/\\[\\s*\\{[\\s\\S]*\\}\\s*\\]/);
          if (match) {
            var slides = JSON.parse(match[0]);
            google.script.run.withSuccessHandler(function(count) {
              document.getElementById('status').innerHTML = 
                '<div style="color:#1e8e3e;font-weight:bold;text-align:center;">✅ Created ' + count + ' slides!</div>';
              setTimeout(function() { google.script.host.close(); }, 2000);
            }).createSlidesFromData(slides);
          } else {
            document.getElementById('status').innerHTML = '<div style="color:#d93025;">Could not parse AI response. Try again.</div><pre style="font-size:10px;max-height:200px;overflow:auto;">' + text + '</pre>';
          }
        } catch(e) {
          document.getElementById('status').innerHTML = '<div style="color:#d93025;">Error: ' + e.message + '</div>';
        }
      }).fail(function() {
        document.getElementById('status').innerHTML = '<div style="color:#d93025;">Cannot connect. Is the Muxro AI Connector running?</div>';
      });
    </script>`).setWidth(400).setHeight(200);

  ui.showModalDialog(html, 'Generating Presentation...');
}

function generateSlideContent() {
  const slideInfo = getCurrentSlideInfo();
  if (slideInfo.error) {
    SlidesApp.getUi().alert('Please select a slide first.');
    return;
  }

  const ui = SlidesApp.getUi();
  const response = ui.prompt('Generate Content', 'Describe what this slide should be about:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div style="font-family:Arial;padding:20px;" id="status">
      <div style="text-align:center;">
        <div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <div style="margin-top:8px;color:#5f6368;">Generating slide content...</div>
      </div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    <script>
      $.ajax({
        url: '${CONNECTOR_URL}/api/generate',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          prompt: 'Create content for a presentation slide about: ${response.getResponseText().replace(/'/g, "\\'")}. Respond with JSON: {"title":"Slide Title","bullets":["Point 1","Point 2","Point 3"],"notes":"Speaker notes"}. JSON only.',
          system: 'You are a presentation expert. Respond with valid JSON only.'
        }),
        timeout: 60000
      }).done(function(resp) {
        try {
          var text = resp.response || '';
          var match = text.match(/\\{[\\s\\S]*\\}/);
          if (match) {
            var data = JSON.parse(match[0]);
            google.script.run.withSuccessHandler(function() {
              document.getElementById('status').innerHTML = '<div style="color:#1e8e3e;text-align:center;font-weight:bold;">✅ Slide updated!</div>';
              setTimeout(function() { google.script.host.close(); }, 1500);
            }).updateCurrentSlideContent(data.title, (data.bullets||[]).join('\\n'), data.notes);
          }
        } catch(e) {
          document.getElementById('status').innerHTML = '<div style="color:#d93025;">Parse error. Try again.</div>';
        }
      }).fail(function() {
        document.getElementById('status').innerHTML = '<div style="color:#d93025;">Cannot connect.</div>';
      });
    </script>`).setWidth(350).setHeight(150);

  ui.showModalDialog(html, 'Generating...');
}

function generateSpeakerNotes() {
  const slideInfo = getCurrentSlideInfo();
  if (slideInfo.error) {
    SlidesApp.getUi().alert('Select a slide first.');
    return;
  }

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div style="font-family:Arial;padding:20px;" id="status">
      <div style="text-align:center;">
        <div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <div style="margin-top:8px;color:#5f6368;">Generating speaker notes...</div>
      </div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    <script>
      $.ajax({
        url: '${CONNECTOR_URL}/api/generate',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          prompt: 'Generate speaker notes for this presentation slide. Slide content:\\n${slideInfo.content.replace(/\n/g, '\\n').replace(/'/g, "\\'")}\\n\\nWrite 2-4 sentences of natural speaker notes that expand on the bullet points. Plain text only.',
          system: 'You are a presentation coach. Write natural, conversational speaker notes.'
        }),
        timeout: 60000
      }).done(function(resp) {
        var notes = resp.response || '';
        google.script.run.withSuccessHandler(function() {
          document.getElementById('status').innerHTML = '<div style="color:#1e8e3e;text-align:center;font-weight:bold;">✅ Speaker notes added!</div>';
          setTimeout(function() { google.script.host.close(); }, 1500);
        }).addSpeakerNotesToSlide(${slideInfo.index - 1}, notes);
      }).fail(function() {
        document.getElementById('status').innerHTML = '<div style="color:#d93025;">Cannot connect.</div>';
      });
    </script>`).setWidth(350).setHeight(150);

  SlidesApp.getUi().showModalDialog(html, 'Generating Notes...');
}

function improveCurrentSlide() {
  showSidebar(); // Direct to sidebar for more control
}

function improveAllSlides() {
  showSidebar();
}

function addSpeakerNotesAll() {
  showSidebar();
}

function summarizePresentation() {
  const info = getPresentationInfo();

  const html = HtmlService.createHtmlOutput(`
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <div style="font-family:Arial;padding:20px;" id="status">
      <div style="text-align:center;">
        <div style="display:inline-block;width:20px;height:20px;border:3px solid #e0e0e0;border-top-color:#4285f4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <div style="margin-top:8px;color:#5f6368;">Summarizing presentation...</div>
      </div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    <script>
      var presContent = ${JSON.stringify(JSON.stringify(info))};
      $.ajax({
        url: '${CONNECTOR_URL}/api/generate',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          prompt: 'Summarize this presentation:\\n' + presContent,
          system: 'You are a presentation analyst. Provide a concise summary of the presentation content and key takeaways.'
        }),
        timeout: 300000
      }).done(function(resp) {
        document.getElementById('status').innerHTML = 
          '<h3 style="color:#1967d2;">Presentation Summary</h3>' +
          '<div style="background:#f8f9fa;padding:12px;border-radius:6px;white-space:pre-wrap;max-height:300px;overflow-y:auto;font-size:12px;">' +
          (resp.response || '') + '</div>' +
          '<button onclick="google.script.host.close()" style="margin-top:12px;padding:8px 16px;background:#4285f4;color:white;border:none;border-radius:6px;cursor:pointer;">Close</button>';
      }).fail(function() {
        document.getElementById('status').innerHTML = '<div style="color:#d93025;">Cannot connect.</div>';
      });
    </script>`).setWidth(500).setHeight(400);

  SlidesApp.getUi().showModalDialog(html, 'Presentation Summary');
}

// ─── Save/Load Settings ─────────────────────────────────────────────────────
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
