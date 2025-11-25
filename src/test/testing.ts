import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

export const EXT_WORKSPACE_DIR = path.resolve(__dirname, "../../");
export const TEST_WORKSPACE_DIR = path.resolve(__dirname, "../../test-workspace");
export const TEST_LOGS_DIR = path.resolve(EXT_WORKSPACE_DIR, "src/test/logs");

const ENCODING = "utf8";

export class TestLogs {
  private readonly outputLogDir: string;
  private readonly filepath: string;

  private constructor(outputLogDir: string, logFilepath: string) {
    this.outputLogDir = outputLogDir;
    console.info(`TestLogs initialized with log filepath: ${logFilepath}`);
    this.filepath = logFilepath;
  }

  static create(outputLogDir: string, testWorkspaceDir: string): TestLogs {
    return new TestLogs(outputLogDir, TestLogs.logFilepath(testWorkspaceDir));
  }

  private static logFilepath(testWorkspaceDir: string): string {
    // deserialize test workspace .vscode/settings.json and export relevant settings as env vars
    const settingsPath = path.resolve(testWorkspaceDir, ".vscode", "settings.json");
    if (!fs.existsSync(settingsPath)) {
      throw new Error("No test workspace settings.json found at " + settingsPath);
    }
    try {
      const raw = fs.readFileSync(settingsPath, { encoding: ENCODING });
      const settings = JSON.parse(raw);
      const relativeLogFilepath = settings?.["keep-sorted.logFilepath"];
      if (!relativeLogFilepath) {
        throw new Error(
          "keep-sorted.logFilepath setting not found in test workspace settings.json"
        );
      }
      return path.join(testWorkspaceDir, relativeLogFilepath);
    } catch (err) {
      console.warn("Failed to read/parse test workspace settings.json:", err);
      throw err;
    }
  }

  private testFilepath(rawTitle: string | null): string {
    const fileSuffix = (rawTitle ?? "unknown_test").replace(/[^A-Za-z0-9-]+/g, "_");
    return path.join(this.outputLogDir, `${fileSuffix}.log`);
  }

  rotate(currentTest: Mocha.Test | undefined): void {
    try {
      if (!fs.existsSync(this.filepath) || fs.lstatSync(this.filepath).size === 0) {
        return;
      }
      fs.mkdirSync(this.outputLogDir, { recursive: true });
      const content = fs.readFileSync(this.filepath, ENCODING);
      const testFilepath = this.testFilepath(currentTest?.fullTitle() ?? null);
      fs.writeFileSync(testFilepath, content, ENCODING);
      fs.appendFileSync(path.join(this.outputLogDir, "all.log"), content, ENCODING);
      fs.writeFileSync(this.filepath, "", ENCODING);
    } catch (err) {
      console.warn("Failed to rotate test logs", err);
    }
  }
}

/** Walks a directory synchronously and returns all file paths (absolute). */
function getFilepaths(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getFilepaths(filePath, files);
    } else if (entry.isFile()) {
      files.push(filePath);
    }
  }
  return files;
}

function createPathToFile(workspaceDir: string, excluded: string[]): Map<string, FileMetadata> {
  const hash = (content: string) =>
    crypto.createHash("sha256").update(content, ENCODING).digest("hex");

  return new Map(
    getFilepaths(workspaceDir).map((f) => {
      const relPath = path.relative(workspaceDir, f);
      const content = fs.readFileSync(f, { encoding: ENCODING });
      return [f, { path: f, hash: hash(content), content, excluded: excluded.includes(relPath) }];
    })
  );
}

interface FileMetadata {
  path: string;
  hash: string;
  content: string;
  excluded: boolean;
}

export class TestWorkspace {
  private readonly workspaceDir: string;
  private readonly excludeFilepaths: string[];
  private pathToFile: Map<string, FileMetadata>;

  private constructor(
    workspaceDir: string,
    pathToFile: Map<string, FileMetadata>,
    excludeFilepaths: string[] = []
  ) {
    this.workspaceDir = workspaceDir;
    this.pathToFile = pathToFile;
    this.excludeFilepaths = excludeFilepaths;
  }

  static createWithSnapshot(workspaceDir: string, excludeFilepaths: string[] = []): TestWorkspace {
    return new TestWorkspace(
      workspaceDir,
      createPathToFile(workspaceDir, excludeFilepaths),
      excludeFilepaths
    );
  }

  async restore(): Promise<boolean> {
    // Dynamically import vscode - only available when running inside extension host
    let vscode: typeof import("vscode") | undefined;
    try {
      vscode = await import("vscode");
    } catch {
      // Not running in extension host context, skip in-memory restoration
    }

    const current = createPathToFile(this.workspaceDir, this.excludeFilepaths);
    let restored = false;

    // Restore missing or modified files
    for (const [filePath, file] of this.pathToFile.entries()) {
      if (file.excluded) {
        continue;
      }
      const currentFile = current.get(filePath);
      if (currentFile?.hash === file.hash) {
        continue;
      }

      fs.writeFileSync(file.path, file.content, ENCODING);
      restored = true;
      await this.syncVscodeDocument(vscode, filePath, file.content);
    }

    // Remove files not in original snapshot
    for (const [filePath, file] of current.entries()) {
      if (file.excluded) {
        continue;
      }
      if (!this.pathToFile.has(filePath)) {
        fs.rmSync(file.path, { force: true });
        restored = true;
      }
    }

    return restored;
  }

  private async syncVscodeDocument(
    vscode: typeof import("vscode") | undefined,
    filePath: string,
    content: string
  ): Promise<void> {
    if (!vscode) {
      return;
    }
    try {
      const uri = vscode.Uri.file(filePath);
      const document = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === uri.fsPath);
      if (!document || document.isClosed || document.getText() === content) {
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(0, 0, document.lineCount, 0), content);
      await vscode.workspace.applyEdit(edit);
      await document.save();
    } catch {
      // Document may be disposed/closed, ignore - disk restore is sufficient
    }
  }

  snapshot() {
    this.pathToFile = createPathToFile(this.workspaceDir, this.excludeFilepaths);
  }
}
