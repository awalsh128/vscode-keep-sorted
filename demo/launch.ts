import { runTests } from "@vscode/test-electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const root = path.resolve(__dirname, "../.."); // demo/out/launch.js -> repository root

async function main(): Promise<void> {
  // VS Code terminals set it; Electron must start as an editor.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  // A short path: a long --user-data-dir can break VS Code's IPC socket on Linux.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "demo-"));
  const userData = path.join(work, "user");
  const workspace = path.join(work, "workspace");
  fs.mkdirSync(path.join(userData, "User"), { recursive: true });
  fs.copyFileSync(
    path.join(root, "demo/profile/settings.json"),
    path.join(userData, "User/settings.json")
  );
  fs.cpSync(path.join(root, "demo/workspace"), workspace, { recursive: true });
  try {
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(root, "demo/out/index.js"),
      extensionTestsEnv: {
        DEMO_EXTENSION_ID: `${pkg.publisher}.${pkg.name}`,
        DEMO_SCENE: process.env.DEMO_SCENE ?? "",
        DEMO_READY_FILE: process.env.DEMO_READY_FILE ?? "",
        DEMO_DONE_FILE: process.env.DEMO_DONE_FILE ?? "",
      },
      launchArgs: [
        workspace,
        "--user-data-dir",
        userData,
        "--extensions-dir",
        path.join(work, "extensions"), // empty: only the extension under development loads
        "--disable-workspace-trust",
        "--disable-telemetry",
        "--disable-gpu",
        "--ozone-platform=x11",
        "--skip-welcome",
        "--skip-release-notes",
      ],
    });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
