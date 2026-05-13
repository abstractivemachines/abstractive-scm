import * as path from 'path';
import * as vscode from 'vscode';
import { ChangelistManager, defaultChangelistName } from './changelists';
import { GitService, RepositoryManager } from './git';
import { BranchStatus, ChangeBucket, changeLabel, GitChange } from './models';

export type ChangeNodeType = RepositoryNode | ChangelistNode | ChangeGroupNode | ChangeFolderNode | ChangeItemNode | EmptyChangesNode;

const bucketOrder: ChangeBucket[] = ['conflicts', 'staged', 'unstaged', 'untracked'];

const bucketTitles: Record<ChangeBucket, string> = {
  conflicts: 'Conflicts',
  staged: 'Staged',
  unstaged: 'Unstaged',
  untracked: 'Untracked'
};

const bucketIcons: Record<ChangeBucket, string> = {
  conflicts: 'warning',
  staged: 'check',
  unstaged: 'diff-modified',
  untracked: 'diff-added'
};

export class ChangesProvider implements vscode.TreeDataProvider<ChangeNodeType> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ChangeNodeType | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly repositories: RepositoryManager,
    private readonly changelistsFor: (repository: GitService) => ChangelistManager,
    private treeView: boolean
  ) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  setTreeView(treeView: boolean): void {
    this.treeView = treeView;
    this.refresh();
  }

  getTreeItem(element: ChangeNodeType): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ChangeNodeType): Promise<ChangeNodeType[]> {
    if (!element) {
      if (this.repositories.hasMultipleRepositories) {
        const nodes = await Promise.all(this.repositories.repositories.map((repository) => this.repositoryNode(repository)));
        const dirty = nodes.filter((node): node is RepositoryNode => Boolean(node));
        return dirty.length > 0 ? dirty : [new EmptyChangesNode()];
      }

      const repository = this.repositories.activeRepository;
      const changes = await this.repoChanges(repository);
      return this.changelistNodes(repository, changes);
    }

    if (element instanceof RepositoryNode) {
      this.repositories.setActiveRepository(element.repository);
      return this.changelistNodes(element.repository, element.changes);
    }

    if (element instanceof ChangelistNode) {
      return bucketOrder
        .map((bucket) => new ChangeGroupNode(element.repository, bucket, element.name, element.changes.filter((change) => change.bucket === bucket)))
        .filter((group) => group.changes.length > 0);
    }

    if (element instanceof ChangeGroupNode) {
      return this.treeView
        ? folderChildren(element.changes, element.changelistName, [], element.repository)
        : element.changes.map((change) => new ChangeItemNode(element.repository, change, element.changelistName, element.repository.toWorkspaceUri(change.filePath)));
    }

    if (element instanceof ChangeFolderNode) {
      return folderChildren(element.changes, element.changelistName, element.parts, element.repository);
    }

    return [];
  }

  private async repositoryNode(repository: GitService): Promise<RepositoryNode | undefined> {
    const [changes, branchStatus] = await Promise.all([this.repoChanges(repository), repository.branchStatus().catch(() => undefined)]);
    if (changes.length === 0) {
      return undefined;
    }

    return new RepositoryNode(repository, changes, branchStatus, this.repositories.hasMultipleRepositories);
  }

  private async repoChanges(repository: GitService): Promise<GitChange[]> {
    const changes = (await repository.status()).map((change) => ({ ...change, repoRoot: repository.root }));
    await this.changelistsFor(repository).cleanup(changes.map((change) => change.filePath));
    return changes;
  }

  private changelistNodes(repository: GitService, changes: GitChange[]): ChangeNodeType[] {
    const changelists = this.changelistsFor(repository);
    if (changes.length === 0) {
      const userCreated = changelists.userCreatedNames;
      return userCreated.length > 0
        ? userCreated.map((name) => new ChangelistNode(repository, name, []))
        : [new EmptyChangesNode()];
    }

    const usedNames = new Set(changes.map((change) => changelists.changelistFor(change.filePath)));
    const visibleNames = new Set([defaultChangelistName, ...changelists.userCreatedNames, ...usedNames]);
    const names = changelists.names.filter((name) => visibleNames.has(name));
    return names.map((name) =>
      new ChangelistNode(repository, name, changes.filter((change) => changelists.changelistFor(change.filePath) === name))
    );
  }
}

