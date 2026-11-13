import { isRecord } from "../common";
import { MIRRORED_SETTINGS, SETTINGS_SECTION, TOOL_SPECS } from "./tools";
import { wrapPreferencesSchema } from "./wrap";

/*
 * The AI parts of package.json, rendered from code so the manifest has no hand-kept copies:
 * the `keep-sorted.wrap.preferences` schema and the `languageModelTools` contribution.
 */

/** The full name of the wrap preferences setting. */
export const WRAP_PREFERENCES_SETTING = `${SETTINGS_SECTION}.${MIRRORED_SETTINGS.wrapPreferences}`;

/** Hand-written fields of the setting, kept as they are in the manifest. */
const AUTHORED_SETTING_FIELDS = ["default", "order", "markdownDescription", "examples"];

/**
 * Builds the `languageModelTools` contribution from `TOOL_SPECS`.
 *
 * @returns One contribution per tool.
 */
export function languageModelToolsContribution(): Record<string, unknown>[] {
  return TOOL_SPECS.map((spec) => ({
    name: spec.name,
    displayName: spec.displayName,
    toolReferenceName: spec.toolReferenceName,
    canBeReferencedInPrompt: true,
    icon: "$(list-ordered)",
    userDescription: spec.userDescription,
    modelDescription: spec.modelDescription,
    inputSchema: spec.inputSchema,
    tags: ["keep-sorted", "sorting"],
    when: `config.${SETTINGS_SECTION}.enabled`,
  }));
}

/**
 * Renders package.json with its generated AI parts current, keeping everything else.
 *
 * @param current The manifest's text.
 *
 * @returns The manifest's text, formatted as `npm` and Prettier write it.
 *
 * @throws Error when the manifest has no `keep-sorted.wrap.preferences` setting.
 */
export function renderManifest(current: string): string {
  const manifest = JSON.parse(current);
  const properties = manifest.contributes?.configuration?.properties;
  const setting: unknown = properties?.[WRAP_PREFERENCES_SETTING];
  if (!isRecord(setting)) {
    throw new Error(`package.json has no ${WRAP_PREFERENCES_SETTING} setting.`);
  }
  properties[WRAP_PREFERENCES_SETTING] = {
    ...wrapPreferencesSchema(WRAP_PREFERENCES_SETTING),
    ...Object.fromEntries(
      AUTHORED_SETTING_FIELDS.filter((field) => field in setting).map((field) => [
        field,
        setting[field],
      ])
    ),
  };
  manifest.contributes.languageModelTools = languageModelToolsContribution();
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
