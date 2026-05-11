const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { describe, it } = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const { GitRepository } = require('../../dist/git/GitRepository');

const exec = promisify(execFile);

describe('GitRepository integration', () => {
  it('stages, unstages, rolls back, stashes, and compares branches in a real repo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'abstractive-scm-'));
    try {
      await git(root, 'init');
      await git(root, 'config', 'user.email', 'test@example.com');
      await git(root, 'config', 'user.name', 'Test User');
      await writeFile(join(root, 'file.txt'), 'one\n');
      await git(root, 'add', 'file.txt');
      await git(root, 'commit', '-m', 'initial');

      const repo = new GitRepository(root);
      const defaultBranch = (await repo.branchStatus()).branch;
      await writeFile(join(root, 'file.txt'), 'two\n');
      assert.deepEqual((await repo.status()).map((change) => change.bucket), ['unstaged']);

      await repo.stage('file.txt');
      assert.deepEqual((await repo.status()).map((change) => change.bucket), ['staged']);

      await repo.unstage('file.txt');
      assert.deepEqual((await repo.status()).map((change) => change.bucket), ['unstaged']);

      await repo.stashPush('shelf', false);
      assert.equal((await repo.stashes()).length, 1);
      assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'one\n');

      await repo.stashApply('stash@{0}');
      assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'two\n');
      await repo.rollback((await repo.status())[0]);
      assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'one\n');

      await repo.createBranch('feature');
      await writeFile(join(root, 'feature.txt'), 'feature\n');
      await repo.stageAll();
      await repo.commit('feature commit', false, false);
      await repo.checkout(defaultBranch);

      const comparison = await repo.compareWithBranch('feature');
      assert.equal(comparison.targetBranch, 'feature');
      assert.equal(comparison.files.some((file) => file.filePath === 'feature.txt'), false);
      assert.equal((await repo.branchDiffFiles(defaultBranch, 'feature')).some((file) => file.filePath === 'feature.txt'), true);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('detects renamed files and conflicts in real git status output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'abstractive-scm-'));
    try {
      await git(root, 'init');
      await git(root, 'config', 'user.email', 'test@example.com');
      await git(root, 'config', 'user.name', 'Test User');
      await writeFile(join(root, 'file.txt'), 'base\n');
      await git(root, 'add', 'file.txt');
      await git(root, 'commit', '-m', 'initial');

      const repo = new GitRepository(root);
      const defaultBranch = (await repo.branchStatus()).branch;
      await git(root, 'mv', 'file.txt', 'renamed.txt');
      assert.equal((await repo.status())[0].originalPath, 'file.txt');

      await repo.rollback((await repo.status())[0]);
      await repo.createBranch('left');
      await writeFile(join(root, 'file.txt'), 'left\n');
      await repo.stageAll();
      await repo.commit('left', false, false);
      await repo.checkout(defaultBranch);
      await repo.createBranch('right');
      await writeFile(join(root, 'file.txt'), 'right\n');
      await repo.stageAll();
      await repo.commit('right', false, false);

      await assert.rejects(() => repo.mergeBranch('left'));
      assert.equal((await repo.status()).some((change) => change.bucket === 'conflicts'), true);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function git(cwd, ...args) {
  return exec('git', args, { cwd });
}
