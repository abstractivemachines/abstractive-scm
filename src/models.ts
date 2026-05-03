import * as vscode from 'vscode';

export type ChangeBucket = 'staged' | 'unstaged' | 'untracked' | 'conflicts';

export interface GitChange {
  filePath: string;
  originalPath?: string;
  x: string;
  y: string;
  bucket: ChangeBucket;
}

export interface BranchStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  detached: boolean;
}

export interface GitBranch {
  name: string;
  upstream?: string;
  hash: string;
  subject: string;
  current: boolean;
  remote: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  graph?: string;
  author: string;
  date: string;
  refs: string;
  subject: string;
  parents?: string;
  committer?: string;
  committerDate?: string;
  body?: string;
}

export interface GitStash {
  ref: string;
  shortHash: string;
  age: string;
  message: string;
}

export interface BranchComparisonFile {
  status: string;
  filePath: string;
  originalPath?: string;
}

export interface GitCommitFile extends BranchComparisonFile {}

export interface BranchComparisonCommit {
  side: 'current' | 'target';
  shortHash: string;
  subject: string;
}

export interface BranchComparison {
  currentBranch: string;
  targetBranch: string;
  commits: BranchComparisonCommit[];
  files: BranchComparisonFile[];
}

export interface GitResourceState extends vscode.SourceControlResourceState {
  change: GitChange;
  bucket: ChangeBucket;
}

export function changeLabel(change: GitChange): string {
  if (change.x === '?' && change.y === '?') {
    return 'Untracked';
  }

  if (change.x === 'U' || change.y === 'U' || change.x + change.y === 'AA' || change.x + change.y === 'DD') {
    return 'Conflict';
  }

  const code = change.bucket === 'staged' ? change.x : change.y;
  switch (code) {
    case 'A':
      return 'Added';
    case 'M':
      return 'Modified';
    case 'D':
      return 'Deleted';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    default:
      return `${change.x}${change.y}`.trim() || 'Changed';
  }
}
