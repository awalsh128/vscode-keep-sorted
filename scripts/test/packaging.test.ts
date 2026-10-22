import { execSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { builtinModules } from "module";
import * as path from "path";
import { expect } from "chai";
import { before, describe, it } from "mocha";

const projectRoot = process.cwd();
const builtins = new Set(builtinModules);

/** Returns the package name of a bare module specifier, or undefined for builtins and vscode. */
function packageName(specifier: string): string | undefined {
  const name = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
  return builtins.has(name.replace(/^node:/, "")) || name === "vscode" ? undefined : name;
}

/** Packages required by the compiled extension, excluding its tests. */
function runtimePackages(): string[] {
  const outDir = path.join(projectRoot, "out");
  const names = readdirSync(outDir)
    .filter((file): boolean => file.endsWith(".js"))
    .flatMap((file): string[] =>
      [
        ...readFileSync(path.join(outDir, file), "utf-8").matchAll(/require\("([^".][^"]*)"\)/g),
      ].map((match): string => match[1])
    )
    .map(packageName)
    .filter((name): name is string => name !== undefined);
  return [...new Set(names)].sort();
}

/**
 * Guards the published VSIX. Versions 1.0.0 and 1.0.1 shipped without node_modules, so the
 * extension could not activate and no feature worked.
 */
describe("extension package", (): void => {
  let files: string[];

  before(function (): void {
    this.timeout(60000);
    // `vsce ls` applies .vscodeignore and the production dependency tree without packaging.
    files = execSync("npx --no-install vsce ls", { cwd: projectRoot, encoding: "utf-8" })
      .trim()
      .split(/\r?\n/);
  });

  it("should find runtime packages in the compiled extension", (): void => {
    // Act
    const packages = runtimePackages();

    // Assert
    expect(packages).to.include("winston");
  });

  it("should include every package the compiled extension requires", (): void => {
    // Arrange
    const required = runtimePackages().map((name): string => `node_modules/${name}/package.json`);

    // Act & Assert
    expect(files).to.include.members(required);
  });

  ["out/extension.js", "bin/keep-sorted-linux-amd64", "package.json", "LICENSE.md"].forEach(
    (file): void => {
      it(`should include ${file}`, (): void => {
        // Act & Assert
        expect(files).to.include(file);
      });
    }
  );

  [
    "out/test/",
    "out/scripts/",
    "src/",
    "scripts/",
    "docs/",
    ".claude/",
    "node_modules/mocha/",
  ].forEach((prefix): void => {
    it(`should exclude ${prefix}`, (): void => {
      // Act
      const matches = files.filter((file): boolean => file.startsWith(prefix));

      // Assert
      expect(matches).to.deep.equal([]);
    });
  });
});
