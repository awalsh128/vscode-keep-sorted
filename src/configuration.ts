import * as vscode from "vscode";
import { logger } from "./instrumentation";

/**
 * Configuration namespace for the keep-sorted extension.
 */
const configurationSection = "keep-sorted";

/**
 * Configuration settings for the keep-sorted extension.
 */
export interface KeepSortedConfiguration {
  /** Whether the extension is enabled */
  readonly enabled: boolean;
  /** Whether to lint documents on save */
  readonly lintOnSave: boolean;
  /** Whether to lint documents on change (debounced) */
  readonly lintOnChange: boolean;
  /** Logging level for the extension output channel */
  readonly logLevel: string;
}

/**
 * Gets the current keep-sorted configuration from VS Code settings.
 *
 * @returns Configuration object with all keep-sorted settings
 */
export function getConfiguration(): KeepSortedConfiguration {
  const config = vscode.workspace.getConfiguration(configurationSection);
  const configuration = {
    enabled: config.get<boolean>("enabled", true),
    lintOnSave: config.get<boolean>("lintOnSave", true),
    lintOnChange: config.get<boolean>("lintOnChange", true),
    logLevel: config.get<string>("logLevel", "info"),
  };
  logger.info(`Fetched configuration\n ${JSON.stringify(configuration, null, 2)}`);
  return configuration;
}

/**
 * Checks if a configuration change event affects keep-sorted settings.
 *
 * @param event The configuration change event
 * @returns True if the event affects keep-sorted configuration
 */
export function affectsConfiguration(event: vscode.ConfigurationChangeEvent): boolean {
  return event.affectsConfiguration(configurationSection);
}

/**
 * Registers a listener for configuration changes.
 *
 * @param listener Callback invoked when keep-sorted configuration changes
 * @returns Disposable to unregister the listener
 */
export function onDidChangeConfiguration(
  listener: (config: KeepSortedConfiguration) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (affectsConfiguration(event)) {
      listener(getConfiguration());
    }
  });
}
