import * as fs from 'fs';
import * as vscode from 'vscode';
import { browserScript } from './browserScript';
import { panelStyles } from './styles';

export function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const codiconCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'codicon.css'));
  const monacoBaseUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'monaco', 'vs'));
  const monacoLoaderUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'monaco', 'vs', 'loader.js'));
  const monacoWorkers = monacoWorkerUris(webview, extensionUri);
  const icon = (name: string, label: string): string =>
    `<span class="codicon codicon-${name}" aria-hidden="true"></span><span class="sr-only">${label}</span>`;
  const csp = [
    "default-src 'none'",
    `font-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    `connect-src ${webview.cspSource}`,
    `worker-src blob: ${webview.cspSource}`
  ].join('; ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${codiconCssUri}">
  <style>
${panelStyles}
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <div class="toolbar-status" hidden>
        <div class="title" id="title"></div>
        <div class="loading" id="loading"></div>
        <div class="error" id="error"></div>
      </div>
      <div class="toolbar-actions">
        <select id="repositorySelect" class="repository-select" aria-label="Repository"></select>
        <button class="icon-button" id="checkoutBranch" title="Checkout selected branch (b)" aria-label="Checkout selected branch">${icon('git-branch', 'Checkout selected branch')}</button>
        <button class="icon-button" id="branchActions" title="Show branch actions" aria-label="Show branch actions">${icon('git-branch', 'Show branch actions')}</button>
        <button class="icon-button" id="copyHash" title="Copy selected commit hash (y)" aria-label="Copy selected commit hash">${icon('copy', 'Copy selected commit hash')}</button>
        <button class="icon-button" id="commitActions" title="Show selected commit actions" aria-label="Show selected commit actions">${icon('ellipsis', 'Show selected commit actions')}</button>
        <button class="icon-button" id="openFile" title="Open selected file at this revision (p)" aria-label="Open selected file at this revision">${icon('go-to-file', 'Open selected file at this revision')}</button>
        <button class="icon-button" id="openWorkingFile" title="Open selected working tree file (w)" aria-label="Open selected working tree file">${icon('file', 'Open selected working tree file')}</button>
        <button class="icon-button" id="openDiff" title="Open selected file diff (o)" aria-label="Open selected file diff">${icon('diff', 'Open selected file diff')}</button>
        <button class="icon-button" id="toggleDiffPlacementToolbar" title="Dock diff preview on the right" aria-label="Dock diff preview on the right">${icon('layout-panel-right', 'Dock diff preview on the right')}</button>
        <button class="icon-button" id="toggleDetailsToolbar" title="Show selection details" aria-label="Show selection details">${icon('inspect', 'Show selection details')}</button>
        <button class="icon-button" id="stageChange" title="Stage selected local change" aria-label="Stage selected local change">${icon('add', 'Stage selected local change')}</button>
        <button class="icon-button" id="unstageChange" title="Unstage selected local change" aria-label="Unstage selected local change">${icon('remove', 'Unstage selected local change')}</button>
        <button class="icon-button" id="commitChanges" title="Commit staged changes" aria-label="Commit staged changes">${icon('git-commit', 'Commit staged changes')}</button>
        <button class="icon-button" id="shelveChanges" title="Shelve local changes" aria-label="Shelve local changes">${icon('archive', 'Shelve local changes')}</button>
        <button class="icon-button" id="unshelveChanges" title="Unshelve saved changes" aria-label="Unshelve saved changes">${icon('repo-pull', 'Unshelve saved changes')}</button>
        <button class="icon-button" id="showHelp" title="Show keyboard shortcuts (F1)" aria-label="Show keyboard shortcuts">${icon('keyboard', 'Show keyboard shortcuts')}</button>
        <button class="icon-button" id="resetLayout" title="Reset panel layout" aria-label="Reset panel layout">${icon('debug-restart', 'Reset panel layout')}</button>
        <button class="icon-button" id="refresh" title="Refresh" aria-label="Refresh">${icon('refresh', 'Refresh')}</button>
      </div>
    </div>
    <main class="layout diff-bottom">
      <section class="pane" data-pane="branches">
        <div class="pane-title branch-title">
          <span>Branches</span>
          <input id="branchSearch" type="search" aria-label="Search branches" placeholder="Search">
          <button class="icon-button" data-branch-filter="all" title="Show all branches" aria-label="Show all branches">${icon('list-selection', 'Show all branches')}</button>
          <button class="icon-button" data-branch-filter="local" title="Show local branches" aria-label="Show local branches">${icon('repo', 'Show local branches')}</button>
          <button class="icon-button" data-branch-filter="remote" title="Show remote branches" aria-label="Show remote branches">${icon('cloud', 'Show remote branches')}</button>
        </div>
        <div class="list" id="branches" role="listbox" aria-label="Branches"></div>
      </section>
      <div class="pane-divider" data-divider="0" role="separator" aria-orientation="vertical" title="Resize panes"></div>
      <section class="pane commit-pane" data-pane="commits">
        <div class="pane-title commit-title">
          <span>Commits</span>
          <button class="icon-button" data-mode="log" title="Show selected branch log" aria-label="Show selected branch log">${icon('history', 'Show selected branch log')}</button>
          <button class="icon-button" data-mode="outgoing" title="Show current branch commits not in selected branch" aria-label="Show outgoing commits">${icon('arrow-up', 'Show outgoing commits')}</button>
          <button class="icon-button" data-mode="incoming" title="Show selected branch commits not in current branch" aria-label="Show incoming commits">${icon('arrow-down', 'Show incoming commits')}</button>
          <button class="icon-button" data-mode="files" title="Show aggregate changed files between current and selected branch" aria-label="Show changed files">${icon('files', 'Show changed files')}</button>
          <button class="icon-button" data-mode="changes" title="Show local working tree changes" aria-label="Show local working tree changes">${icon('repo', 'Show local working tree changes')}</button>
          <span class="history-chip" id="historyChip" hidden>
            <span class="history-chip-label" id="historyChipLabel"></span>
            <button class="history-close icon-button" id="clearHistory" title="Return to branch log" aria-label="Return to branch log">${icon('close', 'Return to branch log')}</button>
          </span>
          <input id="commitSearch" type="search" aria-label="Search commits" placeholder="Search">
        </div>
        <div class="commit-summary" id="commitSummary" hidden></div>
        <div class="grid" id="commits" role="grid" aria-label="Commits"></div>
      </section>
      <div class="pane-divider" data-divider="1" role="separator" aria-orientation="vertical" title="Resize panes"></div>
      <section class="pane" data-pane="files">
        <div class="pane-title file-title">
          <span>Files</span>
          <input id="fileSearch" type="search" aria-label="Search changed files" placeholder="Search">
          <button class="icon-button" data-file-filter="all" title="Show all files" aria-label="Show all files">${icon('list-selection', 'Show all files')}</button>
          <button class="icon-button" data-file-filter="A" title="Show added files" aria-label="Show added files">${icon('diff-added', 'Show added files')}</button>
          <button class="icon-button" data-file-filter="M" title="Show modified files" aria-label="Show modified files">${icon('diff-modified', 'Show modified files')}</button>
          <button class="icon-button" data-file-filter="D" title="Show deleted files" aria-label="Show deleted files">${icon('diff-removed', 'Show deleted files')}</button>
          <button class="icon-button" data-file-filter="R" title="Show renamed files" aria-label="Show renamed files">${icon('diff-renamed', 'Show renamed files')}</button>
        </div>
        <div class="list" id="files" role="listbox" aria-label="Changed files"></div>
      </section>
      <div class="pane-divider" data-divider="2" role="separator" aria-orientation="vertical" title="Resize panes"></div>
      <section class="pane diff-pane" data-pane="diff">
        <div class="pane-title diff-title">
          <span>Diff Preview</span>
          <span class="diff-stats" id="diffStats"></span>
          <button class="icon-button" id="toggleDiffPlacement" title="Move diff preview to the right" aria-label="Move diff preview to the right">${icon('layout-panel-right', 'Move diff preview to the right')}</button>
          <button class="icon-button" id="toggleDetails" title="Show selection details" aria-label="Show selection details">${icon('inspect', 'Show selection details')}</button>
          <button class="icon-button" id="toggleDiffView" title="Show split diff preview" aria-label="Show split diff preview">${icon('split-horizontal', 'Show split diff preview')}</button>
          <button class="icon-button" id="prevFile" title="Previous file ([)" aria-label="Previous file">${icon('arrow-left', 'Previous file')}</button>
          <button class="icon-button" id="nextFile" title="Next file (])" aria-label="Next file">${icon('arrow-right', 'Next file')}</button>
          <button class="icon-button" id="prevHunk" title="Previous hunk (,)" aria-label="Previous hunk" disabled>${icon('arrow-up', 'Previous hunk')}</button>
          <button class="icon-button" id="nextHunk" title="Next hunk (.)" aria-label="Next hunk" disabled>${icon('arrow-down', 'Next hunk')}</button>
        </div>
        <div class="diff-stack">
          <div class="diff" id="diff" tabindex="-1"></div>
          <div class="details" id="selectionDetails"></div>
        </div>
      </section>
    </main>
  </div>
  <div class="context-menu" id="contextMenu" role="menu"></div>
  <div class="help-overlay" id="helpOverlay" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
    <div class="help-dialog">
      <div class="help-header">
        <span id="helpTitle">Keyboard Shortcuts</span>
        <button class="icon-button" id="closeHelp" title="Close keyboard shortcuts" aria-label="Close keyboard shortcuts">${icon('close', 'Close keyboard shortcuts')}</button>
      </div>
      <div class="help-grid">
        <div class="help-row"><span><span class="key">j</span> <span class="key">k</span></span><span>Move selection up or down</span></div>
        <div class="help-row"><span><span class="key">h</span> <span class="key">l</span></span><span>Move between panes</span></div>
        <div class="help-row"><span class="key">Enter</span><span>Activate selected row</span></div>
        <div class="help-row"><span class="key">/</span><span>Search commits</span></div>
        <div class="help-row"><span class="key">?</span><span>Search branches</span></div>
        <div class="help-row"><span class="key">f</span><span>Search files</span></div>
        <div class="help-row"><span class="key">o</span><span>Open native diff</span></div>
        <div class="help-row"><span class="key">p</span><span>Open revision or worktree file</span></div>
        <div class="help-row"><span class="key">w</span><span>Open working tree file</span></div>
        <div class="help-row"><span class="key">y</span><span>Copy selected commit hash</span></div>
        <div class="help-row"><span class="key">b</span><span>Checkout selected branch</span></div>
        <div class="help-row"><span><span class="key">[</span> <span class="key">]</span></span><span>Previous or next file</span></div>
        <div class="help-row"><span><span class="key">,</span> <span class="key">.</span></span><span>Previous or next hunk</span></div>
        <div class="help-row"><span class="key">Esc</span><span>Clear search or close menus</span></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    window.__ABSTRACTIVE_MONACO_BASE__ = ${JSON.stringify(String(monacoBaseUri))};
    window.__ABSTRACTIVE_MONACO_LOADER__ = ${JSON.stringify(String(monacoLoaderUri))};
    window.__ABSTRACTIVE_MONACO_WORKERS__ = ${JSON.stringify(monacoWorkers)};
${browserScript}
  </script>
</body>
</html>`;
}

