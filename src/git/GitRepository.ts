import * as path from 'path';
import { promises as fs } from 'fs';
import {
  BranchComparison,
  BranchStatus,
  GitBranch,
  GitChange,
  GitCommit,
  GitCommitFile,
  GitStash
} from '../models';
import { runGit, runGitBuffer } from './GitRunner';
import {
  parseBranchComparisonCommits,
  parseBranchStatus,
  parseCommitDetails,
  parseCommitLog,
  parseNameStatus,
  parsePorcelainStatus
} from './parsers';

export { GitError } from './GitRunner';

export class GitRepository {
  constructor(readonly root: string) {}

  async status(): Promise<GitChange[]> {
    const output = await runGitBuffer(this.root, ['status', '--porcelain=v1', '--untracked-files=all', '-z']);
    return parsePorcelainStatus(output.toString('utf8'));
  }

  async branchStatus(): Promise<BranchStatus> {
    const output = await runGit(this.root, ['status', '--porcelain=v1', '--branch']);
    const first = output.split(/\r?\n/, 1)[0] ?? '## HEAD';
    return parseBranchStatus(first);
  }

  async stage(filePath: string): Promise<void> {
    await runGit(this.root, ['add', '--', filePath]);
  }

  async stageAll(): Promise<void> {
    await runGit(this.root, ['add', '--all', '--', ':/']);
  }

  async unstage(filePath: string): Promise<void> {
    await runGit(this.root, ['restore', '--staged', '--', filePath]);
  }

  async unstageAll(): Promise<void> {
    await runGit(this.root, ['restore', '--staged', '--', ':/']);
  }

