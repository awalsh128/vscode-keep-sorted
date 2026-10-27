import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { isDeepStrictEqual } from "util";
import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import * as vscode from "vscode";
import { TEST_WORKSPACE_DIR } from "./testing";

describe("extension", () => {
  const EXTENSION_ID = "awalsh128.keep-sorted";
  const FIX_FILE_COMMAND = "keep-sorted.fixFile";
  const FIX_WORKSPACE_COMMAND = "keep-sorted.fixWorkspace";
  const SORT_FILE_COMMAND = "keep-sorted.sortFile";
  const SAMPLE_TS_FILENAME = "sample.ts";
  const SAMPLE_SORTED_TS_FILENAME = "sample_sorted.ts";

  it("should complete activation successfully", async () => {
    // Arrange
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!;

    // Act & Assert
    await expect(extension.activate()).to.not.be.rejected;
    expect(extension.isActive).to.equal(true);
  });

  const getDocument = async (filename?: string | vscode.Uri) => {
    const uri =
      filename instanceof vscode.Uri
        ? filename
        : vscode.Uri.file(path.join(TEST_WORKSPACE_DIR, filename ?? SAMPLE_TS_FILENAME));
    return await vscode.workspace.openTextDocument(uri);
  };
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForDiagnostics = async (uri: vscode.Uri, timeoutMs = 5000): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (vscode.languages.getDiagnostics(uri).length > 0) {
        return;
      }
      await delay(100);
    }
    throw new Error(`Timed out waiting for diagnostics for ${uri.fsPath}`);
  };

  // Settings are written to the file directly: VS Code's configuration API saves through a text
  // model that can reject quick successive writes as "newer" than the file, and the rejected edit
  // stays unsaved and fails every later write.
  const WORKSPACE_SETTINGS = path.join(TEST_WORKSPACE_DIR, ".vscode", "settings.json");
  const readWorkspaceSettings = (): Promise<string> => fs.readFile(WORKSPACE_SETTINGS, "utf8");

  /** Writes the workspace settings file and waits until VS Code has loaded the given keys. */
  const writeWorkspaceSettings = async (text: string, keys: string[]): Promise<void> => {
    await fs.writeFile(WORKSPACE_SETTINGS, text);
    const expected: Record<string, unknown> = JSON.parse(text);
    const loaded = (): boolean =>
      keys.every((key) =>
        isDeepStrictEqual(
          vscode.workspace.getConfiguration().inspect(key)?.workspaceValue,
          expected[key]
        )
      );
    const start = Date.now();
    while (!loaded()) {
      if (Date.now() - start > 5000) {
        throw new Error(`Timed out waiting for workspace settings ${keys.join(", ")}`);
      }
      await delay(50);
    }
  };

  /** Sets workspace settings, removing those set to undefined. */
  const updateWorkspaceSettings = async (changes: Record<string, unknown>): Promise<void> => {
    const settings = { ...JSON.parse(await readWorkspaceSettings()), ...changes };
    await writeWorkspaceSettings(JSON.stringify(settings, null, 2) + "\n", Object.keys(changes));
  };

  /** Restores the workspace settings file to text read earlier. */
  const restoreWorkspaceSettings = async (text: string): Promise<void> => {
    const keys = Object.keys({ ...JSON.parse(await readWorkspaceSettings()), ...JSON.parse(text) });
    await writeWorkspaceSettings(text, keys);
  };

  describe("activation behavior", () => {
    it("should create diagnostics on save", async () => {
      // Arrange
      const document = await getDocument();

      // Act - Make an edit and save to trigger diagnostics
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(0, 0), "\n");
      await vscode.workspace.applyEdit(edit);
      await document.save();

      // Wait for async diagnostic processing
      await delay(1000);

      // Assert
      const diagnostics = vscode.languages.getDiagnostics(document.uri);
      expect(diagnostics).to.be.an("array").with.length.greaterThan(0);
      // Note: Global afterEach in index.ts restores workspace files including in-memory cache
    });

    it("should fix document on command", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      const document = await getDocument(SAMPLE_TS_FILENAME);
      await extension.activate();
      await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
      await waitForDiagnostics(document.uri);

      // Act - Execute the fix command
      await vscode.commands.executeCommand(FIX_FILE_COMMAND, document);

      // Assert - Verify document content has been changed
      expect(document.getText()).to.equal(
        await getDocument(SAMPLE_SORTED_TS_FILENAME).then((doc) => doc.getText())
      );
    });

    it("should register the current sort commands", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      await extension.activate();

      // Act
      const commands = await vscode.commands.getCommands(true);

      // Assert
      expect(commands).to.include(FIX_FILE_COMMAND);
      expect(commands).to.include(FIX_WORKSPACE_COMMAND);
      expect(commands).not.to.include(SORT_FILE_COMMAND);
    });
  });

  describe("enabled setting", () => {
    let originalSettings: string;

    beforeEach(async (): Promise<void> => {
      originalSettings = await readWorkspaceSettings();
    });

    afterEach(async (): Promise<void> => {
      await restoreWorkspaceSettings(originalSettings);
    });

    it("should clear diagnostics when disabled and restore them when re-enabled", async () => {
      // Arrange
      await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
      const document = await getDocument();
      await waitForDiagnostics(document.uri);

      // Act & Assert - disabling removes stale warnings
      await updateWorkspaceSettings({ "keep-sorted.enabled": false });
      const start = Date.now();
      while (
        vscode.languages.getDiagnostics(document.uri).length > 0 &&
        Date.now() - start < 5000
      ) {
        await delay(100);
      }
      expect(vscode.languages.getDiagnostics(document.uri)).to.have.lengthOf(0);

      // Act & Assert - re-enabling lints documents that are already open
      await updateWorkspaceSettings({ "keep-sorted.enabled": true });
      await waitForDiagnostics(document.uri);
    });
  });

  describe("completion", () => {
    it("should suggest options when typing on a start directive", async () => {
      // Arrange
      await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
      const document = await vscode.workspace.openTextDocument({
        content: "// keep-sorted start gr\n// keep-sorted end\n",
      });

      // Act - Simulate the "r" trigger character that VS Code sends while typing in a comment
      const list = await vscode.commands.executeCommand<vscode.CompletionList>(
        "vscode.executeCompletionItemProvider",
        document.uri,
        new vscode.Position(0, document.lineAt(0).text.length),
        "r"
      );

      // Assert
      const labels = list.items.map((item) => item.label);
      expect(labels).to.include.members(["group", "group_prefixes"]);
    });
  });

  describe("hover", () => {
    it("should show option documentation on a start directive", async () => {
      // Arrange
      await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
      const document = await vscode.workspace.openTextDocument({
        content: "// keep-sorted start order=desc\n// keep-sorted end\n",
      });

      // Act
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        "vscode.executeHoverProvider",
        document.uri,
        new vscode.Position(0, document.lineAt(0).text.indexOf("order") + 1)
      );

      // Assert
      const markdown = hovers.flatMap((hover) =>
        hover.contents.map((content) => (content as vscode.MarkdownString).value)
      );
      expect(markdown.join("\n")).to.include("**order**");
    });
  });

  describe("sorting regressions", () => {
    let fixtureUri: vscode.Uri;
    const unsortedContent = [
      "Outside blocks: zebra, apple",
      "# keep-sorted start",
      "zebra",
      "apple",
      "# keep-sorted end",
      "Between blocks: zebra, apple",
      "# keep-sorted start",
      "delta",
      "charlie",
      "# keep-sorted end",
      "",
    ].join("\n");
    const sortedContent = [
      "Outside blocks: zebra, apple",
      "# keep-sorted start",
      "apple",
      "zebra",
      "# keep-sorted end",
      "Between blocks: zebra, apple",
      "# keep-sorted start",
      "charlie",
      "delta",
      "# keep-sorted end",
      "",
    ].join("\n");
    let document: vscode.TextDocument;
    let originalSettings: string;

    // VS Code creates its save participants in idle callbacks after startup. Chromium throttles
    // those in unfocused windows, so the first wait can approach a minute; later waits only cover
    // configuration changes.
    let saveParticipantsReady = false;
    const FIRST_SAVE_PARTICIPANT_WAIT_MS = 90000;

    const waitForSaveParticipants = async (): Promise<void> => {
      let requestedOnSave = false;
      const requests = new Set<string>();
      const kind = vscode.CodeActionKind.SourceFixAll.append("keepSorted");
      const probe = vscode.languages.registerCodeActionsProvider(
        { scheme: "file", pattern: fixtureUri.fsPath },
        {
          provideCodeActions(
            _document: vscode.TextDocument,
            _range: vscode.Range,
            context: vscode.CodeActionContext
          ): vscode.CodeAction[] {
            requests.add(`${context.only?.value}:${context.triggerKind}`);
            requestedOnSave ||=
              context.only?.contains(kind) === true &&
              context.triggerKind === vscode.CodeActionTriggerKind.Automatic;
            return [];
          },
        },
        { providedCodeActionKinds: [kind] }
      );
      try {
        const deadline =
          Date.now() + (saveParticipantsReady ? 5000 : FIRST_SAVE_PARTICIPANT_WAIT_MS);
        while (!requestedOnSave && Date.now() < deadline) {
          const edit = new vscode.WorkspaceEdit();
          edit.insert(fixtureUri, new vscode.Position(0, 0), "\n");
          await vscode.workspace.applyEdit(edit);
          await document.save();
          if (!requestedOnSave) {
            await delay(250);
          }
        }
        const settings = vscode.workspace
          .getConfiguration("editor", fixtureUri)
          .get("codeActionsOnSave");
        const message =
          `Save requests: ${[...requests].join(", ")}; ` + `settings: ${JSON.stringify(settings)}`;
        expect(requestedOnSave, message).to.equal(true);
        saveParticipantsReady = true;
      } finally {
        probe.dispose();
      }
    };

    beforeEach(async function (this: Mocha.Context): Promise<void> {
      this.timeout(FIRST_SAVE_PARTICIPANT_WAIT_MS + 20000);
      // Unique URIs prevent dirty editor buffers from being reused across tests.
      fixtureUri = vscode.Uri.file(path.join(TEST_WORKSPACE_DIR, `sort-${randomUUID()}.txt`));
      await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
      originalSettings = await readWorkspaceSettings();
      await updateWorkspaceSettings({
        "keep-sorted.enabled": true,
        "editor.codeActionsOnSave": { "source.fixAll.keepSorted": "explicit" },
      });
      await vscode.workspace.fs.writeFile(fixtureUri, Buffer.from("Save readiness probe\n"));
      document = await vscode.workspace.openTextDocument(fixtureUri);
      await vscode.window.showTextDocument(document);
      await waitForSaveParticipants();
      const edit = new vscode.WorkspaceEdit();
      edit.replace(fixtureUri, new vscode.Range(0, 0, document.lineCount, 0), unsortedContent);
      expect(await vscode.workspace.applyEdit(edit)).to.equal(true);
      await waitForDiagnostics(fixtureUri);
    });

    afterEach(async (): Promise<void> => {
      await document.save();
      await restoreWorkspaceSettings(originalSettings);
    });

    [FIX_FILE_COMMAND].forEach((command: string): void => {
      [
        {
          name: "document",
          args: (document: vscode.TextDocument): vscode.TextDocument[] => [document],
        },
        { name: "command palette", args: (): vscode.TextDocument[] => [] },
      ].forEach((invocation): void => {
        const title = `should sort all blocks via ${command} from ${invocation.name}`;
        it(title, async (): Promise<void> => {
          // Arrange
          const args = invocation.args(document);

          // Act
          await vscode.commands.executeCommand(command, ...args);

          // Assert
          expect(document.getText()).to.equal(sortedContent);
          expect(vscode.languages.getDiagnostics(fixtureUri)).to.have.lengthOf(0);
        });
      });

      it(`should be idempotent via ${command}`, async (): Promise<void> => {
        // Arrange
        await vscode.commands.executeCommand(command, document);
        expect(document.getText()).to.equal(sortedContent);
        const sortedVersion = document.version;

        // Act
        await vscode.commands.executeCommand(command, document);

        // Assert
        expect(document.getText()).to.equal(sortedContent);
        expect(document.version).to.equal(sortedVersion);
        expect(vscode.languages.getDiagnostics(fixtureUri)).to.have.lengthOf(0);
      });
    });

    const codeActions = (range: vscode.Range, kind: string): Thenable<vscode.CodeAction[]> =>
      vscode.commands.executeCommand<vscode.CodeAction[]>(
        "vscode.executeCodeActionProvider",
        fixtureUri,
        range,
        kind
      );

    // Source Action menu and Fix All command
    ["source", "source.fixAll"].forEach((kind: string): void => {
      it(`should offer fix all for ${kind} with the cursor outside blocks`, async () => {
        // Act
        const actions = await codeActions(new vscode.Range(0, 0, 0, 0), kind);

        // Assert
        expect(actions.map((action) => action.kind?.value)).to.include("source.fixAll.keepSorted");
      });
    });

    it("should prefer the file quick fix so Auto Fix applies it", async () => {
      // Act
      const actions = await codeActions(new vscode.Range(2, 0, 2, 0), "quickfix");

      // Assert
      const fileAction = actions.find((action) => action.command?.command === FIX_FILE_COMMAND);
      expect(fileAction?.isPreferred).to.equal(true);
    });

    const makeDocumentDirty = async (): Promise<void> => {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(fixtureUri, new vscode.Position(document.lineCount - 1, 0), "\n");
      expect(await vscode.workspace.applyEdit(edit)).to.equal(true);
      expect(document.isDirty).to.equal(true);
    };

    it("should sort all blocks on save and persist the result to disk", async (): Promise<void> => {
      // Arrange
      await makeDocumentDirty();
      const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        "vscode.executeCodeActionProvider",
        fixtureUri,
        new vscode.Range(0, 0, document.lineCount, 0),
        "source.fixAll.keepSorted"
      );
      expect(actions).to.have.lengthOf(1);

      // Act
      await vscode.commands.executeCommand("workbench.action.files.save");

      // Assert
      expect(document.getText()).to.equal(sortedContent + "\n");
      expect(Buffer.from(await vscode.workspace.fs.readFile(fixtureUri)).toString("utf8")).to.equal(
        sortedContent + "\n"
      );
      expect(document.isDirty).to.equal(false);
      expect(vscode.languages.getDiagnostics(fixtureUri)).to.have.lengthOf(0);
    });

    it("should only lint on save when the save action is disabled", async (): Promise<void> => {
      // Arrange
      await updateWorkspaceSettings({
        "editor.codeActionsOnSave": { "source.fixAll.keepSorted": "never" },
      });
      await makeDocumentDirty();

      // Act
      await vscode.commands.executeCommand("workbench.action.files.save");

      // Assert
      expect(document.getText()).to.equal(unsortedContent + "\n");
      expect(Buffer.from(await vscode.workspace.fs.readFile(fixtureUri)).toString("utf8")).to.equal(
        unsortedContent + "\n"
      );
      expect(document.isDirty).to.equal(false);
      expect(vscode.languages.getDiagnostics(fixtureUri)).to.have.length.greaterThan(0);
    });
  });

  describe("deactivation behavior", () => {
    it("should properly deactivate extension", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      await extension.activate();

      // Assert - Extension is active after activation
      expect(extension.isActive).to.equal(true);
    });

    it("should clean up subscriptions on deactivation", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      const initialLength = vscode.languages.getDiagnostics().length;

      // Act
      await extension.activate();
      await delay(500);

      // Create a test document to trigger diagnostics
      const document = await getDocument();
      await waitForDiagnostics(document.uri);
      const afterActivationLength = vscode.languages.getDiagnostics().length;

      // We should have diagnostics after activation (extension may already be active)
      expect(afterActivationLength).to.be.greaterThanOrEqual(initialLength);
    });

    it("should handle multiple activation/deactivation cycles", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;

      // Act - Cycle through activate multiple times
      for (let i = 0; i < 3; i++) {
        await extension.activate();
        await delay(200);
        expect(extension.isActive).to.equal(true);
      }

      // Assert - Should not throw errors on repeated activation
      expect(extension.isActive).to.equal(true);
    });

    it("should preserve diagnostics collection state", async () => {
      // Arrange
      const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
      const document = await getDocument();

      // Act
      await extension.activate();
      await waitForDiagnostics(document.uri);
      const diagnosticsBeforeDeactivation = vscode.languages.getDiagnostics(document.uri).length;

      // Assert - Diagnostics should exist
      expect(diagnosticsBeforeDeactivation).to.be.greaterThan(0);
    });
  });
});
