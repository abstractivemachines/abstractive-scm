# Multi-Repo Product Implementation Plan

## Product Goal

Make multi-repo workspaces feel like one coherent SCM workspace, while keeping risky Git operations repo-scoped and understandable.

The first version should answer: "What changed across my workspace, and can I safely act on the right repo?"

## Phase 1: Repo-Aware Foundation

Build the internal model needed for multi-repo behavior without changing every UI at once.

- Add a `RepositoryManager` that discovers all Git roots, tracks the active repository, and resolves the target repo from tree nodes, SCM resources, active editor files, explicit selection, or Quick Pick fallback.
- Refactor activation so one workspace-level controller owns one repo controller per Git root.
- Keep command registration global and route commands to the correct repo controller.
- Make action payloads repo-aware. Changes, branches, commits, stashes, and SCM resource states should carry `repoRoot` or another stable repository id.
- Scope changelists by repository so two repositories can both have files such as `README.md` without state collisions.

Acceptance criteria:

- The extension detects all workspace Git roots.
- Commands invoked from files or tree nodes act on the correct repo.
- Existing single-repo behavior remains unchanged.

## Phase 2: Multi-Repo Local Changes

This is the most important product surface.

- Change Local Changes root layout to group by repository.
- Show only dirty repositories by default.
- Preserve the existing changelist, bucket, folder, and file structure inside each repository.
- Add repository headers with repo name, branch name, and change count.
- Keep stage, unstage, rollback, diff, open file, and move-to-changelist working from any repo group.

Suggested UI:

```text
Local Changes
  abstractive-scm  main  4 changes
    Default Changelist
      Unstaged
      Staged

  docs-site  feature/nav  2 changes
    Default Changelist
      Untracked
```

Acceptance criteria:

- Users can see all changed repositories without switching.
- Users can stage, rollback, and open diffs from any repository.
- Empty workspaces show a clear "No local changes" state.

## Phase 3: Active Repo UX

Introduce a visible, predictable active repository model for complex operations.

- Add `Abstractive SCM: Switch Repository`.
- Make the active repository follow selected repo groups, active editor files, and explicit switch commands.
- Update the status bar with active repo name, branch, ahead/behind count, and change count.
- Add a repository selector to the SCM webview header.

Acceptance criteria:

- Users always know which repository branch, log, commit, and webview actions refer to.
- Commands without node context pick the expected repo or prompt.

## Phase 4: Repo-Scoped Complex Views

Keep advanced views understandable by making them active-repo-first.

- Keep Branches, Log, Shelves/Stashes, and the SCM webview scoped to the active repository.
- Reload repo-scoped views when the active repository changes.
- Preserve repo-specific context for commands invoked from tree nodes.

Acceptance criteria:

- Branch, log, and stash actions do not accidentally affect another repository.
- Switching the active repository updates all repo-scoped views consistently.

## Phase 5: Workspace-Level Operations

Add multi-repo convenience commands after core correctness is solid.

- Add `Refresh All Repositories`.
- Add `Fetch All Repositories`.
- Report per-repository success and failure for workspace-level operations.
- Keep risky operations such as commit all, push all, and pull all out of the initial implementation.

Acceptance criteria:

- Refresh all updates all repository state.
- Fetch all reports partial failures clearly.
- Risky commands require explicit repository selection or confirmation.

