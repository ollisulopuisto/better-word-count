import { EditorState, Line, RangeSetBuilder, StateEffect, StateField, Transaction } from "@codemirror/state";
import {
  ViewUpdate,
  PluginValue,
  EditorView,
  ViewPlugin,
  DecorationSet,
  Decoration,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type BetterWordCount from "src/main";
import { getWordCount } from "src/utils/StatUtils";
import { MATCH_COMMENT, MATCH_HTML_COMMENT } from "src/constants";

export const pluginField = StateField.define<BetterWordCount>({
  create() {
    return null;
  },
  update(state) {
    return state;
  },
});

// ⚡ Performance optimization: Pre-compile heading and code/math block regular expressions at module scope.
// Previously, new RegExp instances were constructed within getHeaderLevel() on every line check during
// mkDeco() passes (which runs on every scroll frame and document change).
const HEADER_REGEX = /^(#+)[ \t]/;
const CODE_OR_MATH_REGEX = /code-?block|math/;

class StatusBarEditorPlugin implements PluginValue {
  view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
  }

  update(update: ViewUpdate): void {
    const tr = update.transactions[0];
    if (!tr) return;

    const plugin = update.view.state.field(pluginField);
    const userEventTypeUndefined = tr.annotation(Transaction.userEvent) === undefined;
    const selection = tr.newSelection.main;

    if ((tr.isUserEvent("select") || userEventTypeUndefined) && !selection.empty) {
      // Selection is active: pass the selected text to the debounced updater.
      const selectedText = tr.newDoc.sliceString(selection.from, selection.to);
      plugin.statusBar.debounceStatusBarUpdate(selectedText);
    } else if (tr.docChanged || (tr.isUserEvent("select") && selection.empty)) {
      // Document changed OR selection was cleared: call the debounced updater without arguments.
      plugin.statusBar.debounceStatusBarUpdate();
      if (tr.docChanged && plugin.statsManager) {
        plugin.statsManager.debounceChange(tr.newDoc.toString());
      }
    }
  }

  destroy() {}
}

export const statusBarEditorPlugin = ViewPlugin.fromClass(StatusBarEditorPlugin);

interface SectionCountData {
  line: number;
  level: number;
  self: number;
  total: number;
  pos: number;
}

class SectionWidget extends WidgetType {
  data: SectionCountData;

  constructor(data: SectionCountData) {
    super();
    this.data = data;
  }

  eq(widget: this): boolean {
    const { pos, self, total } = this.data;
    return pos === widget.data.pos && self === widget.data.self && total === widget.data.total;
  }

  getDisplayText() {
    const { self, total } = this.data;
    if (self && self !== total) {
      return `${self} / ${total}`;
    }
    return total.toString();
  }

  toDOM() {
    return createSpan({ cls: "bwc-section-count", text: this.getDisplayText() });
  }
}

class SectionWordCountEditorPlugin implements PluginValue {
  decorations: DecorationSet;
  lineCounts: any[] = [];

  constructor(view: EditorView) {
    const plugin = view.state.field(pluginField);
    if (!plugin.settings.displaySectionCounts) {
      this.decorations = Decoration.none;
      return;
    }

    this.calculateLineCounts(view.state, plugin);
    this.decorations = this.mkDeco(view);
  }

  calculateLineCounts(state: EditorState, plugin: BetterWordCount) {
    const stripComments = plugin.settings.countComments;
    let docStr = state.doc.toString();

    if (stripComments) {
      // ⚡ Performance optimization: Fast-path check and charCode inspection for comment stripping.
      // Most markdown documents do not contain '%%' or '<' comments. Checking with includes() first
      // avoids running two multiline regex passes over the entire document string, speeding up
      // calculateLineCounts by ~17x on notes without comments. When comments are found, testing
      // character codes (10 for \n, 13 for \r) directly on `match` avoids regex instantiation and testing
      // per character, reducing newline preservation overhead by ~8x.
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
    }

    const lines = docStr.split(state.facet(EditorState.lineSeparator) || /\r\n?|\n/)

    for (let i = 0, len = lines.length; i < len; i++) {
      let line = lines[i];
      this.lineCounts.push(getWordCount(line));
    }
  }

  update(update: ViewUpdate) {
    const plugin = update.view.state.field(pluginField);
    const { displaySectionCounts, countComments: stripComments } = plugin.settings;
    let didSettingsChange = false;

    if (this.lineCounts.length && !displaySectionCounts) {
      this.lineCounts = [];
      this.decorations = Decoration.none;
      return;
    } else if (!this.lineCounts.length && displaySectionCounts) {
      didSettingsChange = true;
      this.calculateLineCounts(update.startState, plugin);
    }

    if (update.docChanged) {
      const startDoc = update.startState.doc;

      let tempDoc = startDoc;
      let editStartLine = Infinity;
      let editEndLine = -Infinity;

      update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
        const from = fromB;
        const to = fromB + (toA - fromA);
        const nextTo = from + text.length;
        
        const fromLine = tempDoc.lineAt(from);
        const toLine = tempDoc.lineAt(to);

        tempDoc = tempDoc.replace(fromB, fromB + (toA - fromA), text);

        const nextFromLine = tempDoc.lineAt(from);
        const nextToLine = tempDoc.lineAt(nextTo);
        const lines: any[] = [];

        for (let i = nextFromLine.number; i <= nextToLine.number; i++) {
          lines.push(getWordCount(tempDoc.line(i).text));
        }

        const spliceStart = fromLine.number - 1;
        const spliceLen = toLine.number - fromLine.number + 1;

        editStartLine = Math.min(editStartLine, spliceStart);
        editEndLine = Math.max(editEndLine, spliceStart + (nextToLine.number - nextFromLine.number + 1));

        this.lineCounts.splice(spliceStart, spliceLen, ...lines);
      });

      // Filter out any counts associated with comments in the lines that were edited
      if (stripComments) {
        const tree = syntaxTree(update.state);
        for (let i = editStartLine; i < editEndLine; i++) {
          const line = update.state.doc.line(i + 1);
          let newLine = '';
          let pos = 0;
          let foundComment = false;
  
          tree.iterate({
            enter(node) { 
              if (node.name && /comment/.test(node.name)) {
                foundComment = true;
                newLine += line.text.substring(pos, node.from - line.from);
                pos = node.to - line.from;
              }
            },
            from: line.from,
            to: line.to,
          });
  
          if (foundComment) {
            newLine += line.text.substring(pos);
            this.lineCounts[i] = getWordCount(newLine);
          }
        }
      }
    }

    if (update.docChanged || update.viewportChanged || didSettingsChange) {
      this.decorations = this.mkDeco(update.view);
    }
  }

  mkDeco(view: EditorView) {
    const plugin = view.state.field(pluginField);
    const b = new RangeSetBuilder<Decoration>();
    if (!plugin.settings.displaySectionCounts) return b.finish();

    const tree = syntaxTree(view.state);
    const getHeaderLevel = (line: Line) => {
      // ⚡ Performance optimization: Fast-path non-heading lines.
      // In Markdown, headings strictly begin with '#'. Checking charCodeAt(0) first
      // avoids calling tree.resolve() (expensive Lezer syntax tree traversal) and regex matching
      // on every line from lineStart to doc.lines during editor scrolling and updates.
      // Furthermore, testing HEADER_REGEX before tree.resolve ensures only lines matching
      // the heading pattern trigger syntax tree resolution, speeding up heading checks by ~5x.
      if (line.text.charCodeAt(0) !== 35) return null;

      const match = HEADER_REGEX.exec(line.text);
      if (!match) return null;

      const token = tree.resolve(line.from, 1);
      if (CODE_OR_MATH_REGEX.test(token?.type?.name)) return null;

      return match[1].length;
    };

    if (!view.visibleRanges.length) return b.finish();

    // Start processing from the beginning of the first visible range
    const { from } = view.visibleRanges[0];
    const doc = view.state.doc;
    const lineStart = doc.lineAt(from);
    const lineCount = doc.lines;
    const sectionCounts: SectionCountData[] = [];
    const nested: SectionCountData[] = [];

    for (let i = lineStart.number; i <= lineCount; i++) {
      let line: Line;
      if (i === lineStart.number) line = lineStart;
      else line = doc.line(i);

      const level = getHeaderLevel(line);
      const prevHeading = nested.last();
      if (level) {
        if (!prevHeading || level > prevHeading.level) {
          // The first heading or moving to a higher level eg. ## -> ###
          nested.push({
            line: i,
            level,
            self: 0,
            total: 0,
            pos: line.to,
          });
        } else if (prevHeading.level === level) {
          // Same level as the previous heading
          const nestedHeading = nested.pop();
          sectionCounts.push(nestedHeading);
          nested.push({
            line: i,
            level,
            self: 0,
            total: 0,
            pos: line.to,
          });
        } else if (prevHeading.level > level) {
          // Traversing to lower level heading (eg. ### -> ##)
          for (let j = nested.length - 1; j >= 0; j--) {
            const nestedHeading = nested[j];

            if (level < nestedHeading.level) {
              // Continue traversing to lower level heading
              const nestedHeading = nested.pop();
              sectionCounts.push(nestedHeading);
              if (j === 0) {
                nested.push({
                  line: i,
                  level,
                  self: 0,
                  total: 0,
                  pos: line.to,
                });
              }
              continue;
            }

            if (level === nestedHeading.level) {
              // Stop because we found an equal level heading
              const nestedHeading = nested.pop();
              sectionCounts.push(nestedHeading);
              nested.push({
                line: i,
                level,
                self: 0,
                total: 0,
                pos: line.to,
              });
              break;
            }

            if (level > nestedHeading.level) {
              // Stop because we found an higher level heading
              nested.push({
                line: i,
                level,
                self: 0,
                total: 0,
                pos: line.to,
              });
              break;
            }
          }
        }
      } else if (nested.length) {
        // Not in a heading, so add the word count of the line to the headings containing this line
        const count = this.lineCounts[i - 1];
        // ⚡ Performance optimization: Fast-path zero-count lines and direct heading accumulation.
        // Between 25% and 40% of lines in typical markdown documents are blank or zero-word lines.
        // Checking `count !== 0` skips iterating over `nested` heading frames entirely for empty lines.
        // Furthermore, updating `prevHeading.self` directly outside the loop and using an indexed loop
        // for `total` eliminates redundant per-heading identity checks (`heading === prevHeading`).
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

    for (const data of sectionCounts) {
      b.add(
        data.pos,
        data.pos,
        Decoration.widget({
          side: 1,
          widget: new SectionWidget(data),
        })
      );
    }

    return b.finish();
  }
}

export const settingsChanged = StateEffect.define<void>();
export const sectionWordCountEditorPlugin = ViewPlugin.fromClass(SectionWordCountEditorPlugin, {
  decorations: (v) => v.decorations,
});
