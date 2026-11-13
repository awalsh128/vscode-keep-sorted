import { expect } from "chai";
import * as fs from "fs";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as os from "os";
import * as path from "path";
import { GeneratedTargets, REPO_TARGETS, runGenerateCli } from "../../ai/gencli";
import { EXT_WORKSPACE_DIR } from "../testing";

describe("aigencli", () => {
  it("should point at the repository's generated files", () => {
    // Act & Assert
    expect(REPO_TARGETS).to.deep.equal({
      docsDir: path.join(EXT_WORKSPACE_DIR, "docs", "ai"),
      manifestPath: path.join(EXT_WORKSPACE_DIR, "package.json"),
    });
  });

  it("should pass the check for the repository", () => {
    // Act & Assert
    expect(runGenerateCli(["--check"], REPO_TARGETS)).to.equal(0);
  });

  describe("with a copy", () => {
    let copy: GeneratedTargets;

    beforeEach(() => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-gen-"));
      copy = { docsDir: path.join(dir, "docs"), manifestPath: path.join(dir, "package.json") };
      fs.cpSync(REPO_TARGETS.docsDir, copy.docsDir, { recursive: true });
      fs.copyFileSync(REPO_TARGETS.manifestPath, copy.manifestPath);
    });

    afterEach(() => {
      fs.rmSync(path.dirname(copy.manifestPath), { recursive: true, force: true });
    });

    [
      {
        name: "a stale doc",
        stale: (): void => fs.writeFileSync(path.join(copy.docsDir, "options.md"), "stale\n"),
      },
      {
        name: "a stale manifest",
        stale: (): void => {
          const manifest = JSON.parse(fs.readFileSync(copy.manifestPath, "utf8"));
          manifest.contributes.languageModelTools = [];
          fs.writeFileSync(copy.manifestPath, JSON.stringify(manifest, null, 2));
        },
      },
    ].forEach(({ name, stale }) => {
      it(`should fail the check for ${name}, then pass once regenerated`, () => {
        // Arrange
        stale();

        // Act
        const before = runGenerateCli(["--check"], copy);
        runGenerateCli([], copy);
        const after = runGenerateCli(["--check"], copy);

        // Assert
        expect([before, after]).to.deep.equal([1, 0]);
      });
    });
  });
});
