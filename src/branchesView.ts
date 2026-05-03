import * as vscode from 'vscode';
import { GitService } from './git';
import { GitBranch } from './models';

export class BranchesProvider implements vscode.TreeDataProvider<BranchNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BranchNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly git: GitService) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
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
      return element.branches.map((branch) => new BranchItemNode(branch));
    }

    return [];
  }
}

export type BranchNode = BranchGroupNode | BranchItemNode;

export class BranchGroupNode extends vscode.TreeItem {
  constructor(readonly name: string, readonly branches: GitBranch[]) {
    super(`${name} (${branches.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'branchGroup';
    this.iconPath = new vscode.ThemeIcon(name === 'Local' ? 'repo' : 'cloud');
  }
}

export class BranchItemNode extends vscode.TreeItem {
  constructor(readonly branch: GitBranch) {
    super(branch.current ? `${branch.name}  \u2713` : branch.name, vscode.TreeItemCollapsibleState.None);
    this.description = branch.upstream ?? branch.hash;
    this.tooltip = branch.subject || branch.name;
    this.contextValue = branch.remote ? 'remoteBranch' : 'branch';
    this.iconPath = new vscode.ThemeIcon(branch.current ? 'check' : 'git-branch');
    this.command = {
      command: 'abstractiveScm.checkoutBranch',
      title: 'Checkout Branch',
      arguments: [this]
    };
  }
}

