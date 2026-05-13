import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionLog } from './extensionLog';
import { RefreshCoordinator } from './refreshCoordinator';
import { registerRepositoryCommands, RepositoryCommandController } from './repositoryCommands';
import { statusBarText, statusBarTooltip } from './statusBar';
import { BranchItemNode, BranchesProvider } from '../branchesView';
import { ChangeNodeType, ChangelistNode, ChangeGroupNode, ChangeItemNode, ChangesProvider } from '../changesView';
import { ChangelistManager, defaultChangelistName } from '../changelists';
import { showBranchComparison } from '../compareView';
import { GitError, GitService, RepositoryManager } from '../git';
import { GitContentProvider, gitContentScheme, gitContentUri } from '../gitContentProvider';
import { GitToolWindowProvider } from '../webviews/scmPanel/ScmPanelProvider';
import { CommitNode, LogProvider, showCommitDetails, showLogWebview } from '../logView';
import { ChangeBucket, GitChange, GitCommit, GitCommitFile, GitResourceState } from '../models';
import { AbstractiveScmProvider } from '../scmProvider';
import { StashesProvider, StashNode } from '../stashesView';
import { RepositoryStateService } from '../git/RepositoryState';
import { assertNoUnresolvedConflicts, assertPushReady } from '../git/safety';

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

export class AbstractiveScmController implements vscode.Disposable, RepositoryCommandController {
  private readonly scmProviders = new Map<string, AbstractiveScmProvider>();
  private readonly changelistManagers = new Map<string, ChangelistManager>();
  private readonly changes: ChangesProvider;
  private readonly changesTree: vscode.TreeView<ChangeNodeType>;
  private readonly branches: BranchesProvider;
  private readonly log: LogProvider;
  private readonly stashes: StashesProvider;
  private readonly toolWindow: GitToolWindowProvider;
  private readonly statusBar: vscode.StatusBarItem;
  private repositoryState: RepositoryStateService;
  private readonly logOutput = new ExtensionLog();
  private readonly disposables: vscode.Disposable[] = [];
  private refreshGeneration = 0;

  private get git(): GitService {
    return this.repositories.activeRepository;
  }

  private get scm(): AbstractiveScmProvider | undefined {
    return this.scmProviders.get(this.git.root);
  }

  private get activeChangelists(): ChangelistManager {
    return this.changelistsFor(this.git);
  }

  constructor(private readonly context: vscode.ExtensionContext, private readonly repositories: RepositoryManager) {
    const config = vscode.workspace.getConfiguration('abstractiveScm');
    if (config.get<boolean>('enableSourceControlProvider', false)) {
      for (const repository of repositories.repositories) {
        const scm = new AbstractiveScmProvider(repository);
        this.scmProviders.set(repository.root, scm);
      }
    }
    const sidePanelTreeView = context.workspaceState.get<boolean>(sidePanelTreeViewKey, false);
    this.changes = new ChangesProvider(repositories, (repository) => this.changelistsFor(repository), sidePanelTreeView);
    this.changesTree = vscode.window.createTreeView('abstractiveScm.changes', { treeDataProvider: this.changes });
    this.branches = new BranchesProvider(() => this.git, sidePanelTreeView);
    this.log = new LogProvider(() => this.git);
    this.stashes = new StashesProvider(() => this.git);
    this.toolWindow = new GitToolWindowProvider(context, repositories);
    this.repositoryState = new RepositoryStateService(this.git);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.command = 'abstractiveScm.openToolWindow';

    this.disposables.push(
      repositories,
      this.statusBar,
      this.logOutput,
      vscode.workspace.registerTextDocumentContentProvider(gitContentScheme, new GitContentProvider(repositories)),
      this.changesTree,
      vscode.window.registerTreeDataProvider('abstractiveScm.branches', this.branches),
      vscode.window.registerTreeDataProvider('abstractiveScm.log', this.log),
      vscode.window.registerTreeDataProvider('abstractiveScm.stashes', this.stashes),
      vscode.window.registerWebviewViewProvider(GitToolWindowProvider.viewType, this.toolWindow),
      ...registerRepositoryCommands(this)
    );

    for (const scm of this.scmProviders.values()) {
      this.disposables.push(scm);
    }

    if (vscode.workspace.getConfiguration('abstractiveScm').get<boolean>('autoRefresh', true)) {
      for (const repository of repositories.repositories) {
        this.disposables.push(new RefreshCoordinator(repository.root, () => this.refresh()));
      }
    }

    this.disposables.push(repositories.onDidChangeActiveRepository(() => {
      this.repositoryState = new RepositoryStateService(this.git);
      void this.refresh();
    }));
  }

