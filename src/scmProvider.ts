import * as path from 'path';
import * as vscode from 'vscode';
import { GitService } from './git';
import { gitContentUri } from './gitContentProvider';
import { ChangeBucket, changeLabel, GitChange, GitResourceState } from './models';

type ResourceGroupMap = Record<ChangeBucket, vscode.SourceControlResourceGroup>;

const bucketTitles: Record<ChangeBucket, string> = {
  staged: 'Staged',
  unstaged: 'Unstaged',
  untracked: 'Untracked',
  conflicts: 'Conflicts'
};

export class AbstractiveScmProvider implements vscode.Disposable {
  readonly sourceControl: vscode.SourceControl;

  private readonly groups: ResourceGroupMap;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly git: GitService) {
    this.sourceControl = vscode.scm.createSourceControl('abstractiveGit', 'Abstractive Git', git.rootUri);
    this.sourceControl.inputBox.placeholder = 'Commit message';
    this.sourceControl.acceptInputCommand = { command: 'abstractiveGit.commit', title: 'Commit' };

    this.groups = {
      conflicts: this.sourceControl.createResourceGroup('abstractiveGit.conflicts', bucketTitles.conflicts),
      staged: this.sourceControl.createResourceGroup('abstractiveGit.staged', bucketTitles.staged),
      unstaged: this.sourceControl.createResourceGroup('abstractiveGit.unstaged', bucketTitles.unstaged),
      untracked: this.sourceControl.createResourceGroup('abstractiveGit.untracked', bucketTitles.untracked)
    };

    this.disposables.push(
      this.sourceControl,
      this.groups.conflicts,
      this.groups.staged,
      this.groups.unstaged,
      this.groups.untracked
    );
  }

  async refresh(): Promise<void> {
    const [changes, branch] = await Promise.all([this.git.status(), this.git.branchStatus()]);
    const buckets: Record<ChangeBucket, GitResourceState[]> = {
      staged: [],
      unstaged: [],
      untracked: [],
      conflicts: []
    };

    for (const change of changes) {
      buckets[change.bucket].push(this.toResourceState(change));
    }

    for (const bucket of Object.keys(buckets) as ChangeBucket[]) {
      this.groups[bucket].resourceStates = buckets[bucket];
      this.groups[bucket].hideWhenEmpty = bucket !== 'conflicts';
    }

    const summary = Object.values(buckets).reduce((total, states) => total + states.length, 0);
    this.sourceControl.count = summary;
    this.sourceControl.statusBarCommands = [
      {
        command: 'abstractiveGit.checkoutBranch',
        title: `$(git-branch) ${branch.branch}`,
        tooltip: branch.upstream ? `${branch.branch} tracks ${branch.upstream}` : branch.branch
      },
      {
        command: 'abstractiveGit.pullRebase',
        title: branch.behind ? `$(arrow-down) ${branch.behind}` : '$(arrow-down) Pull',
        tooltip: 'Pull with rebase'
      },
      {
        command: 'abstractiveGit.push',
        title: branch.ahead ? `$(arrow-up) ${branch.ahead}` : '$(arrow-up) Push',
        tooltip: 'Push'
      }
    ];
  }

  async openDiff(state: GitResourceState): Promise<void> {
    const change = state.change;
    const title = `${path.basename(change.filePath)} (${bucketTitles[change.bucket]})`;
    const right =
      change.bucket === 'staged'
        ? gitContentUri('index', change.filePath)
        : this.git.toWorkspaceUri(change.filePath);

    let left = gitContentUri('HEAD', change.originalPath ?? change.filePath);
    if (change.bucket === 'untracked' || change.x === 'A') {
      left = gitContentUri('empty', change.filePath);
    }

    await vscode.commands.executeCommand('vscode.diff', left, right, title);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private toResourceState(change: GitChange): GitResourceState {
    const resourceUri = this.git.toWorkspaceUri(change.filePath);
    const label = changeLabel(change);

    const commandState = { resourceUri, change, bucket: change.bucket } as GitResourceState;

    return {
      resourceUri,
      change,
      bucket: change.bucket,
      contextValue: change.bucket,
      command: {
        command: 'abstractiveGit.openDiff',
        title: 'Show Diff',
        arguments: [commandState]
      },
      decorations: {
        strikeThrough: change.x === 'D' || change.y === 'D',
        tooltip: change.originalPath ? `${label}: ${change.originalPath} -> ${change.filePath}` : label,
        faded: change.bucket === 'untracked'
      }
    };
  }
}
