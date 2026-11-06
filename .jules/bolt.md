## 2026-11-01 - Single-pass Vault Metric Aggregation

**Learning:** Obsidian fires `active-leaf-change` frequently during note navigation, triggering `recalcTotals()`. Running separate metric calculation loops with `vault.getFiles()` forces multiple asynchronous passes over all files, causing redundant `cachedRead()` operations (6N reads instead of N) and duplicate word count regex runs.
**Action:** When computing vault-level statistics in Obsidian plugins, always use `vault.getMarkdownFiles()` to avoid non-markdown assets and compute all metrics in a single asynchronous pass over file contents.

## 2026-11-04 - Fast-Pathing Lezer Syntax Tree Resolution in Editor ViewPlugins

**Learning:** CodeMirror 6 `ViewPlugin` updates run frequently on every viewport scroll and document edit. Invoking `syntaxTree(view.state).resolve(line.from)` inside full-document decoration passes (like `mkDeco()` in `SectionWordCountEditorPlugin`) forces thousands of Lezer tree node traversals on normal body text lines that can never match the target grammar construct.
**Action:** Always filter candidate lines with cheap character code fast-paths (e.g. `line.text.charCodeAt(0) !== 35` for ATX headings) and regex format checks before resolving Lezer syntax tree tokens, avoiding syntax tree traversal on 99%+ of lines.

## 2026-11-05 - Fast-Pathing Document Comment Stripping in Editor Plugins

**Learning:** When `countComments` is enabled, `calculateLineCounts` in `SectionWordCountEditorPlugin` ran two multiline regular expressions (`MATCH_COMMENT` and `MATCH_HTML_COMMENT`) over entire documents on editor view initialization and settings changes, executing a callback with per-character regex testing (`/[\r\n]/`). Over 95% of markdown notes contain no `%%` or `<` comment markers.
**Action:** Fast-path comment stripping with quick substring checks (`includes('%%')` and `includes('<')`) before regex execution, and inspect charCodes (`code === 10 || code === 13`) in the newline-preservation callback to avoid per-character regex overhead.
