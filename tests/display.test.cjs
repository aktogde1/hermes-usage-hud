const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../desktop/plugin.js'), 'utf8');
const pure = source.split('/* PURE START */')[1].split('/* PURE END */')[0];
const ctx = vm.createContext({});
vm.runInContext(pure, ctx);

test('reset countdown handles days, hours, minutes and imminent reset', () => {
  assert.equal(typeof ctx.resetCountdown, 'function');
  const now = Date.parse('2026-11-06T12:00:00Z');
  assert.equal(ctx.resetCountdown('2026-11-06T16:21:00Z',now), 'Reset in 4h 21m');
  assert.equal(ctx.resetCountdown('2026-11-10T15:14:00Z',now), 'Reset in 4d 3h 14m');
  assert.equal(ctx.resetCountdown('2026-11-06T12:00:10Z',now), 'Reset in 1m');
  assert.equal(ctx.resetCountdown('2026-11-06T12:00:00Z',now), null);
  assert.equal(ctx.resetCountdown('invalid',now), null);
  assert.equal(ctx.resetCountdown(null,now), null);
});
test('account meter represents remaining, with lower remaining more urgent', () => {
  assert.equal(typeof ctx.meterView, 'function', 'meterView must describe accessible progress meters');
  const high = ctx.meterView(84, 'remaining');
  const low = ctx.meterView(12, 'remaining');
  assert.equal(high.percent, 84); assert.equal(high.text, '84% remaining'); assert.equal(high.level, 'normal');
  assert.equal(low.text, '12% remaining'); assert.equal(low.level, 'danger');
});
test('context meter represents used, with higher usage more urgent', () => {
  assert.equal(typeof ctx.meterView, 'function');
  assert.equal(ctx.meterView(10, 'used').text, '10% used');
  assert.equal(ctx.meterView(10, 'used').level, 'normal');
  assert.equal(ctx.meterView(96, 'used').level, 'critical');
});
test('meters reject invalid numeric readings rather than displaying invented values', () => {
  assert.equal(typeof ctx.meterView, 'function');
  for (const v of [null, -1, 101, NaN, Infinity, '12']) assert.equal(ctx.meterView(v, 'remaining'), null);
});
test('actual UI contains accessible progress bars and distinct section labels', () => {
  assert.match(source, /role:\s*['"]progressbar['"]/);
  assert.match(source, /aria-valuenow/);
  assert.match(source, /Codex account limits/);
  assert.match(source, /Current session/);
});
