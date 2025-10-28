import * as vscode from "vscode";
import globRegex from "glob-regex";
import * as path from "path";
import { logger } from "./instrumentation";

/** Configuration namespace for the Keep Sorted extension. */
const CONFIGURATION_SECTION = "keep-sorted";

/** Configuration settings for the Keep Sorted extension. */
export interface KeepSortedConfiguration {
  /** Whether the extension is enabled */
  readonly enabled: boolean;
  /**
   * Regular expressions for files to ignore such as auto generated files, temporary files, and
   * other files that should not be processed by the extension
   */
  readonly exclude: string[];
}

interface Context {
  config: KeepSortedConfiguration;
  regexs: RegExp[];
}

/** The internal current Keep Sorted configuration with runtime objects as a mutable object. */
let context = loadContext();

/**
 * Gets the Keep Sorted configuration matching the latest serialized representation.
 *
 * NOTE: The type is immutable and is thread safe for consecutive gets.
 *
 * @returns The current configuration object
 */
export function getConfig() {
  return context.config;
}

/**
 * Gets the current Keep Sorted configuration from VS Code settings.
 *
 * @returns Configuration object with all Keep Sorted settings
 */
function loadContext(): Context {
  const config = vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
  const configuration: KeepSortedConfiguration = {
    enabled: config.get<boolean>("enabled", true),
    exclude: config.get<string[]>("exclude", []),
  };

  // Use console during module loading to avoid circular dependency
  logger.info(`Fetched configuration: ${JSON.stringify(configuration, null, 2)}`);
  // Build regex objects from configured patterns. Prefer direct RegExp construction for
  // patterns that are already valid regex literals (tests use strings like ".*\\.test\\.ts$")
  const regexs = configuration.exclude.map((p) => {
    try {
      return new RegExp(p);
    } catch {
      // Fall back to glob-regex for glob-style patterns
      return globRegex(p);
    }
  });

  return { config: configuration, regexs };
}

/**
 * Determines if the file is excluded from processing and returns the regexp matched or null if not
 * match is found.
 */
export function excluded(uri: vscode.Uri): RegExp | null {
  const filePath = vscode.workspace.asRelativePath(uri);
  const fullPath = uri.fsPath;
  const baseName = path.basename(fullPath);

  for (const regex of context.regexs) {
    if (regex.test(filePath) || regex.test(fullPath) || regex.test(baseName)) {
      logger.info(`Document ${filePath} is excluded by pattern: ${regex.source}`);
      return regex;
    }
  }
  return null;
}

/**
 * Event handler for configuration changes and reloads this specific configuration if changed from
 * the serialized form.
 *
 * @param event The configuration change event.
 *
 * @returns True if the configuration was reloaded, otherwise false.
 */
export function onConfigurationChange(event: vscode.ConfigurationChangeEvent): boolean {
  if (event.affectsConfiguration(CONFIGURATION_SECTION)) {
    context = loadContext();
    return true;
  }
  return false;
}
