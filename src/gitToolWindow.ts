import * as vscode from 'vscode';
import { GitService } from './git';
import { GitCommit, GitCommitFile } from './models';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'selectBranch'; branch: string }
  | { type: 'selectCommit'; hash: string }
  | { type: 'selectFile'; hash: string; file: GitCommitFile };

export class GitToolWindowProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'abstractiveGit.toolWindow';

  private view: vscode.WebviewView | undefined;
  private selectedBranch: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly git: GitService) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = renderHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => void this.handleMessage(message));
  }

  refresh(): void {
    if (this.view) {
      void this.loadInitial();
    }
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
      case 'refresh':
        await this.loadInitial();
        break;
      case 'selectBranch':
        await this.loadBranch(message.branch);
        break;
      case 'selectCommit':
        await this.loadCommit(message.hash);
        break;
      case 'selectFile':
        await this.loadFilePatch(message.hash, message.file);
        break;
    }
  }

  private async loadInitial(): Promise<void> {
    await this.withErrorBoundary(async () => {
      const [branches, branchStatus] = await Promise.all([this.git.branches(), this.git.branchStatus()]);
      const currentBranch = branchStatus.branch;
      const selectedBranch = this.selectedBranch ?? currentBranch;
      const commits = await this.loadCommitsForBranch(selectedBranch);
      this.post({
        type: 'init',
        branches,
        currentBranch,
        selectedBranch,
        commits
      });
      await this.loadFirstCommit(commits);
    });
  }

  private async loadBranch(branch: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      this.selectedBranch = branch;
      const commits = await this.loadCommitsForBranch(branch);
      this.post({ type: 'branchData', selectedBranch: branch, commits });
      await this.loadFirstCommit(commits);
    });
  }

  private async loadCommit(hash: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const files = await this.git.commitFiles(hash);
      this.post({ type: 'commitFiles', selectedCommit: hash, files });
      if (files[0]) {
        await this.loadFilePatch(hash, files[0]);
      } else {
        this.post({ type: 'patch', selectedFile: undefined, patch: '' });
      }
    });
  }

  private async loadFilePatch(hash: string, file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      const patch = await this.git.commitFilePatch(hash, file);
      this.post({ type: 'patch', selectedFile: file.filePath, patch });
    });
  }

  private async loadFirstCommit(commits: GitCommit[]): Promise<void> {
    const first = commits[0];
      if (!first) {
      this.post({ type: 'commitFiles', selectedCommit: undefined, files: [] });
      this.post({ type: 'patch', selectedFile: undefined, patch: '' });
      return;
    }

    await this.loadCommit(first.hash);
  }

  private async loadCommitsForBranch(branch: string): Promise<GitCommit[]> {
    const limit = vscode.workspace.getConfiguration('abstractiveGit').get<number>('maxLogEntries', 75);
    return branch ? this.git.logForRef(branch, limit) : this.git.log(limit);
  }

  private async withErrorBoundary(action: () => Promise<void>): Promise<void> {
    try {
      this.post({ type: 'loading', loading: true });
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.post({ type: 'error', message });
    } finally {
      this.post({ type: 'loading', loading: false });
    }
  }

  private post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }
}

function renderHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`
  ].join('; ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .shell {
      display: grid;
      grid-template-rows: 32px minmax(0, 1fr);
      height: 100vh;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      background: var(--vscode-sideBar-background);
    }
    .title {
      font-weight: 600;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .spacer {
      flex: 1;
    }
    button {
      height: 24px;
      padding: 0 8px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .loading {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .layout {
      display: grid;
      grid-template-columns: 180px minmax(240px, 1fr) 280px minmax(340px, 1.35fr);
      min-height: 0;
      height: 100%;
    }
    .pane {
      min-width: 0;
      min-height: 0;
      border-right: 1px solid var(--vscode-sideBar-border);
      display: grid;
      grid-template-rows: 28px minmax(0, 1fr);
    }
    .pane:last-child {
      border-right: 0;
    }
    .pane-title {
      display: flex;
      align-items: center;
      padding: 0 10px;
      color: var(--vscode-sideBarTitle-foreground);
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-sideBar-border);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .list,
    .diff {
      overflow: auto;
      min-height: 0;
    }
    .row {
      width: 100%;
      display: grid;
      gap: 2px;
      padding: 6px 10px;
      border: 0;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      color: var(--vscode-editor-foreground);
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    .row:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .row.selected {
      color: var(--vscode-list-activeSelectionForeground);
      background: var(--vscode-list-activeSelectionBackground);
    }
    .primary,
    .secondary {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .primary {
      font-weight: 500;
    }
    .secondary {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .selected .secondary {
      color: inherit;
      opacity: 0.82;
    }
    .branch-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .branch-kind,
    .status {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .commit-row {
      grid-template-columns: 72px minmax(0, 1fr);
      align-items: start;
    }
    .hash {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .file-row {
      grid-template-columns: 46px minmax(0, 1fr);
      align-items: start;
    }
    .empty {
      padding: 12px 10px;
      color: var(--vscode-descriptionForeground);
    }
    pre {
      margin: 0;
      padding: 8px 0;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
    }
    .line {
      display: block;
      min-height: 1.45em;
      padding: 0 12px;
      white-space: pre;
    }
    .line.add {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 12%, transparent);
    }
    .line.del {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 12%, transparent);
    }
    .line.hunk {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      background: var(--vscode-editor-lineHighlightBackground);
    }
    .line.meta {
      color: var(--vscode-descriptionForeground);
    }
    .error {
      color: var(--vscode-errorForeground);
      padding-left: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (max-width: 980px) {
      .layout {
        grid-template-columns: 150px minmax(220px, 1fr) minmax(220px, 0.8fr);
      }
      .diff-pane {
        grid-column: 1 / -1;
        border-top: 1px solid var(--vscode-sideBar-border);
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <div class="title" id="title">Git</div>
      <div class="loading" id="loading"></div>
      <div class="error" id="error"></div>
      <div class="spacer"></div>
      <button id="refresh" title="Refresh">Refresh</button>
    </div>
    <main class="layout">
      <section class="pane">
        <div class="pane-title">Branches</div>
        <div class="list" id="branches"></div>
      </section>
      <section class="pane">
        <div class="pane-title">Commits</div>
        <div class="list" id="commits"></div>
      </section>
      <section class="pane">
        <div class="pane-title">Files</div>
        <div class="list" id="files"></div>
      </section>
      <section class="pane diff-pane">
        <div class="pane-title">Diff Preview</div>
        <div class="diff" id="diff"></div>
      </section>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = {
      branches: [],
      currentBranch: '',
      selectedBranch: '',
      commits: [],
      selectedCommit: '',
      files: [],
      selectedFile: '',
      patch: '',
      error: '',
      loading: false
    };

    const branchesEl = document.getElementById('branches');
    const commitsEl = document.getElementById('commits');
    const filesEl = document.getElementById('files');
    const diffEl = document.getElementById('diff');
    const titleEl = document.getElementById('title');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'init') {
        state.branches = message.branches || [];
        state.currentBranch = message.currentBranch || '';
        state.selectedBranch = message.selectedBranch || '';
        state.commits = message.commits || [];
        state.files = [];
        state.patch = '';
        state.error = '';
        render();
      }
      if (message.type === 'branchData') {
        state.selectedBranch = message.selectedBranch || '';
        state.commits = message.commits || [];
        state.files = [];
        state.selectedCommit = '';
        state.selectedFile = '';
        state.patch = '';
        state.error = '';
        render();
      }
      if (message.type === 'commitFiles') {
        state.selectedCommit = message.selectedCommit || '';
        state.files = message.files || [];
        state.selectedFile = '';
        state.patch = '';
        state.error = '';
        render();
      }
      if (message.type === 'patch') {
        state.selectedFile = message.selectedFile || '';
        state.patch = message.patch || '';
        state.error = '';
        renderDiff();
        renderFiles();
      }
      if (message.type === 'loading') {
        state.loading = Boolean(message.loading);
        renderChrome();
      }
      if (message.type === 'error') {
        state.error = message.message || 'Git command failed';
        renderChrome();
      }
    });

    function render() {
      renderChrome();
      renderBranches();
      renderCommits();
      renderFiles();
      renderDiff();
    }

    function renderChrome() {
      titleEl.textContent = state.selectedBranch ? 'Git: ' + state.selectedBranch : 'Git';
      loadingEl.textContent = state.loading ? 'Loading...' : '';
      errorEl.textContent = state.error || '';
    }

    function renderBranches() {
      if (!state.branches.length) {
        branchesEl.innerHTML = '<div class="empty">No branches.</div>';
        return;
      }
      branchesEl.replaceChildren(...state.branches.map((branch) => {
        const row = buttonRow('branch-row row' + (branch.name === state.selectedBranch ? ' selected' : ''));
        row.title = branch.subject || branch.name;
        row.innerHTML = '<div class="primary">' + escapeHtml(branch.current ? branch.name + ' *' : branch.name) + '</div>' +
          '<div class="branch-kind">' + escapeHtml(branch.remote ? 'remote' : 'local') + '</div>';
        row.addEventListener('click', () => vscode.postMessage({ type: 'selectBranch', branch: branch.name }));
        return row;
      }));
    }

    function renderCommits() {
      if (!state.commits.length) {
        commitsEl.innerHTML = '<div class="empty">No commits.</div>';
        return;
      }
      commitsEl.replaceChildren(...state.commits.map((commit) => {
        const row = buttonRow('commit-row row' + (commit.hash === state.selectedCommit ? ' selected' : ''));
        row.title = commit.hash + '\\n' + commit.author;
        row.innerHTML = '<div class="hash">' + escapeHtml(commit.shortHash) + '</div>' +
          '<div><div class="primary">' + escapeHtml(commit.subject) + '</div>' +
          '<div class="secondary">' + escapeHtml(commit.author) + ' - ' + escapeHtml(formatDate(commit.date)) + '</div></div>';
        row.addEventListener('click', () => vscode.postMessage({ type: 'selectCommit', hash: commit.hash }));
        return row;
      }));
    }

    function renderFiles() {
      if (!state.files.length) {
        filesEl.innerHTML = '<div class="empty">No files.</div>';
        return;
      }
      filesEl.replaceChildren(...state.files.map((file) => {
        const row = buttonRow('file-row row' + (file.filePath === state.selectedFile ? ' selected' : ''));
        row.title = file.originalPath ? file.originalPath + ' -> ' + file.filePath : file.filePath;
        row.innerHTML = '<div class="status">' + escapeHtml(file.status) + '</div>' +
          '<div><div class="primary">' + escapeHtml(file.filePath) + '</div>' +
          '<div class="secondary">' + escapeHtml(file.originalPath || '') + '</div></div>';
        row.addEventListener('click', () => vscode.postMessage({ type: 'selectFile', hash: state.selectedCommit, file }));
        return row;
      }));
    }

    function renderDiff() {
      if (!state.patch) {
        diffEl.innerHTML = '<div class="empty">Select a commit file to preview its diff.</div>';
        return;
      }
      const lines = state.patch.split('\\n').map((line) => {
        let cls = 'line';
        if (line.startsWith('+') && !line.startsWith('+++')) cls += ' add';
        else if (line.startsWith('-') && !line.startsWith('---')) cls += ' del';
        else if (line.startsWith('@@')) cls += ' hunk';
        else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) cls += ' meta';
        return '<span class="' + cls + '">' + escapeHtml(line || ' ') + '</span>';
      }).join('');
      diffEl.innerHTML = '<pre>' + lines + '</pre>';
    }

    function buttonRow(className) {
      const button = document.createElement('button');
      button.className = className;
      return button;
    }

    function formatDate(value) {
      if (!value) return '';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
