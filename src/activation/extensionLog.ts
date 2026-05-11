import * as vscode from 'vscode';

export class ExtensionLog implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel('Abstractive SCM');

  dispose(): void {
    this.channel.dispose();
  }

  info(message: string): void {
    this.channel.appendLine(`[info] ${message}`);
  }

  error(message: string): void {
    this.channel.appendLine(`[error] ${message}`);
  }
}
