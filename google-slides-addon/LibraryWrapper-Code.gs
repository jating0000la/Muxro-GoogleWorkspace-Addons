/**
 * Muxro AI Slides — Library Wrapper Code.gs
 * 
 * For new users who have added the MuxroAISlides library.
 * 
 * SETUP:
 * 1. In your Apps Script project, go to Libraries (+)
 * 2. Add the MuxroAISlides library using its Script ID
 * 3. Replace your Code.gs contents with this file
 * 4. Also copy Sidebar.html and Config.html into your project
 *    (google.script.run calls land here, not in the library)
 * 5. Save and reload your Google Slides presentation
 */

// ─── Menu & UI ───────────────────────────────────────────────────────────────
function onOpen() {
  MuxroAISlides.onOpen();
}

function showSidebar() {
  MuxroAISlides.showSidebar();
}

function showSettings() {
  MuxroAISlides.showSettings();
}

// ─── Presentation Data (return values required) ──────────────────────────────
function getPresentationInfo() {
  return MuxroAISlides.getPresentationInfo();
}

function getCurrentSlideInfo() {
  return MuxroAISlides.getCurrentSlideInfo();
}

// ─── Slide Manipulation ──────────────────────────────────────────────────────
function createSlidesFromData(slidesData) {
  return MuxroAISlides.createSlidesFromData(slidesData);
}

function updateCurrentSlideContent(title, bodyText, notes) {
  return MuxroAISlides.updateCurrentSlideContent(title, bodyText, notes);
}

function addSpeakerNotesToSlide(slideIndex, notes) {
  return MuxroAISlides.addSpeakerNotesToSlide(slideIndex, notes);
}

// ─── Menu Action Handlers ────────────────────────────────────────────────────
function generatePresentation() {
  MuxroAISlides.generatePresentation();
}

function generateSlideContent() {
  MuxroAISlides.generateSlideContent();
}

function generateSpeakerNotes() {
  MuxroAISlides.generateSpeakerNotes();
}

function improveCurrentSlide() {
  MuxroAISlides.improveCurrentSlide();
}

function improveAllSlides() {
  MuxroAISlides.improveAllSlides();
}

function addSpeakerNotesAll() {
  MuxroAISlides.addSpeakerNotesAll();
}

function summarizePresentation() {
  MuxroAISlides.summarizePresentation();
}

// ─── Settings (return value required for loadSettings) ───────────────────────
function saveSettings(settings) {
  MuxroAISlides.saveSettings(settings);
}

function loadSettings() {
  return MuxroAISlides.loadSettings();
}
