import * as vscode from 'vscode';
import { GitService } from './git';
import { GitCommit } from './models';

export class LogProvider implements vscode.TreeDataProvider<CommitNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<CommitNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly git: GitService) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: CommitNode): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<CommitNode[]> {
    const limit = vscode.workspace.getConfiguration('abstractiveScm').get<number>('maxLogEntries', 75);
    const commits = await this.git.log(limit);
    return commits.map((commit) => new CommitNode(commit));
  }
}

export class CommitNode extends vscode.TreeItem {
  constructor(readonly commit: GitCommit) {
    const refs = compactRefs(commit.refs);
    super(`${commit.shortHash} ${commit.subject}${refs ? `  ${refs}` : ''}`, vscode.TreeItemCollapsibleState.None);
    this.description = `${commit.author}  ${formatShortDate(commit.date)}`;
    this.tooltip = [
      commit.hash,
      commit.subject,
      `Author: ${commit.author}`,
      `Date: ${new Date(commit.date).toLocaleString()}`,
      commit.refs ? `Refs: ${cleanRefs(commit.refs)}` : ''
    ].filter(Boolean).join('\n');
    this.contextValue = 'commit';
    this.iconPath = new vscode.ThemeIcon('git-commit');
    this.command = {
      command: 'abstractiveScm.showCommitDetails',
      title: 'Show Commit Details',
      arguments: [this]
    };
  }
}

export async function showLogWebview(context: vscode.ExtensionContext, git: GitService): Promise<void> {
  const limit = vscode.workspace.getConfiguration('abstractiveScm').get<number>('maxLogEntries', 75);
  const commits = await git.log(limit);
  const panel = vscode.window.createWebviewPanel(
    'abstractiveScm.logPanel',
    'Git Log',
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'activity-branch.svg');
  panel.webview.html = renderLogHtml(commits);
}

export async function showCommitDetails(commit: GitCommit): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    language: 'git-commit',
    content: [
      `commit ${commit.hash}`,
      `Author: ${commit.author}`,
      `Date:   ${new Date(commit.date).toLocaleString()}`,
      commit.refs ? `Refs:   ${cleanRefs(commit.refs)}` : '',
      '',
      commit.subject
    ]
      .filter((line, index) => index !== 3 || Boolean(line))
      .join('\n')
  });
  await vscode.window.showTextDocument(document, { preview: true });
}

function renderLogHtml(commits: GitCommit[]): string {
  const rows = commits
    .map((commit) => {
      const refs = commit.refs ? `<span class="refs">${escapeHtml(compactRefs(commit.refs))}</span>` : '';
      return `<article class="commit">
        <div class="hash">${escapeHtml(commit.shortHash)}</div>
        <div class="message">
          <div class="subject">${escapeHtml(commit.subject)} ${refs}</div>
          <div class="meta">${escapeHtml(commit.author)} · ${escapeHtml(new Date(commit.date).toLocaleString())}</div>
        </div>
      </article>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 10px 16px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      background: var(--vscode-editor-background);
      font-weight: 600;
    }
    .commit {
      display: grid;
      grid-template-columns: 84px minmax(0, 1fr);
      gap: 12px;
      align-items: baseline;
      padding: 9px 16px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
    }
    .hash {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .subject {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      margin-top: 2px;
    }
    .refs {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      margin-left: 8px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <header>Git Log</header>
  <main>${rows}</main>
</body>
</html>`;
}

function cleanRefs(refs: string): string {
  return refs
    .split(',')
    .map((ref) => ref.trim())
    .filter((ref) => ref && ref !== 'origin/HEAD')
    .join(', ');
}

function compactRefs(refs: string): string {
  const cleaned = cleanRefs(refs);
  if (!cleaned) {
    return '';
  }

  return cleaned
    .split(',')
    .map((ref) => ref.trim())
    .map((ref) => ref.startsWith('HEAD -> ') ? ref.slice('HEAD -> '.length) : ref)
    .map((ref) => ref.startsWith('origin/') ? ref.slice('origin/'.length) : ref)
    .slice(0, 3)
    .join(', ');
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
