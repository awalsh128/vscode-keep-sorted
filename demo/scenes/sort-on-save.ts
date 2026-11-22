import * as vscode from "vscode";
import { openFile, placeCursor, positionOf, run, sleep, typeText, waitFor } from "../helpers";
import type { Scene } from "../index";

/** With the save action enabled, an explicit save sorts the new entry into place. */
export const sortOnSave: Scene = {
  name: "sort-on-save",
  async run() {
    // Editor-owned setting, so resetState does not know it: it is cleared in the finally below.
    const editorConfig = vscode.workspace.getConfiguration("editor");
    try {
      await editorConfig.update(
        "codeActionsOnSave",
        { "source.fixAll.keepSorted": "explicit" },
        vscode.ConfigurationTarget.Global
      );
      const editor = await openFile("saving.py");
      await waitFor("keep-sorted diagnostics", () =>
        vscode.languages.getDiagnostics(editor.document.uri).length ? true : undefined
      );

      const banana = positionOf(editor.document, "'banana',");
      placeCursor(editor, banana.line, 100);
      await run("editor.action.insertLineAfter");
      await typeText("'blueberry',");
      await sleep(1500);

      await run("workbench.action.files.save");
      await waitFor("saved and sorted", () => {
        const text = editor.document.getText();
        const sorted =
          text.indexOf("'apple'") < text.indexOf("'banana'") &&
          text.indexOf("'banana'") < text.indexOf("'blueberry'") &&
          text.indexOf("'blueberry'") < text.indexOf("'cherry'");
        return sorted && !editor.document.isDirty ? true : undefined;
      });
    } finally {
      await editorConfig.update("codeActionsOnSave", undefined, vscode.ConfigurationTarget.Global);
    }
  },
};
