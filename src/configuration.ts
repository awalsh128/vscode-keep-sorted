import globRegex from "glob-regex";
import * as path from "path";
import * as vscode from "vscode";
import { parseWrapPreferences, WrapPreferences } from "./ai/wrap";
import { extensionId, logger } from "./instrumentation";
import { toJson } from "./workspace";

/** Configuration settings for the Keep Sorted extension. */
export interface KeepSortedConfiguration {
  /** Whether the extension is enabled */
  readonly enabled: boolean;

  /** Whether autocomplete suggestions are enabled */
  readonly autoComplete: boolean;

  /**
   * Regular expressions for files to ignore such as auto generated files, temporary files, and
   * other files that should not be processed by the extension
   */
  readonly exclude: string[];

  /**
   * Optional. File path for logging output
   *
   * If specified, logs will be written to the specified location relative to workspace root.
   */
  readonly logFilepath?: string;

  /**
   * Default options for blocks that AI tools wrap (`keep-sorted.wrap.preferences`), merged across
   * user and workspace settings by VS Code. Malformed parts are dropped; see
   * `wrapPreferencesProblems()`.
   */
  readonly wrapPreferences: WrapPreferences;
}

interface Context {
  config: KeepSortedConfiguration;
  regexs: RegExp[];
  wrapPreferencesProblems: string[];
}

/**
 * The internal current Keep Sorted configuration with runtime objects as a mutable object. Loaded
 * on first use because `extensionId` is unassigned while the instrumentation import cycle loads.
 */
let context: Context | undefined;

/** Returns the current context, loading it on first use. */
function currentContext(): Context {
  context ??= loadContext();
  return context;
}

/**
 * Gets the Keep Sorted configuration matching the latest serialized representation.
 *
 * NOTE: The type is immutable and is thread safe for consecutive gets.
 *
 * @returns The current configuration object
 */
export function getConfig() {
  return currentContext().config;
}

/**
 * Gets the current Keep Sorted configuration from VS Code settings.
 *
 * @returns Configuration object with all Keep Sorted settings
 */
function loadContext(): Context {
  const config = vscode.workspace.getConfiguration(extensionId.name);

  function getValue<T>(key: string): T {
    const meta = config.inspect<T>(key);
    if (!meta) {
      throw new Error(
        `${extensionId.name} option "${key}" is not a valid configuration setting. This should not happen and is a bug in the extension.`
      );
    }
    if (meta.defaultValue === undefined) {
      throw new Error(
        `${extensionId.name} option "${key}" does not have a default value. This should not happen and is a bug in the extension.`
      );
    }
    return config.get<T>(key, meta.defaultValue);
  }

  const enabled = getValue<boolean>("enabled");
  const autoComplete = getValue<boolean>("autoComplete");
  const exclude = getValue<string[]>("exclude");
  const logFilepath = getValue<string | undefined>("logFilepath");
  const wrapPreferences = parseWrapPreferences(getValue<unknown>("wrap.preferences"));
  if (wrapPreferences.problems.length > 0) {
    logger.warn(`Ignoring invalid wrap preferences: ${wrapPreferences.problems.join(" ")}`);
  }
  const configuration: KeepSortedConfiguration = {
    enabled,
    autoComplete,
    exclude,
    logFilepath,
    wrapPreferences: wrapPreferences.preferences,
  };

  // Use console during module loading to avoid circular dependency
  logger.info(`Fetched configuration: ${toJson(configuration)}`);
  // Build regex objects from configured patterns. Prefer direct RegExp construction for
  // patterns that are already valid regex literals (tests use strings like ".*\\.test\\.ts$")
  const regexs = configuration.exclude.map((p) => {
    try {
      return new RegExp(p);
    } catch (regexErr) {
      try {
        // Fall back to glob-regex for glob-style patterns
        return globRegex(p);
      } catch (globErr) {
        logger.warn(`Invalid exclusion pattern "${p}": RegExp: ${regexErr}, Glob: ${globErr}`);
        // Return a pattern that matches nothing
        return /(?!.*)/;
      }
    }
  });

  return { config: configuration, regexs, wrapPreferencesProblems: wrapPreferences.problems };
}

/**
 * Gets the problems found in `keep-sorted.wrap.preferences`, so tools can report why a preference
 * was not applied.
 *
 * @returns The problems, empty when the setting is valid.
 */
export function wrapPreferencesProblems(): readonly string[] {
  return currentContext().wrapPreferencesProblems;
}

/**
 * Gets the user-level `keep-sorted.wrap.preferences` alone, without workspace values. The MCP
 * server runs outside VS Code and reads workspace settings from disk itself, so the extension
 * mirrors only this scope for it.
 *
 * @returns The raw user-level value, or undefined when unset.
 */
export function userWrapPreferences(): unknown {
  return vscode.workspace.getConfiguration(extensionId.name).inspect("wrap.preferences")
    ?.globalValue;
}

/**
 * Determines if the file is excluded from processing and returns the regexp matched or null if not
 * match is found.
 */
