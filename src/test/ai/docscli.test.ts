import { expect } from "chai";
import * as fs from "fs";
import { describe, it } from "mocha";
import * as path from "path";
import { DOCS_DIR } from "../../ai/docscli";
import { EXT_WORKSPACE_DIR } from "../testing";

describe("aidocscli", () => {
  it("should point at the repository's docs/ai directory", () => {
    // Act & Assert
    expect(DOCS_DIR).to.equal(path.join(EXT_WORKSPACE_DIR, "docs", "ai"));
    expect(fs.existsSync(path.join(DOCS_DIR, "README.md"))).to.equal(true);
  });
});
