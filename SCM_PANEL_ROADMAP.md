# Bottom SCM Panel Roadmap

## Commit Actions

- Cherry-pick commit.
- Revert commit.
- Create branch or tag from commit.
- Checkout commit / detached HEAD with confirmation.

## Branch Actions

- Create branch.
- Delete branch.
- Rename branch.
- Merge selected branch into current.
- Rebase current onto selected.
- Compare selected branch against current more explicitly.

## Better Graph

- Replace the current lightweight graph display with a real IntelliJ-style DAG renderer.
- Add proper lane calculation, colors, merge visualization, branch labels, and local/remote refs.

## Diff Improvements

- Add a side-by-side diff preview option.
- Add word-level diff highlights.
- Show file stats such as added/deleted line counts.
- Support collapsing and expanding hunks.
- Improve native diff opening from selected hunks/files.

## Local Changes Integration

- Show working tree changes in the same bottom panel.
- Stage and unstage from the bottom panel.
- Commit from the bottom panel.
- Integrate shelf/stash workflows into the same flow.

## Polish

- Confirm the toolbar layout after reload.
- Add a keyboard shortcut help overlay.
- Persist selected branch, commit, and file more reliably across reloads.
- Auto-refresh on Git changes instead of relying on manual refresh.

## Testing And Hardening

- Test with a repository that has merges, remotes, renamed files, deleted files, and many branches.
- Add unit tests for Git parsing, especially graph/log parsing.
- Commit the current uncommitted implementation changes.
