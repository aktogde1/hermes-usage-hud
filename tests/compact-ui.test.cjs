const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../desktop/plugin.js'), 'utf8');
function render(windows) {
  const atom = v => ({get:()=>v, value:v});
  const state = {focusedSessionId:atom('s'), focusedStoredSessionId:atom('s'), focusedSessionProfile:atom('default'), model:atom('test'), gateway:atom('open'), focusedUsage:atom({total:100}), busy:atom(false), focusedSessionOwner:atom({connectionId:'c'})};
  const jsx = (type,props) => ({type,props});
  const sandbox = {host:{state}, useValue:a=>a.value, useQuery:()=>({data:{catalog:{providers:[{slug:'openai-codex',usage:{windows}}]},readAt:Date.now()},dataUpdatedAt:Date.now(),isError:false}), useQueryClient:()=>({}), useState:()=>[true,()=>{}], useRef:v=>({current:v}), useEffect:()=>{}, jsx, jsxs:jsx, Popover:'Popover',PopoverTrigger:'PopoverTrigger',PopoverContent:'PopoverContent'};
  vm.createContext(sandbox);
  vm.runInContext(source.replace(/^import .*$/gm,'').replace('export default {','const plugin = {')+'\nthis.renderHud = UsageHud',sandbox);
  return sandbox.renderHud();
}
function walk(n, out=[]) { if (Array.isArray(n)) n.forEach(x=>walk(x,out)); else if (n && typeof n==='object') {out.push(n); walk(n.props?.children,out)} return out; }
test('collapsed label shows quota without provider name', () => {
  const button=walk(render([{label:'Session',used_percent:5},{label:'Weekly',used_percent:15}])).find(x=>x.type==='button');
  const visible=walk(button).filter(x=>typeof x.props?.children==='string').map(x=>x.props.children).join(' ');
  assert.match(visible,/5h 95% left/); assert.match(visible,/Week 85% left/); assert.doesNotMatch(visible,/Codex/);
});
test('collapsed unavailable or multiple accounts status has no provider name', () => {
  const button=walk(render([])).find(x=>x.type==='button');
  const visible=walk(button).filter(x=>typeof x.props?.children==='string').map(x=>x.props.children).join(' ');
  assert.doesNotMatch(visible,/Codex/);
});
test('popover starts with account limits rather than product name', () => {
  const panel=walk(render([])).find(x=>x.type==='PopoverContent');
  assert.equal(panel.props.children[0].props.children,'Codex account limits');
});
