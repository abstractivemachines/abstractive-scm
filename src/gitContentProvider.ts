import * as vscode from 'vscode';
import { GitService, RepositoryManager } from './git';

export const gitContentScheme = 'abstractive-scm';

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly repository: GitService | RepositoryManager) {}

  provideTextDocumentContent(uri: vscode.Uri): vscode.ProviderResult<string> {
    const params = new URLSearchParams(uri.query);
    const ref = params.get('ref') ?? 'HEAD';
    const filePath = params.get('path') ?? uri.path.replace(/^\//, '');
    const repoRoot = params.get('repo') ?? undefined;
    const git = this.repository instanceof RepositoryManager
      ? this.repository.repositoryForRoot(repoRoot) ?? this.repository.activeRepository
      : this.repository;
    return git.fileAtRef(ref, filePath).catch(() => '');
  }
}

export function gitContentUri(ref: string, filePath: string, repoRoot?: string): vscode.Uri {
  const params = new URLSearchParams({ ref, path: filePath });
  if (repoRoot) {
    params.set('repo', repoRoot);
  }
  return vscode.Uri.parse(`${gitContentScheme}:/${encodeURIComponent(filePath)}?${params.toString()}`);
}
