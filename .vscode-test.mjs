import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/**/*.test.js",
  version: "stable",
  workspaceFolder: "./test-workspace",
  launchArgs: ["--disable-extensions", "--disable-workspace-trust"],
  extensionDevelopmentPath: ".",
  extensionTestsPath: "./out/test/index",
  mocha: {
    ui: "bdd",
    timeout: 5000,
    color: true,
  },
});
