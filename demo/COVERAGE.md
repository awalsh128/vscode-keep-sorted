# Demo coverage

Every feature id from `python3 <vsce-demo skill>/scripts/inventory.py`, and the scene that shows it.
Record one scene with `demo/record.sh <scene>` after `node demo/build.mjs`; GIFs land in
`media/demo/`.

| Feature                                        | Scene                    | Driven by                                    | Reset                             |
| ---------------------------------------------- | ------------------------ | -------------------------------------------- | --------------------------------- |
| `command:keep-sorted.fixFile`                  | sort-file-command        | Command Palette (API `quickOpen`)            | reverts the edit                  |
| `menu:commandPalette:keep-sorted.fixFile`      | sort-file-command        | Command Palette                              | reverts the edit                  |
| `command:keep-sorted.fixWorkspace`             | sort-workspace           | Command Palette                              | reverts both files                |
| `menu:commandPalette:keep-sorted.fixWorkspace` | sort-workspace           | Command Palette                              | reverts both files                |
| `source:createDiagnosticCollection`            | sort-quick-fix           | API (open file, Problems panel)              | closes panel                      |
| `source:registerCodeActionsProvider`           | sort-quick-fix           | API (`quickFix`, `acceptSelectedCodeAction`) | reverts the edit                  |
| `source:registerCodeActionsProvider`           | sort-on-save             | API (`files.save`)                           | clears `editor.codeActionsOnSave` |
| `source:onDidOpenTextDocument`                 | sort-file-command        | API                                          | none                              |
| `source:onDidChangeTextDocument`               | sort-on-save             | API (`type`)                                 | reverts the edit                  |
| `source:onDidSaveTextDocument`                 | sort-on-save             | API (`files.save`)                           | clears `editor.codeActionsOnSave` |
| `source:registerCompletionItemProvider`        | options-completion-hover | API (`triggerSuggest`, `type`)               | reverts the edit                  |
| `setting:keep-sorted.autoComplete`             | options-completion-hover | API                                          | none                              |
| `source:registerHoverProvider`                 | options-completion-hover | API (`showHover`)                            | reverts the edit                  |

## Not demoed

- `activation:onStartupFinished`: not a scene; the extension is already active when the window
  settles.
- `command:keep-sorted.addAiInstructions`: writes AGENTS.md, a skill or an MCP config into the
  workspace and may open a terminal; needs Node.js and user choices that vary by machine.
- `menu:commandPalette:keep-sorted.addAiInstructions`: same command as above.
- `lmTool:keepSorted_getGuide`: needs a signed-in Copilot model to call it; no visible effect
  without one.
- `lmTool:keepSorted_getPreferences`: needs a signed-in Copilot model to call it.
- `lmTool:keepSorted_run`: needs a signed-in Copilot model to call it.
- `lmTool:keepSorted_wrapRange`: needs a signed-in Copilot model to call it.
- `setting:keep-sorted.enabled`: shows only that the warnings from the other scenes disappear.
- `setting:keep-sorted.exclude`: edits workspace settings through a quick fix; effect is the
  warnings clearing, which the other scenes already show.
- `setting:keep-sorted.logFilepath`: writes a log file; no visible effect in the editor.
- `setting:keep-sorted.wrap.preferences`: only read by the AI tools, which need a signed-in model.
- `source:createTerminal`: part of Add AI Instructions.
- `source:onDidCloseTextDocument`: MCP installer bookkeeping with no visible effect.
- `source:registerTextDocumentContentProvider`: part of Add AI Instructions (the diff preview).
- `source:registerTool`: the language model tools above.
- `source:showErrorMessage`: error path of the commands; not shown on a healthy run.
- `source:showInformationMessage`: part of Add AI Instructions and the sort commands' confirmations.
- `source:showQuickPick`: part of Add AI Instructions.
- `source:showWarningMessage`: error path of the commands; not shown on a healthy run.
