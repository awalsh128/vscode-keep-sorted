import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Run the tests. Avoid importing the extension's runtime modules here because they
    // reference `vscode` and would fail when this script runs in plain Node before the
    // test host is launched. Use the well-known extension name directly for logging.
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [`--log=awalsh128.keep-sorted:debug`],
    });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
