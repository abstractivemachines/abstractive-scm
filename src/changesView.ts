import * as path from 'path';
import * as vscode from 'vscode';
import { ChangelistManager, defaultChangelistName } from './changelists';
import { GitService } from './git';
import { ChangeBucket, changeLabel, GitChange } from './models';

export type ChangeNodeType = ChangelistNode | ChangeGroupNode | ChangeFolderNode | ChangeItemNode | EmptyChangesNode;

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

  constructor(private readonly git: GitService, private readonly changelists: ChangelistManager, private treeView: boolean) {}

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
      return this.treeView
        ? folderChildren(element.changes, element.changelistName, [], this.git)
        : element.changes.map((change) => new ChangeItemNode(change, element.changelistName, this.git.toWorkspaceUri(change.filePath)));
    }

    if (element instanceof ChangeFolderNode) {
      return folderChildren(element.changes, element.changelistName, element.parts, this.git);
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
  constructor(readonly change: GitChange, readonly changelistName: string, resourceUri: vscode.Uri) {
    super(path.posix.basename(change.filePath), vscode.TreeItemCollapsibleState.None);
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
  constructor(readonly name: string, readonly changelistName: string, readonly parts: string[], readonly changes: GitChange[]) {
    super(`${name} (${changes.length})`, vscode.TreeItemCollapsibleState.Expanded);
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

function folderChildren(changes: GitChange[], changelistName: string, parentParts: string[], git?: GitService): ChangeNodeType[] {
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
      .map(([name, folderChanges]) => new ChangeFolderNode(name, changelistName, [...parentParts, name], folderChanges)),
    ...files
      .sort((left, right) => left.filePath.localeCompare(right.filePath))
      .map((change) => new ChangeItemNode(change, changelistName, git?.toWorkspaceUri(change.filePath) ?? vscode.Uri.file(change.filePath)))
  ];
}
