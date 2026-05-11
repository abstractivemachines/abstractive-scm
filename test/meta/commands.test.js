const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { describe, it } = require('node:test');

const manifest = require('../../package.json');

describe('command metadata', () => {
  it('keeps package contributions registered in the no-repository fallback', () => {
    const source = readFileSync('src/activation/commandRegistry.ts', 'utf8');
    const registered = new Set(Array.from(source.matchAll(/'abstractiveScm\.[^']+'/g), ([match]) => match.slice(1, -1)));
    const contributed = manifest.contributes.commands.map((command) => command.command);

    assert.deepEqual(
      contributed.filter((command) => !registered.has(command)),
      []
    );
  });

  it('does not register stale no-repository command ids', () => {
    const source = readFileSync('src/activation/commandRegistry.ts', 'utf8');
    const registered = Array.from(new Set(Array.from(source.matchAll(/'abstractiveScm\.[^']+'/g), ([match]) => match.slice(1, -1))));
    const contributed = new Set(manifest.contributes.commands.map((command) => command.command));

    assert.deepEqual(
      registered.filter((command) => !contributed.has(command)),
      []
    );
  });
});
