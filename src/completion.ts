import * as vscode from "vscode";
import { contextualizeLogger, EXT_NAME } from "./instrumentation";
import * as workspace from "./workspace";
import {
  Directive,
  KeepSortedOption,
  KEEP_SORTED_OPTS,
  isValidCompletionPosition,
  KeepSortedOptionCategory,
} from "./keepsortedopt";

/**
 * Characters that open suggestions while typing. VS Code disables quick suggestions inside comments
 * by default and directives are always comments, so option-name and value characters must be
 * explicit triggers. Positions outside a directive's option list return immediately.
 */
const TRIGGER_CHARACTERS = [
  " ",
  "=",
  "_",
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
];

/** The option value being typed at the cursor. */
interface ValueAtCursor {
  /** Option key before `=` */
  key: string;
  /** Range of the whole value, so accepting a suggestion replaces any text after the cursor */
  range: vscode.Range;
  /** Whether the cursor is inside a YAML list such as `[a, b]` */
  inList: boolean;
}

/** Information about the word being typed at a given position. */
interface WordInfo {
  word: string;
  range: vscode.Range;
}

/** Provides autocomplete suggestions for keep-sorted options. */
export class KeepSortedCompletionProvider
  implements vscode.CompletionItemProvider, workspace.Registrant
{
  private directiveKeywords = new Set<string>(["start", "keep", "sorted", "keep-sorted"]);

  readonly id = "KeepSortedCompletionProvider";

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] | vscode.CompletionList | undefined {
    // Only provide completions on keep-sorted start lines, after the "start" keyword
    if (!isValidCompletionPosition(document, position)) {
      return undefined;
    }

    const lineText = document.lineAt(position.line).text;
    const value = this.getValueAtCursor(lineText, position);
    if (value) {
      return value.inList ? undefined : this.provideValueItems(value);
    }

    const directive = Directive.create(lineText);
    if (!directive) {
      return [];
    }
    const wordInfo = this.getWordAtPosition(document, position);

    const completionLogger = contextualizeLogger(document.uri);
    const validOpts = directive.getValidOptions();
    completionLogger.debug(
      `Providing completions at line ${position.line}, existing options:\n` +
        validOpts.map(({ option: opt, parsed }) => `${opt.key}=${parsed}`).join("\n")
    );

    const items: vscode.CompletionItem[] = [];

    const shouldFilterByWord = this.shouldFilterByWord(wordInfo);
    const existingOptions = validOpts.map(({ option }) => option);
    const excludedKeys = new Set<string>(
      existingOptions.flatMap((option) => [option.key, ...(option.conflicts ?? [])])
    );
    for (const [key, option] of KEEP_SORTED_OPTS) {
      // Skip options already on the line and options keep-sorted would ignore alongside them
      if (excludedKeys.has(key)) {
        continue;
      }

      // Filter by partial match if user is typing an option name (case-insensitive)
      // Skip this filter if the word is part of the directive or an option value
      if (shouldFilterByWord) {
        const typedLower = wordInfo!.word.toLowerCase();
        if (!key.toLowerCase().startsWith(typedLower)) {
          continue;
        }
      }

      const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
      item.detail = `${EXT_NAME} option (${option.valueType})`;
      item.documentation = new vscode.MarkdownString(option.documentation);

      item.insertText = this.getOptionSnippet(option);

      // Set sort order to keep options in logical groups
      item.sortText = this.getSortText(option);

      items.push(item);
    }

    completionLogger.debug(`Returning ${items.length} completion items`);
    return items;
  }

  /** Registers the completion provider for in-scope document schemas. */
  async register(): Promise<vscode.Disposable> {
    const selector: vscode.DocumentSelector = workspace.IN_SCOPE_SCHEMAS.map(
      (scheme: string): vscode.DocumentFilter => ({ scheme })
    );
    return vscode.languages.registerCompletionItemProvider(selector, this, ...TRIGGER_CHARACTERS);
  }

  /**
   * Inserts `key=` followed by a choice of known values, listing non-default values first because
   * writing an option's default has no effect. Free-form values get an empty tab stop.
   */
  private getOptionSnippet(option: KeepSortedOption): vscode.SnippetString {
    const snippet = new vscode.SnippetString(`${option.key}=`);
    if (!option.values) {
      return snippet.appendTabstop(1);
    }
    const choices = [...option.values].sort(
      (a, b) => Number(a === option.defaultValue) - Number(b === option.defaultValue)
    );
    return snippet.appendChoice(choices, 1);
  }

  /** Suggests the known values of the option being typed. */
  private provideValueItems(value: ValueAtCursor): vscode.CompletionItem[] | undefined {
    const option = KEEP_SORTED_OPTS.get(value.key);
    if (!option?.values) {
      return undefined;
    }
    return option.values.map((optionValue, i) => {
      const item = new vscode.CompletionItem(optionValue, vscode.CompletionItemKind.EnumMember);
      item.detail =
        `${EXT_NAME} ${option.key} value` +
        (optionValue === option.defaultValue ? " (default)" : "");
      item.documentation = new vscode.MarkdownString(option.documentation);
      item.range = value.range;
      item.sortText = String(i).padStart(2, "0");
      return item;
    });
  }

  /** Finds the option value being typed, such as after `=` or inside `[...]`. */
  private getValueAtCursor(lineText: string, position: vscode.Position): ValueAtCursor | undefined {
    const textBeforeCursor = lineText.substring(0, position.character);
    const token = textBeforeCursor.split(/\s/).pop() ?? "";
    const openLists =
      (textBeforeCursor.match(/\[/g) ?? []).length - (textBeforeCursor.match(/\]/g) ?? []).length;
    const equalsIndex = token.indexOf("=");
    if (openLists > 0) {
      return { key: "", range: new vscode.Range(position, position), inList: true };
    }
    if (equalsIndex === -1) {
      return undefined;
    }
    const start = position.character - token.length + equalsIndex + 1;
    const rest = lineText.substring(position.character).match(/^\S*/)![0];
    return {
      key: token.substring(0, equalsIndex),
      range: new vscode.Range(
        position.line,
        start,
        position.line,
        position.character + rest.length
      ),
      inList: false,
    };
  }

  /** Get sort text to group options logically. */
  private getSortText(option: KeepSortedOption): string {
    const getPrefix = () => {
      switch (option.category) {
        case KeepSortedOptionCategory.PreSorting:
          return "0";
        case KeepSortedOptionCategory.Sorting:
          return "1";
        case KeepSortedOptionCategory.PostSorting:
          return "2";
        case KeepSortedOptionCategory.Meta:
          return "3";
        default:
          return "4";
      }
    };
    return `${getPrefix()}_${option.key}`;
  }

  /** Get the word being typed at the given position. */
  private getWordAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): WordInfo | undefined {
    const lineText = document.lineAt(position.line).text;
    const column = position.character;

    // Find the start of the word by searching backwards for a non-word character
    let start = column;
    while (start > 0 && /[a-zA-Z0-9_]/.test(lineText[start - 1])) {
      start--;
    }

    // Extract the word from start to current position
    const word = lineText.substring(start, column);
    if (word.length === 0) {
      return undefined;
    }

    const range = new vscode.Range(new vscode.Position(position.line, start), position);
    return { word, range };
  }

  /**
   * Determines whether to filter completions based on the currently typed word.
   *
   * Ignores words that are part of the directive itself (e.g., "start", "keep", "sorted"). Option
   * values never reach this check because completions are skipped for them.
   *
   * @param wordInfo Information about the word being typed, including the word and its range.
   *
   * @returns A boolean indicating whether to filter completions based on the word.
   */
  private shouldFilterByWord(wordInfo: WordInfo | undefined): boolean {
    const isDirectiveKeyword = wordInfo && this.directiveKeywords.has(wordInfo.word.toLowerCase());
    return (wordInfo && wordInfo.word.length > 0 && !isDirectiveKeyword) ?? false;
  }
}
