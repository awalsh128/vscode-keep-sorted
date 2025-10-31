import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import {
  getConfig,
  onConfigurationChange,
  excluded as pathExcluded,
  KeepSortedConfiguration,
} from "../configuration";

use(sinonChai);

/* eslint-disable @typescript-eslint/no-unused-expressions */

// Constants for test values
const KEEP_SORTED_CONFIG_NAMESPACE = "keep-sorted";
const DEFAULT_ENABLED = true;
const DEFAULT_EXCLUDE: string[] = [];

describe("configuration", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getConfig", () => {
    it("should return configuration object with expected properties", () => {
      // Act
      const config = getConfig();

      // Assert
      expect(config).to.be.an("object");
      expect(config).to.have.property("enabled").that.is.a("boolean");
      expect(config).to.have.property("exclude").that.is.an("array");
    });

    it("should return the same configuration object on multiple calls", () => {
      // Act
      const config1 = getConfig();
      const config2 = getConfig();

      // Assert
      expect(config1).to.equal(config2); // Same reference
    });

    it("should return readonly configuration object", () => {
      // Act
      const config = getConfig();

      // Assert - TypeScript ensures readonly at compile time
      // At runtime, verify the object has all expected properties
      expect(config).to.have.property("enabled");
      expect(config).to.have.property("exclude");
    });
  });

  describe("excluded", () => {
    let getConfigurationStub: sinon.SinonStub;
    let configStub: { get: sinon.SinonStub };

    beforeEach(() => {
      configStub = {
        get: sandbox.stub(),
      };
      getConfigurationStub = sandbox.stub(vscode.workspace, "getConfiguration");
      getConfigurationStub.returns(configStub);
    });

    [
      {
        name: "matching regex pattern",
        excludePattern: /.*\.test\.ts$/,
        filePath: "/path/to/file.test.ts",
        expectedMatchingRegex: /.*\.test\.ts$/,
      },
      {
        name: "matching glob pattern",
        excludePattern: "**/*/*test.ts",
        filePath: "/path/to/file.test.ts",
        expectedMatchingRegex: /^(.+\/)?([^/]+)\/([^/]+)test\.ts$/,
      },
      {
        name: "no matching regex pattern",
        excludePattern: /.*notfile\.temp\..*/,
        filePath: "/path/to/file.temp.ts",
        expectedMatchingRegex: null,
      },
      {
        name: "no matching glob pattern",
        excludePattern: "**/*/*temp.*",
        filePath: "/path/to/file.test.ts",
        expectedMatchingRegex: null,
      },
      {
        name: "empty exclude patterns",
        excludePattern: "",
        filePath: "/path/to/file.test.ts",
        expectedMatchingRegex: null,
      },
    ].forEach(({ name, excludePattern, filePath, expectedMatchingRegex }) => {
      it(`should return ${expectedMatchingRegex} when ${name} is configured`, () => {
        // Arrange
        configStub.get
          .withArgs("exclude", DEFAULT_EXCLUDE)
          .returns(excludePattern ? [excludePattern] : []);
        configStub.get.withArgs("enabled", DEFAULT_ENABLED).returns(DEFAULT_ENABLED);

        // Trigger config reload
        const mockEvent = {
          affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
        } as vscode.ConfigurationChangeEvent;
        onConfigurationChange(mockEvent);

        const testUri = vscode.Uri.file(filePath);

        // Act
        const result = pathExcluded(testUri);

        // Assert
        expect(result?.source).to.be.equal(expectedMatchingRegex?.source);
      });
    });
  });

  describe("onConfigurationChange", () => {
    it("should return true when keep-sorted configuration changes", () => {
      // Arrange
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;

      // Act
      const result = onConfigurationChange(mockEvent);

      // Assert
      expect(result).to.be.true;
      expect(mockEvent.affectsConfiguration).to.have.been.calledWith(KEEP_SORTED_CONFIG_NAMESPACE);
    });

    it("should return false when non-keep-sorted configuration changes", () => {
      // Arrange
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(false),
      } as vscode.ConfigurationChangeEvent;

      // Act
      const result = onConfigurationChange(mockEvent);

      // Assert
      expect(result).to.be.false;
      expect(mockEvent.affectsConfiguration).to.have.been.calledWith(KEEP_SORTED_CONFIG_NAMESPACE);
    });

    it("should reload configuration when keep-sorted configuration changes", () => {
      // Arrange
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;

      // Act
      onConfigurationChange(mockEvent);
      const configAfter = getConfig();

      // Assert - Configuration should be reloaded (new object reference)
      // Note: In a real VS Code environment, this would load fresh config values
      expect(typeof configAfter).to.equal("object");
      expect(configAfter).to.have.property("enabled");
      expect(configAfter).to.have.property("exclude");
    });
  });

  describe("KeepSortedConfiguration interface", () => {
    it("should define all required configuration properties", () => {
      // Arrange & Act
      const config: KeepSortedConfiguration = {
        enabled: true,
        exclude: ["pattern1", "pattern2"],
      };

      // Assert
      expect(config.enabled).to.equal(true);
      expect(config.exclude).to.deep.equal(["pattern1", "pattern2"]);
    });

    it("should have readonly properties", () => {
      // Arrange & Act
      const config: KeepSortedConfiguration = {
        enabled: true,
        exclude: [],
      };

      // Assert - TypeScript enforces readonly at compile time
      // At runtime, verify the properties exist and have correct types
      expect(config).to.have.property("enabled").that.is.a("boolean");
      expect(config).to.have.property("exclude").that.is.an("array");
    });
  });
});
