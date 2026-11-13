#!/usr/bin/env npx tsx
/**
 * Release operations for the Visual Studio Marketplace and Open VSX: listing published versions,
 * publishing the extension's package.json version, and preparing deprecation requests.
 *
 * Publishing uses trusted publishing only, so it runs in a GitHub Actions job with `id-token:
 * write` and no stored tokens: Open VSX exchanges the job's OIDC ID token for a short-lived
 * publishing token, and the Marketplace accepts `vsce publish --oidc`. Each registry must list this
 * repository and the Publish workflow as a trusted publisher.
 */

import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import * as path from "path";
import { parseArgs } from "util";

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
}

/** Process and output boundaries of the operations, replaced in tests. */
export interface OpsContext {
  manifest: ExtensionManifest;
  registries: readonly Registry[];
  /** Whether the job can request an OIDC ID token, which trusted publishing exchanges. */
  trustedPublishing: boolean;
  /** Packages the extension and returns the VSIX path. */
  packageVsix(preRelease: boolean): Promise<string>;
  log(message: string): void;
}

/** Runs a command with inherited output in a directory, and rejects when it fails. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  cwd?: string
) => Promise<void>;

/** Returns a short-lived publishing token. */
export type TokenProvider = () => Promise<string>;

export const usage = `Usage: npm run ops -- <command> [options]

Commands:
  list                              Show the versions published to each registry.
  publish [--dry-run] [--pre-release] [--vsix <path>]
                                    Package the package.json version, or take the VSIX at --vsix,
                                    and publish it to every registry that does not have it yet,
                                    with trusted publishing from GitHub Actions. --dry-run only
                                    packages and reports.
  deprecate [--replacement <publisher.extension> | --setting <setting.id>] [--reason <text>]
                                    Print deprecation requests to submit to each registry.`;

/** Options each command accepts; `--help` works with any of them. */
const commandOptions: Readonly<Record<string, readonly string[]>> = {
  list: ["help"],
  publish: ["dry-run", "pre-release", "vsix", "help"],
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
  /** An already packaged VSIX of the version, such as a GitHub release's, to publish as is. */
  vsixPath?: string;
}

/**
 * Checks VS Code's pre-release convention, which semantic-release follows through
 * `release-version.ts`: releases use even minor versions and pre-releases odd ones.
 *
 * @param version The version to publish.
 * @param preRelease Whether it is published as a pre-release.
 *
 * @throws Error when the minor version does not match the channel.
 */
export function checkReleaseChannel(version: string, preRelease: boolean): void {
  const [, minor] = parseVersion(version);
  if (minor % 2 !== (preRelease ? 1 : 0)) {
    throw new Error(
      `${version} has an ${minor % 2 ? "odd" : "even"} minor version, but ` +
        `${preRelease ? "pre-releases use odd" : "releases use even"} minor versions.`
    );
  }
}

/**
 * Packages the package.json version once, unless `options.vsixPath` names a VSIX of it, and
 * publishes that VSIX to every registry missing it. Rerunning after a partial failure only
 * publishes to the registries that still need it.
 */
export async function publishVersion(ctx: OpsContext, options: PublishOptions): Promise<void> {
  const { version } = ctx.manifest;
  checkReleaseChannel(version, options.preRelease);
  if (!options.dryRun && !ctx.trustedPublishing) {
    throw new Error(
      "Publishing uses trusted publishing only: run it in the Publish workflow, whose job has " +
        "`id-token: write`. Use --dry-run to package and check the registries elsewhere."
    );
  }
  const pending: Registry[] = [];
  for (const registry of ctx.registries) {
    if ((await registry.listVersions()).includes(version)) {
      ctx.log(`${registry.name} already has ${version}; skipping it.`);
    } else {
      pending.push(registry);
    }
  }
  // Package even when nothing is pending so a dry run always checks packaging.
  const vsixPath = options.vsixPath ?? (await ctx.packageVsix(options.preRelease));
  if (options.dryRun) {
    const targets = pending.map((registry): string => registry.name).join(", ") || "no registry";
    const source = options.vsixPath ? "using" : "packaged";
    ctx.log(`Dry run: ${source} ${vsixPath}; would publish ${version} to ${targets}.`);
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
      replacement: { type: "string" },
      setting: { type: "string" },
      reason: { type: "string" },
      vsix: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help) {
    ctx.log(usage);
    return;
  }
  if (args.length > 0) {
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
      return publishVersion(ctx, {
        dryRun: values["dry-run"],
        preRelease: values["pre-release"],
        vsixPath: values.vsix,
      });
    case "deprecate":
      ctx.log(deprecationRequests(ctx.manifest, values));
      return;
    default:
      throw new Error(command ? `Unknown command "${command}".\n\n${usage}` : usage);
  }
}

