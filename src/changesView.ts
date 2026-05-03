import * as path from 'path';
import * as vscode from 'vscode';
import { ChangelistManager, defaultChangelistName } from './changelists';
import { GitService } from './git';
import { ChangeBucket, changeLabel, GitChange } from './models';

type ChangeNodeType = ChangelistNode | ChangeGroupNode | ChangeItemNode | EmptyChangesNode;

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

  constructor(private readonly git: GitService, private readonly changelists: ChangelistManager) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: ChangeNodeType): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ChangeNodeType): Promise<ChangeNodeType[]> {
    const changes = await this.git.status();
    await this.changelists.cleanup(changes.map((change) => change.filePath));

    if (!element) {
      if (changes.length === 0) {
        const userCreated = this.changelists.userCreatedNames;
        return userCreated.length > 0 ? userCreated.map((name) => new ChangelistNode(name, [])) : [new EmptyChangesNode()];
      }

      const usedNames = new Set(changes.map((change) => this.changelists.changelistFor(change.filePath)));
      const visibleNames = new Set([defaultChangelistName, ...this.changelists.userCreatedNames, ...usedNames]);
      const names = this.changelists.names.filter((name) => visibleNames.has(name));
      return names.map((name) => new ChangelistNode(name, changes.filter((change) => this.changelists.changelistFor(change.filePath) === name)));
    }

    if (element instanceof ChangelistNode) {
      return bucketOrder
        .map((bucket) => new ChangeGroupNode(bucket, element.name, element.changes.filter((change) => change.bucket === bucket)))
        .filter((group) => group.changes.length > 0 || group.bucket === 'conflicts');
    }

    if (element instanceof ChangeGroupNode) {
      return element.changes.map((change) => new ChangeItemNode(change, element.changelistName));
    }

    return [];
  }
}

export class ChangelistNode extends vscode.TreeItem {
  constructor(readonly name: string, readonly changes: GitChange[]) {
    super(`${name} (${changes.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = name === defaultChangelistName ? 'changelist.default' : 'changelist.custom';
    this.iconPath = new vscode.ThemeIcon(name === defaultChangelistName ? 'list-tree' : 'folder');
  }
}

export class ChangeGroupNode extends vscode.TreeItem {
  constructor(readonly bucket: ChangeBucket, readonly changelistName: string, readonly changes: GitChange[]) {
    super(`${bucketTitles[bucket]} (${changes.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `changesGroup.${bucket}`;
    this.iconPath = new vscode.ThemeIcon(bucketIcons[bucket]);
  }
}

export class ChangeItemNode extends vscode.TreeItem {
  constructor(readonly change: GitChange, readonly changelistName: string) {
    super(path.basename(change.filePath), vscode.TreeItemCollapsibleState.None);
    const directory = path.dirname(change.filePath);
    this.description = directory === '.' ? changelistName : `${directory}  ${changelistName}`;
    this.tooltip = change.originalPath
      ? `${changeLabel(change)}: ${change.originalPath} -> ${change.filePath}`
      : `${changeLabel(change)}: ${change.filePath}`;
    this.contextValue = `change.${change.bucket}`;
    this.iconPath = new vscode.ThemeIcon(iconForChange(change));
    this.command = {
      command: 'abstractiveScm.openDiff',
      title: 'Show Diff',
      arguments: [this]
    };
  }
}

class EmptyChangesNode extends vscode.TreeItem {
  constructor() {
    super('No local changes', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'changes.empty';
    this.iconPath = new vscode.ThemeIcon('check');
  }
}

function iconForChange(change: GitChange): string {
  if (change.bucket === 'conflicts') {
    return 'warning';
  }

  if (change.x === '?' || change.x === 'A' || change.y === 'A') {
    return 'diff-added';
  }

  if (change.x === 'D' || change.y === 'D') {
    return 'diff-removed';
  }

  if (change.x === 'R' || change.y === 'R') {
    return 'diff-renamed';
  }

  return 'diff-modified';
}
