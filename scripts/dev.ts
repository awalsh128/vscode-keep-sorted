import { spawn, ChildProcess } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as os from "os";
import * as path from "path";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";

/** Process boundary for testing the development launcher without opening a window. */
export interface DevLauncher {
  download(): Promise<string>;
  start(executable: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess;
}

/**
 * Settings applied to the development profile on every launch. VS Code has no command-line option
 * for the color theme, and the profile keeps any theme picked in an earlier session.
 */
export const DEV_PROFILE_SETTINGS: Readonly<Record<string, unknown>> = {
  "workbench.colorTheme": "One Dark Pro",
};

/**
 * Merges settings into a profile's user settings, keeping unrelated values. A settings file that is
 * not plain JSON, such as one with comments, is left unchanged.
 */
export function applyProfileSettings(
  userDataDir: string,
  settings: Readonly<Record<string, unknown>>
): void {
  const settingsPath = path.join(userDataDir, "User", "settings.json");
  let current: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      current = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      console.warn(`Could not parse ${settingsPath}; development settings were not applied.`);
      return;
    }
  }
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify({ ...current, ...settings }, null, 4) + "\n");
}

/**
 * Where the development VS Code is downloaded. It must be outside the extension folder: VS Code
 * applies themes found under `--extensionDevelopmentPath` instead of `workbench.colorTheme`, and a
 * copy under the repository's `.vscode-test/` makes every built-in theme look like the
 * extension's.
 */
export function devCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "vscode-keep-sorted");
}

/** Opens the compiled local extension in an isolated VS Code development window. */
export async function launchDevelopment(
  root: string,
  launcher: DevLauncher,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (!existsSync(path.join(root, "out", "extension.js"))) {
    throw new Error("Local build missing. Run npm run dev to compile before launching.");
  }
  const userDataDir = path.join(root, ".vscode-test", "dev-user-data");
  applyProfileSettings(userDataDir, DEV_PROFILE_SETTINGS);
  const executable = await launcher.download();
  const relativeExecutable = path.relative(root, executable);
  if (!relativeExecutable.startsWith("..") && !path.isAbsolute(relativeExecutable)) {
    throw new Error(
      `VS Code at ${executable} is inside the extension folder, so its built-in themes would ` +
        "override workbench.colorTheme. Download it outside the extension folder."
    );
  }
  const childEnv = { ...env };
  // VS Code terminals may set this; Electron must launch as an editor, not as Node.
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = launcher.start(
    executable,
    [
      "--new-window",
      `--extensionDevelopmentPath=${root}`,
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${path.join(root, ".vscode-test", "dev-extensions")}`,
      "--disable-extensions",
      "--log=awalsh128.keep-sorted:debug",
      path.join(root, "test-workspace"),
    ],
    childEnv
  );
  await new Promise<void>((resolve, reject): void => {
    child.once("error", reject);
    child.once("exit", (code, signal): void => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Development VS Code exited with ${code ?? signal}.`));
      }
    });
  });
}

if (require.main === module) {
  const root = path.resolve(
    __dirname,
    existsSync(path.join(__dirname, "../package.json")) ? ".." : "../.."
  );
  launchDevelopment(root, {
    download: (): Promise<string> =>
      downloadAndUnzipVSCode({ version: "stable", cachePath: devCachePath() }),
    start: (executable, args, env): ChildProcess =>
      spawn(executable, args, { env, stdio: "inherit" }),
  }).catch((error: unknown): void => {
    console.error("Could not launch development VS Code:", error);
    process.exitCode = 1;
  });
}
