// List of banned words for chat moderation
const BANNED_WORDS = [
  "demo",
  "admin",
  // Add more banned words as needed
];

/**
 * Check if a message contains any banned words
 * Uses word boundary matching to avoid false positives
 * @param {string} message - The message to check
 * @returns {boolean} - True if banned word is found
 */
export const containsBannedWord = (message) => {
  if (!message || typeof message !== "string") return false;

  const lowerMessage = message.toLowerCase();
  
  return BANNED_WORDS.some((word) => {
    // Create regex with word boundaries to match whole words only
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    return regex.test(lowerMessage);
  });
};

/**
 * Get the banned word found in the message (if any)
 * @param {string} message - The message to check
 * @returns {string|null} - The banned word found or null
 */
export const getBannedWordInMessage = (message) => {
  if (!message || typeof message !== "string") return null;

  const lowerMessage = message.toLowerCase();
  
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(lowerMessage)) {
      return word;
    }
  }
  
  return null;
};

export default {
  containsBannedWord,
  getBannedWordInMessage,
  BANNED_WORDS,
};
