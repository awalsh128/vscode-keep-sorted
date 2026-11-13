import * as path from "path";
import * as vscode from "vscode";
import { CommandHandlers } from "../commands";
import { errorMessage } from "../common";
import { getConfig, wrapPreferencesProblems } from "../configuration";
import { extensionId, logAndGetError, logger } from "../instrumentation";
import * as workspace from "../workspace";
import {
  BlockProblem,
  confirmation,
  resolveToolInput,
  runTool,
  TOOL_SPECS,
  ToolFile,
  ToolHost,
  ToolInputError,
  ToolSpec,
} from "./tools";

/**
 * Converts the extension's diagnostics to tool problems with 1-based lines. Diagnostics end at the
 * start of the line after a block, so the end position's line is the block's last 1-based line.
 *
 * @param diagnostics The diagnostics to convert.
 *
 * @returns The problems.
 */
export function toBlockProblems(diagnostics: readonly vscode.Diagnostic[]): BlockProblem[] {
  return diagnostics.map((diagnostic) => ({
    startLine: diagnostic.range.start.line + 1,
    endLine: Math.max(diagnostic.range.start.line + 1, diagnostic.range.end.line),
    message: diagnostic.message,
  }));
}

/**
 * Resolves a tool's file input to a URI.
 *
 * @param input The tool input.
 * @param root The first workspace folder's path, if any.
 *
 * @returns The URI.
 *
 * @throws ToolInputError when a relative path is given without a workspace folder.
 */
export function toolInputUri(input: string, root: string | undefined): vscode.Uri {
  const target = resolveToolInput(input, root);
  return target.kind === "uri" ? vscode.Uri.parse(target.uri) : vscode.Uri.file(target.path);
}

/** Gives the shared tools access to VS Code documents, settings, and sort commands. */
export class VscodeToolHost implements ToolHost {
  readonly extensionVersion: string;
  readonly docsDir: string;
  private readonly diagnostics: vscode.DiagnosticCollection;
  private readonly editFactory: workspace.EditFactory;
  private readonly handlers: CommandHandlers;

  /**
   * Constructs a new VscodeToolHost.
   *
   * @param extensionPath The extension's install directory, which holds docs/ai.
   * @param diagnostics The extension's diagnostic collection.
   * @param editFactory Lints documents into the diagnostic collection.
   * @param handlers The sort command handlers.
   */
  constructor(
    extensionPath: string,
    diagnostics: vscode.DiagnosticCollection,
    editFactory: workspace.EditFactory,
    handlers: CommandHandlers
  ) {
    this.extensionVersion = extensionId.version;
    this.docsDir = path.join(extensionPath, "docs", "ai");
    this.diagnostics = diagnostics;
    this.editFactory = editFactory;
    this.handlers = handlers;
  }

  async resolve(input: string): Promise<ToolFile> {
    const uri = toolInputUri(input, workspace.rootPath());
    if (!workspace.isInScope(uri)) {
      throw new ToolInputError(
        `${input} is out of scope: it is excluded by keep-sorted.exclude or is not a file.`
      );
    }
    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(uri);
    } catch (err: Error | unknown) {
      throw new ToolInputError(`Cannot open ${input}: ${errorMessage(err)}`);
    }
    return {
      id: uri.toString(),
      relativePath: vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/"),
      languageId: document.languageId,
    };
  }

  async readText(file: ToolFile): Promise<string> {
    return (await this.document(file)).getText();
  }

  async writeText(file: ToolFile, text: string): Promise<void> {
    const document = await this.document(file);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
    if (!(await vscode.workspace.applyEdit(edit))) {
      throw new Error(`VS Code rejected the edit to ${file.relativePath}.`);
    }
  }

  async preferences(): Promise<{
    preferences: ReturnType<typeof getConfig>["wrapPreferences"];
    problems: readonly string[];
  }> {
    return { preferences: getConfig().wrapPreferences, problems: wrapPreferencesProblems() };
  }

  async problems(file: ToolFile): Promise<BlockProblem[]> {
    const document = await this.document(file);
    // Refreshing also keeps the Problems panel in step with the tool's edits.
    this.editFactory.refreshDiagnostics(document);
    return toBlockProblems(this.diagnostics.get(document.uri) ?? []);
  }

  async sortFile(file: ToolFile): Promise<boolean> {
    const document = await this.document(file);
    const before = document.getText();
    await this.handlers.sortFile.handle(document);
    return (await this.document(file)).getText() !== before;
  }

  async sortWorkspace(): Promise<{
    changed: string[];
    remaining: { file: string; problems: BlockProblem[] }[];
  }> {
    const before = new Map<string, string>();
    for (const uri of this.handlers.sortWorkspace.affectedUris()) {
      before.set(uri.toString(), (await vscode.workspace.openTextDocument(uri)).getText());
    }
    await this.handlers.sortWorkspace.handle();
    const changed: string[] = [];
    for (const [id, text] of before) {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(id));
      if (document.getText() !== text) {
        changed.push(vscode.workspace.asRelativePath(document.uri, false));
      }
    }
    const remaining: { file: string; problems: BlockProblem[] }[] = [];
    this.diagnostics.forEach((uri, diagnostics) => {
      if (diagnostics.length > 0) {
        remaining.push({
          file: vscode.workspace.asRelativePath(uri, false),
          problems: toBlockProblems(diagnostics),
        });
      }
    });
    return { changed, remaining };
  }

  private async document(file: ToolFile): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument(vscode.Uri.parse(file.id));
  }
}

/** Adapts one shared tool to the VS Code language model tool interface. */
export class KeepSortedLanguageModelTool implements vscode.LanguageModelTool<object> {
  private readonly spec: ToolSpec;
  private readonly host: ToolHost;

  /**
   * Constructs a new KeepSortedLanguageModelTool.
   *
   * @param spec The tool's definition.
   * @param host File access and sorting.
   */
  constructor(spec: ToolSpec, host: ToolHost) {
    this.spec = spec;
    this.host = host;
  }

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<object>
  ): vscode.PreparedToolInvocation {
    const prompt = confirmation(this.spec.name, options.input);
    return {
      invocationMessage: `${this.spec.displayName}`,
      confirmationMessages: prompt
        ? { title: prompt.title, message: new vscode.MarkdownString(prompt.message) }
        : undefined,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const text = await runTool(this.spec.name, options.input, this.host);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
    } catch (err: Error | unknown) {
      // VS Code reports a thrown error's message to the model, which can then correct its input.
      if (err instanceof ToolInputError) {
        logger.info(`${this.spec.name} refused: ${err.message}`);
        throw new Error(err.message, { cause: err });
      }
      throw logAndGetError(logger, err);
    }
  }
}

/** Registers the shared tools as VS Code language model tools while the extension is enabled. */
export class LanguageModelToolsRegistrant implements workspace.Registrant {
  readonly id = "languageModelTools";
  private readonly host: ToolHost;

  /**
   * Constructs a new LanguageModelToolsRegistrant.
   *
   * @param host File access and sorting for the tools.
   */
  constructor(host: ToolHost) {
    this.host = host;
  }

  async register(): Promise<vscode.Disposable> {
    // Editors built on VS Code without the language model API skip the tools.
    if (typeof vscode.lm?.registerTool !== "function") {
      logger.info("Language model tools API unavailable; skipping AI tool registration.");
      return new vscode.Disposable(() => {});
    }
    return vscode.Disposable.from(
      ...TOOL_SPECS.map((spec) =>
        vscode.lm.registerTool(spec.name, new KeepSortedLanguageModelTool(spec, this.host))
      )
    );
  }
}
