#!/usr/bin/env npx tsx
/**
 * Syncs GitHub repository labels from .github/labels.yaml config file.
 *
 * Required environment variables:
 *
 * - GITHUB_TOKEN: GitHub API token with repo permissions
 * - GITHUB_REPOSITORY: Repository in "owner/repo" format
 */

import * as fs from "fs";
import * as yaml from "js-yaml";
import { Octokit } from "@octokit/rest";

interface LabelConfig {
  name: string;
  color: string;
  description?: string;
}

interface LabelsFile {
  labels: LabelConfig[];
}

/** Strips leading '#' from hex color codes. */
export function normalizeColor(color: string): string {
  return color.replace("#", "");
}

/** Reads required environment variable or throws. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Loads label configuration from YAML file. */
export function loadLabelConfig(path: string): LabelConfig[] {
  const content = fs.readFileSync(path, "utf8");
  const config = yaml.load(content) as LabelsFile;
  return config.labels;
}

/** Checks if a label needs updating. */
export function needsUpdate(
  existing: { color: string; description: string | null },
  desired: LabelConfig
): boolean {
  return (
    existing.color !== normalizeColor(desired.color) ||
    existing.description !== (desired.description ?? "")
  );
}

export { LabelConfig };

async function main(): Promise<void> {
  const token = requireEnv("GITHUB_TOKEN");
  const [owner, repo] = requireEnv("GITHUB_REPOSITORY").split("/");

  const octokit = new Octokit({ auth: token });
  const desiredLabels = loadLabelConfig(".github/labels.yaml");

  // Fetch existing labels
  const { data: existingLabels } = await octokit.rest.issues.listLabelsForRepo({
    owner,
    repo,
    per_page: 100,
  });
  const existingByName = new Map(existingLabels.map((label) => [label.name, label]));

  for (const label of desiredLabels) {
    const existing = existingByName.get(label.name);

    if (!existing) {
      console.log(`✨ Creating: ${label.name}`);
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: label.name,
        color: normalizeColor(label.color),
        description: label.description ?? "",
      });
    } else if (needsUpdate(existing, label)) {
      console.log(`🔄 Updating: ${label.name}`);
      await octokit.rest.issues.updateLabel({
        owner,
        repo,
        name: label.name,
        color: normalizeColor(label.color),
        description: label.description ?? "",
      });
    } else {
      console.log(`✓ Up to date: ${label.name}`);
    }
  }

  console.log("\n✅ Label sync complete!");
}

// Only run main() when executed directly (not when imported for testing)
const isDirectRun =
  process.argv[1]?.endsWith("sync-labels.ts") ||
  process.argv[1]?.includes("tsx") ||
  process.argv[1]?.includes("ts-node");

if (isDirectRun && !process.argv[1]?.includes("mocha")) {
  main().catch((error: Error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
  });
}
