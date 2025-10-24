import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import {
  getConfiguration,
  affectsConfiguration,
  onDidChangeConfiguration,
  KeepSortedConfiguration,
} from "../configuration";

use(sinonChai);

/* eslint-disable @typescript-eslint/no-unused-expressions */

// Constants for test values
const KEEP_SORTED_CONFIG_NAMESPACE = "keep-sorted";
const DEFAULT_ENABLED = true;
const DEFAULT_LINT_ON_SAVE = true;
const DEFAULT_LINT_ON_CHANGE = true;
const DEFAULT_LOG_LEVEL = "info";
const CUSTOM_LOG_LEVEL = "debug";

describe("configuration", () => {
  let sandbox: sinon.SinonSandbox;
  let getConfigurationStub: sinon.SinonStub;
  let configStub: {
    get: sinon.SinonStub;
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Create config stub
    configStub = {
      get: sandbox.stub(),
    };

    // Stub vscode.workspace.getConfiguration
    getConfigurationStub = sandbox.stub(vscode.workspace, "getConfiguration");
    getConfigurationStub.returns(configStub);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getConfiguration", () => {
    it("should return configuration with default values", () => {
      // Arrange
      configStub.get.withArgs("enabled", DEFAULT_ENABLED).returns(DEFAULT_ENABLED);
      configStub.get.withArgs("lintOnSave", DEFAULT_LINT_ON_SAVE).returns(DEFAULT_LINT_ON_SAVE);
      configStub.get
        .withArgs("lintOnChange", DEFAULT_LINT_ON_CHANGE)
        .returns(DEFAULT_LINT_ON_CHANGE);
      configStub.get.withArgs("logLevel", DEFAULT_LOG_LEVEL).returns(DEFAULT_LOG_LEVEL);

      // Act
      const config = getConfiguration();

      // Assert
      expect(config).to.deep.equal({
        enabled: DEFAULT_ENABLED,
        lintOnSave: DEFAULT_LINT_ON_SAVE,
        lintOnChange: DEFAULT_LINT_ON_CHANGE,
        logLevel: DEFAULT_LOG_LEVEL,
      });
      expect(getConfigurationStub).to.have.been.calledWith(KEEP_SORTED_CONFIG_NAMESPACE);
    });

    it("should return configuration with custom values", () => {
      // Arrange
      configStub.get.withArgs("enabled", DEFAULT_ENABLED).returns(false);
      configStub.get.withArgs("lintOnSave", DEFAULT_LINT_ON_SAVE).returns(false);
      configStub.get.withArgs("lintOnChange", DEFAULT_LINT_ON_CHANGE).returns(false);
      configStub.get.withArgs("logLevel", DEFAULT_LOG_LEVEL).returns(CUSTOM_LOG_LEVEL);

      // Act
      const config = getConfiguration();

      // Assert
      expect(config).to.deep.equal({
        enabled: false,
        lintOnSave: false,
        lintOnChange: false,
        logLevel: CUSTOM_LOG_LEVEL,
      });
    });

    it("should return readonly configuration object", () => {
      // Arrange
      configStub.get.withArgs("enabled", DEFAULT_ENABLED).returns(DEFAULT_ENABLED);
      configStub.get.withArgs("lintOnSave", DEFAULT_LINT_ON_SAVE).returns(DEFAULT_LINT_ON_SAVE);
      configStub.get
        .withArgs("lintOnChange", DEFAULT_LINT_ON_CHANGE)
        .returns(DEFAULT_LINT_ON_CHANGE);
      configStub.get.withArgs("logLevel", DEFAULT_LOG_LEVEL).returns(DEFAULT_LOG_LEVEL);

      // Act
      // Act
      const config = getConfiguration();

      // Assert
      // TypeScript should enforce readonly at compile time
      // At runtime, we verify the object structure
      expect(config).to.have.property("enabled");
      expect(config).to.have.property("lintOnSave");
      expect(config).to.have.property("lintOnChange");
      expect(config).to.have.property("logLevel");
    });
  });

  describe("affectsConfiguration", () => {
    it("should return true when event affects keep-sorted configuration", () => {
      // Arrange
      const event: vscode.ConfigurationChangeEvent = {
        affectsConfiguration: sandbox.stub().returns(true),
      };

      // Act
      const result = affectsConfiguration(event);

      // Assert
      expect(result).to.equal(true);
      expect(event.affectsConfiguration).to.have.been.calledWith(KEEP_SORTED_CONFIG_NAMESPACE);
    });

    it("should return false when event does not affect keep-sorted configuration", () => {
      // Arrange
      const event: vscode.ConfigurationChangeEvent = {
        affectsConfiguration: sandbox.stub().returns(false),
      };

      // Act
      const result = affectsConfiguration(event);

      // Assert
      expect(result).to.equal(false);
      expect(event.affectsConfiguration).to.have.been.calledWith(KEEP_SORTED_CONFIG_NAMESPACE);
    });
  });

  describe("onDidChangeConfiguration", () => {
    let onDidChangeConfigurationStub: sinon.SinonStub;
    let disposableStub: vscode.Disposable;

    beforeEach(() => {
      disposableStub = { dispose: sandbox.stub() };
      onDidChangeConfigurationStub = sandbox.stub(vscode.workspace, "onDidChangeConfiguration");
      onDidChangeConfigurationStub.returns(disposableStub);
    });

    it("should register configuration change listener", () => {
      // Arrange
      const listener = sandbox.stub();

      // Act
      const disposable = onDidChangeConfiguration(listener);

      // Assert
      expect(onDidChangeConfigurationStub).to.have.been.calledOnce;
      expect(disposable).to.equal(disposableStub);
    });

    it("should invoke listener when keep-sorted configuration changes", () => {
      // Arrange
      const listener = sandbox.stub();
      const customConfig = {
        enabled: false,
        lintOnSave: true,
        lintOnChange: false,
        logLevel: "warn",
      };
      configStub.get.withArgs("enabled", DEFAULT_ENABLED).returns(customConfig.enabled);
      configStub.get.withArgs("lintOnSave", DEFAULT_LINT_ON_SAVE).returns(customConfig.lintOnSave);
      configStub.get
        .withArgs("lintOnChange", DEFAULT_LINT_ON_CHANGE)
        .returns(customConfig.lintOnChange);
      configStub.get.withArgs("logLevel", DEFAULT_LOG_LEVEL).returns(customConfig.logLevel);

      onDidChangeConfiguration(listener);

      // Get the registered callback
      const callback = onDidChangeConfigurationStub.firstCall.args[0];

      const event: vscode.ConfigurationChangeEvent = {
        affectsConfiguration: sandbox.stub().returns(true),
      };

      // Act
      callback(event);

      // Assert
      expect(listener).to.have.been.calledOnce;
      expect(listener).to.have.been.calledWith(customConfig);
    });

    it("should not invoke listener when non-keep-sorted configuration changes", () => {
      // Arrange
      const listener = sandbox.stub();

      onDidChangeConfiguration(listener);

      // Get the registered callback
      const callback = onDidChangeConfigurationStub.firstCall.args[0];

      const event: vscode.ConfigurationChangeEvent = {
        affectsConfiguration: sandbox.stub().returns(false),
      };

      // Act
      callback(event);

      // Assert
      expect(listener).to.not.have.been.called;
    });

    it("should return disposable that can be disposed", () => {
      // Arrange
      const listener = sandbox.stub();

      // Act
      const disposable = onDidChangeConfiguration(listener);
      disposable.dispose();

      // Assert
      expect(disposableStub.dispose).to.have.been.calledOnce;
    });
  });

  describe("KeepSortedConfiguration interface", () => {
    it("should define all required configuration properties", () => {
      const config: KeepSortedConfiguration = {
        enabled: true,
        lintOnSave: false,
        lintOnChange: true,
        logLevel: "debug",
      };

      expect(config.enabled).to.equal(true);
      expect(config.lintOnSave).to.equal(false);
      expect(config.lintOnChange).to.equal(true);
      expect(config.logLevel).to.equal("debug");
    });
  });
});
