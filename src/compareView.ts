import * as vscode from 'vscode';
import { GitService } from './git';
import { BranchComparison, BranchComparisonCommit, BranchComparisonFile } from './models';

export async function showBranchComparison(context: vscode.ExtensionContext, git: GitService, targetBranch: string): Promise<void> {
  const comparison = await git.compareWithBranch(targetBranch);
  const panel = vscode.window.createWebviewPanel(
    'abstractiveScm.branchComparison',
    `Compare: ${comparison.currentBranch} and ${comparison.targetBranch}`,
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'activity-board-v3.svg');
  panel.webview.html = renderComparisonHtml(comparison);
}

function renderComparisonHtml(comparison: BranchComparison): string {
  const currentCommits = comparison.commits.filter((commit) => commit.side === 'current');
  const targetCommits = comparison.commits.filter((commit) => commit.side === 'target');
  const files = comparison.files.map(renderFileRow).join('') || '<div class="empty">No file differences.</div>';

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
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      font-weight: 600;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1px;
      background: var(--vscode-sideBar-border);
      border-bottom: 1px solid var(--vscode-sideBar-border);
    }
    .metric {
      background: var(--vscode-editor-background);
      padding: 12px 16px;
    }
    .metric strong {
      display: block;
      font-size: 20px;
      line-height: 1.2;
    }
    .metric span {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 1px;
      background: var(--vscode-sideBar-border);
    }
    section {
      min-width: 0;
      background: var(--vscode-editor-background);
    }
    h2 {
      margin: 0;
      padding: 10px 16px;
      font-size: 13px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
    }
    .commit,
    .file {
      display: grid;
      grid-template-columns: 76px minmax(0, 1fr);
      gap: 10px;
      padding: 7px 16px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
    }
    .hash,
    .status {
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      font-size: 12px;
    }
    .subject,
    .path {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .old {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      margin-top: 2px;
    }
    .files {
      grid-column: 1 / -1;
    }
    .empty {
      padding: 12px 16px;
      color: var(--vscode-descriptionForeground);
    }
    @media (max-width: 720px) {
      .summary,
      main {
        display: block;
      }
    }
  </style>
</head>
<body>
  <header>${escapeHtml(comparison.currentBranch)} compared with ${escapeHtml(comparison.targetBranch)}</header>
  <div class="summary">
    <div class="metric"><strong>${currentCommits.length}</strong><span>commits only on ${escapeHtml(comparison.currentBranch)}</span></div>
    <div class="metric"><strong>${targetCommits.length}</strong><span>commits only on ${escapeHtml(comparison.targetBranch)}</span></div>
    <div class="metric"><strong>${comparison.files.length}</strong><span>changed files</span></div>
  </div>
  <main>
    <section>
      <h2>${escapeHtml(comparison.currentBranch)}</h2>
      ${renderCommitRows(currentCommits)}
    </section>
    <section>
      <h2>${escapeHtml(comparison.targetBranch)}</h2>
      ${renderCommitRows(targetCommits)}
    </section>
    <section class="files">
      <h2>Files changed from merge base to ${escapeHtml(comparison.currentBranch)}</h2>
      ${files}
    </section>
  </main>
</body>
</html>`;
}

function renderCommitRows(commits: BranchComparisonCommit[]): string {
  return commits.map((commit) => `<div class="commit">
    <div class="hash">${escapeHtml(commit.shortHash)}</div>
    <div class="subject">${escapeHtml(commit.subject)}</div>
  </div>`).join('') || '<div class="empty">No unique commits.</div>';
}

function renderFileRow(file: BranchComparisonFile): string {
  const previous = file.originalPath ? `<div class="old">${escapeHtml(file.originalPath)}</div>` : '';
  return `<div class="file">
    <div class="status">${escapeHtml(file.status)}</div>
    <div><div class="path">${escapeHtml(file.filePath)}</div>${previous}</div>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
