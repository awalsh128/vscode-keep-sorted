import * as path from "path";
import * as fs from "fs";

export const EXT_WORKSPACE_DIR = path.resolve(__dirname, "../../");
export const TEST_WORKSPACE_DIR = path.resolve(__dirname, "../../test-workspace");
export const TEST_LOGS_DIR = path.resolve(EXT_WORKSPACE_DIR, "src/test/logs");

export const logFilepath = (function () {
  // deserialize test workspace .vscode/settings.json and export relevant settings as env vars
  const settingsPath = path.resolve(TEST_WORKSPACE_DIR, ".vscode", "settings.json");
  if (!fs.existsSync(settingsPath)) {
    throw new Error("No test workspace settings.json found at " + settingsPath);
  }
  try {
    const raw = fs.readFileSync(settingsPath, { encoding: "utf8" });
    const settings = JSON.parse(raw);
    const relativeLogFilepath = settings?.["keep-sorted.logFilepath"];
    if (!relativeLogFilepath) {
      throw new Error("keep-sorted.logFilepath setting not found in test workspace settings.json");
    }
    return path.join(TEST_WORKSPACE_DIR, relativeLogFilepath);
  } catch (err) {
    console.warn("Failed to read/parse test workspace settings.json:", err);
    throw err;
  }
})();

export function testLogFilepath(rawTitle: string | null): string {
  const fileSuffix = (rawTitle ?? "unknown_test").replace(/[^A-Za-z0-9-]/g, "_");
  return path.join(TEST_LOGS_DIR, `${fileSuffix}.log`);
}

export function ifExists(filepath: string, execute: () => void) {
  if (fs.existsSync(filepath)) {
    execute();
  }
}

export function rotateTestLogs(currentTest: Mocha.Test | undefined): void {
  try {
    const testFilePath = testLogFilepath(currentTest?.fullTitle() ?? null);

    const testDirpath = path.dirname(testFilePath);
    ifExists(testDirpath, () => fs.mkdirSync(testDirpath, { recursive: true }));

    ifExists(testFilePath, () => fs.rmSync(testFilePath, { force: true }));
    ifExists(logFilepath, () =>
      fs.writeFileSync(testFilePath, fs.readFileSync(logFilepath, "utf-8"), "utf-8")
    );
    fs.writeFileSync(logFilepath, "", "utf-8");
  } catch (err) {
    console.warn("Failed to rotate test logs", err);
  }
}
