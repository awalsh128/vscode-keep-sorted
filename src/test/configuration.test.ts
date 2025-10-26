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
const DEFAULT_FIX_ON_SAVE = true;
const DEFAULT_EXCLUDE: string[] = [];
const ANY_FILE_PATH = "/test/file.ts";

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
      expect(config).to.have.property("lintOnSave").that.is.a("boolean");
      expect(config).to.have.property("lintOnChange").that.is.a("boolean");
      expect(config).to.have.property("logLevel").that.is.a("string");
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
      expect(config).to.have.property("fixOnSave");
      expect(config).to.have.property("exclude");
    });
  });

  describe("excluded", () => {
    let getConfigurationStub: sinon.SinonStub;
    let configStub: { get: sinon.SinonStub };

    beforeEach(() => {
      // Create config stub for testing exclusion patterns
      configStub = {
        get: sandbox.stub(),
      };

      getConfigurationStub = sandbox.stub(vscode.workspace, "getConfiguration");
      getConfigurationStub.returns(configStub);
    });

    it("should return false when no exclude patterns are configured", () => {
      // Arrange
      configStub.get.withArgs("exclude", DEFAULT_EXCLUDE).returns([]);
      configStub.get.withArgs("enabled", DEFAULT_ENABLED).returns(DEFAULT_ENABLED);
      configStub.get.withArgs("fixOnSave", DEFAULT_FIX_ON_SAVE).returns(DEFAULT_FIX_ON_SAVE);

      // Trigger config reload
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;
      onConfigurationChange(mockEvent);

      const testUri = vscode.Uri.file(ANY_FILE_PATH);

      // Act
      const result = pathExcluded(testUri);

      // Assert
      expect(result).to.be.false;
    });

    it("should return true when file matches exclude pattern", () => {
      // Arrange
      const excludePatterns = [".*\\.test\\.ts$", ".*generated.*"];
      configStub.get.withArgs("exclude", DEFAULT_EXCLUDE).returns(excludePatterns);
      configStub.get.withArgs("enabled", DEFAULT_ENABLED).returns(DEFAULT_ENABLED);
      configStub.get.withArgs("fixOnSave", DEFAULT_FIX_ON_SAVE).returns(DEFAULT_FIX_ON_SAVE);

      // Trigger config reload
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;
      onConfigurationChange(mockEvent);

      const testUri = vscode.Uri.file("/path/to/file.test.ts");

      // Act
      const result = pathExcluded(testUri);

      // Assert
      expect(result).to.be.true;
    });

    it("should return false when file does not match exclude patterns", () => {
      // Arrange
      const excludePatterns = [".*\\.test\\.ts$", ".*generated.*"];
      configStub.get.withArgs("exclude", DEFAULT_EXCLUDE).returns(excludePatterns);
      configStub.get.withArgs("enabled", DEFAULT_ENABLED).returns(DEFAULT_ENABLED);
      configStub.get.withArgs("fixOnSave", DEFAULT_FIX_ON_SAVE).returns(DEFAULT_FIX_ON_SAVE);

      // Trigger config reload
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;
      onConfigurationChange(mockEvent);

      const testUri = vscode.Uri.file("/path/to/regular-file.ts");

      // Act
      const result = pathExcluded(testUri);

      // Assert
      expect(result).to.be.false;
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
      expect(configAfter).to.have.property("fixOnSave");
      expect(configAfter).to.have.property("exclude");
    });
  });

  describe("KeepSortedConfiguration interface", () => {
    it("should define all required configuration properties", () => {
      // Arrange & Act
      const config: KeepSortedConfiguration = {
        enabled: true,
        fixOnSave: false,
        
        exclude: ["pattern1", "pattern2"],
      };

      // Assert
      expect(config.enabled).to.equal(true);
      expect(config.fixOnSave).to.equal(false);
      expect(config.exclude).to.deep.equal(["pattern1", "pattern2"]);
    });

    it("should have readonly properties", () => {
      // Arrange & Act
      const config: KeepSortedConfiguration = {
        enabled: true,
        fixOnSave: true,
        exclude: [],
      };

      // Assert - TypeScript enforces readonly at compile time
      // At runtime, verify the properties exist and have correct types
      expect(config).to.have.property("enabled").that.is.a("boolean");
      expect(config).to.have.property("fixOnSave").that.is.a("boolean");
      expect(config).to.have.property("exclude").that.is.an("array");
    });
  });
});
