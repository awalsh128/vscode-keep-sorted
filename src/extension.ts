import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

interface KeepSortedConfig {
    enableAutoFix: boolean;
    enableDiagnostics: boolean;
    enabled: boolean;
    lintOnSave: boolean;
}

function getConfiguration(): KeepSortedConfig {
    const config = vscode.workspace.getConfiguration('keep-sorted');
    return {
        enableAutoFix: config.get('enableAutoFix', true),
        enableDiagnostics: config.get('enableDiagnostics', true),
        enabled: config.get('enabled', true),
        lintOnSave: config.get('lintOnSave', true)
    };
}

interface KeepSortedFinding {
    path: string;
    lines: {
        start: number;
        end: number;
    };
    message: string;
    fixes: Array<{
        replacements: Array<{
            lines: {
                start: number;
                end: number;
            };
            new_content: string;
        }>;
    }>;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Keep-Sorted extension is now active!');
    
    const diagnosticsCollection = vscode.languages.createDiagnosticCollection('keep-sorted');
    context.subscriptions.push(diagnosticsCollection);
    
    // Create a diagnostics provider
    const diagnosticsProvider = new KeepSortedDiagnosticsProvider(context, diagnosticsCollection);
    
    // Register commands
    const fixCommand = vscode.commands.registerCommand('keep-sorted.fix', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }
        
        await diagnosticsProvider.fixDocument(editor.document);
    });
    
    const lintCommand = vscode.commands.registerCommand('keep-sorted.lint', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }
        
        await diagnosticsProvider.lintDocument(editor.document);
    });
    
    // Register code action provider
    const codeActionProvider = new KeepSortedCodeActionProvider(context);
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('*', codeActionProvider, {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        })
    );
    
    // Register event listeners
    vscode.workspace.onDidSaveTextDocument(async (document) => {
        const config = getConfiguration();
        if (config.enabled && config.lintOnSave) {
            await diagnosticsProvider.lintDocument(document);
            if (config.enableAutoFix) {
                await diagnosticsProvider.fixDocument(document);
            }
        }
    });
    
    vscode.workspace.onDidChangeTextDocument(async (event) => {
        const config = getConfiguration();
        if (config.enabled) {
            // Debounce linting on change
            clearTimeout(diagnosticsProvider.changeTimer);
            diagnosticsProvider.changeTimer = setTimeout(async () => {
                await diagnosticsProvider.lintDocument(event.document);
            }, 1000);
        }
    });
    
    vscode.workspace.onDidCloseTextDocument((document) => {
        diagnosticsProvider.clearDiagnostics(document);
    });
    
    context.subscriptions.push(fixCommand, lintCommand);
    
    // Lint open documents on activation
    vscode.workspace.textDocuments.forEach(async (document) => {
        await diagnosticsProvider.lintDocument(document);
    });
}

class KeepSortedDiagnosticsProvider {
    public changeTimer: NodeJS.Timeout | undefined;
    
    constructor(
        private context: vscode.ExtensionContext,
        private diagnosticsCollection: vscode.DiagnosticCollection
    ) {}
    
    async lintDocument(document: vscode.TextDocument): Promise<void> {
        const config = getConfiguration();
        if (!config.enabled) {
            return;
        }
        
        try {
            const result = await this.runKeepSorted(document, 'lint');
            if (Array.isArray(result)) {
                if (config.enableDiagnostics) {
                    const diagnostics = this.findingsToDiagnostics(result);
                    this.diagnosticsCollection.set(document.uri, diagnostics);
                } else {
                    // Clear any existing diagnostics when diagnostics are disabled
                    this.diagnosticsCollection.delete(document.uri);
                }
            }
        } catch (error) {
            console.error('Error running keep-sorted lint:', error);
        }
    }
    
