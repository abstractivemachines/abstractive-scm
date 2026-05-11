import { GitRepository } from './GitRepository';

export async function hasUnresolvedConflicts(git: GitRepository): Promise<boolean> {
  const changes = await git.status();
  return changes.some((change) => change.bucket === 'conflicts');
}

export async function assertNoUnresolvedConflicts(git: GitRepository, action: string): Promise<void> {
  if (await hasUnresolvedConflicts(git)) {
    throw new Error(`Resolve merge conflicts before ${action}.`);
  }
}

export async function assertPushReady(git: GitRepository): Promise<void> {
  const branch = await git.branchStatus();
  if (branch.detached) {
    throw new Error('Cannot push while HEAD is detached.');
  }
  if (!branch.upstream) {
    throw new Error(`Branch ${branch.branch} has no upstream. Publish or set an upstream branch first.`);
  }
}
