import type { Scene } from "../index";
import { optionsCompletionHover } from "./options-completion-hover";
import { sortFileCommand } from "./sort-file-command";
import { sortOnSave } from "./sort-on-save";
import { sortQuickFix } from "./sort-quick-fix";
import { sortWorkspace } from "./sort-workspace";

/** Every scene, one import each. `check-coverage.py` fails on a scene missing here. */
export const scenes: Scene[] = [
  optionsCompletionHover,
  sortFileCommand,
  sortOnSave,
  sortQuickFix,
  sortWorkspace,
];
