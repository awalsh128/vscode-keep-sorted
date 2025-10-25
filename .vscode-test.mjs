import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/**/*.test.js",
  version: "stable",
  workspaceFolder: "./test-workspace",
  launchArgs: ["--disable-extensions", "--disable-workspace-trust"],
  mocha: {
    ui: "bdd",
    timeout: 20000,
    color: true,
  },
});
