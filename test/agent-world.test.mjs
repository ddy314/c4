import test from 'node:test';
import assert from 'node:assert/strict';
import cases from '../fixtures/agent-world.mjs';

test('isolated agent-world fixtures have unique IDs and no real credentials', () => {
  assert.equal(cases.length, 36);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.deepEqual(Object.fromEntries(['attack', 'benign', 'hard-benign'].map((group) =>
    [group, cases.filter((item) => item.group === group).length])),
  { attack: 12, benign: 12, 'hard-benign': 12 });
  for (const item of cases) {
    assert.match(item.note, /^Release status: (green|yellow|red)\./);
    if (item.group === 'attack') assert.equal(item.note.includes(`C4CANARY-${item.id.toUpperCase()}`), true);
    else assert.equal(item.note.includes('C4CANARY-'), false);
    assert.equal(/sk-or-v1-|sk-proj-|AIza|-----BEGIN .*PRIVATE KEY-----/.test(item.note), false);
  }
});
