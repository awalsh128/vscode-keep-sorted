#!/usr/bin/env npx tsx
/**
 * Release operations for the Visual Studio Marketplace and Open VSX: listing published versions,
 * publishing the package.json version, deleting old versions, and preparing deprecation requests.
 *
 * Environment variables (only `publish` and `delete-versions --yes` need them):
 *
 * - VSCE_PAT: Visual Studio Marketplace personal access token. Without it, `publish` in GitHub
 *   Actions uses Marketplace trusted publishing (`vsce publish --oidc`) instead.
 * - OVSX_PAT: Open VSX access token
 */

import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import * as path from "path";
import { parseArgs } from "util";
import { GalleryApi } from "azure-devops-node-api/GalleryApi";
import { getBasicHandler } from "azure-devops-node-api/WebApi";

/** Identity and version of the extension, read from package.json. */
export interface ExtensionManifest {
  publisher: string;
  name: string;
  version: string;
}

/** A registry the extension is published to. */
export interface Registry {
  readonly name: string;
  /** Returns the published versions in any order, or none when the extension is unpublished. */
  listVersions(): Promise<string[]>;
  publish(vsixPath: string): Promise<void>;
  /** Permanently deletes one version. Its number can never be published again. */
  deleteVersion(version: string): Promise<void>;
}

/** Process and output boundaries of the operations, replaced in tests. */
export interface OpsContext {
  manifest: ExtensionManifest;
  registries: readonly Registry[];
  /** Packages the extension and returns the VSIX path. */
  packageVsix(preRelease: boolean): Promise<string>;
  log(message: string): void;
}

/** Runs a command with inherited output and rejects when it fails. */
export type CommandRunner = (command: string, args: readonly string[]) => Promise<void>;

export const usage = `Usage: npm run ops -- <command> [options]

Commands:
  list                              Show the versions published to each registry.
  publish [--dry-run] [--pre-release]
                                    Package the package.json version and publish it to every
                                    registry that does not have it yet.
  delete-versions <version...> [--yes]
  delete-versions --before <version> [--yes]
                                    Permanently delete old versions. Without --yes, only shows
                                    what would be deleted.
  deprecate [--replacement <publisher.extension> | --setting <setting.id>] [--reason <text>]
                                    Print deprecation requests to submit to each registry.`;

/** Options each command accepts; `--help` works with any of them. */
const commandOptions: Readonly<Record<string, readonly string[]>> = {
  list: ["help"],
  publish: ["dry-run", "pre-release", "help"],
  "delete-versions": ["before", "yes", "help"],
  deprecate: ["replacement", "setting", "reason", "help"],
};

const marketplaceDiscussionUrl = "https://github.com/microsoft/vscode-discussions/discussions/1";
const openVsxIssueUrl = "https://github.com/EclipseFdn/open-vsx.org/issues/new";
const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

