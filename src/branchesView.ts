import * as vscode from 'vscode';
import { GitService } from './git';
import { GitBranch } from './models';

export class BranchesProvider implements vscode.TreeDataProvider<BranchNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BranchNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly git: GitService, private treeView: boolean) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  setTreeView(treeView: boolean): void {
    this.treeView = treeView;
    this.refresh();
  }

  getTreeItem(element: BranchNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BranchNode): Promise<BranchNode[]> {
    const branches = await this.git.branches();

    if (!element) {
      return [
        new BranchGroupNode('Local', branches.filter((branch) => !branch.remote)),
        new BranchGroupNode('Remote', branches.filter((branch) => branch.remote))
      ];
    }

    if (element instanceof BranchGroupNode) {
      return this.treeView
        ? branchFolderChildren(element.branches, [])
        : element.branches.map((branch) => new BranchItemNode(branch));
    }

    if (element instanceof BranchFolderNode) {
      return branchFolderChildren(element.branches, element.parts);
    }

    return [];
  }
}

export type BranchNode = BranchGroupNode | BranchFolderNode | BranchItemNode;

export class BranchGroupNode extends vscode.TreeItem {
  constructor(readonly name: string, readonly branches: GitBranch[]) {
    super(`${name} (${branches.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'branchGroup';
    this.iconPath = new vscode.ThemeIcon(name === 'Local' ? 'repo' : 'cloud');
  }
}

export class BranchItemNode extends vscode.TreeItem {
  constructor(readonly branch: GitBranch, label = branch.name, nested = false) {
    super(branch.current ? `${label}  \u2713` : label, vscode.TreeItemCollapsibleState.None);
    this.description = branch.upstream ?? branch.hash;
    this.tooltip = branch.subject ? `${branch.name}: ${branch.subject}` : branch.name;
    this.contextValue = branch.remote ? 'remoteBranch' : 'branch';
    this.iconPath = new vscode.ThemeIcon(branch.current ? 'check' : nested ? 'git-commit' : 'git-branch');
    this.command = {
      command: 'abstractiveScm.checkoutBranch',
      title: 'Checkout Branch',
      arguments: [this]
    };
  }
}

export class BranchFolderNode extends vscode.TreeItem {
  constructor(readonly name: string, readonly parts: string[], readonly branches: GitBranch[]) {
    super(`${name} (${branches.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'branchFolder';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

function branchFolderChildren(branches: GitBranch[], parentParts: string[]): BranchNode[] {
  const folders = new Map<string, GitBranch[]>();
  const leaves: GitBranch[] = [];
  const depth = parentParts.length;

  for (const branch of branches) {
    const parts = branch.name.split('/').filter(Boolean);
    const next = parts[depth];
    if (!next || parts.length === depth + 1) {
      leaves.push(branch);
      continue;
    }

    const bucket = folders.get(next) ?? [];
    bucket.push(branch);
    folders.set(next, bucket);
  }

  return [
    ...Array.from(folders.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, folderBranches]) => new BranchFolderNode(name, [...parentParts, name], folderBranches)),
    ...leaves
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((branch) => new BranchItemNode(branch, branchLabel(branch, depth), depth > 0))
  ];
}

function branchLabel(branch: GitBranch, depth: number): string {
  const parts = branch.name.split('/').filter(Boolean);
  return parts.slice(depth).join('/') || branch.name;
}
