import * as path from 'path';
import * as vscode from 'vscode';
import { GitChange } from '../models';

export function statusBarText(changes: GitChange[], ahead: number, behind: number): string {
  const conflicts = changes.filter((change) => change.bucket === 'conflicts').length;
  const state = [
    conflicts ? `!${conflicts}` : '',
    changes.length ? String(changes.length) : '',
    ahead ? `↑${ahead}` : '',
    behind ? `↓${behind}` : ''
  ].filter(Boolean).join(' ');
  return `$(window) SCM${state ? ` ${state}` : ''}`;
}

export function statusBarTooltip(repoRoot: string, branch: string, changes: GitChange[], ahead: number, behind: number): vscode.MarkdownString {
  const conflicts = changes.filter((change) => change.bucket === 'conflicts').length;
  const staged = changes.filter((change) => change.bucket === 'staged').length;
  const unstaged = changes.filter((change) => change.bucket === 'unstaged').length;
  const untracked = changes.filter((change) => change.bucket === 'untracked').length;
  const tooltip = new vscode.MarkdownString(undefined, true);
  tooltip.isTrusted = true;
  tooltip.appendMarkdown('**Open Abstractive SCM Panel**');
  tooltip.appendMarkdown(`\n\nRepository: \`${path.basename(repoRoot)}\``);
  tooltip.appendMarkdown(`\n\nBranch: \`${branch}\``);
  tooltip.appendMarkdown(`\n\nLocal changes: ${changes.length}`);
  if (conflicts) tooltip.appendMarkdown(`\n\nConflicts: ${conflicts}`);
  if (staged) tooltip.appendMarkdown(`\n\nStaged: ${staged}`);
  if (unstaged) tooltip.appendMarkdown(`\n\nUnstaged: ${unstaged}`);
  if (untracked) tooltip.appendMarkdown(`\n\nUntracked: ${untracked}`);
  if (ahead || behind) tooltip.appendMarkdown(`\n\nSync: ${ahead ? `↑${ahead}` : ''}${ahead && behind ? ' ' : ''}${behind ? `↓${behind}` : ''}`);
  return tooltip;
}
