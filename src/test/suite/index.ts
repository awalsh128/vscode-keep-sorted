import * as path from "path";
import * as Mocha from "mocha";
import * as vscode from "vscode";
import {
  TestLogs,
  TEST_LOGS_DIR as TEST_OUTPUT_LOGS_DIR,
  TestWorkspace,
  TEST_WORKSPACE_DIR,
} from "../testing";
import { sync as globSync } from "glob";

export function run(): Promise<void> {
  // Allow `any` here because Mocha types and our usage are compatible at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mocha = new (Mocha as any)({ ui: "bdd", color: true, timeout: 20000 });
  const testsRoot = path.resolve(__dirname, "..");

  // Support filtering tests via MOCHA_GREP environment variable
  const grep = process.env.MOCHA_GREP;
  if (grep) {
    mocha.grep(grep);
  }

  const workspace = TestWorkspace.createWithSnapshot(TEST_WORKSPACE_DIR, ["log/keep-sorted.log"]);
  const logs = TestLogs.create(TEST_OUTPUT_LOGS_DIR, TEST_WORKSPACE_DIR);
  console.info("Test logs writing to directory: ", TEST_OUTPUT_LOGS_DIR);

  // Close all open text documents before each test to ensure clean state
  mocha.suite.beforeEach(async function () {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  mocha.suite.afterEach(async function (this: Mocha.Context) {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    logs.rotate(this.currentTest);
    await workspace.restore();
  });

  return new Promise((resolve, reject) => {
    try {
      const files = globSync("**/**.test.js", { cwd: testsRoot });
      files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}
