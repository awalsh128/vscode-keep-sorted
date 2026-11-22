// Bundles the demo driver and launcher to demo/out/. The demo is never part of the .vsix.
import { build } from "esbuild";
await build({
  entryPoints: { index: "demo/index.ts", launch: "demo/launch.ts" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode", "@vscode/test-electron"],
  outdir: "demo/out",
});
