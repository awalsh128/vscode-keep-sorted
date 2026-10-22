import { execSync } from "child_process";
import { readFileSync } from "fs";
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

/** Bare module specifiers the bundled extension requires at runtime. */
function bundleRequires(): string[] {
  const bundle = readFileSync(path.join(projectRoot, "dist", "extension.js"), "utf-8");
  return [...bundle.matchAll(/require\("([^".][^"]*)"\)/g)].map((match): string => match[1]);
}

/** Packages the bundled extension still requires at runtime. */
function runtimePackages(): string[] {
  const names = bundleRequires()
    .map(packageName)
    .filter((name): name is string => name !== undefined);
  return [...new Set(names)].sort();
}

/**
 * Guards the published VSIX. Versions 1.0.0 and 1.0.1 shipped without their runtime packages, so
 * the extension could not activate; esbuild now inlines them into dist/extension.js.
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

  it("should leave vscode external to the bundle", (): void => {
    // Act & Assert
    expect(bundleRequires()).to.include("vscode");
  });

  it("should bundle every runtime package", (): void => {
    // Act
    const packages = runtimePackages();

    // Assert
    expect(packages).to.deep.equal([]);
  });

  ["dist/extension.js", "bin/keep-sorted-linux-amd64", "package.json", "LICENSE.md"].forEach(
    (file): void => {
      it(`should include ${file}`, (): void => {
        // Act & Assert
        expect(files).to.include(file);
      });
    }
  );

  [
    "out/",
    "node_modules/",
    "dist/extension.js.map",
    "src/",
    "scripts/",
    "docs/",
    ".claude/",
  ].forEach((prefix): void => {
    it(`should exclude ${prefix}`, (): void => {
      // Act
      const matches = files.filter((file): boolean => file.startsWith(prefix));

      // Assert
      expect(matches).to.deep.equal([]);
    });
  });
});
