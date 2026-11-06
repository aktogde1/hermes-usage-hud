const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const pluginPath = path.resolve(__dirname, '../desktop/plugin.js');
const src = fs.existsSync(pluginPath) ? fs.readFileSync(pluginPath, 'utf8') : '';
const code = src.split('/* PURE START */')[1]?.split('/* PURE END */')[0] || '';
const ctx = vm.createContext({});
vm.runInContext(code, ctx);
const plain = value => JSON.parse(JSON.stringify(value));
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'openai-codex-usage.json'), 'utf8'));
// Synthetic fixture matching the documented window format; not account data.
test('fixture windows yield the exact complementary remaining percentages', () => {
  assert.equal(typeof ctx.windowViews, 'function', 'windowViews implementation is missing');
  const out = plain(ctx.windowViews(sample.windows, Date.parse(sample.fetched_at)));
  assert.deepEqual(out.map(w => [w.label,w.remaining,w.resets_at]), [
    ['5h',80,'2026-10-09T16:14:55+00:00'], ['Week',52,'2026-10-15T12:32:34+00:00']
  ]);
});
test('unknown, invalid, expired and non-account windows never become confident percentages', () => {
  assert.equal(typeof ctx.windowViews, 'function');
  const windows = [{label:'Session',used_percent:null},{label:'Weekly',used_percent:'48'},
    {label:'Weekly',used_percent:101},{label:'Session',used_percent:-1},
    {label:'Session',used_percent:10,resets_at:'2000-01-01'},
    {label:'Session',used_percent:10,scope:'model'}, {label:'Other',used_percent:20}];
  assert.deepEqual(plain(ctx.windowViews(windows,Date.now())),[]);
});
test('zero remaining and decimal precision are preserved', () => {
  assert.equal(typeof ctx.windowViews,'function');
  assert.deepEqual(plain(ctx.windowViews([{label:'Session',used_percent:100},{label:'Weekly',used_percent:25.5}],0)).map(w=>w.remaining),[0,74.5]);
});
test('multiple account pools are not averaged or replaced with one account', () => {
  assert.equal(typeof ctx.accountView,'function');
  const payload = {providers:[{slug:'openai-codex',usage:{accounts:[{id:'a'},{id:'b'}]}}]};
  assert.deepEqual(plain(ctx.accountView(payload,0).windows),[]);
  assert.equal(ctx.accountView(payload,0).multiple,true);
});
test('session total uses server total and never adds cached tokens twice', () => {
  assert.equal(typeof ctx.sessionRows,'function');
  const rows = plain(ctx.sessionRows({input:1000,output:200,total:1200,cache_read:900}));
  assert.deepEqual(rows,[['Input tokens','1,000'],['Output tokens','200'],['Session total','1,200']]);
  assert.deepEqual(plain(ctx.sessionRows(null)),[]);
  assert.deepEqual(plain(ctx.sessionRows({total:0})),[['Session total','0']]);
});
test('remaining thresholds match requested boundary behavior', () => {
  assert.equal(typeof ctx.remainingLevel,'function');
  assert.deepEqual([100,51,50,20,19,0].map(ctx.remainingLevel),['normal','normal','warning','warning','danger','danger']);
});
test('context thresholds match requested boundary behavior', () => {
  assert.equal(typeof ctx.contextLevel,'function');
  assert.deepEqual([0,49,50,79,80,95,96].map(ctx.contextLevel),['normal','normal','warning','warning','danger','danger','critical']);
});
test('compact token display is rounded formatting of exact total', () => {
  assert.equal(typeof ctx.compactTokens,'function');
  assert.equal(ctx.compactTokens(18400),'18.4k');
  assert.equal(ctx.compactTokens(0),'0');
  assert.equal(ctx.compactTokens(undefined),null);
});
