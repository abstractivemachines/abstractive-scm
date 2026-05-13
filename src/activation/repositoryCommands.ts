import * as vscode from 'vscode';
import { BranchItemNode } from '../branchesView';
import { ChangeGroupNode, ChangeItemNode, ChangelistNode } from '../changesView';
import { GitResourceState } from '../models';
import { CommitNode } from '../logView';
import { StashNode } from '../stashesView';

export interface RepositoryCommandController {
  refresh(): Promise<void>;
  refreshAll(): Promise<void>;
  fetchAll(): Promise<void>;
  switchRepository(): Promise<void>;
  toggleTreeView(): Promise<void>;
  stage(arg?: ChangeItemNode | GitResourceState): Promise<void>;
  stageGroup(arg?: ChangeGroupNode): Promise<void>;
  stageAll(): Promise<void>;
  unstage(arg?: ChangeItemNode | GitResourceState): Promise<void>;
  unstageGroup(arg?: ChangeGroupNode): Promise<void>;
  unstageAll(): Promise<void>;
  rollback(arg?: ChangeItemNode | GitResourceState): Promise<void>;
  commit(amend: boolean): Promise<void>;
  fetch(): Promise<void>;
  pullRebase(): Promise<void>;
  push(): Promise<void>;
  checkoutBranch(node?: BranchItemNode): Promise<void>;
  createBranch(): Promise<void>;
  deleteBranch(node?: BranchItemNode): Promise<void>;
  compareWithBranch(node?: BranchItemNode): Promise<void>;
  stashChanges(): Promise<void>;
  applyStash(node: StashNode | undefined, removeAfterApply: boolean): Promise<void>;
  dropStash(node?: StashNode): Promise<void>;
  openToolWindow(): Promise<void>;
  showLog(): Promise<void>;
  showCommitDetails(node: CommitNode): Promise<void>;
  showCommitFiles(node?: CommitNode): Promise<void>;
  copyCommitHash(node?: CommitNode): Promise<void>;
  showFileHistory(arg?: ChangeItemNode | GitResourceState | vscode.Uri): Promise<void>;
  createChangelist(): Promise<void>;
  moveToChangelist(arg?: ChangeItemNode | GitResourceState): Promise<void>;
  deleteChangelist(arg?: ChangelistNode): Promise<void>;
  openDiff(arg?: ChangeItemNode | GitResourceState): Promise<void>;
  openFile(arg?: ChangeItemNode | GitResourceState): Promise<void>;
}

export function registerRepositoryCommands(controller: RepositoryCommandController): vscode.Disposable[] {
  return [
    ...registerChangeCommands(controller),
    ...registerBranchCommands(controller),
    ...registerStashCommands(controller),
    ...registerCommitCommands(controller),
    ...registerChangelistCommands(controller),
    vscode.commands.registerCommand('abstractiveScm.refresh', () => controller.refresh()),
    vscode.commands.registerCommand('abstractiveScm.refreshAll', () => controller.refreshAll()),
    vscode.commands.registerCommand('abstractiveScm.fetchAll', () => controller.fetchAll()),
    vscode.commands.registerCommand('abstractiveScm.switchRepository', () => controller.switchRepository()),
    vscode.commands.registerCommand('abstractiveScm.toggleTreeView', () => controller.toggleTreeView()),
    vscode.commands.registerCommand('abstractiveScm.openToolWindow', () => controller.openToolWindow()),
    vscode.commands.registerCommand('abstractiveScm.showFileHistory', (arg?: ChangeItemNode | GitResourceState | vscode.Uri) => controller.showFileHistory(arg))
  ];
}

function registerChangeCommands(controller: RepositoryCommandController): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('abstractiveScm.stage', (arg?: ChangeItemNode | GitResourceState) => controller.stage(arg)),
    vscode.commands.registerCommand('abstractiveScm.stageGroup', (arg?: ChangeGroupNode) => controller.stageGroup(arg)),
    vscode.commands.registerCommand('abstractiveScm.stageAll', () => controller.stageAll()),
    vscode.commands.registerCommand('abstractiveScm.unstage', (arg?: ChangeItemNode | GitResourceState) => controller.unstage(arg)),
    vscode.commands.registerCommand('abstractiveScm.unstageGroup', (arg?: ChangeGroupNode) => controller.unstageGroup(arg)),
    vscode.commands.registerCommand('abstractiveScm.unstageAll', () => controller.unstageAll()),
    vscode.commands.registerCommand('abstractiveScm.revert', (arg?: ChangeItemNode | GitResourceState) => controller.rollback(arg)),
    vscode.commands.registerCommand('abstractiveScm.openDiff', (arg?: ChangeItemNode | GitResourceState) => controller.openDiff(arg)),
    vscode.commands.registerCommand('abstractiveScm.openFile', (arg?: ChangeItemNode | GitResourceState) => controller.openFile(arg))
  ];
}

function registerBranchCommands(controller: RepositoryCommandController): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('abstractiveScm.fetch', () => controller.fetch()),
    vscode.commands.registerCommand('abstractiveScm.pullRebase', () => controller.pullRebase()),
    vscode.commands.registerCommand('abstractiveScm.push', () => controller.push()),
    vscode.commands.registerCommand('abstractiveScm.checkoutBranch', (node?: BranchItemNode) => controller.checkoutBranch(node)),
    vscode.commands.registerCommand('abstractiveScm.createBranch', () => controller.createBranch()),
    vscode.commands.registerCommand('abstractiveScm.deleteBranch', (node?: BranchItemNode) => controller.deleteBranch(node)),
    vscode.commands.registerCommand('abstractiveScm.compareWithBranch', (node?: BranchItemNode) => controller.compareWithBranch(node))
  ];
}

function registerStashCommands(controller: RepositoryCommandController): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('abstractiveScm.stashChanges', () => controller.stashChanges()),
    vscode.commands.registerCommand('abstractiveScm.applyStash', (node?: StashNode) => controller.applyStash(node, false)),
    vscode.commands.registerCommand('abstractiveScm.popStash', (node?: StashNode) => controller.applyStash(node, true)),
    vscode.commands.registerCommand('abstractiveScm.dropStash', (node?: StashNode) => controller.dropStash(node))
  ];
}

function registerCommitCommands(controller: RepositoryCommandController): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('abstractiveScm.commit', () => controller.commit(false)),
    vscode.commands.registerCommand('abstractiveScm.amendCommit', () => controller.commit(true)),
    vscode.commands.registerCommand('abstractiveScm.showLog', () => controller.showLog()),
    vscode.commands.registerCommand('abstractiveScm.showCommitDetails', (node: CommitNode) => controller.showCommitDetails(node)),
    vscode.commands.registerCommand('abstractiveScm.showCommitFiles', (node?: CommitNode) => controller.showCommitFiles(node)),
    vscode.commands.registerCommand('abstractiveScm.copyCommitHash', (node?: CommitNode) => controller.copyCommitHash(node))
  ];
}

function registerChangelistCommands(controller: RepositoryCommandController): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('abstractiveScm.createChangelist', () => controller.createChangelist()),
    vscode.commands.registerCommand('abstractiveScm.moveToChangelist', (arg?: ChangeItemNode | GitResourceState) => controller.moveToChangelist(arg)),
    vscode.commands.registerCommand('abstractiveScm.deleteChangelist', (arg?: ChangelistNode) => controller.deleteChangelist(arg))
  ];
}
