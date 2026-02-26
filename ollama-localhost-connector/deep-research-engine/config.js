/**
 * Deep Research Engine - Configuration
 * 
 * Central configuration for the research pipeline.
 * Optimized for qwen3:0.6b (small model).
 */

module.exports = {
  // Ollama settings
  ollama: {
    host: 'localhost',
    port: 11434,
    model: 'qwen3:0.6b',
    temperature: 0.2,
    maxPredict: 500,        // Keep token output small for 0.6B model
  },

  // Search settings
  search: {
    maxLinks: 5,            // Top 5 links only
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    timeout: 15000,         // 15s timeout per request
  },

  // Article processing
  article: {
    maxWords: 1500,         // Limit each article to 1500 words
    maxCharsForModel: 4000, // ~1000 tokens for model context
  },

  // Prompt limits
  prompts: {
    maxInputTokens: 1200,   // Keep prompts under 1200 tokens
  },

  // Security: strings to strip from article text before sending to model
  security: {
    bannedPhrases: [
      'ignore previous instructions',
      'ignore all previous',
      'disregard previous',
      'system prompt',
      'act as',
      'you are now',
      'new instructions',
      'override',
      'jailbreak',
      'DAN mode',
    ],
  },
};
