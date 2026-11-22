import * as vscode from "vscode";
import { openFile, placeCursor, run, sleep, waitFor } from "../helpers";
import type { Scene } from "../index";

/** An unsorted block is warned about, then sorted through the lightbulb quick fix. */
export const sortQuickFix: Scene = {
  name: "sort-quick-fix",
  async run() {
    const editor = await openFile("sorting.py");
    const uri = editor.document.uri;
    const [first] = await waitFor("keep-sorted diagnostics", () => {
      const found = vscode.languages.getDiagnostics(uri);
      return found.length ? found : undefined;
    });
    await run("workbench.actions.view.problems");
    await sleep(2000);

    placeCursor(editor, first.range.start.line, first.range.start.character);
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      "vscode.executeCodeActionProvider",
      uri,
      first.range
    );
    if (!actions?.some((action) => action.title.includes("keep-sorted"))) {
      throw new Error("No keep-sorted quick fix is offered on the warning");
    }

    await run("editor.action.quickFix");
    await sleep(1800);
    await run("acceptSelectedCodeAction");
    await waitFor("sorted block", () => {
      const text = editor.document.getText();
      return text.indexOf("'alpha'") < text.indexOf("'zebra'") ? true : undefined;
    });
    await waitFor("diagnostics cleared", () =>
      vscode.languages.getDiagnostics(uri).length < 1 ? true : undefined
    );
  },
};
