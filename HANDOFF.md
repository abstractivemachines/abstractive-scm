# Abstractive SCM Handoff

## Current State

This repo contains a VS Code extension named **Abstractive SCM** (`abstractive-scm`). It provides IntelliJ-inspired Git/SCM workflows through:

- A left activity-bar container with Local Changes, Branches, Log, and Shelves views.
- An optional VS Code Source Control provider, disabled by default to avoid duplicating the built-in Git provider.
- A bottom-panel SCM webview that supports branch -> commit -> file -> diff navigation.

The extension has been packaged and installed locally as:

```sh
/home/jason/src/abstractive-git/abstractive-scm-0.1.0.vsix
```

After reinstalling the VSIX, reload the VS Code window to pick up webview and contribution changes.

## Recent Commits

- `a505abf Rename extension to Abstractive SCM`
- `a338e30 Enhance bottom SCM panel`

## Uncommitted Work

The current uncommitted changes include a shared **Toggle Tree/Flat View** command for the left-side `Local Changes` and `Branches` views, plus bottom-panel commit actions, branch actions, a stronger commit graph, richer diff previews, local changes integration, and polish updates.

Files changed:

- `package.json`
- `src/branchesView.ts`
- `src/changesView.ts`
- `src/extension.ts`
- `src/git.ts`
- `src/gitToolWindow.ts`
- `src/models.ts`
- `SCM_PANEL_ROADMAP.md`
- `HANDOFF.md`

Side panel behavior:

- `Local Changes` can show flat files or a folder tree inside changelist/status groups.
- `Branches` can show a flat branch list or slash-grouped branch folders.
- The toggle is exposed in the `Local Changes` and `Branches` view title bars.
- The mode is persisted per workspace in `workspaceState` under `abstractiveScm.sidePanelTreeView`.

Bottom panel behavior:

- Selected commits have an `Actions` toolbar menu and commit context menu entries.
- Commit actions support cherry-pick, revert, create branch, create tag, and detached checkout.
- Cherry-pick, revert, and detached checkout show modal confirmations before changing repository state.
- Branch and tag creation prompt for the new ref name at the selected commit.
- Selected branches have a `Branch` toolbar menu and branch context menu entries.
- Branch actions support create, checkout, compare, merge, rebase, rename, and delete.
- Merge, rebase, and delete show modal confirmations before changing repository state.
- Rename and delete are limited to local branches; selected remote branches can still be checked out, compared, merged, or used as a rebase target.
- Commit log rows now include parent hashes so the bottom panel can render a structured DAG.
- The commit graph uses calculated lanes, stable lane colors, merge diagonals, and compact ref labels for HEAD, local branches, remotes, and tags.
- Diff preview supports unified and side-by-side views.
- Diff preview shows selected-file added/deleted line counts, collapsible hunk headers, and intra-line highlights for paired add/delete lines.
- Bottom panel has a `Local` mode for working tree/index changes.
- Local mode supports previewing local patches, native diff opening, opening worktree files, staging, unstaging, committing staged changes, shelving, and unshelving.
- Bottom panel now persists selected branch, commit, and file keys in webview state and ignores stale async selection responses.
- Bottom panel has a `Keys` toolbar button and `F1` keyboard shortcut overlay.
- Auto-refresh also watches `.git` metadata (`HEAD`, `index`, refs, packed refs) in addition to workspace file changes.
- Bottom panel now shows the active navigation column with theme-native header, border, and selected-row treatment.
- The lower-right inspector now shows contextual selected file/change details, while selected commit metadata lives in a compact summary inside the Commits pane.
- File rows now use a left file-type badge and move Git status to a right-aligned status column.
- Side-panel change items now use `resourceUri` instead of status icons so VS Code can render the active file icon theme and file decorations.
- The selected-commit summary keeps a fixed height and renders from the selected commit row immediately to avoid list/graph jumping while async details load.
- Bottom-panel file lists no longer auto-select the first file when commit/compare/local data loads; moving focus into the Files pane selects the first file if none is selected.
- Bottom-panel file lists stay mounted while commit files load and use a short delayed loading indicator to reduce flicker during rapid commit navigation.
- Bottom-panel graph nodes emphasize selected/hovered commits; ref labels remain in the subject column rather than graph glyphs.
- Activity/panel icon now uses `media/activity-graph.svg`, a larger bolder commit-graph glyph; the new filename avoids VS Code reusing the old cached activity icon.
- The Local Changes tree view now owns a VS Code view badge showing the current local change count, so the custom activity icon can show a count indicator.
- Branch tree mode filters remote HEAD aliases like `origin` and shows branch leaves relative to their folder, e.g. `Remote > origin > main`.
- Nested branch leaves use a compact commit-node icon instead of the wider branch glyph so child rows align more clearly under folders.
- Side-panel Log rows now hide `origin/HEAD`, compact refs into the label, and use author/date as stable row metadata.

Verification already run:

```sh
npm run compile
npm run package
code --install-extension /home/jason/src/abstractive-git/abstractive-scm-0.1.0.vsix --force
```

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
code --install-extension /home/jason/src/abstractive-git/abstractive-scm-0.1.0.vsix --force
```

Reload VS Code after installing.

## Bottom SCM Panel Features

Implemented:

- Four-pane branch, commit, file, and diff workflow.
- Resizable pane columns.
- Resizable commit table columns.
- Persisted panel layout.
- Commit modes: log, outgoing, incoming, and branch files.
- Branch search/filter.
- Commit search.
- File search/filter.
- Keyboard navigation with arrows and vim-style `h/j/k/l`.
- File navigation with `[` and `]`.
- Hunk navigation with `,` and `.`.
- Open native diff, open file at revision, open working tree file, copy hash, checkout branch.
- Commit actions for cherry-pick, revert, branch/tag from commit, and detached checkout.
- Branch actions for create, checkout, compare, merge, rebase, rename, and delete.
- Structured commit graph with lane calculation, merge visualization, colors, and ref labels.
- Diff preview with unified/side-by-side modes, hunk collapse, line stats, and intra-line highlights.
- Local changes mode with stage/unstage, commit, shelve, and unshelve actions.
- Selection persistence, Git metadata auto-refresh, keyboard shortcut overlay, and active-column highlighting.
- Contextual file/change inspector, compact selected-commit summary, and file rows with right-aligned Git status.
- Side-panel local changes use VS Code file-theme icons for file rows instead of Git status icons.
- Context menus for branches, commits, and files.
- Commit details panel.

Known issue to visually confirm:

- Toolbar layout should be checked after VS Code reload. It was changed to a two-row wrapping layout after right-edge overflow reports.

## Left Side Views

Implemented:

- `Local Changes` grouped by changelist and status bucket.
- Per-file stage, unstage, rollback, move to changelist, open diff, and file history actions.
- Group stage/unstage actions.
- `Branches` grouped by local/remote, with checkout, compare, create, and delete actions.
- `Log` commit list with show changed files and copy hash actions.
- `Shelves` backed by Git stash apply/pop/drop.
- Shared tree/flat toggle for `Local Changes` and `Branches`.

## Next Likely Work

High-value next items:

- Add unit tests for Git parsing, especially log graph and status parsing.

See `SCM_PANEL_ROADMAP.md` for a longer roadmap.
