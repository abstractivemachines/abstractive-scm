import * as vscode from 'vscode';
import { GitService } from './git';
import { gitContentUri } from './gitContentProvider';
import { GitCommit, GitCommitFile } from './models';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'resetLayout' }
  | { type: 'selectBranch'; branch: string }
  | { type: 'checkoutBranch'; branch: string; remote: boolean }
  | { type: 'selectCommit'; hash: string }
  | { type: 'copyCommitHash'; hash: string }
  | { type: 'selectFile'; hash: string; file: GitCommitFile }
  | { type: 'openFileAtRevision'; hash: string; file: GitCommitFile }
  | { type: 'openFileDiff'; hash: string; file: GitCommitFile };

export class GitToolWindowProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'abstractiveScm.toolWindow';

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
      case 'resetLayout':
        this.post({ type: 'resetLayout' });
        break;
      case 'selectBranch':
        await this.loadBranch(message.branch);
        break;
      case 'checkoutBranch':
        await this.checkoutBranch(message.branch, message.remote);
        break;
      case 'selectCommit':
        await this.loadCommit(message.hash);
        break;
      case 'copyCommitHash':
        await this.copyCommitHash(message.hash);
        break;
      case 'selectFile':
        await this.loadFilePatch(message.hash, message.file);
        break;
      case 'openFileAtRevision':
        await this.openFileAtRevision(message.hash, message.file);
        break;
      case 'openFileDiff':
        await this.openNativeDiff(message.hash, message.file);
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
      const commit = await this.git.commitDetails(hash);
      this.post({ type: 'commitFiles', selectedCommit: hash, files });
      if (commit) {
        this.post({ type: 'commitDetails', commit });
      }
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

  private async checkoutBranch(branch: string, remote: boolean): Promise<void> {
    await this.withErrorBoundary(async () => {
      if (remote) {
        await this.git.checkoutRemote(branch);
      } else {
        await this.git.checkout(branch);
      }
      this.selectedBranch = undefined;
      await this.loadInitial();
      vscode.window.showInformationMessage(`Checked out ${branch}`);
    });
  }

  private async copyCommitHash(hash: string): Promise<void> {
    const commit = await this.git.commitDetails(hash);
    await vscode.env.clipboard.writeText(commit?.hash ?? hash);
    vscode.window.showInformationMessage(`Copied ${commit?.shortHash ?? hash.slice(0, 7)}`);
  }

  private async openFileAtRevision(hash: string, file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      if (file.status.startsWith('D')) {
        vscode.window.showWarningMessage(`${file.filePath} was deleted in this commit.`);
        return;
      }

      const commit = await this.git.commitDetails(hash);
      const uri = gitContentUri(hash, file.filePath);
      await vscode.window.showTextDocument(uri, { preview: true });
      this.post({ type: 'notice', message: `Opened ${file.filePath} at ${commit?.shortHash ?? hash.slice(0, 7)}` });
    });
  }

  private async openNativeDiff(hash: string, file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      const commit = await this.git.commitDetails(hash);
      const parentRef = `${hash}^`;
      const leftPath = file.originalPath ?? file.filePath;
      const left = file.status.startsWith('A') ? gitContentUri('empty', file.filePath) : gitContentUri(parentRef, leftPath);
      const right = file.status.startsWith('D') ? gitContentUri('empty', file.filePath) : gitContentUri(hash, file.filePath);
      await vscode.commands.executeCommand('vscode.diff', left, right, `${file.filePath} (${commit?.shortHash ?? hash.slice(0, 7)})`);
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
    const limit = vscode.workspace.getConfiguration('abstractiveScm').get<number>('maxLogEntries', 75);
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
    button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .toolbar button {
      min-width: 0;
      white-space: nowrap;
    }
    .loading {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .layout {
      display: grid;
      grid-template-columns: var(--pane-columns, 180px 560px 280px 520px);
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
    .pane-divider {
      width: 0;
      min-width: 0;
      position: relative;
      z-index: 4;
    }
    .pane-divider::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: -5px;
      width: 10px;
      cursor: col-resize;
    }
    .pane-divider::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: -1px;
      width: 1px;
      background: transparent;
    }
    .pane-divider:hover::after,
    .pane-divider.dragging::after {
      background: var(--vscode-focusBorder);
    }
    .pane-title {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      color: var(--vscode-sideBarTitle-foreground);
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-sideBar-border);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .pane-title input {
      width: 100%;
      min-width: 80px;
      height: 20px;
      padding: 0 6px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
      font-size: 12px;
      text-transform: none;
      font-weight: 400;
    }
    .list,
    .grid,
    .diff {
      overflow: auto;
      min-height: 0;
    }
    .diff-stack {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
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
    .row.focused {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
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
    .commit-header,
    .commit-row {
      grid-template-columns: var(--commit-columns, 28px 74px 120px 142px minmax(220px, 1fr));
      align-items: center;
      column-gap: 8px;
    }
    .commit-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: grid;
      min-height: 26px;
      padding: 0 10px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBar-background);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .commit-column {
      position: relative;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .resize-handle {
      position: absolute;
      top: 0;
      right: -5px;
      width: 10px;
      height: 100%;
      cursor: col-resize;
      z-index: 2;
    }
    .resize-handle::after {
      content: "";
      position: absolute;
      top: 5px;
      right: 4px;
      width: 1px;
      height: calc(100% - 10px);
      background: transparent;
    }
    .resize-handle:hover::after,
    .resize-handle.dragging::after {
      background: var(--vscode-focusBorder);
    }
    .graph {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      font-family: var(--vscode-editor-font-family);
      font-size: 15px;
      line-height: 1;
      text-align: center;
    }
    .author,
    .date,
    .subject {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .date,
    .author {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .selected .date,
    .selected .author {
      color: inherit;
      opacity: 0.82;
    }
    .branch-kind,
    .status {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
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
    .details {
      max-height: 118px;
      overflow: auto;
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-sideBar-border);
      background: var(--vscode-sideBar-background);
    }
    .details-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .details-meta {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.45;
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
        grid-template-columns: var(--pane-columns, 150px 420px 220px 360px);
      }
      .commit-header,
      .commit-row {
        grid-template-columns: 22px 64px minmax(180px, 1fr);
      }
      .author,
      .date,
      .commit-header .author-col,
      .commit-header .date-col {
        display: none;
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
      <div class="title" id="title">SCM</div>
      <div class="loading" id="loading"></div>
      <div class="error" id="error"></div>
      <div class="spacer"></div>
      <button id="checkoutBranch" title="Checkout selected branch (b)">Checkout</button>
      <button id="copyHash" title="Copy selected commit hash (y)">Copy Hash</button>
      <button id="openFile" title="Open selected file at this revision (p)">Open File</button>
      <button id="openDiff" title="Open selected file diff (o)">Open Diff</button>
      <button id="resetLayout" title="Reset panel layout">Reset Layout</button>
      <button id="refresh" title="Refresh">Refresh</button>
    </div>
    <main class="layout">
      <section class="pane">
        <div class="pane-title">Branches</div>
        <div class="list" id="branches" role="listbox" aria-label="Branches"></div>
      </section>
      <div class="pane-divider" data-divider="0" role="separator" aria-orientation="vertical" title="Resize panes"></div>
      <section class="pane">
        <div class="pane-title"><span>Commits</span><input id="commitSearch" type="search" aria-label="Search commits" placeholder="Search"></div>
        <div class="grid" id="commits" role="grid" aria-label="Commits"></div>
      </section>
      <div class="pane-divider" data-divider="1" role="separator" aria-orientation="vertical" title="Resize panes"></div>
      <section class="pane">
        <div class="pane-title">Files</div>
        <div class="list" id="files" role="listbox" aria-label="Changed files"></div>
      </section>
      <div class="pane-divider" data-divider="2" role="separator" aria-orientation="vertical" title="Resize panes"></div>
      <section class="pane diff-pane">
        <div class="pane-title">Diff Preview</div>
        <div class="diff-stack">
          <div class="diff" id="diff"></div>
          <div class="details" id="commitDetails"></div>
        </div>
      </section>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const persistedState = vscode.getState() || {};
    const state = {
      branches: [],
      currentBranch: '',
      selectedBranch: '',
      commits: [],
      selectedCommit: '',
      files: [],
      selectedFile: '',
      selectedCommitDetails: undefined,
      patch: '',
      error: '',
      loading: false,
      activePane: persistedState.activePane || 'commits',
      commitSearch: persistedState.commitSearch || '',
      paneColumns: validWidths(persistedState.paneColumns, [180, 560, 280, 520], 4),
      commitColumns: validWidths(persistedState.commitColumns, [28, 74, 120, 142, 360], 5)
    };

    const layoutEl = document.querySelector('.layout');
    const branchesEl = document.getElementById('branches');
    const commitsEl = document.getElementById('commits');
    const filesEl = document.getElementById('files');
    const diffEl = document.getElementById('diff');
    const detailsEl = document.getElementById('commitDetails');
    const commitSearchEl = document.getElementById('commitSearch');
    const titleEl = document.getElementById('title');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('checkoutBranch').addEventListener('click', checkoutSelectedBranch);
    document.getElementById('copyHash').addEventListener('click', copySelectedCommitHash);
    document.getElementById('openFile').addEventListener('click', openSelectedFileAtRevision);
    document.getElementById('openDiff').addEventListener('click', openSelectedFileDiff);
    document.getElementById('resetLayout').addEventListener('click', () => vscode.postMessage({ type: 'resetLayout' }));
    commitSearchEl.value = state.commitSearch;
    commitSearchEl.addEventListener('input', () => {
      state.commitSearch = commitSearchEl.value;
      saveLayoutState();
      renderCommits();
    });
    document.addEventListener('keydown', handleKeydown);
    document.querySelectorAll('.pane-divider').forEach((divider) => {
      divider.addEventListener('pointerdown', (event) => startPaneResize(event, Number(divider.dataset.divider), divider));
    });
    applyPaneColumns();

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'init') {
        state.branches = message.branches || [];
        state.currentBranch = message.currentBranch || '';
        state.selectedBranch = message.selectedBranch || '';
        state.commits = message.commits || [];
        state.files = [];
        state.selectedCommitDetails = undefined;
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
        state.selectedCommitDetails = undefined;
        state.patch = '';
        state.error = '';
        render();
        focusSelected();
      }
      if (message.type === 'commitFiles') {
        state.selectedCommit = message.selectedCommit || '';
        state.files = message.files || [];
        state.selectedFile = '';
        state.patch = '';
        state.error = '';
        render();
        focusSelected();
      }
      if (message.type === 'patch') {
        state.selectedFile = message.selectedFile || '';
        state.patch = message.patch || '';
        state.error = '';
        renderDiff();
        renderFiles();
        focusSelected();
      }
      if (message.type === 'commitDetails') {
        state.selectedCommitDetails = message.commit;
        renderDetails();
      }
      if (message.type === 'notice') {
        state.error = message.message || '';
        renderChrome();
      }
      if (message.type === 'resetLayout') {
        resetLayout();
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
      renderDetails();
    }

    function renderChrome() {
      titleEl.textContent = state.selectedBranch ? 'SCM: ' + state.selectedBranch : 'SCM';
      loadingEl.textContent = state.loading ? 'Loading...' : '';
      errorEl.textContent = state.error || '';
      const branch = selectedBranch();
      document.getElementById('checkoutBranch').disabled = !branch || branch.current;
      document.getElementById('copyHash').disabled = !selectedCommit();
      document.getElementById('openFile').disabled = !selectedFile();
      document.getElementById('openDiff').disabled = !selectedFile();
    }

    function renderBranches() {
      if (!state.branches.length) {
        branchesEl.innerHTML = '<div class="empty">No branches.</div>';
        return;
      }
      branchesEl.replaceChildren(...state.branches.map((branch) => {
        const selected = branch.name === state.selectedBranch;
        const row = selectableRow('branch-row row' + rowState('branches', selected), 'option', selected);
        row.title = branch.subject || branch.name;
        row.innerHTML = '<div class="primary">' + escapeHtml(branch.current ? branch.name + ' *' : branch.name) + '</div>' +
          '<div class="branch-kind">' + escapeHtml(branch.remote ? 'remote' : 'local') + '</div>';
        row.addEventListener('focus', () => state.activePane = 'branches');
        row.addEventListener('click', () => selectBranch(branch.name));
        row.addEventListener('dblclick', () => checkoutSelectedBranch());
        return row;
      }));
    }

    function renderCommits() {
      if (!state.commits.length) {
        commitsEl.innerHTML = '<div class="empty">No commits.</div>';
        return;
      }
      const commits = filteredCommits();
      if (!commits.length) {
        commitsEl.innerHTML = '<div class="empty">No commits match the filter.</div>';
        return;
      }
      const header = document.createElement('div');
      header.className = 'commit-header';
      header.setAttribute('role', 'row');
      applyCommitColumns(header);
      header.append(
        commitHeaderCell('Graph', 0),
        commitHeaderCell('Hash', 1),
        commitHeaderCell('Author', 2, 'author-col'),
        commitHeaderCell('Date', 3, 'date-col'),
        commitHeaderCell('Subject', 4)
      );
      commitsEl.replaceChildren(header, ...commits.map((commit, index) => {
        const selected = commit.hash === state.selectedCommit;
        const row = selectableRow('commit-row row' + rowState('commits', selected), 'row', selected);
        applyCommitColumns(row);
        row.setAttribute('aria-rowindex', String(index + 2));
        row.title = commit.hash + '\\n' + commit.author;
        row.innerHTML = '<div class="graph" role="gridcell" aria-label="Commit">●</div>' +
          '<div class="hash" role="gridcell">' + escapeHtml(commit.shortHash) + '</div>' +
          '<div class="author" role="gridcell">' + escapeHtml(commit.author) + '</div>' +
          '<div class="date" role="gridcell">' + escapeHtml(formatDate(commit.date)) + '</div>' +
          '<div class="subject" role="gridcell">' + escapeHtml(commit.subject) + '</div>';
        row.addEventListener('focus', () => state.activePane = 'commits');
        row.addEventListener('click', () => selectCommit(commit.hash));
        return row;
      }));
    }

    function renderFiles() {
      if (!state.files.length) {
        filesEl.innerHTML = '<div class="empty">No files.</div>';
        return;
      }
      filesEl.replaceChildren(...state.files.map((file) => {
        const selected = file.filePath === state.selectedFile;
        const row = selectableRow('file-row row' + rowState('files', selected), 'option', selected);
        row.title = file.originalPath ? file.originalPath + ' -> ' + file.filePath : file.filePath;
        row.innerHTML = '<div class="status">' + escapeHtml(file.status) + '</div>' +
          '<div><div class="primary">' + escapeHtml(file.filePath) + '</div>' +
          '<div class="secondary">' + escapeHtml(file.originalPath || '') + '</div></div>';
        row.addEventListener('focus', () => state.activePane = 'files');
        row.addEventListener('click', () => selectFile(file));
        row.addEventListener('dblclick', () => {
          selectFile(file);
          openSelectedFileDiff();
        });
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

    function renderDetails() {
      const commit = state.selectedCommitDetails;
      if (!commit) {
        detailsEl.innerHTML = '<div class="details-meta">No commit selected.</div>';
        return;
      }
      detailsEl.innerHTML = '<div class="details-title">' + escapeHtml(commit.subject) + '</div>' +
        '<div class="details-meta">' + escapeHtml(commit.hash) + '</div>' +
        '<div class="details-meta">' + escapeHtml(commit.author) + ' - ' + escapeHtml(formatDate(commit.date)) + '</div>' +
        (commit.refs ? '<div class="details-meta">' + escapeHtml(commit.refs) + '</div>' : '');
    }

    function startPaneResize(event, index, divider) {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const leftStart = state.paneColumns[index];
      const rightStart = state.paneColumns[index + 1];
      divider.classList.add('dragging');
      divider.setPointerCapture?.(event.pointerId);

      const move = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const minLeft = minPaneWidth(index);
        const minRight = minPaneWidth(index + 1);
        const clampedDelta = Math.max(minLeft - leftStart, Math.min(delta, rightStart - minRight));
        state.paneColumns[index] = leftStart + clampedDelta;
        state.paneColumns[index + 1] = rightStart - clampedDelta;
        applyPaneColumns();
      };
      const stop = () => {
        divider.classList.remove('dragging');
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', stop);
        saveLayoutState();
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop, { once: true });
    }

    function minPaneWidth(index) {
      return [120, 320, 160, 260][index] || 160;
    }

    function applyPaneColumns() {
      layoutEl.style.setProperty('--pane-columns', paneColumnsTemplate());
    }

    function paneColumnsTemplate() {
      return state.paneColumns.map((width) => Math.round(width) + 'px').join(' 0px ');
    }

    function commitHeaderCell(label, index, extraClass = '') {
      const cell = document.createElement('div');
      cell.className = ('commit-column ' + extraClass).trim();
      cell.setAttribute('role', 'columnheader');
      cell.textContent = label;
      if (index < state.commitColumns.length - 1) {
        const handle = document.createElement('span');
        handle.className = 'resize-handle';
        handle.title = 'Resize column';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.addEventListener('pointerdown', (event) => startColumnResize(event, index, handle));
        cell.append(handle);
      }
      return cell;
    }

    function startColumnResize(event, index, handle) {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = state.commitColumns[index];
      handle.classList.add('dragging');
      handle.setPointerCapture?.(event.pointerId);

      const move = (moveEvent) => {
        const next = Math.max(minColumnWidth(index), startWidth + moveEvent.clientX - startX);
        state.commitColumns[index] = next;
        applyCommitColumnsToGrid();
      };
      const stop = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', stop);
        saveLayoutState();
        renderCommits();
        focusSelected();
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop, { once: true });
    }

    function minColumnWidth(index) {
      return [22, 54, 72, 92, 160][index] || 80;
    }

    function applyCommitColumns(element) {
      element.style.setProperty('--commit-columns', commitColumnsTemplate());
    }

    function applyCommitColumnsToGrid() {
      commitsEl.querySelectorAll('.commit-header, .commit-row').forEach(applyCommitColumns);
    }

    function commitColumnsTemplate() {
      return state.commitColumns.map((width) => Math.round(width) + 'px').join(' ');
    }

    function selectableRow(className, role, selected) {
      const row = document.createElement('div');
      row.className = className;
      row.setAttribute('role', role);
      row.setAttribute('aria-selected', selected ? 'true' : 'false');
      row.tabIndex = selected ? 0 : -1;
      return row;
    }

    function rowState(pane, selected) {
      return (selected ? ' selected' : '') + (state.activePane === pane && selected ? ' focused' : '');
    }

    function handleKeydown(event) {
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key === '/') {
        event.preventDefault();
        commitSearchEl.focus();
        commitSearchEl.select();
        return;
      }
      if (event.key === 'o') {
        event.preventDefault();
        openSelectedFileDiff();
        return;
      }
      if (event.key === 'p') {
        event.preventDefault();
        openSelectedFileAtRevision();
        return;
      }
      if (event.key === 'y') {
        event.preventDefault();
        copySelectedCommitHash();
        return;
      }
      if (event.key === 'b') {
        event.preventDefault();
        checkoutSelectedBranch();
        return;
      }
      if (event.key === 'Escape' && state.commitSearch) {
        event.preventDefault();
        state.commitSearch = '';
        commitSearchEl.value = '';
        saveLayoutState();
        renderCommits();
        focusSelected();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault();
        moveVertical(1);
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault();
        moveVertical(-1);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'l') {
        event.preventDefault();
        moveHorizontal(1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'h') {
        event.preventDefault();
        moveHorizontal(-1);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateCurrent();
      }
    }

    function moveVertical(delta) {
      if (state.activePane === 'branches') {
        const next = nextIndex(state.branches.findIndex((branch) => branch.name === state.selectedBranch), state.branches.length, delta);
        if (next >= 0) selectBranch(state.branches[next].name);
      } else if (state.activePane === 'files') {
        const next = nextIndex(state.files.findIndex((file) => file.filePath === state.selectedFile), state.files.length, delta);
        if (next >= 0) selectFile(state.files[next]);
      } else {
        state.activePane = 'commits';
        const commits = filteredCommits();
        const next = nextIndex(commits.findIndex((commit) => commit.hash === state.selectedCommit), commits.length, delta);
        if (next >= 0) selectCommit(commits[next].hash);
      }
      render();
      focusSelected();
    }

    function moveHorizontal(delta) {
      const panes = ['branches', 'commits', 'files'];
      const index = panes.indexOf(state.activePane);
      state.activePane = panes[Math.max(0, Math.min(panes.length - 1, index + delta))] || 'commits';
      saveLayoutState();
      render();
      focusSelected();
    }

    function activateCurrent() {
      if (state.activePane === 'branches') {
        const branch = state.branches.find((item) => item.name === state.selectedBranch) || state.branches[0];
        if (branch) selectBranch(branch.name);
      } else if (state.activePane === 'files') {
        const file = state.files.find((item) => item.filePath === state.selectedFile) || state.files[0];
        if (file) openSelectedFileDiff();
      } else {
        const commits = filteredCommits();
        const commit = commits.find((item) => item.hash === state.selectedCommit) || commits[0];
        if (commit) selectCommit(commit.hash);
      }
    }

    function selectBranch(branchName) {
      state.activePane = 'branches';
      state.selectedBranch = branchName;
      saveLayoutState();
      vscode.postMessage({ type: 'selectBranch', branch: branchName });
    }

    function selectCommit(hash) {
      state.activePane = 'commits';
      state.selectedCommit = hash;
      saveLayoutState();
      vscode.postMessage({ type: 'selectCommit', hash });
    }

    function selectFile(file) {
      state.activePane = 'files';
      state.selectedFile = file.filePath;
      saveLayoutState();
      vscode.postMessage({ type: 'selectFile', hash: state.selectedCommit, file });
    }

    function openSelectedFileDiff() {
      const file = selectedFile();
      if (file && state.selectedCommit) {
        vscode.postMessage({ type: 'openFileDiff', hash: state.selectedCommit, file });
      }
    }

    function openSelectedFileAtRevision() {
      const file = selectedFile();
      if (file && state.selectedCommit) {
        vscode.postMessage({ type: 'openFileAtRevision', hash: state.selectedCommit, file });
      }
    }

    function copySelectedCommitHash() {
      const commit = selectedCommit();
      if (commit) {
        vscode.postMessage({ type: 'copyCommitHash', hash: commit.hash });
      }
    }

    function checkoutSelectedBranch() {
      const branch = selectedBranch();
      if (branch && !branch.current) {
        vscode.postMessage({ type: 'checkoutBranch', branch: branch.name, remote: Boolean(branch.remote) });
      }
    }

    function selectedBranch() {
      return state.branches.find((item) => item.name === state.selectedBranch);
    }

    function selectedCommit() {
      return state.commits.find((item) => item.hash === state.selectedCommit);
    }

    function selectedFile() {
      return state.files.find((item) => item.filePath === state.selectedFile) || state.files[0];
    }

    function filteredCommits() {
      const query = state.commitSearch.trim().toLowerCase();
      if (!query) return state.commits;
      return state.commits.filter((commit) =>
        [commit.hash, commit.shortHash, commit.author, commit.date, commit.refs, commit.subject]
          .some((value) => String(value || '').toLowerCase().includes(query))
      );
    }

    function nextIndex(current, length, delta) {
      if (!length) return -1;
      const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
      return Math.max(0, Math.min(length - 1, start + delta));
    }

    function focusSelected() {
      requestAnimationFrame(() => {
        const container = state.activePane === 'branches' ? branchesEl : state.activePane === 'files' ? filesEl : commitsEl;
        const selected = container.querySelector('.row.selected');
        if (selected) {
          selected.focus({ preventScroll: true });
          selected.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    function formatDate(value) {
      if (!value) return '';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    function validWidths(value, fallback, expectedLength) {
      if (!Array.isArray(value) || value.length !== expectedLength) {
        return fallback.slice();
      }
      const widths = value.map((item) => Number(item));
      return widths.every((item) => Number.isFinite(item) && item > 0) ? widths : fallback.slice();
    }

    function saveLayoutState() {
      vscode.setState({
        activePane: state.activePane,
        commitSearch: state.commitSearch,
        paneColumns: state.paneColumns,
        commitColumns: state.commitColumns
      });
    }

    function resetLayout() {
      state.activePane = 'commits';
      state.commitSearch = '';
      state.paneColumns = [180, 560, 280, 520];
      state.commitColumns = [28, 74, 120, 142, 360];
      commitSearchEl.value = '';
      applyPaneColumns();
      saveLayoutState();
      render();
      focusSelected();
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
