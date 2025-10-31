import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/**/*.test.js",
  version: "stable",
  workspaceFolder: "./test-workspace",
  launchArgs: ["--disable-workspace-trust"],
  extensionDevelopmentPath: ".",
  extensionTestsPath: "./out/test/suite/index.js",
  mocha: {
    ui: "bdd",
    timeout: 20000,
    color: true,
  },
});
