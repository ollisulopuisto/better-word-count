const Module = require("module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean) {
  if (request === "obsidian") return "obsidian";
  return originalResolve.apply(this, arguments);
};
Module._cache["obsidian"] = { id: "obsidian", filename: "obsidian", loaded: true, exports: {} };

import * as assert from "assert";
import {
  getWordCount,
  getCharacterCount,
  getFootnoteCount,
  getCitationCount,
  getSentenceCount,
  getPageCount,
  cleanComments,
} from "../src/utils/StatUtils";

console.log("=== Running StatUtils correctness tests ===");

// 1. getWordCount tests
assert.strictEqual(getWordCount(""), 0, "Empty string should have 0 words");
assert.strictEqual(getWordCount("   \t\n  "), 0, "Whitespace only should have 0 words");
assert.strictEqual(getWordCount("hello world"), 2, "Simple two words");
assert.strictEqual(getWordCount("don't you're it's"), 3, "Contractions with apostrophes");
assert.strictEqual(getWordCount("word-with-hyphen another-one"), 2, "Hyphenated words");
assert.strictEqual(getWordCount("123 45.67 1,000,000"), 3, "Numbers with decimals and commas");
assert.strictEqual(getWordCount("日本語のテスト"), 7, "CJK characters counting");
assert.strictEqual(getWordCount("# Header\n\nSome paragraph with **bold** and *italic* text."), 8, "Markdown formatting");

// 2. getCharacterCount tests
assert.strictEqual(getCharacterCount(""), 0, "Empty string 0 characters");
assert.strictEqual(getCharacterCount("hello"), 5, "5 characters");
assert.strictEqual(getCharacterCount("hello world\n"), 12, "Characters with newline");

// 3. getFootnoteCount tests
assert.strictEqual(getFootnoteCount(""), 0, "Empty string 0 footnotes");
assert.strictEqual(getFootnoteCount("No footnotes here"), 0, "0 footnotes in normal text");
assert.strictEqual(getFootnoteCount("Contains a caret symbol ^ without footnote syntax"), 0, "Non-footnote caret");
assert.strictEqual(getFootnoteCount("Here is a regular footnote[^1] and another[^note]."), 2, "Regular footnotes");
assert.strictEqual(getFootnoteCount("Here is an inline footnote^[with text]."), 1, "Inline footnotes");
assert.strictEqual(getFootnoteCount("[^1]: Definition should not match regular footnote call"), 0, "Footnote definition excluded");
assert.strictEqual(getFootnoteCount("Regular[^1] and inline^[note]."), 2, "Combined footnotes");

// 4. getCitationCount tests
assert.strictEqual(getCitationCount(""), 0, "Empty string 0 citations");
assert.strictEqual(getCitationCount("No citations"), 0, "0 citations in normal text");
assert.strictEqual(getCitationCount("Email user@example.com should not count as citation"), 0, "Email with @ symbol");
assert.strictEqual(getCitationCount("@author(2020) with parentheses should not match negative lookahead"), 0, "Citation with parenthesis");
assert.strictEqual(getCitationCount("According to @smith2020; and @jones2021;"), 2, "2 distinct citations");
assert.strictEqual(getCitationCount("@smith2020; repeated @smith2020;"), 1, "Duplicate citations counted once");

// 5. getSentenceCount tests
assert.strictEqual(getSentenceCount(""), 0, "Empty string 0 sentences");
assert.strictEqual(getSentenceCount("Hello world! How are you? I am fine."), 3, "3 sentences");
assert.strictEqual(getSentenceCount('He said, "Stop!" Then he left.'), 2, "Quoted exclamation");

// 6. getPageCount tests
assert.strictEqual(getPageCount("word ".repeat(300), 300), 1.0, "Exact 1 page");
assert.strictEqual(getPageCount("word ".repeat(450), 300), 1.5, "1.5 pages");

// Verify that computing page count directly from currentWords matches getPageCount exactly across range of word counts
const pageWords = 300;
const testTexts = [
  "",
  "single",
  "word ".repeat(50),
  "word ".repeat(299),
  "word ".repeat(300),
  "word ".repeat(301),
  "word ".repeat(450),
  "word ".repeat(1234),
  "word ".repeat(5000),
];
for (const text of testTexts) {
  const currentWords = getWordCount(text);
  const directPages = parseFloat((currentWords / pageWords).toFixed(1));
  const helperPages = getPageCount(text, pageWords);
  assert.strictEqual(
    directPages,
    helperPages,
    `Direct page count calculation (${directPages}) must match getPageCount (${helperPages}) for ${currentWords} words`
  );
}

// 7. cleanComments tests
assert.strictEqual(cleanComments(""), "", "Empty string clean comments");
assert.strictEqual(cleanComments("No comments here."), "No comments here.", "Text without comments unchanged");
assert.strictEqual(cleanComments("Hello %%secret comment%% world"), "Hello  world", "Obsidian comment stripped");
assert.strictEqual(cleanComments("Hello <!-- html comment --> world"), "Hello  world", "HTML comment stripped");
assert.strictEqual(cleanComments("Start %%c1%% middle <!--c2--> end"), "Start  middle  end", "Both comments stripped");

console.log("✓ All 28 correctness assertions passed!\n");

// === Benchmarks ===
console.log("=== Running StatUtils performance benchmarks ===");