  async rollback(change: GitChange): Promise<void> {
    if (change.x === '?' && change.y === '?') {
      await runGit(this.root, ['clean', '-f', '--', change.filePath]);
      return;
    }

    if (change.x === 'A') {
      await runGit(this.root, ['restore', '--staged', '--', change.filePath]);
      await runGit(this.root, ['clean', '-f', '--', change.filePath]);
      return;
    }

    await runGit(this.root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', change.filePath]);
  }

  async commit(message: string, amend: boolean, signoff: boolean): Promise<void> {
    const args = ['commit'];
    if (amend) {
      args.push('--amend');
    }
    if (signoff) {
      args.push('--signoff');
    }
    args.push('-m', message);
    await runGit(this.root, args);
  }

  async fetch(): Promise<void> {
    await runGit(this.root, ['fetch', '--all', '--prune']);
  }

  async pullRebase(): Promise<void> {
    await runGit(this.root, ['pull', '--rebase', '--autostash']);
  }

  async push(): Promise<void> {
    await runGit(this.root, ['push']);
  }

  async checkout(branch: string): Promise<void> {
    await runGit(this.root, ['checkout', branch]);
  }

  async checkoutRemote(remoteBranch: string): Promise<void> {
    await runGit(this.root, ['checkout', '--track', remoteBranch]);
  }

  async createBranch(branch: string): Promise<void> {
    await runGit(this.root, ['checkout', '-b', branch]);
  }

  async createBranchAt(branch: string, ref: string): Promise<void> {
    await runGit(this.root, ['branch', branch, ref]);
  }

  async deleteBranch(branch: string, force: boolean): Promise<void> {
    await runGit(this.root, ['branch', force ? '-D' : '-d', branch]);
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await runGit(this.root, ['branch', '-m', oldName, newName]);
  }

  async mergeBranch(branch: string): Promise<void> {
    await runGit(this.root, ['merge', '--no-edit', branch]);
  }

  async rebaseOntoBranch(branch: string): Promise<void> {
    await runGit(this.root, ['rebase', branch]);
  }

  async createTagAt(tag: string, ref: string): Promise<void> {
    await runGit(this.root, ['tag', tag, ref]);
  }

  async cherryPickCommit(hash: string): Promise<void> {
    await runGit(this.root, ['cherry-pick', hash]);
  }

  async revertCommit(hash: string): Promise<void> {
    await runGit(this.root, ['revert', '--no-edit', hash]);
  }

  async checkoutCommit(hash: string): Promise<void> {
    await runGit(this.root, ['checkout', '--detach', hash]);
  }

  async stashes(): Promise<GitStash[]> {
    const output = await runGit(this.root, ['stash', 'list', '--format=%gd%x1f%h%x1f%cr%x1f%gs']);
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [ref, shortHash, age, message] = line.split('\x1f');
        return {
          ref: ref ?? '',
          shortHash: shortHash ?? '',
          age: age ?? '',
          message: message ?? ''
        };
      });
  }

  async stashPush(message: string, includeUntracked: boolean): Promise<void> {
    const args = ['stash', 'push'];
    if (includeUntracked) {
      args.push('--include-untracked');
    }
    args.push('-m', message);
    await runGit(this.root, args);
  }

  async stashApply(ref: string): Promise<void> {
    await runGit(this.root, ['stash', 'apply', ref]);
  }

  async stashPop(ref: string): Promise<void> {
    await runGit(this.root, ['stash', 'pop', ref]);
  }

  async stashDrop(ref: string): Promise<void> {
    await runGit(this.root, ['stash', 'drop', ref]);
  }

  async branches(): Promise<GitBranch[]> {
    const current = (await this.branchStatus()).branch;
    const output = await runGit(this.root, [
      'for-each-ref',
      'refs/heads',
      'refs/remotes',
      '--format=%(refname)%1f%(refname:short)%1f%(upstream:short)%1f%(objectname:short)%1f%(subject)'
    ]);

    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [refname, name, upstream, hash, subject] = line.split('\x1f');
        return {
          refname,
          name,
          upstream: upstream || undefined,
          hash: hash ?? '',
          subject: subject ?? '',
          current: name === current,
          remote: refname.startsWith('refs/remotes/')
        };
      })
      .filter((branch) => !branch.remote || !branch.refname.endsWith('/HEAD'))
      .map(({ refname: _refname, ...branch }) => branch);
  }

  async compareWithBranch(targetBranch: string): Promise<BranchComparison> {
    const currentBranch = (await this.branchStatus()).branch;
    const [commitOutput, fileOutput] = await Promise.all([
      runGit(this.root, ['log', '--left-right', '--cherry-pick', '--pretty=format:%m%x1f%h%x1f%s', `${targetBranch}...HEAD`]),
      runGit(this.root, ['diff', '--name-status', '-M', `${targetBranch}...HEAD`])
    ]);

    return {
      currentBranch,
      targetBranch,
      commits: parseBranchComparisonCommits(commitOutput),
      files: parseNameStatus(fileOutput)
    };
  }

  async log(limit: number): Promise<GitCommit[]> {
    if (!(await this.hasCommits())) {
      return [];
    }

    const output = await runGit(this.root, [
      'log',
      `-n${limit}`,
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%D%x1f%s%x1f%P'
    ]);

    return output
      ? parseCommitLog(output)
      : [];
  }

  async logForRef(ref: string, limit: number): Promise<GitCommit[]> {
    if (!(await this.hasCommits())) {
      return [];
    }

    const output = await runGit(this.root, [
      'log',
      ref,
      `-n${limit}`,
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%D%x1f%s%x1f%P'
    ]);

    return output ? parseCommitLog(output) : [];
  }

  async logRange(fromExclusive: string, toInclusive: string, limit: number): Promise<GitCommit[]> {
    if (!(await this.hasCommits())) {
      return [];
    }

    const output = await runGit(this.root, [
      'log',
      `${fromExclusive}..${toInclusive}`,
      `-n${limit}`,
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%D%x1f%s%x1f%P'
    ]);

    return output ? parseCommitLog(output) : [];
  }

  async commitDetails(hash: string): Promise<GitCommit | undefined> {
    if (!(await this.hasCommits())) {
      return undefined;
    }

    const output = await runGit(this.root, [
      'show',
      '--no-patch',
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%D%x1f%s%x1f%P%x1f%cn%x1f%cd%x1e%B',
      hash
    ]);

    return parseCommitDetails(output);
  }

  async fileHistory(filePath: string, limit?: number): Promise<GitCommit[]> {
    if (!(await this.hasCommits())) {
      return [];
    }

    const output = await runGit(this.root, [
      'log',
      '--follow',
      ...(limit ? [`-n${limit}`] : []),
      '--date=iso-strict',
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%D%x1f%s%x1f%P',
      '--',
      filePath
    ]);

    return parseCommitLog(output);
  }

  async commitFiles(hash: string): Promise<GitCommitFile[]> {
    const output = await runGit(this.root, ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', hash]);
    return parseNameStatus(output);
  }

  async commitFilePatch(hash: string, file: GitCommitFile): Promise<string> {
    const paths = file.originalPath ? [file.originalPath, file.filePath] : [file.filePath];
    return runGit(this.root, ['show', '--format=', '--find-renames', '--patch', hash, '--', ...paths]);
  }

  async firstParent(hash: string): Promise<string | undefined> {
    const output = await runGit(this.root, ['rev-list', '--parents', '-n', '1', hash]);
    const [, parent] = output.trim().split(/\s+/);
    return parent || undefined;
  }

  async branchDiffFiles(baseBranch: string, compareBranch: string): Promise<GitCommitFile[]> {
    const output = await runGit(this.root, ['diff', '--name-status', '-M', `${baseBranch}...${compareBranch}`]);
    return parseNameStatus(output);
  }

  async branchFilePatch(baseBranch: string, compareBranch: string, file: GitCommitFile): Promise<string> {
    const paths = file.originalPath ? [file.originalPath, file.filePath] : [file.filePath];
    return runGit(this.root, ['diff', '--find-renames', '--patch', `${baseBranch}...${compareBranch}`, '--', ...paths]);
  }

  async localChangePatch(change: GitChange): Promise<string> {
    const paths = change.originalPath ? [change.originalPath, change.filePath] : [change.filePath];
    if (change.bucket === 'untracked') {
      return this.untrackedPatch(change.filePath);
    }
    if (change.bucket === 'staged') {
      return runGit(this.root, ['diff', '--cached', '--find-renames', '--patch', '--', ...paths]);
    }
    return runGit(this.root, ['diff', '--find-renames', '--patch', '--', ...paths]);
  }

  async mergeBase(leftRef: string, rightRef: string): Promise<string> {
    return (await runGit(this.root, ['merge-base', leftRef, rightRef])).trim();
  }

  async fileAtRef(ref: string, filePath: string): Promise<string> {
    const spec = ref === 'index' ? `:${filePath}` : `${ref}:${filePath}`;
    return runGit(this.root, ['show', spec]);
  }

  async workspaceFile(filePath: string): Promise<string> {
    return fs.readFile(this.toWorkspacePath(filePath), 'utf8');
  }

  toWorkspacePath(filePath: string): string {
    return path.join(this.root, filePath);
  }

  private async untrackedPatch(filePath: string): Promise<string> {
    const text = await fs.readFile(this.toWorkspacePath(filePath), 'utf8');
    const lines = text.split(/\r?\n/);
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    return [
      `diff --git a/${filePath} b/${filePath}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${filePath}`,
      `@@ -0,0 +1,${lines.length} @@`,
      ...lines.map((line) => `+${line}`)
    ].join('\n');
  }

  private async hasCommits(): Promise<boolean> {
    try {
      await runGit(this.root, ['rev-parse', '--verify', 'HEAD']);
      return true;
    } catch {
      return false;
    }
  }
}
