import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { afterEach, beforeEach, describe, it } from "mocha";
import { tmpdir } from "os";
import * as path from "path";
import * as sinon from "sinon";
import {
  checkReleaseChannel,
  compareVersions,
  createContext,
  deprecationRequests,
  ExtensionManifest,
  main,
  MarketplaceRegistry,
  OpenVsxRegistry,
  openVsxTrustedPublishing,
  OpsContext,
  publishVersion,
  readManifest,
  Registry,
  sortVersionsDescending,
} from "../ops";

use(chaiAsPromised);

const manifest: ExtensionManifest = { publisher: "pub", name: "ext", version: "2.0.0" };
const vsixPath = "/tmp/ext-2.0.0.vsix";
const token = "secret-token";

interface FakeRegistry extends Registry {
  publish: sinon.SinonStub;
}

function fakeRegistry(name: string, versions: string[]): FakeRegistry {
  return {
    name,
    listVersions: sinon.stub().resolves(versions),
    publish: sinon.stub().resolves(),
  };
}

function fakeContext(registries: Registry[]): OpsContext & { messages: string[] } {
  const messages: string[] = [];
  return {
    manifest,
    registries,
    trustedPublishing: true,
    packageVsix: sinon.stub().resolves(vsixPath),
    log: (message: string): void => {
      messages.push(message);
    },
    messages,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("ops", (): void => {
  describe("versions", (): void => {
    [
      { a: "1.0.0", b: "1.0.0", expected: 0 },
      { a: "1.0.9", b: "1.0.10", expected: -1 },
      { a: "2.0.0", b: "1.99.99", expected: 1 },
    ].forEach(({ a, b, expected }): void => {
      it(`should compare ${a} with ${b} as ${expected}`, (): void => {
        // Act
        const result = Math.sign(compareVersions(a, b));

        // Assert
        expect(result).to.equal(expected);
      });
    });

    ["1.0", "v1.0.0", "1.0.0-beta"].forEach((version): void => {
      it(`should reject the version "${version}"`, (): void => {
        // Act & Assert
        expect((): number => compareVersions(version, "1.0.0")).to.throw("Invalid version");
      });
    });

    it("should sort unique versions newest first", (): void => {
      // Arrange
      const versions = ["0.0.1", "1.0.10", "1.0.2", "1.0.10"];

      // Act
      const sorted = sortVersionsDescending(versions);

      // Assert
      expect(sorted).to.deep.equal(["1.0.10", "1.0.2", "0.0.1"]);
    });
  });

  describe("publishVersion", (): void => {
    it("should publish one package to every registry missing the version", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", ["1.0.0"]);
      const marketplace = fakeRegistry("Marketplace", ["1.0.0"]);
      const ctx = fakeContext([openVsx, marketplace]);

      // Act
      await publishVersion(ctx, { dryRun: false, preRelease: false });

      // Assert
      expect(openVsx.publish.calledOnceWithExactly(vsixPath)).to.equal(true);
      expect(marketplace.publish.calledOnceWithExactly(vsixPath)).to.equal(true);
      expect((ctx.packageVsix as sinon.SinonStub).calledOnceWithExactly(false)).to.equal(true);
    });

    it("should skip a registry that already has the version", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", ["2.0.0"]);
      const marketplace = fakeRegistry("Marketplace", ["1.0.0"]);
      const ctx = fakeContext([openVsx, marketplace]);

      // Act
      await publishVersion(ctx, { dryRun: false, preRelease: false });

      // Assert
      expect(openVsx.publish.called).to.equal(false);
      expect(marketplace.publish.calledOnce).to.equal(true);
      expect(ctx.messages[0]).to.equal("Open VSX already has 2.0.0; skipping it.");
    });

    it("should package without publishing on a dry run", async (): Promise<void> => {
      // Arrange - Pre-releases use odd minor versions
      const openVsx = fakeRegistry("Open VSX", []);
      const ctx = { ...fakeContext([openVsx]), manifest: { ...manifest, version: "2.1.0" } };

      // Act
      await publishVersion(ctx, { dryRun: true, preRelease: true });

      // Assert
      expect(openVsx.publish.called).to.equal(false);
      expect((ctx.packageVsix as sinon.SinonStub).calledOnceWithExactly(true)).to.equal(true);
      expect(ctx.messages).to.deep.equal([
        `Dry run: packaged ${vsixPath}; would publish 2.1.0 to Open VSX.`,
      ]);
    });

    it("should publish a given VSIX without packaging", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", []);
      const ctx = fakeContext([openVsx]);

      // Act
      await publishVersion(ctx, {
        dryRun: false,
        preRelease: false,
        vsixPath: "/release/ext-2.0.0.vsix",
      });

      // Assert
      expect(openVsx.publish.calledOnceWithExactly("/release/ext-2.0.0.vsix")).to.equal(true);
      expect((ctx.packageVsix as sinon.SinonStub).called).to.equal(false);
    });

    it("should name a given VSIX on a dry run", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", []);
      const ctx = fakeContext([openVsx]);

      // Act
      await main(["publish", "--dry-run", "--vsix", "/release/ext-2.0.0.vsix"], ctx);

      // Assert
      expect(ctx.messages).to.deep.equal([
        "Dry run: using /release/ext-2.0.0.vsix; would publish 2.0.0 to Open VSX.",
      ]);
    });

    it("should refuse a pre-release on an even minor before packaging", async () => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", []);
      const ctx = fakeContext([openVsx]);

      // Act
      const result = publishVersion(ctx, { dryRun: false, preRelease: true });

      // Assert
      await expect(result).to.be.rejectedWith(/pre-releases use odd minor versions/);
      expect((ctx.packageVsix as sinon.SinonStub).called).to.equal(false);
    });

    it("should refuse to publish without trusted publishing, before packaging", async () => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", []);
      const ctx = { ...fakeContext([openVsx]), trustedPublishing: false };

      // Act
      const result = publishVersion(ctx, { dryRun: false, preRelease: false });

      // Assert
      await expect(result).to.be.rejectedWith(/trusted publishing only/);
      expect((ctx.packageVsix as sinon.SinonStub).called).to.equal(false);
    });

    it("should dry-run without trusted publishing", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", []);
      const ctx = { ...fakeContext([openVsx]), trustedPublishing: false };

      // Act
      await publishVersion(ctx, { dryRun: true, preRelease: false });

      // Assert
      expect(ctx.messages).to.deep.equal([
        `Dry run: packaged ${vsixPath}; would publish 2.0.0 to Open VSX.`,
      ]);
    });

    it("should still publish to other registries when one fails", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", []);
      openVsx.publish.rejects(new Error("outage"));
      const marketplace = fakeRegistry("Marketplace", []);
      const ctx = fakeContext([openVsx, marketplace]);

      // Act
      const result = publishVersion(ctx, { dryRun: false, preRelease: false });

      // Assert
      await expect(result).to.be.rejectedWith("Publishing 2.0.0 failed. Open VSX: outage");
      expect(marketplace.publish.calledOnce).to.equal(true);
    });
  });

  describe("deprecationRequests", (): void => {
    it("should name a replacement extension for both registries", (): void => {
      // Act
      const text = deprecationRequests(manifest, { replacement: "pub.new", reason: "Renamed" });

      // Assert
      expect(text).to.contain(
        "Please mark `pub.ext` as deprecated in favor of the `pub.new` extension.\nReason: Renamed"
      );
      expect(text).to.contain("Title: Deprecate extension pub.ext in favor of pub.new");
      expect(text).to.contain("- **Replacement:** `pub.new`");
    });

    it("should name a replacement setting", (): void => {
      // Act
      const text = deprecationRequests(manifest, { setting: "editor.sortLines" });

      // Assert
      expect(text).to.contain("in favor of the `editor.sortLines` setting.");
      expect(text).to.contain("- **Replacement setting:** `editor.sortLines`");
    });

    it("should reject both a replacement extension and setting", (): void => {
      // Act & Assert
      expect((): string =>
        deprecationRequests(manifest, { replacement: "pub.new", setting: "editor.sortLines" })
      ).to.throw("not both");
    });
  });

  describe("main", (): void => {
    [
      { args: ["list", "--dry-run"], error: "list does not take --dry-run." },
      { args: ["list", "extra"], error: "Unexpected arguments: extra" },
      { args: ["unknown"], error: 'Unknown command "unknown".' },
      { args: [], error: "Usage: npm run ops" },
    ].forEach(({ args, error }): void => {
      it(`should reject "${args.join(" ")}"`, async (): Promise<void> => {
        // Arrange
        const ctx = fakeContext([fakeRegistry("Open VSX", [])]);

        // Act
        const result = main(args, ctx);

        // Assert
        await expect(result).to.be.rejectedWith(error);
      });
    });
  });

  describe("OpenVsxRegistry", (): void => {
    it("should page through every published version", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub();
      fetchFn.onFirstCall().resolves(jsonResponse({ totalSize: 2, versions: { "2.0.0": "" } }));
      fetchFn.onSecondCall().resolves(jsonResponse({ totalSize: 2, versions: { "1.0.0": "" } }));
      const registry = new OpenVsxRegistry(manifest, sinon.stub().resolves(token), fetchFn);

      // Act
      const versions = await registry.listVersions();

      // Assert
      expect(versions).to.deep.equal(["2.0.0", "1.0.0"]);
      expect(fetchFn.secondCall.args[0]).to.equal(
        "https://open-vsx.org/api/pub/ext/versions?size=100&offset=1"
      );
    });

    it("should report an unpublished extension as having no versions", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub().resolves(jsonResponse({ error: "Not found" }, 404));
      const registry = new OpenVsxRegistry(manifest, sinon.stub().resolves(token), fetchFn);

      // Act
      const versions = await registry.listVersions();

      // Assert
      expect(versions).to.deep.equal([]);
    });

    it("should publish with a token from the provider", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub().resolves(jsonResponse({}));
      const registry = new OpenVsxRegistry(manifest, sinon.stub().resolves("issued"), fetchFn);
      const dir = mkdtempSync(path.join(tmpdir(), "keep-sorted-ops-"));
      const packagePath = path.join(dir, "ext-2.0.0.vsix");
      writeFileSync(packagePath, "");

      // Act
      try {
        await registry.publish(packagePath);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }

      // Assert
      expect(fetchFn.firstCall.args[0]).to.equal("https://open-vsx.org/api/-/publish?token=issued");
    });

    it("should report a publishing error without the token", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub().resolves(jsonResponse({ error: "Version exists" }, 400));
      const registry = new OpenVsxRegistry(manifest, sinon.stub().resolves(token), fetchFn);
      const dir = mkdtempSync(path.join(tmpdir(), "keep-sorted-ops-"));
      const packagePath = path.join(dir, "ext-2.0.0.vsix");
      writeFileSync(packagePath, "");

      // Act
      const result = registry.publish(packagePath);

      // Assert
      // Anchored so the message cannot also carry the token from the request URL.
      try {
        await expect(result).to.be.rejectedWith(/^Open VSX could not publish: Version exists$/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("checkReleaseChannel", (): void => {
    [
      { version: "1.2.0", preRelease: false },
      { version: "1.3.4", preRelease: true },
    ].forEach(({ version, preRelease }): void => {
      it(`should accept ${version} as a ${preRelease ? "pre-release" : "release"}`, (): void => {
        // Act & Assert
        expect(() => checkReleaseChannel(version, preRelease)).to.not.throw();
      });
    });

    [
      { version: "1.2.0", preRelease: true, error: /even minor.*pre-releases use odd/ },
      { version: "1.3.0", preRelease: false, error: /odd minor.*releases use even/ },
    ].forEach(({ version, preRelease, error }): void => {
      it(`should refuse ${version} as a ${preRelease ? "pre-release" : "release"}`, (): void => {
        // Act & Assert
        expect(() => checkReleaseChannel(version, preRelease)).to.throw(error);
      });
    });
  });

  describe("openVsxTrustedPublishing", (): void => {
    const env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example/token?api-version=2.0",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token",
    };

    it("should exchange the GitHub ID token for a publishing token", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub();
      fetchFn.onFirstCall().resolves(jsonResponse({ value: "id-token" }));
      fetchFn.onSecondCall().resolves(jsonResponse({ value: "issued" }));
      const provider = openVsxTrustedPublishing(manifest, env, fetchFn);

      // Act
      const issued = await provider();

      // Assert
      expect(issued).to.equal("issued");
      const idTokenUrl = fetchFn.firstCall.args[0] as URL;
      expect(idTokenUrl.searchParams.get("audience")).to.equal("https://open-vsx.org");
      expect(idTokenUrl.searchParams.get("api-version")).to.equal("2.0");
      expect(fetchFn.firstCall.args[1].headers.Authorization).to.equal("Bearer request-token");
      expect(fetchFn.secondCall.args[0]).to.equal(
        "https://open-vsx.org/api/-/trusted-publishing/token"
      );
      expect(JSON.parse(fetchFn.secondCall.args[1].body)).to.deep.equal({
        namespace: "pub",
        extension: "ext",
        token: "id-token",
      });
    });

    it("should exchange only once per run", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub();
      fetchFn.onFirstCall().resolves(jsonResponse({ value: "id-token" }));
      fetchFn.onSecondCall().resolves(jsonResponse({ value: "issued" }));
      const provider = openVsxTrustedPublishing(manifest, env, fetchFn);

      // Act
      await provider();
      await provider();

      // Assert
      expect(fetchFn.callCount).to.equal(2);
    });

    it("should explain a refused exchange", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub();
      fetchFn.onFirstCall().resolves(jsonResponse({ value: "id-token" }));
      fetchFn.onSecondCall().resolves(jsonResponse({ error: "No trusted publisher" }, 403));
      const provider = openVsxTrustedPublishing(manifest, env, fetchFn);

      // Act
      const result = provider();

      // Assert
      await expect(result).to.be.rejectedWith(/No trusted publisher.*trusted-publishers/);
    });

    it("should require the id-token permission", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub();
      const provider = openVsxTrustedPublishing(manifest, {}, fetchFn);

      // Act
      const result = provider();

      // Assert
      await expect(result).to.be.rejectedWith("id-token: write");
      expect(fetchFn.called).to.equal(false);
    });
  });

  describe("MarketplaceRegistry", (): void => {
    it("should list the versions of the extension", async (): Promise<void> => {
      // Arrange
      const body = { results: [{ extensions: [{ versions: [{ version: "2.0.0" }] }] }] };
      const fetchFn = sinon.stub().resolves(jsonResponse(body));
      const registry = new MarketplaceRegistry(manifest, sinon.stub(), fetchFn);

      // Act
      const versions = await registry.listVersions();

      // Assert
      expect(versions).to.deep.equal(["2.0.0"]);
      expect(JSON.parse(fetchFn.firstCall.args[1].body).filters[0].criteria[0].value).to.equal(
        "pub.ext"
      );
    });

    it("should publish the package with vsce and trusted publishing", async (): Promise<void> => {
      // Arrange
      const run = sinon.stub().resolves();
      const registry = new MarketplaceRegistry(manifest, run);

      // Act
      await registry.publish(vsixPath);

      // Assert
      expect(run.firstCall.args).to.deep.equal([
        "npx",
        ["--no-install", "vsce", "publish", "--packagePath", vsixPath, "--oidc"],
      ]);
    });
  });

  describe("readManifest", (): void => {
    let root: string;

    beforeEach((): void => {
      root = mkdtempSync(path.join(tmpdir(), "keep-sorted-ops-"));
    });

    afterEach((): void => {
      rmSync(root, { recursive: true, force: true });
    });

    it("should read the extension identity and version", (): void => {
      // Arrange
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ ...manifest, private: true })
      );

      // Act
      const result = readManifest(root);

      // Assert
      expect(result).to.deep.equal(manifest);
    });
  });

  describe("createContext", (): void => {
    let root: string;

    beforeEach((): void => {
      root = mkdtempSync(path.join(tmpdir(), "keep-sorted-ops-"));
      writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest));
    });

    afterEach((): void => {
      rmSync(root, { recursive: true, force: true });
    });

    it("should read the extension manifest at the root", (): void => {
      // Act
      const ctx = createContext(root, {});

      // Assert
      expect(ctx.manifest).to.deep.equal(manifest);
    });

    [
      { env: {}, expected: false },
      {
        env: { ACTIONS_ID_TOKEN_REQUEST_URL: "https://a", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "t" },
        expected: true,
      },
    ].forEach(({ env, expected }): void => {
      it(`should ${expected ? "" : "not "}allow trusted publishing with ${Object.keys(env).length} OIDC variables`, (): void => {
        // Act & Assert
        expect(createContext(root, env).trustedPublishing).to.equal(expected);
      });
    });
  });
});
