import * as fs from "fs";
import * as path from "path";
import { ifExists, logFilepath, EXT_WORKSPACE_DIR, TEST_WORKSPACE_DIR } from "./testing";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    ifExists(logFilepath, () => fs.rmSync(logFilepath, { force: true }));
    await runTests({
      extensionDevelopmentPath: EXT_WORKSPACE_DIR,
      extensionTestsPath: path.resolve(__dirname, "./suite/index"),
      launchArgs: [TEST_WORKSPACE_DIR, "--log", "awalsh128.keep-sorted:debug"],
    });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
