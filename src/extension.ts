import * as path from 'path';
import * as vscode from 'vscode';
import { BranchItemNode, BranchesProvider } from './branchesView';
import { ChangeNodeType, ChangelistNode, ChangeGroupNode, ChangeItemNode, ChangesProvider } from './changesView';
import { ChangelistManager, defaultChangelistName } from './changelists';
import { showBranchComparison } from './compareView';
import { GitError, GitService } from './git';
import { GitContentProvider, gitContentScheme, gitContentUri } from './gitContentProvider';
import { GitToolWindowProvider } from './gitToolWindow';
import { CommitNode, LogProvider, showCommitDetails, showLogWebview } from './logView';
import { ChangeBucket, GitChange, GitCommit, GitCommitFile, GitResourceState } from './models';
import { AbstractiveScmProvider } from './scmProvider';
import { StashesProvider, StashNode } from './stashesView';

let controller: AbstractiveScmController | undefined;

type ChangeArgument = ChangeItemNode | GitResourceState;
type ChangelistArgument = ChangelistNode;
type ChangeGroupArgument = ChangeGroupNode;

const sidePanelTreeViewKey = 'abstractiveScm.sidePanelTreeView';

const changeBucketTitles: Record<ChangeBucket, string> = {
  conflicts: 'Conflicts',
  staged: 'Staged',
  unstaged: 'Unstaged',
  untracked: 'Untracked'
};

function statusBarText(changes: GitChange[], ahead: number, behind: number): string {
  const conflicts = changes.filter((change) => change.bucket === 'conflicts').length;
  const state = [
    conflicts ? `!${conflicts}` : '',
    changes.length ? String(changes.length) : '',
    ahead ? `↑${ahead}` : '',
    behind ? `↓${behind}` : ''
  ].filter(Boolean).join(' ');
  return `$(window) SCM${state ? ` ${state}` : ''}`;
}

function statusBarTooltip(repoName: string, branch: string, changes: GitChange[], ahead: number, behind: number): vscode.MarkdownString {
  const conflicts = changes.filter((change) => change.bucket === 'conflicts').length;
  const staged = changes.filter((change) => change.bucket === 'staged').length;
  const unstaged = changes.filter((change) => change.bucket === 'unstaged').length;
  const untracked = changes.filter((change) => change.bucket === 'untracked').length;
  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.isTrusted = true;
  tooltip.appendMarkdown('**Open Abstractive SCM Panel**');
  tooltip.appendMarkdown(`\n\nRepository: \`${repoName}\``);
  tooltip.appendMarkdown(`\n\nBranch: \`${branch}\``);
  tooltip.appendMarkdown(`\n\nLocal changes: ${changes.length}`);
  if (conflicts) tooltip.appendMarkdown(`\n\nConflicts: ${conflicts}`);
  if (staged) tooltip.appendMarkdown(`\n\nStaged: ${staged}`);
  if (unstaged) tooltip.appendMarkdown(`\n\nUnstaged: ${unstaged}`);
  if (untracked) tooltip.appendMarkdown(`\n\nUntracked: ${untracked}`);
  if (ahead || behind) tooltip.appendMarkdown(`\n\nSync: ${ahead ? `↑${ahead}` : ''}${ahead && behind ? ' ' : ''}${behind ? `↓${behind}` : ''}`);
  return tooltip;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const git = await GitService.discover();
  if (!git) {
    registerNoRepositoryCommands(context);
    return;
  }

  controller = new AbstractiveScmController(context, git);
  context.subscriptions.push(controller);
  await controller.refresh();
}

export function deactivate(): void {
  controller?.dispose();
}

