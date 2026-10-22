const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

function boot(memory = new Map(), options = {}) {
  const elements = new Map();
  const listeners = {};
  function element(id = '') {
    return {
      id, children: [], hidden: false, style: {}, dataset: {}, disabled: false,
      classList: {add() {}, remove() {}, contains() { return false; }},
      addEventListener(type, cb) { this.listeners ??= {}; this.listeners[type] = cb; },
      setAttribute() {}, setPointerCapture() {},
      appendChild(value) { this.children.push(value); return value; },
      replaceChildren(...values) { this.children = [...values]; },
      textContent: '', type: 'button'
    };
  }
  const canvas = element('field');
  const context2d = new Proxy({
    createLinearGradient() {return {addColorStop() {}};},
    createRadialGradient() {return {addColorStop() {}};}
  }, {get(obj, key) {return key in obj ? obj[key] : () => {};}, set(obj, key, val) {obj[key] = val; return true;}});
  canvas.getContext = () => context2d;
  elements.set('field', canvas);
  const el = id => {if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id);};
  const document = {
    hidden: false,
    getElementById: el,
    querySelectorAll(selector) {
      if(selector !== '[data-dir]') return [];
      return ['up','down','left','right'].map(dir => {
        const button = element(); button.dataset.dir = dir; return button;
      });
    },
    createElement() {return element();},
    createTextNode(v) {return {textContent: String(v)};},
    addEventListener(type, fn) {listeners[type] = fn;}
  };
  const window = {
    devicePixelRatio: 1, matchMedia() {return {matches:false};},
    addEventListener() {}
  };
  class FakeImage {
    constructor(){this.complete = false;this.naturalWidth = 0;}
    set src(value){this.value = value;}
  }
  const sandbox = {
    document, window, localStorage: {
      getItem(k){return memory.get(k) ?? null;},
      setItem(k,v){if(options.storageDenied) throw Error('Storage disabled'); memory.set(k,v);}
    },
    Image:FakeImage, navigator:{deviceMemory:4,hardwareConcurrency:8},
    performance:{now:()=>1000},requestAnimationFrame:()=>1,
    console, Math, JSON, Set, Map, WeakSet, Number, String, Object, Array
  };
  vm.runInNewContext(scripts[0], sandbox, {timeout:10000, filename:'kototanki-game.js'});
  return {window, document, el, memory, listeners, game:window.__gameDebug, premium:window.__premiumDebug};
}
function clearLevel(runtime, number) {
  if (number) runtime.game.level(number);
  const state = runtime.game.get();
  state.toSpawn = 0;
  state.dogs = [];
  runtime.game.update(0.016);
}
test('game bundle loads and retains sprites', () => {
  assert.equal(scripts.length,3);
  assert.match(html,/const encoded=/);
  for(let i=0;i<5;i++) assert.ok(html.includes('"dog'+i+'"'));
  const run=boot();
  assert.equal(run.game.get().n,1);
  assert.match(run.el('heading').textContent,/КОТОТАНКИ/);
});
test('start from menu and award coins, stars, and next level', () => {
  const run=boot();
  run.el('start').onclick();
  assert.equal(run.game.get().state,'playing');
  clearLevel(run);
  assert.equal(run.game.get().state,'next');
  assert.equal(run.premium.getSave().unlocked,2);
  assert.ok(run.premium.getSave().coins>0);
  assert.equal(run.premium.getSave().stars[1],3);
});
test('replay awards reduced rewards and no new stars', () => {
  const run=boot();
  run.el('start').onclick();
  clearLevel(run);
  const original=run.premium.getSave().coins;
  clearLevel(run,1);
  assert.ok(run.premium.getSave().coins>original);
  assert.ok(run.premium.getSave().coins-original<original);
  assert.equal(run.premium.getSave().stars[1],3);
});
test('upgrade is earned not paid, changes new stage and survives reload', () => {
  const shared=new Map(),run=boot(shared);
  for(let n=1;n<=4;n++) clearLevel(run,n);
  assert.equal(run.premium.getSave().unlocked,5);
  assert.equal(run.premium.buyUpgrade('armor'),true);
  assert.equal(run.premium.getSave().upgrades.armor,1);
  run.game.level(5);
  assert.equal(run.game.get().cat.lives,4);
  const reloaded=boot(shared);
  assert.equal(reloaded.premium.getSave().unlocked,5);
  assert.equal(reloaded.premium.getSave().upgrades.armor,1);
  reloaded.game.level(5);
  assert.equal(reloaded.game.get().cat.lives,4);
});
test('unaffordable or unknown upgrade is rejected without charging', () => {
  const run=boot();
  assert.equal(run.premium.buyUpgrade('armor'),false);
  assert.equal(run.premium.buyUpgrade('bad_upgrade'),false);
  assert.equal(run.premium.getSave().coins,0);
});
test('menu renders 30 levels and shop and skins', () => {
  const run=boot();
  const sections=run.el('metaPanel').children;
  assert.ok(sections.length>=5);
  const levels=sections.find(s=>s.children.some(c=>c.className==='metaGrid'));
  assert.ok(levels);
  const buttons=levels.children.find(c=>c.className==='metaGrid').children;
  assert.equal(buttons.length,30);
  assert.equal(buttons[0].disabled,false);
  assert.equal(buttons[1].disabled,true);
});
test('menu key pauses gameplay and tab going background pauses', () => {
  const run=boot();
  run.el('start').onclick();
  run.el('center').listeners.click();
  assert.equal(run.game.get().state,'paused');
  run.premium.showMenu();
  run.el('start').onclick();
  run.document.hidden=true;
  run.listeners.visibilitychange();
  assert.equal(run.game.get().state,'paused');
});
test('broken storage does not crash the game', () => {
  const shared=new Map([['kototanki.save.v1','{broken']]);
  const run=boot(shared);
  assert.equal(run.premium.getSave().unlocked,1);
  const run2=boot(new Map(),{storageDenied:true});
  assert.equal(run2.premium.getSave().unlocked,1);
  run2.el('start').onclick();
  clearLevel(run2);
  assert.equal(run2.premium.getSave().unlocked,2);
});
test('malformed save values are limited to legal bounds', () => {
  const data={version:1,unlocked:999,coins:-100,bestScore:'bad',upgrades:{armor:999,rapid:-5,fort:1},skin:'bad',stars:{1:999},audio:false};
  const run=boot(new Map([['kototanki.save.v1',JSON.stringify(data)]]));
  const save=run.premium.getSave();
  assert.equal(save.unlocked,30);
  assert.equal(save.coins,0);
  assert.equal(save.upgrades.armor,2);
  assert.equal(save.upgrades.rapid,0);
  assert.equal(save.skin,'ginger');
  assert.equal(save.audio,false);
  assert.equal(save.stars[1],3);
});
test('sound setting survives page reload', () => {
  const shared=new Map(),run=boot(shared);
  run.el('sound').listeners.click();
  assert.equal(run.premium.getSave().audio,false);
  const reloaded=boot(shared);
  assert.equal(reloaded.premium.getSave().audio,false);
  assert.equal(reloaded.el('sound').textContent,'🔇');
});
test('completing level 30 records the finish', () => {
  const run=boot();
  clearLevel(run,30);
  assert.equal(run.premium.getSave().unlocked,30);
  assert.equal(run.premium.getSave().finishes,1);
  assert.equal(run.game.get().state,'end');
});
test('UI has mobile controls, proper HTML, and no external dependencies', () => {
  assert.match(html,/Mobile control upgrade/);
  assert.match(html,/data-dir="up"/);
  assert.match(html,/id="fire"/);
  assert.match(html,/id="bomb"/);
  assert.match(html,/id="metaPanel"/);
  assert.match(html,/Bright arcade palette/);
  assert.ok(html.endsWith('</script></body></html>'));
  assert.ok(!/<script\s+src=/i.test(html));
});
