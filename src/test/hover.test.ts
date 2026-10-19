import { describe, it } from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { KeepSortedHoverProvider } from "../hover";
import { KEEP_SORTED_OPTS } from "../keepsortedopt";

describe("hover", () => {
  const provider = new KeepSortedHoverProvider();
  const token = new vscode.CancellationTokenSource().token;

  /** Returns the hover at the first occurrence of `target` in a one-line document. */
  const hoverAt = async (line: string, target: string, offset = 0) => {
    const document = await vscode.workspace.openTextDocument({ content: line });
    const column = line.indexOf(target) + offset;
    return provider.provideHover(document, new vscode.Position(0, column), token);
  };

  const contents = (hover: vscode.Hover) => (hover.contents[0] as vscode.MarkdownString).value;

  [
    { name: "key", target: "numeric", offset: 2 },
    { name: "value", target: "=yes", offset: 2 },
  ].forEach(({ name, target, offset }) => {
    it(`should show option documentation when hovering the ${name}`, async () => {
      // Arrange
      const line = "// keep-sorted start case=no numeric=yes";

      // Act
      const hover = await hoverAt(line, target, offset);

      // Assert
      expect(contents(hover!)).to.equal(KEEP_SORTED_OPTS.get("numeric")!.documentation);
      const range = hover!.range!;
      expect(line.substring(range.start.character, range.end.character)).to.equal("numeric=yes");
    });
  });

  it("should cover YAML list values containing spaces", async () => {
    // Arrange
    const line = "# keep-sorted start ignore_prefixes=[a, b] case=no";

    // Act
    const hover = await hoverAt(line, " b]", 1);

    // Assert
    expect(contents(hover!)).to.include("**ignore_prefixes**");
  });

  [
    { name: "unknown options", line: "// keep-sorted start bogus=yes", target: "bogus" },
    { name: "regular code", line: "const numeric=yes;", target: "numeric" },
    { name: "end directives", line: "// keep-sorted end numeric=yes", target: "numeric" },
    { name: "the directive keyword", line: "// keep-sorted start numeric=yes", target: "start" },
  ].forEach(({ name, line, target }) => {
    it(`should not show a hover for ${name}`, async () => {
      // Act
      const hover = await hoverAt(line, target, 1);

      // Assert
      expect(hover).to.equal(undefined);
    });
  });

  it("should register for in-scope document schemes", async () => {
    // Arrange
    const registerStub = sinon
      .stub(vscode.languages, "registerHoverProvider")
      .returns({ dispose: sinon.stub() } as unknown as vscode.Disposable);

    try {
      // Act
      await provider.register();

      // Assert
      const [selector, registered] = registerStub.firstCall.args;
      expect(selector).to.deep.equal([{ scheme: "file" }, { scheme: "untitled" }]);
      expect(registered).to.equal(provider);
    } finally {
      registerStub.restore();
    }
  });
});
