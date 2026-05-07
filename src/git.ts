import { execFile } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  BranchComparison,
  BranchComparisonCommit,
  BranchComparisonFile,
  BranchStatus,
  ChangeBucket,
  GitBranch,
  GitChange,
  GitCommit,
  GitCommitFile,
  GitStash
} from './models';

const gitExecutable = 'git';

export class GitError extends Error {
  constructor(message: string, readonly stderr = '') {
    super(message);
  }
}

export class GitService {
  constructor(readonly root: string) {}

  static async discover(): Promise<GitService | undefined> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      try {
        const root = (await runGit(folder.uri.fsPath, ['rev-parse', '--show-toplevel'])).trim();
        if (root) {
          return new GitService(root);
        }
      } catch {
        // Try the next workspace folder.
      }
    }
    return undefined;
  }

  get rootUri(): vscode.Uri {
    return vscode.Uri.file(this.root);
  }

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

  async fileHistory(filePath: string, limit: number): Promise<GitCommit[]> {
    if (!(await this.hasCommits())) {
      return [];
    }

    const output = await runGit(this.root, [
      'log',
      '--follow',
      `-n${limit}`,
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

  toWorkspaceUri(filePath: string): vscode.Uri {
    return vscode.Uri.file(path.join(this.root, filePath));
  }

  private async untrackedPatch(filePath: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(this.toWorkspaceUri(filePath));
    const text = Buffer.from(bytes).toString('utf8');
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

function parseBranchComparisonCommits(input: string): BranchComparisonCommit[] {
  return input
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [marker, shortHash, subject] = line.split('\x1f');
      return {
        side: marker === '<' ? 'target' : 'current',
        shortHash: shortHash ?? '',
        subject: subject ?? ''
      };
    });
}

function parseNameStatus(input: string): BranchComparisonFile[] {
  return input
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      const status = parts[0] ?? '';
      if (status.startsWith('R') || status.startsWith('C')) {
        return {
          status,
          originalPath: parts[1],
          filePath: parts[2] ?? parts[1] ?? ''
        };
      }

      return {
        status,
        filePath: parts[1] ?? ''
      };
    });
}

function parseCommitLog(output: string): GitCommit[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.includes('\x1f'))
    .map((line) => {
      const parts = line.split('\x1f');
      const hasGraph = !/^[0-9a-f]{40}$/i.test(parts[0] ?? '');
      const [hash, shortHash, author, date, refs, subject, parents] = hasGraph ? parts.slice(1) : parts;
      return {
        hash: hash ?? '',
        shortHash: shortHash ?? '',
        graph: hasGraph ? parts[0] : undefined,
        parentHashes: (parents ?? '').split(/\s+/).filter(Boolean),
        author: author ?? '',
        date: date ?? '',
        refs: refs ?? '',
        subject: subject ?? ''
      };
    });
}

function parseCommitDetails(output: string): GitCommit | undefined {
  if (!output) {
    return undefined;
  }

  const [metadata, body = ''] = output.split('\x1e');
  const [hash, shortHash, author, date, refs, subject, parents, committer, committerDate] = metadata.split('\x1f');
  return {
    hash: hash ?? '',
    shortHash: shortHash ?? '',
    author: author ?? '',
    date: date ?? '',
    refs: refs ?? '',
    subject: subject ?? '',
    parents: parents || undefined,
    committer: committer || undefined,
    committerDate: committerDate || undefined,
    body: body.trim() || undefined
  };
}

function parsePorcelainStatus(input: string): GitChange[] {
  const parts = input.split('\0').filter(Boolean);
  const changes: GitChange[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    const x = entry.charAt(0);
    const y = entry.charAt(1);
    const filePath = entry.slice(3);
    let originalPath: string | undefined;

    if (x === 'R' || x === 'C') {
      originalPath = parts[++i];
    }

    for (const bucket of bucketsForStatus(x, y)) {
      changes.push({ filePath, originalPath, x, y, bucket });
    }
  }

  return changes;
}

function bucketsForStatus(x: string, y: string): ChangeBucket[] {
  if (x === '?' && y === '?') {
    return ['untracked'];
  }

  if (x === 'U' || y === 'U' || x + y === 'AA' || x + y === 'DD') {
    return ['conflicts'];
  }

  const buckets: ChangeBucket[] = [];
  if (x !== ' ') {
    buckets.push('staged');
  }
  if (y !== ' ') {
    buckets.push('unstaged');
  }
  return buckets;
}

function parseBranchStatus(line: string): BranchStatus {
  const raw = line.replace(/^##\s*/, '');
  const noCommits = /^No commits yet on (.+)$/.exec(raw);
  if (noCommits) {
    return { branch: noCommits[1], ahead: 0, behind: 0, detached: false };
  }

  const detached = raw.startsWith('HEAD');
  const ahead = Number(/\bahead (\d+)/.exec(raw)?.[1] ?? 0);
  const behind = Number(/\bbehind (\d+)/.exec(raw)?.[1] ?? 0);
  const upstream = /\.\.\.([^\s[]+)/.exec(raw)?.[1];
  const branch = detached ? 'HEAD' : raw.split('...')[0]?.split(' ')[0] || 'HEAD';

  return { branch, upstream, ahead, behind, detached };
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(gitExecutable, args, { cwd, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new GitError(stderr || error.message, stderr));
        return;
      }
      resolve(stdout);
    });
  });
}

function runGitBuffer(cwd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(gitExecutable, args, { cwd, encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr);
        reject(new GitError(message || error.message, message));
        return;
      }
      resolve(stdout);
    });
  });
}
