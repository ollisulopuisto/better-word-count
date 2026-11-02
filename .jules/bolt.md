## 2026-11-01 - Single-pass Vault Metric Aggregation

**Learning:** Obsidian fires `active-leaf-change` frequently during note navigation, triggering `recalcTotals()`. Running separate metric calculation loops with `vault.getFiles()` forces multiple asynchronous passes over all files, causing redundant `cachedRead()` operations (6N reads instead of N) and duplicate word count regex runs.
**Action:** When computing vault-level statistics in Obsidian plugins, always use `vault.getMarkdownFiles()` to avoid non-markdown assets and compute all metrics in a single asynchronous pass over file contents.
