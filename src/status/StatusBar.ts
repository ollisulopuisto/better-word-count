import { MetricCounter, MetricType } from "src/settings/Settings";
import type BetterWordCount from "../main";
import {
  getWordCount,
  getCharacterCount,
  getSentenceCount,
  getFootnoteCount,
  getCitationCount,
  getPageCount,
  cleanComments,
} from "src/utils/StatUtils";
import { debounce, MarkdownView } from "obsidian";

export default class StatusBar {
  private statusBarEl: HTMLElement;
  private plugin: BetterWordCount;
  public debounceStatusBarUpdate;

  constructor(statusBarEl: HTMLElement, plugin: BetterWordCount) {
    this.statusBarEl = statusBarEl;
    this.plugin = plugin;
    // Increased debounce time to prevent race conditions with UI updates
    this.debounceStatusBarUpdate = debounce(
      (text?: string) => this.updateStatusBar(text),
      250,
      false
    );

    this.statusBarEl.classList.add("mod-clickable");
    this.statusBarEl.setAttribute("aria-label", "!!!");
    this.statusBarEl.setAttribute("aria-label-position", "top");
    this.statusBarEl.addEventListener("click", (ev: MouseEvent) =>
      this.onClick(ev)
    );
  }

  onClick(ev: MouseEvent) {
    ev;
  }

  displayText(text: string) {
    this.statusBarEl.setText(text);
  }

  async updateStatusBar(selectionText?: string) {
    let textToCount = "";
    const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

    if (typeof selectionText === "string" && selectionText.length > 0) {
      // Case 1: Text is selected. Always count the raw selected text.
      textToCount = selectionText;
    } else {
      // Case 2: No selection. Count the whole document based on the view mode.
      if (!activeView) {
        this.displayText("");
        return;
      }

      const isPreview = activeView.getMode() === "preview";

      if (isPreview) {
        // In PREVIEW mode, always count the visible text from the rendered DOM.
        const previewEl = activeView.previewMode.containerEl.querySelector(".markdown-reading-view");
        textToCount = previewEl ? (previewEl as HTMLElement).innerText : "";
      } else {
        // In EDIT mode, always count the raw text from the editor.
        textToCount = activeView.editor.getValue();
      }
    }

    // The setting is "Don't Count Comments". If ON (`true`), clean comments.
    // This is applied after determining the source text (raw or rendered).
    if (this.plugin.settings.countComments) {
      textToCount = cleanComments(textToCount);
    }

    // --- Display Logic ---
    const sb = this.plugin.settings.statusBar;
    let display = "";
    const isSelection = typeof selectionText === "string" && selectionText.length > 0;

    for (let i = 0; i < sb.length; i++) {
      const sbItem = sb[i];
      
      if (isSelection && sbItem.metric.type !== MetricType.file) {
        continue;
      }

      display += sbItem.prefix;
      const metric = sbItem.metric;

      if (metric.counter === MetricCounter.words) {
        if (metric.type === MetricType.file) display += getWordCount(textToCount);
        else if (metric.type === MetricType.daily) display += this.plugin.settings.collectStats ? this.plugin.statsManager.getDailyWords() : 0;
        else if (metric.type === MetricType.total) display += await (this.plugin.settings.collectStats ? this.plugin.statsManager.getTotalWords() : 0);
      } else if (metric.counter === MetricCounter.characters) {
        if (metric.type === MetricType.file) display += getCharacterCount(textToCount);
        else if (metric.type === MetricType.daily) display += this.plugin.settings.collectStats ? this.plugin.statsManager.getDailyCharacters() : 0;
        else if (metric.type === MetricType.total) display += await (this.plugin.settings.collectStats ? this.plugin.statsManager.getTotalCharacters() : 0);
      } else if (metric.counter === MetricCounter.sentences) {
        if (metric.type === MetricType.file) display += getSentenceCount(textToCount);
        else if (metric.type === MetricType.daily) display += this.plugin.settings.collectStats ? this.plugin.statsManager.getDailySentences() : 0;
        else if (metric.type === MetricType.total) display += await (this.plugin.settings.collectStats ? this.plugin.statsManager.getTotalSentences() : 0);
      } else if (metric.counter === MetricCounter.footnotes) {
        if (metric.type === MetricType.file) display += getFootnoteCount(textToCount);
        else if (metric.type === MetricType.daily) display += this.plugin.settings.collectStats ? this.plugin.statsManager.getDailyFootnotes() : 0;
        else if (metric.type === MetricType.total) display += await (this.plugin.settings.collectStats ? this.plugin.statsManager.getTotalFootnotes() : 0);
      } else if (metric.counter === MetricCounter.citations) {
        if (metric.type === MetricType.file) display += getCitationCount(textToCount);
        else if (metric.type === MetricType.daily) display += this.plugin.settings.collectStats ? this.plugin.statsManager.getDailyCitations() : 0;
        else if (metric.type === MetricType.total) display += await (this.plugin.settings.collectStats ? this.plugin.statsManager.getTotalCitations() : 0);
      } else if (metric.counter === MetricCounter.pages) {
        if (metric.type === MetricType.file) display += getPageCount(textToCount, this.plugin.settings.pageWords);
        else if (metric.type === MetricType.daily) display += this.plugin.settings.collectStats ? this.plugin.statsManager.getDailyPages() : 0;
        else if (metric.type === MetricType.total) display += await (this.plugin.settings.collectStats ? this.plugin.statsManager.getTotalPages() : 0);
      } else if (metric.counter === MetricCounter.files) {
        if (metric.type === MetricType.total || metric.type === MetricType.daily) display += this.plugin.settings.collectStats ? this.plugin.statsManager.getTotalFiles() : 0;
      }

      display += sbItem.suffix;
    }

    this.displayText(display);
  }

