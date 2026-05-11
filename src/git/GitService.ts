import * as path from 'path';
import * as vscode from 'vscode';
import { GitRepository } from './GitRepository';
import { runGit } from './GitRunner';

export { GitError } from './GitRunner';

export class GitService extends GitRepository {
  static async discover(): Promise<GitService | undefined> {
    const repositories = await this.discoverAll();
    if (repositories.length === 0) {
      return undefined;
    }

    if (repositories.length === 1) {
      return repositories[0];
    }

    const activeFile = vscode.window.activeTextEditor?.document.uri;
    if (activeFile?.scheme === 'file') {
      const activeRepository = repositories.find((repository) => {
        const relative = path.relative(repository.root, activeFile.fsPath);
        return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
      });
      if (activeRepository) {
        return activeRepository;
      }
    }

    const pick = await vscode.window.showQuickPick(
      repositories.map((repository) => ({
        label: path.basename(repository.root),
        description: repository.root,
        repository
      })),
      { title: 'Abstractive SCM Repository', placeHolder: 'Select the Git repository to use' }
    );

    return pick?.repository ?? repositories[0];
  }

  static async discoverAll(): Promise<GitService[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const roots = new Set<string>();

    for (const folder of folders) {
      try {
        const root = (await runGit(folder.uri.fsPath, ['rev-parse', '--show-toplevel'])).trim();
        if (root) {
          roots.add(root);
        }
      } catch {
        // Try the next workspace folder.
      }
    }

    return Array.from(roots).map((root) => new GitService(root));
  }

  get rootUri(): vscode.Uri {
    return vscode.Uri.file(this.root);
  }

  toWorkspaceUri(filePath: string): vscode.Uri {
    return vscode.Uri.file(this.toWorkspacePath(filePath));
  }
}