export class RepositoryNode extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly repository: GitService, readonly changes: GitChange[], branchStatus: BranchStatus | undefined, collapsed: boolean) {
    const changeText = `${changes.length} change${changes.length === 1 ? '' : 's'}`;
    super(path.basename(repository.root), collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    this.repoRoot = repository.root;
    this.description = [branchStatus?.branch, changeText].filter(Boolean).join('  ');
    this.tooltip = `${repository.root}\n${this.description}`;
    this.contextValue = 'repository';
    this.iconPath = new vscode.ThemeIcon('repo');
  }
}

export class ChangelistNode extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly repository: GitService, readonly name: string, readonly changes: GitChange[]) {
    super(`${name} (${changes.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.repoRoot = repository.root;
    this.contextValue = name === defaultChangelistName ? 'changelist.default' : 'changelist.custom';
    this.iconPath = new vscode.ThemeIcon(name === defaultChangelistName ? 'list-tree' : 'folder');
  }
}

export class ChangeGroupNode extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly repository: GitService, readonly bucket: ChangeBucket, readonly changelistName: string, readonly changes: GitChange[]) {
    super(`${bucketTitles[bucket]} (${changes.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.repoRoot = repository.root;
    this.contextValue = `changesGroup.${bucket}`;
    this.iconPath = new vscode.ThemeIcon(bucketIcons[bucket]);
  }
}

export class ChangeItemNode extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly repository: GitService, readonly change: GitChange, readonly changelistName: string, resourceUri: vscode.Uri) {
    super(path.posix.basename(change.filePath), vscode.TreeItemCollapsibleState.None);
    this.repoRoot = repository.root;
    const directory = path.posix.dirname(change.filePath);
    this.description = directory === '.' ? changelistName : `${directory}  ${changelistName}`;
    this.resourceUri = resourceUri;
    this.tooltip = change.originalPath
      ? `${changeLabel(change)}: ${change.originalPath} -> ${change.filePath}`
      : `${changeLabel(change)}: ${change.filePath}`;
    this.contextValue = `change.${change.bucket}`;
    this.command = {
      command: 'abstractiveScm.openDiff',
      title: 'Show Diff',
      arguments: [this]
    };
  }
}

export class ChangeFolderNode extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly repository: GitService, readonly name: string, readonly changelistName: string, readonly parts: string[], readonly changes: GitChange[]) {
    super(`${name} (${changes.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.repoRoot = repository.root;
    this.contextValue = 'changeFolder';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

class EmptyChangesNode extends vscode.TreeItem {
  constructor() {
    super('No local changes', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'changes.empty';
    this.iconPath = new vscode.ThemeIcon('check');
  }
}

function folderChildren(changes: GitChange[], changelistName: string, parentParts: string[], git: GitService): ChangeNodeType[] {
  const folders = new Map<string, GitChange[]>();
  const files: GitChange[] = [];
  const depth = parentParts.length;

  for (const change of changes) {
    const parts = change.filePath.split('/').filter(Boolean);
    const next = parts[depth];
    if (!next) {
      files.push(change);
      continue;
    }

    if (parts.length === depth + 1) {
      files.push(change);
      continue;
    }

    const bucket = folders.get(next) ?? [];
    bucket.push(change);
    folders.set(next, bucket);
  }

  return [
    ...Array.from(folders.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, folderChanges]) => new ChangeFolderNode(git, name, changelistName, [...parentParts, name], folderChanges)),
    ...files
      .sort((left, right) => left.filePath.localeCompare(right.filePath))
      .map((change) => new ChangeItemNode(git, change, changelistName, git.toWorkspaceUri(change.filePath)))
  ];
}
