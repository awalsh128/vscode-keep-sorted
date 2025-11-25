import * as path from "path";
import { EXT_WORKSPACE_DIR, TEST_WORKSPACE_DIR } from "./testing";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    await runTests({
      extensionDevelopmentPath: EXT_WORKSPACE_DIR,
      extensionTestsPath: path.resolve(__dirname, "./suite"),
      launchArgs: ["--log=awalsh128.keep-sorted:trace", TEST_WORKSPACE_DIR],
    });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
