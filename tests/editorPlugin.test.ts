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

console.log("✓ All editor plugin tests and benchmarks completed successfully!");
