import {
  BranchComparisonCommit,
  BranchComparisonFile,
  BranchStatus,
  ChangeBucket,
  GitChange,
  GitCommit
} from '../models';

export function parseBranchComparisonCommits(input: string): BranchComparisonCommit[] {
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

export function parseNameStatus(input: string): BranchComparisonFile[] {
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

export function parseCommitLog(output: string): GitCommit[] {
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

export function parseCommitDetails(output: string): GitCommit | undefined {
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

export function parsePorcelainStatus(input: string): GitChange[] {
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

export function bucketsForStatus(x: string, y: string): ChangeBucket[] {
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

export function parseBranchStatus(line: string): BranchStatus {
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
