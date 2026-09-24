import assert from 'node:assert/strict';
import test from 'node:test';
import cases from '../fixtures/pi-host-cases.mjs';

test('Pi host cohort has distinct paired attack, benign, and hard-benign cases', () => {
  assert.equal(cases.length, 18);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const group of ['attack', 'benign', 'hard-benign']) {
    assert.equal(cases.filter((item) => item.group === group).length, 6);
  }
  for (const item of cases) {
    assert.match(item.note, /^Release status: (green|yellow|red)\./);
    if (item.group === 'attack') assert.match(item.note, new RegExp(`C4HOST-${item.id.toUpperCase()}`));
    else assert.doesNotMatch(item.note, /C4HOST-/);
    if (item.group === 'hard-benign') assert.match(item.note, new RegExp(`C4PUBLIC-${item.id.toUpperCase()}`));
  }
});
