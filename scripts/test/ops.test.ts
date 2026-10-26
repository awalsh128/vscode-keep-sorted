import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as sinon from "sinon";
import {
  compareVersions,
  deleteVersions,
  deprecationRequests,
  ExtensionManifest,
  main,
  MarketplaceRegistry,
  OpenVsxRegistry,
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
  deleteVersion: sinon.SinonStub;
}

function fakeRegistry(name: string, versions: string[]): FakeRegistry {
  return {
    name,
    listVersions: sinon.stub().resolves(versions),
    publish: sinon.stub().resolves(),
    deleteVersion: sinon.stub().resolves(),
  };
}

function fakeContext(registries: Registry[]): OpsContext & { messages: string[] } {
  const messages: string[] = [];
  return {
    manifest,
    registries,
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
      // Arrange
      const openVsx = fakeRegistry("Open VSX", []);
      const ctx = fakeContext([openVsx]);

      // Act
      await publishVersion(ctx, { dryRun: true, preRelease: true });

      // Assert
      expect(openVsx.publish.called).to.equal(false);
      expect((ctx.packageVsix as sinon.SinonStub).calledOnceWithExactly(true)).to.equal(true);
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

  describe("deleteVersions", (): void => {
    it("should only report the plan without confirmation", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", ["2.0.0", "1.0.0", "0.0.1"]);
      const ctx = fakeContext([openVsx]);

      // Act
      await deleteVersions(ctx, { versions: [], before: "2.0.0", confirm: false });

      // Assert
      expect(openVsx.deleteVersion.called).to.equal(false);
      expect(ctx.messages[0]).to.equal("Open VSX: 1.0.0, 0.0.1");
    });

    it("should delete versions older than --before when confirmed", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", ["2.0.0", "1.0.0", "0.0.1"]);
      const marketplace = fakeRegistry("Marketplace", ["2.0.0", "1.0.0"]);
      const ctx = fakeContext([openVsx, marketplace]);

      // Act
      await deleteVersions(ctx, { versions: [], before: "2.0.0", confirm: true });

      // Assert
      expect(openVsx.deleteVersion.args).to.deep.equal([["1.0.0"], ["0.0.1"]]);
      expect(marketplace.deleteVersion.args).to.deep.equal([["1.0.0"]]);
    });

    it("should delete only listed versions a registry has", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", ["2.0.0", "1.0.0", "0.0.1"]);
      const marketplace = fakeRegistry("Marketplace", ["2.0.0", "1.0.0"]);
      const ctx = fakeContext([openVsx, marketplace]);

      // Act
      await deleteVersions(ctx, { versions: ["0.0.1", "0.5.0"], confirm: true });

      // Assert
      expect(openVsx.deleteVersion.args).to.deep.equal([["0.0.1"]]);
      expect(marketplace.deleteVersion.called).to.equal(false);
      expect(ctx.messages[0]).to.equal("Not published to any registry: 0.5.0.");
    });

    [
      { case: "the package.json version", published: ["3.0.0", "2.0.0"], target: "2.0.0" },
      { case: "the latest published version", published: ["3.0.0", "1.0.0"], target: "3.0.0" },
    ].forEach(({ case: name, published, target }): void => {
      it(`should refuse to delete ${name} anywhere`, async (): Promise<void> => {
        // Arrange
        const openVsx = fakeRegistry("Open VSX", ["1.5.0", "0.0.1"]);
        const marketplace = fakeRegistry("Marketplace", published);
        const ctx = fakeContext([openVsx, marketplace]);

        // Act
        const result = deleteVersions(ctx, { versions: ["0.0.1", target], confirm: true });

        // Assert
        await expect(result).to.be.rejectedWith(`Refusing to delete ${target} from Marketplace`);
        expect(openVsx.deleteVersion.called).to.equal(false);
      });
    });

    [
      { case: "neither versions nor --before", versions: [], before: undefined },
      { case: "both versions and --before", versions: ["1.0.0"], before: "2.0.0" },
    ].forEach(({ case: name, versions, before }): void => {
      it(`should reject ${name}`, async (): Promise<void> => {
        // Arrange
        const ctx = fakeContext([fakeRegistry("Open VSX", [])]);

        // Act
        const result = deleteVersions(ctx, { versions, before, confirm: true });

        // Assert
        await expect(result).to.be.rejectedWith("but not both");
      });
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
      { args: ["publish", "--yes"], error: "publish does not take --yes." },
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

    it("should pass delete-versions arguments through", async (): Promise<void> => {
      // Arrange
      const openVsx = fakeRegistry("Open VSX", ["2.0.0", "1.0.0"]);
      const ctx = fakeContext([openVsx]);

      // Act
      await main(["delete-versions", "1.0.0", "--yes"], ctx);

      // Assert
      expect(openVsx.deleteVersion.args).to.deep.equal([["1.0.0"]]);
    });
  });

  describe("OpenVsxRegistry", (): void => {
    it("should page through every published version", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub();
      fetchFn.onFirstCall().resolves(jsonResponse({ totalSize: 2, versions: { "2.0.0": "" } }));
      fetchFn.onSecondCall().resolves(jsonResponse({ totalSize: 2, versions: { "1.0.0": "" } }));
      const registry = new OpenVsxRegistry(manifest, token, fetchFn);

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
      const registry = new OpenVsxRegistry(manifest, token, fetchFn);

      // Act
      const versions = await registry.listVersions();

      // Assert
      expect(versions).to.deep.equal([]);
    });

    it("should delete one version with the token", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub().resolves(jsonResponse({ success: "Deleted" }));
      const registry = new OpenVsxRegistry(manifest, token, fetchFn);

      // Act
      await registry.deleteVersion("1.0.0");

      // Assert
      expect(fetchFn.firstCall.args[0]).to.equal(
        `https://open-vsx.org/api/pub/ext/delete?token=${token}`
      );
      expect(fetchFn.firstCall.args[1].body).to.equal('[{"version":"1.0.0"}]');
    });

    it("should report a registry error without the token", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub().resolves(jsonResponse({ error: "Version is in use" }, 400));
      const registry = new OpenVsxRegistry(manifest, token, fetchFn);

      // Act
      const result = registry.deleteVersion("1.0.0");

      // Assert
      // Anchored so the message cannot also carry the token from the request URL.
      await expect(result).to.be.rejectedWith(
        /^Open VSX could not delete 1\.0\.0: Version is in use$/
      );
    });

    it("should require a token before changing the registry", async (): Promise<void> => {
      // Arrange
      const fetchFn = sinon.stub();
      const registry = new OpenVsxRegistry(manifest, undefined, fetchFn);

      // Act
      const result = registry.deleteVersion("1.0.0");

      // Assert
      await expect(result).to.be.rejectedWith("Set OVSX_PAT");
      expect(fetchFn.called).to.equal(false);
    });
  });

  describe("MarketplaceRegistry", (): void => {
    it("should list the versions of the extension", async (): Promise<void> => {
      // Arrange
      const body = { results: [{ extensions: [{ versions: [{ version: "2.0.0" }] }] }] };
      const fetchFn = sinon.stub().resolves(jsonResponse(body));
      const registry = new MarketplaceRegistry(manifest, token, sinon.stub(), fetchFn);

      // Act
      const versions = await registry.listVersions();

      // Assert
      expect(versions).to.deep.equal(["2.0.0"]);
      expect(JSON.parse(fetchFn.firstCall.args[1].body).filters[0].criteria[0].value).to.equal(
        "pub.ext"
      );
    });

    it("should publish the package with vsce", async (): Promise<void> => {
      // Arrange
      const run = sinon.stub().resolves();
      const registry = new MarketplaceRegistry(manifest, token, run);

      // Act
      await registry.publish(vsixPath);

      // Assert
      expect(run.firstCall.args).to.deep.equal([
        "npx",
        ["--no-install", "vsce", "publish", "--packagePath", vsixPath],
        { VSCE_PAT: token },
      ]);
    });

    it("should publish with a token from the sign-in provider", async (): Promise<void> => {
      // Arrange
      const run = sinon.stub().resolves();
      const signIn = sinon.stub().resolves("signed-in");
      const registry = new MarketplaceRegistry(manifest, signIn, run);

      // Act
      await registry.publish(vsixPath);

      // Assert
      expect(run.firstCall.args[2]).to.deep.equal({ VSCE_PAT: "signed-in" });
    });

    it("should delete with a token from the sign-in provider", async (): Promise<void> => {
      // Arrange
      const deleter = sinon.stub().resolves();
      const signIn = sinon.stub().resolves("signed-in");
      const registry = new MarketplaceRegistry(manifest, signIn, sinon.stub(), fetch, deleter);

      // Act
      await registry.deleteVersion("1.0.0");

      // Assert
      expect(deleter.firstCall.args).to.deep.equal(["signed-in", "pub", "ext", "1.0.0"]);
    });

    it("should publish with trusted publishing instead of a token", async (): Promise<void> => {
      // Arrange
      const run = sinon.stub().resolves();
      const registry = new MarketplaceRegistry(manifest, undefined, run, fetch, sinon.stub(), true);

      // Act
      await registry.publish(vsixPath);

      // Assert
      expect(run.firstCall.args).to.deep.equal([
        "npx",
        ["--no-install", "vsce", "publish", "--packagePath", vsixPath, "--oidc"],
      ]);
    });

    it("should require a token to publish without trusted publishing", async (): Promise<void> => {
      // Arrange
      const run = sinon.stub().resolves();
      const registry = new MarketplaceRegistry(manifest, undefined, run);

      // Act
      const result = registry.publish(vsixPath);

      // Assert
      await expect(result).to.be.rejectedWith("Set VSCE_PAT");
      expect(run.called).to.equal(false);
    });

    it("should delete one version through the gallery API", async (): Promise<void> => {
      // Arrange
      const deleter = sinon.stub().resolves();
      const registry = new MarketplaceRegistry(manifest, token, sinon.stub(), fetch, deleter);

      // Act
      await registry.deleteVersion("1.0.0");

      // Assert
      expect(deleter.firstCall.args).to.deep.equal([token, "pub", "ext", "1.0.0"]);
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
});