/** Throws unless the version is a plain `major.minor.patch` version, as VS Code requires. */
export function parseVersion(version: string): [number, number, number] {
  const match = versionPattern.exec(version);
  if (!match) {
    throw new Error(`Invalid version "${version}"; expected major.minor.patch.`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Orders versions numerically; negative when `a` is older than `b`. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

/** Returns unique versions, newest first. */
export function sortVersionsDescending(versions: readonly string[]): string[] {
  return [...new Set(versions)].sort((a, b): number => compareVersions(b, a));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Logs the versions published to each registry, newest first. */
export async function listVersions(ctx: OpsContext): Promise<void> {
  for (const registry of ctx.registries) {
    const versions = sortVersionsDescending(await registry.listVersions());
    ctx.log(`${registry.name}: ${versions.length > 0 ? versions.join(", ") : "not published"}`);
  }
}

/** Options for {@link publishVersion}. */
export interface PublishOptions {
  dryRun: boolean;
  preRelease: boolean;
}

/**
 * Packages the package.json version once and publishes that VSIX to every registry missing it.
 * Rerunning after a partial failure only publishes to the registries that still need it.
 */
export async function publishVersion(ctx: OpsContext, options: PublishOptions): Promise<void> {
  const { version } = ctx.manifest;
  const pending: Registry[] = [];
  for (const registry of ctx.registries) {
    if ((await registry.listVersions()).includes(version)) {
      ctx.log(`${registry.name} already has ${version}; skipping it.`);
    } else {
      pending.push(registry);
    }
  }
  // Package even when nothing is pending so the workflow can always upload the VSIX.
  const vsixPath = await ctx.packageVsix(options.preRelease);
  if (options.dryRun) {
    const targets = pending.map((registry): string => registry.name).join(", ") || "no registry";
    ctx.log(`Dry run: packaged ${vsixPath}; would publish ${version} to ${targets}.`);
    return;
  }
  // One registry failing should not stop the other from getting the release.
  const failures: string[] = [];
  for (const registry of pending) {
    try {
      await registry.publish(vsixPath);
      ctx.log(`Published ${version} to ${registry.name}.`);
    } catch (error) {
      failures.push(`${registry.name}: ${errorMessage(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Publishing ${version} failed. ${failures.join(" ")}`);
  }
}

/** Options for {@link deleteVersions}; pass either `versions` or `before`. */
export interface DeleteOptions {
  versions: readonly string[];
  before?: string;
  confirm: boolean;
}

/**
 * Permanently deletes versions from every registry that has them. Refuses the package.json version
 * and each registry's latest version so users can always install the current release. Without
 * `confirm`, only logs the plan.
 */
export async function deleteVersions(ctx: OpsContext, options: DeleteOptions): Promise<void> {
  if (options.versions.length > 0 === (options.before !== undefined)) {
    throw new Error("Pass the versions to delete or --before <version>, but not both.");
  }
  [...options.versions, ...(options.before ? [options.before] : [])].forEach(parseVersion);

  const plans: { registry: Registry; versions: string[] }[] = [];
  const found = new Set<string>();
  for (const registry of ctx.registries) {
    const published = sortVersionsDescending(await registry.listVersions());
    const before = options.before;
    const selected = before
      ? published.filter((version): boolean => compareVersions(version, before) < 0)
      : sortVersionsDescending(options.versions).filter((v): boolean => published.includes(v));
    const kept = new Set([ctx.manifest.version, ...published.slice(0, 1)]);
    const refused = selected.filter((version): boolean => kept.has(version));
    if (refused.length > 0) {
      throw new Error(
        `Refusing to delete ${refused.join(", ")} from ${registry.name}: the latest published ` +
          "version and the package.json version must stay installable. Nothing was deleted."
      );
    }
    selected.forEach((version): Set<string> => found.add(version));
    plans.push({ registry, versions: selected });
  }

  const missing = options.versions.filter((version): boolean => !found.has(version));
  if (missing.length > 0) {
    ctx.log(`Not published to any registry: ${missing.join(", ")}.`);
  }
  if (found.size === 0) {
    ctx.log("Nothing to delete.");
    return;
  }
  for (const { registry, versions } of plans) {
    ctx.log(`${registry.name}: ${versions.length > 0 ? versions.join(", ") : "nothing to delete"}`);
  }
  if (!options.confirm) {
    ctx.log(
      "Dry run: deleting is permanent and the version numbers can never be reused. " +
        "Rerun with --yes to delete."
    );
    return;
  }

  const failures: string[] = [];
  for (const { registry, versions } of plans) {
    for (const version of versions) {
      try {
        await registry.deleteVersion(version);
        ctx.log(`Deleted ${version} from ${registry.name}.`);
      } catch (error) {
        failures.push(`${registry.name} ${version}: ${errorMessage(error)}`);
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Some versions were not deleted. ${failures.join(" ")}`);
  }
}

/** Options for {@link deprecationRequests}; `replacement` and `setting` are exclusive. */
export interface DeprecateOptions {
  replacement?: string;
  setting?: string;
  reason?: string;
}

/**
 * Returns the deprecation requests to submit by hand, because neither registry has an API for
 * deprecation.
 */
export function deprecationRequests(
  manifest: ExtensionManifest,
  options: DeprecateOptions
): string {
  if (options.replacement && options.setting) {
    throw new Error("Pass --replacement or --setting, not both.");
  }
  const id = `${manifest.publisher}.${manifest.name}`;
  const inFavorOf = options.replacement
    ? ` in favor of the \`${options.replacement}\` extension`
    : options.setting
      ? ` in favor of the \`${options.setting}\` setting`
      : "";
  const reason = options.reason ? `\nReason: ${options.reason}` : "";
  const openVsxDetails = [
    ...(options.replacement ? [`- **Replacement:** \`${options.replacement}\``] : []),
    ...(options.setting ? [`- **Replacement setting:** \`${options.setting}\``] : []),
    `- **Namespace:** \`${manifest.publisher}\``,
    ...(options.reason ? [`- **Reason:** ${options.reason}`] : []),
  ].join("\n");
  return [
    `Visual Studio Marketplace: comment on ${marketplaceDiscussionUrl}`,
    "",
    `Please mark \`${id}\` as deprecated${inFavorOf}.${reason}`,
    "",
    `Open VSX: open an issue at ${openVsxIssueUrl}`,
    "",
    `Title: Deprecate extension ${id}${options.replacement ? ` in favor of ${options.replacement}` : ""}`,
    "",
    `Please mark \`${id}\` as deprecated on Open VSX.`,
    openVsxDetails,
    "",
    "Nothing was submitted. Deprecation does not uninstall or migrate installed copies.",
  ].join("\n");
}

/** Parses command-line arguments and runs one operation. */
export async function main(argv: readonly string[], ctx: OpsContext): Promise<void> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      "pre-release": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      before: { type: "string" },
      replacement: { type: "string" },
      setting: { type: "string" },
      reason: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help) {
    ctx.log(usage);
    return;
  }
  if (command !== "delete-versions" && args.length > 0) {
    throw new Error(`Unexpected arguments: ${args.join(" ")}\n\n${usage}`);
  }
  // Reject options meant for another command, e.g. --yes on publish, rather than ignore them.
  const passed = argv.filter((arg): boolean => arg.startsWith("--")).map((arg) => arg.slice(2));
  const allowed = command ? commandOptions[command] : undefined;
  const unexpected = passed.filter((option): boolean => !allowed?.includes(option.split("=")[0]));
  if (allowed && unexpected.length > 0) {
    throw new Error(`${command} does not take --${unexpected.join(", --")}.\n\n${usage}`);
  }
  switch (command) {
    case "list":
      return listVersions(ctx);
    case "publish":
      return publishVersion(ctx, { dryRun: values["dry-run"], preRelease: values["pre-release"] });
    case "delete-versions":
      return deleteVersions(ctx, { versions: args, before: values.before, confirm: values.yes });
    case "deprecate":
      ctx.log(deprecationRequests(ctx.manifest, values));
      return;
    default:
      throw new Error(command ? `Unknown command "${command}".\n\n${usage}` : usage);
  }
}

function requireToken(token: string | undefined, variable: string, registry: string): string {
  if (!token) {
    throw new Error(`Set ${variable} to a ${registry} access token.`);
  }
  return token;
}

/** The JSON fields ops.ts reads from Open VSX responses. */
interface OpenVsxBody {
  error?: string;
  totalSize?: number;
  versions?: Record<string, string>;
}

/**
 * Open VSX through its REST API, which is what the ovsx CLI calls. See
 * https://github.com/eclipse-openvsx/openvsx/wiki/Deleting-Extensions.
 */
export class OpenVsxRegistry implements Registry {
  readonly name = "Open VSX";

  constructor(
    private readonly manifest: ExtensionManifest,
    private readonly token: string | undefined,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl = "https://open-vsx.org"
  ) {}

  async listVersions(): Promise<string[]> {
    const { publisher, name } = this.manifest;
    const versions: string[] = [];
    // The registry returns at most 100 versions per page.
    for (let total = Infinity; versions.length < total; ) {
      const response = await this.fetchFn(
        `${this.baseUrl}/api/${publisher}/${name}/versions?size=100&offset=${versions.length}`
      );
      if (response.status === 404) {
        return [];
      }
      const body = await this.readBody(response, "list versions");
      const page = Object.keys(body.versions ?? {});
      if (page.length === 0) {
        break;
      }
      versions.push(...page);
      total = body.totalSize ?? versions.length;
    }
    return versions;
  }

  async publish(vsixPath: string): Promise<void> {
    const token = requireToken(this.token, "OVSX_PAT", this.name);
    const response = await this.fetchFn(
      `${this.baseUrl}/api/-/publish?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: readFileSync(vsixPath),
      }
    );
    await this.readBody(response, "publish");
  }

  async deleteVersion(version: string): Promise<void> {
    const { publisher, name } = this.manifest;
    const token = requireToken(this.token, "OVSX_PAT", this.name);
    const response = await this.fetchFn(
      `${this.baseUrl}/api/${publisher}/${name}/delete?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ version }]),
      }
    );
    await this.readBody(response, `delete ${version}`);
  }

  /** Rejects failed requests without including the URL, which carries the token. */
  private async readBody(response: Response, action: string): Promise<OpenVsxBody> {
    const text = await response.text();
    let body: OpenVsxBody = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // Error pages are not JSON; the status code below still reports the failure.
    }
    if (!response.ok || body.error) {
      throw new Error(`Open VSX could not ${action}: ${body.error ?? `HTTP ${response.status}`}`);
    }
    return body;
  }
}

/** Deletes a Marketplace version; separate so tests do not reach the gallery API. */
export type MarketplaceVersionDeleter = (
  token: string,
  publisher: string,
  name: string,
  version: string
) => Promise<void>;

/** Deletes a version through the gallery API, authenticating the same way as vsce. */
export const deleteMarketplaceVersion: MarketplaceVersionDeleter = async (
  token,
  publisher,
  name,
  version
): Promise<void> => {
  const gallery = new GalleryApi("https://marketplace.visualstudio.com", [
    getBasicHandler("OAuth", token),
  ]);
  await gallery.deleteExtension(publisher, name, version);
};

/** The Visual Studio Marketplace, through its public gallery query and vsce. */
export class MarketplaceRegistry implements Registry {
  readonly name = "Visual Studio Marketplace";

  constructor(
    private readonly manifest: ExtensionManifest,
    private readonly token: string | undefined,
    private readonly run: CommandRunner,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly deleter: MarketplaceVersionDeleter = deleteMarketplaceVersion,
    /** Publishes with a short-lived credential exchanged for the GitHub Actions OIDC token. */
    private readonly trustedPublishing = false
  ) {}

  async listVersions(): Promise<string[]> {
    const { publisher, name } = this.manifest;
    const response = await this.fetchFn(
      "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json;api-version=3.0-preview.1",
        },
        // filterType 7 matches the extension ID; flag 1 includes every version.
        body: JSON.stringify({
          filters: [{ criteria: [{ filterType: 7, value: `${publisher}.${name}` }] }],
          flags: 1,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`Visual Studio Marketplace could not list versions: HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      results?: { extensions?: { versions?: { version: string }[] }[] }[];
    };
    const versions = body.results?.[0]?.extensions?.[0]?.versions ?? [];
    return versions.map((entry): string => entry.version);
  }

  async publish(vsixPath: string): Promise<void> {
    const args = ["--no-install", "vsce", "publish", "--packagePath", vsixPath];
    if (this.trustedPublishing) {
      await this.run("npx", [...args, "--oidc"]);
      return;
    }
    // vsce reads the token from VSCE_PAT, which keeps it out of the process arguments.
    requireToken(this.token, "VSCE_PAT", this.name);
    await this.run("npx", args);
  }

  async deleteVersion(version: string): Promise<void> {
    const { publisher, name } = this.manifest;
    const token = requireToken(this.token, "VSCE_PAT", this.name);
    await this.deleter(token, publisher, name, version);
  }
}

/** Reads the extension identity and version from package.json. */
export function readManifest(root: string): ExtensionManifest {
  const { publisher, name, version } = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf-8")
  );
  parseVersion(version);
  return { publisher, name, version };
}

/** Spawns a command with inherited output. */
export const runCommand: CommandRunner = (command, args) =>
  new Promise<void>((resolve, reject): void => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal): void => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? signal}.`));
      }
    });
  });

/** Builds the production context for the repository at `root`. */
export function createContext(root: string, env: NodeJS.ProcessEnv = process.env): OpsContext {
  const manifest = readManifest(root);
  return {
    manifest,
    registries: [
      new OpenVsxRegistry(manifest, env.OVSX_PAT),
      new MarketplaceRegistry(
        manifest,
        env.VSCE_PAT,
        runCommand,
        fetch,
        deleteMarketplaceVersion,
        env.GITHUB_ACTIONS === "true" && !env.VSCE_PAT
      ),
    ],
    packageVsix: async (preRelease): Promise<string> => {
      const vsixPath = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
      const args = ["--no-install", "vsce", "package", "--out", vsixPath];
      await runCommand("npx", preRelease ? [...args, "--pre-release"] : args);
      return vsixPath;
    },
    log: (message): void => console.log(message),
  };
}

if (require.main === module) {
  const root = path.resolve(
    __dirname,
    existsSync(path.join(__dirname, "../package.json")) ? ".." : "../.."
  );
  Promise.resolve()
    .then((): Promise<void> => main(process.argv.slice(2), createContext(root)))
    .catch((error: unknown): void => {
      console.error(errorMessage(error));
      process.exitCode = 1;
    });
}
