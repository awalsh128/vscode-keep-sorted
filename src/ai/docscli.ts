import * as path from "path";
import { runAiDocsCli } from "./docs";

/*
 * Command-line entry for `npm run gen:ai-docs` and the `--check` in `npm run check`. Kept apart
 * from aidocs.ts because bundles that include aidocs.ts run as the main module, where a
 * `require.main` guard would fire.
 */

/** The repository's docs/ai directory. */
export const DOCS_DIR = path.resolve(__dirname, "..", "..", "docs", "ai");

if (require.main === module) {
  process.exitCode = runAiDocsCli(process.argv.slice(2), DOCS_DIR);
}
