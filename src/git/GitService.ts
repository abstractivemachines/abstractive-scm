import * as path from 'path';
import { promises as fs } from 'fs';
import type { Dirent } from 'fs';
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
      const candidates = [folder.uri.fsPath, ...(await gitRootCandidates(folder.uri.fsPath))];
      for (const candidate of candidates) {
        try {
          const root = (await runGit(candidate, ['rev-parse', '--show-toplevel'])).trim();
          if (root) {
            roots.add(root);
          }
        } catch {
          // Try the next candidate.
        }
      }
    }

    return Array.from(roots)
      .sort((left, right) => left.localeCompare(right))
      .map((root) => new GitService(root));
  }

  get rootUri(): vscode.Uri {
    return vscode.Uri.file(this.root);
  }

  toWorkspaceUri(filePath: string): vscode.Uri {
    return vscode.Uri.file(this.toWorkspacePath(filePath));
  }
}

const ignoredRepositoryScanDirectories = new Set([
  '.git',
  '.hg',
  '.svn',
  '.vscode-test',
  '.yarn',
  'dist',
  'node_modules',
  'out'
]);

async function gitRootCandidates(workspaceRoot: string): Promise<string[]> {
  const roots = new Set<string>();

  async function visit(directory: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.name === '.git')) {
      roots.add(directory);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || ignoredRepositoryScanDirectories.has(entry.name)) {
        continue;
      }

      await visit(path.join(directory, entry.name));
    }
  }

  await visit(workspaceRoot);
  return Array.from(roots);
}
