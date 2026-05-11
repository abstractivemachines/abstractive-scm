import { GitChange, GitCommitFile } from '../../models';

export type ToolWindowMode = 'log' | 'outgoing' | 'incoming' | 'files' | 'changes' | 'history';

export type ScmPanelMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'resetLayout' }
  | { type: 'setMode'; mode: ToolWindowMode }
  | { type: 'selectBranch'; branch: string }
  | { type: 'checkoutBranch'; branch: string; remote: boolean }
  | { type: 'createBranch' }
  | { type: 'deleteBranch'; branch: string; remote: boolean }
  | { type: 'renameBranch'; branch: string; remote: boolean }
  | { type: 'mergeBranch'; branch: string }
  | { type: 'rebaseOntoBranch'; branch: string }
  | { type: 'compareBranch'; branch: string }
  | { type: 'selectCommit'; hash: string }
  | { type: 'copyCommitHash'; hash: string }
  | { type: 'cherryPickCommit'; hash: string }
  | { type: 'revertCommit'; hash: string }
  | { type: 'createBranchFromCommit'; hash: string }
  | { type: 'createTagFromCommit'; hash: string }
  | { type: 'checkoutCommit'; hash: string }
  | { type: 'selectFile'; hash: string; file: GitCommitFile }
  | { type: 'selectCompareFile'; file: GitCommitFile }
  | { type: 'selectLocalChange'; change: GitChange }
  | { type: 'stageLocalChange'; change: GitChange }
  | { type: 'unstageLocalChange'; change: GitChange }
  | { type: 'stageAllLocalChanges' }
  | { type: 'commitLocalChanges' }
  | { type: 'shelveLocalChanges' }
  | { type: 'unshelveChanges' }
  | { type: 'openLocalChangeDiff'; change: GitChange }
  | { type: 'openWorkingFile'; file: GitCommitFile | GitChange }
  | { type: 'openFileAtRevision'; hash: string; file: GitCommitFile }
  | { type: 'openCompareFileAtRevision'; file: GitCommitFile }
  | { type: 'openCompareFileDiff'; file: GitCommitFile }
  | { type: 'openFileDiff'; hash: string; file: GitCommitFile };
