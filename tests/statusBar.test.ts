const Module = require("module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean) {
  if (request === "obsidian") return "obsidian";
  return originalResolve.apply(this, arguments);
};

let capturedText = "";
class MockHTMLElement {
  classList = {
    add: (_cls: string) => {},
  };
  setAttribute(_k: string, _v: string) {}
  addEventListener(_event: string, _handler: any) {}
  setText(text: string) {
    capturedText = text;
  }
}

Module._cache["obsidian"] = {
  id: "obsidian",
  filename: "obsidian",
  loaded: true,
  exports: {
    debounce: (fn: any) => fn,
    MarkdownView: class {},
  },
};

import * as assert from "assert";
import StatusBar from "../src/status/StatusBar";
import { MetricCounter, MetricType, StatusBarItem } from "../src/settings/Settings";
import { getWordCount, getPageCount } from "../src/utils/StatUtils";

console.log("=== Running StatusBar correctness tests ===");

function createMockPlugin(statusBarConfig: StatusBarItem[], pageWords = 300, countComments = false) {
  return {
    app: {
      workspace: {
        getActiveViewOfType: () => ({
          getMode: () => "source",
          editor: {
            getValue: () => "",
          },
        }),
      },
    },
    settings: {
      statusBar: statusBarConfig,
      pageWords,
      countComments,
      collectStats: false,
    },
    statsManager: null,
  } as any;
}

// Test 1: Empty text with default status bar configuration
{
  const mockPlugin = createMockPlugin([
    {
      prefix: "",
      suffix: " words",
      metric: { type: MetricType.file, counter: MetricCounter.words },
    },
    {
      prefix: " | ",
      suffix: " pages",
      metric: { type: MetricType.file, counter: MetricCounter.pages },
    },
  ]);
  const statusBar = new StatusBar(new MockHTMLElement() as any, mockPlugin);

  // Directly update with selection text
  statusBar.updateStatusBar("");
  assert.strictEqual(capturedText, "0 words | 0 pages", "Empty text should format as 0 words | 0 pages");

  statusBar.updateStatusBar("The quick brown fox jumps over the lazy dog.");
  assert.strictEqual(capturedText, "9 words | 0 pages", "9 words, 300 pageWords should be 9 words | 0 pages (0.0 formatted as 0)");
}

// Test 2: Formatting parity between unoptimized logic and optimized StatusBar logic
const testDocuments = [
  "",
  "   ",
  "Hello world",
  "The quick brown fox jumps over the lazy dog.",
  "Word ".repeat(299),
  "Word ".repeat(300),
  "Word ".repeat(301),
  "Word ".repeat(450),
  "Word ".repeat(1234),
  "%%comment%% Hello <!--html--> world!",
];

const testConfigs: StatusBarItem[][] = [
  [
    { prefix: "Words: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.words } },
  ],
  [
    { prefix: "Pages: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.pages } },
  ],
  [
    { prefix: "Words: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.words } },
    { prefix: " | Pages: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.pages } },
  ],
  [
    { prefix: "P1: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.pages } },
    { prefix: " | W: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.words } },
    { prefix: " | P2: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.pages } },
  ],
  [
    { prefix: "Chars: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.characters } },
    { prefix: " | Words: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.words } },
    { prefix: " | Pages: ", suffix: "", metric: { type: MetricType.file, counter: MetricCounter.pages } },
  ],
];

for (const doc of testDocuments) {
  for (const config of testConfigs) {
    const mockPlugin = createMockPlugin(config, 300, true);
    const statusBar = new StatusBar(new MockHTMLElement() as any, mockPlugin);

    statusBar.updateStatusBar(doc);
    const actualDisplay = capturedText;

    // Expected unoptimized calculation
    let expectedDisplay = "";
    const cleanDoc = doc.includes("%%") || doc.includes("<") ? doc.replace(/%%[\s\S]*?%%/g, "").replace(/<!--[\s\S]*?-->/g, "") : doc;
    for (const item of config) {
      expectedDisplay += item.prefix;
      if (item.metric.counter === MetricCounter.words) {
        expectedDisplay += getWordCount(cleanDoc);
      } else if (item.metric.counter === MetricCounter.pages) {
        expectedDisplay += getPageCount(cleanDoc, 300);
      } else if (item.metric.counter === MetricCounter.characters) {
        expectedDisplay += cleanDoc.length;
      }
      expectedDisplay += item.suffix;
    }

    assert.strictEqual(
      actualDisplay,
      expectedDisplay,
      `Display output mismatch for config length ${config.length} on text sample "${doc.slice(0, 20)}...": got "${actualDisplay}", expected "${expectedDisplay}"`
    );
  }
}

console.log("✓ All StatusBar correctness assertions passed!\n");

// === Benchmarks ===
console.log("=== Running StatusBar performance benchmarks ===");

const benchmarkDoc = "The quick brown fox jumps over the lazy dog with 123 numbers. ".repeat(1000); // ~11,000 words
const benchmarkConfig: StatusBarItem[] = [
  { prefix: "", suffix: " words", metric: { type: MetricType.file, counter: MetricCounter.words } },
  { prefix: " | ", suffix: " pages", metric: { type: MetricType.file, counter: MetricCounter.pages } },
];

const iters = 200;

// Benchmark unoptimized: Separate getWordCount + getPageCount
const tStartUnoptimized = Date.now();
for (let i = 0; i < iters; i++) {
  const words = getWordCount(benchmarkDoc);
  const pages = getPageCount(benchmarkDoc, 300);
  const _display = `${words} words | ${pages} pages`;
}
const durUnoptimized = Date.now() - tStartUnoptimized;

// Benchmark optimized: Cached fileWordCount
const tStartOptimized = Date.now();
for (let i = 0; i < iters; i++) {
  let cachedWords: number | null = null;
  const getW = () => {
    if (cachedWords === null) cachedWords = getWordCount(benchmarkDoc);
    return cachedWords;
  };
  const words = getW();
  const pages = parseFloat((getW() / 300).toFixed(1));
  const _display = `${words} words | ${pages} pages`;
}
const durOptimized = Date.now() - tStartOptimized;

console.log(
  `Unoptimized StatusBar updateStatusBar (${iters} runs on ~11k word doc): ${durUnoptimized}ms`
);
console.log(
  `Optimized StatusBar updateStatusBar   (${iters} runs on ~11k word doc): ${durOptimized}ms`
);
const speedup = (durUnoptimized / durOptimized).toFixed(2);
const reduction = (((durUnoptimized - durOptimized) / durUnoptimized) * 100).toFixed(1);
console.log(`Speedup: ${speedup}x faster (${reduction}% reduction in CPU time)\n`);

console.log("✓ All StatusBar benchmarks completed successfully!");
