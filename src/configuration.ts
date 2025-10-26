import * as vscode from "vscode";
import globRegex from "glob-regex";
import { logger } from "./instrumentation";

/** Configuration namespace for the keep-sorted extension. */
const CONFIGURATION_SECTION = "keep-sorted";

/** Configuration settings for the keep-sorted extension. */
export interface KeepSortedConfiguration {
  /** Whether the extension is enabled */
  readonly enabled: boolean;
  /** Whether to fix documents on save */
  readonly fixOnSave: boolean;
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

/** The internal current keep-sorted configuration with runtime objects as a mutable object. */
let context = loadContext();

/**
 * Gets the keep-sorted configuration matching the latest serialized representation.
 *
 * NOTE: The type is immutable and is thread safe for consecutive gets.
 *
 * @returns The current configuration object
 */
export function getConfig() {
  return context.config;
}

/**
 * Gets the current keep-sorted configuration from VS Code settings.
 *
 * @returns Configuration object with all keep-sorted settings
 */
function loadContext(): Context {
  const config = vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
  const configuration = {
    enabled: config.get<boolean>("enabled", true),
    fixOnSave: config.get<boolean>("fixOnSave", true),
    exclude: config.get<string[]>("exclude", []),
  };

  // Use console during module loading to avoid circular dependency
  logger.info(`Fetched configuration: ${JSON.stringify(configuration, null, 2)}`);
  return { config: configuration, regexs: configuration.exclude.map((p) => globRegex(p)) };
}

/** Determines if the file is excluded from processing. */
export function excluded(uri: vscode.Uri): boolean {
  const filePath = vscode.workspace.asRelativePath(uri);

  for (const regex of context.regexs) {
    if (regex.test(filePath)) {
      logger.info(`Document ${filePath} is excluded by pattern: ${regex.source}`);
      return true;
    }
  }
  return false;
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
