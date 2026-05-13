import { graphWebviewScript } from './graphScript';

export const browserScript = String.raw`
    const vscode = acquireVsCodeApi();
    const persistedState = vscode.getState() || {};
    const layoutVersion = 3;
    const state = {
      repoName: '',
      repoRoot: '',
      repositories: [],
      showRepoContext: false,
      branches: [],
      currentBranch: '',
      selectedBranch: persistedState.selectedBranch || '',
      mode: persistedState.mode || 'log',
      compareBaseBranch: '',
      compareBranch: '',
      historyFilePath: persistedState.historyFilePath || '',
      commits: [],
      selectedCommit: persistedState.selectedCommit || '',
      files: [],
      selectedFile: persistedState.selectedFile || '',
      selectedCommitDetails: undefined,
      patch: '',
      diffOriginal: undefined,
      diffModified: undefined,
      diffLoading: false,
      diffPlacement: persistedState.layoutVersion === layoutVersion && persistedState.diffPlacement === 'right' ? 'right' : 'bottom',
      diffView: normalizeDiffView(persistedState.diffView),
      detailsVisible: persistedState.detailsVisible === true,
      collapsedHunks: [],
      error: '',
      loading: false,
      filesLoading: false,
      filesLoadingVisible: false,
      filesLoadingTimer: undefined,
      pendingFilesCommit: '',
      contextMenuType: '',
      hoveredCommit: '',
      currentHunkIndex: -1,
      activePane: persistedState.activePane || 'commits',
      branchSearch: persistedState.branchSearch || '',
      branchFilter: persistedState.branchFilter || 'all',
      commitSearch: persistedState.commitSearch || '',
      fileSearch: persistedState.fileSearch || '',
      fileFilter: persistedState.fileFilter || 'all',
      graphLaneCount: 1,
      paneColumns: validWidths(persistedState.paneColumns, [180, 560, 280, 520], 4),
      diffPaneHeight: validDimension(persistedState.diffPaneHeight, 280, 160),
      commitColumns: normalizedCommitColumns(persistedState.commitColumns, persistedState.layoutVersion)
    };

    const layoutEl = document.querySelector('.layout');
    const branchesEl = document.getElementById('branches');
    const commitsEl = document.getElementById('commits');
    const filesEl = document.getElementById('files');
    const diffEl = document.getElementById('diff');
    const diffStatsEl = document.getElementById('diffStats');
    const detailsEl = document.getElementById('selectionDetails');
    const diffStackEl = document.querySelector('.diff-stack');
    const commitSummaryEl = document.getElementById('commitSummary');
    const toolbarEl = document.querySelector('.toolbar');
    const toolbarStatusEl = document.querySelector('.toolbar-status');
    const repositorySelectEl = document.getElementById('repositorySelect');
    const branchSearchEl = document.getElementById('branchSearch');
    const commitSearchEl = document.getElementById('commitSearch');
    const fileSearchEl = document.getElementById('fileSearch');
    const titleEl = document.getElementById('title');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const contextMenuEl = document.getElementById('contextMenu');
    const helpOverlayEl = document.getElementById('helpOverlay');
    const paneEls = Array.from(document.querySelectorAll('[data-pane]'));
    let graphRenderFrame = 0;
    let graphCommits = [];
    let graphRows = new Map();
    let suppressMouseResizeUntil = 0;
    let monacoPromise = undefined;
    let monacoDiffEditor = undefined;
    let monacoModels = [];
    let monacoDisposables = [];

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    repositorySelectEl.addEventListener('change', () => {
      vscode.postMessage({ type: 'setRepository', repoRoot: repositorySelectEl.value });
    });
    document.getElementById('checkoutBranch').addEventListener('click', checkoutSelectedBranch);
    document.getElementById('branchActions').addEventListener('click', showSelectedBranchActions);
    document.getElementById('copyHash').addEventListener('click', copySelectedCommitHash);
    document.getElementById('commitActions').addEventListener('click', showSelectedCommitActions);
    document.getElementById('openFile').addEventListener('click', openSelectedFileAtRevision);
    document.getElementById('openWorkingFile').addEventListener('click', openSelectedWorkingFile);
    document.getElementById('openDiff').addEventListener('click', openSelectedFileDiff);
    document.getElementById('toggleDiffPlacementToolbar').addEventListener('click', toggleDiffPlacement);
    document.getElementById('toggleDetailsToolbar').addEventListener('click', toggleDetails);
    document.getElementById('stageChange').addEventListener('click', stageSelectedChange);
    document.getElementById('unstageChange').addEventListener('click', unstageSelectedChange);
    document.getElementById('commitChanges').addEventListener('click', commitLocalChanges);
    document.getElementById('shelveChanges').addEventListener('click', shelveLocalChanges);
    document.getElementById('unshelveChanges').addEventListener('click', unshelveChanges);
    document.getElementById('showHelp').addEventListener('click', showHelp);
    document.getElementById('closeHelp').addEventListener('click', hideHelp);
    document.getElementById('resetLayout').addEventListener('click', () => vscode.postMessage({ type: 'resetLayout' }));
    document.getElementById('toggleDiffPlacement').addEventListener('click', toggleDiffPlacement);
    document.getElementById('toggleDetails').addEventListener('click', toggleDetails);
    document.getElementById('toggleDiffView')?.addEventListener('click', toggleDiffView);
    document.getElementById('prevFile').addEventListener('click', () => navigateFile(-1));
    document.getElementById('nextFile').addEventListener('click', () => navigateFile(1));
    document.getElementById('prevHunk').addEventListener('click', () => navigateHunk(-1));
    document.getElementById('nextHunk').addEventListener('click', () => navigateHunk(1));
    document.getElementById('clearHistory').addEventListener('click', clearHistoryMode);
    contextMenuEl.addEventListener('click', handleContextMenuClick);
    helpOverlayEl.addEventListener('click', (event) => {
      if (event.target === helpOverlayEl) hideHelp();
    });
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('scroll', hideContextMenu, true);
    window.addEventListener('resize', () => {
      scheduleCommitGraphOverlay();
      layoutSplitDiff();
    });
    if (typeof ResizeObserver !== 'undefined') {
      const graphResizeObserver = new ResizeObserver(() => scheduleCommitGraphOverlay());
      graphResizeObserver.observe(commitsEl);
    }
    branchSearchEl.value = state.branchSearch;
    branchSearchEl.addEventListener('input', () => {
      state.branchSearch = branchSearchEl.value;
      saveLayoutState();
      renderBranches();
    });
    document.querySelectorAll('[data-branch-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.branchFilter = button.dataset.branchFilter;
        saveLayoutState();
        renderBranches();
        updateHeaderButtonStates();
        focusSelected();
      });
    });
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = button.dataset.mode;
        if (state.mode !== 'history') {
          state.historyFilePath = '';
        }
        saveLayoutState();
        vscode.postMessage({ type: 'setMode', mode: state.mode });
        renderChrome();
      });
    });
    commitSearchEl.value = state.commitSearch;
    commitSearchEl.addEventListener('input', () => {
      state.commitSearch = commitSearchEl.value;
      saveLayoutState();
      renderCommits();
    });
    fileSearchEl.value = state.fileSearch;
    fileSearchEl.addEventListener('input', () => {
      state.fileSearch = fileSearchEl.value;
      saveLayoutState();
      renderFiles();
      renderChrome();
    });
    document.querySelectorAll('[data-file-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.fileFilter = button.dataset.fileFilter;
        saveLayoutState();
        renderFiles();
        renderChrome();
        focusSelected();
      });
    });
    document.addEventListener('keydown', handleKeydown);
    paneEls.forEach((pane) => {
      pane.addEventListener('focusin', () => setActivePane(pane.dataset.pane || state.activePane, false));
      pane.addEventListener('pointerdown', () => setActivePane(pane.dataset.pane || state.activePane, false));
    });
    document.querySelectorAll('.pane-divider').forEach((divider) => {
      divider.addEventListener('pointerdown', (event) => startPaneResize(event, Number(divider.dataset.divider), divider));
      divider.addEventListener('mousedown', (event) => startPaneResize(event, Number(divider.dataset.divider), divider));
    });
    layoutEl.addEventListener('pointerdown', handleLayoutPointerDown);
    layoutEl.addEventListener('mousedown', handleLayoutPointerDown);
    applyPaneColumns();
    renderChrome();
    if (persistedState.layoutVersion !== layoutVersion) {
      saveLayoutState();
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'init') {
        state.repoName = message.repoName || '';
        state.repoRoot = message.repoRoot || '';
        state.repositories = message.repositories || [];
        state.showRepoContext = Boolean(message.showRepoContext);
        state.branches = message.branches || [];
        state.currentBranch = message.currentBranch || '';
        const restoredBranch = state.selectedBranch && state.branches.some((branch) => branch.name === state.selectedBranch)
          ? state.selectedBranch
          : '';
        state.selectedBranch = restoredBranch || message.selectedBranch || '';
        state.mode = message.mode || state.mode || 'log';
        state.commits = message.commits || [];
        state.files = [];
        state.compareBaseBranch = '';
        state.compareBranch = '';
        state.historyFilePath = message.historyFilePath || state.historyFilePath || '';
        state.selectedCommitDetails = undefined;
        clearDiffState(false);
        setFilesLoading(false);
        state.collapsedHunks = [];
        state.error = '';
        render();
        if (restoredBranch && restoredBranch !== message.selectedBranch) {
          vscode.postMessage({ type: 'selectBranch', branch: restoredBranch });
        }
      }
      if (message.type === 'branchData') {
        if (state.selectedBranch && message.selectedBranch && message.selectedBranch !== state.selectedBranch) {
          return;
        }
        state.selectedBranch = message.selectedBranch || '';
        state.mode = message.mode || state.mode || 'log';
        state.commits = message.commits || [];
        state.files = [];
        state.compareBaseBranch = '';
        state.compareBranch = '';
        state.historyFilePath = '';
        const restoredCommit = state.selectedCommit && state.commits.some((commit) => commit.hash === state.selectedCommit)
          ? state.selectedCommit
          : '';
        state.selectedCommit = restoredCommit;
        state.selectedFile = '';
        state.selectedCommitDetails = undefined;
        clearDiffState(false);
        setFilesLoading(false);
        state.error = '';
        render();
        focusSelected();
        if (restoredCommit) {
          vscode.postMessage({ type: 'selectCommit', hash: restoredCommit });
        }
      }
      if (message.type === 'compareFiles') {
        if (state.selectedBranch && message.selectedBranch && message.selectedBranch !== state.selectedBranch) {
          return;
        }
        state.selectedBranch = message.selectedBranch || '';
        state.mode = message.mode || 'files';
        state.compareBaseBranch = message.baseBranch || '';
        state.compareBranch = message.compareBranch || '';
        state.historyFilePath = '';
        state.commits = [];
        state.files = message.files || [];
        state.selectedCommit = '';
        const restoredFile = state.selectedFile && state.files.some((file) => fileKey(file) === state.selectedFile)
          ? state.selectedFile
          : '';
        state.selectedFile = restoredFile;
        state.selectedCommitDetails = undefined;
        clearDiffState(!!restoredFile);
        setFilesLoading(false);
        state.currentHunkIndex = -1;
        state.collapsedHunks = [];
        state.error = '';
        render();
        focusSelected();
        if (restoredFile) {
          const file = state.files.find((item) => fileKey(item) === restoredFile);
          if (file) vscode.postMessage({ type: 'selectCompareFile', file });
        }
      }
      if (message.type === 'localChanges') {
        state.mode = message.mode || 'changes';
        state.historyFilePath = '';
        state.commits = [];
        state.files = message.files || [];
        state.selectedCommit = '';
        const restoredFile = state.selectedFile && state.files.some((file) => fileKey(file) === state.selectedFile)
          ? state.selectedFile
          : '';
        state.selectedFile = restoredFile;
        state.selectedCommitDetails = undefined;
        clearDiffState(!!restoredFile);
        setFilesLoading(false);
        state.currentHunkIndex = -1;
        state.collapsedHunks = [];
        state.error = '';
        render();
        focusSelected();
        if (restoredFile) {
          const change = state.files.find((item) => fileKey(item) === restoredFile);
          if (change) vscode.postMessage({ type: 'selectLocalChange', change });
        }
      }
      if (message.type === 'fileHistory') {
        state.mode = message.mode || 'history';
        state.historyFilePath = message.filePath || '';
        state.commitSearch = '';
        commitSearchEl.value = '';
        state.commits = message.commits || [];
        state.files = [];
        state.selectedCommitDetails = undefined;
        clearDiffState(false);
        setFilesLoading(false);
        const restoredCommit = state.selectedCommit && state.commits.some((commit) => commit.hash === state.selectedCommit)
          ? state.selectedCommit
          : (state.commits[0]?.hash || '');
        state.selectedCommit = restoredCommit;
        state.selectedFile = '';
        state.currentHunkIndex = -1;
        state.collapsedHunks = [];
        state.error = '';
        render();
        focusSelected();
        if (restoredCommit) {
          vscode.postMessage({ type: 'selectCommit', hash: restoredCommit });
        }
      }
      if (message.type === 'commitFiles') {
        if (state.selectedCommit && message.selectedCommit && message.selectedCommit !== state.selectedCommit) {
          return;
        }
        state.selectedCommit = message.selectedCommit || '';
        state.files = message.files || [];
        setFilesLoading(false);
        const restoredFile = state.selectedFile && state.files.some((file) => fileKey(file) === state.selectedFile)
          ? state.selectedFile
          : '';
        state.selectedFile = restoredFile;
        clearDiffState(!!restoredFile);
        state.currentHunkIndex = -1;
        state.collapsedHunks = [];
        state.error = '';
        render();
        focusSelected();
        if (restoredFile && state.selectedCommit) {
          const file = state.files.find((item) => fileKey(item) === restoredFile);
          if (file) vscode.postMessage({ type: 'selectFile', hash: state.selectedCommit, file });
        }
      }
      if (message.type === 'patch') {
        if (state.selectedFile && message.selectedFile && message.selectedFile !== state.selectedFile) {
          return;
        }
        state.selectedFile = message.selectedFile || '';
        state.patch = message.patch || '';
        state.diffOriginal = typeof message.original === 'string' ? message.original : undefined;
        state.diffModified = typeof message.modified === 'string' ? message.modified : undefined;
        state.diffLoading = false;
        state.currentHunkIndex = -1;
        state.collapsedHunks = [];
        state.error = '';
        renderDiff();
        renderFiles();
        renderDetails();
        focusSelected();
      }
      if (message.type === 'commitDetails') {
        if (message.commit?.hash && state.selectedCommit && message.commit.hash !== state.selectedCommit) {
          return;
        }
        state.selectedCommitDetails = message.commit;
        renderCommitSummary();
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
      renderCommitSummary();
      renderBranches();
      renderCommits();
      renderFiles();
      renderDiff();
      renderDetails();
    }

    function renderChrome() {
      renderActivePane();
      const title = toolWindowTitle();
      renderRepositorySelect();
      titleEl.textContent = title;
      titleEl.title = title ? toolWindowTitleTooltip() : '';
      errorEl.textContent = state.error || '';
      const hasStatus = Boolean(title || state.error);
      loadingEl.textContent = state.loading && hasStatus ? 'Loading...' : '';
      toolbarStatusEl.hidden = !hasStatus;
      toolbarEl.classList.toggle('has-status', hasStatus);
      const branch = selectedBranch();
      const commit = selectedCommit();
      document.getElementById('checkoutBranch').disabled = !branch || branch.current;
      document.getElementById('branchActions').disabled = false;
      document.getElementById('copyHash').disabled = !commit;
      document.getElementById('commitActions').disabled = !commit;
      const file = selectedFile();
      const localChange = selectedLocalChange();
      document.getElementById('openFile').disabled = !file || state.mode === 'changes';
      document.getElementById('openWorkingFile').disabled = !file || (state.mode === 'changes' && localChange?.bucket === 'staged');
      document.getElementById('openDiff').disabled = !file;
      document.getElementById('stageChange').disabled = state.mode !== 'changes' || !localChange || localChange.bucket === 'staged';
      document.getElementById('unstageChange').disabled = state.mode !== 'changes' || !localChange || localChange.bucket !== 'staged';
      document.getElementById('commitChanges').disabled = state.mode !== 'changes' || !state.files.some((item) => item.bucket === 'staged');
      document.getElementById('shelveChanges').disabled = state.mode !== 'changes' || !state.files.length;
      document.getElementById('unshelveChanges').disabled = state.mode !== 'changes';
      updateDiffPlacementButton(document.getElementById('toggleDiffPlacement'), 'short');
      updateDiffPlacementButton(document.getElementById('toggleDiffPlacementToolbar'), 'toolbar');
      updateDetailsButton(document.getElementById('toggleDetails'));
      updateDetailsButton(document.getElementById('toggleDetailsToolbar'));
      detailsEl.hidden = !state.detailsVisible;
      diffStackEl.classList.toggle('details-hidden', !state.detailsVisible);
      updateDiffViewButton(document.getElementById('toggleDiffView'));
      updateDiffNavigation();
      updateHeaderButtonStates();
      const historyChip = document.getElementById('historyChip');
      const historyChipLabel = document.getElementById('historyChipLabel');
      const showingHistory = state.mode === 'history' && Boolean(state.historyFilePath);
      historyChip.hidden = !showingHistory;
      historyChip.title = showingHistory ? 'Viewing file history for ' + state.historyFilePath : '';
      historyChipLabel.textContent = showingHistory ? 'History: ' + state.historyFilePath : '';
    }

    function updateHeaderButtonStates() {
      document.querySelectorAll('[data-branch-filter]').forEach((button) => {
        button.classList.toggle('active', button.dataset.branchFilter === state.branchFilter);
      });
      document.querySelectorAll('[data-mode]').forEach((button) => {
        button.classList.toggle('active', button.dataset.mode === state.mode);
      });
      document.querySelectorAll('[data-file-filter]').forEach((button) => {
        button.classList.toggle('active', button.dataset.fileFilter === state.fileFilter);
      });
    }

    function renderRepositorySelect() {
      repositorySelectEl.hidden = state.repositories.length <= 1;
      if (repositorySelectEl.hidden) {
        return;
      }

      const selected = repositorySelectEl.value;
      repositorySelectEl.innerHTML = state.repositories.map((repository) =>
        '<option value="' + escapeHtml(repository.root) + '">' + escapeHtml(repository.name) + '</option>'
      ).join('');
      repositorySelectEl.value = state.repoRoot || selected;
      repositorySelectEl.title = state.repoRoot || '';
    }

    function updateDiffPlacementButton(button, variant) {
      if (!button) return;
      const movingToBottom = state.diffPlacement === 'right';
      setIconButton(button, movingToBottom ? 'layout-panel' : 'layout-panel-right', movingToBottom ? 'Dock diff preview at the bottom' : 'Dock diff preview on the right');
      button.title = movingToBottom ? 'Dock diff preview at the bottom' : 'Dock diff preview on the right';
      button.classList.toggle('active', state.diffPlacement === 'right');
    }

    function updateDetailsButton(button) {
      if (!button) return;
      setIconButton(button, state.detailsVisible ? 'eye-closed' : 'inspect', state.detailsVisible ? 'Hide selection details' : 'Show selection details');
      button.title = state.detailsVisible ? 'Hide selection details' : 'Show selection details';
      button.classList.toggle('active', state.detailsVisible);
    }

    function updateDiffViewButton(button) {
      if (!button) return;
      const split = state.diffView === 'side';
      setIconButton(button, split ? 'list-unordered' : 'split-horizontal', split ? 'Combined diff preview' : 'Split diff preview');
      button.title = split ? 'Show combined diff preview' : 'Show split diff preview';
      button.classList.toggle('active', split);
    }

    function setIconButton(button, iconName, label) {
      button.innerHTML = '<span class="codicon codicon-' + escapeHtml(iconName) + '" aria-hidden="true"></span>' +
        '<span class="sr-only">' + escapeHtml(label) + '</span>';
      button.setAttribute('aria-label', label);
    }

    function toolWindowTitle() {
      if (!state.showRepoContext) {
        return '';
      }
      const repo = state.repoName || 'SCM';
      const subject = state.mode === 'history' && state.historyFilePath
        ? state.historyFilePath
        : (state.selectedBranch || state.currentBranch || '');
      return subject ? repo + ' / ' + subject : repo;
    }

    function toolWindowTitleTooltip() {
      const lines = [];
      if (state.repoRoot) {
        lines.push(state.repoRoot);
      }
      if (state.currentBranch) {
        lines.push('Current branch: ' + state.currentBranch);
      }
      if (state.selectedBranch && state.selectedBranch !== state.currentBranch) {
        lines.push('Selected branch: ' + state.selectedBranch);
      }
      if (state.mode === 'history' && state.historyFilePath) {
        lines.push('File history: ' + state.historyFilePath);
      }
      return lines.join('\n');
    }

    function renderActivePane() {
      paneEls.forEach((pane) => {
        const active = pane.dataset.pane === state.activePane;
        pane.classList.toggle('active-pane', active);
        pane.setAttribute('aria-current', active ? 'true' : 'false');
      });
    }

    function renderCommitSummary() {
      if (state.mode === 'files' || state.mode === 'changes') {
        commitSummaryEl.hidden = true;
        commitSummaryEl.innerHTML = '';
        return;
      }

      const commit = commitSummarySource();
      if (!commit) {
        commitSummaryEl.hidden = true;
        commitSummaryEl.innerHTML = '';
        return;
      }

      const parents = commit.parents || (Array.isArray(commit.parentHashes) ? commit.parentHashes.join(' ') : '');
      const meta = [
        '<span title="' + escapeHtml(commit.hash) + '">' + escapeHtml(commit.shortHash || commit.hash.slice(0, 12)) + '</span>',
        '<span>' + escapeHtml(commit.author + ' - ' + formatDate(commit.date)) + '</span>',
        parents ? '<span title="' + escapeHtml(parents) + '">' + escapeHtml('Parents ' + shortParents(parents)) + '</span>' : '',
        '<span>' + escapeHtml(state.files.length ? fileSummary(state.files) : 'Loading files...') + '</span>'
      ].filter(Boolean);
      commitSummaryEl.hidden = false;
      commitSummaryEl.innerHTML =
        '<div class="commit-summary-title" title="' + escapeHtml(commit.subject) + '">' + escapeHtml(commit.subject) + '</div>' +
        '<div class="commit-summary-meta">' + meta.join('') + '</div>';
    }

    function commitSummarySource() {
      if (state.selectedCommitDetails?.hash === state.selectedCommit) {
        return state.selectedCommitDetails;
      }
      return selectedCommit();
    }

    function renderBranches() {
      const branches = filteredBranches();
      if (!state.branches.length) {
        branchesEl.innerHTML = '<div class="empty">No branches.</div>';
        return;
      }
      if (!branches.length) {
        branchesEl.innerHTML = '<div class="empty">No branches match the filter.</div>';
        return;
      }
      const localBranches = branches.filter((branch) => !branch.remote);
      const remoteBranches = branches.filter((branch) => branch.remote);
      const rows = [
        ...localBranches.map(renderBranchRow),
        ...remoteBranches.map(renderBranchRow)
      ];
      branchesEl.replaceChildren(...rows);
    }

    function renderBranchRow(branch) {
      const selected = branch.name === state.selectedBranch;
      const row = selectableRow('branch-row row' + rowState('branches', selected), 'option', selected);
      row.title = branch.subject || branch.name;
      row.innerHTML = '<div class="primary">' + escapeHtml(branch.current ? branch.name + ' *' : branch.name) + '</div>' +
        '<div class="branch-kind">' + escapeHtml(branch.remote ? 'remote' : 'local') + '</div>';
      row.addEventListener('focus', () => setActivePane('branches', false));
      row.addEventListener('click', () => selectBranch(branch.name));
      row.addEventListener('dblclick', () => checkoutSelectedBranch());
      row.addEventListener('contextmenu', (event) => {
        selectBranch(branch.name);
        showContextMenu(event, 'branch');
      });
      return row;
    }

    function renderCommits() {
      if (state.mode === 'changes') {
        clearCommitGraphOverlay();
        commitsEl.innerHTML = '<div class="empty">' + escapeHtml(localChangesSummary()) + '</div>';
        return;
      }
      if (state.mode === 'files') {
        clearCommitGraphOverlay();
        const label = state.compareBaseBranch && state.compareBranch
          ? 'Changed files: ' + state.compareBaseBranch + '...' + state.compareBranch
          : 'Changed files mode';
        commitsEl.innerHTML = '<div class="empty">' + escapeHtml(label) + '</div>';
        return;
      }
      if (!state.commits.length) {
        clearCommitGraphOverlay();
        commitsEl.innerHTML = '<div class="empty">' + escapeHtml(emptyCommitMessage()) + '</div>';
        return;
      }
      const commits = filteredCommits();
      if (!commits.length) {
        clearCommitGraphOverlay();
        commitsEl.innerHTML = '<div class="empty">No commits match the filter.</div>';
        return;
      }
      graphCommits = state.mode === 'history' ? [] : commits;
      graphRows = state.mode === 'history' ? new Map() : buildGraphRows(commits);
      state.graphLaneCount = graphLaneCount(graphRows);
      const header = document.createElement('div');
      header.className = 'commit-header';
      header.setAttribute('role', 'row');
      applyCommitColumns(header);
      const columns = commitColumnDefinitions();
      header.append(...columns.map((column, index) => commitHeaderCell(column.label, column.widthIndex, column.extraClass, index, columns.length)));
      header.addEventListener('pointerdown', handleCommitHeaderPointerDown);
      header.addEventListener('mousedown', handleCommitHeaderPointerDown);
      commitsEl.replaceChildren(header, ...commits.map((commit, index) => {
        const selected = commit.hash === state.selectedCommit;
        const row = selectableRow('commit-row row' + (state.mode === 'history' ? '' : ' has-graph') + rowState('commits', selected), 'row', selected);
        applyCommitColumns(row);
        row.setAttribute('aria-rowindex', String(index + 2));
        row.title = commit.hash + '\n' + commit.author;
        row.innerHTML = '<div class="hash" role="gridcell">' + escapeHtml(commit.shortHash) + '</div>' +
          '<div class="author" role="gridcell">' + escapeHtml(commit.author) + '</div>' +
          '<div class="date" role="gridcell">' + escapeHtml(formatDate(commit.date)) + '</div>' +
          '<div class="subject" role="gridcell"><div class="subject-line">' + renderRefLabels(commit.refs) +
          '<span class="subject-text">' + escapeHtml(commit.subject) + '</span></div></div>';
        row.addEventListener('focus', () => setActivePane('commits', false));
        row.addEventListener('mouseenter', () => {
          if (state.mode === 'history') return;
          state.hoveredCommit = commit.hash;
          scheduleCommitGraphOverlay();
        });
        row.addEventListener('mouseleave', () => {
          if (state.hoveredCommit !== commit.hash) return;
          state.hoveredCommit = '';
          scheduleCommitGraphOverlay();
        });
        row.addEventListener('click', () => selectCommit(commit.hash));
        row.addEventListener('contextmenu', (event) => {
          selectCommit(commit.hash);
          showContextMenu(event, 'commit');
        });
        return row;
      }));
      if (state.mode !== 'history') {
        scheduleCommitGraphOverlay();
      }
    }

    function renderFiles() {
      filesEl.classList.toggle('loading-files', state.filesLoadingVisible);
      const files = filteredFiles();
      if (!state.files.length) {
        filesEl.innerHTML = '<div class="empty">' + escapeHtml(state.filesLoadingVisible ? 'Loading files...' : 'No files.') + '</div>';
        return;
      }
      if (!files.length) {
        filesEl.innerHTML = '<div class="empty">No files match the filter.</div>';
        return;
      }
      filesEl.replaceChildren(...files.map((file) => {
        const selected = fileKey(file) === state.selectedFile;
        const row = selectableRow('file-row row' + rowState('files', selected), 'option', selected);
        row.title = file.originalPath ? file.originalPath + ' -> ' + file.filePath : file.filePath;
        row.innerHTML = '<div class="file-icon ' + fileIconClass(file) + '" title="' + escapeHtml(fileTypeLabel(file)) + '">' + escapeHtml(fileIconLabel(file)) + '</div>' +
          '<div class="file-main"><div class="primary">' + escapeHtml(file.filePath) + '</div>' +
          '<div class="secondary">' + escapeHtml(fileSecondary(file)) + '</div></div>' +
          '<div class="status ' + statusClass(file) + '" title="' + escapeHtml(fileStatusLabel(file)) + '">' + escapeHtml(fileStatusDisplay(file)) + '</div>';
        row.addEventListener('focus', () => setActivePane('files', false));
        row.addEventListener('click', () => selectFile(file));
        row.addEventListener('dblclick', () => {
          selectFile(file);
          openSelectedFileDiff();
        });
        row.addEventListener('contextmenu', (event) => {
          selectFile(file);
          showContextMenu(event, 'file');
        });
        return row;
      }));
    }

    function clearDiffState(loading) {
      state.patch = '';
      state.diffOriginal = undefined;
      state.diffModified = undefined;
      state.diffLoading = loading === true;
    }

    function renderDiff() {
      if (!state.patch && !hasDiffContent()) {
        disposeMonacoDiff();
        diffEl.classList.remove('diff-split-mode', 'monaco-diff-mode');
        diffEl.innerHTML = '<div class="empty">' + escapeHtml(emptyDiffMessage()) + '</div>';
        diffStatsEl.textContent = '';
        updateDiffNavigation();
        return;
      }
      const parsed = state.patch ? parsePatch(state.patch) : { meta: [], hunks: [] };
      const stats = patchStats(parsed);
      if (parsed.hunks.length === 0 && !hasDiffContent()) {
        disposeMonacoDiff();
        diffEl.classList.remove('diff-split-mode', 'monaco-diff-mode');
        diffEl.innerHTML = '<div class="empty">' + escapeHtml(emptyDiffMessage()) + '</div>';
        updateDiffNavigation();
        return;
      }
      diffEl.classList.toggle('diff-split-mode', state.diffView === 'side');
      diffEl.classList.toggle('monaco-diff-mode', state.diffView === 'side');
      if (state.diffView === 'side') {
        diffStatsEl.textContent = '';
        renderMonacoDiff(parsed);
        updateDiffNavigation();
        return;
      }
      diffStatsEl.textContent = '+' + stats.added + ' -' + stats.deleted;
      disposeMonacoDiff();
      diffEl.innerHTML = renderUnifiedDiff(parsed);
      diffEl.querySelectorAll('[data-hunk-index]').forEach((item) => {
        item.addEventListener('click', () => toggleCollapsedHunk(Number(item.getAttribute('data-hunk-index'))));
      });
      layoutSplitDiff();
      setupSplitDiffScrolling();
      highlightCurrentHunk(false);
    }

    function emptyDiffMessage() {
      if (state.diffLoading) return 'Loading diff...';
      if (selectedFile()) return 'No textual diff available for this file.';
      return 'Select a commit file to preview its diff.';
    }

    function hasDiffContent() {
      return typeof state.diffOriginal === 'string' && typeof state.diffModified === 'string' &&
        (state.diffOriginal.length > 0 || state.diffModified.length > 0);
    }

    function renderMonacoDiff(parsed) {
      const patch = state.patch;
      const file = selectedFile();
      diffEl.innerHTML = '<div class="monaco-diff" id="monacoDiff"></div>';
      loadMonaco().then((monaco) => {
        if (state.patch !== patch || state.diffView !== 'side') {
          return;
        }
        const container = document.getElementById('monacoDiff');
        if (!container) {
          return;
        }
        disposeMonacoDiff();
        configureMonacoTheme(monaco);
        const texts = diffModelTexts(parsed);
        const language = monacoLanguage(file?.filePath || '');
        const modelId = Date.now() + '-' + Math.random().toString(16).slice(2);
        const original = monaco.editor.createModel(texts.original, language, monaco.Uri.parse('inmemory://abstractive-scm/original-' + modelId + fileExtension(file?.filePath || '')));
        const modified = monaco.editor.createModel(texts.modified, language, monaco.Uri.parse('inmemory://abstractive-scm/modified-' + modelId + fileExtension(file?.filePath || '')));
        monacoModels = [original, modified];
        monacoDiffEditor = monaco.editor.createDiffEditor(container, {
          automaticLayout: true,
          readOnly: true,
          originalEditable: false,
          renderSideBySide: true,
          useInlineViewWhenSpaceIsLimited: false,
          compactMode: true,
          renderOverviewRuler: false,
          overviewRulerLanes: 0,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          folding: false,
          glyphMargin: false,
          lineDecorationsWidth: 0,
          lineNumbers: 'off',
          lineNumbersMinChars: 0,
          renderLineHighlight: 'none',
          padding: { top: 0, bottom: 0 },
          guides: {
            indentation: false,
            bracketPairs: false
          },
          fontFamily: editorFontFamily(),
          fontSize: editorFontSize(),
          lineHeight: editorLineHeight(),
          wordWrap: 'on',
          diffWordWrap: 'on',
          hideUnchangedRegions: {
            enabled: true,
            revealLineCount: 4,
            minimumLineCount: 8,
            contextLineCount: 3
          },
          scrollbar: {
            alwaysConsumeMouseWheel: false,
            horizontal: 'hidden',
            vertical: 'auto'
          }
        });
        monacoDiffEditor.setModel({ original, modified });
        monacoDiffEditor.layout();
        monacoDisposables = [
          monacoDiffEditor.onDidUpdateDiff(() => updateMonacoDiffState(monacoDiffEditor))
        ];
        updateMonacoDiffState(monacoDiffEditor);
      }).catch(() => {
        if (state.patch !== patch || state.diffView !== 'side') {
          return;
        }
        diffEl.classList.remove('monaco-diff-mode');
        diffEl.innerHTML = renderSideBySideDiff(parsed);
        diffEl.querySelectorAll('[data-hunk-index]').forEach((item) => {
          item.addEventListener('click', () => toggleCollapsedHunk(Number(item.getAttribute('data-hunk-index'))));
        });
        layoutSplitDiff();
        setupSplitDiffScrolling();
        highlightCurrentHunk(false);
      });
    }

    function loadMonaco() {
      if (window.monaco) {
        configureMonacoWorkers();
        return Promise.resolve(window.monaco);
      }
      if (monacoPromise) {
        return monacoPromise;
      }
      monacoPromise = new Promise((resolve, reject) => {
        const loader = window.__ABSTRACTIVE_MONACO_LOADER__;
        const base = window.__ABSTRACTIVE_MONACO_BASE__;
        if (!loader || !base) {
          reject(new Error('Monaco assets are unavailable.'));
          return;
        }
        configureMonacoWorkers();
        const script = document.createElement('script');
        script.src = loader;
        script.onload = () => {
          try {
            window.require.config({ paths: { vs: base } });
            window.require(['vs/editor/editor.main'], () => {
              configureMonacoWorkers();
              resolve(window.monaco);
            });
          } catch (error) {
            reject(error);
          }
        };
        script.onerror = () => reject(new Error('Failed to load Monaco.'));
        document.head.appendChild(script);
      });
      return monacoPromise;
    }

    function configureMonacoWorkers() {
      window.MonacoEnvironment = {
        ...(window.MonacoEnvironment || {}),
        getWorker: (_workerId, label) => loadMonacoWorker(label)
      };
    }

    function loadMonacoWorker(label) {
      const workers = window.__ABSTRACTIVE_MONACO_WORKERS__ || {};
      const workerUri = workers[label] || workers.editorWorkerService || workers.editor;
      if (!workerUri) {
        throw new Error('Monaco worker assets are unavailable.');
      }
      return fetch(workerUri)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Failed to load Monaco worker ' + label + ': ' + response.status);
          }
          return response.text();
        })
        .then((source) => {
          const blob = new Blob([source], { type: 'text/javascript' });
          return new Worker(URL.createObjectURL(blob), { name: label || 'monaco-worker' });
        });
    }

    function disposeMonacoDiff() {
      monacoDisposables.forEach((disposable) => disposable.dispose());
      monacoDisposables = [];
      if (monacoDiffEditor) {
        monacoDiffEditor.dispose();
        monacoDiffEditor = undefined;
      }
      monacoModels.forEach((model) => model.dispose());
      monacoModels = [];
    }

    function updateMonacoDiffState(editor) {
      if (monacoDiffEditor !== editor) {
        return;
      }
      const changes = typeof editor.getLineChanges === 'function' ? editor.getLineChanges() : undefined;
      if (!changes) {
        return;
      }
      const stats = monacoDiffStats(changes);
      diffStatsEl.textContent = '+' + stats.added + ' -' + stats.deleted;
      revealFirstMonacoChange(editor, changes);
    }

    function monacoDiffStats(changes) {
      return changes.reduce((stats, change) => {
        stats.deleted += lineSpan(change.originalStartLineNumber, change.originalEndLineNumber);
        stats.added += lineSpan(change.modifiedStartLineNumber, change.modifiedEndLineNumber);
        return stats;
      }, { added: 0, deleted: 0 });
    }

    function lineSpan(start, end) {
      if (!start || !end) {
        return 0;
      }
      return Math.max(0, end - start + 1);
    }

    function revealFirstMonacoChange(editor, changes) {
      const first = changes[0];
      if (!first || editor.__abstractiveRevealedFirstChange) {
        return;
      }
      editor.__abstractiveRevealedFirstChange = true;
      const originalLine = first.originalStartLineNumber || first.originalEndLineNumber || 1;
      const modifiedLine = first.modifiedStartLineNumber || first.modifiedEndLineNumber || 1;
      editor.getOriginalEditor().revealLineInCenterIfOutsideViewport(originalLine);
      editor.getModifiedEditor().revealLineInCenterIfOutsideViewport(modifiedLine);
      if (typeof editor.goToDiff === 'function') {
        editor.goToDiff('next');
      }
    }

    function diffModelTexts(parsed) {
      if (typeof state.diffOriginal === 'string' && typeof state.diffModified === 'string') {
        return {
          original: state.diffOriginal,
          modified: state.diffModified
        };
      }
      return patchTexts(parsed);
    }

    function editorFontFamily() {
      return cssVariable('--vscode-editor-font-family', 'monospace');
    }

    function editorFontSize() {
      return cssNumber('--vscode-editor-font-size', 12);
    }

    function editorLineHeight() {
      return Math.round(editorFontSize() * 1.45);
    }

    function cssVariable(name, fallback) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    }

    function cssNumber(name, fallback) {
      const value = Number.parseFloat(cssVariable(name, String(fallback)));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    }

    function configureMonacoTheme(monaco) {
      const styles = getComputedStyle(document.documentElement);
      const background = themeColor(styles, '--vscode-editor-background', '#1e1e1e');
      const foreground = themeColor(styles, '--vscode-editor-foreground', '#d4d4d4');
      const lineNumber = themeColor(styles, '--vscode-editorLineNumber-foreground', '#858585');
      const selection = themeColor(styles, '--vscode-editor-selectionBackground', '#264f78');
      monaco.editor.defineTheme('abstractive-scm', {
        base: isLightColor(background) ? 'vs' : 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': background,
          'editor.foreground': foreground,
          'editorGutter.background': background,
          'editorLineNumber.foreground': lineNumber,
          'editor.selectionBackground': selection,
          'diffEditor.insertedTextBackground': alphaHex(themeColor(styles, '--vscode-diffEditor-insertedTextBackground', '#587c0c'), '36'),
          'diffEditor.removedTextBackground': alphaHex(themeColor(styles, '--vscode-diffEditor-removedTextBackground', '#f14c4c'), '30'),
          'diffEditor.insertedLineBackground': alphaHex(themeColor(styles, '--vscode-diffEditor-insertedLineBackground', '#587c0c'), '22'),
          'diffEditor.removedLineBackground': alphaHex(themeColor(styles, '--vscode-diffEditor-removedLineBackground', '#f14c4c'), '22')
        }
      });
      monaco.editor.setTheme('abstractive-scm');
    }

    function themeColor(styles, name, fallback) {
      const value = styles.getPropertyValue(name).trim();
      return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ? value : fallback;
    }

    function alphaHex(color, alpha) {
      return color.length === 7 ? color + alpha : color;
    }

    function isLightColor(color) {
      const hex = color.replace('#', '').slice(0, 6);
      const red = parseInt(hex.slice(0, 2), 16);
      const green = parseInt(hex.slice(2, 4), 16);
      const blue = parseInt(hex.slice(4, 6), 16);
      return (red * 299 + green * 587 + blue * 114) / 1000 > 160;
    }

    function patchTexts(parsed) {
      const original = [];
      const modified = [];
      parsed.hunks.forEach((hunk, index) => {
        if (index > 0) {
          original.push('');
          modified.push('');
        }
        hunk.lines.forEach((line) => {
          if (isDeletedLine(line)) {
            original.push(line.slice(1));
          } else if (isAddedLine(line)) {
            modified.push(line.slice(1));
          } else if (!isMetaLine(line)) {
            const text = line.startsWith(' ') ? line.slice(1) : line;
            original.push(text);
            modified.push(text);
          }
        });
      });
      return {
        original: original.join('\n'),
        modified: modified.join('\n')
      };
    }

    function monacoLanguage(filePath) {
      const extension = fileExtension(filePath).slice(1).toLowerCase();
      const languages = {
        css: 'css',
        html: 'html',
        js: 'javascript',
        jsx: 'javascript',
        json: 'json',
        md: 'markdown',
        ts: 'typescript',
        tsx: 'typescript',
        xml: 'xml',
        yaml: 'yaml',
        yml: 'yaml'
      };
      return languages[extension] || 'plaintext';
    }

    function fileExtension(filePath) {
      const name = String(filePath || '');
      const index = name.lastIndexOf('.');
      return index >= 0 ? name.slice(index) : '.txt';
    }

    function parsePatch(patch) {
      const parsed = { meta: [], hunks: [] };
      let current = undefined;
      patch.split('\n').forEach((line) => {
        if (line.startsWith('@@')) {
          current = { header: line, lines: [], index: parsed.hunks.length };
          parsed.hunks.push(current);
        } else if (current) {
          current.lines.push(line);
        } else {
          parsed.meta.push(line);
        }
      });
      return parsed;
    }

    function patchStats(parsed) {
      return parsed.hunks.reduce((stats, hunk) => {
        hunk.lines.forEach((line) => {
          if (line.startsWith('+') && !line.startsWith('+++')) stats.added += 1;
          else if (line.startsWith('-') && !line.startsWith('---')) stats.deleted += 1;
        });
        return stats;
      }, { added: 0, deleted: 0 });
    }

    function renderUnifiedDiff(parsed) {
      const parts = parsed.meta
        .filter((line) => line)
        .map((line) => diffLine(line, 'line meta'));
      parsed.hunks.forEach((hunk) => {
        parts.push(hunkHeader(hunk, 'line hunk'));
        if (hunkCollapsed(hunk.index)) {
          return;
        }
        for (let index = 0; index < hunk.lines.length; index += 1) {
          const line = hunk.lines[index];
          const next = hunk.lines[index + 1];
          if (isDeletedLine(line) && isAddedLine(next)) {
            parts.push(diffLine(line, 'line del', next));
            parts.push(diffLine(next, 'line add', line));
            index += 1;
          } else {
            parts.push(renderUnifiedLine(line));
          }
        }
      });
      return '<pre>' + parts.join('') + '</pre>';
    }

    function renderUnifiedLine(line) {
      if (isAddedLine(line)) return diffLine(line, 'line add');
      if (isDeletedLine(line)) return diffLine(line, 'line del');
      if (isMetaLine(line)) return diffLine(line, 'line meta');
      return diffLine(line, 'line');
    }

    function renderSideBySideDiff(parsed) {
      const leftRows = [];
      const rightRows = [];
      parsed.meta
        .filter((line) => line)
        .forEach((line) => {
          const row = splitMetaRow(line);
          leftRows.push(row);
          rightRows.push(row);
        });
      parsed.hunks.forEach((hunk) => {
        const header = splitHunkHeader(hunk);
        leftRows.push(header);
        rightRows.push(header);
        if (!hunkCollapsed(hunk.index)) {
          sideRows(hunk).forEach((row) => {
            leftRows.push(splitLineRow(row.left));
            rightRows.push(splitLineRow(row.right));
          });
        }
      });
      return '<div class="diff-side">' +
        '<div class="diff-column"><div class="diff-column-scroll" data-diff-side="left">' + leftRows.join('') + '</div></div>' +
        '<div class="diff-column"><div class="diff-column-scroll" data-diff-side="right">' + rightRows.join('') + '</div></div>' +
        '</div>';
    }

    function sideRows(hunk) {
      const rows = [];
      let deletes = [];
      let adds = [];
      const position = hunkStartPositions(hunk.header);
      let oldLine = position.oldStart;
      let newLine = position.newStart;
      const flush = () => {
        const count = Math.max(deletes.length, adds.length);
        for (let index = 0; index < count; index += 1) {
          const left = deletes[index];
          const right = adds[index];
          rows.push({
            left: left ? splitLineModel(left, oldLine++, 'del', right) : emptySplitLine(),
            right: right ? splitLineModel(right, newLine++, 'add', left) : emptySplitLine()
          });
        }
        deletes = [];
        adds = [];
      };
      hunk.lines.forEach((line) => {
        if (isDeletedLine(line)) deletes.push(line);
        else if (isAddedLine(line)) adds.push(line);
        else {
          flush();
          const className = isMetaLine(line) ? 'meta' : 'context';
          rows.push({
            left: splitLineModel(line, oldLine++, className),
            right: splitLineModel(line, newLine++, className)
          });
        }
      });
      flush();
      return rows;
    }

    function splitLineModel(line, lineNumber, className, counterpart) {
      return {
        className,
        lineNumber,
        content: sideCell(line, counterpart)
      };
    }

    function emptySplitLine() {
      return { className: 'empty-side', lineNumber: '', content: ' ' };
    }

    function splitLineRow(line) {
      return '<div class="diff-side-line ' + escapeHtml(line.className) + '">' +
        '<span class="diff-line-number">' + escapeHtml(line.lineNumber) + '</span>' +
        '<span class="diff-line-code">' + line.content + '</span>' +
        '</div>';
    }

    function splitMetaRow(line) {
      return '<div class="diff-side-line meta">' +
        '<span class="diff-line-number"></span>' +
        '<span class="diff-line-code">' + escapeHtml(line) + '</span>' +
        '</div>';
    }

    function splitHunkHeader(hunk) {
      const prefix = hunkCollapsed(hunk.index) ? '[+] ' : '[-] ';
      return '<div class="diff-side-line hunk line" data-hunk-index="' + hunk.index + '" tabindex="-1">' +
        '<span class="diff-line-number"></span>' +
        '<span class="diff-line-code">' + escapeHtml(prefix + hunk.header) + '</span>' +
        '</div>';
    }

    function hunkStartPositions(header) {
      const match = /^@@ -(\\d+)(?:,\\d+)? \\+(\\d+)(?:,\\d+)? @@/.exec(header);
      return {
        oldStart: Number(match?.[1] ?? 1),
        newStart: Number(match?.[2] ?? 1)
      };
    }

    function sideCell(line, counterpart) {
      if (!line) return ' ';
      if (isAddedLine(line) || isDeletedLine(line)) {
        return changedLineHtml(line, counterpart);
      }
      return escapeHtml(line || ' ');
    }

    function hunkHeader(hunk, className) {
      const prefix = hunkCollapsed(hunk.index) ? '[+] ' : '[-] ';
      return '<span class="' + className + '" data-hunk-index="' + hunk.index + '" tabindex="-1">' + escapeHtml(prefix + hunk.header) + '</span>';
    }

    function diffLine(line, className, counterpart) {
      const content = counterpart ? changedLineHtml(line, counterpart) : escapeHtml(line || ' ');
      return '<span class="' + className + '">' + content + '</span>';
    }

    function changedLineHtml(line, counterpart) {
      const marker = line.charAt(0);
      const text = line.slice(1);
      const compareText = counterpart ? counterpart.slice(1) : '';
      return escapeHtml(marker) + highlightChangedText(text, compareText);
    }

    function highlightChangedText(value, compareValue) {
      if (!compareValue || value === compareValue) {
        return escapeHtml(value);
      }
      const tokens = diffTokens(value, compareValue);
      if (tokens) {
        return tokens.map((token) => token.changed
          ? '<span class="word-change">' + escapeHtml(token.value || ' ') + '</span>'
          : escapeHtml(token.value)
        ).join('');
      }
      let start = 0;
      while (start < value.length && start < compareValue.length && value[start] === compareValue[start]) start += 1;
      let end = value.length;
      let compareEnd = compareValue.length;
      while (end > start && compareEnd > start && value[end - 1] === compareValue[compareEnd - 1]) {
        end -= 1;
        compareEnd -= 1;
      }
      return escapeHtml(value.slice(0, start)) +
        '<span class="word-change">' + escapeHtml(value.slice(start, end) || ' ') + '</span>' +
        escapeHtml(value.slice(end));
    }

    function diffTokens(value, compareValue) {
      const tokens = tokenizeForDiff(value);
      const compareTokens = tokenizeForDiff(compareValue);
      if (!tokens.length || tokens.length > 120 || compareTokens.length > 120) {
        return undefined;
      }
      const table = Array.from({ length: tokens.length + 1 }, () => Array(compareTokens.length + 1).fill(0));
      for (let left = tokens.length - 1; left >= 0; left -= 1) {
        for (let right = compareTokens.length - 1; right >= 0; right -= 1) {
          table[left][right] = tokens[left] === compareTokens[right]
            ? table[left + 1][right + 1] + 1
            : Math.max(table[left + 1][right], table[left][right + 1]);
        }
      }
      const result = [];
      let left = 0;
      let right = 0;
      while (left < tokens.length) {
        if (right < compareTokens.length && tokens[left] === compareTokens[right]) {
          result.push({ value: tokens[left], changed: false });
          left += 1;
          right += 1;
        } else if (right < compareTokens.length && table[left][right + 1] >= table[left + 1]?.[right]) {
          right += 1;
        } else {
          result.push({ value: tokens[left], changed: true });
          left += 1;
        }
      }
      return result;
    }

    function tokenizeForDiff(value) {
      return String(value).match(/\w+|\s+|[^\w\s]+/g) || [];
    }

    function setupSplitDiffScrolling() {
      const scrollers = Array.from(diffEl.querySelectorAll('.diff-column-scroll'));
      if (scrollers.length !== 2) return;
      let syncing = false;
      scrollers.forEach((source) => {
        source.addEventListener('scroll', () => {
          if (syncing) return;
          syncing = true;
          scrollers.forEach((target) => {
            if (target !== source) {
              target.scrollTop = source.scrollTop;
            }
          });
          requestAnimationFrame(() => {
            syncing = false;
          });
        });
      });
    }

    function layoutSplitDiff() {
      if (state.diffView !== 'side') return;
      const width = Math.max(0, diffEl.clientWidth);
      if (!width) return;
      const columnWidth = Math.floor(width / 2);
      diffEl.style.setProperty('--diff-column-width', columnWidth + 'px');
    }

    function toggleCollapsedHunk(index) {
      if (!Number.isFinite(index)) return;
      if (state.collapsedHunks.includes(index)) {
        state.collapsedHunks = state.collapsedHunks.filter((item) => item !== index);
      } else {
        state.collapsedHunks = [...state.collapsedHunks, index];
      }
      renderDiff();
    }

    function hunkCollapsed(index) {
      return state.collapsedHunks.includes(index);
    }

    function isAddedLine(line) {
      return String(line || '').startsWith('+') && !String(line || '').startsWith('+++');
    }

    function isDeletedLine(line) {
      return String(line || '').startsWith('-') && !String(line || '').startsWith('---');
    }

    function isMetaLine(line) {
      const value = String(line || '');
      return value.startsWith('diff ') || value.startsWith('index ') || value.startsWith('---') || value.startsWith('+++');
    }

    function renderDetails() {
      const file = selectedFile();
      if (!file) {
        if (state.mode === 'changes') {
          detailsEl.innerHTML = '<div class="details-title">Selection Details</div>' +
            '<div class="details-meta">' + escapeHtml(localChangesSummary()) + '</div>';
          return;
        }
        if (state.mode === 'files') {
          detailsEl.innerHTML = '<div class="details-title">Selection Details</div>' +
            '<div class="details-meta">' + escapeHtml(branchComparisonLabel()) + '</div>';
          return;
        }
        if (state.mode === 'history') {
          detailsEl.innerHTML = '<div class="details-title">Selection Details</div>' +
            '<div class="details-meta">' + escapeHtml(state.historyFilePath ? 'History: ' + state.historyFilePath : 'No file history loaded.') + '</div>';
          return;
        }
        detailsEl.innerHTML = '<div class="details-title">Selection Details</div>' +
          '<div class="details-meta">Select a file to inspect its diff details.</div>';
        return;
      }

      if (state.mode === 'changes') {
        detailsEl.innerHTML = '<div class="details-title" title="' + escapeHtml(file.filePath) + '">' + escapeHtml(file.filePath) + '</div>' +
          '<div class="details-meta">' + escapeHtml(fileStatusLabel(file)) + '</div>' +
          detailsRow('Bucket', localChangeBucketLabel(file)) +
          detailsRow('Status', fileStatus(file)) +
          detailsRow('Lines', patchSummary()) +
          detailsRow('Original', file.originalPath) +
          detailsRow('Path', file.filePath);
        return;
      }

      if (state.mode === 'files') {
        detailsEl.innerHTML = '<div class="details-title" title="' + escapeHtml(file.filePath) + '">' + escapeHtml(file.filePath) + '</div>' +
          '<div class="details-meta">' + escapeHtml(branchComparisonLabel()) + '</div>' +
          detailsRow('Status', fileStatusLabel(file)) +
          detailsRow('Lines', patchSummary()) +
          detailsRow('Original', file.originalPath) +
          detailsRow('Base', state.compareBaseBranch) +
          detailsRow('Compare', state.compareBranch);
        return;
      }

      if (state.mode === 'history') {
        const commit = state.selectedCommitDetails;
        detailsEl.innerHTML = '<div class="details-title" title="' + escapeHtml(file.filePath) + '">' + escapeHtml(file.filePath) + '</div>' +
          '<div class="details-meta">' + escapeHtml(commit?.subject || 'Selected file revision') + '</div>' +
          detailsRow('Status', fileStatusLabel(file)) +
          detailsRow('Lines', patchSummary()) +
          detailsRow('Commit', commit ? commit.shortHash : state.selectedCommit.slice(0, 12)) +
          detailsRow('Original', file.originalPath) +
          detailsRow('History', state.historyFilePath);
        return;
      }

      const commit = state.selectedCommitDetails;
      detailsEl.innerHTML = '<div class="details-title" title="' + escapeHtml(file.filePath) + '">' + escapeHtml(file.filePath) + '</div>' +
        '<div class="details-meta">' + escapeHtml(commit?.subject || 'Selected commit file') + '</div>' +
        detailsRow('Status', fileStatusLabel(file)) +
        detailsRow('Lines', patchSummary()) +
        detailsRow('Commit', commit ? commit.shortHash : state.selectedCommit.slice(0, 12)) +
        detailsRow('Original', file.originalPath) +
        detailsRow('Path', file.filePath);
    }

    function detailsRow(label, value) {
      return '<div class="details-row"><div class="details-label">' + escapeHtml(label) + '</div><div class="details-value">' + escapeHtml(value) + '</div></div>';
    }

    function shortParents(value) {
      return String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((hash) => hash.slice(0, 12))
        .join(' ');
    }

    function fileSummary(files) {
      if (!files.length) return '0 files';
      const counts = files.reduce((acc, file) => {
        const key = file.status.charAt(0) || '?';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const parts = Object.keys(counts).sort().map((key) => key + ':' + counts[key]);
      return files.length + ' file' + (files.length === 1 ? '' : 's') + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    }

    function commitBody(commit) {
      const body = String(commit.body || '').trim();
      if (!body) return '';
      const lines = body.split(/\r?\n/);
      if (lines[0] === commit.subject) {
        return lines.slice(1).join('\n').trim();
      }
      return body;
    }

    function shouldIgnoreMouseResize(event) {
      return event.type === 'mousedown' && Date.now() < suppressMouseResizeUntil;
    }

    function markResizeStart(event) {
      if (event.type === 'pointerdown') {
        suppressMouseResizeUntil = Date.now() + 500;
      }
    }

    function resizeEventNames(event) {
      return event.type === 'mousedown'
        ? { move: 'mousemove', up: 'mouseup' }
        : { move: 'pointermove', up: 'pointerup' };
    }

    function capturePointer(element, event) {
      if (event.pointerId !== undefined) {
        element.setPointerCapture?.(event.pointerId);
      }
    }

    function startPaneResize(event, index, divider) {
      if (shouldIgnoreMouseResize(event)) {
        return;
      }
      markResizeStart(event);
      event.preventDefault();
      event.stopPropagation();
      if (state.diffPlacement === 'bottom' && index === 2) {
        startDiffPaneResize(event, divider);
        return;
      }
      if (state.diffPlacement === 'bottom') {
        startBottomMainPaneResize(event, index, divider);
        return;
      }
      const startX = event.clientX;
      const leftStart = state.paneColumns[index];
      const rightStart = state.paneColumns[index + 1];
      divider.classList.add('dragging');
      capturePointer(divider, event);
      const events = resizeEventNames(event);

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
        document.removeEventListener(events.move, move);
        document.removeEventListener(events.up, stop);
        saveLayoutState();
      };

      document.addEventListener(events.move, move);
      document.addEventListener(events.up, stop, { once: true });
    }

    function startBottomMainPaneResize(event, index, divider) {
      const branchesRect = document.querySelector('[data-pane="branches"]').getBoundingClientRect();
      const commitsRect = document.querySelector('[data-pane="commits"]').getBoundingClientRect();
      const filesRect = document.querySelector('[data-pane="files"]').getBoundingClientRect();
      const startX = event.clientX;
      const branchStart = branchesRect.width;
      const commitStart = commitsRect.width;
      const filesStart = filesRect.width;
      divider.classList.add('dragging');
      capturePointer(divider, event);
      const events = resizeEventNames(event);

      const move = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        if (index === 0) {
          const minLeft = minPaneWidth(0);
          const minRight = minPaneWidth(1);
          const clampedDelta = Math.max(minLeft - branchStart, Math.min(delta, commitStart - minRight));
          state.paneColumns[0] = branchStart + clampedDelta;
          state.paneColumns[1] = commitStart - clampedDelta;
          state.paneColumns[2] = filesStart;
        } else if (index === 1) {
          const minLeft = minPaneWidth(1);
          const minRight = minPaneWidth(2);
          const clampedDelta = Math.max(minLeft - commitStart, Math.min(delta, filesStart - minRight));
          state.paneColumns[1] = commitStart + clampedDelta;
          state.paneColumns[2] = filesStart - clampedDelta;
        }
        applyPaneColumns();
      };
      const stop = () => {
        divider.classList.remove('dragging');
        document.removeEventListener(events.move, move);
        document.removeEventListener(events.up, stop);
        saveLayoutState();
      };

      document.addEventListener(events.move, move);
      document.addEventListener(events.up, stop, { once: true });
    }

    function handleLayoutPointerDown(event) {
      if (event.button !== 0 || event.target.closest('button, input, .resize-handle, .pane-divider, .context-menu, .help-overlay')) {
        return;
      }
      const boundary = nearestPaneBoundary(event.clientX, event.clientY);
      if (!boundary) {
        return;
      }
      startPaneResize(event, boundary.index, boundary.divider);
    }

    function nearestPaneBoundary(clientX, clientY) {
      const tolerance = 8;
      const branches = document.querySelector('[data-pane="branches"]')?.getBoundingClientRect();
      const commits = document.querySelector('[data-pane="commits"]')?.getBoundingClientRect();
      const files = document.querySelector('[data-pane="files"]')?.getBoundingClientRect();
      const diff = document.querySelector('[data-pane="diff"]')?.getBoundingClientRect();
      const dividers = [0, 1, 2].map((index) => document.querySelector('[data-divider="' + index + '"]'));
      if (!branches || !commits || !files || !diff) {
        return undefined;
      }
      const verticalBoundary = (x, top, bottom, index) => {
        if (!dividers[index]) return undefined;
        if (clientY < top || clientY > bottom || Math.abs(clientX - x) > tolerance) return undefined;
        return { index, divider: dividers[index] };
      };
      if (state.diffPlacement === 'bottom') {
        return verticalBoundary(branches.right, branches.top, branches.bottom, 0)
          || verticalBoundary(files.left, files.top, files.bottom, 1)
          || (dividers[2] && Math.abs(clientY - diff.top) <= tolerance ? { index: 2, divider: dividers[2] } : undefined);
      }
      return verticalBoundary(branches.right, branches.top, branches.bottom, 0)
        || verticalBoundary(files.left, files.top, files.bottom, 1)
        || verticalBoundary(diff.left, diff.top, diff.bottom, 2);
    }

    function startDiffPaneResize(event, divider) {
      const startY = event.clientY;
      const startHeight = state.diffPaneHeight;
      divider.classList.add('dragging');
      capturePointer(divider, event);
      const events = resizeEventNames(event);

      const move = (moveEvent) => {
        const delta = startY - moveEvent.clientY;
        state.diffPaneHeight = clampedDiffPaneHeight(startHeight + delta);
        applyPaneColumns();
      };
      const stop = () => {
        divider.classList.remove('dragging');
        document.removeEventListener(events.move, move);
        document.removeEventListener(events.up, stop);
        saveLayoutState();
      };

      document.addEventListener(events.move, move);
      document.addEventListener(events.up, stop, { once: true });
    }

    function handleCommitHeaderPointerDown(event) {
      if (event.button !== 0 || event.target.closest('.resize-handle, button, input')) {
        return;
      }
      const boundary = nearestCommitColumnBoundary(event.clientX, event.clientY, event.currentTarget);
      if (!boundary) {
        return;
      }
      startColumnResize(event, boundary.widthIndex, boundary.handle);
    }

    function nearestCommitColumnBoundary(clientX, clientY, header) {
      const tolerance = 8;
      const definitions = commitColumnDefinitions();
      const cells = Array.from(header.querySelectorAll('.commit-column'));
      for (let index = 0; index < cells.length - 1; index += 1) {
        const rect = cells[index].getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom && Math.abs(clientX - rect.right) <= tolerance) {
          const handle = cells[index].querySelector('.resize-handle');
          if (!handle) return undefined;
          return {
            widthIndex: definitions[index].widthIndex,
            handle
          };
        }
      }
      return undefined;
    }

    function minPaneWidth(index) {
      return [120, 320, 160, 260][index] || 160;
    }

    function applyPaneColumns() {
      layoutEl.classList.toggle('diff-bottom', state.diffPlacement === 'bottom');
      layoutEl.classList.toggle('diff-right', state.diffPlacement === 'right');
      layoutEl.style.setProperty('--pane-columns', paneColumnsTemplate());
      layoutEl.style.setProperty('--main-pane-columns', mainPaneColumnsTemplate());
      layoutEl.style.setProperty('--diff-pane-height', Math.round(clampedDiffPaneHeight(state.diffPaneHeight)) + 'px');
      const diffDivider = document.querySelector('[data-divider="2"]');
      diffDivider?.setAttribute('aria-orientation', state.diffPlacement === 'bottom' ? 'horizontal' : 'vertical');
      diffDivider?.setAttribute('title', state.diffPlacement === 'bottom' ? 'Resize diff preview' : 'Resize panes');
      scheduleCommitGraphOverlay();
    }

    function paneColumnsTemplate() {
      return state.paneColumns.map((width) => Math.round(width) + 'px').join(' var(--scm-pane-divider-size) ');
    }

    function mainPaneColumnsTemplate() {
      const branchWidth = Math.round(state.paneColumns[0]);
      const commitWidth = Math.round(state.paneColumns[1]);
      const filesWidth = Math.round(state.paneColumns[2]);
      return branchWidth + 'px var(--scm-pane-divider-size) minmax(' + commitWidth + 'px, 1fr) var(--scm-pane-divider-size) ' + filesWidth + 'px';
    }

    function clampedDiffPaneHeight(height) {
      const toolbarHeight = toolbarEl?.getBoundingClientRect().height || 0;
      const maxHeight = Math.max(180, window.innerHeight - toolbarHeight - 120);
      return Math.max(160, Math.min(height, maxHeight));
    }

    function commitHeaderCell(label, widthIndex, extraClass = '', visualIndex = widthIndex, totalColumns = state.commitColumns.length) {
      const cell = document.createElement('div');
      cell.className = ('commit-column ' + extraClass).trim();
      cell.setAttribute('role', 'columnheader');
      cell.textContent = label;
      if (visualIndex < totalColumns - 1) {
        const handle = document.createElement('span');
        handle.className = 'resize-handle';
        handle.title = 'Resize column';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.addEventListener('pointerdown', (event) => startColumnResize(event, widthIndex, handle));
        handle.addEventListener('mousedown', (event) => startColumnResize(event, widthIndex, handle));
        cell.append(handle);
      }
      return cell;
    }

    function startColumnResize(event, index, handle) {
      if (shouldIgnoreMouseResize(event)) {
        return;
      }
      markResizeStart(event);
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = state.commitColumns[index];
      handle.classList.add('dragging');
      capturePointer(handle, event);
      const events = resizeEventNames(event);

      const move = (moveEvent) => {
        const next = Math.max(minColumnWidth(index), startWidth + moveEvent.clientX - startX);
        state.commitColumns[index] = next;
        applyCommitColumnsToGrid();
        scheduleCommitGraphOverlay();
      };
      const stop = () => {
        handle.classList.remove('dragging');
        document.removeEventListener(events.move, move);
        document.removeEventListener(events.up, stop);
        saveLayoutState();
        scheduleCommitGraphOverlay();
        focusSelected();
      };

      document.addEventListener(events.move, move);
      document.addEventListener(events.up, stop, { once: true });
    }

    function minColumnWidth(index) {
      const widths = [72, 54, 72, 92, 160];
      return widths[index] || 80;
    }

    function applyCommitColumns(element) {
      element.style.setProperty('--commit-columns', commitColumnsTemplate());
    }

    function applyCommitColumnsToGrid() {
      commitsEl.querySelectorAll('.commit-header, .commit-row').forEach(applyCommitColumns);
    }

    function commitColumnsTemplate() {
      const widths = state.mode === 'history' ? state.commitColumns.slice(1) : effectiveCommitColumns();
      return widths.map((width) => Math.round(width) + 'px').join(' ');
    }

    function effectiveCommitColumns() {
      const widths = state.commitColumns.slice();
      widths[0] = Math.max(widths[0], graphColumnWidth(state.graphLaneCount));
      return widths;
    }

    function graphColumnWidth(laneCount) {
      if (state.mode === 'history') return 0;
      const lanes = Math.max(1, laneCount || 1);
      if (lanes === 1) return 72;
      return Math.min(320, Math.max(96, 28 + (lanes - 1) * 12));
    }

    function commitColumnDefinitions() {
      const columns = [
        { label: 'Graph', widthIndex: 0, extraClass: '' },
        { label: 'Hash', widthIndex: 1, extraClass: '' },
        { label: 'Author', widthIndex: 2, extraClass: 'author-col' },
        { label: 'Date', widthIndex: 3, extraClass: 'date-col' },
        { label: 'Subject', widthIndex: 4, extraClass: '' }
      ];
      return state.mode === 'history' ? columns.slice(1) : columns;
    }

    ${graphWebviewScript}

    function renderRefLabels(refs) {
      const labels = parseRefLabels(refs);
      if (!labels.length) return '';
      const visible = labels.slice(0, 4);
      const hidden = labels.length - visible.length;
      return '<span class="ref-labels">' + visible.map((item) =>
        '<span class="ref-label ' + item.kind + '" title="' + escapeHtml(item.full) + '">' + escapeHtml(item.label) + '</span>'
      ).join('') + (hidden > 0 ? '<span class="ref-label" title="' + escapeHtml(labels.slice(4).map((item) => item.full).join(', ')) + '">+' + hidden + '</span>' : '') + '</span>';
    }

    function parseRefLabels(refs) {
      return String(refs || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .flatMap((item) => {
          if (item.startsWith('HEAD -> ')) {
            return [
              { label: 'HEAD', full: item, kind: 'head' },
              refLabel(item.slice('HEAD -> '.length))
            ];
          }
          return [refLabel(item)];
        });
    }

    function refLabel(value) {
      const label = value.startsWith('tag: ') ? value.slice(5) : value;
      const kind = value.startsWith('tag: ') ? 'tag' : value.includes('/') ? 'remote' : '';
      return { label, full: value, kind };
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
      if (event.key === 'Escape' && helpOverlayEl.classList.contains('open')) {
        event.preventDefault();
        hideHelp();
        return;
      }
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key === 'F1') {
        hideContextMenu();
        event.preventDefault();
        showHelp();
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        setActivePane('branches');
        branchSearchEl.focus();
        branchSearchEl.select();
        return;
      }
      if (event.key === '/') {
        hideContextMenu();
        event.preventDefault();
        setActivePane('commits');
        commitSearchEl.focus();
        commitSearchEl.select();
        return;
      }
      if (event.key === 'f') {
        hideContextMenu();
        event.preventDefault();
        setActivePane('files');
        fileSearchEl.focus();
        fileSearchEl.select();
        return;
      }
      if (event.key === 'o') {
        hideContextMenu();
        event.preventDefault();
        openSelectedFileDiff();
        return;
      }
      if (event.key === 'p') {
        hideContextMenu();
        event.preventDefault();
        openSelectedFileAtRevision();
        return;
      }
      if (event.key === 'w') {
        hideContextMenu();
        event.preventDefault();
        openSelectedWorkingFile();
        return;
      }
      if (event.key === 'y') {
        hideContextMenu();
        event.preventDefault();
        copySelectedCommitHash();
        return;
      }
      if (event.key === 'b') {
        hideContextMenu();
        event.preventDefault();
        checkoutSelectedBranch();
        return;
      }
      if (event.key === '[') {
        hideContextMenu();
        event.preventDefault();
        navigateFile(-1);
        return;
      }
      if (event.key === ']') {
        hideContextMenu();
        event.preventDefault();
        navigateFile(1);
        return;
      }
      if (event.key === ',') {
        hideContextMenu();
        event.preventDefault();
        navigateHunk(-1);
        return;
      }
      if (event.key === '.') {
        hideContextMenu();
        event.preventDefault();
        navigateHunk(1);
        return;
      }
      if (event.key === 'Escape' && state.commitSearch) {
        hideContextMenu();
        event.preventDefault();
        state.commitSearch = '';
        commitSearchEl.value = '';
        saveLayoutState();
        renderCommits();
        focusSelected();
        return;
      }
      if (event.key === 'Escape' && state.fileSearch) {
        hideContextMenu();
        event.preventDefault();
        state.fileSearch = '';
        fileSearchEl.value = '';
        saveLayoutState();
        renderFiles();
        focusSelected();
        return;
      }
      if (event.key === 'Escape') {
        hideContextMenu();
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
        const branches = filteredBranches();
        const next = nextIndex(branches.findIndex((branch) => branch.name === state.selectedBranch), branches.length, delta);
        if (next >= 0) selectBranch(branches[next].name);
      } else if (state.activePane === 'files') {
        if (state.filesLoading) return;
        const files = filteredFiles();
        const next = nextIndex(files.findIndex((file) => fileKey(file) === state.selectedFile), files.length, delta);
        if (next >= 0) selectFile(files[next]);
      } else if (state.activePane === 'diff') {
        navigateHunk(delta);
      } else {
        setActivePane('commits', false);
        const commits = filteredCommits();
        const next = nextIndex(commits.findIndex((commit) => commit.hash === state.selectedCommit), commits.length, delta);
        if (next >= 0) selectCommit(commits[next].hash);
      }
      render();
      focusSelected();
    }

    function moveHorizontal(delta) {
      const panes = ['branches', 'commits', 'files', 'diff'];
      const index = panes.indexOf(state.activePane);
      const nextPane = panes[Math.max(0, Math.min(panes.length - 1, index + delta))] || 'commits';
      setActivePane(nextPane, false);
      if (nextPane === 'files' && !state.filesLoading && !selectedFile()) {
        const file = filteredFiles()[0];
        if (file) {
          selectFile(file);
          focusSelected();
          return;
        }
      }
      saveLayoutState();
      render();
      focusSelected();
    }

    function activateCurrent() {
      if (state.activePane === 'branches') {
        const branch = state.branches.find((item) => item.name === state.selectedBranch) || state.branches[0];
        if (branch) selectBranch(branch.name);
      } else if (state.activePane === 'files') {
        if (state.filesLoading) return;
        const file = selectedFile();
        if (file) openSelectedFileDiff();
      } else {
        const commits = filteredCommits();
        const commit = commits.find((item) => item.hash === state.selectedCommit) || commits[0];
        if (commit) selectCommit(commit.hash);
      }
    }

    function selectBranch(branchName) {
      setActivePane('branches', false);
      state.selectedBranch = branchName;
      saveLayoutState();
      vscode.postMessage({ type: 'selectBranch', branch: branchName });
    }

    function selectCommit(hash) {
      setActivePane('commits', false);
      state.selectedCommit = hash;
      state.selectedCommitDetails = undefined;
      state.selectedFile = '';
      setFilesLoading(true, hash);
      clearDiffState(false);
      saveLayoutState();
      renderCommitSummary();
      renderFiles();
      renderDiff();
      renderDetails();
      vscode.postMessage({ type: 'selectCommit', hash });
    }

    function selectFile(file) {
      setActivePane('files', false);
      state.selectedFile = fileKey(file);
      clearDiffState(true);
      saveLayoutState();
      renderFiles();
      renderDiff();
      renderDetails();
      if (state.mode === 'changes') {
        vscode.postMessage({ type: 'selectLocalChange', change: file });
      } else if (state.mode === 'files') {
        vscode.postMessage({ type: 'selectCompareFile', file });
      } else {
        vscode.postMessage({ type: 'selectFile', hash: state.selectedCommit, file });
      }
    }

    function openSelectedFileDiff() {
      const file = selectedFile();
      if (file && state.mode === 'changes') {
        vscode.postMessage({ type: 'openLocalChangeDiff', change: file });
      } else if (file && state.mode === 'files') {
        vscode.postMessage({ type: 'openCompareFileDiff', file });
      } else if (file && state.selectedCommit) {
        vscode.postMessage({ type: 'openFileDiff', hash: state.selectedCommit, file });
      }
    }

    function openSelectedFileAtRevision() {
      const file = selectedFile();
      if (file && state.mode === 'changes') {
        openSelectedWorkingFile();
      } else if (file && state.mode === 'files') {
        vscode.postMessage({ type: 'openCompareFileAtRevision', file });
      } else if (file && state.selectedCommit) {
        vscode.postMessage({ type: 'openFileAtRevision', hash: state.selectedCommit, file });
      }
    }

    function openSelectedWorkingFile() {
      const file = selectedFile();
      if (file) {
        vscode.postMessage({ type: 'openWorkingFile', file });
      }
    }

    function copySelectedCommitHash() {
      const commit = selectedCommit();
      if (commit) {
        vscode.postMessage({ type: 'copyCommitHash', hash: commit.hash });
      }
    }

    function stageSelectedChange() {
      const change = selectedLocalChange();
      if (change && change.bucket !== 'staged') {
        vscode.postMessage({ type: 'stageLocalChange', change });
      }
    }

    function unstageSelectedChange() {
      const change = selectedLocalChange();
      if (change && change.bucket === 'staged') {
        vscode.postMessage({ type: 'unstageLocalChange', change });
      }
    }

    function commitLocalChanges() {
      vscode.postMessage({ type: 'commitLocalChanges' });
    }

    function shelveLocalChanges() {
      vscode.postMessage({ type: 'shelveLocalChanges' });
    }

    function unshelveChanges() {
      vscode.postMessage({ type: 'unshelveChanges' });
    }

    function toggleDiffPlacement() {
      const nextPlacement = state.diffPlacement === 'right' ? 'bottom' : 'right';
      if (nextPlacement === 'right') {
        normalizeRightPaneColumns();
      }
      state.diffPlacement = nextPlacement;
      applyPaneColumns();
      saveLayoutState();
      renderChrome();
      focusSelected();
    }

    function normalizeRightPaneColumns() {
      const available = Math.max(900, layoutEl.getBoundingClientRect().width - 12);
      const current = state.paneColumns.map((width) => Number(width) || 0);
      const minimums = [120, 320, 160, 260];
      const preferred = [180, 560, 280, 520];
      const oversized = current.reduce((sum, width) => sum + width, 0) > available;
      const source = oversized ? preferred : current.map((width, index) => Math.max(width, preferred[index]));
      const total = source.reduce((sum, width) => sum + width, 0);
      if (total <= available) {
        state.paneColumns = source;
        return;
      }
      const minTotal = minimums.reduce((sum, width) => sum + width, 0);
      const flexTotal = source.reduce((sum, width, index) => sum + Math.max(0, width - minimums[index]), 0);
      const scale = flexTotal > 0 ? Math.max(0, available - minTotal) / flexTotal : 0;
      state.paneColumns = source.map((width, index) => minimums[index] + Math.max(0, width - minimums[index]) * scale);
    }

    function toggleDetails() {
      state.detailsVisible = !state.detailsVisible;
      saveLayoutState();
      renderChrome();
    }

    function toggleDiffView() {
      state.diffView = state.diffView === 'side' ? 'unified' : 'side';
      saveLayoutState();
      renderChrome();
      renderDiff();
    }

    function normalizeDiffView(value) {
      return value === 'side' ? 'side' : 'unified';
    }

    function showSelectedBranchActions() {
      const button = document.getElementById('branchActions');
      const rect = button.getBoundingClientRect();
      showContextMenuAt(rect.left, rect.bottom + 4, 'branch');
    }

    function createBranch() {
      vscode.postMessage({ type: 'createBranch' });
    }

    function deleteSelectedBranch() {
      const branch = selectedBranch();
      if (branch) {
        vscode.postMessage({ type: 'deleteBranch', branch: branch.name, remote: Boolean(branch.remote) });
      }
    }

    function renameSelectedBranch() {
      const branch = selectedBranch();
      if (branch) {
        vscode.postMessage({ type: 'renameBranch', branch: branch.name, remote: Boolean(branch.remote) });
      }
    }

    function mergeSelectedBranch() {
      const branch = selectedBranch();
      if (branch) {
        vscode.postMessage({ type: 'mergeBranch', branch: branch.name });
      }
    }

    function rebaseOntoSelectedBranch() {
      const branch = selectedBranch();
      if (branch) {
        vscode.postMessage({ type: 'rebaseOntoBranch', branch: branch.name });
      }
    }

    function compareSelectedBranch() {
      const branch = selectedBranch();
      if (branch) {
        state.mode = 'files';
        state.historyFilePath = '';
        saveLayoutState();
        renderChrome();
        vscode.postMessage({ type: 'compareBranch', branch: branch.name });
      }
    }

    function clearHistoryMode() {
      state.mode = 'log';
      state.historyFilePath = '';
      saveLayoutState();
      renderChrome();
      vscode.postMessage({ type: 'setMode', mode: 'log' });
    }

    function showSelectedCommitActions() {
      const commit = selectedCommit();
      if (!commit) return;
      const button = document.getElementById('commitActions');
      const rect = button.getBoundingClientRect();
      showContextMenuAt(rect.left, rect.bottom + 4, 'commit');
    }

    function cherryPickSelectedCommit() {
      const commit = selectedCommit();
      if (commit) {
        vscode.postMessage({ type: 'cherryPickCommit', hash: commit.hash });
      }
    }

    function revertSelectedCommit() {
      const commit = selectedCommit();
      if (commit) {
        vscode.postMessage({ type: 'revertCommit', hash: commit.hash });
      }
    }

    function createBranchFromSelectedCommit() {
      const commit = selectedCommit();
      if (commit) {
        vscode.postMessage({ type: 'createBranchFromCommit', hash: commit.hash });
      }
    }

    function createTagFromSelectedCommit() {
      const commit = selectedCommit();
      if (commit) {
        vscode.postMessage({ type: 'createTagFromCommit', hash: commit.hash });
      }
    }

    function checkoutSelectedCommit() {
      const commit = selectedCommit();
      if (commit) {
        vscode.postMessage({ type: 'checkoutCommit', hash: commit.hash });
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
      const files = filteredFiles();
      return files.find((item) => fileKey(item) === state.selectedFile);
    }

    function selectedLocalChange() {
      return state.mode === 'changes' ? selectedFile() : undefined;
    }

    function navigateFile(delta) {
      const files = filteredFiles();
      if (!files.length) return;
      const current = files.findIndex((file) => fileKey(file) === state.selectedFile);
      const next = nextIndex(current, files.length, delta);
      if (next >= 0) {
        selectFile(files[next]);
        renderFiles();
        focusSelected();
      }
    }

    function navigateHunk(delta) {
      const hunks = hunkElements();
      if (!hunks.length) return;
      setActivePane('diff', false);
      const current = state.currentHunkIndex < 0 ? (delta > 0 ? -1 : 0) : state.currentHunkIndex;
      state.currentHunkIndex = nextIndex(current, hunks.length, delta);
      highlightCurrentHunk(true);
      saveLayoutState();
    }

    function hunkElements() {
      const seen = new Set();
      return Array.from(diffEl.querySelectorAll('[data-hunk-index]')).filter((item) => {
        const index = item.getAttribute('data-hunk-index');
        if (seen.has(index)) {
          return false;
        }
        seen.add(index);
        return true;
      });
    }

    function highlightCurrentHunk(scroll) {
      diffEl.querySelectorAll('[data-hunk-index]').forEach((item) => item.classList.remove('current-hunk'));
      const hunks = hunkElements();
      if (!hunks.length) {
        state.currentHunkIndex = -1;
        updateDiffNavigation();
        return;
      }

      state.currentHunkIndex = Math.max(0, Math.min(hunks.length - 1, state.currentHunkIndex));
      const hunk = hunks[state.currentHunkIndex];
      diffEl.querySelectorAll('[data-hunk-index="' + hunk.getAttribute('data-hunk-index') + '"]').forEach((item) => item.classList.add('current-hunk'));
      if (scroll) {
        hunk.scrollIntoView({ block: 'center' });
      }
      updateDiffNavigation();
    }

    function updateDiffNavigation() {
      const files = filteredFiles();
      const fileIndex = files.findIndex((file) => fileKey(file) === state.selectedFile);
      const hunkCount = hunkElements().length;
      document.getElementById('prevFile').disabled = state.filesLoading || fileIndex <= 0;
      document.getElementById('nextFile').disabled = state.filesLoading || fileIndex < 0 || fileIndex >= files.length - 1;
      document.getElementById('prevHunk').disabled = hunkCount === 0 || state.currentHunkIndex <= 0;
      document.getElementById('nextHunk').disabled = hunkCount === 0 || state.currentHunkIndex >= hunkCount - 1;
    }

    function filteredBranches() {
      const query = state.branchSearch.trim().toLowerCase();
      return state.branches.filter((branch) => {
        if (state.branchFilter === 'local' && branch.remote) return false;
        if (state.branchFilter === 'remote' && !branch.remote) return false;
        if (!query) return true;
        return [branch.name]
          .some((value) => String(value || '').toLowerCase().includes(query));
      });
    }

    function filteredFiles() {
      const query = state.fileSearch.trim().toLowerCase();
      return state.files.filter((file) => {
        const status = fileStatus(file);
        if (state.fileFilter !== 'all' && !status.startsWith(state.fileFilter)) return false;
        if (!query) return true;
        return [status, fileStatusLabel(file), file.filePath, file.originalPath]
          .some((value) => String(value || '').toLowerCase().includes(query));
      });
    }

    function fileKey(file) {
      return state.mode === 'changes' ? file.bucket + ':' + file.filePath : file.filePath;
    }

    function fileStatus(file) {
      if (state.mode !== 'changes') {
        return file.status || '';
      }
      if (file.bucket === 'untracked') return '?';
      if (file.bucket === 'conflicts') return '!';
      return file.bucket === 'staged' ? String(file.x || '').trim() : String(file.y || '').trim();
    }

    function fileStatusDisplay(file) {
      const status = fileStatus(file);
      if (status.startsWith('R')) return 'R';
      if (status.startsWith('C')) return 'C';
      return status || '';
    }

    function fileStatusLabel(file) {
      if (state.mode !== 'changes') {
        return statusLabel(file.status || '');
      }
      if (file.bucket === 'untracked') return 'Untracked';
      if (file.bucket === 'conflicts') return 'Conflict';
      const code = fileStatus(file);
      const label = statusLabel(code);
      return (file.bucket === 'staged' ? 'Staged ' : 'Unstaged ') + label;
    }

    function statusClass(file) {
      const status = fileStatus(file);
      if (status.startsWith('A') || status === '?') return 'added';
      if (status.startsWith('D')) return 'deleted';
      if (status.startsWith('R') || status.startsWith('C')) return 'renamed';
      if (status.startsWith('M')) return 'modified';
      return '';
    }

    function statusLabel(code) {
      const value = String(code || '');
      if (value.startsWith('A')) return 'Added';
      if (value.startsWith('M')) return 'Modified';
      if (value.startsWith('D')) return 'Deleted';
      if (value.startsWith('R')) return 'Renamed';
      if (value.startsWith('C')) return 'Copied';
      if (value.startsWith('?')) return 'Untracked';
      if (value.startsWith('!') || value.includes('U')) return 'Conflict';
      return value || 'Changed';
    }

    function localChangeBucketLabel(file) {
      if (!file?.bucket) return '';
      return file.bucket.charAt(0).toUpperCase() + file.bucket.slice(1);
    }

    function fileSecondary(file) {
      if (state.mode === 'changes') {
        const original = file.originalPath ? file.originalPath + ' -> ' : '';
        return original + fileStatusLabel(file);
      }
      return file.originalPath || '';
    }

    function fileIconLabel(file) {
      const type = fileType(file);
      if (type === 'json') return '{}';
      if (type === 'lock') return 'L';
      if (type === 'config') return '*';
      return (type || 'file').slice(0, 3).toUpperCase();
    }

    function fileIconClass(file) {
      return 'type-' + fileType(file).replace(/[^a-z0-9_-]/g, '');
    }

    function fileTypeLabel(file) {
      const type = fileType(file);
      return type === 'file' ? 'File' : type.toUpperCase() + ' file';
    }

    function fileType(file) {
      const name = String(file.filePath || '').split('/').pop() || '';
      const lower = name.toLowerCase();
      if (lower === 'package.json' || lower === 'tsconfig.json') return 'json';
      if (lower.endsWith('.lock') || lower === 'package-lock.json' || lower === 'yarn.lock' || lower === 'pnpm-lock.yaml') return 'lock';
      if (lower.startsWith('.') || lower.endsWith('config.js') || lower.endsWith('config.ts')) return 'config';
      const dot = lower.lastIndexOf('.');
      return dot >= 0 && dot < lower.length - 1 ? lower.slice(dot + 1) : 'file';
    }

    function localChangesSummary() {
      if (!state.files.length) return 'No local changes.';
      const counts = state.files.reduce((acc, file) => {
        const key = file.bucket || 'changed';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const parts = ['staged', 'unstaged', 'untracked', 'conflicts']
        .filter((key) => counts[key])
        .map((key) => key + ':' + counts[key]);
      return state.files.length + ' local change' + (state.files.length === 1 ? '' : 's') + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    }

    function selectedLocalChangeLabel() {
      const change = selectedLocalChange();
      return change ? fileStatusLabel(change) + ' - ' + change.filePath : '';
    }

    function branchComparisonLabel() {
      if (state.compareBaseBranch && state.compareBranch) {
        return state.compareBaseBranch + '...' + state.compareBranch;
      }
      return state.files.length + ' changed file' + (state.files.length === 1 ? '' : 's');
    }

    function patchSummary() {
      const stats = selectedPatchStats();
      if (!stats) return 'No preview loaded';
      const hunkText = stats.hunks + ' hunk' + (stats.hunks === 1 ? '' : 's');
      return '+' + stats.added + ' -' + stats.deleted + ', ' + hunkText;
    }

    function selectedPatchStats() {
      if (!state.patch) return undefined;
      const parsed = parsePatch(state.patch);
      const stats = patchStats(parsed);
      return { added: stats.added, deleted: stats.deleted, hunks: parsed.hunks.length };
    }

    function showContextMenu(event, type) {
      event.preventDefault();
      event.stopPropagation();
      showContextMenuAt(event.clientX, event.clientY, type);
    }

    function showContextMenuAt(x, y, type) {
      state.contextMenuType = type;
      renderContextMenu();
      contextMenuEl.classList.add('open');
      const width = contextMenuEl.offsetWidth || 180;
      const height = contextMenuEl.offsetHeight || 120;
      const left = Math.min(x, window.innerWidth - width - 8);
      const top = Math.min(y, window.innerHeight - height - 8);
      contextMenuEl.style.left = Math.max(8, left) + 'px';
      contextMenuEl.style.top = Math.max(8, top) + 'px';
    }

    function hideContextMenu() {
      contextMenuEl.classList.remove('open');
      state.contextMenuType = '';
    }

    function showHelp() {
      hideContextMenu();
      helpOverlayEl.classList.add('open');
      document.getElementById('closeHelp').focus();
    }

    function hideHelp() {
      helpOverlayEl.classList.remove('open');
      focusSelected();
    }

    function renderContextMenu() {
      const branch = selectedBranch();
      const commit = selectedCommit();
      const file = selectedFile();
      let actions = [];
      if (state.contextMenuType === 'branch') {
        actions = [
          { action: 'createBranch', label: 'New Branch' },
          { action: 'checkoutBranch', label: 'Checkout Branch', disabled: !branch || branch.current },
          { action: 'compareBranch', label: 'Compare with Current Branch', disabled: !branch || branch.current },
          { action: 'mergeBranch', label: 'Merge into Current', disabled: !branch || branch.current },
          { action: 'rebaseOntoBranch', label: 'Rebase Current onto Branch', disabled: !branch || branch.current },
          { action: 'renameBranch', label: 'Rename Branch', disabled: !branch || branch.remote },
          { action: 'deleteBranch', label: 'Delete Branch', disabled: !branch || branch.current || branch.remote },
          { action: 'refresh', label: 'Refresh' }
        ];
      } else if (state.contextMenuType === 'commit') {
        actions = [
          { action: 'copyHash', label: 'Copy Commit Hash', disabled: !commit },
          { action: 'cherryPickCommit', label: 'Cherry-pick Commit', disabled: !commit },
          { action: 'revertCommit', label: 'Revert Commit', disabled: !commit },
          { action: 'createBranchFromCommit', label: 'New Branch from Commit', disabled: !commit },
          { action: 'createTagFromCommit', label: 'New Tag from Commit', disabled: !commit },
          { action: 'checkoutCommit', label: 'Checkout Commit', disabled: !commit },
          { action: 'refresh', label: 'Refresh' }
        ];
      } else if (state.contextMenuType === 'file') {
        actions = state.mode === 'changes'
          ? [
              { action: 'stageChange', label: 'Stage', disabled: !file || file.bucket === 'staged' },
              { action: 'unstageChange', label: 'Unstage', disabled: !file || file.bucket !== 'staged' },
              { action: 'openDiff', label: 'Open Diff', disabled: !file },
              { action: 'openWorkingFile', label: 'Open Working Tree File', disabled: !file || file.bucket === 'staged' },
              { action: 'commitChanges', label: 'Commit Staged Changes', disabled: !state.files.some((item) => item.bucket === 'staged') },
              { action: 'shelveChanges', label: 'Shelve Changes', disabled: !state.files.length },
              { action: 'unshelveChanges', label: 'Unshelve Changes' }
            ]
          : [
              { action: 'openDiff', label: 'Open Diff', disabled: !file },
              { action: 'openFile', label: 'Open File at Revision', disabled: !file || file.status.startsWith('D') },
              { action: 'openWorkingFile', label: 'Open Working Tree File', disabled: !file },
              { action: 'copyHash', label: 'Copy Commit Hash', disabled: !commit }
            ];
      }

      contextMenuEl.innerHTML = actions
        .map((item) => '<button role="menuitem" data-action="' + escapeHtml(item.action) + '" title="' + escapeHtml(item.label) + '" aria-label="' + escapeHtml(item.label) + '"' + (item.disabled ? ' disabled' : '') + '>' +
          '<span class="codicon codicon-' + escapeHtml(actionIconName(item.action)) + '" aria-hidden="true"></span>' +
          '<span class="menu-label">' + escapeHtml(item.label) + '</span>' +
        '</button>')
        .join('');
    }

    function actionIconName(action) {
      switch (action) {
        case 'checkoutBranch':
          return 'git-branch';
        case 'createBranch':
        case 'createBranchFromCommit':
          return 'git-branch-create';
        case 'compareBranch':
          return 'compare-changes';
        case 'mergeBranch':
          return 'git-merge';
        case 'rebaseOntoBranch':
          return 'repo-push';
        case 'renameBranch':
          return 'edit';
        case 'deleteBranch':
          return 'trash';
        case 'copyHash':
          return 'copy';
        case 'cherryPickCommit':
          return 'git-pull-request';
        case 'revertCommit':
          return 'discard';
        case 'createTagFromCommit':
          return 'tag';
        case 'checkoutCommit':
          return 'git-commit';
        case 'stageChange':
          return 'add';
        case 'unstageChange':
          return 'remove';
        case 'commitChanges':
          return 'git-commit';
        case 'shelveChanges':
          return 'archive';
        case 'unshelveChanges':
          return 'repo-pull';
        case 'openDiff':
          return 'diff';
        case 'openFile':
          return 'go-to-file';
        case 'openWorkingFile':
          return 'file';
        case 'refresh':
          return 'refresh';
        default:
          return 'circle-outline';
      }
    }

    function handleContextMenuClick(event) {
      event.stopPropagation();
      const button = event.target.closest('button[data-action]');
      if (!button || button.disabled) return;
      const action = button.dataset.action;
      hideContextMenu();
      if (action === 'createBranch') createBranch();
      else if (action === 'checkoutBranch') checkoutSelectedBranch();
      else if (action === 'deleteBranch') deleteSelectedBranch();
      else if (action === 'renameBranch') renameSelectedBranch();
      else if (action === 'mergeBranch') mergeSelectedBranch();
      else if (action === 'rebaseOntoBranch') rebaseOntoSelectedBranch();
      else if (action === 'compareBranch') compareSelectedBranch();
      else if (action === 'copyHash') copySelectedCommitHash();
      else if (action === 'cherryPickCommit') cherryPickSelectedCommit();
      else if (action === 'revertCommit') revertSelectedCommit();
      else if (action === 'createBranchFromCommit') createBranchFromSelectedCommit();
      else if (action === 'createTagFromCommit') createTagFromSelectedCommit();
      else if (action === 'checkoutCommit') checkoutSelectedCommit();
      else if (action === 'stageChange') stageSelectedChange();
      else if (action === 'unstageChange') unstageSelectedChange();
      else if (action === 'commitChanges') commitLocalChanges();
      else if (action === 'shelveChanges') shelveLocalChanges();
      else if (action === 'unshelveChanges') unshelveChanges();
      else if (action === 'openDiff') openSelectedFileDiff();
      else if (action === 'openFile') openSelectedFileAtRevision();
      else if (action === 'openWorkingFile') openSelectedWorkingFile();
      else if (action === 'refresh') vscode.postMessage({ type: 'refresh' });
    }

    function filteredCommits() {
      const query = state.commitSearch.trim().toLowerCase();
      if (!query) return state.commits;
      return state.commits.filter((commit) =>
        [commit.hash, commit.shortHash, commit.author, commit.date, commit.refs, commit.subject]
          .some((value) => String(value || '').toLowerCase().includes(query))
      );
    }

    function emptyCommitMessage() {
      if (state.mode === 'outgoing') {
        return state.selectedBranch === state.currentBranch
          ? 'Choose another branch to see outgoing commits.'
          : 'No current-branch commits are missing from ' + state.selectedBranch + '.';
      }
      if (state.mode === 'incoming') {
        return state.selectedBranch === state.currentBranch
          ? 'Choose another branch to see incoming commits.'
          : 'No commits from ' + state.selectedBranch + ' are missing from current branch.';
      }
      if (state.mode === 'history') {
        return state.historyFilePath
          ? 'No history found for ' + state.historyFilePath + '. Click Log to return to the full branch.'
          : 'No file history loaded. Click Log to return to the full branch.';
      }
      return 'No commits.';
    }

    function nextIndex(current, length, delta) {
      if (!length) return -1;
      const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
      return Math.max(0, Math.min(length - 1, start + delta));
    }

    function setFilesLoading(loading, commit = '') {
      if (state.filesLoadingTimer) {
        clearTimeout(state.filesLoadingTimer);
        state.filesLoadingTimer = undefined;
      }

      state.filesLoading = loading;
      state.pendingFilesCommit = loading ? commit : '';
      state.filesLoadingVisible = false;
      if (!loading) {
        return;
      }

      state.filesLoadingTimer = setTimeout(() => {
        if (state.filesLoading && state.pendingFilesCommit === commit) {
          state.filesLoadingVisible = true;
          renderFiles();
        }
      }, 120);
    }

    function setActivePane(pane, persist = true) {
      if (!pane || state.activePane === pane) return;
      state.activePane = pane;
      renderActivePane();
      if (persist) {
        saveLayoutState();
      }
    }

    function focusSelected() {
      requestAnimationFrame(() => {
        if (state.activePane === 'diff') {
          const hunk = hunkElements()[state.currentHunkIndex];
          (hunk || diffEl).focus?.({ preventScroll: true });
          hunk?.scrollIntoView({ block: 'nearest' });
          return;
        }
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

    function validDimension(value, fallback, minimum) {
      const dimension = Number(value);
      return Number.isFinite(dimension) && dimension >= minimum ? dimension : fallback;
    }

    function normalizedCommitColumns(value, version) {
      const widths = validWidths(value, [72, 74, 120, 142, 360], 5)
        .map((width, index) => Math.max(width, [72, 54, 72, 92, 160][index] || 80));
      if (version !== layoutVersion && widths[0] > 72) {
        widths[0] = 72;
      }
      return widths;
    }

    function saveLayoutState() {
      vscode.setState({
        layoutVersion,
        activePane: state.activePane,
        mode: state.mode,
        selectedBranch: state.selectedBranch,
        selectedCommit: state.selectedCommit,
        selectedFile: state.selectedFile,
        historyFilePath: state.historyFilePath,
        branchSearch: state.branchSearch,
        branchFilter: state.branchFilter,
        commitSearch: state.commitSearch,
        fileSearch: state.fileSearch,
        fileFilter: state.fileFilter,
        diffPlacement: state.diffPlacement,
        diffView: state.diffView,
        detailsVisible: state.detailsVisible,
        paneColumns: state.paneColumns,
        diffPaneHeight: state.diffPaneHeight,
        commitColumns: state.commitColumns
      });
    }

    function resetLayout() {
      state.activePane = 'commits';
      state.mode = 'log';
      state.branchSearch = '';
      state.branchFilter = 'all';
      state.commitSearch = '';
      state.fileSearch = '';
      state.fileFilter = 'all';
      state.diffPlacement = 'bottom';
      state.diffView = 'unified';
      state.detailsVisible = false;
      state.collapsedHunks = [];
      state.currentHunkIndex = -1;
      setFilesLoading(false);
      state.paneColumns = [180, 560, 280, 520];
      state.diffPaneHeight = 280;
      state.commitColumns = [72, 74, 120, 142, 360];
      branchSearchEl.value = '';
      commitSearchEl.value = '';
      fileSearchEl.value = '';
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
`;
