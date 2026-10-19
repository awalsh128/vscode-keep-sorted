import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EXT_WORKSPACE_DIR, TEST_WORKSPACE_DIR } from "./testing";
import { runTests } from "@vscode/test-electron";

async function main() {
  // A fresh profile per run avoids restoring editors and backups left by an earlier run, and the
  // Chromium switches keep an unfocused test window from throttling VS Code's idle startup work,
  // which includes installing save participants.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "keep-sorted-test-"));
  try {
    await runTests({
      extensionDevelopmentPath: EXT_WORKSPACE_DIR,
      extensionTestsPath: path.resolve(__dirname, "./suite"),
      launchArgs: [
        `--user-data-dir=${userDataDir}`,
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--log=awalsh128.keep-sorted:trace",
        TEST_WORKSPACE_DIR,
      ],
    });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exitCode = 1;
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main();
