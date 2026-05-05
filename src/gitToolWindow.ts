import * as vscode from 'vscode';
import { GitService } from './git';
import { gitContentUri } from './gitContentProvider';
import { changeLabel, GitChange, GitCommit, GitCommitFile } from './models';

type ToolWindowMode = 'log' | 'outgoing' | 'incoming' | 'files' | 'changes';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'resetLayout' }
  | { type: 'setMode'; mode: ToolWindowMode }
  | { type: 'selectBranch'; branch: string }
  | { type: 'checkoutBranch'; branch: string; remote: boolean }
  | { type: 'createBranch' }
  | { type: 'deleteBranch'; branch: string; remote: boolean }
  | { type: 'renameBranch'; branch: string; remote: boolean }
  | { type: 'mergeBranch'; branch: string }
  | { type: 'rebaseOntoBranch'; branch: string }
  | { type: 'compareBranch'; branch: string }
  | { type: 'selectCommit'; hash: string }
  | { type: 'copyCommitHash'; hash: string }
  | { type: 'cherryPickCommit'; hash: string }
  | { type: 'revertCommit'; hash: string }
  | { type: 'createBranchFromCommit'; hash: string }
  | { type: 'createTagFromCommit'; hash: string }
  | { type: 'checkoutCommit'; hash: string }
  | { type: 'selectFile'; hash: string; file: GitCommitFile }
  | { type: 'selectCompareFile'; file: GitCommitFile }
  | { type: 'selectLocalChange'; change: GitChange }
  | { type: 'stageLocalChange'; change: GitChange }
  | { type: 'unstageLocalChange'; change: GitChange }
  | { type: 'stageAllLocalChanges' }
  | { type: 'commitLocalChanges' }
  | { type: 'shelveLocalChanges' }
  | { type: 'unshelveChanges' }
  | { type: 'openLocalChangeDiff'; change: GitChange }
  | { type: 'openWorkingFile'; file: GitCommitFile | GitChange }
  | { type: 'openFileAtRevision'; hash: string; file: GitCommitFile }
  | { type: 'openCompareFileAtRevision'; file: GitCommitFile }
  | { type: 'openCompareFileDiff'; file: GitCommitFile }
  | { type: 'openFileDiff'; hash: string; file: GitCommitFile };

