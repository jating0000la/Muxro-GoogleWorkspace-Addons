/**
 * Deep Research Engine - Index
 * 
 * Entry point for the research module.
 * Exports the main controller and individual components.
 */

const { runResearch } = require('./controller');
const config = require('./config');

module.exports = {
  runResearch,
  config,
};
