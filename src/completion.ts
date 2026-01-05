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

/** Provides autocomplete suggestions for keep-sorted options. */
export class KeepSortedCompletionProvider
  implements vscode.CompletionItemProvider, workspace.Registrant
{
  private directiveKeywords = new Set(["start", "keep", "sorted", "keep-sorted"]);

  readonly id = "KeepSortedCompletionProvider";

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    // Only provide completions on keep-sorted start lines, after the "start" keyword
    if (!isValidCompletionPosition(document, position)) {
      return undefined;
    }

    const directive = Directive.create(document.lineAt(position.line).text);
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

    const shouldFilterByWord = this.shouldFilterByWord(
      document.lineAt(position.line).text,
      wordInfo
    );
    const existingOptionKeys = new Set(
      [...directive.getValidOptions()].map(({ option: options }) => options.key)
    );
    for (const [key, option] of KEEP_SORTED_OPTS) {
      // Skip options already on the line
      if (existingOptionKeys.has(key)) {
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

      // Insert text with = and placeholder value
      item.insertText = new vscode.SnippetString(`${key}=\${1:${option.defaultValue}}`);

      // Set sort order to keep options in logical groups
      item.sortText = this.getSortText(option);

      items.push(item);
    }

    completionLogger.debug(`Returning ${items.length} completion items`);
    return items;
  }

  /** Registers the completion provider for in-scope document schemas. */
  async register(): Promise<vscode.Disposable> {
    return vscode.languages.registerCompletionItemProvider(
      workspace.IN_SCOPE_SCHEMAS.map((s: string) => ({ scheme: s })),
      this,
      /* triggerCharacters= */ " "
    );
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
  ): { word: string; range: vscode.Range } | undefined {
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
   * - Ignore words that are part of the directive itself (e.g., "start", "keep", "sorted")
   * - Ignore words that are option values (preceded by '=' on the line)
   *
   * @param lineText The text of the current line.
   * @param wordInfo Information about the word being typed, including the word and its range.
   *
   * @returns A boolean indicating whether to filter completions based on the word.
   */
  private shouldFilterByWord(
    lineText: string,
    wordInfo: { word: string; range: vscode.Range } | undefined
  ): boolean {
    const isDirectiveKeyword = wordInfo && this.directiveKeywords.has(wordInfo.word.toLowerCase());
    const isOptionValue = wordInfo && lineText.charAt(wordInfo.range.start.character - 1) === "=";
    return (wordInfo && wordInfo.word.length > 0 && !isDirectiveKeyword && !isOptionValue) ?? false;
  }
}