    async fixDocument(document: vscode.TextDocument): Promise<void> {
        try {
            const result = await this.runKeepSorted(document, 'fix');
            if (typeof result === 'string') {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                );
                edit.replace(document.uri, fullRange, result);
                await vscode.workspace.applyEdit(edit);
                vscode.window.showInformationMessage('Keep-sorted fixes applied');
            }
        } catch (error) {
            console.error('Error running keep-sorted fix:', error);
            vscode.window.showErrorMessage(`Keep-sorted fix failed: ${error}`);
        }
    }
    
    clearDiagnostics(document: vscode.TextDocument): void {
        this.diagnosticsCollection.delete(document.uri);
    }
    
    private async runKeepSorted(document: vscode.TextDocument, mode: 'lint' | 'fix'): Promise<KeepSortedFinding[] | string> {
        return new Promise((resolve, reject) => {
            const config = vscode.workspace.getConfiguration('keep-sorted');
            let binaryPath = config.get('binaryPath', '');
            
            if (!binaryPath) {
                // Use bundled binary - detect the right one for current platform
                binaryPath = this.getBundledBinaryPath();
                
                // Check if binary exists and is executable
                if (!fs.existsSync(binaryPath)) {
                    reject(new Error(`Keep-sorted binary not found at ${binaryPath}`));
                    return;
                }
            }
            
            const args = mode === 'lint' ? ['--lint', '-'] : ['-'];
            const child = spawn(binaryPath, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            child.on('close', (code) => {
                if (mode === 'lint') {
                    if (code === 0) {
                        // No issues found
                        resolve([]);
                    } else if (code === 1 && stdout) {
                        // Issues found, parse JSON output
                        try {
                            const findings: KeepSortedFinding[] = JSON.parse(stdout);
                            resolve(findings);
                        } catch (parseError) {
                            reject(new Error(`Failed to parse keep-sorted output: ${parseError}`));
                        }
                    } else {
                        reject(new Error(`Keep-sorted failed: ${stderr}`));
                    }
                } else {
                    // fix mode
                    if (code === 0 || code === 1) {
                        resolve(stdout);
                    } else {
                        reject(new Error(`Keep-sorted fix failed: ${stderr}`));
                    }
                }
            });
            
            child.on('error', (error) => {
                reject(new Error(`Failed to spawn keep-sorted: ${error.message}`));
            });
            
            // Write document content to stdin
            child.stdin.write(document.getText());
            child.stdin.end();
        });
    }
    
    private getBundledBinaryPath(): string {
        const platform = process.platform;
        let binaryName: string;
        
        switch (platform) {
            case 'win32':
                binaryName = 'keep-sorted.exe';
                break;
            case 'darwin':
            case 'linux':
                binaryName = 'keep-sorted';
                break;
            default:
                // Fallback to linux binary for unsupported platforms
                console.warn(`Unsupported platform ${platform}, trying linux binary`);
                binaryName = 'keep-sorted';
        }
        
        return path.join(this.context.extensionPath, 'bin', binaryName);
    }
    
    private findingsToDiagnostics(findings: KeepSortedFinding[]): vscode.Diagnostic[] {
        return findings.map(finding => {
            const range = new vscode.Range(
                finding.lines.start - 1, // Convert to 0-based
                0,
                finding.lines.end - 1,
                Number.MAX_SAFE_INTEGER
            );
            
            const diagnostic = new vscode.Diagnostic(
                range,
                finding.message,
                vscode.DiagnosticSeverity.Warning
            );
            
            diagnostic.source = 'keep-sorted';
            diagnostic.code = 'keep-sorted';
            
            return diagnostic;
        });
    }
}

class KeepSortedCodeActionProvider implements vscode.CodeActionProvider {
    constructor(private context: vscode.ExtensionContext) {}
    
    provideCodeActions(
        _document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const codeActions: vscode.CodeAction[] = [];
        
        // Check if there are keep-sorted diagnostics in the range
        const keepSortedDiagnostics = context.diagnostics.filter(
            diagnostic => diagnostic.source === 'keep-sorted'
        );
        
        if (keepSortedDiagnostics.length > 0) {
            // Create fix action
            const fixAction = new vscode.CodeAction(
                'Fix keep-sorted issues in file',
                vscode.CodeActionKind.QuickFix
            );
            fixAction.command = {
                command: 'keep-sorted.fix',
                title: 'Fix keep-sorted issues'
            };
            fixAction.diagnostics = keepSortedDiagnostics;
            codeActions.push(fixAction);
        }
        
        return codeActions;
    }
}

export function deactivate() {}
