# Abstractive SCM Handoff

## Current State

This repo contains a VS Code extension named **Abstractive SCM** (`local.abstractive-scm`). It provides IntelliJ-inspired Git/SCM workflows through:

- A left activity-bar container with Local Changes, Branches, Log, and Shelves views.
- An optional VS Code Source Control provider, disabled by default to avoid duplicating VS Code's built-in Git provider.
- A bottom-panel SCM webview for branch -> commit -> file -> diff navigation.

The current installed local VSIX is:

```sh
/home/jason/src/abstractive-git/abstractive-scm-0.1.4.vsix
```

VS Code currently reports:

```sh
local.abstractive-scm@0.1.4
```

After reinstalling the VSIX, reload the VS Code window to pick up webview and contribution changes.

## Recent Commits

- `7317872 Add bottom panel file history`
- `74e2363 Polish SCM icon and change groups`
- `51e38a1 Polish SCM status and icon`

`main` has been pushed to:

```sh
https://github.com/abstractivemachines/abstractive-scm.git
```

## Uncommitted Work

Current uncommitted work is limited to:

- `src/gitToolWindow.ts`
- `HANDOFF.md`

It contains the in-progress bottom-panel commit graph polish:

- Replaced per-row graph SVG snippets with one continuous SVG overlay across commit rows.
- The graph overlay now keeps persistent render state and redraws through `requestAnimationFrame`.
- Long vertical lanes are merged into continuous SVG paths instead of many row-sized segments.
- File-history mode hides the graph column.
- Linear histories now use a narrower graph column default (`72px`) with smaller nodes and a subtler selected halo.
- Multi-lane histories use an adaptive graph column: linear histories stay narrow, while merge-heavy histories expand the graph column up to `320px`.
- Lane spacing and node sizing are derived from the effective graph column width so dense graphs separate instead of collapsing into stripes.
- Side lanes now converge into an already-active first-parent lane instead of duplicating that parent and continuing as permanent rails.
- The graph row model now records continuation and parent lane transitions so shifted lanes render as connected curves rather than disconnected vertical strokes.
- Removed per-row graph placeholder cells; commit rows now reserve graph space through grid placement while a single overlay measures the graph header column and row centers directly.
- Graph colors are now stable per chain instead of per lane index, so compacted lanes keep their visual identity as they shift.
- Lane transitions now use straight vertical lead-in/lead-out segments with the curve only through the middle of the row gap.
- Active lanes now stay pinned for their lifetime; lane compaction only trims empty lanes at the far right, so continuing lanes stay vertical until an actual parent/merge convergence.
- Parent/merge transitions are row-local again; long-distance routing to a later visible parent node was removed because it caused oversized crossing curves.
- Hovering commit rows schedules an overlay redraw and emphasizes the hovered node/lane.
- Selected commit remains emphasized.
- Graph redraws during commit-column resizing, pane resizing, and window resizing.
- Fixed history-mode column resizing so visible columns do not resize the hidden graph column.
- Replaced the temporary `History` mode button with a `History: <file> x` chip; the `x` returns to `Log`.
- `Log`/`Out`/`In`/`Files`/`Local` clear the file-history filter.
- File-history mode title and empty states make the return path back to the full branch clear.
- Added layout-state migration so older persisted graph widths normalize to the new `72px` default without a manual reset.

Verification already run for this uncommitted work:

```sh
npm run compile
git diff --check
npm run package
code --install-extension /home/jason/src/abstractive-git/abstractive-scm-0.1.4.vsix --force
```

## Implemented Highlights

Bottom panel:

- Four-pane branch, commit, file, and diff workflow.
- Resizable pane columns and commit table columns.
- Persisted panel layout.
- Commit modes: `Log`, `Out`, `In`, `Files`, `Local`, and file `History`.
- Explorer and editor `Show File History` command loads complete `git log --follow -- <file>` history into the bottom SCM panel.
- File-history mode previews the selected file revision patch in the bottom panel.
- Branch search/filter and commit search.
- File search/filter.
- Keyboard navigation with arrows and vim-style `h/j/k/l`.
- File navigation with `[` and `]`.
- Hunk navigation with `,` and `.`.
- Native diff opening, revision opening, worktree file opening, hash copy, and branch checkout.
- Commit actions for cherry-pick, revert, branch/tag from commit, and detached checkout.
- Branch actions for create, checkout, compare, merge, rebase, rename, and delete.
- Diff preview with unified/side-by-side modes, hunk collapse, line stats, and intra-line highlights.
- Local changes mode with stage/unstage, commit, shelve, and unshelve actions.
- Selection persistence, Git metadata auto-refresh, keyboard shortcut overlay, and active-column highlighting.
- Contextual file/change inspector and compact selected-commit summary.

Left side views:

- `Local Changes` grouped by changelist and non-empty status buckets.
- Empty `Conflicts (0)` is hidden.
- Side-panel local changes use VS Code file-theme icons for file rows instead of Git status icons.
- Git status is represented as decoration/status text rather than replacing the file icon.
- Per-file stage, unstage, rollback, move to changelist, open diff, and file history actions.
- Group stage/unstage actions.
- `Branches` grouped by local/remote, with checkout, compare, create, and delete actions.
- Remote HEAD aliases such as `origin/HEAD` are filtered from branch/log display.
- `Log` commit list with show changed files and copy hash actions.
- `Shelves` backed by Git stash apply/pop/drop.
- Shared tree/flat toggle for `Local Changes` and `Branches`.

Activity/status UI:

- Activity/panel icon uses `media/activity-board-v3.svg`.
- Legacy activity SVG paths were updated so stale icon paths render the board icon rather than the old branch-like glyph.
- Local Changes tree owns the VS Code view badge showing the local change count.
- Status bar entry opens the bottom SCM panel and summarizes local change/sync state.

## Build And Install

Compile:

```sh
npm run compile
```

Package:

```sh
npm run package
```

Install into the running VS Code installation:

```sh
code --install-extension /home/jason/src/abstractive-git/abstractive-scm-0.1.4.vsix --force
```

Reload VS Code after installing.

## Next Recommended Work

Recommended next steps:

- Visually verify the graph polish on a repository with actual merges/branches; this repo's visible history is mostly linear, so it cannot validate merge routing.
- Consider auto-previewing the first file only in file-history mode so the diff panel does not sit empty.
- Add focused tests for Git parsing and graph lane construction.

See `SCM_PANEL_ROADMAP.md` for the longer roadmap.
