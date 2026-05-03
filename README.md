# Abstractive SCM

Abstractive SCM is a VS Code extension scaffold for IntelliJ-inspired Git and SCM workflows.

The first implementation provides:

- A dedicated SCM provider with staged, unstaged, untracked, and conflict groups.
- A Local Changes view that provides the same grouping without duplicating VS Code's built-in Git repository.
- Workspace-local changelists for splitting local changes into named work groups.
- A bottom-panel SCM tool window for branch -> commit -> file -> live diff preview navigation.
- One-click stage, unstage, rollback, and diff actions.
- Commit and amend flows with optional sign-off.
- Fetch, pull with rebase, and push commands.
- Branch tree with checkout, create, and delete actions.
- Branch comparison from the branch tree, including unique commits and changed files.
- Git log tree plus a richer log webview.
- Commit file inspection with parent-vs-commit diffs.
- Per-file history from Local Changes or the editor context menu.
- Shelves view backed by `git stash`, with shelve, unshelve, pop, and delete actions.
- Status bar branch/ahead/behind/change summary.

This project does not copy JetBrains source, icons, or proprietary UI. It implements similar workflow concepts using VS Code extension APIs and the local `git` CLI.

## Development

```sh
npm install
npm run compile
```

Open this folder in VS Code and run the `Run Extension` launch target, or press `F5`.
