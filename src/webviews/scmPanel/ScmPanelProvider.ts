import * as vscode from 'vscode';
import * as path from 'path';
import { GitService, RepositoryManager } from '../../git';
import { gitContentUri } from '../../gitContentProvider';
import { changeLabel, GitChange, GitCommit, GitCommitFile } from '../../models';
import { renderHtml } from './renderHtml';
import { ScmPanelMessage, ToolWindowMode } from './protocol';
import { assertNoUnresolvedConflicts } from '../../git/safety';

interface DiffContent {
  original: string;
  modified: string;
}

export class GitToolWindowProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'abstractiveScm.toolWindow';

  private view: vscode.WebviewView | undefined;
  private selectedBranch: string | undefined;
  private currentBranch = 'HEAD';
  private mode: ToolWindowMode = 'log';
  private compareBaseBranch = 'HEAD';
  private compareBranch = 'HEAD';
  private historyFilePath = '';
  private loadGeneration = 0;

  constructor(private readonly context: vscode.ExtensionContext, private readonly repositories: RepositoryManager) {
    this.context.subscriptions.push(this.repositories.onDidChangeActiveRepository(() => {
      this.selectedBranch = undefined;
      this.historyFilePath = '';
      void this.loadInitial();
    }));
  }

  private get git(): GitService {
    return this.repositories.activeRepository;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = renderHtml(webviewView.webview, this.context.extensionUri);
    webviewView.webview.onDidReceiveMessage((message: ScmPanelMessage) => void this.handleMessage(message));
  }

  refresh(): void {
    if (this.view) {
      void this.loadInitial();
    }
  }

  async showFileHistory(filePath: string): Promise<void> {
    this.mode = 'history';
    this.historyFilePath = filePath;
    await vscode.commands.executeCommand('workbench.view.extension.abstractiveScmPanel');
    await this.loadInitial();
  }

  private async handleMessage(message: ScmPanelMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
      case 'refresh':
        await this.loadInitial();
        break;
      case 'setRepository':
        await this.setRepository(message.repoRoot);
        break;
      case 'resetLayout':
        this.post({ type: 'resetLayout' });
        break;
      case 'setMode':
        await this.setMode(message.mode);
        break;
      case 'selectBranch':
        await this.loadBranch(message.branch);
        break;
      case 'checkoutBranch':
        await this.checkoutBranch(message.branch, message.remote);
        break;
      case 'createBranch':
        await this.createBranch();
        break;
      case 'deleteBranch':
        await this.deleteBranch(message.branch, message.remote);
        break;
      case 'renameBranch':
        await this.renameBranch(message.branch, message.remote);
        break;
      case 'mergeBranch':
        await this.mergeBranch(message.branch);
        break;
      case 'rebaseOntoBranch':
        await this.rebaseOntoBranch(message.branch);
        break;
      case 'compareBranch':
        await this.openBranchComparison(message.branch);
        break;
      case 'selectCommit':
        await this.loadCommit(message.hash);
        break;
      case 'copyCommitHash':
        await this.copyCommitHash(message.hash);
        break;
      case 'cherryPickCommit':
        await this.cherryPickCommit(message.hash);
        break;
      case 'revertCommit':
        await this.revertCommit(message.hash);
        break;
      case 'createBranchFromCommit':
        await this.createBranchFromCommit(message.hash);
        break;
      case 'createTagFromCommit':
        await this.createTagFromCommit(message.hash);
        break;
      case 'checkoutCommit':
        await this.checkoutCommit(message.hash);
        break;
      case 'selectFile':
        await this.loadFilePatch(message.hash, message.file);
        break;
      case 'selectCompareFile':
        await this.loadCompareFilePatch(message.file);
        break;
      case 'selectLocalChange':
        await this.loadLocalChangePatch(message.change);
        break;
      case 'stageLocalChange':
        await this.stageLocalChange(message.change);
        break;
      case 'unstageLocalChange':
        await this.unstageLocalChange(message.change);
        break;
      case 'stageAllLocalChanges':
        await this.stageAllLocalChanges();
        break;
      case 'commitLocalChanges':
        await this.commitLocalChanges();
        break;
      case 'shelveLocalChanges':
        await this.shelveLocalChanges();
        break;
      case 'unshelveChanges':
        await this.unshelveChanges();
        break;
      case 'openLocalChangeDiff':
        await this.openLocalChangeDiff(message.change);
        break;
      case 'openWorkingFile':
        await this.openWorkingFile(message.file);
        break;
      case 'openFileAtRevision':
        await this.openFileAtRevision(message.hash, message.file);
        break;
      case 'openCompareFileAtRevision':
        await this.openCompareFileAtRevision(message.file);
        break;
      case 'openCompareFileDiff':
        await this.openCompareNativeDiff(message.file);
        break;
      case 'openFileDiff':
        await this.openNativeDiff(message.hash, message.file);
        break;
    }
  }

  private async loadInitial(): Promise<void> {
    const generation = ++this.loadGeneration;
    await this.withErrorBoundary(async () => {
      const [branches, branchStatus] = await Promise.all([this.git.branches(), this.git.branchStatus()]);
      if (generation !== this.loadGeneration) {
        return;
      }
      const currentBranch = branchStatus.branch;
      this.currentBranch = currentBranch;
      const selectedBranch = this.selectedBranch ?? currentBranch;
      this.post({
        type: 'init',
        repoName: path.basename(this.git.root),
        repoRoot: this.git.root,
        repositories: this.repositories.repositories.map((repository) => ({
          name: path.basename(repository.root),
          root: repository.root,
          active: repository.root === this.git.root
        })),
        showRepoContext: (vscode.workspace.workspaceFolders?.length ?? 0) > 1,
        branches,
        currentBranch,
        selectedBranch,
        mode: this.mode,
        historyFilePath: this.historyFilePath
      });
      await this.loadBranchModeData(selectedBranch);
    });
  }

  private async setRepository(repoRoot: string): Promise<void> {
    const repository = this.repositories.repositoryForRoot(repoRoot);
    if (!repository) {
      return;
    }

    this.repositories.setActiveRepository(repository);
    this.selectedBranch = undefined;
    this.historyFilePath = '';
    await this.loadInitial();
  }

  private async loadBranch(branch: string): Promise<void> {
    const generation = ++this.loadGeneration;
    await this.withErrorBoundary(async () => {
      this.selectedBranch = branch;
      await this.loadBranchModeData(branch, generation);
    });
  }

  private async setMode(mode: ToolWindowMode): Promise<void> {
    this.mode = mode;
    if (mode !== 'history') {
      this.historyFilePath = '';
    }
    await this.loadBranch(this.selectedBranch ?? this.currentBranch);
  }

  private async loadBranchModeData(branch: string, generation = this.loadGeneration): Promise<void> {
    if (this.mode === 'changes') {
      await this.loadLocalChanges(generation);
      return;
    }
    if (this.mode === 'files') {
      await this.loadCompareFiles(branch, generation);
      return;
    }
    if (this.mode === 'history') {
      await this.loadFileHistory(generation);
      return;
    }

    const commits = await this.loadCommitsForBranch(branch);
    if (generation !== this.loadGeneration) {
      return;
    }
    this.post({ type: 'branchData', selectedBranch: branch, mode: this.mode, commits });
    await this.loadFirstCommit(commits);
  }

  private async loadCommit(hash: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const commitFiles = await this.git.commitFiles(hash);
      const files = this.mode === 'history' && this.historyFilePath
        ? historyCommitFiles(commitFiles, this.historyFilePath)
        : commitFiles;
      const commit = await this.git.commitDetails(hash);
      this.post({ type: 'commitFiles', selectedCommit: hash, files });
      if (commit) {
        this.post({ type: 'commitDetails', commit });
      }
      if (!files[0]) {
        this.post({ type: 'patch', selectedFile: undefined, patch: '' });
      } else if (this.mode === 'history') {
        await this.postCommitFilePatch(hash, files[0]);
      }
    });
  }

  private async loadFilePatch(hash: string, file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      await this.postCommitFilePatch(hash, file);
    });
  }

  private async loadCompareFiles(branch: string, generation = this.loadGeneration): Promise<void> {
    this.compareBaseBranch = this.currentBranch;
    this.compareBranch = branch;
    const files = branch === this.currentBranch ? [] : await this.git.branchDiffFiles(this.compareBaseBranch, this.compareBranch);
    if (generation !== this.loadGeneration) {
      return;
    }
    this.post({
      type: 'compareFiles',
      selectedBranch: branch,
      mode: this.mode,
      baseBranch: this.compareBaseBranch,
      compareBranch: this.compareBranch,
      files
    });
    if (!files[0]) {
      this.post({ type: 'patch', selectedFile: undefined, patch: '' });
    }
  }

  private async loadCompareFilePatch(file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      const patch = await this.git.branchFilePatch(this.compareBaseBranch, this.compareBranch, file);
      const content = await this.branchDiffContent(file);
      this.post({ type: 'patch', selectedFile: file.filePath, patch, ...content });
    });
  }

  private async loadLocalChanges(generation = this.loadGeneration): Promise<void> {
    const changes = await this.git.status();
    if (generation !== this.loadGeneration) {
      return;
    }
    this.post({ type: 'localChanges', mode: this.mode, files: changes });
    if (!changes[0]) {
      this.post({ type: 'patch', selectedFile: undefined, patch: '' });
    }
  }

  private async loadFileHistory(generation = this.loadGeneration): Promise<void> {
    const commits = this.historyFilePath ? await this.git.fileHistory(this.historyFilePath) : [];
    if (generation !== this.loadGeneration) {
      return;
    }
    this.post({ type: 'fileHistory', mode: this.mode, filePath: this.historyFilePath, commits });
    await this.loadFirstCommit(commits);
  }

  private async loadLocalChangePatch(change: GitChange): Promise<void> {
    await this.withErrorBoundary(async () => {
      const patch = await this.git.localChangePatch(change);
      const content = await this.localDiffContent(change);
      this.post({ type: 'patch', selectedFile: localChangeKey(change), patch, ...content });
    });
  }

  private async postCommitFilePatch(hash: string, file: GitCommitFile): Promise<void> {
    const patch = await this.git.commitFilePatch(hash, file);
    const content = await this.commitDiffContent(hash, file);
    this.post({ type: 'patch', selectedFile: file.filePath, patch, ...content });
  }

  private async commitDiffContent(hash: string, file: GitCommitFile): Promise<DiffContent> {
    const parent = await this.git.firstParent(hash);
    const originalPath = file.originalPath ?? file.filePath;
    const [original, modified] = await Promise.all([
      parent && file.status !== 'A' ? this.readFileAtRef(parent, originalPath) : '',
      file.status !== 'D' ? this.readFileAtRef(hash, file.filePath) : ''
    ]);
    return { original, modified };
  }

  private async branchDiffContent(file: GitCommitFile): Promise<DiffContent> {
    const baseRef = await this.git.mergeBase(this.compareBaseBranch, this.compareBranch);
    const originalPath = file.originalPath ?? file.filePath;
    const [original, modified] = await Promise.all([
      file.status !== 'A' ? this.readFileAtRef(baseRef, originalPath) : '',
      file.status !== 'D' ? this.readFileAtRef(this.compareBranch, file.filePath) : ''
    ]);
    return { original, modified };
  }

  private async localDiffContent(change: GitChange): Promise<DiffContent> {
    if (change.bucket === 'untracked') {
      return {
        original: '',
        modified: await this.readWorkspaceFile(change.filePath)
      };
    }

    if (change.bucket === 'staged') {
      const originalPath = change.originalPath ?? change.filePath;
      const [original, modified] = await Promise.all([
        this.readFileAtRef('HEAD', originalPath),
        change.x !== 'D' ? this.readFileAtRef('index', change.filePath) : ''
      ]);
      return { original, modified };
    }

    const originalPath = change.originalPath ?? change.filePath;
    const [original, modified] = await Promise.all([
      this.readFileAtRef('index', originalPath).then(
        (content) => content,
        () => this.readFileAtRef('HEAD', originalPath)
      ),
      change.y !== 'D' ? this.readWorkspaceFile(change.filePath) : ''
    ]);
    return { original, modified };
  }

  private async readFileAtRef(ref: string, filePath: string): Promise<string> {
    try {
      return await this.git.fileAtRef(ref, filePath);
    } catch {
      return '';
    }
  }

  private async readWorkspaceFile(filePath: string): Promise<string> {
    try {
      return await this.git.workspaceFile(filePath);
    } catch {
      return '';
    }
  }

  private async checkoutBranch(branch: string, remote: boolean): Promise<void> {
    await this.withErrorBoundary(async () => {
      if (remote) {
        await assertNoUnresolvedConflicts(this.git, 'checking out another branch');
        await this.git.checkoutRemote(branch);
      } else {
        await assertNoUnresolvedConflicts(this.git, 'checking out another branch');
        await this.git.checkout(branch);
      }
      this.selectedBranch = undefined;
      await this.loadInitial();
      vscode.window.showInformationMessage(`Checked out ${branch}`);
    });
  }

  private async createBranch(): Promise<void> {
    await this.withErrorBoundary(async () => {
      const branch = await vscode.window.showInputBox({
        title: 'New Branch',
        prompt: 'Branch name',
        ignoreFocusOut: true,
        validateInput: (value) => (/^\S+$/.test(value) ? undefined : 'Branch name cannot contain spaces')
      });
      if (!branch) {
        return;
      }

      await this.git.createBranch(branch);
      this.selectedBranch = undefined;
      await this.loadInitial();
      vscode.window.showInformationMessage(`Created and checked out ${branch}`);
    });
  }

  private async deleteBranch(branch: string, remote: boolean): Promise<void> {
    await this.withErrorBoundary(async () => {
      if (remote) {
        vscode.window.showWarningMessage('Remote branch deletion is not supported from the bottom SCM panel yet.');
        return;
      }

      const answer = await vscode.window.showWarningMessage(`Delete local branch ${branch}?`, { modal: true }, 'Delete', 'Force Delete');
      if (!answer) {
        return;
      }

      await this.git.deleteBranch(branch, answer === 'Force Delete');
      this.selectedBranch = undefined;
      await this.loadInitial();
      vscode.window.showInformationMessage(`Deleted branch ${branch}`);
    });
  }

  private async renameBranch(branch: string, remote: boolean): Promise<void> {
    await this.withErrorBoundary(async () => {
      if (remote) {
        vscode.window.showWarningMessage('Remote branch rename is not supported from the bottom SCM panel.');
        return;
      }

      const newName = await vscode.window.showInputBox({
        title: `Rename Branch ${branch}`,
        prompt: 'New branch name',
        value: branch,
        ignoreFocusOut: true,
        validateInput: (value) => (/^\S+$/.test(value) ? undefined : 'Branch name cannot contain spaces')
      });
      if (!newName || newName === branch) {
        return;
      }

      await this.git.renameBranch(branch, newName);
      if (this.selectedBranch === branch) {
        this.selectedBranch = newName;
      }
      await this.loadInitial();
      vscode.window.showInformationMessage(`Renamed ${branch} to ${newName}`);
    });
  }

  private async mergeBranch(branch: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const answer = await vscode.window.showWarningMessage(
        `Merge ${branch} into ${this.currentBranch}?`,
        { modal: true },
        'Merge'
      );
      if (answer !== 'Merge') {
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Abstractive SCM: Merge ${branch}` },
        async () => {
          await assertNoUnresolvedConflicts(this.git, 'merging');
          await this.git.mergeBranch(branch);
        }
      );
      await this.loadInitial();
      vscode.window.showInformationMessage(`Merged ${branch} into ${this.currentBranch}`);
    });
  }

  private async rebaseOntoBranch(branch: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const answer = await vscode.window.showWarningMessage(
        `Rebase ${this.currentBranch} onto ${branch}?`,
        { modal: true },
        'Rebase'
      );
      if (answer !== 'Rebase') {
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Abstractive SCM: Rebase onto ${branch}` },
        async () => {
          await assertNoUnresolvedConflicts(this.git, 'rebasing');
          await this.git.rebaseOntoBranch(branch);
        }
      );
      await this.loadInitial();
      vscode.window.showInformationMessage(`Rebased ${this.currentBranch} onto ${branch}`);
    });
  }

  private async openBranchComparison(branch: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      this.mode = 'files';
      this.selectedBranch = branch;
      await this.loadBranchModeData(branch);
    });
  }

  private async stageLocalChange(change: GitChange): Promise<void> {
    await this.withErrorBoundary(async () => {
      await this.git.stage(change.filePath);
      await this.loadLocalChanges();
    });
  }

  private async unstageLocalChange(change: GitChange): Promise<void> {
    await this.withErrorBoundary(async () => {
      await this.git.unstage(change.filePath);
      await this.loadLocalChanges();
    });
  }

  private async stageAllLocalChanges(): Promise<void> {
    await this.withErrorBoundary(async () => {
      await this.git.stageAll();
      await this.loadLocalChanges();
    });
  }

  private async commitLocalChanges(): Promise<void> {
    await this.withErrorBoundary(async () => {
      const message = await vscode.window.showInputBox({
        title: 'Commit Local Changes',
        prompt: 'Commit message',
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() ? undefined : 'Commit message is required')
      });
      if (!message) {
        return;
      }

      const signoff = vscode.workspace.getConfiguration('abstractiveScm').get<boolean>('commitSignoff', false);
      await this.git.commit(message, false, signoff);
      await this.loadInitial();
      vscode.window.showInformationMessage('Committed local changes');
    });
  }

  private async shelveLocalChanges(): Promise<void> {
    await this.withErrorBoundary(async () => {
      const changes = await this.git.status();
      if (!changes.length) {
        vscode.window.showInformationMessage('There are no local changes to shelve.');
        return;
      }

      const message = await vscode.window.showInputBox({
        title: 'Shelve Changes',
        prompt: 'Shelf name',
        value: `WIP on ${this.currentBranch}`,
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() ? undefined : 'Shelf name is required')
      });
      if (!message) {
        return;
      }

      const includeUntracked = changes.some((change) => change.bucket === 'untracked')
        ? (await vscode.window.showQuickPick(
            [
              { label: 'Include untracked files', include: true },
              { label: 'Tracked files only', include: false }
            ],
            { title: 'Shelve Changes' }
          ))?.include ?? false
        : false;
      await this.git.stashPush(message, includeUntracked);
      await this.loadLocalChanges();
      vscode.window.showInformationMessage(`Shelved changes: ${message}`);
    });
  }

  private async unshelveChanges(): Promise<void> {
    await this.withErrorBoundary(async () => {
      const stashes = await this.git.stashes();
      if (!stashes.length) {
        vscode.window.showInformationMessage('There are no shelves to apply.');
        return;
      }

      const pick = await vscode.window.showQuickPick(
        stashes.map((stash) => ({
          label: stash.ref,
          description: stash.age,
          detail: stash.message,
          stash
        })),
        { title: 'Unshelve Changes', placeHolder: 'Select a shelf' }
      );
      if (!pick) {
        return;
      }

      const remove = await vscode.window.showQuickPick(
        [
          { label: 'Apply and keep shelf', remove: false },
          { label: 'Apply and remove shelf', remove: true }
        ],
        { title: `Unshelve ${pick.stash.ref}` }
      );
      if (!remove) {
        return;
      }

      if (remove.remove) {
        await this.git.stashPop(pick.stash.ref);
      } else {
        await this.git.stashApply(pick.stash.ref);
      }
      await this.loadLocalChanges();
      vscode.window.showInformationMessage(`Unshelved ${pick.stash.ref}`);
    });
  }

  private async copyCommitHash(hash: string): Promise<void> {
    const commit = await this.git.commitDetails(hash);
    await vscode.env.clipboard.writeText(commit?.hash ?? hash);
    vscode.window.showInformationMessage(`Copied ${commit?.shortHash ?? hash.slice(0, 7)}`);
  }

  private async cherryPickCommit(hash: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const commit = await this.git.commitDetails(hash);
      const label = commit?.shortHash ?? hash.slice(0, 7);
      const answer = await vscode.window.showWarningMessage(
        `Cherry-pick commit ${label} onto ${this.currentBranch}?`,
        { modal: true },
        'Cherry-pick'
      );
      if (answer !== 'Cherry-pick') {
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Abstractive SCM: Cherry-pick ${label}` },
        () => this.git.cherryPickCommit(hash)
      );
      await this.loadInitial();
      vscode.window.showInformationMessage(`Cherry-picked ${label}`);
    });
  }

  private async revertCommit(hash: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const commit = await this.git.commitDetails(hash);
      const label = commit?.shortHash ?? hash.slice(0, 7);
      const answer = await vscode.window.showWarningMessage(
        `Revert commit ${label} with a new commit on ${this.currentBranch}?`,
        { modal: true },
        'Revert'
      );
      if (answer !== 'Revert') {
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Abstractive SCM: Revert ${label}` },
        () => this.git.revertCommit(hash)
      );
      await this.loadInitial();
      vscode.window.showInformationMessage(`Reverted ${label}`);
    });
  }

  private async createBranchFromCommit(hash: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const commit = await this.git.commitDetails(hash);
      const label = commit?.shortHash ?? hash.slice(0, 7);
      const branch = await vscode.window.showInputBox({
        title: `New Branch from ${label}`,
        prompt: 'Branch name',
        ignoreFocusOut: true,
        validateInput: (value) => (/^\S+$/.test(value) ? undefined : 'Branch name cannot contain spaces')
      });
      if (!branch) {
        return;
      }

      await this.git.createBranchAt(branch, hash);
      await this.loadInitial();
      vscode.window.showInformationMessage(`Created branch ${branch} at ${label}`);
    });
  }

  private async createTagFromCommit(hash: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const commit = await this.git.commitDetails(hash);
      const label = commit?.shortHash ?? hash.slice(0, 7);
      const tag = await vscode.window.showInputBox({
        title: `New Tag from ${label}`,
        prompt: 'Tag name',
        ignoreFocusOut: true,
        validateInput: (value) => (/^\S+$/.test(value) ? undefined : 'Tag name cannot contain spaces')
      });
      if (!tag) {
        return;
      }

      await this.git.createTagAt(tag, hash);
      await this.loadInitial();
      vscode.window.showInformationMessage(`Created tag ${tag} at ${label}`);
    });
  }

  private async checkoutCommit(hash: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const commit = await this.git.commitDetails(hash);
      const label = commit?.shortHash ?? hash.slice(0, 7);
      const answer = await vscode.window.showWarningMessage(
        `Checkout commit ${label} in detached HEAD state?`,
        { modal: true },
        'Checkout'
      );
      if (answer !== 'Checkout') {
        return;
      }

      await this.git.checkoutCommit(hash);
      this.selectedBranch = undefined;
      await this.loadInitial();
      vscode.window.showInformationMessage(`Checked out ${label}`);
    });
  }

  private async openFileAtRevision(hash: string, file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      if (file.status.startsWith('D')) {
        vscode.window.showWarningMessage(`${file.filePath} was deleted in this commit.`);
        return;
      }

      const commit = await this.git.commitDetails(hash);
      const uri = gitContentUri(hash, file.filePath, this.git.root);
      await vscode.window.showTextDocument(uri, { preview: true });
      this.post({ type: 'notice', message: `Opened ${file.filePath} at ${commit?.shortHash ?? hash.slice(0, 7)}` });
    });
  }

  private async openWorkingFile(file: GitCommitFile | GitChange): Promise<void> {
    await this.withErrorBoundary(async () => {
      const uri = this.git.toWorkspaceUri(file.filePath);
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        vscode.window.showWarningMessage(`${file.filePath} does not exist in the working tree.`);
        return;
      }

      await vscode.window.showTextDocument(uri, { preview: true });
      this.post({ type: 'notice', message: `Opened working tree file ${file.filePath}` });
    });
  }

  private async openNativeDiff(hash: string, file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      const commit = await this.git.commitDetails(hash);
      const parentRef = `${hash}^`;
      const leftPath = file.originalPath ?? file.filePath;
      const left = file.status.startsWith('A') ? gitContentUri('empty', file.filePath, this.git.root) : gitContentUri(parentRef, leftPath, this.git.root);
      const right = file.status.startsWith('D') ? gitContentUri('empty', file.filePath, this.git.root) : gitContentUri(hash, file.filePath, this.git.root);
      await vscode.commands.executeCommand('vscode.diff', left, right, `${file.filePath} (${commit?.shortHash ?? hash.slice(0, 7)})`);
    });
  }

  private async openLocalChangeDiff(change: GitChange): Promise<void> {
    await this.withErrorBoundary(async () => {
      const title = `${change.filePath} (${changeLabel(change)})`;
      const right = change.bucket === 'staged' ? gitContentUri('index', change.filePath, this.git.root) : this.git.toWorkspaceUri(change.filePath);
      const left =
        change.bucket === 'untracked' || change.x === 'A'
          ? gitContentUri('empty', change.filePath, this.git.root)
          : gitContentUri('HEAD', change.originalPath ?? change.filePath, this.git.root);
      await vscode.commands.executeCommand('vscode.diff', left, right, title);
    });
  }

  private async openCompareFileAtRevision(file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      if (file.status.startsWith('D')) {
        vscode.window.showWarningMessage(`${file.filePath} is deleted in ${this.compareBranch}.`);
        return;
      }

      await vscode.window.showTextDocument(gitContentUri(this.compareBranch, file.filePath, this.git.root), { preview: true });
      this.post({ type: 'notice', message: `Opened ${file.filePath} at ${this.compareBranch}` });
    });
  }

  private async openCompareNativeDiff(file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      const baseRef = await this.git.mergeBase(this.compareBaseBranch, this.compareBranch);
      const leftPath = file.originalPath ?? file.filePath;
      const left = file.status.startsWith('A') ? gitContentUri('empty', file.filePath, this.git.root) : gitContentUri(baseRef, leftPath, this.git.root);
      const right = file.status.startsWith('D') ? gitContentUri('empty', file.filePath, this.git.root) : gitContentUri(this.compareBranch, file.filePath, this.git.root);
      await vscode.commands.executeCommand('vscode.diff', left, right, `${file.filePath} (${this.compareBaseBranch}...${this.compareBranch})`);
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
    if (this.mode === 'outgoing') {
      return branch === this.currentBranch ? [] : this.git.logRange(branch, this.currentBranch, limit);
    }
    if (this.mode === 'incoming') {
      return branch === this.currentBranch ? [] : this.git.logRange(this.currentBranch, branch, limit);
    }
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


function historyCommitFiles(files: GitCommitFile[], filePath: string): GitCommitFile[] {
  const match = files.find((file) => file.filePath === filePath || file.originalPath === filePath);
  return match ? [match] : [{ status: 'M', filePath }];
}

function localChangeKey(change: GitChange): string {
  return `${change.bucket}:${change.filePath}`;
}
