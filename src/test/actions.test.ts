import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import sinonChai from "sinon-chai";
import * as path from "path";
import * as vscode from "vscode";
import { ActionProvider } from "../actions";
import { EditFactory } from "../workspace";
import { KeepSorted } from "../keepsorted";
import { EXT_NAME } from "../instrumentation";
import * as sinon from "sinon";
import { CommandHandlers, SortBlockCommandHandler, SortFileCommandHandler } from "../commands";

use(sinonChai);

// Constants for test values that are irrelevant to test behavior
const ANY_DIAGNOSTIC_MESSAGE = "Test diagnostic";
const ANY_SHORT_MESSAGE = "Test";
const FIRST_DIAGNOSTIC_MESSAGE = "First diagnostic";
const SECOND_DIAGNOSTIC_MESSAGE = "Second diagnostic";
const KEEP_SORTED_SOURCE = "keep-sorted";

// Path to test workspace
const TEST_WORKSPACE = path.join(__dirname, "..", "..", "test-workspace");
const MIXED_BLOCKS_FILE = path.join(TEST_WORKSPACE, "mixed_blocks.ts");
const SORTED_BLOCKS_FILE = path.join(TEST_WORKSPACE, "sorted_blocks.ts");

const ACTION_COUNT = 2;

describe("actions", () => {
  describe("ActionProvider", () => {
    let provider: ActionProvider;
    let linter: KeepSorted;
    let diagnostics: vscode.DiagnosticCollection;
    let editFactory: EditFactory;
    let document: vscode.TextDocument;
    let editCommandHandlers: CommandHandlers;

    let range: vscode.Range;
    let sandbox: sinon.SinonSandbox;

    beforeEach(async () => {
      // Arrange - Use real objects
      sandbox = sinon.createSandbox();
      linter = new KeepSorted(process.cwd());
      diagnostics = vscode.languages.createDiagnosticCollection(EXT_NAME);
      editFactory = new EditFactory(linter, diagnostics);
      editCommandHandlers = {
        sortBlock: new SortBlockCommandHandler(diagnostics, editFactory),
        sortFile: new SortFileCommandHandler(diagnostics, editFactory),
      };

      // Open real document from test workspace
      document = await vscode.workspace.openTextDocument(MIXED_BLOCKS_FILE);

      // Range covering part of the first keep-sorted block (line 6)
      range = new vscode.Range(5, 0, 6, 0);

      provider = new ActionProvider(diagnostics, editCommandHandlers);
    });

    afterEach(() => {
      // Clear diagnostics before disposing to prevent "object is disposed" errors
      diagnostics.clear();
      sandbox.restore();
      diagnostics.dispose();
    });

    describe("actionKinds", () => {
      it("should have specific action kinds", () => {
        // Arrange - No setup needed

        // Act
        const kinds = ActionProvider.kinds;

        // Assert
        expect(kinds).members([vscode.CodeActionKind.QuickFix]);
      });
    });

    describe("provideCodeActions", () => {
      it("should return 2 actions when diagnostics exist", async () => {
        // Arrange - Diagnostic range must intersect with test range (5,0)-(6,0)
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(5, 0, 6, 10),
          ANY_DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = KEEP_SORTED_SOURCE;
        diagnostics.set(document.uri, [diagnostic]);

        // Act
        const actions = provider.provideCodeActions(document, range);

        // Assert
        expect(actions).to.have.length(ACTION_COUNT);
      });

      it("should return empty array when no diagnostics exist", async () => {
        // Arrange - Use a file with sorted blocks (no lint issues)
        const sortedDoc = await vscode.workspace.openTextDocument(SORTED_BLOCKS_FILE);
        const sortedRange = new vscode.Range(5, 0, 6, 0);

        // Act
        const actions = provider.provideCodeActions(sortedDoc, sortedRange);

        // Assert
        expect(actions).to.be.an("array").that.has.lengthOf(0);
      });

      it("should return empty array when diagnostics.get returns empty array", async () => {
        // Arrange - Use a file with sorted blocks (no lint issues)
        const sortedDoc = await vscode.workspace.openTextDocument(SORTED_BLOCKS_FILE);
        const sortedRange = new vscode.Range(5, 0, 6, 0);

        // Act
        const actions = provider.provideCodeActions(sortedDoc, sortedRange);

        // Assert
        expect(actions).to.be.an("array").that.has.lengthOf(0);
      });

      it("should return block sort and file sort actions when diagnostics exist", () => {
        // Arrange - Diagnostic range must intersect with test range (5,0)-(6,0)
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(5, 0, 6, 10),
          ANY_DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = KEEP_SORTED_SOURCE;
        diagnostics.set(document.uri, [diagnostic]);

        // Act
        const actions = provider.provideCodeActions(document, range);

        // Assert
        expect(actions).to.have.length(ACTION_COUNT);

        // First action should be block fix
        expect(actions![0]).to.deep.equal({
          title: "Sort all lines in block (keep-sorted)",
          kind: vscode.CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          isPreferred: true,
          command: editCommandHandlers.sortBlock.command,
        });

        // Second action should be fix all
        expect(actions![1]).to.deep.equal({
          title: "Sort all lines in file (keep-sorted)",
          kind: vscode.CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          isPreferred: false,
          command: editCommandHandlers.sortFile.command,
        });
      });

      it("should return actions with multiple diagnostics", () => {
        // Arrange - Explicitly set diagnostics for all three unsorted blocks
        const diag1 = new vscode.Diagnostic(
          new vscode.Range(4, 0, 8, 0),
          "Block 1 unsorted",
          vscode.DiagnosticSeverity.Warning
        );
        diag1.source = KEEP_SORTED_SOURCE;
        const diag2 = new vscode.Diagnostic(
          new vscode.Range(16, 0, 20, 0),
          "Block 2 unsorted",
          vscode.DiagnosticSeverity.Warning
        );
        diag2.source = KEEP_SORTED_SOURCE;
        const diag3 = new vscode.Diagnostic(
          new vscode.Range(28, 0, 32, 0),
          "Block 3 unsorted",
          vscode.DiagnosticSeverity.Warning
        );
        diag3.source = KEEP_SORTED_SOURCE;
        diagnostics.set(document.uri, [diag1, diag2, diag3]);
        const fullRange = new vscode.Range(0, 0, document.lineCount, 0);

        // Act
        const actions = provider.provideCodeActions(document, fullRange);

        // Assert - Should get actions with all diagnostics from all blocks
        expect(actions).to.have.length(ACTION_COUNT);
        // First action (block fix) should have diagnostics
        expect(actions![0].diagnostics).to.have.length.greaterThan(0);
        // Fix all action should also have diagnostics
        expect(actions![1].diagnostics).to.have.length.greaterThan(0);
      });

      it("should return empty array when diagnostics exist but don't intersect with range", () => {
        // Arrange - Use a range that doesn't intersect with any keep-sorted block
        const nonIntersectingRange = new vscode.Range(12, 0, 12, 10);

        // Act
        const actions = provider.provideCodeActions(document, nonIntersectingRange);

        // Assert
        expect(actions).to.be.an("array").that.has.lengthOf(0);
      });

      it("should filter diagnostics to only those intersecting with range", () => {
        // Arrange - Explicitly set diagnostics for all three unsorted blocks
        const diag1 = new vscode.Diagnostic(
          new vscode.Range(4, 0, 8, 0),
          "Block 1 unsorted",
          vscode.DiagnosticSeverity.Warning
        );
        diag1.source = KEEP_SORTED_SOURCE;
        const diag2 = new vscode.Diagnostic(
          new vscode.Range(16, 0, 20, 0),
          "Block 2 unsorted",
          vscode.DiagnosticSeverity.Warning
        );
        diag2.source = KEEP_SORTED_SOURCE;
        const diag3 = new vscode.Diagnostic(
          new vscode.Range(28, 0, 32, 0),
          "Block 3 unsorted",
          vscode.DiagnosticSeverity.Warning
        );
        diag3.source = KEEP_SORTED_SOURCE;
        diagnostics.set(document.uri, [diag1, diag2, diag3]);
        // Use a range that only intersects with the first block
        const firstBlockRange = new vscode.Range(5, 0, 9, 0);

        // Act
        const actions = provider.provideCodeActions(document, firstBlockRange);

        // Assert - Should only get diagnostics for the first block
        expect(actions).to.have.length(ACTION_COUNT);
        expect(actions![0].diagnostics).to.have.length(1);
        // Verify the diagnostic is for the first block (lines 5-9)
        const diag = actions![0].diagnostics![0];
        expect(diag.range.start.line <= 9).to.equal(true);
        expect(diag.range.end.line >= 5).to.equal(true);
      });

      it("should create actions with command", async () => {
        // Arrange - Diagnostic range must intersect with test range (5,0)-(6,0)
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(5, 0, 6, 10),
          ANY_SHORT_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = KEEP_SORTED_SOURCE;
        diagnostics.set(document.uri, [diagnostic]);

        // Act
        const actions = provider.provideCodeActions(document, range);

        // Assert
        expect(actions).to.have.length(ACTION_COUNT);
        const blockAction = actions![0];
        const fixAllAction = actions![1];

        // Check block sort action
        expect(blockAction.title).to.equal("Sort all lines in block (keep-sorted)");
        expect(blockAction.kind).to.equal(vscode.CodeActionKind.QuickFix);
        expect(blockAction.diagnostics).to.have.length.greaterThan(0);
        expect(blockAction.isPreferred).to.equal(true);

        // Check file sort action
        expect(fixAllAction.title).to.equal("Sort all lines in file (keep-sorted)");
        expect(fixAllAction.kind).to.equal(vscode.CodeActionKind.QuickFix);
        expect(fixAllAction.isPreferred).to.equal(false);
      });

      it("should create actions with no edits", () => {
        // Arrange
        // First keep-sorted block is lines 5-9 (0-indexed 4-8) with unsorted content
        const blockRange = new vscode.Range(5, 0, 8, 0);
        const diagnostic = new vscode.Diagnostic(
          blockRange,
          "Lines are not sorted",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = KEEP_SORTED_SOURCE;
        diagnostics.set(document.uri, [diagnostic]);

        // Act
        const actions = provider.provideCodeActions(document, blockRange);

        // Assert
        expect(actions).to.have.length(ACTION_COUNT);
        const blockAction = actions![0];
        const fileAction = actions![1];

        // Verify both actions have no edits
        expect(blockAction.edit).equals(undefined);
        expect(fileAction.edit).equals(undefined);
      });

      it("should distinguish between block sort and file sort commands", () => {
        // Arrange
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(5, 0, 8, 0),
          "Lines are not sorted",
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = KEEP_SORTED_SOURCE;
        diagnostics.set(document.uri, [diagnostic]);

        // Act
        const actions = provider.provideCodeActions(document, new vscode.Range(5, 0, 8, 0));

        // Assert
        expect(actions).to.have.length(ACTION_COUNT);

        const blockAction = actions.find(
          (a) => a.title === "Sort all lines in block (keep-sorted)"
        );
        const fileAction = actions.find((a) => a.title === "Sort all lines in file (keep-sorted)");

        expect(blockAction).to.not.equal(undefined);
        expect(fileAction).to.not.equal(undefined);

        // Block sort should be preferred, file sort should not
        expect(blockAction!.isPreferred).to.equal(true);
        expect(fileAction!.isPreferred).to.equal(false);
        // Different action kinds
        expect(blockAction!.kind).to.equal(vscode.CodeActionKind.QuickFix);
        expect(fileAction!.kind).to.equal(vscode.CodeActionKind.QuickFix);
      });

      it("should pass diagnostics array to block sort command arguments", () => {
        // Arrange
        const diagnostic1 = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          FIRST_DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic1.source = KEEP_SORTED_SOURCE;

        const diagnostic2 = new vscode.Diagnostic(
          new vscode.Range(0, 5, 0, 15),
          SECOND_DIAGNOSTIC_MESSAGE,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic2.source = KEEP_SORTED_SOURCE;

        diagnostics.set(document.uri, [diagnostic1, diagnostic2]);

        // Act - both diagnostics intersect with range (0, 0, 0, 20)
        const actions = provider.provideCodeActions(document, new vscode.Range(0, 0, 0, 20));

        // Assert
        expect(actions).to.have.length(ACTION_COUNT);
        const blockAction = actions.find(
          (a) => a.title === "Sort all lines in block (keep-sorted)"
        );

        expect(blockAction).to.not.equal(undefined);
      });
    });
  });
});
