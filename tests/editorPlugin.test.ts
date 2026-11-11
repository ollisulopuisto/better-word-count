const Module = require("module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean) {
  if (request === "obsidian") return "obsidian";
  return originalResolve.apply(this, arguments);
};
Module._cache["obsidian"] = { id: "obsidian", filename: "obsidian", loaded: true, exports: {} };

import * as assert from "assert";
import { EditorState, Line } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

console.log("=== Running EditorPlugin getHeaderLevel correctness tests ===");

const HEADER_REGEX = /^(#+)[ \t]/;
const CODE_OR_MATH_REGEX = /code-?block|math/;

// Function under test matching the optimized implementation in EditorPlugin.ts
function getHeaderLevelOptimized(line: Line, tree: any): number | null {
  if (line.text.charCodeAt(0) !== 35) return null;

  const match = HEADER_REGEX.exec(line.text);
  if (!match) return null;

  const token = tree.resolve(line.from, 1);
  if (CODE_OR_MATH_REGEX.test(token?.type?.name)) return null;

  return match[1].length;
}

// Previous unoptimized implementation for equivalence verification
function getHeaderLevelOriginal(line: Line, tree: any): number | null {
  const token = tree.resolve(line.from, 1);
  if (/code-?block|math/.test(token?.type?.name)) return null;

  const match = line.text.match(/^(#+)[ \t]/);
  return match ? match[1].length : null;
}

// 1. Correctness across various markdown lines
const testCases: { text: string; expectedLevel: number | null; description: string }[] = [
  { text: "", expectedLevel: null, description: "Empty line" },
  { text: "   ", expectedLevel: null, description: "Whitespace line" },
  { text: "This is a regular paragraph.", expectedLevel: null, description: "Paragraph text" },
  { text: "# Heading 1", expectedLevel: 1, description: "Level 1 heading" },
  { text: "## Heading 2", expectedLevel: 2, description: "Level 2 heading" },
  { text: "### Heading 3", expectedLevel: 3, description: "Level 3 heading" },
  { text: "#### Heading 4", expectedLevel: 4, description: "Level 4 heading" },
  { text: "##### Heading 5", expectedLevel: 5, description: "Level 5 heading" },
  { text: "###### Heading 6", expectedLevel: 6, description: "Level 6 heading" },
  { text: "#\tHeading with tab", expectedLevel: 1, description: "Heading with tab separator" },
  { text: "#tag without space", expectedLevel: null, description: "Hashtag not a heading" },
  { text: "###no-space", expectedLevel: null, description: "Multiple hashes without space" },
  { text: "  # Indented heading", expectedLevel: null, description: "Indented heading excluded by ^ anchor" },
  { text: "Normal text ending with #", expectedLevel: null, description: "Text ending with hash" },
  { text: "1. List item", expectedLevel: null, description: "Ordered list" },
  { text: "- Bullet item", expectedLevel: null, description: "Unordered list" },
  { text: "> Blockquote", expectedLevel: null, description: "Blockquote" },
];

const docText = testCases.map((tc) => tc.text).join("\n");
const state = EditorState.create({ doc: docText });
const tree = syntaxTree(state);

for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const line = state.doc.line(i + 1);

  const originalResult = getHeaderLevelOriginal(line, tree);
  const optimizedResult = getHeaderLevelOptimized(line, tree);

  assert.strictEqual(
    optimizedResult,
    tc.expectedLevel,
    `Optimized mismatch for [${tc.description}] "${tc.text}": expected ${tc.expectedLevel}, got ${optimizedResult}`
  );
  assert.strictEqual(
    optimizedResult,
    originalResult,
    `Mismatch between original and optimized for [${tc.description}] "${tc.text}"`
  );
}

// 2. Mock code-block and math token filtering tests
const mockCodeBlockTree = {
  resolve(_pos: number, _dir: number) {
    return { type: { name: "code-block" } };
  },
};
const mockMathBlockTree = {
  resolve(_pos: number, _dir: number) {
    return { type: { name: "math" } };
  },
};
const mockParagraphTree = {
  resolve(_pos: number, _dir: number) {
    return { type: { name: "Paragraph" } };
  },
};

const headingLine: Line = {
  from: 0,
  to: 11,
  number: 1,
  text: "# Heading 1",
  length: 11,
};

assert.strictEqual(
  getHeaderLevelOptimized(headingLine, mockCodeBlockTree),
  null,
  "Heading inside code-block should return null"
);
assert.strictEqual(
  getHeaderLevelOptimized(headingLine, mockMathBlockTree),
  null,
  "Heading inside math block should return null"
);
assert.strictEqual(
  getHeaderLevelOptimized(headingLine, mockParagraphTree),
  1,
  "Heading inside normal node should return 1"
);

console.log(`✓ All ${testCases.length + 3} correctness assertions passed!\n`);

// === Benchmarks ===
console.log("=== Running EditorPlugin getHeaderLevel performance benchmarks ===");

// Build a realistic 3,000 line document (50 headings, 2950 body lines)
const lines: Line[] = [];
let offset = 0;
for (let i = 0; i < 3000; i++) {
  let text = "";
  if (i % 60 === 0) {
    text = `## Section Heading ${i / 60}`;
  } else if (i % 10 === 0) {
    text = "";
  } else {
    text = `Line ${i}: Markdown paragraph text detailing performance observations and measurements.`;
  }
  lines.push({
    from: offset,
    to: offset + text.length,
    number: i + 1,
    text,
    length: text.length,
  });
  offset += text.length + 1;
}

const benchmarkDocState = EditorState.create({ doc: lines.map((l) => l.text).join("\n") });
const benchmarkTree = syntaxTree(benchmarkDocState);

const iters = 500;

// Benchmark original
const tStartOriginal = Date.now();
let originalHeadingsCount = 0;
for (let iter = 0; iter < iters; iter++) {
  for (let i = 0; i < lines.length; i++) {
    if (getHeaderLevelOriginal(lines[i], benchmarkTree) !== null) {
      originalHeadingsCount++;
    }
  }
}
const originalDuration = Date.now() - tStartOriginal;

// Benchmark optimized
const tStartOptimized = Date.now();
let optimizedHeadingsCount = 0;
for (let iter = 0; iter < iters; iter++) {
  for (let i = 0; i < lines.length; i++) {
    if (getHeaderLevelOptimized(lines[i], benchmarkTree) !== null) {
      optimizedHeadingsCount++;
    }
  }
}
const optimizedDuration = Date.now() - tStartOptimized;

assert.strictEqual(originalHeadingsCount, optimizedHeadingsCount, "Total headings count must match exactly");

console.log(`Original getHeaderLevel  (3,000 lines x ${iters} runs): ${originalDuration}ms`);
console.log(`Optimized getHeaderLevel (3,000 lines x ${iters} runs): ${optimizedDuration}ms`);
const speedup = (originalDuration / optimizedDuration).toFixed(2);
console.log(`Speedup: ${speedup}x faster (${((1 - optimizedDuration / originalDuration) * 100).toFixed(1)}% reduction in CPU time)\n`);

// =====================================================================
// Comment Stripping & calculateLineCounts Correctness and Benchmark Tests
// =====================================================================
import { MATCH_COMMENT, MATCH_HTML_COMMENT } from "../src/constants";
import { getWordCount } from "../src/utils/StatUtils";

console.log("\n=== Running calculateLineCounts comment stripping correctness tests ===");

function stripCommentsOriginal(docStr: string): string {
  const preserveNl = (match: string, offset: number, str: string) => {
    let output = "";
    for (let i = offset, len = offset + match.length; i < len; i++) {
      if (/[\r\n]/.test(str[i])) {
        output += str[i];
      }
    }
    return output;
  };
  return docStr.replace(MATCH_COMMENT, preserveNl).replace(MATCH_HTML_COMMENT, preserveNl);
}

function stripCommentsOptimized(docStr: string): string {
  const hasPercent = docStr.includes("%%");
  const hasLt = docStr.includes("<");
  if (hasPercent || hasLt) {
    const preserveNl = (match: string) => {
      let output = "";
      for (let i = 0, len = match.length; i < len; i++) {
        const code = match.charCodeAt(i);
        if (code === 10 || code === 13) {
          output += match[i];
        }
      }
      return output;
    };

    if (hasPercent) docStr = docStr.replace(MATCH_COMMENT, preserveNl);
    if (hasLt) docStr = docStr.replace(MATCH_HTML_COMMENT, preserveNl);
  }
  return docStr;
}

function computeLineCounts(docStr: string, stripFunc: (s: string) => string): number[] {
  const cleaned = stripFunc(docStr);
  const lines = cleaned.split(/\r\n?|\n/);
  return lines.map((l) => getWordCount(l));
}

const commentTestDocs: { name: string; content: string }[] = [
  { name: "Empty string", content: "" },
  { name: "Single line without comments", content: "Hello world this is a test" },
  {
    name: "Multi-line document without comments",
    content: "# Heading 1\nLine one of text.\n\nLine two of text.\n",
  },
  {
    name: "Inline obsidian comment",
    content: "Visible text %% hidden comment %% more visible text",
  },
  {
    name: "Multiline obsidian comment",
    content: "Before comment\n%% comment line 1\ncomment line 2 %%\nAfter comment",
  },
  {
    name: "HTML comment",
    content: "Start <!-- html comment here --> finish",
  },
  {
    name: "Multiline HTML comment",
    content: "Start <!-- html line 1\nhtml line 2 --> finish",
  },
  {
    name: "Both Obsidian and HTML comments in doc",
    content: "# Intro\n%% obsidian note %%\nBody text.\n<!-- html footnote -->\nConclusion.",
  },
  {
    name: "Document with CRLF line endings",
    content: "Line 1\r\n%% comment\r\nstill comment %%\r\nLine 2\r\n",
  },
];

for (const testDoc of commentTestDocs) {
  const originalStr = stripCommentsOriginal(testDoc.content);
  const optimizedStr = stripCommentsOptimized(testDoc.content);

  assert.strictEqual(
    optimizedStr,
    originalStr,
    `Stripped text mismatch in "${testDoc.name}":\nOriginal:  ${JSON.stringify(originalStr)}\nOptimized: ${JSON.stringify(optimizedStr)}`
  );

  const origCounts = computeLineCounts(testDoc.content, stripCommentsOriginal);
  const optCounts = computeLineCounts(testDoc.content, stripCommentsOptimized);

  assert.deepStrictEqual(
    optCounts,
    origCounts,
    `Line word counts mismatch in "${testDoc.name}"`
  );
}

console.log(`✓ All ${commentTestDocs.length} comment stripping correctness assertions passed!\n`);

// === Benchmarks for Comment Stripping ===
console.log("=== Running calculateLineCounts comment stripping performance benchmarks ===");

// 1. Realistic markdown note without comments (the common case: ~95% of notes)
const noteWithoutComments = lines.map((l) => l.text).join("\n"); // 3,000 lines
const stripItersWithoutComments = 1000;

const tStartStripOrigNoComments = Date.now();
for (let iter = 0; iter < stripItersWithoutComments; iter++) {
  stripCommentsOriginal(noteWithoutComments);
}
const durStripOrigNoComments = Date.now() - tStartStripOrigNoComments;

const tStartStripOptNoComments = Date.now();
for (let iter = 0; iter < stripItersWithoutComments; iter++) {
  stripCommentsOptimized(noteWithoutComments);
}
const durStripOptNoComments = Date.now() - tStartStripOptNoComments;

console.log(
  `Original stripComments  (3,000 lines without comments x ${stripItersWithoutComments} runs): ${durStripOrigNoComments}ms`
);
console.log(
  `Optimized stripComments (3,000 lines without comments x ${stripItersWithoutComments} runs): ${durStripOptNoComments}ms`
);
const speedupNoComments = (durStripOrigNoComments / durStripOptNoComments).toFixed(2);
console.log(`Speedup (notes without comments): ${speedupNoComments}x faster\n`);

// 2. Note with comments
const noteWithComments =
  lines
    .map((l, i) =>
      i % 20 === 0
        ? `${l.text} %% comment for line ${i} %%`
        : i % 35 === 0
        ? `<!-- html comment ${i} --> ${l.text}`
        : l.text
    )
    .join("\n");
const stripItersWithComments = 200;

const tStartStripOrigComments = Date.now();
for (let iter = 0; iter < stripItersWithComments; iter++) {
  stripCommentsOriginal(noteWithComments);
}
const durStripOrigComments = Date.now() - tStartStripOrigComments;

const tStartStripOptComments = Date.now();
for (let iter = 0; iter < stripItersWithComments; iter++) {
  stripCommentsOptimized(noteWithComments);
}
const durStripOptComments = Date.now() - tStartStripOptComments;

console.log(
  `Original stripComments  (3,000 lines with comments x ${stripItersWithComments} runs): ${durStripOrigComments}ms`
);
console.log(
  `Optimized stripComments (3,000 lines with comments x ${stripItersWithComments} runs): ${durStripOptComments}ms`
);
const speedupComments = (durStripOrigComments / durStripOptComments).toFixed(2);
console.log(`Speedup (notes with comments): ${speedupComments}x faster\n`);

// =====================================================================
// mkDeco Section Word Count Accumulation Correctness and Benchmark Tests
// =====================================================================
console.log("\n=== Running mkDeco section count accumulation correctness tests ===");

interface SectionCountData {
  line: number;
  level: number;
  self: number;
  total: number;
  pos: number;
}

function accumulateSectionCountsOriginal(
  linesData: { level: number | null; count: number; line: number; pos: number }[]
): SectionCountData[] {
  const sectionCounts: SectionCountData[] = [];
  const nested: SectionCountData[] = [];

  for (let i = 0; i < linesData.length; i++) {
    const item = linesData[i];
    const level = item.level;
    const prevHeading = nested.length > 0 ? nested[nested.length - 1] : undefined;

    if (level) {
      if (!prevHeading || level > prevHeading.level) {
        nested.push({
          line: item.line,
          level,
          self: 0,
          total: 0,
          pos: item.pos,
        });
      } else if (prevHeading.level === level) {
        const nestedHeading = nested.pop();
        sectionCounts.push(nestedHeading);
        nested.push({
          line: item.line,
          level,
          self: 0,
          total: 0,
          pos: item.pos,
        });
      } else if (prevHeading.level > level) {
        for (let j = nested.length - 1; j >= 0; j--) {
          const nestedHeading = nested[j];
          if (level < nestedHeading.level) {
            const popped = nested.pop();
            sectionCounts.push(popped);
            if (j === 0) {
              nested.push({
                line: item.line,
                level,
                self: 0,
                total: 0,
                pos: item.pos,
              });
            }
            continue;
          }
          if (level === nestedHeading.level) {
            const popped = nested.pop();
            sectionCounts.push(popped);
            nested.push({
              line: item.line,
              level,
              self: 0,
              total: 0,
              pos: item.pos,
            });
            break;
          }
          if (level > nestedHeading.level) {
            nested.push({
              line: item.line,
              level,
              self: 0,
              total: 0,
              pos: item.pos,
            });
            break;
          }
        }
      }
    } else if (nested.length) {
      const count = item.count;
      for (const heading of nested) {
        if (heading === prevHeading) {
          heading.self += count;
        }
        heading.total += count;
      }
    }
  }

  if (nested.length) sectionCounts.push(...nested);
  sectionCounts.sort((a, b) => a.line - b.line);
  return sectionCounts;
}

function accumulateSectionCountsOptimized(
  linesData: { level: number | null; count: number; line: number; pos: number }[]
): SectionCountData[] {
  const sectionCounts: SectionCountData[] = [];
  const nested: SectionCountData[] = [];

  for (let i = 0; i < linesData.length; i++) {
    const item = linesData[i];
    const level = item.level;
    const prevHeading = nested.length > 0 ? nested[nested.length - 1] : undefined;

    if (level) {
      if (!prevHeading || level > prevHeading.level) {
        nested.push({
          line: item.line,
          level,
          self: 0,
          total: 0,
          pos: item.pos,
        });
      } else if (prevHeading.level === level) {
        const nestedHeading = nested.pop();
        sectionCounts.push(nestedHeading);
        nested.push({
          line: item.line,
          level,
          self: 0,
          total: 0,
          pos: item.pos,
        });
      } else if (prevHeading.level > level) {
        for (let j = nested.length - 1; j >= 0; j--) {
          const nestedHeading = nested[j];
          if (level < nestedHeading.level) {
            const popped = nested.pop();
            sectionCounts.push(popped);
            if (j === 0) {
              nested.push({
                line: item.line,
                level,
                self: 0,
                total: 0,
                pos: item.pos,
              });
            }
            continue;
          }
          if (level === nestedHeading.level) {
            const popped = nested.pop();
            sectionCounts.push(popped);
            nested.push({
              line: item.line,
              level,
              self: 0,
              total: 0,
              pos: item.pos,
            });
            break;
          }
          if (level > nestedHeading.level) {
            nested.push({
              line: item.line,
              level,
              self: 0,
              total: 0,
              pos: item.pos,
            });
            break;
          }
        }
      }
    } else if (nested.length) {
      const count = item.count;
      if (count !== 0) {
        for (let k = 0, nLen = nested.length; k < nLen; k++) {
          nested[k].total += count;
        }
        prevHeading.self += count;
      }
    }
  }

  if (nested.length) sectionCounts.push(...nested);
  sectionCounts.sort((a, b) => a.line - b.line);
  return sectionCounts;
}

// Test cases covering complex section hierarchies with blank/zero-count lines
const sampleSectionDoc = [
  { level: 1, count: 0, line: 1, pos: 10 },       // # Title
  { level: null, count: 20, line: 2, pos: 30 },   // text under h1
  { level: null, count: 0, line: 3, pos: 31 },    // empty line under h1
  { level: 2, count: 0, line: 4, pos: 50 },       // ## Subtitle 1
  { level: null, count: 15, line: 5, pos: 70 },   // text under h2
  { level: null, count: 0, line: 6, pos: 71 },    // empty line under h2
  { level: 3, count: 0, line: 7, pos: 90 },       // ### Sub-sub 1
  { level: null, count: 30, line: 8, pos: 125 },  // text under h3
  { level: 2, count: 0, line: 9, pos: 145 },      // ## Subtitle 2
  { level: null, count: 25, line: 10, pos: 175 }, // text under h2
  { level: 1, count: 0, line: 11, pos: 195 },     // # Title 2
  { level: null, count: 0, line: 12, pos: 196 },  // empty line
  { level: null, count: 50, line: 13, pos: 250 }, // text under h1
];

const origSections = accumulateSectionCountsOriginal(sampleSectionDoc);
const optSections = accumulateSectionCountsOptimized(sampleSectionDoc);

assert.deepStrictEqual(optSections, origSections, "Section count accumulation must match original exactly");
assert.strictEqual(optSections.length, 5, "5 sections expected");
// Verify expected values
// Section 1: # Title (line 1): self = 20, total = 20 + 15 + 30 + 25 = 90
assert.strictEqual(optSections[0].self, 20);
assert.strictEqual(optSections[0].total, 90);
// Section 2: ## Subtitle 1 (line 4): self = 15, total = 15 + 30 = 45
assert.strictEqual(optSections[1].self, 15);
assert.strictEqual(optSections[1].total, 45);
// Section 3: ### Sub-sub 1 (line 7): self = 30, total = 30
assert.strictEqual(optSections[2].self, 30);
assert.strictEqual(optSections[2].total, 30);
// Section 4: ## Subtitle 2 (line 9): self = 25, total = 25
assert.strictEqual(optSections[3].self, 25);
assert.strictEqual(optSections[3].total, 25);
// Section 5: # Title 2 (line 11): self = 50, total = 50
assert.strictEqual(optSections[4].self, 50);
assert.strictEqual(optSections[4].total, 50);

console.log("✓ All section count accumulation correctness assertions passed!\n");

// === Benchmarks for Section Count Accumulation ===
console.log("=== Running mkDeco section count accumulation performance benchmarks ===");

// Build realistic 3,000 line document data: 50 headings with 4 nesting levels, 30% empty lines
const benchmarkSectionLines: { level: number | null; count: number; line: number; pos: number }[] = [];
let currentOffset = 0;
for (let i = 1; i <= 3000; i++) {
  let lvl: number | null = null;
  let wordCount = 0;
  if (i % 60 === 1) {
    lvl = 1;
  } else if (i % 60 === 15) {
    lvl = 2;
  } else if (i % 60 === 30) {
    lvl = 3;
  } else if (i % 60 === 45) {
    lvl = 4;
  } else if (i % 3 === 0) {
    wordCount = 0; // empty line
  } else {
    wordCount = 15; // regular line
  }

  benchmarkSectionLines.push({
    level: lvl,
    count: wordCount,
    line: i,
    pos: currentOffset + 50,
  });
  currentOffset += 50;
}

const sectionIters = 2000;

const tStartOrigSection = Date.now();
for (let iter = 0; iter < sectionIters; iter++) {
  accumulateSectionCountsOriginal(benchmarkSectionLines);
}
const durOrigSection = Date.now() - tStartOrigSection;

const tStartOptSection = Date.now();
for (let iter = 0; iter < sectionIters; iter++) {
  accumulateSectionCountsOptimized(benchmarkSectionLines);
}
const durOptSection = Date.now() - tStartOptSection;

console.log(`Original section accumulation  (3,000 lines x ${sectionIters} runs): ${durOrigSection}ms`);
console.log(`Optimized section accumulation (3,000 lines x ${sectionIters} runs): ${durOptSection}ms`);
const sectionSpeedup = (durOrigSection / durOptSection).toFixed(2);
console.log(`Speedup: ${sectionSpeedup}x faster (${((1 - durOptSection / durOrigSection) * 100).toFixed(1)}% reduction in CPU time)\n`);

console.log("✓ All editor plugin tests and benchmarks completed successfully!");
