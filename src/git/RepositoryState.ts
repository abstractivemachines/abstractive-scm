import { BranchStatus, GitBranch, GitChange, GitCommit, GitStash } from '../models';
import { GitRepository } from './GitRepository';

export interface RepositoryState {
  branchStatus: BranchStatus;
  changes: GitChange[];
  branches: GitBranch[];
  stashes: GitStash[];
  recentCommits: GitCommit[];
}

export class RepositoryStateService {
  constructor(private readonly git: GitRepository) {}

  async snapshot(maxLogEntries: number): Promise<RepositoryState> {
    const [branchStatus, changes, branches, stashes, recentCommits] = await Promise.all([
      this.git.branchStatus(),
      this.git.status(),
      this.git.branches(),
      this.git.stashes(),
      this.git.log(maxLogEntries)
    ]);

    return { branchStatus, changes, branches, stashes, recentCommits };
  }
}
