import { expect } from "chai";
import * as fs from "fs";
import { describe, it } from "mocha";
import * as path from "path";
import {
  languageModelToolsContribution,
  renderManifest,
  WRAP_PREFERENCES_SETTING,
} from "../../ai/manifest";
import { TOOL_SPECS } from "../../ai/tools";
import { EXT_WORKSPACE_DIR } from "../testing";

const MANIFEST = fs.readFileSync(path.join(EXT_WORKSPACE_DIR, "package.json"), "utf8");

/** Resolves a `#/...` JSON pointer against a settings schema, as VS Code does for `$ref`. */
function resolvePointer(root: unknown, pointer: string): unknown {
  return pointer
    .replace(/^#\//, "")
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node: unknown, part) => (node as Record<string, unknown>)[part], root);
}

describe("aimanifest", () => {
  describe("renderManifest", () => {
    const rendered = JSON.parse(renderManifest(MANIFEST));
    const properties = rendered.contributes.configuration.properties;
    const setting = properties[WRAP_PREFERENCES_SETTING];

    ["languages", "files"].forEach((group) => {
      it(`should point the ${group} layers at the options layer`, () => {
        // Act
        const ref = setting.properties[group].additionalProperties.$ref;

        // Assert: VS Code resolves the pointer against a schema whose properties are the settings.
        expect(resolvePointer({ properties }, ref)).to.equal(setting.properties.options);
      });
    });

    it("should keep the setting's hand-written fields", () => {
      // Arrange
      const current =
        JSON.parse(MANIFEST).contributes.configuration.properties[WRAP_PREFERENCES_SETTING];

      // Act & Assert
      for (const field of ["default", "order", "markdownDescription", "examples"]) {
        expect(setting[field], field).to.deep.equal(current[field]);
      }
    });

    it("should leave a current manifest unchanged", () => {
      // Act & Assert
      expect(renderManifest(MANIFEST), "run npm run gen:ai").to.equal(MANIFEST);
    });

    it("should refuse a manifest without the setting", () => {
      // Act & Assert
      expect(() => renderManifest('{"contributes": {}}')).to.throw(WRAP_PREFERENCES_SETTING);
    });
  });

  describe("languageModelToolsContribution", () => {
    const tools = languageModelToolsContribution();

    it("should contribute every tool spec", () => {
      // Act & Assert
      expect(tools.map((tool) => tool.name)).to.deep.equal(TOOL_SPECS.map((spec) => spec.name));
    });

    it("should hide the tools while the extension is disabled", () => {
      // Act & Assert
      expect(new Set(tools.map((tool) => tool.when))).to.deep.equal(
        new Set(["config.keep-sorted.enabled"])
      );
    });
  });
});