// Benchmark 1: Per-line getWordCount (SectionWordCountEditorPlugin simulation)
const testLines: string[] = [];
for (let i = 0; i < 2000; i++) {
  testLines.push(`Line ${i}: The quick brown fox jumps over the lazy dog with value 1,234.56.`);
}
for (let i = 0; i < 500; i++) {
  testLines.push("");
}

const lineIters = 50;
const tStartLines = Date.now();
let totalLineWords = 0;
for (let iter = 0; iter < lineIters; iter++) {
  for (let i = 0; i < testLines.length; i++) {
    totalLineWords += getWordCount(testLines[i]);
  }
}
const lineDuration = Date.now() - tStartLines;
console.log(`Per-line getWordCount (2,500 lines x ${lineIters} runs): ${lineDuration}ms (${(totalLineWords / lineIters)} words/doc)`);

// Benchmark 2: Full-document getWordCount (StatsManager / StatusBar simulation)
const sampleDoc = testLines.join("\n"); // ~28,000 words
const docIters = 100;
const tStartDoc = Date.now();
let docWords = 0;
for (let iter = 0; iter < docIters; iter++) {
  docWords = getWordCount(sampleDoc);
}
const docDuration = Date.now() - tStartDoc;
console.log(`Full-document getWordCount (${docWords} words x ${docIters} runs): ${docDuration}ms`);

// Benchmark 3: cleanComments fast-path
const commentsIters = 5000;
const tStartComments = Date.now();
for (let iter = 0; iter < commentsIters; iter++) {
  cleanComments(sampleDoc);
}
const commentsDuration = Date.now() - tStartComments;
console.log(`cleanComments fast-path (${commentsIters} runs on ~28k word doc): ${commentsDuration}ms`);

// Benchmark 4: getFootnoteCount and getCitationCount fast-paths on document without footnotes/citations
const fnIters = 5000;
const tStartFn = Date.now();
let totalFn = 0;
for (let iter = 0; iter < fnIters; iter++) {
  totalFn += getFootnoteCount(sampleDoc);
}
const fnDuration = Date.now() - tStartFn;
console.log(`getFootnoteCount fast-path (${fnIters} runs on ~28k word doc): ${fnDuration}ms`);

const citeIters = 5000;
const tStartCite = Date.now();
let totalCite = 0;
for (let iter = 0; iter < citeIters; iter++) {
  totalCite += getCitationCount(sampleDoc);
}
const citeDuration = Date.now() - tStartCite;
console.log(`getCitationCount fast-path (${citeIters} runs on ~28k word doc): ${citeDuration}ms`);

// Benchmark 5: StatsManager.change() word & page calculation - with vs without duplicate getWordCount
const changeIters = 100;
const tStartUnoptimizedChange = Date.now();
for (let iter = 0; iter < changeIters; iter++) {
  const words = getWordCount(sampleDoc);
  const pages = getPageCount(sampleDoc, 300);
}
const unoptimizedChangeDuration = Date.now() - tStartUnoptimizedChange;

const tStartOptimizedChange = Date.now();
for (let iter = 0; iter < changeIters; iter++) {
  const words = getWordCount(sampleDoc);
  const pages = parseFloat((words / 300).toFixed(1));
}
const optimizedChangeDuration = Date.now() - tStartOptimizedChange;

console.log(
  `StatsManager.change word+page calculation unoptimized (${changeIters} runs on ~28k word doc): ${unoptimizedChangeDuration}ms`
);
console.log(
  `StatsManager.change word+page calculation optimized   (${changeIters} runs on ~28k word doc): ${optimizedChangeDuration}ms`
);
const changeSpeedup = (unoptimizedChangeDuration / optimizedChangeDuration).toFixed(2);
console.log(`Speedup: ${changeSpeedup}x faster (${((1 - optimizedChangeDuration / unoptimizedChangeDuration) * 100).toFixed(1)}% reduction in CPU time)`);

// Benchmark 6: StatusBar item loop word & page calculation - with vs without lazy cached word count
const sbIters = 100;
const tStartSbUnoptimized = Date.now();
for (let iter = 0; iter < sbIters; iter++) {
  const words = getWordCount(sampleDoc);
  const pages = getPageCount(sampleDoc, 300);
}
const sbUnoptimizedDuration = Date.now() - tStartSbUnoptimized;

const tStartSbOptimized = Date.now();
for (let iter = 0; iter < sbIters; iter++) {
  let fileWordCount: number | null = null;
  const getFileWordCount = () => {
    if (fileWordCount === null) fileWordCount = getWordCount(sampleDoc);
    return fileWordCount;
  };
  const words = getFileWordCount();
  const pages = parseFloat((getFileWordCount() / 300).toFixed(1));
}
const sbOptimizedDuration = Date.now() - tStartSbOptimized;

console.log(
  `StatusBar item loop word+page unoptimized (${sbIters} runs on ~28k word doc): ${sbUnoptimizedDuration}ms`
);
console.log(
  `StatusBar item loop word+page optimized   (${sbIters} runs on ~28k word doc): ${sbOptimizedDuration}ms`
);
const sbSpeedup = (sbUnoptimizedDuration / sbOptimizedDuration).toFixed(2);
console.log(`Speedup: ${sbSpeedup}x faster (${((1 - sbOptimizedDuration / sbUnoptimizedDuration) * 100).toFixed(1)}% reduction in CPU time)`);

console.log("\n✓ All benchmark runs completed successfully!");
