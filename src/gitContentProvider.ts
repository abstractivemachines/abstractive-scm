import * as vscode from 'vscode';
import { GitService } from './git';

export const gitContentScheme = 'abstractive-scm';

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly git: GitService) {}

  provideTextDocumentContent(uri: vscode.Uri): vscode.ProviderResult<string> {
    const params = new URLSearchParams(uri.query);
    const ref = params.get('ref') ?? 'HEAD';
    const filePath = params.get('path') ?? uri.path.replace(/^\//, '');
    return this.git.fileAtRef(ref, filePath).catch(() => '');
  }
}

export function gitContentUri(ref: string, filePath: string): vscode.Uri {
  const params = new URLSearchParams({ ref, path: filePath });
  return vscode.Uri.parse(`${gitContentScheme}:/${encodeURIComponent(filePath)}?${params.toString()}`);
}

