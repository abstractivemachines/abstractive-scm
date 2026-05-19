# Abstractive SCM

> A richer Git workflow panel for VS Code.

Abstractive SCM is a VS Code extension that pulls a full Git workflow into one panel: a branch → commit → file → diff navigator, workspace-local changelists, a real DAG commit graph, side-by-side diffs with word-level highlights, and shelves backed by `git stash`. It's built on the VS Code extension API and the local `git` CLI.

Personal project, pre-release. Issues and feedback welcome.

## What it adds

- **Bottom-panel SCM tool window** — navigate branches, commits, files, and a live side-by-side diff in one pane.
- **Local Changes view** with workspace-local **changelists** for splitting in-progress work into named groups.
- **Real DAG commit graph** with lane calculation, merge visualization, and branch/tag refs.
- **Side-by-side diffs** with word-level highlights, per-file add/delete stats, and collapsible hunks.
- **Branch tree** with checkout, create, rename, delete, merge, rebase, and branch comparison (unique commits + changed files).
- **Shelves** backed by `git stash` — shelve, unshelve, pop, delete.
- **File history** from Local Changes or the editor context menu.
- **Commit actions** — cherry-pick, revert, create branch/tag from commit, detached checkout with confirmation.
- **Multi-repo workspaces** — active-repo model, per-repo changelists, fetch all, refresh all.
- **Status bar** with branch, ahead/behind, and change summary.

## Screenshots

_Coming soon — see the GitHub release for a walkthrough._

## Install

A pre-built `.vsix` is attached to each release. To install from one:

```sh
code --install-extension abstractive-scm-<version>.vsix
```

Or build from source — see below.

## Development

```sh
npm install
npm run compile
npm test
npm run verify
```

Open this folder in VS Code and run the **Run Extension** launch target, or press `F5`.

To package a `.vsix` locally:

```sh
npm run package
```

## Status

Pre-release (`0.1.x`). The core workflow surfaces in [`SCM_PANEL_ROADMAP.md`](./SCM_PANEL_ROADMAP.md) are checked off, and multi-repo support is in. The remaining work is hardening against weirder real-world repos (heavy merge history, renames, deletions, many branches) and broader test coverage.

## License

MIT. See [`LICENSE`](./LICENSE).
