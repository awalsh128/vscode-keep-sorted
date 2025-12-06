import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { normalizeColor, requireEnv, loadLabelConfig, needsUpdate } from "../sync-labels";

// Test constants - values are arbitrary, only presence matters
const COLOR = "ff0000";
const COLOR_WITH_HASH = `#${COLOR}`;
const OTHER_COLOR = "00ff00";
const NAME = "test-label";
const DESCRIPTION = "any description";
const OTHER_DESCRIPTION = "other description";
const ENV_VALUE = "any-value";

describe("sync-labels", () => {
  describe("normalizeColor", () => {
    [
      { input: COLOR_WITH_HASH, expected: COLOR, description: "strips leading #" },
      { input: COLOR, expected: COLOR, description: "returns unchanged if no #" },
      { input: "", expected: "", description: "handles empty string" },
      {
        input: `#${COLOR_WITH_HASH}`,
        expected: COLOR_WITH_HASH,
        description: "removes only first #",
      },
    ].forEach(({ input, expected, description }) => {
      it(`should ${description}: "${input}" -> "${expected}"`, () => {
        expect(normalizeColor(input)).to.equal(expected);
      });
    });
  });

  describe("requireEnv", () => {
    const TEST_VAR = "TEST_SYNC_LABELS_VAR";

    afterEach(() => {
      delete process.env[TEST_VAR];
    });

    it("should return environment variable value when set", () => {
      process.env[TEST_VAR] = ENV_VALUE;
      expect(requireEnv(TEST_VAR)).to.equal(ENV_VALUE);
    });

    [
      { value: undefined as string | undefined, description: "not set" },
      { value: "", description: "empty string" },
    ].forEach(({ value, description }) => {
      it(`should throw error when environment variable is ${description}`, () => {
        if (value !== undefined) {
          process.env[TEST_VAR] = value;
        }
        expect(() => requireEnv(TEST_VAR)).to.throw(
          `Missing required environment variable: ${TEST_VAR}`
        );
      });
    });
  });

  describe("loadLabelConfig", () => {
    let tempDir: string;
    let tempFile: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-labels-test-"));
      tempFile = path.join(tempDir, "labels.yaml");
    });

    afterEach(() => {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    });

    it("should load labels from YAML file", () => {
      const yamlContent = `
labels:
  - name: ${NAME}
    color: "${COLOR_WITH_HASH}"
    description: ${DESCRIPTION}
  - name: other-label
    color: "${OTHER_COLOR}"
`;
      fs.writeFileSync(tempFile, yamlContent);

      const labels = loadLabelConfig(tempFile);

      expect(labels).to.have.length(2);
      expect(labels[0]).to.deep.equal({
        name: NAME,
        color: COLOR_WITH_HASH,
        description: DESCRIPTION,
      });
      expect(labels[1]).to.deep.equal({
        name: "other-label",
        color: OTHER_COLOR,
      });
    });

    it("should handle labels without description", () => {
      const yamlContent = `
labels:
  - name: ${NAME}
    color: "${COLOR}"
`;
      fs.writeFileSync(tempFile, yamlContent);

      const labels = loadLabelConfig(tempFile);

      expect(labels).to.have.length(1);
      expect(labels[0].description).to.equal(undefined);
    });

    it("should throw error for non-existent file", () => {
      expect(() => loadLabelConfig("/nonexistent/path/labels.yaml")).to.throw();
    });
  });

  describe("needsUpdate", () => {
    [
      {
        description: "label matches exactly",
        existing: { color: COLOR, description: DESCRIPTION },
        desired: { name: NAME, color: COLOR_WITH_HASH, description: DESCRIPTION },
        expected: false,
      },
      {
        description: "color matches without #",
        existing: { color: COLOR, description: DESCRIPTION },
        desired: { name: NAME, color: COLOR, description: DESCRIPTION },
        expected: false,
      },
      {
        description: "color differs",
        existing: { color: COLOR, description: DESCRIPTION },
        desired: { name: NAME, color: `#${OTHER_COLOR}`, description: DESCRIPTION },
        expected: true,
      },
      {
        description: "description differs",
        existing: { color: COLOR, description: DESCRIPTION },
        desired: { name: NAME, color: COLOR_WITH_HASH, description: OTHER_DESCRIPTION },
        expected: true,
      },
      {
        description: "existing description is null and desired has value",
        existing: { color: COLOR, description: null },
        desired: { name: NAME, color: COLOR_WITH_HASH, description: DESCRIPTION },
        expected: true,
      },
      {
        description: "existing is null and desired is undefined",
        existing: { color: COLOR, description: null },
        desired: { name: NAME, color: COLOR_WITH_HASH },
        expected: true,
      },
      {
        description: "existing is empty and desired is undefined",
        existing: { color: COLOR, description: "" },
        desired: { name: NAME, color: COLOR_WITH_HASH },
        expected: false,
      },
    ].forEach(({ description, existing, desired, expected }) => {
      it(`should returns false ${expected} when ${description}`, () => {
        expect(needsUpdate(existing, desired)).to.equal(expected);
      });
    });
  });
});
