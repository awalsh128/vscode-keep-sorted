import * as vscode from "vscode";
import { openFile, run, runFromPalette, sleep, waitFor, workspaceUri } from "../helpers";
import type { Scene } from "../index";

const files = ["config/a.py", "config/b.ts"];

/** One command sorts every file that has warnings, including files that were never opened. */
export const sortWorkspace: Scene = {
  name: "sort-workspace",
  async run() {
    await openFile("config/a.py");
    await waitFor("diagnostics in both files", () =>
      files.every((file) => vscode.languages.getDiagnostics(workspaceUri(file)).length)
        ? true
        : undefined
    );
    await run("workbench.actions.view.problems");
    await sleep(2500);

    await runFromPalette("Keep Sorted: Sort All Files with Problems");
    await waitFor("every file clear", () =>
      files.every((file) => vscode.languages.getDiagnostics(workspaceUri(file)).length < 1)
        ? true
        : undefined
    );
    const sorted = (await vscode.workspace.openTextDocument(workspaceUri("config/b.ts"))).getText();
    if (sorted.indexOf("ap-south") > sorted.indexOf("eu-central")) {
      throw new Error("config/b.ts was not sorted");
    }
  },
};