  async updateAltBar() {
    const ab = this.plugin.settings.altBar;
    let display = "";

    for (let i = 0; i < ab.length; i++) {
      const sbItem = ab[i];

      display = display + sbItem.prefix;
      const metric = sbItem.metric;

      if (metric.counter === MetricCounter.words) {
        switch (metric.type) {
          case MetricType.file:
            display = display + 0;
            break;
          case MetricType.daily:
            display =
              display +
              (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getDailyWords()
                : 0);
            break;
          case MetricType.total:
            display =
              display +
              (await (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getTotalWords()
                : 0));
            break;
        }
      } else if (metric.counter === MetricCounter.characters) {
        switch (metric.type) {
          case MetricType.file:
            display = display + 0;
            break;
          case MetricType.daily:
            display =
              display +
              (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getDailyCharacters()
                : 0);
            break;
          case MetricType.total:
            display =
              display +
              (await (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getTotalCharacters()
                : 0));
            break;
        }
      } else if (metric.counter === MetricCounter.sentences) {
        switch (metric.type) {
          case MetricType.file:
            display = display + 0;
            break;
          case MetricType.daily:
            display =
              display +
              (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getDailySentences()
                : 0);
            break;
          case MetricType.total:
            display =
              display +
              (await (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getTotalSentences()
                : 0));
            break;
        }
      } else if (metric.counter === MetricCounter.footnotes) {
      switch (metric.type) {
          case MetricType.file:
            display = display + 0;
            break;
          case MetricType.daily:
            display =
              display +
              (this.plugin.settings.collectStats
              ? this.plugin.statsManager.getDailyFootnotes()
                   : 0);
            break;
          case MetricType.total:
            display =
              display +
              (await (this.plugin.settings.collectStats
              ? this.plugin.statsManager.getTotalFootnotes()
                : 0));
            break;
        }
      } else if (metric.counter === MetricCounter.citations) {
        switch (metric.type) {
          case MetricType.file:
            display = display + 0;
            break;
          case MetricType.daily:
            display =
              display +
              (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getDailyCitations()
                : 0);
            break;
          case MetricType.total:
            display =
              display +
              (await (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getTotalCitations()
                : 0));
            break;
        }
      } else if (metric.counter === MetricCounter.pages) {
        switch (metric.type) {
          case MetricType.file:
            display = display + 0;
            break;
          case MetricType.daily:
            display =
              display +
              (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getDailyPages()
                : 0);
            break;
          case MetricType.total:
            display =
              display +
              (await (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getTotalPages()
                : 0));
            break;
        }
      } else if (metric.counter === MetricCounter.files) {
        switch (metric.type) {
          case MetricType.file:
            display =
              display +
              (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getTotalFiles()
                : 0);
            break;
          case MetricType.daily:
            display =
              display +
              (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getTotalFiles()
                : 0);
            break;
          case MetricType.total:
            display =
              display +
              (this.plugin.settings.collectStats
                ? this.plugin.statsManager.getTotalFiles()
                : 0);
            break;
        }
      }

      display = display + sbItem.suffix;
    }

    this.displayText(display);
  }
}