export class GitToolWindowProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'abstractiveScm.toolWindow';

  private view: vscode.WebviewView | undefined;
  private selectedBranch: string | undefined;
  private currentBranch = 'HEAD';
  private mode: ToolWindowMode = 'log';
  private compareBaseBranch = 'HEAD';
  private compareBranch = 'HEAD';

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
    await this.withErrorBoundary(async () => {
      const [branches, branchStatus] = await Promise.all([this.git.branches(), this.git.branchStatus()]);
      const currentBranch = branchStatus.branch;
      this.currentBranch = currentBranch;
      const selectedBranch = this.selectedBranch ?? currentBranch;
      this.post({
        type: 'init',
        branches,
        currentBranch,
        selectedBranch,
        mode: this.mode
      });
      await this.loadBranchModeData(selectedBranch);
    });
  }

  private async loadBranch(branch: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      this.selectedBranch = branch;
      await this.loadBranchModeData(branch);
    });
  }

  private async setMode(mode: ToolWindowMode): Promise<void> {
    this.mode = mode;
    await this.loadBranch(this.selectedBranch ?? this.currentBranch);
  }

  private async loadBranchModeData(branch: string): Promise<void> {
    if (this.mode === 'changes') {
      await this.loadLocalChanges();
      return;
    }
    if (this.mode === 'files') {
      await this.loadCompareFiles(branch);
      return;
    }

    const commits = await this.loadCommitsForBranch(branch);
    this.post({ type: 'branchData', selectedBranch: branch, mode: this.mode, commits });
    await this.loadFirstCommit(commits);
  }

  private async loadCommit(hash: string): Promise<void> {
    await this.withErrorBoundary(async () => {
      const files = await this.git.commitFiles(hash);
      const commit = await this.git.commitDetails(hash);
      this.post({ type: 'commitFiles', selectedCommit: hash, files });
      if (commit) {
        this.post({ type: 'commitDetails', commit });
      }
      if (!files[0]) {
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

  private async loadCompareFiles(branch: string): Promise<void> {
    this.compareBaseBranch = this.currentBranch;
    this.compareBranch = branch;
    const files = branch === this.currentBranch ? [] : await this.git.branchDiffFiles(this.compareBaseBranch, this.compareBranch);
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
      this.post({ type: 'patch', selectedFile: file.filePath, patch });
    });
  }

  private async loadLocalChanges(): Promise<void> {
    const changes = await this.git.status();
    this.post({ type: 'localChanges', mode: this.mode, files: changes });
    if (!changes[0]) {
      this.post({ type: 'patch', selectedFile: undefined, patch: '' });
    }
  }

  private async loadLocalChangePatch(change: GitChange): Promise<void> {
    await this.withErrorBoundary(async () => {
      const patch = await this.git.localChangePatch(change);
      this.post({ type: 'patch', selectedFile: localChangeKey(change), patch });
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
        () => this.git.mergeBranch(branch)
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
        () => this.git.rebaseOntoBranch(branch)
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
      const uri = gitContentUri(hash, file.filePath);
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
      const left = file.status.startsWith('A') ? gitContentUri('empty', file.filePath) : gitContentUri(parentRef, leftPath);
      const right = file.status.startsWith('D') ? gitContentUri('empty', file.filePath) : gitContentUri(hash, file.filePath);
      await vscode.commands.executeCommand('vscode.diff', left, right, `${file.filePath} (${commit?.shortHash ?? hash.slice(0, 7)})`);
    });
  }

  private async openLocalChangeDiff(change: GitChange): Promise<void> {
    await this.withErrorBoundary(async () => {
      const title = `${change.filePath} (${changeLabel(change)})`;
      const right = change.bucket === 'staged' ? gitContentUri('index', change.filePath) : this.git.toWorkspaceUri(change.filePath);
      const left =
        change.bucket === 'untracked' || change.x === 'A'
          ? gitContentUri('empty', change.filePath)
          : gitContentUri('HEAD', change.originalPath ?? change.filePath);
      await vscode.commands.executeCommand('vscode.diff', left, right, title);
    });
  }

  private async openCompareFileAtRevision(file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      if (file.status.startsWith('D')) {
        vscode.window.showWarningMessage(`${file.filePath} is deleted in ${this.compareBranch}.`);
        return;
      }

      await vscode.window.showTextDocument(gitContentUri(this.compareBranch, file.filePath), { preview: true });
      this.post({ type: 'notice', message: `Opened ${file.filePath} at ${this.compareBranch}` });
    });
  }

  private async openCompareNativeDiff(file: GitCommitFile): Promise<void> {
    await this.withErrorBoundary(async () => {
      const baseRef = await this.git.mergeBase(this.compareBaseBranch, this.compareBranch);
      const leftPath = file.originalPath ?? file.filePath;
      const left = file.status.startsWith('A') ? gitContentUri('empty', file.filePath) : gitContentUri(baseRef, leftPath);
      const right = file.status.startsWith('D') ? gitContentUri('empty', file.filePath) : gitContentUri(this.compareBranch, file.filePath);
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
      --scm-pane-accent: var(--vscode-list-focusOutline, var(--vscode-focusBorder));
      --scm-active-header-background: var(--vscode-list-inactiveSelectionBackground, var(--vscode-sideBar-background));
      --scm-active-header-foreground: var(--vscode-list-inactiveSelectionForeground, var(--vscode-foreground));
      --scm-inactive-selection-background: var(--vscode-list-inactiveSelectionBackground, transparent);
      --scm-inactive-selection-foreground: var(--vscode-list-inactiveSelectionForeground, var(--vscode-editor-foreground));
      --scm-active-selection-background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-inactiveSelectionBackground, transparent));
      --scm-active-selection-foreground: var(--vscode-list-activeSelectionForeground, var(--vscode-editor-foreground));
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
      grid-template-rows: auto minmax(0, 1fr);
      height: 100vh;
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: stretch;
      gap: 4px;
      min-width: 0;
      min-height: 56px;
      padding: 4px 10px 6px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      background: var(--vscode-sideBar-background);
      overflow: hidden;
    }
    .toolbar-status {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }
    .title {
      font-weight: 600;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .toolbar-actions {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: 4px;
      overflow: visible;
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
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border-right: 1px solid var(--vscode-sideBar-border);
      display: grid;
      grid-template-rows: 28px minmax(0, 1fr);
      background: var(--vscode-editor-background);
      transition: background-color 80ms ease-out;
    }
    .pane:last-child {
      border-right: 0;
    }
    .commit-pane {
      grid-template-rows: 28px auto minmax(0, 1fr);
    }
    .pane.active-pane {
      box-shadow: inset 0 2px 0 var(--scm-pane-accent), inset 0 0 0 1px var(--scm-pane-accent);
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
      background: var(--scm-pane-accent);
    }
    .pane-title {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px 0 14px;
      color: var(--vscode-sideBarTitle-foreground);
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-sideBar-border);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .pane-title::before {
      content: "";
      position: absolute;
      left: 6px;
      width: 3px;
      height: 14px;
      border-radius: 2px;
      background: transparent;
    }
    .pane.active-pane .pane-title {
      color: var(--scm-active-header-foreground);
      background: var(--scm-active-header-background);
      border-bottom-color: var(--scm-pane-accent);
    }
    .pane.active-pane .pane-title::before {
      background: var(--scm-pane-accent);
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
    .pane-title button {
      height: 20px;
      min-width: 24px;
      padding: 0 6px;
      color: var(--vscode-button-secondaryForeground);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 3px;
      font-size: 11px;
    }
    .pane-title button.active {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    .branch-title {
      display: grid;
      grid-template-columns: auto minmax(70px, 1fr) auto auto auto;
    }
    .file-title {
      display: grid;
      grid-template-columns: auto minmax(70px, 1fr) auto auto auto auto auto;
    }
    .commit-title {
      display: grid;
      grid-template-columns: auto auto auto auto auto auto minmax(90px, 1fr);
    }
    .diff-title {
      display: grid;
      grid-template-columns: minmax(92px, 1fr) auto auto auto auto auto auto;
    }
    .list,
    .grid,
    .diff {
      overflow: auto;
      min-height: 0;
    }
    .list {
      position: relative;
    }
    .list.loading-files .row {
      opacity: 0.58;
    }
    .list.loading-files::after {
      content: "Loading files...";
      position: sticky;
      bottom: 0;
      display: block;
      padding: 5px 10px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBar-background);
      border-top: 1px solid var(--vscode-sideBar-border);
      font-size: 11px;
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
      background: var(--vscode-list-hoverBackground, color-mix(in srgb, var(--vscode-editor-foreground) 6%, transparent));
    }
    .row.selected {
      color: var(--scm-inactive-selection-foreground);
      background: var(--scm-inactive-selection-background);
      box-shadow: inset 3px 0 0 var(--scm-pane-accent);
    }
    .row.focused {
      outline: 1px solid var(--scm-pane-accent);
      outline-offset: -1px;
    }
    .row.selected.focused {
      box-shadow: inset 4px 0 0 var(--scm-pane-accent);
    }
    .row.selected:hover {
      background: var(--scm-inactive-selection-background);
    }
    .pane.active-pane .row:hover:not(.selected) {
      background: var(--vscode-list-hoverBackground, transparent);
    }
    .pane.active-pane .row.selected {
      color: var(--scm-active-selection-foreground);
      background: var(--scm-active-selection-background);
      box-shadow: inset 4px 0 0 var(--scm-pane-accent);
    }
    .pane.active-pane .row.selected:hover {
      background: var(--scm-active-selection-background);
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
      grid-template-columns: var(--commit-columns, 56px 74px 120px 142px minmax(220px, 1fr));
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
    .pane.active-pane .commit-header {
      color: var(--scm-active-header-foreground);
      background: var(--scm-active-header-background);
    }
    .commit-summary {
      min-width: 0;
      height: 50px;
      padding: 7px 10px;
      overflow: hidden;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      background: var(--vscode-editor-background);
    }
    .commit-summary[hidden] {
      display: none;
    }
    .commit-summary-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }
    .commit-summary-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      margin-top: 3px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      max-height: 16px;
      overflow: hidden;
    }
    .commit-summary-meta span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
      min-width: 0;
      overflow: hidden;
      text-align: left;
    }
    .graph-lanes {
      display: block;
      width: max-content;
      min-width: 28px;
      height: 24px;
      overflow: visible;
    }
    .graph-line {
      stroke-width: 2;
      stroke-linecap: round;
      opacity: 0.76;
    }
    .graph-node {
      fill: var(--vscode-editor-background);
      stroke-width: 2.2;
    }
    .graph-node-inner {
      fill: currentColor;
      opacity: 0;
    }
    .commit-row:hover .graph-line,
    .commit-row.selected .graph-line {
      opacity: 1;
      stroke-width: 2.4;
    }
    .commit-row:hover .graph-node,
    .commit-row.selected .graph-node {
      stroke-width: 3;
    }
    .commit-row.selected .graph-node {
      fill: color-mix(in srgb, currentColor 16%, var(--vscode-editor-background));
    }
    .commit-row.selected .graph-node-inner {
      opacity: 1;
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
    .subject-line {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      overflow: hidden;
    }
    .subject-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ref-labels {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      min-width: 0;
      flex: 0 1 auto;
      overflow: hidden;
    }
    .ref-label {
      max-width: 120px;
      padding: 0 5px;
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      line-height: 16px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: none;
    }
    .ref-label.remote {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground) 18%, transparent);
    }
    .ref-label.tag {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 18%, transparent);
    }
    .ref-label.head {
      color: var(--vscode-editor-background);
      background: var(--vscode-focusBorder);
    }
    .branch-kind {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .status {
      justify-self: end;
      min-width: 18px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 600;
      text-align: right;
    }
    .status.added {
      color: var(--vscode-gitDecoration-addedResourceForeground);
    }
    .status.modified {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
    }
    .status.deleted {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
    }
    .status.renamed {
      color: var(--vscode-gitDecoration-renamedResourceForeground, var(--vscode-gitDecoration-modifiedResourceForeground));
    }
    .hash {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .file-row {
      grid-template-columns: 24px minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 8px;
    }
    .file-icon {
      justify-self: center;
      width: 22px;
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      text-align: center;
      text-transform: uppercase;
    }
    .file-icon.type-ts,
    .file-icon.type-js,
    .file-icon.type-jsx,
    .file-icon.type-tsx {
      color: var(--vscode-charts-blue);
    }
    .file-icon.type-json {
      color: var(--vscode-charts-yellow);
    }
    .file-icon.type-md,
    .file-icon.type-mdx {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
    }
    .file-icon.type-css,
    .file-icon.type-scss,
    .file-icon.type-less {
      color: var(--vscode-charts-purple);
    }
    .file-icon.type-html,
    .file-icon.type-svg {
      color: var(--vscode-charts-orange);
    }
    .empty {
      padding: 12px 10px;
      color: var(--vscode-descriptionForeground);
    }
    .details {
      max-height: 180px;
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
    .details-body {
      margin-top: 6px;
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre-wrap;
    }
    .details-row {
      display: grid;
      grid-template-columns: 86px minmax(0, 1fr);
      column-gap: 8px;
      line-height: 1.45;
      font-size: 12px;
    }
    .details-label {
      color: var(--vscode-descriptionForeground);
    }
    .details-value {
      min-width: 0;
      overflow-wrap: anywhere;
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
      cursor: pointer;
      user-select: none;
    }
    .line.current-hunk {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
      background: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground) 18%, var(--vscode-editor-lineHighlightBackground));
    }
    .line.meta {
      color: var(--vscode-descriptionForeground);
    }
    .word-change {
      border-radius: 2px;
      background: color-mix(in srgb, currentColor 26%, transparent);
    }
    .diff-stats {
      align-self: center;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 500;
      text-transform: none;
      white-space: nowrap;
    }
    .diff-side {
      min-width: max-content;
      padding: 8px 0;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
    }
    .diff-side-row {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) minmax(260px, 1fr);
    }
    .diff-side-row.meta,
    .diff-side-row.hunk {
      display: block;
    }
    .diff-cell {
      min-height: 1.45em;
      padding: 0 12px;
      white-space: pre;
      border-right: 1px solid var(--vscode-sideBar-border);
    }
    .diff-cell:last-child {
      border-right: 0;
    }
    .diff-cell.add {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 12%, transparent);
    }
    .diff-cell.del {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 12%, transparent);
    }
    .error {
      color: var(--vscode-errorForeground);
      padding-left: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .context-menu {
      position: fixed;
      z-index: 20;
      min-width: 180px;
      padding: 4px;
      display: none;
      background: var(--vscode-menu-background);
      color: var(--vscode-menu-foreground);
      border: 1px solid var(--vscode-menu-border, var(--vscode-sideBar-border));
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
    }
    .context-menu.open {
      display: block;
    }
    .context-menu button {
      display: block;
      width: 100%;
      height: 26px;
      padding: 0 10px;
      color: var(--vscode-menu-foreground);
      background: transparent;
      border: 0;
      border-radius: 0;
      text-align: left;
    }
    .context-menu button:hover:not(:disabled),
    .context-menu button:focus:not(:disabled) {
      color: var(--vscode-menu-selectionForeground);
      background: var(--vscode-menu-selectionBackground);
    }
    .help-overlay {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.36);
    }
    .help-overlay.open {
      display: flex;
    }
    .help-dialog {
      width: min(620px, 100%);
      max-height: min(680px, 100%);
      overflow: auto;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-sideBar-border);
      box-shadow: 0 10px 34px rgba(0, 0, 0, 0.34);
    }
    .help-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      font-weight: 600;
    }
    .help-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 18px;
      padding: 12px;
    }
    .help-row {
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .key {
      display: inline-block;
      min-width: 24px;
      padding: 1px 6px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-keybindingLabel-background);
      border: 1px solid var(--vscode-keybindingLabel-border, var(--vscode-sideBar-border));
      border-bottom-color: var(--vscode-keybindingLabel-bottomBorder, var(--vscode-sideBar-border));
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      text-align: center;
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
    @media (max-width: 1180px) {
      .toolbar button {
        padding: 0 7px;
      }
    }
    @media (max-width: 760px) {
      .toolbar-actions {
        width: 100%;
      }
      .help-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <div class="toolbar-status">
        <div class="title" id="title">SCM</div>
        <div class="loading" id="loading"></div>
        <div class="error" id="error"></div>
      </div>
      <div class="toolbar-actions">
        <button id="checkoutBranch" title="Checkout selected branch (b)">Checkout</button>
        <button id="branchActions" title="Show branch actions">Branch</button>
        <button id="copyHash" title="Copy selected commit hash (y)">Hash</button>
        <button id="commitActions" title="Show selected commit actions">Actions</button>
        <button id="openFile" title="Open selected file at this revision (p)">Revision</button>
        <button id="openWorkingFile" title="Open selected working tree file (w)">Worktree</button>
        <button id="openDiff" title="Open selected file diff (o)">Diff</button>
        <button id="stageChange" title="Stage selected local change">Stage</button>
        <button id="unstageChange" title="Unstage selected local change">Unstage</button>
        <button id="commitChanges" title="Commit staged changes">Commit</button>
        <button id="shelveChanges" title="Shelve local changes">Shelve</button>
        <button id="unshelveChanges" title="Unshelve saved changes">Unshelve</button>
        <button id="showHelp" title="Show keyboard shortcuts (F1)">Keys</button>
        <button id="resetLayout" title="Reset panel layout">Reset</button>
        <button id="refresh" title="Refresh">Refresh</button>
      </div>
    </div>
    <main class="layout">
      <section class="pane" data-pane="branches">
        <div class="pane-title branch-title">
          <span>Branches</span>
          <input id="branchSearch" type="search" aria-label="Search branches" placeholder="Search">
          <button data-branch-filter="all" title="Show all branches">All</button>
          <button data-branch-filter="local" title="Show local branches">L</button>
          <button data-branch-filter="remote" title="Show remote branches">R</button>
        </div>
        <div class="list" id="branches" role="listbox" aria-label="Branches"></div>
      </section>
      <div class="pane-divider" data-divider="0" role="separator" aria-orientation="vertical" title="Resize panes"></div>
      <section class="pane commit-pane" data-pane="commits">
        <div class="pane-title commit-title">
          <span>Commits</span>
          <button data-mode="log" title="Show selected branch log">Log</button>
          <button data-mode="outgoing" title="Show current branch commits not in selected branch">Out</button>
          <button data-mode="incoming" title="Show selected branch commits not in current branch">In</button>
          <button data-mode="files" title="Show aggregate changed files between current and selected branch">Files</button>
          <button data-mode="changes" title="Show local working tree changes">Local</button>
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
          <button data-file-filter="all" title="Show all files">All</button>
          <button data-file-filter="A" title="Show added files">A</button>
          <button data-file-filter="M" title="Show modified files">M</button>
          <button data-file-filter="D" title="Show deleted files">D</button>
          <button data-file-filter="R" title="Show renamed files">R</button>
        </div>
        <div class="list" id="files" role="listbox" aria-label="Changed files"></div>
      </section>
      <div class="pane-divider" data-divider="2" role="separator" aria-orientation="vertical" title="Resize panes"></div>
      <section class="pane diff-pane" data-pane="diff">
        <div class="pane-title diff-title">
          <span>Diff Preview</span>
          <span class="diff-stats" id="diffStats"></span>
          <button id="toggleDiffView" title="Toggle side-by-side diff preview">Side</button>
          <button id="prevFile" title="Previous file ([)">File &lt;</button>
          <button id="nextFile" title="Next file (])">File &gt;</button>
          <button id="prevHunk" title="Previous hunk (,)" disabled>Hunk &lt;</button>
          <button id="nextHunk" title="Next hunk (.)" disabled>Hunk &gt;</button>
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
        <button id="closeHelp" title="Close keyboard shortcuts">Close</button>
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
    const vscode = acquireVsCodeApi();
    const persistedState = vscode.getState() || {};
    const state = {
      branches: [],
      currentBranch: '',
      selectedBranch: persistedState.selectedBranch || '',
      mode: persistedState.mode || 'log',
      compareBaseBranch: '',
      compareBranch: '',
      commits: [],
      selectedCommit: persistedState.selectedCommit || '',
      files: [],
      selectedFile: persistedState.selectedFile || '',
      selectedCommitDetails: undefined,
      patch: '',
      diffView: persistedState.diffView || 'unified',
      collapsedHunks: [],
      error: '',
      loading: false,
      filesLoading: false,
      filesLoadingVisible: false,
      filesLoadingTimer: undefined,
      pendingFilesCommit: '',
      contextMenuType: '',
      currentHunkIndex: -1,
      activePane: persistedState.activePane || 'commits',
      branchSearch: persistedState.branchSearch || '',
      branchFilter: persistedState.branchFilter || 'all',
      commitSearch: persistedState.commitSearch || '',
      fileSearch: persistedState.fileSearch || '',
      fileFilter: persistedState.fileFilter || 'all',
      paneColumns: validWidths(persistedState.paneColumns, [180, 560, 280, 520], 4),
      commitColumns: validWidths(persistedState.commitColumns, [86, 74, 120, 142, 360], 5)
        .map((width, index) => Math.max(width, [54, 54, 72, 92, 160][index] || 80))
    };

    const layoutEl = document.querySelector('.layout');
    const branchesEl = document.getElementById('branches');
    const commitsEl = document.getElementById('commits');
    const filesEl = document.getElementById('files');
    const diffEl = document.getElementById('diff');
    const diffStatsEl = document.getElementById('diffStats');
    const detailsEl = document.getElementById('selectionDetails');
    const commitSummaryEl = document.getElementById('commitSummary');
    const branchSearchEl = document.getElementById('branchSearch');
    const commitSearchEl = document.getElementById('commitSearch');
    const fileSearchEl = document.getElementById('fileSearch');
    const titleEl = document.getElementById('title');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const contextMenuEl = document.getElementById('contextMenu');
    const helpOverlayEl = document.getElementById('helpOverlay');
    const paneEls = Array.from(document.querySelectorAll('[data-pane]'));

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('checkoutBranch').addEventListener('click', checkoutSelectedBranch);
    document.getElementById('branchActions').addEventListener('click', showSelectedBranchActions);
    document.getElementById('copyHash').addEventListener('click', copySelectedCommitHash);
    document.getElementById('commitActions').addEventListener('click', showSelectedCommitActions);
    document.getElementById('openFile').addEventListener('click', openSelectedFileAtRevision);
    document.getElementById('openWorkingFile').addEventListener('click', openSelectedWorkingFile);
    document.getElementById('openDiff').addEventListener('click', openSelectedFileDiff);
    document.getElementById('stageChange').addEventListener('click', stageSelectedChange);
    document.getElementById('unstageChange').addEventListener('click', unstageSelectedChange);
    document.getElementById('commitChanges').addEventListener('click', commitLocalChanges);
    document.getElementById('shelveChanges').addEventListener('click', shelveLocalChanges);
    document.getElementById('unshelveChanges').addEventListener('click', unshelveChanges);
    document.getElementById('showHelp').addEventListener('click', showHelp);
    document.getElementById('closeHelp').addEventListener('click', hideHelp);
    document.getElementById('resetLayout').addEventListener('click', () => vscode.postMessage({ type: 'resetLayout' }));
    document.getElementById('toggleDiffView').addEventListener('click', toggleDiffView);
    document.getElementById('prevFile').addEventListener('click', () => navigateFile(-1));
    document.getElementById('nextFile').addEventListener('click', () => navigateFile(1));
    document.getElementById('prevHunk').addEventListener('click', () => navigateHunk(-1));
    document.getElementById('nextHunk').addEventListener('click', () => navigateHunk(1));
    contextMenuEl.addEventListener('click', handleContextMenuClick);
    helpOverlayEl.addEventListener('click', (event) => {
      if (event.target === helpOverlayEl) hideHelp();
    });
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('scroll', hideContextMenu, true);
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
        focusSelected();
      });
    });
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = button.dataset.mode;
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
    });
    applyPaneColumns();

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'init') {
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
        state.selectedCommitDetails = undefined;
        state.patch = '';
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
        const restoredCommit = state.selectedCommit && state.commits.some((commit) => commit.hash === state.selectedCommit)
          ? state.selectedCommit
          : '';
        state.selectedCommit = restoredCommit;
        state.selectedFile = '';
        state.selectedCommitDetails = undefined;
        state.patch = '';
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
        state.commits = [];
        state.files = message.files || [];
        state.selectedCommit = '';
        const restoredFile = state.selectedFile && state.files.some((file) => fileKey(file) === state.selectedFile)
          ? state.selectedFile
          : '';
        state.selectedFile = restoredFile;
        state.selectedCommitDetails = undefined;
        state.patch = '';
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
        state.commits = [];
        state.files = message.files || [];
        state.selectedCommit = '';
        const restoredFile = state.selectedFile && state.files.some((file) => fileKey(file) === state.selectedFile)
          ? state.selectedFile
          : '';
        state.selectedFile = restoredFile;
        state.selectedCommitDetails = undefined;
        state.patch = '';
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
        state.patch = '';
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
      titleEl.textContent = state.selectedBranch ? 'SCM: ' + state.selectedBranch : 'SCM';
      loadingEl.textContent = state.loading ? 'Loading...' : '';
      errorEl.textContent = state.error || '';
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
      const diffViewButton = document.getElementById('toggleDiffView');
      diffViewButton.textContent = state.diffView === 'side' ? 'Unified' : 'Side';
      diffViewButton.classList.toggle('active', state.diffView === 'side');
      updateDiffNavigation();
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
      branchesEl.replaceChildren(...branches.map((branch) => {
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
      }));
    }

    function renderCommits() {
      if (state.mode === 'changes') {
        commitsEl.innerHTML = '<div class="empty">' + escapeHtml(localChangesSummary()) + '</div>';
        return;
      }
      if (state.mode === 'files') {
        const label = state.compareBaseBranch && state.compareBranch
          ? 'Changed files: ' + state.compareBaseBranch + '...' + state.compareBranch
          : 'Changed files mode';
        commitsEl.innerHTML = '<div class="empty">' + escapeHtml(label) + '</div>';
        return;
      }
      if (!state.commits.length) {
        commitsEl.innerHTML = '<div class="empty">' + escapeHtml(emptyCommitMessage()) + '</div>';
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
      const graphRows = buildGraphRows(commits);
      commitsEl.replaceChildren(header, ...commits.map((commit, index) => {
        const selected = commit.hash === state.selectedCommit;
        const row = selectableRow('commit-row row' + rowState('commits', selected), 'row', selected);
        applyCommitColumns(row);
        row.setAttribute('aria-rowindex', String(index + 2));
        row.title = commit.hash + '\\n' + commit.author;
        row.innerHTML = '<div class="graph" role="gridcell" aria-label="Commit graph">' + renderGraph(graphRows.get(commit.hash), selected) + '</div>' +
          '<div class="hash" role="gridcell">' + escapeHtml(commit.shortHash) + '</div>' +
          '<div class="author" role="gridcell">' + escapeHtml(commit.author) + '</div>' +
          '<div class="date" role="gridcell">' + escapeHtml(formatDate(commit.date)) + '</div>' +
          '<div class="subject" role="gridcell"><div class="subject-line">' + renderRefLabels(commit.refs) +
          '<span class="subject-text">' + escapeHtml(commit.subject) + '</span></div></div>';
        row.addEventListener('focus', () => setActivePane('commits', false));
        row.addEventListener('click', () => selectCommit(commit.hash));
        row.addEventListener('contextmenu', (event) => {
          selectCommit(commit.hash);
          showContextMenu(event, 'commit');
        });
        return row;
      }));
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
          '<div><div class="primary">' + escapeHtml(file.filePath) + '</div>' +
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

    function renderDiff() {
      if (!state.patch) {
        diffEl.innerHTML = '<div class="empty">Select a commit file to preview its diff.</div>';
        diffStatsEl.textContent = '';
        updateDiffNavigation();
        return;
      }
      const parsed = parsePatch(state.patch);
      const stats = patchStats(parsed);
      diffStatsEl.textContent = '+' + stats.added + ' -' + stats.deleted;
      diffEl.innerHTML = state.diffView === 'side' ? renderSideBySideDiff(parsed) : renderUnifiedDiff(parsed);
      diffEl.querySelectorAll('[data-hunk-index]').forEach((item) => {
        item.addEventListener('click', () => toggleCollapsedHunk(Number(item.getAttribute('data-hunk-index'))));
      });
      highlightCurrentHunk(false);
    }

    function parsePatch(patch) {
      const parsed = { meta: [], hunks: [] };
      let current = undefined;
      patch.split('\\n').forEach((line) => {
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
      const rows = parsed.meta
        .filter((line) => line)
        .map((line) => '<div class="diff-side-row meta">' + diffLine(line, 'line meta') + '</div>');
      parsed.hunks.forEach((hunk) => {
        rows.push('<div class="diff-side-row hunk">' + hunkHeader(hunk, 'line hunk') + '</div>');
        if (!hunkCollapsed(hunk.index)) {
          rows.push(...sideRows(hunk.lines));
        }
      });
      return '<div class="diff-side">' + rows.join('') + '</div>';
    }

    function sideRows(lines) {
      const rows = [];
      let deletes = [];
      let adds = [];
      const flush = () => {
        const count = Math.max(deletes.length, adds.length);
        for (let index = 0; index < count; index += 1) {
          rows.push(sideRow(deletes[index], adds[index]));
        }
        deletes = [];
        adds = [];
      };
      lines.forEach((line) => {
        if (isDeletedLine(line)) deletes.push(line);
        else if (isAddedLine(line)) adds.push(line);
        else {
          flush();
          rows.push(sideRow(line, line));
        }
      });
      flush();
      return rows;
    }

    function sideRow(left, right) {
      const leftClass = left && isDeletedLine(left) ? ' del' : '';
      const rightClass = right && isAddedLine(right) ? ' add' : '';
      return '<div class="diff-side-row">' +
        '<span class="diff-cell' + leftClass + '">' + sideCell(left, right) + '</span>' +
        '<span class="diff-cell' + rightClass + '">' + sideCell(right, left) + '</span>' +
        '</div>';
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
      let start = 0;
      while (start < value.length && start < compareValue.length && value[start] === compareValue[start]) {
        start += 1;
      }
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
      if (!value) return '';
      return '<div class="details-row"><div class="details-label">' + escapeHtml(label) + '</div><div class="details-value">' + escapeHtml(value) + '</div></div>';
    }

    function shortParents(value) {
      return String(value || '')
        .split(/\\s+/)
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
      const lines = body.split(/\\r?\\n/);
      if (lines[0] === commit.subject) {
        return lines.slice(1).join('\\n').trim();
      }
      return body;
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
      return [54, 54, 72, 92, 160][index] || 80;
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

    function buildGraphRows(commits) {
      const lanes = [];
      const rows = new Map();
      commits.forEach((commit) => {
        const parents = commitParents(commit);
        let before = lanes.slice();
        let lane = before.indexOf(commit.hash);
        const introduced = lane < 0;
        if (introduced) {
          lane = before.length;
          before.push(commit.hash);
        }

        const after = before.slice();
        const mergeLanes = [];
        if (parents.length) {
          after[lane] = parents[0];
          parents.slice(1).forEach((parent) => {
            const existing = after.indexOf(parent);
            if (existing >= 0) {
              mergeLanes.push(existing);
              return;
            }

            const inserted = mergeLanes.filter((item) => item > lane).length;
            const insertAt = lane + 1 + inserted;
            after.splice(insertAt, 0, parent);
            mergeLanes.push(insertAt);
          });
        } else {
          after.splice(lane, 1);
        }

        rows.set(commit.hash, {
          lane,
          laneCount: Math.max(before.length, after.length, lane + 1, ...mergeLanes.map((item) => item + 1)),
          colorIndex: lane,
          topLanes: before.map((_, index) => index).filter((index) => !introduced || index !== lane),
          bottomLanes: after.map((_, index) => index),
          mergeLanes
        });

        lanes.splice(0, lanes.length, ...after);
      });
      return rows;
    }

    function commitParents(commit) {
      if (Array.isArray(commit.parentHashes)) {
        return commit.parentHashes.filter(Boolean);
      }
      return String(commit.parents || '').split(/\\s+/).filter(Boolean);
    }

    function renderGraph(row, selected) {
      if (!row) return '';
      const spacing = 14;
      const margin = 8;
      const height = 24;
      const center = 12;
      const laneCount = Math.max(1, row.laneCount || 1);
      const width = Math.max(28, margin * 2 + (laneCount - 1) * spacing);
      const x = (lane) => margin + lane * spacing;
      const color = laneColor(row.colorIndex);
      const line = (lane, y1, y2) =>
        '<line class="graph-line" x1="' + x(lane) + '" y1="' + y1 + '" x2="' + x(lane) + '" y2="' + y2 + '" stroke="' + laneColor(lane) + '"/>';
      const diagonal = (lane) =>
        '<line class="graph-line" x1="' + x(row.lane) + '" y1="' + center + '" x2="' + x(lane) + '" y2="' + height + '" stroke="' + laneColor(lane) + '"/>';
      const topLines = row.topLanes.map((lane) => line(lane, 0, center)).join('');
      const bottomLines = row.bottomLanes.map((lane) => line(lane, center, height)).join('');
      const mergeLines = row.mergeLanes.map(diagonal).join('');
      const selectedRing = selected ? '<circle cx="' + x(row.lane) + '" cy="' + center + '" r="7.2" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.72"/>' : '';
      const node = selectedRing +
        '<circle class="graph-node" cx="' + x(row.lane) + '" cy="' + center + '" r="4.8" stroke="currentColor"/>' +
        '<circle class="graph-node-inner" cx="' + x(row.lane) + '" cy="' + center + '" r="2.1"/>';
      return '<svg class="graph-lanes" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" style="color: ' + color + '" aria-hidden="true">' +
        topLines + bottomLines + mergeLines + node + '</svg>';
    }

    function laneColor(index) {
      const colors = [
        'var(--vscode-gitDecoration-addedResourceForeground)',
        'var(--vscode-charts-blue)',
        'var(--vscode-charts-orange)',
        'var(--vscode-charts-purple)',
        'var(--vscode-charts-green)',
        'var(--vscode-charts-yellow)',
        'var(--vscode-charts-red)'
      ];
      return colors[Math.abs(index) % colors.length];
    }

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
      state.patch = '';
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
      state.patch = '';
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

    function toggleDiffView() {
      state.diffView = state.diffView === 'side' ? 'unified' : 'side';
      saveLayoutState();
      renderChrome();
      renderDiff();
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
        saveLayoutState();
        renderChrome();
        vscode.postMessage({ type: 'compareBranch', branch: branch.name });
      }
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
      return Array.from(diffEl.querySelectorAll('.line.hunk'));
    }

    function highlightCurrentHunk(scroll) {
      const hunks = hunkElements();
      hunks.forEach((item) => item.classList.remove('current-hunk'));
      if (!hunks.length) {
        state.currentHunkIndex = -1;
        updateDiffNavigation();
        return;
      }

      state.currentHunkIndex = Math.max(0, Math.min(hunks.length - 1, state.currentHunkIndex));
      const hunk = hunks[state.currentHunkIndex];
      hunk.classList.add('current-hunk');
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
        return [branch.name, branch.upstream, branch.hash, branch.subject]
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
        .map((item) => '<button role="menuitem" data-action="' + escapeHtml(item.action) + '"' + (item.disabled ? ' disabled' : '') + '>' + escapeHtml(item.label) + '</button>')
        .join('');
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

    function saveLayoutState() {
      vscode.setState({
        activePane: state.activePane,
        mode: state.mode,
        selectedBranch: state.selectedBranch,
        selectedCommit: state.selectedCommit,
        selectedFile: state.selectedFile,
        branchSearch: state.branchSearch,
        branchFilter: state.branchFilter,
        commitSearch: state.commitSearch,
        fileSearch: state.fileSearch,
        fileFilter: state.fileFilter,
        diffView: state.diffView,
        paneColumns: state.paneColumns,
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
      state.diffView = 'unified';
      state.collapsedHunks = [];
      state.currentHunkIndex = -1;
      setFilesLoading(false);
      state.paneColumns = [180, 560, 280, 520];
      state.commitColumns = [86, 74, 120, 142, 360];
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

function localChangeKey(change: GitChange): string {
  return `${change.bucket}:${change.filePath}`;
}