function monacoWorkerUris(webview: vscode.Webview, extensionUri: vscode.Uri): Record<string, string> {
  const assetsUri = vscode.Uri.joinPath(extensionUri, 'media', 'monaco', 'vs', 'assets');
  const editorWorker = monacoAssetUri(webview, assetsUri, 'editor.worker-');
  const tsWorker = monacoAssetUri(webview, assetsUri, 'ts.worker-');
  const cssWorker = monacoAssetUri(webview, assetsUri, 'css.worker-');
  const htmlWorker = monacoAssetUri(webview, assetsUri, 'html.worker-');
  const jsonWorker = monacoAssetUri(webview, assetsUri, 'json.worker-');

  return {
    editorWorkerService: editorWorker,
    editor: editorWorker,
    typescript: tsWorker,
    javascript: tsWorker,
    css: cssWorker,
    scss: cssWorker,
    less: cssWorker,
    html: htmlWorker,
    handlebars: htmlWorker,
    razor: htmlWorker,
    json: jsonWorker
  };
}

function monacoAssetUri(webview: vscode.Webview, assetsUri: vscode.Uri, prefix: string): string {
  const fileName = fs.readdirSync(assetsUri.fsPath).find((name) => name.startsWith(prefix) && name.endsWith('.js'));
  if (!fileName) {
    throw new Error(`Missing Monaco asset ${prefix}*.js`);
  }
  return String(webview.asWebviewUri(vscode.Uri.joinPath(assetsUri, fileName)));
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