/** Requests a GitHub Actions OIDC ID token for `audience`; the job needs `id-token: write`. */
export async function gitHubIdToken(
  audience: string,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new Error("GitHub Actions has no OIDC ID token; grant the job `id-token: write`.");
  }
  // The request URL already carries an api-version parameter, so only the audience is added.
  const url = new URL(requestUrl);
  url.searchParams.set("audience", audience);
  const response = await fetchFn(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  const body = (await response.json().catch((): unknown => ({}))) as { value?: string };
  if (!response.ok || !body.value) {
    throw new Error(`GitHub Actions could not issue an OIDC ID token: HTTP ${response.status}`);
  }
  return body.value;
}

const OPEN_VSX_URL = "https://open-vsx.org";

/**
 * Exchanges the GitHub Actions OIDC ID token for a short-lived Open VSX token that can only publish
 * this extension, once per run. The namespace must register this repository and workflow at
 * https://open-vsx.org/user-settings/trusted-publishers.
 */
export function openVsxTrustedPublishing(
  manifest: ExtensionManifest,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch = fetch,
  baseUrl = OPEN_VSX_URL
): TokenProvider {
  let token: Promise<string> | undefined;
  return (): Promise<string> => {
    token ??= (async (): Promise<string> => {
      const idToken = await gitHubIdToken(baseUrl, env, fetchFn);
      const response = await fetchFn(`${baseUrl}/api/-/trusted-publishing/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespace: manifest.publisher,
          extension: manifest.name,
          token: idToken,
        }),
      });
      const body = (await response.json().catch((): unknown => ({}))) as OpenVsxBody;
      if (!response.ok || body.error || !body.value) {
        throw new Error(
          `Open VSX refused trusted publishing: ${body.error ?? `HTTP ${response.status}`}. Check ` +
            `the trusted publishers at ${baseUrl}/user-settings/trusted-publishers.`
        );
      }
      return body.value;
    })();
    return token;
  };
}

/** The JSON fields ops.ts reads from Open VSX responses. */
interface OpenVsxBody {
  error?: string;
  /** The issued token of a trusted publishing exchange. */
  value?: string;
  totalSize?: number;
  versions?: Record<string, string>;
}

/** Open VSX through its REST API, which is what the ovsx CLI calls. */
export class OpenVsxRegistry implements Registry {
  readonly name = "Open VSX";

  constructor(
    private readonly manifest: ExtensionManifest,
    /** Issues the publishing token, such as {@link openVsxTrustedPublishing}. */
    private readonly token: TokenProvider,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl = OPEN_VSX_URL
  ) {}

  async listVersions(): Promise<string[]> {
    const { publisher, name } = this.manifest;
    const versions: string[] = [];
    // The registry returns at most 100 versions per page.
    for (let total = Infinity; versions.length < total;) {
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
    const token = await this.token();
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

/**
 * The Visual Studio Marketplace, through its public gallery query and vsce, which publishes with a
 * short-lived credential exchanged for the GitHub Actions OIDC ID token.
 */
export class MarketplaceRegistry implements Registry {
  readonly name = "Visual Studio Marketplace";

  constructor(
    private readonly manifest: ExtensionManifest,
    private readonly run: CommandRunner,
    private readonly fetchFn: typeof fetch = fetch
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
    await this.run("npx", ["--no-install", "vsce", "publish", "--packagePath", vsixPath, "--oidc"]);
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
export const runCommand: CommandRunner = (command, args, cwd) =>
  new Promise<void>((resolve, reject): void => {
    const child = spawn(command, args, {
      cwd,
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
      new OpenVsxRegistry(manifest, openVsxTrustedPublishing(manifest, env)),
      new MarketplaceRegistry(manifest, runCommand),
    ],
    trustedPublishing: Boolean(
      env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
    ),
    packageVsix: async (preRelease): Promise<string> => {
      const vsixPath = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
      const args = ["--no-install", "vsce", "package", "--out", vsixPath];
      await runCommand("npx", preRelease ? [...args, "--pre-release"] : args, root);
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
