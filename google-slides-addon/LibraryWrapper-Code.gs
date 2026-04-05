/**
 * Muxro AI Slides — Library Wrapper Code.gs
 * 
 * For new users who have added the MuxroAISlider library.
 * 
 * SETUP:
 * 1. In your Apps Script project, go to Libraries (+)
 * 2. Add the MuxroAISlider library using its Script ID
 * 3. Replace your Code.gs contents with this file
 * 4. Also copy Sidebar.html and Config.html into your project
 *    (google.script.run calls land here, not in the library)
 * 5. Save and reload your Google Slides presentation
 */

// ─── Menu & UI ───────────────────────────────────────────────────────────────
function onOpen() {
  MuxroAISlider.onOpen();
}

function showSidebar() {
  MuxroAISlider.showSidebar();
}

function showSettings() {
  MuxroAISlider.showSettings();
}

// ─── Presentation Data (return values required) ──────────────────────────────
function getPresentationInfo() {
  return MuxroAISlider.getPresentationInfo();
}

function getCurrentSlideInfo() {
  return MuxroAISlider.getCurrentSlideInfo();
}

// ─── Slide Manipulation ──────────────────────────────────────────────────────
function createSlidesFromData(slidesData) {
  return MuxroAISlider.createSlidesFromData(slidesData);
}

function updateCurrentSlideContent(title, bodyText, notes) {
  return MuxroAISlider.updateCurrentSlideContent(title, bodyText, notes);
}

function addSpeakerNotesToSlide(slideIndex, notes) {
  return MuxroAISlider.addSpeakerNotesToSlide(slideIndex, notes);
}

// ─── Visual Slide Image Insertion ────────────────────────────────────────────
function insertImageToCurrentSlide(base64Data) {
  return MuxroAISlider.insertImageToCurrentSlide(base64Data);
}

function insertImageAsNewSlide(base64Data) {
  return MuxroAISlider.insertImageAsNewSlide(base64Data);
}

function storeImageChunk(chunkIndex, chunkData) {
  return MuxroAISlider.storeImageChunk(chunkIndex, chunkData);
}

function assembleAndInsertImage(totalChunks, mode) {
  return MuxroAISlider.assembleAndInsertImage(totalChunks, mode);
}

// ─── Menu Action Handlers ────────────────────────────────────────────────────
function generatePresentation() {
  MuxroAISlider.generatePresentation();
}

function generateSlideContent() {
  MuxroAISlider.generateSlideContent();
}

function generateSpeakerNotes() {
  MuxroAISlider.generateSpeakerNotes();
}

function improveCurrentSlide() {
  MuxroAISlider.improveCurrentSlide();
}

function improveAllSlides() {
  MuxroAISlider.improveAllSlides();
}

function addSpeakerNotesAll() {
  MuxroAISlider.addSpeakerNotesAll();
}

function summarizePresentation() {
  MuxroAISlider.summarizePresentation();
}

// ─── Settings (return value required for loadSettings) ───────────────────────
function saveSettings(settings) {
  MuxroAISlider.saveSettings(settings);
}

function loadSettings() {
  return MuxroAISlider.loadSettings();
}
