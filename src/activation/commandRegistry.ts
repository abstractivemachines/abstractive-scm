import * as vscode from 'vscode';

export const abstractiveScmCommandIds = [
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
] as const;

export type AbstractiveScmCommandId = typeof abstractiveScmCommandIds[number];

export function registerNoRepositoryCommands(context: vscode.ExtensionContext): void {
  const showMessage = (): void => {
    vscode.window.showInformationMessage('Abstractive SCM needs an open Git repository.');
  };

  for (const command of abstractiveScmCommandIds) {
    context.subscriptions.push(vscode.commands.registerCommand(command, showMessage));
  }
}
