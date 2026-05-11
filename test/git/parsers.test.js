const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  bucketsForStatus,
  parseBranchComparisonCommits,
  parseBranchStatus,
  parseCommitDetails,
  parseCommitLog,
  parseNameStatus,
  parsePorcelainStatus
} = require('../../dist/git/parsers');

describe('git parsers', () => {
  it('parses porcelain status into user-facing buckets', () => {
    const changes = parsePorcelainStatus([
      ' M src/app.ts',
      'A  src/new.ts',
      '?? src/untracked.ts',
      'R  src/renamed.ts',
      'src/old.ts',
      'UU src/conflict.ts',
      ''
    ].join('\0'));

    assert.deepEqual(changes, [
      { filePath: 'src/app.ts', originalPath: undefined, x: ' ', y: 'M', bucket: 'unstaged' },
      { filePath: 'src/new.ts', originalPath: undefined, x: 'A', y: ' ', bucket: 'staged' },
      { filePath: 'src/untracked.ts', originalPath: undefined, x: '?', y: '?', bucket: 'untracked' },
      { filePath: 'src/renamed.ts', originalPath: 'src/old.ts', x: 'R', y: ' ', bucket: 'staged' },
      { filePath: 'src/conflict.ts', originalPath: undefined, x: 'U', y: 'U', bucket: 'conflicts' }
    ]);
  });

  it('maps staged, unstaged, untracked, and conflict status codes', () => {
    assert.deepEqual(bucketsForStatus('M', 'M'), ['staged', 'unstaged']);
    assert.deepEqual(bucketsForStatus('?', '?'), ['untracked']);
    assert.deepEqual(bucketsForStatus('A', 'A'), ['conflicts']);
  });

  it('parses branch status including upstream divergence', () => {
    assert.deepEqual(parseBranchStatus('## feature/scm...origin/feature/scm [ahead 2, behind 1]'), {
      branch: 'feature/scm',
      upstream: 'origin/feature/scm',
      ahead: 2,
      behind: 1,
      detached: false
    });
  });

  it('parses a no-commits branch status', () => {
    assert.deepEqual(parseBranchStatus('## No commits yet on main'), {
      branch: 'main',
      ahead: 0,
      behind: 0,
      detached: false
    });
  });

  it('parses commit logs with parent hashes', () => {
    const commits = parseCommitLog('abc1230000000000000000000000000000000000\x1fabc1230\x1fAda\x1f2026-01-02T03:04:05Z\x1fHEAD -> main\x1fInitial commit\x1fdef456 ghi789');

    assert.deepEqual(commits, [{
      hash: 'abc1230000000000000000000000000000000000',
      shortHash: 'abc1230',
      graph: undefined,
      parentHashes: ['def456', 'ghi789'],
      author: 'Ada',
      date: '2026-01-02T03:04:05Z',
      refs: 'HEAD -> main',
      subject: 'Initial commit'
    }]);
  });

  it('parses detailed commit metadata and body', () => {
    const commit = parseCommitDetails('hash\x1fshort\x1fAda\x1f2026-01-02\x1fmain\x1fSubject\x1fparent\x1fGrace\x1f2026-01-03\x1eSubject\n\nBody');

    assert.equal(commit.hash, 'hash');
    assert.equal(commit.committer, 'Grace');
    assert.equal(commit.body, 'Subject\n\nBody');
  });

  it('parses name-status rows with rename metadata', () => {
    assert.deepEqual(parseNameStatus('M\tsrc/app.ts\nR100\tsrc/old.ts\tsrc/new.ts'), [
      { status: 'M', filePath: 'src/app.ts' },
      { status: 'R100', originalPath: 'src/old.ts', filePath: 'src/new.ts' }
    ]);
  });

  it('parses branch comparison commit side markers', () => {
    assert.deepEqual(parseBranchComparisonCommits('<\x1fabcd123\x1ftarget only\n>\x1fdef4567\x1fcurrent only'), [
      { side: 'target', shortHash: 'abcd123', subject: 'target only' },
      { side: 'current', shortHash: 'def4567', subject: 'current only' }
    ]);
  });
});
