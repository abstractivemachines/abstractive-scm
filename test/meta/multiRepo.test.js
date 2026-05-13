const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { describe, it } = require('node:test');

describe('multi-repo implementation contract', () => {
  it('keeps the product implementation plan in the repository root', () => {
    const plan = readFileSync('MULTI_REPO_PLAN.md', 'utf8');

    assert.match(plan, /Product Goal/);
    assert.match(plan, /Multi-Repo Local Changes/);
    assert.match(plan, /Workspace-Level Operations/);
  });

  it('routes repository commands through a workspace-level repository manager', () => {
    const controller = readFileSync('src/activation/AbstractiveScmController.ts', 'utf8');

    assert.match(controller, /RepositoryManager/);
    assert.match(controller, /resolveRepository/);
    assert.match(controller, /switchRepository/);
    assert.match(controller, /fetchAll/);
  });

  it('discovers nested Git roots inside a workspace folder', () => {
    const service = readFileSync('src/git/GitService.ts', 'utf8');

    assert.match(service, /gitRootCandidates/);
    assert.match(service, /entry\.name === '\.git'/);
    assert.match(service, /node_modules/);
    assert.match(service, /rev-parse', '--show-toplevel/);
  });

  it('groups local changes by repository and keeps changelists repo-scoped', () => {
    const changesView = readFileSync('src/changesView.ts', 'utf8');
    const changelists = readFileSync('src/changelists.ts', 'utf8');

    assert.match(changesView, /class RepositoryNode/);
    assert.match(changesView, /hasMultipleRepositories/);
    assert.match(changesView, /changelistsFor\(repository\)/);
    assert.match(changelists, /encodeURIComponent\(scope\)/);
  });

  it('includes repository identity in virtual Git content URIs', () => {
    const provider = readFileSync('src/gitContentProvider.ts', 'utf8');

    assert.match(provider, /repoRoot/);
    assert.match(provider, /params\.set\('repo'/);
    assert.match(provider, /repositoryForRoot\(repoRoot\)/);
  });

  it('adds active repository controls to the SCM webview', () => {
    const html = readFileSync('src/webviews/scmPanel/renderHtml.ts', 'utf8');
    const script = readFileSync('src/webviews/scmPanel/browserScript.ts', 'utf8');
    const provider = readFileSync('src/webviews/scmPanel/ScmPanelProvider.ts', 'utf8');

    assert.match(html, /repositorySelect/);
    assert.match(script, /setRepository/);
    assert.match(script, /renderRepositorySelect/);
    assert.match(provider, /repositories: this\.repositories\.repositories/);
  });

  it('registers fallback view providers when no repository is discovered', () => {
    const extension = readFileSync('src/extension.ts', 'utf8');
    const registry = readFileSync('src/activation/commandRegistry.ts', 'utf8');

    assert.match(extension, /registerNoRepositoryViews/);
    assert.match(registry, /class NoRepositoryProvider/);
    assert.match(registry, /registerTreeDataProvider\(`abstractiveScm\.\$\{view\}`/);
  });
});
