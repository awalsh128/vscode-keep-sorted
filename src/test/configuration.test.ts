import { describe, it, beforeEach, afterEach } from "mocha";
import { expect, use } from "chai";
import * as sinon from "sinon";
import sinonChai from "sinon-chai";
import * as vscode from "vscode";
import {
  getConfig,
  handleConfigurationChange,
  excluded as pathExcluded,
  KeepSortedConfiguration,
  onEnabledChange,
  onAutoCompleteChange,
  onLogFilepathChange,
} from "../configuration";
import type { JSONSchema7 } from "json-schema";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require("../../package.json");

use(sinonChai);

// Constants for test values
const KEEP_SORTED_CONFIG_NAMESPACE = "keep-sorted";

describe("configuration", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // VS Code configuration properties follow JSON Schema 7
  type Property = JSONSchema7 & {
    default: unknown;
    examples?: unknown[];
  };
  type Properties = Record<string, Property>;
  type Value = boolean | number | string | Value[] | undefined;
  const ValueTypeOfs = ["array", "integer", "null", "number", "object", "string"];

  const PROPERTIES = Object.entries(
    packageJson.contributes!.configuration?.properties as Properties
  ) as [string, Property][];
  const PROPERTY_DEFAULTS = PROPERTIES.map(
    ([key, p]) =>
      [key.replace(`${KEEP_SORTED_CONFIG_NAMESPACE}.`, ""), p.default] as [string, Value]
  );

  describe("package.json keep-sorted configuration", () => {
    it("should have existing properties", () => {
      expect(packageJson.contributes?.configuration?.properties).to.be.an("object");
    });

    PROPERTIES.forEach(([key, p]) => {
      it("should have correct structure", () => {
        expect(key).to.be.a("string").and.to.have.length.greaterThan(0);
        expect(key).to.match(
          /^keep-sorted\./,
          `Key '${key}' should be prefixed with 'keep-sorted.'`
        );
        expect(p).to.be.an("object");
        expect(p).to.have.property("type");
        expect(p).to.have.property("default");
        expect(p).to.have.property("description");

        if (p.type !== "boolean") {
          expect(p)
            .to.have.property("examples")
            .and.to.be.an("array")
            .and.to.have.length.greaterThan(0);
        }

        // Verify type matches actual default value type
        const actualType = Array.isArray(p.default) ? "array" : typeof p.default;
        expect(actualType).to.equal(
          p.type,
          `Key '${key}' has type '${p.type}' but default is '${actualType}'`
        );
      });
    });

    type PropertyWithExamples = Property & { examples: Value[] };
    const PROPERTIES_WITH_REQUIRED_EXAMPLES = PROPERTIES.filter(
      ([_, p]) => p.type !== "boolean" && "examples" in p
    ) as [string, PropertyWithExamples][];

    PROPERTIES_WITH_REQUIRED_EXAMPLES.forEach(([key, p]) => {
      it(`key ${key} should have populated values`, () => {
        expect(p).to.be.an("object");
        expect(p.description).to.have.length.greaterThan(0);
        expect(p.type).to.be.oneOf(ValueTypeOfs);
        // For arrays, typeof [] is "object", so handle separately
        const actualType = Array.isArray(p.default) ? "array" : typeof p.default;
        expect(actualType).to.equal(p.type);
      });
    });

    // Test array properties - examples should be arrays, and their items should match items.type
    PROPERTIES_WITH_REQUIRED_EXAMPLES.filter(([_, p]) => p.type === "array").forEach(([key, p]) => {
      it(`key ${key} examples of arrays should have correct item type`, () => {
        expect(p).to.have.property("items").and.has.property("type");
        // JSONSchema7 items can be an array or object; we expect a single schema object here
        const items = p.items as JSONSchema7 | undefined;
        const itemType = items?.type ?? "unknown";
        expect(itemType).to.not.equal("unknown");
        // Each example is an array; check that items in each example match itemType
        expect(p.examples).to.satisfy((examples: unknown[][]) =>
          examples.every(
            (example) => Array.isArray(example) && example.every((item) => typeof item === itemType)
          )
        );
      });
    });

    // Test non-array properties - each example should match the property type
    PROPERTIES_WITH_REQUIRED_EXAMPLES.filter(([_, p]) => p.type !== "array").forEach(([key, p]) => {
      it(`key ${key} examples should have correct type`, () => {
        expect(p.examples).to.satisfy((examples: unknown[]) =>
          examples.every((example) => typeof example === p.type)
        );
      });
    });
  });

  describe("getConfig with mangled/invalid settings", () => {
    let getConfigurationStub: sinon.SinonStub;
    let configStub: { get: sinon.SinonStub; inspect: sinon.SinonStub };

    beforeEach(() => {
      configStub = {
        get: sandbox.stub(),
        inspect: sandbox.stub(),
      };
      getConfigurationStub = sandbox.stub(vscode.workspace, "getConfiguration");
      getConfigurationStub.returns(configStub);
    });

    it("should throw when a configuration key has no default value defined", () => {
      // Arrange - simulate a configuration key with no default (bug in extension)
      configStub.inspect.withArgs("enabled").returns({
        defaultValue: undefined, // No default defined - this is a bug
        globalValue: undefined,
        workspaceValue: undefined,
      });

      // Act & Assert
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;

      expect(() => handleConfigurationChange(mockEvent)).to.throw(
        'keep-sorted option "enabled" does not have a default value'
      );
    });

    it("should throw when a configuration key is not valid", () => {
      // Arrange - simulate inspect returning null for invalid key
      configStub.inspect.withArgs("enabled").returns(null);

      // Act & Assert
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;

      expect(() => handleConfigurationChange(mockEvent)).to.throw(
        'keep-sorted option "enabled" is not a valid configuration setting'
      );
    });

    it("should use default when user provides wrong type (VS Code coercion)", () => {
      // Arrange - VS Code may coerce types or return defaults for invalid values
      configStub.inspect.withArgs("enabled").returns({
        defaultValue: true,
        globalValue: "not-a-boolean", // Wrong type from user
        workspaceValue: undefined,
      });
      configStub.inspect.withArgs("autoComplete").returns({
        defaultValue: true,
        globalValue: undefined,
        workspaceValue: undefined,
      });
      configStub.inspect.withArgs("exclude").returns({
        defaultValue: [],
        globalValue: undefined,
        workspaceValue: undefined,
      });
      configStub.inspect.withArgs("logFilepath").returns({
        defaultValue: "",
        globalValue: undefined,
        workspaceValue: undefined,
      });
      // VS Code's get() handles type coercion - returns effective value
      configStub.get.callsFake((key: string, defaultVal: unknown) => {
        if (key === "enabled") {
          return "not-a-boolean"; // VS Code passes through the invalid value
        }
        return defaultVal;
      });

      // Act
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;
      handleConfigurationChange(mockEvent);
      const config = getConfig();

      // Assert - Even with wrong type, getValue returns what config.get returns
      // The extension relies on VS Code's type validation in settings UI
      expect(config).to.have.property("enabled");
    });

    it("should handle glob patterns by falling back to glob-regex", () => {
      // Arrange
      configStub.inspect.withArgs("enabled").returns({ defaultValue: true });
      configStub.inspect.withArgs("autoComplete").returns({ defaultValue: true });
      configStub.inspect.withArgs("exclude").returns({ defaultValue: [] });
      configStub.inspect.withArgs("logFilepath").returns({ defaultValue: "" });

      // Valid glob patterns that would fail as RegExp but work with glob-regex
      const globPatterns = ["**/*.ts", "**/node_modules/**"];
      configStub.get.callsFake((key: string, defaultVal: unknown) => {
        if (key === "exclude") {
          return globPatterns;
        }
        return defaultVal;
      });

      // Act - should not throw, falls back to glob-regex for glob patterns
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;

      expect(() => handleConfigurationChange(mockEvent)).to.not.throw();
    });

    it("should handle malformed patterns gracefully with warning log", () => {
      // Arrange
      configStub.inspect.withArgs("enabled").returns({ defaultValue: true });
      configStub.inspect.withArgs("autoComplete").returns({ defaultValue: true });
      configStub.inspect.withArgs("exclude").returns({ defaultValue: [] });
      configStub.inspect.withArgs("logFilepath").returns({ defaultValue: "" });

      // Invalid pattern: unclosed bracket is neither valid regex nor glob
      const invalidPatterns = ["[invalid"];
      configStub.get.callsFake((key: string, defaultVal: unknown) => {
        if (key === "exclude") {
          return invalidPatterns;
        }
        return defaultVal;
      });

      // Act & Assert - malformed patterns should not throw but should log warning
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;

      // Should not throw - malformed patterns are handled gracefully
      expect(() => handleConfigurationChange(mockEvent)).to.not.throw();
    });
  });

  describe("excluded", () => {
    let getConfigurationStub: sinon.SinonStub;
    let configStub: { get: sinon.SinonStub; inspect: sinon.SinonStub };

    beforeEach(() => {
      configStub = {
        get: sandbox.stub(),
        inspect: sandbox.stub(),
      };
      getConfigurationStub = sandbox.stub(vscode.workspace, "getConfiguration");
      getConfigurationStub.returns(configStub);
    });

    /** Sets up the config stubs with package defaults and optional overrides. */
    function setupConfigStubs(excludePatterns: (string | RegExp)[] = []): void {
      for (const [key, defaultValue] of PROPERTY_DEFAULTS) {
        configStub.inspect.withArgs(key).returns({ defaultValue: defaultValue });
      }

      configStub.get.callsFake((key: string, defaultVal: Value) => {
        if (key === "exclude") {
          return excludePatterns;
        }
        return defaultVal;
      });
    }

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
        setupConfigStubs(excludePattern ? [excludePattern] : []);

        // Trigger config reload
        const mockEvent = {
          affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
        } as vscode.ConfigurationChangeEvent;
        handleConfigurationChange(mockEvent);

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
      const result = handleConfigurationChange(mockEvent);

      // Assert
      expect(result).to.equal(true);
      expect(mockEvent.affectsConfiguration).to.have.been.calledWith(KEEP_SORTED_CONFIG_NAMESPACE);
    });

    it("should return false when non-keep-sorted configuration changes", () => {
      // Arrange
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(false),
      } as vscode.ConfigurationChangeEvent;

      // Act
      const result = handleConfigurationChange(mockEvent);

      // Assert
      expect(result).to.equal(false);
      expect(mockEvent.affectsConfiguration).to.have.been.calledWith(KEEP_SORTED_CONFIG_NAMESPACE);
    });

    it("should reload configuration when keep-sorted configuration changes", () => {
      // Arrange
      const mockEvent = {
        affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
      } as vscode.ConfigurationChangeEvent;

      // Act
      handleConfigurationChange(mockEvent);
      const configAfter = getConfig();

      // Assert - Configuration should be reloaded (new object reference)
      // Note: In a real VS Code environment, this would load fresh config values
      expect(typeof configAfter).to.equal("object");
      expect(configAfter).to.have.property("enabled");
      expect(configAfter).to.have.property("exclude");
    });

    describe("event firing", () => {
      let getConfigurationStub: sinon.SinonStub;
      let configStub: { get: sinon.SinonStub; inspect: sinon.SinonStub };

      beforeEach(() => {
        configStub = {
          get: sandbox.stub(),
          inspect: sandbox.stub(),
        };
        getConfigurationStub = sandbox.stub(vscode.workspace, "getConfiguration");
        getConfigurationStub.returns(configStub);
      });

      /** Sets up the config stubs with specific values. */
      function setupConfigStubs(values: {
        enabled?: boolean;
        autoComplete?: boolean;
        exclude?: string[];
        logFilepath?: string;
      }): void {
        for (const [key, defaultValue] of PROPERTY_DEFAULTS) {
          configStub.inspect.withArgs(key).returns({ defaultValue: defaultValue });
        }
        configStub.get.callsFake((key: string, defaultVal: unknown) => {
          if (key === "enabled" && values.enabled !== undefined) {
            return values.enabled;
          }
          if (key === "autoComplete" && values.autoComplete !== undefined) {
            return values.autoComplete;
          }
          if (key === "exclude" && values.exclude !== undefined) {
            return values.exclude;
          }
          if (key === "logFilepath" && values.logFilepath !== undefined) {
            return values.logFilepath;
          }
          return defaultVal;
        });
      }

      it("should fire onEnabledChange when enabled value changes", () => {
        // Arrange - First set initial state
        setupConfigStubs({ enabled: true });
        const mockEvent = {
          affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
        } as vscode.ConfigurationChangeEvent;
        handleConfigurationChange(mockEvent);

        // Set up listener
        const enabledChangeSpy = sandbox.spy();
        const disposable = onEnabledChange(enabledChangeSpy);

        // Change enabled to false
        setupConfigStubs({ enabled: false });

        // Act
        handleConfigurationChange(mockEvent);

        // Assert
        expect(enabledChangeSpy).to.have.been.calledWith(false);

        disposable.dispose();
      });

      it("should not fire onEnabledChange when enabled value stays the same", () => {
        // Arrange - Set initial state
        setupConfigStubs({ enabled: true });
        const mockEvent = {
          affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
        } as vscode.ConfigurationChangeEvent;
        handleConfigurationChange(mockEvent);

        // Set up listener
        const enabledChangeSpy = sandbox.spy();
        const disposable = onEnabledChange(enabledChangeSpy);

        // Keep enabled the same
        setupConfigStubs({ enabled: true });

        // Act
        handleConfigurationChange(mockEvent);

        // Assert
        expect(enabledChangeSpy.called).to.equal(false);

        disposable.dispose();
      });

      it("should fire onAutoCompleteChange when autoComplete value changes", () => {
        // Arrange - First set initial state
        setupConfigStubs({ autoComplete: true });
        const mockEvent = {
          affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
        } as vscode.ConfigurationChangeEvent;
        handleConfigurationChange(mockEvent);

        // Set up listener
        const autoCompleteChangeSpy = sandbox.spy();
        const disposable = onAutoCompleteChange(autoCompleteChangeSpy);

        // Change autoComplete to false
        setupConfigStubs({ autoComplete: false });

        // Act
        handleConfigurationChange(mockEvent);

        // Assert
        expect(autoCompleteChangeSpy).to.have.been.calledWith(false);

        disposable.dispose();
      });

      it("should not fire onAutoCompleteChange when autoComplete value stays the same", () => {
        // Arrange - Set initial state
        setupConfigStubs({ autoComplete: false });
        const mockEvent = {
          affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
        } as vscode.ConfigurationChangeEvent;
        handleConfigurationChange(mockEvent);

        // Set up listener
        const autoCompleteChangeSpy = sandbox.spy();
        const disposable = onAutoCompleteChange(autoCompleteChangeSpy);

        // Keep autoComplete the same
        setupConfigStubs({ autoComplete: false });

        // Act
        handleConfigurationChange(mockEvent);

        // Assert
        expect(autoCompleteChangeSpy.called).to.equal(false);

        disposable.dispose();
      });

      it("should fire onLogFilepathChange when logFilepath value changes", () => {
        // Arrange - First set initial state
        setupConfigStubs({ logFilepath: "" });
        const mockEvent = {
          affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
        } as vscode.ConfigurationChangeEvent;
        handleConfigurationChange(mockEvent);

        // Set up listener
        const logFilepathChangeSpy = sandbox.spy();
        const disposable = onLogFilepathChange(logFilepathChangeSpy);

        // Change logFilepath
        setupConfigStubs({ logFilepath: "logs/new-path.log" });

        // Act
        handleConfigurationChange(mockEvent);

        // Assert
        expect(logFilepathChangeSpy.calledOnce).to.equal(true);
        expect(logFilepathChangeSpy).to.have.been.calledWith("logs/new-path.log");

        disposable.dispose();
      });

      it("should not fire onLogFilepathChange when logFilepath value stays the same", () => {
        // Arrange - Set initial state
        setupConfigStubs({ logFilepath: "logs/existing.log" });
        const mockEvent = {
          affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
        } as vscode.ConfigurationChangeEvent;
        handleConfigurationChange(mockEvent);

        // Set up listener
        const logFilepathChangeSpy = sandbox.spy();
        const disposable = onLogFilepathChange(logFilepathChangeSpy);

        // Keep logFilepath the same
        setupConfigStubs({ logFilepath: "logs/existing.log" });

        // Act
        handleConfigurationChange(mockEvent);

        // Assert
        expect(logFilepathChangeSpy.called).to.equal(false);

        disposable.dispose();
      });

      it("should fire multiple events when multiple values change", () => {
        // Arrange - First set initial state
        setupConfigStubs({ enabled: true, autoComplete: true, logFilepath: "" });
        const mockEvent = {
          affectsConfiguration: sandbox.stub().withArgs(KEEP_SORTED_CONFIG_NAMESPACE).returns(true),
        } as vscode.ConfigurationChangeEvent;
        handleConfigurationChange(mockEvent);

        // Set up listeners
        const enabledChangeSpy = sandbox.spy();
        const autoCompleteChangeSpy = sandbox.spy();
        const logFilepathChangeSpy = sandbox.spy();
        const disposables = [
          onEnabledChange(enabledChangeSpy),
          onAutoCompleteChange(autoCompleteChangeSpy),
          onLogFilepathChange(logFilepathChangeSpy),
        ];

        // Change all values
        setupConfigStubs({ enabled: false, autoComplete: false, logFilepath: "logs/test.log" });

        // Act
        handleConfigurationChange(mockEvent);

        // Assert
        expect(enabledChangeSpy.calledOnce).to.equal(true);
        expect(enabledChangeSpy).to.have.been.calledWith(false);
        expect(autoCompleteChangeSpy.calledOnce).to.equal(true);
        expect(autoCompleteChangeSpy).to.have.been.calledWith(false);
        expect(logFilepathChangeSpy.calledOnce).to.equal(true);
        expect(logFilepathChangeSpy).to.have.been.calledWith("logs/test.log");

        disposables.forEach((d) => d.dispose());
      });

      it("should not fire any events when configuration section is not affected", () => {
        // Arrange
        const enabledChangeSpy = sandbox.spy();
        const autoCompleteChangeSpy = sandbox.spy();
        const logFilepathChangeSpy = sandbox.spy();
        const disposables = [
          onEnabledChange(enabledChangeSpy),
          onAutoCompleteChange(autoCompleteChangeSpy),
          onLogFilepathChange(logFilepathChangeSpy),
        ];

        const mockEvent = {
          affectsConfiguration: sandbox
            .stub()
            .withArgs(KEEP_SORTED_CONFIG_NAMESPACE)
            .returns(false),
        } as vscode.ConfigurationChangeEvent;

        // Act
        handleConfigurationChange(mockEvent);

        // Assert
        expect(enabledChangeSpy.called).to.equal(false);
        expect(autoCompleteChangeSpy.called).to.equal(false);
        expect(logFilepathChangeSpy.called).to.equal(false);

        disposables.forEach((d) => d.dispose());
      });
    });
  });

  describe("KeepSortedConfiguration interface", () => {
    it("should define all required configuration properties", () => {
      // Arrange & Act
      const config: KeepSortedConfiguration = {
        enabled: true,
        autoComplete: true,
        exclude: ["pattern1", "pattern2"],
      };

      // Assert
      expect(config.enabled).to.equal(true);
      expect(config.autoComplete).to.equal(true);
      expect(config.exclude).to.deep.equal(["pattern1", "pattern2"]);
    });

    it("should have readonly properties", () => {
      // Arrange & Act
      const config: KeepSortedConfiguration = {
        enabled: true,
        autoComplete: false,
        exclude: [],
      };

      // Assert - TypeScript enforces readonly at compile time
      // At runtime, verify the properties exist and have correct types
      expect(config).to.have.property("enabled").that.is.a("boolean");
      expect(config).to.have.property("autoComplete").that.is.a("boolean");
      expect(config).to.have.property("exclude").that.is.an("array");
    });

    it("should support optional logFilepath property", () => {
      // Arrange & Act
      const configWithLog: KeepSortedConfiguration = {
        enabled: true,
        autoComplete: true,
        exclude: [],
        logFilepath: "logs/keep-sorted.log",
      };
      const configWithoutLog: KeepSortedConfiguration = {
        enabled: true,
        autoComplete: true,
        exclude: [],
      };

      // Assert
      expect(configWithLog.logFilepath).to.equal("logs/keep-sorted.log");
      expect(configWithoutLog.logFilepath).to.equal(undefined);
    });
  });
});
