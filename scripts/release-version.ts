/**
 * Semantic-release plugin that chooses each release's version bump from Conventional Commits and VS
 * Code's pre-release convention: releases use even minor versions (1.0.x, 1.2.x) and pre-releases
 * odd ones (1.1.x, 1.3.x), so the two never collide. It replaces
 * `@semantic-release/commit-analyzer` in the `release` configuration of package.json, and reads
 * `VSCE_PRE_RELEASE` the same way semantic-release-vsce does.
 *
 * | Last version | Run         | Commits             | Bump            |
 * | ------------ | ----------- | ------------------- | --------------- |
 * | even minor   | pre-release | fix or feat         | minor (odd)     |
 * | odd minor    | pre-release | fix or feat         | patch (odd)     |
 * | odd minor    | release     | any, including none | minor (promote) |
 * | even minor   | release     | fix                 | patch           |
 * | any          | release     | breaking            | major           |
 *
 * A feature released directly from an even minor would need to skip an odd minor, and a breaking
 * pre-release would land on an even minor, so both are refused with guidance instead.
 */

/** A semver bump that semantic-release applies to the last version. */
export type ReleaseType = "major" | "minor" | "patch";

/** The parts of semantic-release's analyzeCommits context this plugin reads. */
export interface AnalyzeCommitsContext {
  /** Commits since the last release. */
  commits: readonly { message: string }[];
  /** The last release on the branch; `version` is undefined before the first release. */
  lastRelease: { version?: string };
  /** The process environment of the release. */
  env: NodeJS.ProcessEnv;
  /** Semantic-release's logger. */
  logger: { log(message: string): void };
}

const RANK: Record<ReleaseType, number> = { patch: 1, minor: 2, major: 3 };

/**
 * Determines the bump a single Conventional Commit calls for, following the conventionalcommits
 * preset: breaking changes are major, features minor, and fixes, performance changes, and reverts
 * patch.
 *
 * @param message The full commit message.
 *
 * @returns The bump, or null for commits that do not release, such as `docs:` or `ci:`.
 */
export function commitReleaseType(message: string): ReleaseType | null {
  // `type(scope)!: subject`, where the scope and `!` are optional.
  const header = /^(\w+)(?:\([^)]*\))?(!)?: \S/.exec(message);
  if (!header) {
    return null;
  }
  if (header[2] || /^BREAKING[ -]CHANGE: /m.test(message)) {
    return "major";
  }
  if (header[1] === "feat") {
    return "minor";
  }
  return ["fix", "perf", "revert"].includes(header[1]) ? "patch" : null;
}

/**
 * Determines the largest bump the commits call for.
 *
 * @param messages Commit messages since the last release.
 *
 * @returns The bump, or null when no commit releases.
 */
export function changeType(messages: readonly string[]): ReleaseType | null {
  return messages
    .map(commitReleaseType)
    .reduce<ReleaseType | null>(
      (largest, type) => (type && (!largest || RANK[type] > RANK[largest]) ? type : largest),
      null
    );
}

/**
 * Maps the commits' bump to the bump that keeps releases on even minors and pre-releases on odd
 * minors.
 *
 * @param change The bump the commits call for, or null.
 * @param lastVersion The last released version, or undefined before the first release.
 * @param preRelease Whether this run publishes a pre-release.
 *
 * @returns The bump to apply, or null to release nothing.
 *
 * @throws Error when the commits cannot be released this way.
 */
export function nextReleaseType(
  change: ReleaseType | null,
  lastVersion: string | undefined,
  preRelease: boolean
): ReleaseType | null {
  if (!lastVersion) {
    if (preRelease) {
      throw new Error("Tag the last published version before publishing a pre-release.");
    }
    // semantic-release starts at 1.0.0, an even minor.
    return change;
  }
  const lastIsPreRelease = Number(lastVersion.split(".")[1]) % 2 === 1;
  if (preRelease) {
    if (change === "major") {
      throw new Error(
        "Breaking changes would make the pre-release an even minor version; publish them as a " +
          "release instead."
      );
    }
    // The first pre-release after a release opens the next odd minor; later ones stay on it.
    return change && (lastIsPreRelease ? "patch" : "minor");
  }
  if (change === "major") {
    return "major";
  }
  if (lastIsPreRelease) {
    // Promote the pre-release line to the next even minor, even without new commits.
    return "minor";
  }
  if (change === "minor") {
    throw new Error(
      `Features after ${lastVersion} would skip a minor version; publish them as a pre-release ` +
        "first (pre_release), then release."
    );
  }
  return change;
}

/**
 * Semantic-release's analyzeCommits step.
 *
 * @param _pluginConfig This plugin has no options.
 * @param context The release context.
 *
 * @returns The bump to apply, or null to release nothing.
 */
export async function analyzeCommits(
  _pluginConfig: unknown,
  context: AnalyzeCommitsContext
): Promise<ReleaseType | null> {
  const preRelease = /^(true|1)$/i.test(context.env.VSCE_PRE_RELEASE ?? "");
  const change = changeType(context.commits.map((commit) => commit.message));
  const type = nextReleaseType(change, context.lastRelease.version, preRelease);
  context.logger.log(
    `Commits call for ${change ?? "no release"}; publishing ` +
      `${preRelease ? "a pre-release" : "a release"} with ${type ?? "no"} bump.`
  );
  return type;
}
