import * as vscode from "vscode";
import { hoverTexts, openFile, positionOf, run, sleep, typeText, waitFor } from "../helpers";
import type { Scene } from "../index";

/** Options are suggested on the start line, then documented on hover. */
export const optionsCompletionHover: Scene = {
  name: "options-completion-hover",
  async run() {
    const editor = await openFile("options.py");
    const start = positionOf(editor.document, "keep-sorted start ", "keep-sorted start ".length);
    editor.selection = new vscode.Selection(start, start);
    await sleep(1000);

    await run("editor.action.triggerSuggest");
    await sleep(1500);
    await typeText("nume");
    const items = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      editor.document.uri,
      editor.selection.active
    );
    if (!items.items.some((item) => String(item.label).includes("numeric"))) {
      throw new Error("The numeric option is not suggested");
    }

    await sleep(1500);
    await run("acceptSelectedSuggestion");
    await sleep(1000);
    await run("cursorLeft");
    await run("cursorLeft");
    await waitFor("option hover", async () => {
      const texts = await hoverTexts(editor.document.uri, editor.selection.active);
      return texts.some((text) => text.toLowerCase().includes("numeric")) ? true : undefined;
    });
    await run("editor.action.showHover");
    await sleep(3500);
  },
};
