import * as vscode from "vscode";
import { run, sleep } from "./helpers";

/** Every configuration key the extension contributes, read from its own package.json. */
function contributedKeys(extensionId: string): string[] {
  const properties = vscode.extensions.getExtension(extensionId)?.packageJSON?.contributes
    ?.configuration?.properties as Record<string, unknown> | undefined;
  return Object.keys(properties ?? {});
}

/** Puts the window and the user's settings back as the profile left them. Safe to call twice. */
export async function resetState(extensionId: string, languages: string[] = []): Promise<void> {
  for (const key of contributedKeys(extensionId)) {
    const lastDot = key.lastIndexOf(".");
    // Settings are addressed by section: `myExt.hover.enabled` is section `myExt.hover`.
    const configuration = vscode.workspace.getConfiguration(key.slice(0, lastDot));
    const name = key.slice(lastDot + 1);
    await configuration.update(name, undefined, vscode.ConfigurationTarget.Global);
    await configuration.update(name, undefined, vscode.ConfigurationTarget.Workspace);
    for (const languageId of languages) {
      // A `[language]` block in settings.json overrides the plain value, so clear that too.
      await vscode.workspace
        .getConfiguration(key.slice(0, lastDot), { languageId })
        .update(name, undefined, vscode.ConfigurationTarget.Global, true);
    }
  }

  // Closing a dirty editor asks to save, and that dialog blocks the run, so revert each one first.
  for (const document of vscode.workspace.textDocuments.filter((candidate) => candidate.isDirty)) {
    await vscode.window.showTextDocument(document);
    await run("workbench.action.revertAndCloseActiveEditor");
  }

  await run("workbench.action.closeAllEditors"); // also closes webview panels shown as editors
  await run("workbench.action.closePanel");
  await run("workbench.action.closeAuxiliaryBar");
  await run("workbench.action.closeSidebar");
  await run("workbench.action.editorLayoutSingle");
  await run("notifications.clearAll");
  await sleep(300);
}
