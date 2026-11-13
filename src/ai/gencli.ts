import * as fs from "fs";
import * as path from "path";
import { staleGeneratedDocs, writeGeneratedDocs } from "./docs";
import { renderManifest } from "./manifest";

/*
 * Command-line entry for `npm run gen:ai` and the `--check` in `npm run check`: regenerates the
 * agent docs and the AI parts of package.json from code. Kept apart from the modules it calls
 * because bundles that include them run as the main module, where a `require.main` guard would
 * fire.
 */

/** The repository root. */
const ROOT = path.resolve(__dirname, "..", "..");

/** The files the CLI generates. */
export interface GeneratedTargets {
  /** The docs/ai directory. */
  readonly docsDir: string;
  /** Package.json. */
  readonly manifestPath: string;
}

/** The repository's generated files. */
export const REPO_TARGETS: GeneratedTargets = {
  docsDir: path.join(ROOT, "docs", "ai"),
  manifestPath: path.join(ROOT, "package.json"),
};

/**
 * Regenerates the docs and manifest, or with `--check` reports stale ones.
 *
 * @param argv The command-line arguments.
 * @param targets The files to generate.
 *
 * @returns The process exit code.
 */
export function runGenerateCli(argv: readonly string[], targets: GeneratedTargets): number {
  const manifest = fs.readFileSync(targets.manifestPath, "utf8");
  const rendered = renderManifest(manifest);
  if (!argv.includes("--check")) {
    writeGeneratedDocs(targets.docsDir);
    fs.writeFileSync(targets.manifestPath, rendered, "utf8");
    return 0;
  }
  const stale = [
    ...staleGeneratedDocs(targets.docsDir).map((file) => `docs/ai/${file}`),
    ...(rendered === manifest ? [] : ["package.json"]),
  ];
  if (stale.length > 0) {
    console.error(`Generated AI files are stale: ${stale.join(", ")}. Run npm run gen:ai.`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = runGenerateCli(process.argv.slice(2), REPO_TARGETS);
}
