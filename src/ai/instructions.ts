import * as fs from "fs";
import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { CommandHandler } from "../commands";
import { isRecord, oneLine, prettyJson, writeFileAtomic } from "../common";
import { extensionId } from "../instrumentation";
import * as workspace from "../workspace";
import { LaunchCommand, MCP_SERVER_NAME, McpServerInstaller } from "./mcpinstall";

/*
 * The opt-in "Add AI Instructions to Workspace" command. Workspace files get only path-free
 * content (an AGENTS.md section and an agent skill), so they are safe to commit. MCP server
 * registration holds a machine-specific path, so it goes to user-level agent configuration.
 */

/** Opens the AGENTS.md section the command manages. */
export const AGENTS_SECTION_BEGIN = "<!-- keep-sorted-ai:begin -->";

/** Where the workspace skill is written, which Claude Code and Copilot both discover. */
export const SKILL_PATH = ".claude/skills/keep-sorted/SKILL.md";

/** A file the command proposes to write. */
export interface ProposedFile {
  /** The file's absolute path. */
  readonly path: string;
  /** The path shown to the user. */
  readonly label: string;
  /** The file's current content, or undefined when it does not exist. */
  readonly current: string | undefined;
  /** The content to write. */
  readonly proposed: string;
}

/** What the user can set up. */
export type InstructionTarget = "agents" | "skill" | "claudeMcp" | "cursorMcp" | "copyMcp";

/** The editor interactions the command needs, replaceable in tests. */
export interface InstructionsUi {
  /** Asks which targets to set up; undefined when cancelled. */
  pickTargets(): Promise<InstructionTarget[] | undefined>;
  /** Shows the change and asks before writing; true when the user confirms. */
  confirmWrite(file: ProposedFile): Promise<boolean>;
  /** Types a command into a terminal without running it. */
  typeInTerminal(command: string): void;
  /** Copies text to the clipboard. */
  copy(text: string): Promise<void>;
  /** Shows a message. */
  info(message: string): void;
}

/**
 * Adds the managed section to AGENTS.md content.
 *
 * @param current The file's content, or undefined when it does not exist.
 * @param section The section, including its begin and end comments.
 *
 * @returns The new content, or undefined when the section is already there.
 */
export function withAgentsSection(
  current: string | undefined,
  section: string
): string | undefined {
  if (current === undefined) {
    return `# Agent instructions\n\n${section}`;
  }
  if (current.includes(AGENTS_SECTION_BEGIN)) {
    return undefined;
  }
  const separator = current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  return `${current}${separator}${section}`;
}

/**
 * Adds the server to an MCP client's JSON configuration, keeping the file's comments and layout.
 *
 * @param current The file's content, or undefined when it does not exist.
 * @param launch The command that starts the server.
 *
 * @returns The new content, or undefined when the same entry is already there.
 *
 * @throws Error when the existing file is not a JSON object.
 */
export function withMcpServer(
  current: string | undefined,
  launch: LaunchCommand
): string | undefined {
  const text = current ?? "{}\n";
  const parsed: unknown = parseJsonc(text);
  if (!isRecord(parsed)) {
    throw new Error("The MCP configuration is not a JSON object; fix it before adding a server.");
  }
  const servers = parsed.mcpServers;
  if (isRecord(servers) && JSON.stringify(servers[MCP_SERVER_NAME]) === JSON.stringify(launch)) {
    return undefined;
  }
  const edits = modify(text, ["mcpServers", MCP_SERVER_NAME], launch, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  return applyEdits(text, edits);
}

/**
 * Builds the Claude Code command that registers the server for every project of this user.
 *
 * @param launch The command that starts the server.
 *
 * @returns The shell command.
 */
export function claudeMcpAddCommand(launch: LaunchCommand): string {
  const quote = (arg: string): string => (/^[\w./:-]+$/.test(arg) ? arg : JSON.stringify(arg));
  return [
    "claude mcp add --scope user",
    MCP_SERVER_NAME,
    "--",
    launch.command,
    ...launch.args.map(quote),
  ].join(" ");
}

const TARGET_ITEMS: readonly (vscode.QuickPickItem & { target: InstructionTarget })[] = [
  {
    target: "agents",
    label: "$(book) AGENTS.md section",
    description: "workspace",
    detail: "Short rules for Codex, Cursor, Copilot, and other agents that read AGENTS.md.",
  },
  {
    target: "skill",
    label: "$(sparkle) Agent skill",
    description: SKILL_PATH,
    detail: "Loaded by Claude Code and Copilot when sorting comes up.",
  },
  {
    target: "claudeMcp",
    label: "$(server) MCP server for Claude Code",
    description: "user settings",
    detail: "Types `claude mcp add --scope user ...` into a terminal for you to run.",
  },
  {
    target: "cursorMcp",
    label: "$(server) MCP server for Cursor",
    description: "~/.cursor/mcp.json",
    detail: "Adds the server to your Cursor configuration after showing the change.",
  },
  {
    target: "copyMcp",
    label: "$(clippy) Copy MCP server configuration",
    description: "clipboard",
    detail: "For other MCP clients. Copilot already has the tools without it.",
  },
];

/** The scheme of the read-only documents that show proposed content in a diff. */
const PREVIEW_SCHEME = "keep-sorted-preview";

/** Serves proposed content to the diff editor. */
class PreviewContent implements vscode.TextDocumentContentProvider {
  readonly documents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.toString()) ?? "";
  }
}

