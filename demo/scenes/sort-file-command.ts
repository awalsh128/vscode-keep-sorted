import * as vscode from "vscode";
import { openFile, runFromPalette, sleep, waitFor } from "../helpers";
import type { Scene } from "../index";

/** The Command Palette entry sorts every block in the current file. */
export const sortFileCommand: Scene = {
  name: "sort-file-command",
  async run() {
    const editor = await openFile("settings.ts");
    await waitFor("keep-sorted diagnostics", () =>
      vscode.languages.getDiagnostics(editor.document.uri).length ? true : undefined
    );
    await sleep(1500);

    await runFromPalette("Keep Sorted: Sort Current File");
    await waitFor("sorted block", () => {
      const text = editor.document.getText();
      return text.indexOf("author") < text.indexOf("retries") &&
        text.indexOf("retries") < text.indexOf("timeout")
        ? true
        : undefined;
    });
    await waitFor("diagnostics cleared", () =>
      vscode.languages.getDiagnostics(editor.document.uri).length < 1 ? true : undefined
    );
  },
};
