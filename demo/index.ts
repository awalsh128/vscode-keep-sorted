import * as fs from "node:fs";
import * as vscode from "vscode";
import { sleep } from "./helpers";
import { resetState } from "./reset";
import { scenes } from "./scenes";

export interface Scene {
  name: string;
  /** Language IDs whose `[language]` overrides the scene may set, so reset can clear them. */
  languages?: string[];
  run(): Promise<void>;
}

/** The extension-host test entry point. */
export async function run(): Promise<void> {
  const extensionId = process.env.DEMO_EXTENSION_ID!;
  const scene = scenes.find((candidate) => candidate.name === process.env.DEMO_SCENE);
  if (!scene) {
    throw new Error(`Unknown scene ${process.env.DEMO_SCENE}`);
  }

  await vscode.extensions.getExtension(extensionId)?.activate();
  await resetState(extensionId, scene.languages);
  await sleep(1500); // let the window settle
  fs.writeFileSync(process.env.DEMO_READY_FILE!, ""); // record.sh starts filming now
  await sleep(1000); // lead-in
  try {
    await scene.run();
    await sleep(1500); // hold on the result
    fs.writeFileSync(process.env.DEMO_DONE_FILE!, ""); // record.sh stops filming now
    await sleep(1500); // grace: the recorder stops before the reset below clears the screen
  } finally {
    await resetState(extensionId, scene.languages);
  }
}
