const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { describe, it } = require('node:test');

describe('SCM panel webview source layout', () => {
  it('keeps CSS and browser script out of the renderer shell', () => {
    const renderHtml = readFileSync('src/webviews/scmPanel/renderHtml.ts', 'utf8');
    const styles = readFileSync('src/webviews/scmPanel/styles.ts', 'utf8');
    const browserScript = readFileSync('src/webviews/scmPanel/browserScript.ts', 'utf8');

    assert.ok(renderHtml.length < styles.length);
    assert.ok(renderHtml.length < browserScript.length);
    assert.match(renderHtml, /panelStyles/);
    assert.match(renderHtml, /browserScript/);
  });

  it('keeps a restrictive webview CSP in the renderer shell', () => {
    const renderHtml = readFileSync('src/webviews/scmPanel/renderHtml.ts', 'utf8');

    assert.match(renderHtml, /default-src 'none'/);
    assert.match(renderHtml, /script-src 'nonce-/);
    assert.match(renderHtml, /script-src [^`]*\$\{webview\.cspSource\}/);
    assert.match(renderHtml, /connect-src \$\{webview\.cspSource\}/);
    assert.match(renderHtml, /worker-src blob: \$\{webview\.cspSource\}/);
    assert.match(renderHtml, /font-src \$\{webview\.cspSource\} data:/);
  });

  it('guards the bottom diff combined/split toggle against missing DOM and bad state', () => {
    const browserScript = readFileSync('src/webviews/scmPanel/browserScript.ts', 'utf8');

    assert.match(browserScript, /normalizeDiffView\(persistedState\.diffView\)/);
    assert.match(browserScript, /getElementById\('toggleDiffView'\)\?\.addEventListener/);
    assert.match(browserScript, /function updateDiffViewButton\(button\)/);
    assert.match(browserScript, /if \(!button\) return;/);
  });

  it('keeps split diff columns centered in the diff pane instead of line-width driven', () => {
    const styles = readFileSync('src/webviews/scmPanel/styles.ts', 'utf8');
    const browserScript = readFileSync('src/webviews/scmPanel/browserScript.ts', 'utf8');
    const diffSideRule = cssRule(styles, '.diff-side');
    const diffColumnScrollRule = cssRule(styles, '.diff-column-scroll');
    const diffSideLineRule = cssRule(styles, '.diff-side-line');
    const diffLineNumberRule = cssRule(styles, '.diff-line-number');

    assert.doesNotMatch(diffSideRule, /min-width:\s*max-content/);
    assert.match(cssRule(styles, '.diff.diff-split-mode'), /--diff-column-width:\s*50%/);
    assert.match(diffSideRule, /grid-template-columns:\s*minmax\(0,\s*var\(--diff-column-width\)\)\s+minmax\(0,\s*var\(--diff-column-width\)\)/);
    assert.match(diffSideRule, /contain:\s*layout paint size/);
    assert.match(cssRule(styles, '.diff-column'), /width:\s*var\(--diff-column-width\)/);
    assert.match(diffColumnScrollRule, /overflow-x:\s*hidden/);
    assert.match(diffColumnScrollRule, /overflow-y:\s*auto/);
    assert.match(diffSideLineRule, /grid-template-columns:\s*52px\s+minmax\(0,\s*1fr\)/);
    assert.match(diffSideLineRule, /min-width:\s*0/);
    assert.match(diffLineNumberRule, /position:\s*sticky/);
    assert.match(cssRule(styles, '.diff-line-code'), /white-space:\s*pre-wrap/);
    assert.match(browserScript, /setupSplitDiffScrolling\(\)/);
    assert.match(browserScript, /layoutSplitDiff\(\)/);
    assert.match(browserScript, /--diff-column-width/);
    assert.match(browserScript, /function renderMonacoDiff\(parsed\)/);
    assert.match(browserScript, /createDiffEditor/);
    assert.match(browserScript, /function diffModelTexts\(parsed\)/);
    assert.match(browserScript, /state\.diffOriginal/);
    assert.match(browserScript, /state\.diffModified/);
    assert.match(browserScript, /!state\.patch && !hasDiffContent\(\)/);
    assert.match(browserScript, /function configureMonacoTheme\(monaco\)/);
    assert.match(browserScript, /function configureMonacoWorkers\(\)/);
    assert.match(browserScript, /function loadMonacoWorker\(label\)/);
    assert.match(browserScript, /window\.MonacoEnvironment/);
    assert.match(browserScript, /fontFamily:\s*editorFontFamily\(\)/);
    assert.match(browserScript, /compactMode:\s*true/);
    assert.match(browserScript, /lineDecorationsWidth:\s*0/);
    assert.match(browserScript, /lineNumbers:\s*'off'/);
    assert.match(browserScript, /lineNumbersMinChars:\s*0/);
    assert.match(browserScript, /glyphMargin:\s*false/);
    assert.match(browserScript, /folding:\s*false/);
    assert.match(browserScript, /hideUnchangedRegions:\s*\{/);
    assert.match(browserScript, /onDidUpdateDiff/);
    assert.match(browserScript, /function updateMonacoDiffState\(editor\)/);
    assert.match(browserScript, /function revealFirstMonacoChange\(editor, changes\)/);
    assert.match(browserScript, /diffWordWrap:\s*'on'/);
    assert.match(browserScript, /function hunkStartPositions\(header\)/);
    assert.doesNotMatch(browserScript, /split\('\\\\\\\\n'\)/);
    assert.doesNotMatch(browserScript, /\/\\\\\\\\w\+/);
  });

  it('keeps file status badges pinned to the trailing edge', () => {
    const styles = readFileSync('src/webviews/scmPanel/styles.ts', 'utf8');
    const browserScript = readFileSync('src/webviews/scmPanel/browserScript.ts', 'utf8');

    assert.match(cssRule(styles, '.file-row'), /grid-template-columns:\s*24px\s+minmax\(0,\s*1fr\)\s+24px/);
    assert.match(cssRule(styles, '.status'), /width:\s*24px/);
    assert.match(cssRule(styles, '.status'), /text-align:\s*right/);
    assert.match(cssRule(styles, '.file-main'), /min-width:\s*0/);
    assert.match(browserScript, /class="file-main"/);
  });

  it('keeps pane dividers visually narrow while preserving resize targets', () => {
    const styles = readFileSync('src/webviews/scmPanel/styles.ts', 'utf8');
    const browserScript = readFileSync('src/webviews/scmPanel/browserScript.ts', 'utf8');

    assert.match(cssRule(styles, ':root'), /--scm-pane-divider-size:\s*1px/);
    assert.match(cssRule(styles, '.layout.diff-right'), /var\(--scm-pane-divider-size\)/);
    assert.match(cssRule(styles, '.layout.diff-bottom'), /var\(--scm-pane-divider-size\)/);
    assert.match(cssRule(styles, '.pane-divider'), /width:\s*var\(--scm-pane-divider-size\)/);
    assert.match(cssRule(styles, '.pane-divider::before'), /width:\s*11px/);
    assert.match(cssRule(styles, '.layout.diff-bottom [data-divider="2"]::before'), /height:\s*11px/);
    assert.match(browserScript, /join\(' var\(--scm-pane-divider-size\) '\)/);
    assert.match(browserScript, /px var\(--scm-pane-divider-size\) minmax/);
    assert.doesNotMatch(browserScript, /join\(' 4px '\)/);
  });
});

function cssRule(styles, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(escaped + '\\s*\\{([\\s\\S]*?)\\n    \\}').exec(styles);
  assert.ok(match, `Missing CSS rule ${selector}`);
  return match[1];
}