/** The editor interactions backed by the VS Code UI. */
export class VscodeInstructionsUi implements InstructionsUi {
  private readonly preview = new PreviewContent();
  private registration: vscode.Disposable | undefined;

  async pickTargets(): Promise<InstructionTarget[] | undefined> {
    const picked = await vscode.window.showQuickPick([...TARGET_ITEMS], {
      canPickMany: true,
      title: `${extensionId.displayName}: Add AI Instructions`,
      placeHolder: "Choose what to set up. Each file change is shown before it is written.",
    });
    return picked?.map((item) => item.target);
  }

  async confirmWrite(file: ProposedFile): Promise<boolean> {
    this.registration ??= vscode.workspace.registerTextDocumentContentProvider(
      PREVIEW_SCHEME,
      this.preview
    );
    const before = vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: `${file.path}.current` });
    const after = vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: `${file.path}.proposed` });
    this.preview.documents.set(before.toString(), file.current ?? "");
    this.preview.documents.set(after.toString(), file.proposed);
    await vscode.commands.executeCommand(
      "vscode.diff",
      before,
      after,
      `${file.label} (proposed by Keep Sorted)`
    );
    const action = file.current === undefined ? "Create" : "Update";
    const choice = await vscode.window.showInformationMessage(
      `${action} ${file.label}?`,
      {
        modal: true,
        detail: oneLine`
          The diff editor shows the change. Nothing is written unless you choose ${action}.`,
      },
      action
    );
    return choice === action;
  }

  typeInTerminal(command: string): void {
    const terminal = vscode.window.createTerminal(`${extensionId.displayName}: MCP setup`);
    terminal.show();
    // Typed but not run, so the user reviews it and presses Enter.
    terminal.sendText(command, false);
  }

  async copy(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
  }

  info(message: string): void {
    void vscode.window.showInformationMessage(`${extensionId.displayName}: ${message}`);
  }
}

/** Handles "Keep Sorted: Add AI Instructions to Workspace". */
export class AddAiInstructionsCommandHandler extends CommandHandler {
  private readonly docsDir: string;
  private readonly installer: McpServerInstaller;
  private readonly ui: InstructionsUi;
  private readonly homeDir: string;

  /**
   * Constructs a new AddAiInstructionsCommandHandler.
   *
   * @param docsDir The extension's docs/ai directory, which holds the install templates.
   * @param installer Installs the MCP server for other agents.
   * @param ui The editor interactions.
   * @param homeDir The user's home directory, for user-level agent configuration.
   */
  constructor(
    docsDir: string,
    installer: McpServerInstaller,
    ui: InstructionsUi = new VscodeInstructionsUi(),
    homeDir: string = os.homedir()
  ) {
    super({
      title: `${extensionId.displayName}: Add AI Instructions to Workspace`,
      command: `${extensionId.name}.addAiInstructions`,
    });
    this.docsDir = docsDir;
    this.installer = installer;
    this.ui = ui;
    this.homeDir = homeDir;
  }

  async handle(): Promise<void> {
    const targets = await this.ui.pickTargets();
    for (const target of targets ?? []) {
      await this.setUp(target);
    }
  }

  private async setUp(target: InstructionTarget): Promise<void> {
    switch (target) {
      case "agents":
        return this.offer("AGENTS.md", (current) =>
          withAgentsSection(current, this.template("agents-section.md"))
        );
      case "skill":
        return this.offer(SKILL_PATH, (current) => {
          const skill = this.template("SKILL.md");
          return current === skill ? undefined : skill;
        });
      case "claudeMcp":
        this.installer.enable();
        this.ui.typeInTerminal(claudeMcpAddCommand(this.installer.launchCommand()));
        return this.ui.info("Review the command in the terminal, then press Enter to run it.");
      case "cursorMcp": {
        this.installer.enable();
        const file = path.join(this.homeDir, ".cursor", "mcp.json");
        return this.offerFile(file, "~/.cursor/mcp.json", (current) =>
          withMcpServer(current, this.installer.launchCommand())
        );
      }
      case "copyMcp":
        this.installer.enable();
        await this.ui.copy(
          prettyJson({ mcpServers: { [MCP_SERVER_NAME]: this.installer.launchCommand() } })
        );
        return this.ui.info("Copied the MCP server configuration.");
    }
  }

  /** Offers a change to a file relative to the first workspace folder. */
  private async offer(
    relativePath: string,
    change: (current: string | undefined) => string | undefined
  ): Promise<void> {
    const root = workspace.rootPath();
    if (!root) {
      return this.ui.info(`Open a folder first; ${relativePath} goes in the workspace root.`);
    }
    return this.offerFile(path.join(root, relativePath), relativePath, change);
  }

  /** Shows a proposed change and writes it only after the user confirms. */
  private async offerFile(
    file: string,
    label: string,
    change: (current: string | undefined) => string | undefined
  ): Promise<void> {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
    const proposed = change(current);
    if (proposed === undefined) {
      return this.ui.info(`${label} already has the Keep Sorted instructions.`);
    }
    if (!(await this.ui.confirmWrite({ path: file, label, current, proposed }))) {
      return this.ui.info(`Left ${label} unchanged.`);
    }
    writeFileAtomic(file, proposed);
    this.ui.info(`Wrote ${label}.`);
  }

  private template(name: string): string {
    return fs.readFileSync(path.join(this.docsDir, "install", name), "utf8");
  }
}