  async refresh(): Promise<void> {
    const generation = ++this.refreshGeneration;
    await this.handleGitErrors(async () => {
      await Promise.all(Array.from(this.scmProviders.values()).map((provider) => provider.refresh()));
      this.changes.refresh();
      this.branches.refresh();
      this.log.refresh();
      this.stashes.refresh();
      this.toolWindow.refresh();
      const limit = vscode.workspace.getConfiguration('abstractiveScm').get<number>('maxLogEntries', 75);
      const state = await this.repositoryState.snapshot(limit);
      if (generation !== this.refreshGeneration) {
        return;
      }
      const branch = state.branchStatus;
      const changes = state.changes;
      const workspaceChangeCount = await this.workspaceChangeCount();
      this.changesTree.badge = workspaceChangeCount
        ? { value: workspaceChangeCount, tooltip: `${workspaceChangeCount} local change${workspaceChangeCount === 1 ? '' : 's'} across workspace repositories` }
        : undefined;
      this.statusBar.text = statusBarText(changes, branch.ahead, branch.behind, path.basename(this.git.root));
      this.statusBar.tooltip = statusBarTooltip(this.git.root, branch.branch, changes, branch.ahead, branch.behind);
      this.statusBar.show();
    });
  }

  async refreshAll(): Promise<void> {
    await this.refresh();
  }

