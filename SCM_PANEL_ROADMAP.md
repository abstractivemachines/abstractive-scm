# Bottom SCM Panel Roadmap

## Commit Actions

- [x] Cherry-pick commit.
- [x] Revert commit.
- [x] Create branch or tag from commit.
- [x] Checkout commit / detached HEAD with confirmation.

## Branch Actions

- [x] Create branch.
- [x] Delete branch.
- [x] Rename branch.
- [x] Merge selected branch into current.
- [x] Rebase current onto selected.
- [x] Compare selected branch against current more explicitly.

## Better Graph

- [x] Replace the current lightweight graph display with a real IntelliJ-style DAG renderer.
- [x] Add proper lane calculation, colors, merge visualization, branch labels, and local/remote refs.

## Diff Improvements

- [x] Add a side-by-side diff preview option.
- [x] Add word-level diff highlights.
- [x] Show file stats such as added/deleted line counts.
- [x] Support collapsing and expanding hunks.
- [x] Improve native diff opening from selected hunks/files.

## Local Changes Integration

- [x] Show working tree changes in the same bottom panel.
- [x] Stage and unstage from the bottom panel.
- [x] Commit from the bottom panel.
- [x] Integrate shelf/stash workflows into the same flow.

## Polish

- Confirm the toolbar layout after reload.
- [x] Add a keyboard shortcut help overlay.
- [x] Persist selected branch, commit, and file more reliably across reloads.
- [x] Auto-refresh on Git changes instead of relying on manual refresh.
- [x] Make the active bottom-panel navigation column visually obvious.
- [x] Make the diff-side inspector contextual to the selected file or local change.
- [x] Move file Git status to the right side and restore file-type identity on the left.
- [x] Use VS Code file-theme icons for side-panel local change file rows.
- [x] Leave Files unselected after commit selection until focus enters the Files pane.
- [x] Smooth Files column updates while commit file lists load.
- [x] Add selected/hover emphasis to graph nodes.

## Testing And Hardening

- Test with a repository that has merges, remotes, renamed files, deleted files, and many branches.
- Add unit tests for Git parsing, especially graph/log parsing.
- Commit the current uncommitted implementation changes.
