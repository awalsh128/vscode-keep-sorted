import * as vscode from "vscode";
import { extensionId } from "./instrumentation";
import { Directive, hasDirectives, KEEP_SORTED_OPTS } from "./keepsortedopt";

/*
 * Editor diagnostics for directive options. Kept apart from keepsortedopt.ts so that module stays
 * free of runtime `vscode` imports. Not wired into linting: option warnings shown in the editor
 * come from the keep-sorted binary.
 */

const PARSE_ERRORMSG_SUFFIX = "Linting and fixes will still work but option will be ignored.";

function createDiagnostic(range: vscode.Range, message: string): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    range,
    message + "\n" + PARSE_ERRORMSG_SUFFIX,
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = extensionId.name;
  return diagnostic;
}

/** Parses keep-sorted options from a line and returns parsed options and diagnostics for issues. */
export function getDirectiveAndErrors(
  lineText: string,
  lineNum: number
): { directive: Directive; diagnostics: vscode.Diagnostic[] } | undefined {
  // Fast check for keep-sorted since this call is on the critical path
  if (!hasDirectives(lineText)) {
    return undefined;
  }

  const directive = Directive.create(lineText);
  if (!directive) {
    return undefined;
  }

  const diagnostics: vscode.Diagnostic[] = [];

  for (const token of directive.malformed) {
    // No equals sign - skip empty parts or trailing text
    diagnostics.push(
      createDiagnostic(
        new vscode.Range(lineNum, 0, lineNum, lineText.length),
        `Invalid keep-sorted option format: "${token}". Expected format is key=value.`
      )
    );
  }

  for (const token of directive.wellformed) {
    const option = KEEP_SORTED_OPTS.get(token.key);
    if (!option) {
      diagnostics.push(
        createDiagnostic(
          new vscode.Range(lineNum, token.index, lineNum, token.index + token.text.length),
          `Unrecognized keep-sorted option: "${token.key}"`
        )
      );
      continue;
    }
    if (option.parseValue(token.value) instanceof Error) {
      diagnostics.push(
        createDiagnostic(
          new vscode.Range(lineNum, token.index, lineNum, lineText.length),
          `Invalid value for keep-sorted option "${token.key}": "${token.value}".`
        )
      );
    }
  }

  return { directive, diagnostics };
}

/** Validates keep-sorted options and returns diagnostics for any issues found. */
export function validateOptionsInFile(document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
    const result = getDirectiveAndErrors(document.lineAt(lineNum).text, lineNum);
    if (result) {
      diagnostics.push(...result.diagnostics);
    }
  }
  return diagnostics;
}
