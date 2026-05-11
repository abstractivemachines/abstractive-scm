import * as vscode from 'vscode';

export class RefreshCoordinator implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(gitRoot: string, private readonly refresh: () => Promise<void>) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(gitRoot, '**/*'));
    const gitWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(gitRoot, '.git/{HEAD,index,packed-refs,refs/**}'));
    this.disposables.push(
      watcher,
      gitWatcher,
      watcher.onDidCreate(() => this.schedule()),
      watcher.onDidChange(() => this.schedule()),
      watcher.onDidDelete(() => this.schedule()),
      gitWatcher.onDidCreate(() => this.schedule()),
      gitWatcher.onDidChange(() => this.schedule()),
      gitWatcher.onDidDelete(() => this.schedule())
    );
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private schedule(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => void this.refresh(), 300);
  }
}
