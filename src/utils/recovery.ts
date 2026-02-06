/**
 * Recovery words generator
 * Generates 33 random words for agent recovery
 * Uses BIP39 English wordlist - standard for crypto wallets
 * Can be used for account recovery or migration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load official BIP39 English wordlist at runtime from text file (2048 words, one per line)
// Fallback: if file is missing, throw a clear error so we don't silently use a bad list
function loadBip39WordList(): string[] {
  const candidates = [
    path.resolve(process.cwd(), 'bip39-english.txt'),
    path.resolve(process.cwd(), 'src', 'utils', 'bip39-english.txt'),
    path.resolve(__dirname, 'bip39-english.txt'),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const contents = fs.readFileSync(p, 'utf8');
        const words = contents.split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
        if (words.length === 2048) return words;
        throw new Error(`BIP39 wordlist at ${p} has ${words.length} entries (expected 2048)`);
      }
    } catch (e) {
      // try next candidate
    }
  }
  throw new Error('BIP39 wordlist not found. Place english.txt as bip39-english.txt in project root.');
}

const WORD_LIST = loadBip39WordList();



/**
 * Generate recovery words for agent
 * Returns 33 random words from the word list
 */
export function generateRecoveryWords(): string[] {
  const words: string[] = [];
  const used = new Set<number>();

  while (words.length < 33) {
    const randomIndex = Math.floor(Math.random() * WORD_LIST.length);
    if (!used.has(randomIndex)) {
      words.push(WORD_LIST[randomIndex]);
      used.add(randomIndex);
    }
  }

  return words;
}

/**
 * Format recovery words for display
 * Shows them numbered and in a grid format
 */
export function formatRecoveryWords(words: string[]): string {
  let formatted = '\n📝 Recovery Words (Write these down safely!)\n';
  formatted += '='.repeat(50) + '\n\n';
  
  for (let i = 0; i < words.length; i += 3) {
    const group = words.slice(i, i + 3);
    formatted += group
      .map((word, idx) => `${(i + idx + 1).toString().padStart(2, '0')}. ${word}`)
      .join('   ')
      .padEnd(50) + '\n';
  }
  
  formatted += '\n' + '='.repeat(50) + '\n';
  formatted += '⚠️  IMPORTANT:\n';
  formatted += '  • Write these words down and store them safely\n';
  formatted += '  • Use them to recover your account if needed\n';
  formatted += '  • Never share these words with anyone\n';
  formatted += '  • You can only see them once - save them now!\n';
  formatted += '\n';
  
  return formatted;
}

/**
 * Verify recovery words (check if provided words match original)
 */
export function verifyRecoveryWords(provided: string[], original: string[]): boolean {
  if (provided.length !== original.length) {
    return false;
  }
  
  return provided.every((word, idx) => word.toLowerCase() === original[idx].toLowerCase());
}

/**
 * Get word list for validation
 */
export function getWordList(): string[] {
  return WORD_LIST;
}