class AbstractiveScmController implements vscode.Disposable {
  private readonly scm: AbstractiveScmProvider | undefined;
  private readonly changelists: ChangelistManager;
  private readonly changes: ChangesProvider;
  private readonly changesTree: vscode.TreeView<ChangeNodeType>;
  private readonly branches: BranchesProvider;
  private readonly log: LogProvider;
  private readonly stashes: StashesProvider;
  private readonly toolWindow: GitToolWindowProvider;
  private readonly statusBar: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly git: GitService) {
    const config = vscode.workspace.getConfiguration('abstractiveScm');
    this.scm = config.get<boolean>('enableSourceControlProvider', false) ? new AbstractiveScmProvider(git) : undefined;
    this.changelists = new ChangelistManager(context.workspaceState);
    const sidePanelTreeView = context.workspaceState.get<boolean>(sidePanelTreeViewKey, false);
    this.changes = new ChangesProvider(git, this.changelists, sidePanelTreeView);
    this.changesTree = vscode.window.createTreeView('abstractiveScm.changes', { treeDataProvider: this.changes });
    this.branches = new BranchesProvider(git, sidePanelTreeView);
    this.log = new LogProvider(git);
    this.stashes = new StashesProvider(git);
    this.toolWindow = new GitToolWindowProvider(context, git);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.command = 'abstractiveScm.openToolWindow';

    this.disposables.push(
      this.statusBar,
      vscode.workspace.registerTextDocumentContentProvider(gitContentScheme, new GitContentProvider(git)),
      this.changesTree,
      vscode.window.registerTreeDataProvider('abstractiveScm.branches', this.branches),
      vscode.window.registerTreeDataProvider('abstractiveScm.log', this.log),
      vscode.window.registerTreeDataProvider('abstractiveScm.stashes', this.stashes),
      vscode.window.registerWebviewViewProvider(GitToolWindowProvider.viewType, this.toolWindow),
      vscode.commands.registerCommand('abstractiveScm.refresh', () => this.refresh()),
      vscode.commands.registerCommand('abstractiveScm.toggleTreeView', () => this.toggleTreeView()),
      vscode.commands.registerCommand('abstractiveScm.stage', (arg?: ChangeArgument) => this.withChange(arg, (change) => this.git.stage(change.filePath))),
      vscode.commands.registerCommand('abstractiveScm.stageGroup', (arg?: ChangeGroupArgument) => this.stageGroup(arg)),
      vscode.commands.registerCommand('abstractiveScm.stageAll', () => this.runAndRefresh('Stage all', () => this.git.stageAll())),
      vscode.commands.registerCommand('abstractiveScm.unstage', (arg?: ChangeArgument) => this.withChange(arg, (change) => this.git.unstage(change.filePath))),
      vscode.commands.registerCommand('abstractiveScm.unstageGroup', (arg?: ChangeGroupArgument) => this.unstageGroup(arg)),
      vscode.commands.registerCommand('abstractiveScm.unstageAll', () => this.runAndRefresh('Unstage all', () => this.git.unstageAll())),
      vscode.commands.registerCommand('abstractiveScm.revert', (arg?: ChangeArgument) => this.rollback(arg)),
      vscode.commands.registerCommand('abstractiveScm.commit', () => this.commit(false)),
      vscode.commands.registerCommand('abstractiveScm.amendCommit', () => this.commit(true)),
      vscode.commands.registerCommand('abstractiveScm.fetch', () => this.runAndRefresh('Fetch', () => this.git.fetch())),
      vscode.commands.registerCommand('abstractiveScm.pullRebase', () => this.runAndRefresh('Pull with rebase', () => this.git.pullRebase())),
      vscode.commands.registerCommand('abstractiveScm.push', () => this.runAndRefresh('Push', () => this.git.push())),
      vscode.commands.registerCommand('abstractiveScm.checkoutBranch', (node?: BranchItemNode) => this.checkoutBranch(node)),
      vscode.commands.registerCommand('abstractiveScm.createBranch', () => this.createBranch()),
      vscode.commands.registerCommand('abstractiveScm.deleteBranch', (node?: BranchItemNode) => this.deleteBranch(node)),
      vscode.commands.registerCommand('abstractiveScm.compareWithBranch', (node?: BranchItemNode) => this.compareWithBranch(node)),
      vscode.commands.registerCommand('abstractiveScm.stashChanges', () => this.stashChanges()),
      vscode.commands.registerCommand('abstractiveScm.applyStash', (node?: StashNode) => this.applyStash(node, false)),
      vscode.commands.registerCommand('abstractiveScm.popStash', (node?: StashNode) => this.applyStash(node, true)),
      vscode.commands.registerCommand('abstractiveScm.dropStash', (node?: StashNode) => this.dropStash(node)),
      vscode.commands.registerCommand('abstractiveScm.openToolWindow', () => vscode.commands.executeCommand('workbench.view.extension.abstractiveScmPanel')),
      vscode.commands.registerCommand('abstractiveScm.showLog', () => showLogWebview(this.context, this.git)),
      vscode.commands.registerCommand('abstractiveScm.showCommitDetails', (node: CommitNode) => showCommitDetails(node.commit)),
      vscode.commands.registerCommand('abstractiveScm.showCommitFiles', (node?: CommitNode) => this.showCommitFiles(node)),
      vscode.commands.registerCommand('abstractiveScm.copyCommitHash', (node?: CommitNode) => this.copyCommitHash(node)),
      vscode.commands.registerCommand('abstractiveScm.showFileHistory', (arg?: ChangeArgument | vscode.Uri) => this.showFileHistory(arg)),
      vscode.commands.registerCommand('abstractiveScm.createChangelist', () => this.createChangelist()),
      vscode.commands.registerCommand('abstractiveScm.moveToChangelist', (arg?: ChangeArgument) => this.moveToChangelist(arg)),
      vscode.commands.registerCommand('abstractiveScm.deleteChangelist', (arg?: ChangelistArgument) => this.deleteChangelist(arg)),
      vscode.commands.registerCommand('abstractiveScm.openDiff', (arg?: ChangeArgument) => this.openDiff(arg)),
      vscode.commands.registerCommand('abstractiveScm.openFile', (arg?: ChangeArgument) => this.openFile(arg))
    );

    if (this.scm) {
      this.disposables.push(this.scm);
    }

    if (vscode.workspace.getConfiguration('abstractiveScm').get<boolean>('autoRefresh', true)) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(git.root, '**/*'));
      const gitWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(git.root, '.git/{HEAD,index,packed-refs,refs/**}'));
      this.disposables.push(
        watcher,
        gitWatcher,
        watcher.onDidCreate(() => this.scheduleRefresh()),
        watcher.onDidChange(() => this.scheduleRefresh()),
        watcher.onDidDelete(() => this.scheduleRefresh()),
        gitWatcher.onDidCreate(() => this.scheduleRefresh()),
        gitWatcher.onDidChange(() => this.scheduleRefresh()),
        gitWatcher.onDidDelete(() => this.scheduleRefresh())
      );
    }
  }

  async refresh(): Promise<void> {
    await this.handleGitErrors(async () => {
      await this.scm?.refresh();
      this.changes.refresh();
      this.branches.refresh();
      this.log.refresh();
      this.stashes.refresh();
      this.toolWindow.refresh();
      const branch = await this.git.branchStatus();
      const changes = await this.git.status();
      this.changesTree.badge = changes.length
        ? { value: changes.length, tooltip: `${changes.length} local change${changes.length === 1 ? '' : 's'}` }
        : undefined;
      this.statusBar.text = statusBarText(changes, branch.ahead, branch.behind);
      this.statusBar.tooltip = statusBarTooltip(path.basename(this.git.root), branch.branch, changes, branch.ahead, branch.behind);
      this.statusBar.show();
    });
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => void this.refresh(), 300);
  }

  private async toggleTreeView(): Promise<void> {
    const next = !this.context.workspaceState.get<boolean>(sidePanelTreeViewKey, false);
    await this.context.workspaceState.update(sidePanelTreeViewKey, next);
    this.changes.setTreeView(next);
    this.branches.setTreeView(next);
    vscode.window.showInformationMessage(`Abstractive SCM side panels now use ${next ? 'tree' : 'flat'} view.`);
  }

  private async withChange(arg: ChangeArgument | undefined, action: (change: GitChange) => Promise<void>): Promise<void> {
    const change = this.changeFromArgument(arg);
    if (!change) {
      vscode.window.showWarningMessage('Choose a changed file first.');
      return;
    }

    await this.runAndRefresh('Git action', () => action(change));
  }

  private async stageGroup(arg?: ChangeGroupArgument): Promise<void> {
    if (!arg || arg.changes.length === 0) {
      vscode.window.showWarningMessage('Choose a change group first.');
      return;
    }

    await this.runAndRefresh(`Stage ${arg.label}`, async () => {
      for (const change of arg.changes) {
        await this.git.stage(change.filePath);
      }
    });
  }

  private async unstageGroup(arg?: ChangeGroupArgument): Promise<void> {
    if (!arg || arg.changes.length === 0) {
      vscode.window.showWarningMessage('Choose a change group first.');
      return;
    }

    await this.runAndRefresh(`Unstage ${arg.label}`, async () => {
      for (const change of arg.changes) {
        await this.git.unstage(change.filePath);
      }
    });
  }

  private async rollback(arg?: ChangeArgument): Promise<void> {
    const change = this.changeFromArgument(arg);
    if (!change) {
      vscode.window.showWarningMessage('Choose a changed file first.');
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `Rollback changes in ${change.filePath}?`,
      { modal: true },
      'Rollback'
    );
    if (answer !== 'Rollback') {
      return;
    }

    await this.runAndRefresh('Rollback', () => this.git.rollback(change));
  }

  private async commit(amend: boolean): Promise<void> {
    const existing = this.scm?.sourceControl.inputBox.value.trim() ?? '';
    const message =
      existing ||
      (await vscode.window.showInputBox({
        title: amend ? 'Amend Commit' : 'Commit',
        prompt: 'Commit message',
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() ? undefined : 'Commit message is required')
      }));

    if (!message) {
      return;
    }

    const signoff = vscode.workspace.getConfiguration('abstractiveScm').get<boolean>('commitSignoff', false);
    await this.runAndRefresh(amend ? 'Amend commit' : 'Commit', () => this.git.commit(message, amend, signoff));
    if (this.scm) {
      this.scm.sourceControl.inputBox.value = '';
    }
  }

  private async checkoutBranch(node?: BranchItemNode): Promise<void> {
    let branch = node?.branch.name;
    let remote = node?.branch.remote ?? false;
    if (!branch) {
      const branches = await this.git.branches();
      const pick = await vscode.window.showQuickPick(
        branches.map((item) => ({
          label: item.current ? `$(check) ${item.name}` : item.name,
          description: item.remote ? 'remote' : item.upstream,
          detail: item.subject,
          branch: item.name,
          remote: item.remote
        })),
        { title: 'Checkout Branch', placeHolder: 'Select a branch' }
      );
      branch = pick?.branch;
      remote = pick?.remote ?? false;
    }

    if (!branch) {
      return;
    }

    await this.runAndRefresh('Checkout', () => (remote ? this.git.checkoutRemote(branch) : this.git.checkout(branch)));
  }

  private async createBranch(): Promise<void> {
    const branch = await vscode.window.showInputBox({
      title: 'New Branch',
      prompt: 'Branch name',
      ignoreFocusOut: true,
      validateInput: (value) => (/^\S+$/.test(value) ? undefined : 'Branch name cannot contain spaces')
    });
    if (!branch) {
      return;
    }

    await this.runAndRefresh('Create branch', () => this.git.createBranch(branch));
  }

  private async deleteBranch(node?: BranchItemNode): Promise<void> {
    let branch = node?.branch.name;
    if (!branch) {
      const branches = (await this.git.branches()).filter((item) => !item.current && !item.remote);
      const pick = await vscode.window.showQuickPick(
        branches.map((item) => ({ label: item.name, detail: item.subject, branch: item.name })),
        { title: 'Delete Branch', placeHolder: 'Select a local branch' }
      );
      branch = pick?.branch;
    }

    if (!branch) {
      return;
    }

    const answer = await vscode.window.showWarningMessage(`Delete local branch ${branch}?`, { modal: true }, 'Delete', 'Force Delete');
    if (!answer) {
      return;
    }

    await this.runAndRefresh('Delete branch', () => this.git.deleteBranch(branch, answer === 'Force Delete'));
  }

  private async compareWithBranch(node?: BranchItemNode): Promise<void> {
    let branch = node?.branch.name;
    if (!branch) {
      const branches = (await this.git.branches()).filter((item) => !item.current);
      const pick = await vscode.window.showQuickPick(
        branches.map((item) => ({
          label: item.name,
          description: item.remote ? 'remote' : item.upstream,
          detail: item.subject,
          branch: item.name
        })),
        { title: 'Compare With Current Branch', placeHolder: 'Select a branch' }
      );
      branch = pick?.branch;
    }

    if (!branch) {
      return;
    }

    await this.handleGitErrors(() => showBranchComparison(this.context, this.git, branch));
  }

  private async stashChanges(): Promise<void> {
    const changes = await this.git.status();
    if (changes.length === 0) {
      vscode.window.showInformationMessage('There are no local changes to shelve.');
      return;
    }

    const message = await vscode.window.showInputBox({
      title: 'Shelve Changes',
      prompt: 'Shelf name',
      value: `WIP on ${(await this.git.branchStatus()).branch}`,
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

    await this.runAndRefresh('Shelve changes', () => this.git.stashPush(message, includeUntracked));
  }

  private async applyStash(node: StashNode | undefined, removeAfterApply: boolean): Promise<void> {
    const stash = await this.pickStash(node);
    if (!stash) {
      return;
    }

    await this.runAndRefresh(removeAfterApply ? 'Unshelve and remove' : 'Unshelve', () =>
      removeAfterApply ? this.git.stashPop(stash.stash.ref) : this.git.stashApply(stash.stash.ref)
    );
  }

  private async dropStash(node?: StashNode): Promise<void> {
    const stash = await this.pickStash(node);
    if (!stash) {
      return;
    }

    const answer = await vscode.window.showWarningMessage(`Delete shelf ${stash.stash.ref}?`, { modal: true }, 'Delete');
    if (answer !== 'Delete') {
      return;
    }

    await this.runAndRefresh('Delete shelf', () => this.git.stashDrop(stash.stash.ref));
  }

  private async pickStash(node?: StashNode): Promise<StashNode | undefined> {
    if (node) {
      return node;
    }

    const stashes = await this.git.stashes();
    const pick = await vscode.window.showQuickPick(
      stashes.map((stash) => ({
        label: stash.message || stash.ref,
        description: `${stash.ref} ${stash.age}`.trim(),
        detail: stash.shortHash,
        stash
      })),
      { title: 'Shelves', placeHolder: 'Select a shelf' }
    );

    return pick ? new StashNode(pick.stash) : undefined;
  }

  private async showCommitFiles(node?: CommitNode): Promise<void> {
    const commit = node?.commit ?? (await this.pickCommit('Show Changed Files'));
    if (!commit) {
      return;
    }

    await this.handleGitErrors(async () => {
      const files = await this.git.commitFiles(commit.hash);
      if (files.length === 0) {
        vscode.window.showInformationMessage('This commit has no changed files.');
        return;
      }

      const pick = await vscode.window.showQuickPick(
        files.map((file) => ({
          label: file.filePath,
          description: file.status,
          detail: file.originalPath ? `renamed from ${file.originalPath}` : commit.subject,
          file
        })),
        { title: `${commit.shortHash} Changed Files`, placeHolder: 'Open a diff for a file' }
      );

      if (pick) {
        await this.openCommitFileDiff(commit, pick.file);
      }
    });
  }

  private async copyCommitHash(node?: CommitNode): Promise<void> {
    const commit = node?.commit ?? (await this.pickCommit('Copy Commit Hash'));
    if (!commit) {
      return;
    }

    await vscode.env.clipboard.writeText(commit.hash);
    vscode.window.showInformationMessage(`Copied ${commit.shortHash}`);
  }

  private async showFileHistory(arg?: ChangeArgument | vscode.Uri): Promise<void> {
    const filePath = this.filePathFromArgument(arg);
    if (!filePath) {
      vscode.window.showWarningMessage('Choose a file inside the Git repository first.');
      return;
    }

    await this.handleGitErrors(async () => {
      await this.toolWindow.showFileHistory(filePath);
    });
  }

  private async createChangelist(): Promise<void> {
    const name = await vscode.window.showInputBox({
      title: 'New Changelist',
      prompt: 'Changelist name',
      ignoreFocusOut: true,
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return 'Changelist name is required';
        }
        if (trimmed === defaultChangelistName) {
          return 'Default already exists';
        }
        if (this.changelists.names.includes(trimmed)) {
          return 'Changelist already exists';
        }
        return undefined;
      }
    });

    if (!name) {
      return;
    }

    await this.changelists.create(name.trim());
    this.changes.refresh();
  }

  private async moveToChangelist(arg?: ChangeArgument): Promise<void> {
    const change = this.changeFromArgument(arg);
    if (!change) {
      vscode.window.showWarningMessage('Choose a changed file first.');
      return;
    }

    const createNew = '__create_new__';
    const pick = await vscode.window.showQuickPick(
      [
        ...this.changelists.names.map((name) => ({
          label: name,
          description: name === this.changelists.changelistFor(change.filePath) ? 'current' : undefined,
          name
        })),
        { label: 'New Changelist...', description: undefined, name: createNew }
      ],
      { title: 'Move to Changelist', placeHolder: change.filePath }
    );

    if (!pick) {
      return;
    }

    let target = pick.name;
    if (target === createNew) {
      const name = await vscode.window.showInputBox({
        title: 'New Changelist',
        prompt: 'Changelist name',
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() ? undefined : 'Changelist name is required')
      });
      if (!name) {
        return;
      }
      target = name.trim();
    }

    await this.changelists.assign(change.filePath, target);
    this.changes.refresh();
  }

  private async deleteChangelist(arg?: ChangelistArgument): Promise<void> {
    let name = arg?.name;
    if (!name) {
      const pick = await vscode.window.showQuickPick(
        this.changelists.names
          .filter((item) => item !== defaultChangelistName)
          .map((item) => ({ label: item, name: item })),
        { title: 'Delete Changelist', placeHolder: 'Select a changelist' }
      );
      name = pick?.name;
    }

    if (!name || name === defaultChangelistName) {
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `Delete changelist ${name}? Files will move back to Default.`,
      { modal: true },
      'Delete'
    );
    if (answer !== 'Delete') {
      return;
    }

    await this.changelists.delete(name);
    this.changes.refresh();
  }

  private async openDiff(arg?: ChangeArgument): Promise<void> {
    const change = this.changeFromArgument(arg);
    if (!change) {
      vscode.window.showWarningMessage('Choose a changed file first.');
      return;
    }

    const title = `${path.basename(change.filePath)} (${changeBucketTitles[change.bucket]})`;
    const right = change.bucket === 'staged' ? gitContentUri('index', change.filePath) : this.git.toWorkspaceUri(change.filePath);
    const left =
      change.bucket === 'untracked' || change.x === 'A'
        ? gitContentUri('empty', change.filePath)
        : gitContentUri('HEAD', change.originalPath ?? change.filePath);

    await vscode.commands.executeCommand('vscode.diff', left, right, title);
  }

  private async openFile(arg?: ChangeArgument): Promise<void> {
    const change = this.changeFromArgument(arg);
    if (!change) {
      vscode.window.showWarningMessage('Choose a changed file first.');
      return;
    }
    await vscode.window.showTextDocument(this.git.toWorkspaceUri(change.filePath));
  }

  private changeFromArgument(arg?: ChangeArgument): GitChange | undefined {
    return arg?.change;
  }

  private async pickCommit(title: string): Promise<GitCommit | undefined> {
    const limit = vscode.workspace.getConfiguration('abstractiveScm').get<number>('maxLogEntries', 75);
    const commits = await this.git.log(limit);
    const pick = await vscode.window.showQuickPick(
      commits.map((commit) => ({
        label: `${commit.shortHash} ${commit.subject}`,
        description: commit.refs || commit.author,
        detail: new Date(commit.date).toLocaleString(),
        commit
      })),
      { title, placeHolder: 'Select a commit' }
    );

    return pick?.commit;
  }

  private async openCommitFileDiff(commit: GitCommit, file: GitCommitFile): Promise<void> {
    const parentRef = `${commit.hash}^`;
    const leftPath = file.originalPath ?? file.filePath;
    const left = file.status.startsWith('A') ? gitContentUri('empty', file.filePath) : gitContentUri(parentRef, leftPath);
    const right = file.status.startsWith('D') ? gitContentUri('empty', file.filePath) : gitContentUri(commit.hash, file.filePath);
    await vscode.commands.executeCommand('vscode.diff', left, right, `${file.filePath} (${commit.shortHash})`);
  }

  private filePathFromArgument(arg?: ChangeArgument | vscode.Uri): string | undefined {
    const change = this.changeFromArgument(arg as ChangeArgument | undefined);
    if (change) {
      return change.filePath;
    }

    const uri = arg && 'fsPath' in arg ? (arg as vscode.Uri) : vscode.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== 'file') {
      return undefined;
    }

    const relative = path.relative(this.git.root, uri.fsPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return undefined;
    }

    return relative.split(path.sep).join('/');
  }

  private async runAndRefresh(label: string, action: () => Promise<void>): Promise<void> {
    await this.handleGitErrors(async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Abstractive SCM: ${label}` },
        action
      );
      await this.refresh();
    });
  }

  private async handleGitErrors(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const message = error instanceof GitError ? error.message.trim() : error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(message || 'Git command failed');
    }
  }
}

function registerNoRepositoryCommands(context: vscode.ExtensionContext): void {
  const showMessage = (): void => {
    vscode.window.showInformationMessage('Abstractive SCM needs an open Git repository.');
  };

  for (const command of [
    'abstractiveScm.refresh',
    'abstractiveScm.toggleTreeView',
    'abstractiveScm.stage',
    'abstractiveScm.stageGroup',
    'abstractiveScm.stageAll',
    'abstractiveScm.unstage',
    'abstractiveScm.unstageGroup',
    'abstractiveScm.unstageAll',
    'abstractiveScm.revert',
    'abstractiveScm.commit',
    'abstractiveScm.amendCommit',
    'abstractiveScm.fetch',
    'abstractiveScm.pullRebase',
    'abstractiveScm.push',
    'abstractiveScm.checkoutBranch',
    'abstractiveScm.createBranch',
    'abstractiveScm.deleteBranch',
    'abstractiveScm.compareWithBranch',
    'abstractiveScm.stashChanges',
    'abstractiveScm.applyStash',
    'abstractiveScm.popStash',
    'abstractiveScm.dropStash',
    'abstractiveScm.openToolWindow',
    'abstractiveScm.showLog',
    'abstractiveScm.showCommitFiles',
    'abstractiveScm.copyCommitHash',
    'abstractiveScm.showFileHistory',
    'abstractiveScm.createChangelist',
    'abstractiveScm.moveToChangelist',
    'abstractiveScm.deleteChangelist',
    'abstractiveScm.openDiff',
    'abstractiveScm.openFile'
  ]) {
    context.subscriptions.push(vscode.commands.registerCommand(command, showMessage));
  }
}
