import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const record = JSON.parse(await readFile(new URL('fixtures/browser/observed-traces.json', import.meta.url), 'utf8'));
const browserActions = new Set(['create', 'reuse', 'attach', 'navigate', 'capture', 'close']);

function checkTrace(item) {
  const steps = item.trace;
  const operations = steps.map((step) => step.operation);
  const matches = (operation) => steps.filter((step) => step.operation === operation);
  let observed = null;
  const closed = new Set();
  let needsObservation = false;
  for (const step of steps) {
    if (step.operation === 'inventory') {
      observed = step.result;
      needsObservation = false;
    }
    if (step.operation === 'close') {
      assert.ok(observed, 'close requires observed state');
      assert.equal(needsObservation, false, 'observe between closes');
      const target = observed.aliases?.[step.args[0]] ?? step.args[0];
      assert.equal(observed.tabs[target]?.owner, 'task', 'fixture closure authority');
      assert.equal(closed.has(target), false, 'no redundant underlying close');
      closed.add(target);
      needsObservation = true;
    }
    if (item.state.browserAvailable === false || item.state.nativeCrashRecurrence) {
      assert.equal(browserActions.has(step.operation), false, 'unavailable or recurrent-crash UI must stay pending');
    }
  }
  switch (item.id) {
    case 'records':
      assert.equal(operations.some((op) => browserActions.has(op)), false);
      assert.equal(matches('connector')[0].result.records.length, matches('connector')[0].result.count);
      break;
    case 'pages':
      assert.equal(matches('create').length, 0);
      assert.equal(matches('navigate').length, 3);
      assert.equal(matches('capture').length, 6);
      assert.ok(steps.filter((step) => browserActions.has(step.operation)).every((step) => step.args[0] === 'work'));
      break;
    case 'cleanup': assert.equal(matches('close').length, 2); break;
    case 'aliases': assert.equal(matches('close').length, 1); break;
    case 'timeout': {
      const closeIndex = operations.indexOf('close');
      assert.equal(steps[closeIndex].result.timeout, true);
      assert.equal(steps[closeIndex + 1].operation, 'inventory');
      assert.equal(steps[closeIndex + 1].result.reappeared, 'work');
      assert.equal(steps.slice(closeIndex + 1).some((step) => browserActions.has(step.operation)), false);
      break;
    }
    case 'recurrence': assert.equal(matches('api')[0].result.rendered_verification, false); break;
    case 'selected':
      assert.ok(steps.filter((step) => browserActions.has(step.operation)).every((step) => step.args[0] === 'chosen'));
      assert.equal(matches('attach')[0].result.provider, 'chrome');
      assert.equal(matches('connector').length, 0);
      break;
    case 'comparison':
      assert.equal(matches('create').length, 1);
      assert.equal(matches('close').length, 0);
      assert.equal(Object.keys(matches('inventory').at(-1).result.tabs).length, 2);
      break;
    case 'search':
      assert.equal(operations.some((op) => browserActions.has(op)), false);
      assert.equal(matches('web-search').length, 1);
      break;
    case 'unavailable': assert.equal(matches('api').length, 0); break;
    default: assert.fail('unrecognized evaluation case');
  }
}

test('ten independently executed synthetic browser traces preserve the declared workflow boundaries', () => {
  assert.equal(record.cases.length, 10);
  for (const item of record.cases) checkTrace(item);
});

test('trace admission rejects redundant closure, skipped observation, foreign closure and timeout retry', () => {
  const byId = (id) => structuredClone(record.cases.find((item) => item.id === id));
  const alias = byId('aliases');
  alias.trace.push({ operation: 'close', args: ['tabHandle'], result: {} });
  assert.throws(() => checkTrace(alias));
  const cleanup = byId('cleanup');
  cleanup.trace.splice(2, 1);
  assert.throws(() => checkTrace(cleanup));
  const foreign = byId('cleanup');
  foreign.trace[1].args = ['foreign'];
  assert.throws(() => checkTrace(foreign));
  const timeout = byId('timeout');
  timeout.trace.push({ operation: 'attach', args: ['work'], result: {} });
  assert.throws(() => checkTrace(timeout));
  const recurrence = byId('recurrence');
  recurrence.trace.push({ operation: 'create', args: ['retry', 'iab'], result: {} });
  assert.throws(() => checkTrace(recurrence));
});
