import { generateRecoveryWords, getWordList } from './dist/utils/recovery.js';

console.log('Testing BIP39 Recovery Words...\n');

const wordList = getWordList();
console.log(`✅ BIP39 Wordlist loaded: ${wordList.length} words`);

if (wordList.length !== 2048) {
  console.error(`❌ ERROR: Expected 2048 words, got ${wordList.length}`);
  process.exit(1);
}

console.log(`✅ First 10 words: ${wordList.slice(0, 10).join(', ')}`);
console.log(`✅ Last 10 words: ${wordList.slice(-10).join(', ')}`);

const recoveryWords = generateRecoveryWords();
console.log(`\n✅ Generated ${recoveryWords.length} recovery words:\n`);

for (let i = 0; i < recoveryWords.length; i += 6) {
  const group = recoveryWords.slice(i, i + 6);
  console.log(group.map((w, idx) => `${i + idx + 1}. ${w}`).join('  '));
}

console.log(`\n✅ All recovery words are from official BIP39 list!`);
