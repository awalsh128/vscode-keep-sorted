import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  KeepSortedLanguageModelTool,
  LanguageModelToolsRegistrant,
  toBlockProblems,
  toolInputUri,
  VscodeToolHost,
} from "../../ai/lmtools";
import { TOOL_SPECS, ToolHost, ToolInputError } from "../../ai/tools";
import { SortFileCommandHandler, SortWorkspaceCommandHandler } from "../../commands";
import * as configuration from "../../configuration";
import { KeepSorted } from "../../keepsorted";
import { EditFactory } from "../../workspace";
import { EXT_WORKSPACE_DIR, TEST_WORKSPACE_DIR } from "../testing";

use(chaiAsPromised);

const NO_TOKEN = new vscode.CancellationTokenSource().token;

function textOf(result: vscode.LanguageModelToolResult): string {
  return (result.content[0] as vscode.LanguageModelTextPart).value;
}

describe("lmtools", () => {
  let sandbox: sinon.SinonSandbox;
  let diagnostics: vscode.DiagnosticCollection;
  let host: VscodeToolHost;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    diagnostics = vscode.languages.createDiagnosticCollection(`lmtools-${randomUUID()}`);
    const editFactory = new EditFactory(new KeepSorted(EXT_WORKSPACE_DIR), diagnostics);
    host = new VscodeToolHost(EXT_WORKSPACE_DIR, diagnostics, editFactory, {
      sortFile: new SortFileCommandHandler(diagnostics, editFactory),
      sortWorkspace: new SortWorkspaceCommandHandler(diagnostics, editFactory),
    });
  });

  afterEach(() => {
    diagnostics.dispose();
    sandbox.restore();
  });

  /** Writes a fixture file to the test workspace, which is restored after each test. */
  async function fixture(extension: string, content: string): Promise<vscode.Uri> {
    const uri = vscode.Uri.file(
      path.join(TEST_WORKSPACE_DIR, `lmtools-${randomUUID()}${extension}`)
    );
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
    return uri;
  }

  function tool(name: string, toolHost: ToolHost = host): KeepSortedLanguageModelTool {
    return new KeepSortedLanguageModelTool(
      TOOL_SPECS.find((spec) => spec.name === name)!,
      toolHost
    );
  }

  describe("toolInputUri", () => {
    [
      { input: "file:///work/a.py", root: "/root", expected: "/work/a.py" },
      { input: "/work/a.py", root: undefined, expected: "/work/a.py" },
      { input: "src/a.py", root: "/root", expected: "/root/src/a.py" },
    ].forEach(({ input, root, expected }) => {
      it(`should resolve ${input}`, () => {
        // Act & Assert
        expect(toolInputUri(input, root).fsPath.replace(/\\/g, "/")).to.match(
          new RegExp(`${expected}$`)
        );
      });
    });

    it("should refuse a relative path without a workspace folder", () => {
      // Act & Assert
      expect(() => toolInputUri("a.py", undefined)).to.throw(ToolInputError, /no workspace folder/);
    });
  });

  describe("toBlockProblems", () => {
    it("should convert diagnostic ranges to 1-based block lines", () => {
      // Arrange
      const diagnostic = new vscode.Diagnostic(new vscode.Range(1, 0, 3, 0), "out of order");

      // Act & Assert
      expect(toBlockProblems([diagnostic])).to.deep.equal([
        { startLine: 2, endLine: 3, message: "out of order" },
      ]);
    });
  });

  describe("registration", () => {
    it("should register every tool with VS Code", async () => {
      // Arrange
      const registrant = new LanguageModelToolsRegistrant(host);
      // Activation already registered the real tools, so a second registration is stubbed.
      const register = sandbox
        .stub(vscode.lm, "registerTool")
        .returns(new vscode.Disposable(() => {}));

      // Act
      const disposable = await registrant.register();

      // Assert
      try {
        expect(register.args.map((args) => args[0])).to.deep.equal(TOOL_SPECS.map((s) => s.name));
      } finally {
        disposable.dispose();
      }
    });

    it("should expose the extension's tools to other extensions", () => {
      // Act
      const names = vscode.lm.tools.map((info) => info.name);

      // Assert
      expect(names).to.include.members(TOOL_SPECS.map((spec) => spec.name));
    });
  });

  describe("tools on real documents", () => {
    it("should wrap a Python list, then sort it in the editor buffer", async () => {
      // Arrange
      const uri = await fixture(".py", "DEPS = [\n    'requests',\n    'attrs',\n]\n");
      const input = { uri: uri.toString(), startLine: 2, endLine: 3 };

      // Act
      await tool("keepSorted_wrapRange").invoke(
        { input, toolInvocationToken: undefined },
        NO_TOKEN
      );
      const run = textOf(
        await tool("keepSorted_run").invoke(
          { input: { scope: "file", uri: uri.toString() }, toolInvocationToken: undefined },
          NO_TOKEN
        )
      );

      // Assert
      const document = await vscode.workspace.openTextDocument(uri);
      expect(document.getText()).to.equal(
        "DEPS = [\n    # keep-sorted start\n    'attrs',\n    'requests',\n    # keep-sorted end\n]\n"
      );
      expect(JSON.parse(run)).to.deep.include({ changed: true, remaining: [] });
      expect(diagnostics.get(uri)).to.deep.equal([]);
    });

    it("should use the document's language for comment syntax", async () => {
      // Arrange
      const uri = await fixture(".ts", "const a = [\n  'b',\n  'a',\n];\n");

      // Act
      await tool("keepSorted_wrapRange").invoke(
        {
          input: { uri: uri.toString(), startLine: 2, endLine: 3 },
          toolInvocationToken: undefined,
        },
        NO_TOKEN
      );

      // Assert
      const document = await vscode.workspace.openTextDocument(uri);
      expect(document.lineAt(1).text).to.equal("  // keep-sorted start");
    });

    it("should report bad input as an error message for the model", async () => {
      // Arrange
      const uri = await fixture(".py", "b\na\n");
      const input = { uri: uri.toString(), startLine: 1, endLine: 2, options: { case: "maybe" } };

      // Act & Assert
      await expect(
        tool("keepSorted_wrapRange").invoke({ input, toolInvocationToken: undefined }, NO_TOKEN)
      ).to.be.rejectedWith(Error, /Valid values: yes, no/);
    });

    it("should refuse excluded files", async () => {
      // Arrange
      const uri = await fixture(".py", "b\na\n");
      sandbox.stub(configuration, "excluded").returns(/lmtools-/);

      // Act & Assert
      await expect(host.resolve(uri.toString())).to.be.rejectedWith(
        ToolInputError,
        /excluded by keep-sorted.exclude/
      );
    });
  });

  describe("prepareInvocation", () => {
    [
      { name: "keepSorted_wrapRange", confirms: true },
      { name: "keepSorted_run", confirms: true },
      { name: "keepSorted_getGuide", confirms: false },
    ].forEach(({ name, confirms }) => {
      it(`should ${confirms ? "" : "not "}ask before running ${name}`, () => {
        // Act
        const prepared = tool(name).prepareInvocation({ input: { uri: "a.py", scope: "file" } });

        // Assert
        expect(prepared.confirmationMessages !== undefined).to.equal(confirms);
      });
    });
  });
});
