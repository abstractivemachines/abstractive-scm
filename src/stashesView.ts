import * as vscode from 'vscode';
import { GitService } from './git';
import { GitStash } from './models';

export class StashesProvider implements vscode.TreeDataProvider<StashNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<StashNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly git: () => GitService) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: StashNode): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<StashNode[]> {
    const git = this.git();
    const stashes = await git.stashes();
    return stashes.map((stash) => new StashNode(git, { ...stash, repoRoot: git.root }));
  }
}

export class StashNode extends vscode.TreeItem {
  readonly repoRoot: string;

  constructor(readonly repository: GitService, readonly stash: GitStash) {
    super(stash.message || stash.ref, vscode.TreeItemCollapsibleState.None);
    this.repoRoot = repository.root;
    this.description = `${stash.ref} ${stash.age}`.trim();
    this.tooltip = `${stash.ref}\n${stash.shortHash}\n${stash.message}`;
    this.contextValue = 'stash';
    this.iconPath = new vscode.ThemeIcon('archive');
  }
}