  async fetchAll(): Promise<void> {
    await this.handleGitErrors(async () => {
      const failures: string[] = [];
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Abstractive SCM: Fetch all repositories' },
        async () => {
          for (const repository of this.repositories.repositories) {
            try {
              await repository.fetch();
            } catch (error) {
              failures.push(`${path.basename(repository.root)}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      );
      await this.refresh();
      if (failures.length > 0) {
        vscode.window.showErrorMessage(`Fetch failed for ${failures.length} repositor${failures.length === 1 ? 'y' : 'ies'}. See Abstractive SCM log.`);
        failures.forEach((failure) => this.logOutput.error(failure));
      } else {
        vscode.window.showInformationMessage(`Fetched ${this.repositories.repositories.length} repositor${this.repositories.repositories.length === 1 ? 'y' : 'ies'}.`);
      }
    });
  }

  async switchRepository(): Promise<void> {
    const repository = await this.repositories.switchRepository();
    if (repository) {
      vscode.window.showInformationMessage(`Abstractive SCM active repository: ${path.basename(repository.root)}`);
      await this.refresh();
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async activateRepository(arg?: unknown): Promise<GitService> {
    return this.repositories.resolveRepository(arg);
  }

  private changelistsFor(repository: GitService): ChangelistManager {
    const existing = this.changelistManagers.get(repository.root);
    if (existing) {
      return existing;
    }

    const scope = this.repositories.hasMultipleRepositories ? repository.root : undefined;
    const manager = new ChangelistManager(this.context.workspaceState, scope);
    this.changelistManagers.set(repository.root, manager);
    return manager;
  }

  private async workspaceChangeCount(): Promise<number> {
    const counts = await Promise.all(this.repositories.repositories.map(async (repository) => {
      try {
        return (await repository.status()).length;
      } catch {
        return 0;
      }
    }));
    return counts.reduce((total, count) => total + count, 0);
  }

  async toggleTreeView(): Promise<void> {
    const next = !this.context.workspaceState.get<boolean>(sidePanelTreeViewKey, false);
    await this.context.workspaceState.update(sidePanelTreeViewKey, next);
    this.changes.setTreeView(next);
    this.branches.setTreeView(next);
    vscode.window.showInformationMessage(`Abstractive SCM side panels now use ${next ? 'tree' : 'flat'} view.`);
  }

  async stage(arg?: ChangeArgument): Promise<void> {
    await this.activateRepository(arg);
    await this.withChange(arg, (change) => this.git.stage(change.filePath));
  }

  async stageAll(): Promise<void> {
    await this.activateRepository();
    await this.runAndRefresh('Stage all', () => this.git.stageAll());
  }

  async unstage(arg?: ChangeArgument): Promise<void> {
    await this.activateRepository(arg);
    await this.withChange(arg, (change) => this.git.unstage(change.filePath));
  }

  async unstageAll(): Promise<void> {
    await this.activateRepository();
    await this.runAndRefresh('Unstage all', () => this.git.unstageAll());
  }

  async fetch(): Promise<void> {
    await this.activateRepository();
    await this.runAndRefresh('Fetch', () => this.git.fetch());
  }

  async openToolWindow(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.abstractiveScmPanel');
  }

  async showLog(): Promise<void> {
    await this.activateRepository();
    await showLogWebview(this.context, this.git);
  }

  async showCommitDetails(node: CommitNode): Promise<void> {
    await this.activateRepository(node);
    await showCommitDetails(node.commit);
  }

  private async withChange(arg: ChangeArgument | undefined, action: (change: GitChange) => Promise<void>): Promise<void> {
    const change = this.changeFromArgument(arg);
    if (!change) {
      vscode.window.showWarningMessage('Choose a changed file first.');
      return;
    }

    await this.runAndRefresh('Git action', () => action(change));
  }

  async stageGroup(arg?: ChangeGroupArgument): Promise<void> {
    await this.activateRepository(arg);
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

  async unstageGroup(arg?: ChangeGroupArgument): Promise<void> {
    await this.activateRepository(arg);
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

  async rollback(arg?: ChangeArgument): Promise<void> {
    await this.activateRepository(arg);
    const change = this.changeFromArgument(arg);
    if (!change) {
      vscode.window.showWarningMessage('Choose a changed file first.');
      return;
    }

    const hasStagedAndUnstaged = change.bucket === 'staged'
      && (await this.git.status()).some((other) => other.filePath === change.filePath && other.bucket === 'unstaged');
    const warning = hasStagedAndUnstaged
      ? `Rollback staged and unstaged changes in ${change.filePath}?`
      : `Rollback changes in ${change.filePath}?`;
    const answer = await vscode.window.showWarningMessage(
      warning,
      { modal: true },
      'Rollback'
    );
    if (answer !== 'Rollback') {
      return;
    }

    await this.runAndRefresh('Rollback', () => this.git.rollback(change));
  }

  async commit(amend: boolean): Promise<void> {
    await this.activateRepository();
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

  async checkoutBranch(node?: BranchItemNode): Promise<void> {
    await this.activateRepository(node);
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

    await this.runAndRefresh('Checkout', async () => {
      await assertNoUnresolvedConflicts(this.git, 'checking out another branch');
      await (remote ? this.git.checkoutRemote(branch) : this.git.checkout(branch));
    });
  }

  async createBranch(): Promise<void> {
    await this.activateRepository();
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

  async pullRebase(): Promise<void> {
    await this.activateRepository();
    await this.runAndRefresh('Pull with rebase', async () => {
      await assertNoUnresolvedConflicts(this.git, 'pulling with rebase');
      await this.git.pullRebase();
    });
  }

  async push(): Promise<void> {
    await this.activateRepository();
    await this.runAndRefresh('Push', async () => {
      await assertPushReady(this.git);
      await this.git.push();
    });
  }

  async deleteBranch(node?: BranchItemNode): Promise<void> {
    await this.activateRepository(node);
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

  async compareWithBranch(node?: BranchItemNode): Promise<void> {
    await this.activateRepository(node);
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

  async stashChanges(): Promise<void> {
    await this.activateRepository();
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

  async applyStash(node: StashNode | undefined, removeAfterApply: boolean): Promise<void> {
    await this.activateRepository(node);
    const stash = await this.pickStash(node);
    if (!stash) {
      return;
    }

    await this.runAndRefresh(removeAfterApply ? 'Unshelve and remove' : 'Unshelve', () =>
      removeAfterApply ? this.git.stashPop(stash.stash.ref) : this.git.stashApply(stash.stash.ref)
    );
  }

  async dropStash(node?: StashNode): Promise<void> {
    await this.activateRepository(node);
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

    return pick ? new StashNode(this.git, { ...pick.stash, repoRoot: this.git.root }) : undefined;
  }

  async showCommitFiles(node?: CommitNode): Promise<void> {
    await this.activateRepository(node);
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

  async copyCommitHash(node?: CommitNode): Promise<void> {
    await this.activateRepository(node);
    const commit = node?.commit ?? (await this.pickCommit('Copy Commit Hash'));
    if (!commit) {
      return;
    }

    await vscode.env.clipboard.writeText(commit.hash);
    vscode.window.showInformationMessage(`Copied ${commit.shortHash}`);
  }

  async showFileHistory(arg?: ChangeArgument | vscode.Uri): Promise<void> {
    await this.activateRepository(arg);
    const filePath = this.filePathFromArgument(arg);
    if (!filePath) {
      vscode.window.showWarningMessage('Choose a file inside the Git repository first.');
      return;
    }

    await this.handleGitErrors(async () => {
      await this.toolWindow.showFileHistory(filePath);
    });
  }

  async createChangelist(): Promise<void> {
    await this.activateRepository();
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
        if (this.activeChangelists.names.includes(trimmed)) {
          return 'Changelist already exists';
        }
        return undefined;
      }
    });

    if (!name) {
      return;
    }

    await this.activeChangelists.create(name.trim());
    this.changes.refresh();
  }

  async moveToChangelist(arg?: ChangeArgument): Promise<void> {
    await this.activateRepository(arg);
    const change = this.changeFromArgument(arg);
    if (!change) {
      vscode.window.showWarningMessage('Choose a changed file first.');
      return;
    }

    const createNew = '__create_new__';
    const pick = await vscode.window.showQuickPick(
      [
        ...this.activeChangelists.names.map((name) => ({
          label: name,
          description: name === this.activeChangelists.changelistFor(change.filePath) ? 'current' : undefined,
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

    await this.activeChangelists.assign(change.filePath, target);
    this.changes.refresh();
  }

  async deleteChangelist(arg?: ChangelistArgument): Promise<void> {
    await this.activateRepository(arg);
    let name = arg?.name;
    if (!name) {
      const pick = await vscode.window.showQuickPick(
        this.activeChangelists.names
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

    await this.activeChangelists.delete(name);
    this.changes.refresh();
  }

  async openDiff(arg?: ChangeArgument): Promise<void> {
    await this.activateRepository(arg);
    const change = this.changeFromArgument(arg);
    if (!change) {
      vscode.window.showWarningMessage('Choose a changed file first.');
      return;
    }

    const title = `${path.basename(change.filePath)} (${changeBucketTitles[change.bucket]})`;
    const right = change.bucket === 'staged' ? gitContentUri('index', change.filePath, this.git.root) : this.git.toWorkspaceUri(change.filePath);
    const left =
      change.bucket === 'untracked' || change.x === 'A'
        ? gitContentUri('empty', change.filePath, this.git.root)
        : gitContentUri('HEAD', change.originalPath ?? change.filePath, this.git.root);

    await vscode.commands.executeCommand('vscode.diff', left, right, title);
  }

  async openFile(arg?: ChangeArgument): Promise<void> {
    await this.activateRepository(arg);
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
    const left = file.status.startsWith('A') ? gitContentUri('empty', file.filePath, this.git.root) : gitContentUri(parentRef, leftPath, this.git.root);
    const right = file.status.startsWith('D') ? gitContentUri('empty', file.filePath, this.git.root) : gitContentUri(commit.hash, file.filePath, this.git.root);
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
      this.logOutput.info(label);
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
      this.logOutput.error(message || 'Git command failed');
      vscode.window.showErrorMessage(message || 'Git command failed');
    }
  }
}
