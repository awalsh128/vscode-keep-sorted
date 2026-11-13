import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { ChildProcess, spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import * as os from "os";
import * as path from "path";

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
  if (!existsSync(path.join(root, "dist", "extension.js"))) {
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

/** Reads a repository file by its path relative to the repository root. */
export type ReadFile = (relativePath: string) => string;

/** Files whose `vX.Y.Z` versions must name the bundled keep-sorted version. */
export const VERSIONED_DOCS = ["README.md", "docs/SOURCE_CODE.md", "src/keepsortedbin.ts"];

/** Checks that the docs name the keep-sorted version that `create-binaries.ts` builds. */
export function checkBundledVersion(read: ReadFile, docs: string[] = VERSIONED_DOCS): string[] {
  const match = read("scripts/create-binaries.ts").match(/KEEP_SORTED_VERSION = "([^"]+)"/);
  if (!match) {
    return ["scripts/create-binaries.ts: KEEP_SORTED_VERSION not found."];
  }
  const bundled = match[1];
  // Only three-part versions count, so action tags such as `actions/checkout@v6` are ignored.
  return docs.flatMap((doc) =>
    [...read(doc).matchAll(/\bv\d+\.\d+\.\d+\b/g)]
      .filter(([version]) => version !== bundled)
      .map(([version]) => `${doc}: names keep-sorted ${version}, but ${bundled} is bundled.`)
  );
}

/**
 * Gets the `KeepSortedConfiguration` member for a setting: dotted names such as
 * `keep-sorted.wrap.preferences` become camel case (`wrapPreferences`).
 *
 * @param setting The full setting name.
 *
 * @returns The interface member name.
 */
export function interfaceKey(setting: string): string {
  return setting
    .replace(/^keep-sorted\./, "")
    .replace(/\.(\w)/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Checks that the settings in `package.json` match the README settings table, including defaults,
 * and the `KeepSortedConfiguration` interface.
 */
export function checkSettings(read: ReadFile): string[] {
  const manifest = JSON.parse(read("package.json"));
  const properties: Record<string, { default: unknown }> =
    manifest.contributes.configuration.properties;
  // Settings table rows start with "| `keep-sorted.name` | `default` |".
  const readmeDefaults = new Map(
    [...read("README.md").matchAll(/^\| `(keep-sorted\.[\w.]+)`\s*\| `([^`]*)`/gm)].map(
      ([, name, value]) => [name, value]
    )
  );
  // The interface body ends at the first closing brace at the start of a line.
  const configuration = read("src/configuration.ts").match(
    /export interface KeepSortedConfiguration \{([\s\S]*?)\n\}/
  );
  // Member names, including optional ones such as `logFilepath?`.
  const interfaceKeys = new Set(
    [...(configuration?.[1] ?? "").matchAll(/readonly (\w+)\??:/g)].map(([, key]) => key)
  );

  const problems: string[] = [];
  for (const [name, property] of Object.entries(properties)) {
    const expected = JSON.stringify(property.default);
    const documented = readmeDefaults.get(name);
    if (documented === undefined) {
      problems.push(`README.md: setting ${name} is missing from the settings table.`);
    } else if (documented !== expected) {
      problems.push(
        `README.md: ${name} default is ${documented}, but package.json has ${expected}.`
      );
    }
    const key = interfaceKey(name);
    if (!interfaceKeys.has(key)) {
      problems.push(`src/configuration.ts: KeepSortedConfiguration is missing ${key}.`);
    }
  }
  for (const name of readmeDefaults.keys()) {
    if (!(name in properties)) {
      problems.push(`README.md: settings table lists ${name}, which package.json does not define.`);
    }
  }
  const definedKeys = new Set(Object.keys(properties).map(interfaceKey));
  for (const key of interfaceKeys) {
    if (!definedKeys.has(key)) {
      problems.push(
        `src/configuration.ts: KeepSortedConfiguration has ${key}, which package.json does not define.`
      );
    }
  }
  return problems;
}

/**
 * Checks that every command in `package.json` is in the Command Palette menu and that the README
 * names it by ID and title.
 */
export function checkCommands(read: ReadFile): string[] {
  const manifest = JSON.parse(read("package.json"));
  const commands: { command: string; title: string }[] = manifest.contributes.commands;
  const paletteCommands = new Set(
    (manifest.contributes.menus?.commandPalette ?? []).map(
      (entry: { command: string }) => entry.command
    )
  );
  // Wrapped lines would otherwise split titles.
  const readme = read("README.md").replace(/\s+/g, " ");

  const problems: string[] = [];
  for (const { command, title } of commands) {
    if (!paletteCommands.has(command)) {
      problems.push(`package.json: ${command} is missing from menus.commandPalette.`);
    }
    if (!readme.includes(`\`${command}\``)) {
      problems.push(`README.md: command ID ${command} is not documented.`);
    }
    if (!readme.includes(`**${title}**`)) {
      problems.push(`README.md: command title "${title}" is not documented.`);
    }
  }
  for (const command of paletteCommands) {
    if (!commands.some((declared) => declared.command === command)) {
      problems.push(`package.json: menus.commandPalette lists undeclared command ${command}.`);
    }
  }
  return problems;
}

/** The only extension module that reads settings, including editor-owned ones. */
export const SETTINGS_MODULE = "src/configuration.ts";

/**
 * Checks that only `src/configuration.ts` reads settings, so other modules use its accessors
 * instead of duplicating settings access.
 *
 * @param read Reads a repository file.
 * @param sourceFiles Extension source files, relative to the repository root.
 *
 * @returns The problems found.
 */
export function checkSettingsAccess(read: ReadFile, sourceFiles: string[]): string[] {
  return (
    sourceFiles
      // A plain text search also catches calls on aliased imports such as `ws.getConfiguration(`.
      .filter((file) => file !== SETTINGS_MODULE && read(file).includes("getConfiguration("))
      .map(
        (file) =>
          `${file}: reads settings with getConfiguration(); add an accessor to ${SETTINGS_MODULE}.`
      )
  );
}

/**
 * Lists the extension's non-test TypeScript sources, including those in subfolders.
 *
 * @param root The repository root.
 *
 * @returns Paths relative to the repository root.
 */
export function extensionSources(root: string): string[] {
  // Recurse so feature folders such as src/ai are checked; tests are not extension sources.
  return readdirSync(path.join(root, "src"), { recursive: true, encoding: "utf8" })
    .map((name) => name.split(path.sep).join("/"))
    .filter((name) => name.endsWith(".ts") && !name.startsWith("test/"))
    .map((name) => `src/${name}`);
}

/**
 * Runs every consistency check and returns the problems found.
 *
 * @param read Reads a repository file.
 * @param sourceFiles Extension source files to check for settings access.
 *
 * @returns The problems found.
 */
export function checkConsistency(read: ReadFile, sourceFiles: string[] = []): string[] {
  return [
    ...checkBundledVersion(read),
    ...checkSettings(read),
    ...checkCommands(read),
    ...checkSettingsAccess(read, sourceFiles),
  ];
}

/** Runs a command in the repository and throws if it cannot start or fails. */
export type CommandRunner = (command: string, args: string[]) => void;

/**
 * Prepares a fresh clone for development: installs the recommended VS Code extensions and builds
 * the extension. Dependencies must already be installed; `npm run setup` installs them first, which
 * also enables the Git hooks through husky's `prepare` script.
 */
export function setupDev(
  read: ReadFile,
  run: CommandRunner,
  log: (message: string) => void = console.log
): void {
  const { recommendations = [] }: { recommendations?: string[] } = JSON.parse(
    read(".vscode/extensions.json")
  );
  try {
    for (const extension of recommendations) {
      run("code", ["--install-extension", extension]);
    }
    log(`Installed recommended extensions: ${recommendations.join(", ")}.`);
  } catch (error: unknown) {
    log(
      `Could not install extensions with the code CLI (${error}). Install them from the ` +
        `Extensions view instead: ${recommendations.join(", ")}.`
    );
  }

  run("npm", ["run", "compile"]);
  log("Setup complete. Run npm run dev to open the extension in a development window.");
}

if (require.main === module) {
  const root = path.resolve(
    __dirname,
    existsSync(path.join(__dirname, "../package.json")) ? ".." : "../.."
  );
  const read: ReadFile = (relativePath) => readFileSync(path.join(root, relativePath), "utf-8");
  const [command = "launch"] = process.argv.slice(2);
  try {
    if (command === "check") {
      const problems = checkConsistency(read, extensionSources(root));
      problems.forEach((problem) => console.error(problem));
      process.exitCode = problems.length > 0 ? 1 : 0;
    } else if (command === "setup") {
      setupDev(read, (executable, args): void => {
        const result = spawnSync(executable, args, {
          cwd: root,
          stdio: "inherit",
          // npm and code are .cmd shims on Windows.
          shell: process.platform === "win32",
        });
        if (result.error || result.status !== 0) {
          throw result.error ?? new Error(`${executable} exited with ${result.status}`);
        }
      });
    } else if (command === "launch") {
      launchDevelopment(root, {
        download: (): Promise<string> =>
          downloadAndUnzipVSCode({ version: "stable", cachePath: devCachePath() }),
        start: (executable, args, env): ChildProcess =>
          spawn(executable, args, { env, stdio: "inherit" }),
      }).catch((error: unknown): void => {
        console.error("Could not launch development VS Code:", error);
        process.exitCode = 1;
      });
    } else {
      throw new Error(`Unknown command ${command}. Use launch, check, or setup.`);
    }
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