export function excluded(uri: vscode.Uri): RegExp | null {
  const filePath = vscode.workspace.asRelativePath(uri);
  const fullPath = uri.fsPath;
  const baseName = path.basename(fullPath);

  for (const regex of currentContext().regexs) {
    if (regex.test(filePath) || regex.test(fullPath) || regex.test(baseName)) {
      return regex;
    }
  }
  return null;
}

/**
 * Builds a `findFiles` exclude glob from `files.exclude` and `search.exclude`. Passing an exclude
 * to `findFiles` replaces its default of `files.exclude`, and `search.exclude` is what skips
 * `node_modules` by default. Patterns with one brace group are expanded so they can join the union;
 * patterns with conditions or nested braces are left out.
 */
export function scanExcludeGlob(
  ...settings: (Record<string, unknown> | undefined)[]
): string | undefined {
  const patterns = new Set<string>();
  for (const [pattern, enabled] of settings.flatMap((s) => Object.entries(s ?? {}))) {
    // `false` turns a pattern off; `{ when: ... }` conditions depend on sibling files.
    if (enabled !== true) {
      continue;
    }
    // Split `prefix{a,b}suffix` into prefix, choices, and suffix.
    const group = pattern.match(/^([^{}]*)\{([^{}]*)\}([^{}]*)$/);
    if (group) {
      group[2].split(",").forEach((choice) => patterns.add(`${group[1]}${choice}${group[3]}`));
    } else if (!/[{}]/.test(pattern)) {
      // Nested or multiple brace groups cannot be placed inside the union below.
      patterns.add(pattern);
    }
  }
  // findFiles takes one exclude glob, so join the patterns as `{a,b,c}` alternatives.
  return patterns.size > 0 ? `{${[...patterns].join(",")}}` : undefined;
}

/**
 * Gets the exclude glob for the workspace scan from VS Code's `files.exclude` and `search.exclude`.
 * Passing an exclude to `findFiles` replaces its default of `files.exclude`, and `search.exclude`
 * is what skips `node_modules` by default. Both settings are editor-owned, so they are read here
 * but are not part of `KeepSortedConfiguration`.
 *
 * @returns The exclude glob, or undefined when no patterns apply.
 */
export function scanExclude(): string | undefined {
  return scanExcludeGlob(
    vscode.workspace.getConfiguration("files").get("exclude"),
    vscode.workspace.getConfiguration("search").get("exclude")
  );
}

/**
 * Event handler for configuration changes and reloads this specific configuration if changed from
 * the serialized form.
 *
 * @param event The configuration change event.
 *
 * @returns True if the configuration was reloaded, otherwise false.
 */
export function handleConfigurationChange(event: vscode.ConfigurationChangeEvent): boolean {
  if (!event.affectsConfiguration(extensionId.name)) {
    return false;
  }

  const previous = currentContext().config;

  context = loadContext();
  if (context.config.enabled !== previous.enabled) {
    onEnabledChangeEmitter.fire(context.config.enabled);
  }
  if (context.config.autoComplete !== previous.autoComplete) {
    onAutoCompleteChangeEmitter.fire(context.config.autoComplete);
  }
  if (context.config.logFilepath !== previous.logFilepath) {
    onLogFilepathChangeEmitter.fire(context.config.logFilepath);
  }
  // Compare arrays by value; unlike join(","), JSON keeps patterns containing commas distinct.
  if (JSON.stringify(context.config.exclude) !== JSON.stringify(previous.exclude)) {
    onExcludeChangeEmitter.fire(context.config.exclude);
  }
  // Also fires for user-scope changes the merged value hides, since the MCP mirror needs them.
  if (event.affectsConfiguration(`${extensionId.name}.wrap.preferences`)) {
    onWrapPreferencesChangeEmitter.fire(context.config.wrapPreferences);
  }
  return true;
}

const onEnabledChangeEmitter = new vscode.EventEmitter<boolean>();

/** Event triggered when the enabled state changes. */
export const onEnabledChange: vscode.Event<boolean> = onEnabledChangeEmitter.event;

const onLogFilepathChangeEmitter = new vscode.EventEmitter<string | undefined>();

/** Event triggered when the log filepath changes. */
export const onLogFilepathChange: vscode.Event<string | undefined> =
  onLogFilepathChangeEmitter.event;

export const onAutoCompleteChangeEmitter = new vscode.EventEmitter<boolean>();

/** Event triggered when the autocomplete state changes. */
export const onAutoCompleteChange: vscode.Event<boolean> = onAutoCompleteChangeEmitter.event;

const onExcludeChangeEmitter = new vscode.EventEmitter<string[]>();

/** Event triggered when the exclusion patterns change. */
export const onExcludeChange: vscode.Event<string[]> = onExcludeChangeEmitter.event;

const onWrapPreferencesChangeEmitter = new vscode.EventEmitter<WrapPreferences>();

/** Event triggered when the wrap preferences change in any scope. */
export const onWrapPreferencesChange: vscode.Event<WrapPreferences> =
  onWrapPreferencesChangeEmitter.event;
