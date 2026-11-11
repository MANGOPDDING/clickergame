const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const html = fs.readFileSync(process.argv[2] || 'outputs/game-prototype-v5-accessories.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

// Exercise the complete game script and delegated UI handlers without live saves or timers.
function boot(saved = {}) {
  const nodes = new Map();
  const handlers = new Map();
  const timers = [];
  function element(id = '') {
    const classes = new Set();
    let markup = "";
    return { id, htmlWrites: 0, get innerHTML() { return markup; }, set innerHTML(value) { markup = value; this.htmlWrites++; this.scrollTop = 0; this.scrollLeft = 0; }, textContent: '', value: '', hidden: false, disabled: false,
      listeners: new Map(), style: { setProperty(key, value) { this[key] = value; } }, dataset: {}, children: [],
      classList: { add(value) { classes.add(value); }, remove(value) { classes.delete(value); },
        contains(value) { return classes.has(value); },
        toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); } },
      appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); },
      insertAdjacentElement(position, child) { nodes.set(child.id, child); },
      setAttribute() {}, addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(callback); }, remove() { this.removed = true; }, matches() { return false; },
      closest(selector) { return selector === 'button' ? this : null; }
    };
  }
  const document = { head: element(), body: element(), activeElement: element(),
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); },
    createElement() { return element(); }, querySelectorAll() { return []; },
    addEventListener(type, fn, options) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push({ fn, capture: options === true });
    }
  };
  const storage = { ...saved, getItem(key) { return this[key] || null; }, setItem(key, value) { this[key] = value; } };
  const context = vm.createContext({ document, localStorage: storage, crypto: webcrypto, console,
    setInterval() {}, setTimeout(callback) { timers.push(callback); }, confirm() { return true; }, location: { reload() {} }, window: {} });
  vm.runInContext(script, context);
  const run = source => vm.runInContext(source, context);
  function click(id, dataset = {}) {
    const button = nodes.get(id) || element(id);
    button.dataset = dataset;
    let stopped = false, propagationStopped = false;
    const event = { target: button, preventDefault() {}, stopImmediatePropagation() { stopped = true; propagationStopped = true; }, stopPropagation() { propagationStopped = true; } };
    const entries = handlers.get('click') || [];
    for (const entry of entries.filter(entry => entry.capture)) { if (stopped) break; entry.fn(event); }
    if (!stopped) for (const callback of button.listeners.get('click') || []) { callback(event); if (stopped) break; }
    if (!propagationStopped) for (const entry of entries.filter(entry => !entry.capture)) { if (stopped) break; entry.fn(event); }
  }
  function fire(type, event) {
    for (const entry of (handlers.get(type) || []).slice().sort((a, b) => Number(b.capture) - Number(a.capture))) entry.fn(event);
  }
  function flushTimers() {
    while (timers.length) timers.shift()();
  }
  return { run, click, nodes, storage, fire, flushTimers };
}

const app = boot();
const run = app.run;
assert.equal(run('s.selected'), 1);
for (const [era, chance] of [[7, 0], [8, .01], [15, .01], [16, .015], [23, .015], [24, .02], [31, .02], [32, .025]]) {
  assert.equal(run(`accessoryDropChance(${era})`), chance);
}
for (let era = 1; era <= 32; era++) {
  assert.ok(Math.abs(run(`socketDistribution(${era}).reduce((a,b)=>a+b,0)`) - 1) < 1e-12);
  if (era >= 8) assert.equal(run(`accessoryRarityWeights(${era}).reduce((a,b)=>a+b,0)`), 10000);
  for (let trial = 0; trial < 100; trial++) assert.ok(run(`drawSocketCount(${era})`) <= Math.floor(era / 8));
}
for (let tier = 1; tier <= 20; tier++) {
  const base = .6 + .24 * (tier - 1);
  for (const [type, factor] of [['attack', 1], ['defense', 1], ['hp', 1.5], ['crit', .6], ['critDamage', 4], ['speed', 2]]) {
    assert.equal(run(`accessoryValue({type:'${type}',rarityTier:${tier}})`), Number((base * factor).toFixed(3)));
  }
}
const statCheck = boot();
statCheck.run("s=fresh();s.equipment.weapon=applyGearPower(Object.assign(makeItem(5,200),{slot:'weapon',type:'片手剣'}));s.equipment.body=applyGearPower(Object.assign(makeItem(5,200),{slot:'body',type:'胴防具'}));s.equipment.weapon.sockets=[];s.equipment.body.sockets=[];const beforeGems=stats();s.equipment.body.sockets=ACCESSORY_TYPES.map(type=>({id:type.key,type:type.key,rarityTier:20}));const afterGems=stats()");
for (const [field, factor] of [['attack', 1.0516], ['defense', 1.0516], ['hp', 1.0774], ['speed', 1.1032]]) {
  assert.ok(Math.abs(statCheck.run(`afterGems.${field}/beforeGems.${field}`) - factor) < 1e-9, field);
}
assert.ok(Math.abs(statCheck.run('afterGems.crit-beforeGems.crit') - 3.096) < 1e-9);
assert.ok(Math.abs(statCheck.run('afterGems.critDamage-beforeGems.critDamage') - .2064) < 1e-9);
statCheck.run("s.equipment.body.sockets=Array(40).fill({type:'crit',rarityTier:20})");
assert.equal(statCheck.run('stats().crit'), 100);
run("s=fresh();s.unlocked=512;s.selected=512;const gear=makeItem(10,512);gear.sockets=Array(4).fill(null);s.inventory.push(gear);s.accessories.push({id:'test-gem',type:'speed',rarityTier:20});selectedItemId=gear.id;");
app.click('', { socketOpen: '0', socketItem: run('gear.id') });
assert.ok(app.nodes.get('accessory-picker-content').innerHTML.includes('10.32%'));
app.click('', { gemInstall: 'test-gem' });
assert.equal(run('s.accessories.length'), 0);
assert.equal(run('gear.sockets[0].id'), 'test-gem');
assert.equal(run("installAccessory(gear.id,0,'test-gem')"), false);
app.click('', { itemAction: 'equip' });
assert.equal(run('equipped(gear.slot).id'), run('gear.id'));
assert.ok(Math.abs(run('stats().speed') / run('gear.slot === "weapon" ? gear.speed : (typeof starterGearBySlot === "undefined" ? 1 : starterGearBySlot.weapon.speed) * (1 + (gear.attackSpeedBonus || 0))') - 1.1032) < 1e-9);
app.click('', { socketRemove: '0', socketItem: run('gear.id') });
assert.equal(run('s.accessories.length'), 1);
assert.equal(run('gear.sockets[0]'), null);
app.click('', { inventoryTab: 'accessories' });
assert.equal(app.nodes.get('accessory-panel').hidden, false);
assert.equal(app.nodes.get('inventory-content').hidden, true);
app.click('', { gemEquip: 'test-gem' });
app.click('', { gemDestination: run('gear.id'), socketIndex: '1', gemId: 'test-gem' });
assert.equal(run('gear.sockets[1].id'), 'test-gem');
run('save()');
const reload = boot({ townSaveV7: app.storage.townSaveV7 });
assert.equal(reload.run('Object.values(s.equipment)[0].sockets[1].id'), 'test-gem');
const raw = JSON.parse(app.storage.townSaveV7);
Object.values(raw.equipment)[0].dur = 0;
const broken = boot({ townSaveV7: JSON.stringify(raw) });
assert.equal(broken.run('Object.keys(s.equipment).length'), 0);
assert.equal(broken.run('s.inventory[0].sockets[1].id'), 'test-gem');
assert.equal(broken.run('stats().speed'), broken.run('typeof starterGearBySlot === "undefined" ? 1 : starterGearBySlot.weapon.speed'));
const legacy = { inventory: [{ id: 'legacy', slot: 'weapon', type: '片手剣', rarityTier: 5, gearLevel: 512,
  attack: 3, speed: 1, balanceVersion: 2, dur: 100 }], selected: 1 };
assert.equal(boot({ townSaveV6: JSON.stringify(legacy) }).run('s.inventory[0].sockets.length'), 0);

for (const action of ['sell', 'disassemble', 'manual-disassemble', 'manual-fusion', 'bulk-disassembly', 'bulk-fusion']) {
  const test = boot();
  const evaluate = test.run;
  evaluate("s=fresh();s.unlocked=512;s.selected=512;const gear=makeItem(1,512);gear.sockets=[{id:'refund',type:'attack',rarityTier:15}];s.inventory=[gear];");
  if (action === 'sell' || action === 'disassemble') {
    evaluate('selectedItemId=gear.id'); test.click('', { itemAction: action });
  }
  if (action === 'manual-disassemble') {
    evaluate("inventoryMode='disassemble';disassemblySelection=[gear.id]"); test.click('inventory-disassemble-action');
  }
  if (action === 'manual-fusion' || action === 'bulk-fusion') evaluate('for(let i=0;i<15;i++)s.inventory.push(makeItem(1,512))');
  if (action === 'manual-fusion') {
    evaluate("inventoryMode='fusion';fusionSelection=s.inventory.map(item=>item.id)"); test.click('inventory-fuse-action');
  }
  if (action.startsWith('bulk-')) {
    for (const field of ['type', 'rarity', 'upgrade', 'durability']) evaluate(`$('bulk-filter-${field}').value='all'`);
    evaluate("$('bulk-filter-level-min').value='1';$('bulk-filter-level-max').value='512'");
    test.click(action === 'bulk-fusion' ? 'inventory-bulk-fusion' : 'inventory-bulk-disassembly');
    test.click('bulk-select-matches');
    assert.equal(test.nodes.get('bulk-confirm').disabled, false);
    assert.equal(evaluate('s.accessories.length'), 0);
    test.click('bulk-confirm');
  }
  assert.equal(evaluate('s.accessories.filter(gem=>gem.id==="refund").length'), 1, action);
  assert.equal(evaluate('s.inventory.some(item=>item.id===gear.id)'), false, action);
}
run("s=fresh();s.lifetimePros=180;s.stash=[gear];gear.sockets=[{id:'carry',type:'crit',rarityTier:20}];s.accessories=[{id:'loose',type:'hp',rarityTier:1}];prestige()");
assert.equal(run('s.stash[0].sockets[0].id'), 'carry');
assert.equal(run('s.accessories.length'), 0);
run('s=fresh();s.unlocked=128;s.selected=128;s.runKills=7;Math.random=()=>0;rewardForKill({name:"test",isBoss:false})');
assert.equal(run('s.selected'), 129);
assert.equal(run('s.accessories.length'), 1);
if (html.includes('bulk-filter-rarity-rule')) {
  for (const mode of ['fusion', 'disassembly']) {
    const test = boot();
    const evaluate = test.run;
    evaluate("s=fresh();s.unlocked=512;s.selected=512;for(let tier=1;tier<=3;tier++){for(let i=0;i<16;i++){const item=makeItem(tier,100);item.level=2;item.sockets=[];s.inventory.push(item)}}const favorite=makeItem(1,100);favorite.favorite=true;s.inventory.push(favorite);const overLevel=makeItem(1,101);s.inventory.push(overLevel);const overUpgrade=makeItem(1,100);overUpgrade.level=3;s.inventory.push(overUpgrade)");
    evaluate("$('bulk-filter-type').value='all';$('bulk-filter-rarity').value='2';$('bulk-filter-rarity-rule').value='lte';$('bulk-filter-level-rule').value='lte';$('bulk-filter-level-min').value='101';$('bulk-filter-level-max').value='100';$('bulk-filter-upgrade').value='max-2';$('bulk-filter-durability').value='all'");
    assert.equal(evaluate('bulkMatches(s.inventory[0])'), true);
    assert.equal(evaluate('bulkMatches(s.inventory[16])'), true);
    assert.equal(evaluate('bulkMatches(s.inventory[32])'), false);
    assert.equal(evaluate('bulkMatches(favorite)'), false);
    assert.equal(evaluate('bulkMatches(overLevel)'), false);
    assert.equal(evaluate('bulkMatches(overUpgrade)'), false);
    evaluate("$('bulk-filter-rarity-rule').value='exact'");
    assert.equal(evaluate('bulkMatches(s.inventory[0])'), false);
    assert.equal(evaluate('bulkMatches(s.inventory[16])'), true);
    evaluate("$('bulk-filter-rarity-rule').value='lte';$('bulk-filter-level-rule').value='range';$('bulk-filter-level-min').value='101'");
    assert.equal(evaluate('bulkMatches(s.inventory[0])'), false);
    evaluate("$('bulk-filter-level-rule').value='lte'");
    test.click(mode === 'fusion' ? 'inventory-bulk-fusion' : 'inventory-bulk-disassembly');
    test.click('bulk-select-matches');
    assert.equal(evaluate('bulkSelection.length'), 32);
    assert.equal(evaluate('s.inventory.length'), 51);
    evaluate('invalidateBulkPreview({target:{closest:()=>true}})');
    assert.equal(evaluate('bulkFilterApplied'), false);
    assert.equal(test.nodes.get('bulk-confirm').disabled, true);
    assert.equal(test.nodes.get('bulk-filter-level-min').hidden, true);
    test.click('bulk-confirm');
    assert.equal(evaluate('s.inventory.length'), 51);
    test.click('bulk-select-matches');
    test.click('bulk-confirm');
    assert.equal(evaluate('s.inventory.filter(item=>item.rarityTier===3).length') >= 16, true);
    assert.equal(evaluate('s.inventory.some(item=>item.id===favorite.id)'), true);
    assert.equal(evaluate('s.inventory.some(item=>item.id===overLevel.id)'), true);
    assert.equal(evaluate('s.inventory.some(item=>item.id===overUpgrade.id)'), true);
  }
  console.log('PASS: inclusive rarity/level/enhancement limits, exact and range modes, favorites, combined filters, preview invalidation, both bulk confirmation routes');
}
if (html.includes('function renderBattleBoard')) {
  const visual = boot();
  visual.run("s=fresh();s.unlocked=512;s.selected=512;s.equipment.weapon=applyGearPower(Object.assign(makeItem(10,512),{slot:'weapon',type:'片手剣'}));s.enemies=[{id:1,name:'enemy-a',icon:'A',hp:50,max:100},{id:2,name:'enemy-b',icon:'B',hp:25,max:100},{id:3,name:'boss',icon:'C',hp:200,max:300,isBoss:true}];s.runKills=2;render()");
  const board = visual.nodes.get('enemy-board').innerHTML;
  assert.equal((board.match(/class="enemy-card/g) || []).length, 3);
  assert.equal((board.match(/class="enemy-card targeted/g) || []).length, 2);
  assert.ok(board.includes('width:50%'));
  assert.ok(board.includes('BOSS'));
  assert.ok(visual.nodes.get('wave-summary').textContent.includes('2 / 8'));
  assert.equal(visual.nodes.get('game-app').dataset.eraTheme, 'cosmic');
  visual.run('s.selected=1;s.enemies=[];render()');
  assert.equal(visual.nodes.get('game-app').dataset.eraTheme, 'village');
  assert.ok(visual.nodes.get('enemy-board').innerHTML.includes('enemy-waiting'));
  console.log('PASS: multiple enemy HP cards, weapon target markers, boss label, remaining kills, era palette, empty battlefield');
}
if (html.includes('function bulkRepair()')) {
  const repairMultiplier = html.includes('Math.ceil((100 - durability) * .35) * 5') ? 5 : 1;
  const repair = boot();
  repair.run("s=fresh();const worn=makeItem(1,1);worn.dur=90;const damaged=makeItem(1,1);damaged.dur=50;damaged.favorite=true;const brokenItem=makeItem(1,1);brokenItem.dur=0;brokenItem.sockets=[{id:'retained',type:'speed',rarityTier:10}];const healthy=makeItem(1,1);healthy.dur=100;const stored=makeItem(1,1);stored.dur=20;s.inventory=[damaged,brokenItem,healthy];s.equipment[worn.slot]=worn;s.stash=[stored];s.gold=1;render()");
  assert.ok(repair.nodes.get('inventory-bulk-repair').textContent.includes(`${57 * repairMultiplier}G`));
  repair.click('inventory-bulk-repair');
  assert.equal(repair.run('s.gold'), 1);
  assert.equal(repair.run('damaged.dur'), 50);
  assert.equal(repair.run('brokenItem.dur'), 0);
  assert.ok(repair.run('inventoryModeNotice').includes('不足'));
  repair.run(`s.gold=${100 * repairMultiplier};confirm=()=>false`);
  repair.click('inventory-bulk-repair');
  assert.equal(repair.run('s.gold'), 100 * repairMultiplier);
  assert.equal(repair.run('worn.dur'), 90);
  repair.run('confirm=()=>true');
  repair.click('inventory-bulk-repair');
  assert.equal(repair.run('s.gold'), 43 * repairMultiplier);
  assert.equal(repair.run('worn.dur'), 100);
  assert.equal(repair.run('damaged.dur'), 100);
  assert.equal(repair.run('brokenItem.dur'), 100);
  assert.equal(repair.run('brokenItem.sockets[0].id'), 'retained');
  assert.equal(repair.run('stored.dur'), 20);
  assert.equal(repair.nodes.get('inventory-bulk-repair').disabled, true);
  repair.click('inventory-bulk-repair');
  assert.equal(repair.run('s.gold'), 43 * repairMultiplier);
  assert.equal(repair.run('equipmentRepairCost({dur:99.9})'), repairMultiplier);
  const restored = boot({ townSaveV7: repair.storage.townSaveV7 });
  assert.equal(restored.run('s.gold'), 43 * repairMultiplier);
  assert.equal(restored.run('s.inventory.every(item=>item.dur===100)'), true);
  console.log('PASS: bulk repair cost, favorites, equipped and broken gear, cancellation, insufficient gold, full durability, attached gems, no repeated charge, save/reload');
}
if (html.includes('function setInventoryGridSize')) {
  const grid = boot();
  assert.equal(grid.nodes.get('inventory-grid-size-label').textContent, '76px');
  assert.equal(grid.nodes.get('inv-modal').style['--inventory-cell-size'], '76px');
  for (const [input, expected] of [[40, 40], [120, 120], [81, 80], [5, 40], [200, 120], ['invalid', 76]]) {
    grid.run(`setInventoryGridSize(${JSON.stringify(input)})`);
    assert.equal(grid.nodes.get('inv-modal').style['--inventory-cell-size'], `${expected}px`);
    assert.equal(grid.nodes.get('inventory-grid-size-label').textContent, `${expected}px`);
    assert.equal(grid.storage.townInventoryCellSize, String(expected));
  }
  const restored = boot({townInventoryCellSize: '92'});
  assert.equal(restored.nodes.get('inventory-grid-size').value, '92');
  assert.equal(restored.nodes.get('inv-modal').style['--inventory-icon-size'], '53px');
  restored.run('render()');
  assert.equal(restored.nodes.get('inv-modal').style['--inventory-cell-size'], '92px');
  console.log('PASS: grid size limits, icon scaling, value normalization, persisted preference, redraw stability');
}
if (html.includes('function showFusionResults')) {
  const fusion = boot();
  const evaluate = fusion.run;
  evaluate("s=fresh();s.unlocked=512;s.selected=512;for(let index=0;index<48;index++)s.inventory.push(makeItem(1,100));const template=makeItem(1,100);makeItem=tier=>Object.assign({},template,{id:'result-'+tier,rarityTier:tier,sockets:[]});const rolls=[.1,.5,.9];Math.random=()=>rolls.shift();$('bulk-filter-type').value='all';$('bulk-filter-rarity').value='all';$('bulk-filter-upgrade').value='all';$('bulk-filter-durability').value='all';$('bulk-filter-level-min').value='1';$('bulk-filter-level-max').value='512'");
  fusion.click('inventory-bulk-fusion');
  fusion.click('bulk-select-matches');
  assert.equal(fusion.nodes.get('fusion-result-modal').classList.contains('open'), false);
  fusion.click('bulk-confirm');
  assert.equal(evaluate('s.inventory.length'), 2);
  assert.equal(fusion.nodes.get('fusion-result-modal').classList.contains('open'), true);
  assert.ok(fusion.nodes.get('fusion-result-summary').innerHTML.includes('48'));
  assert.ok(fusion.nodes.get('fusion-result-summary').innerHTML.includes('3回'));
  const list = fusion.nodes.get('fusion-result-list').innerHTML;
  assert.ok(list.includes('次レア度へ上昇'));
  assert.ok(list.includes('同レア度'));
  assert.ok(list.includes('消失'));
  assert.equal((list.match(/class="fusion-result-card/g) || []).length, 3);
  fusion.click('', {fusionResultItem:'result-2'});
  assert.equal(evaluate('selectedItemId'), 'result-2');
  assert.equal(fusion.nodes.get('fusion-result-modal').classList.contains('open'), false);
  assert.equal(fusion.nodes.get('inv-modal').classList.contains('open'), true);
  const lost = boot();
  lost.run("s=fresh();s.unlocked=512;s.selected=512;for(let index=0;index<16;index++)s.inventory.push(makeItem(1,100));bulkMode='fusion';bulkFilterApplied=true;bulkSelection=s.inventory.map(item=>item.id);$('bulk-filter-type').value='all';$('bulk-filter-rarity').value='all';$('bulk-filter-upgrade').value='all';$('bulk-filter-durability').value='all';$('bulk-filter-level-min').value='1';$('bulk-filter-level-max').value='512';Math.random=()=>.99;executeBulkOperation()");
  assert.equal(lost.run('s.inventory.length'), 0);
  assert.ok(lost.nodes.get('fusion-result-summary').innerHTML.includes('今回は装備を獲得できませんでした'));
  assert.equal(lost.nodes.get('fusion-result-modal').classList.contains('open'), true);
  lost.click('fusion-result-close');
  assert.equal(lost.nodes.get('fusion-result-modal').classList.contains('open'), false);
  console.log('PASS: fusion outcome report, three outcome types, results only after confirmation, result item details, all-vanished report, close button');
}
if (html.includes('function isUiInteractionActive')) {
  const stable = boot();
  stable.run("s=fresh();const item=makeItem(1,1);s.inventory=[item];selectedItemId=item.id;render();$('inventory').scrollTop=300;$('equipped-inventory').scrollLeft=120");
  const inventory = stable.nodes.get('inventory');
  const detail = stable.nodes.get('item-detail');
  const buildings = stable.nodes.get('buildings');
  const initialWrites = inventory.htmlWrites;
  const detailWrites = detail.htmlWrites;
  const buildingWrites = buildings.htmlWrites;
  stable.run('s.hpHero=90;render()');
  assert.equal(inventory.htmlWrites, initialWrites);
  assert.equal(detail.htmlWrites, detailWrites);
  assert.equal(buildings.htmlWrites, buildingWrites);
  stable.fire('pointerdown', {pointerId:1});
  stable.run('s.inventory[0].level++;render();renderGuild()');
  assert.equal(inventory.htmlWrites, initialWrites);
  assert.equal(stable.run('pendingRender'), true);
  assert.equal(stable.run('pendingGuildRender'), true);
  stable.fire('pointerup', {pointerId:1});
  assert.equal(stable.run('isUiInteractionActive()'), true);
  stable.click('', {itemAction:'favorite'});
  assert.equal(stable.run('s.inventory[0].favorite'), true);
  assert.equal(inventory.htmlWrites, initialWrites);
  stable.flushTimers();
  assert.equal(stable.run('isUiInteractionActive()'), false);
  assert.equal(inventory.htmlWrites, initialWrites + 1);
  assert.equal(inventory.scrollTop, 300);
  assert.equal(stable.nodes.get('equipped-inventory').scrollLeft, 120);
  const select = stable.nodes.get('stage-select');
  stable.run("document.activeElement=$('stage-select')");
  const selectWrites = select.htmlWrites;
  stable.run('s.unlocked++;render()');
  assert.equal(select.htmlWrites, selectWrites);
  stable.run('document.activeElement=document.body');
  stable.fire('focusout', {});
  stable.flushTimers();
  assert.ok(select.htmlWrites > selectWrites);
  stable.fire('keydown', {key:' ',target:{closest(){return true}}});
  stable.run('s.inventory[0].level++;render()');
  const keyboardWrites = inventory.htmlWrites;
  stable.flushTimers();
  assert.equal(inventory.htmlWrites, keyboardWrites);
  stable.fire('keyup', {key:' '});
  stable.flushTimers();
  assert.equal(inventory.htmlWrites, keyboardWrites + 1);
  stable.fire('pointerdown', {pointerId:2});
  stable.run('render()');
  stable.fire('pointercancel', {pointerId:2});
  stable.flushTimers();
  assert.equal(stable.run('isUiInteractionActive()'), false);
  console.log('PASS: press/update/release/click race, deferred guild updates, keyboard activation, pointer cancellation, stable unchanged controls, dropdown focus, scroll preservation');
}
if (html.includes('function tryUseHerb')) {
  const herbs = boot();
  const evaluate = herbs.run;
  assert.equal(evaluate('s.autoHerbUse'), false);
  evaluate('s=fresh();s.hpHero=stats().hp*.35;s.herb=3');
  assert.equal(evaluate('tryUseHerb()'), false);
  herbs.click('auto-herb-toggle');
  assert.equal(evaluate('s.autoHerbUse'), true);
  assert.equal(evaluate('s.hpHero'), evaluate('stats().hp*.35+stats().hp*.25'));
  assert.equal(evaluate('s.herb'), 0);
  assert.equal(evaluate('s.herbUsedThisRun'), true);
  evaluate('s.hpHero=20');
  assert.equal(evaluate('tryUseHerb()'), false);
  herbs.click('auto-herb-toggle');
  herbs.click('auto-herb-toggle');
  assert.equal(evaluate('s.herb'), 0);
  evaluate('save()');
  const restored = boot({townSaveV7: herbs.storage.townSaveV7});
  assert.equal(restored.run('s.autoHerbUse'), true);
  assert.equal(restored.run('s.herbUsedThisRun'), true);
  assert.equal(restored.run('tryUseHerb()'), false);
  evaluate('beginFreshRun();s.hpHero=stats().hp*.35+.01');
  assert.equal(evaluate('tryUseHerb()'), false);
  evaluate('s.hpHero=stats().hp*.35;s.herb=2');
  assert.equal(evaluate('tryUseHerb()'), false);
  evaluate('s.herb=3');
  assert.equal(evaluate('failIfDead()'), false);
  assert.equal(evaluate('s.hpHero'), evaluate('stats().hp*.35+stats().hp*.25'));
  assert.equal(evaluate('s.herb'), 0);
  evaluate('defeatRun();s.hpHero=0;s.herb=3');
  assert.equal(evaluate('failIfDead()'), true);
  assert.equal(evaluate('s.herb'), 3);
  assert.equal(evaluate('s.hpHero'), evaluate('stats().hp'));
  assert.equal(evaluate('s.herbUsedThisRun'), false);
  evaluate('s.herbUsedThisRun=true;completeRun()');
  assert.equal(evaluate('s.herbUsedThisRun'), false);
  evaluate('s.autoHerbUse=true;s.lifetimePros=180;prestige()');
  assert.equal(evaluate('s.autoHerbUse'), true);
  assert.equal(evaluate('s.herbUsedThisRun'), false);
  console.log('PASS: automatic herb toggle, inclusive HP threshold, direct consumption, once per run, no stock, save/reload, lethal damage, run reset, prestige preference');
}
if (html.includes('id="item-detail-actions"')) {
  const details = boot();
  details.run("s=fresh();s.inventory=[makeItem(1,1),makeItem(1,1)];selectedItemId=s.inventory[0].id;render()");
  const markup = details.nodes.get('item-detail').innerHTML;
  assert.ok(markup.includes('id="item-detail-info"'));
  const actionStart = markup.indexOf('id="item-detail-actions"');
  for (const action of ['equip','favorite','upgrade','repair','sell']) {
    assert.ok(markup.indexOf(`data-item-action="${action}"`) > actionStart, action);
  }
  details.run("$('item-detail-info').scrollTop=180;$('item-detail-actions').scrollTop=90;s.inventory[0].level++;render()");
  assert.equal(details.nodes.get('item-detail-info').scrollTop, 180);
  assert.equal(details.nodes.get('item-detail-actions').scrollTop, 90);
  details.run('selectedItemId=s.inventory[1].id;render()');
  assert.equal(details.nodes.get('item-detail-info').scrollTop, 0);
  assert.equal(details.nodes.get('item-detail-actions').scrollTop, 0);
  console.log('PASS: separate item actions column, all action buttons, scroll retention, new selection resets both panes');
}
if (html.includes('function materialKindCount')) {
  const materials = boot();
  assert.equal(Number(materials.nodes.get('material-tab-count').textContent), 3);
  const grid = materials.nodes.get('material-grid');
  const writes = grid?.htmlWrites || 0;
  materials.run("s.enemyMaterials['test-material']=2;s.bossMaterials[1]={'boss-material':1};render()");
  assert.equal(Number(materials.nodes.get('material-tab-count').textContent), 5);
  assert.equal(materials.nodes.get('material-grid')?.htmlWrites || 0, writes);
  materials.run("s.enemyMaterials['test-material']=0;s.ore=0;s.herb=0;inventoryTab='accessories';render()");
  assert.equal(Number(materials.nodes.get('material-tab-count').textContent), 2);
  materials.run("inventoryTab='materials';$('material-search').value='not-found';render()");
  assert.equal(Number(materials.nodes.get('material-tab-count').textContent), 2);
  materials.run("s.cloth=0;s.bossMaterials[1]['boss-material']=0;render()");
  assert.equal(Number(materials.nodes.get('material-tab-count').textContent), 0);
  console.log('PASS: material badge updates across tabs, acquisition and depletion, search independence, no hidden panel rebuilding');
}
if (html.includes('function claimClover')) {
  const clover = boot();
  const evaluate = clover.run;
  const time = Date.now();
  evaluate(`s=fresh();Date.now=()=>${time};Math.random=()=>0`);
  assert.equal(evaluate('nextCloverDelay()'), 60000);
  evaluate('Math.random=()=>.999999');
  assert.ok(evaluate('nextCloverDelay()') < 300000);
  assert.ok(evaluate('nextCloverDelay()') > 299999);
  evaluate('s.skill.fortune=10');
  assert.ok(evaluate('nextCloverDelay()') < 180000);
  evaluate(`s=fresh();s.luck.nextAt=${time}-1;tickLuck(${time})`);
  assert.equal(clover.nodes.get('lucky-clover').hidden, false);
  assert.equal(evaluate('s.luck.expiresAt'), time + 20000);
  const left = clover.nodes.get('lucky-clover').style.left;
  const top = clover.nodes.get('lucky-clover').style.top;
  clover.click('guild-open');
  clover.click('guild-close');
  clover.click('inventory-toggle');
  clover.click('inventory-close');
  assert.equal(clover.nodes.get('lucky-clover').style.left, left);
  assert.equal(clover.nodes.get('lucky-clover').style.top, top);
  evaluate('Math.random=()=>.1;const beforeGold=s.gold');
  clover.click('lucky-clover');
  assert.ok(evaluate('s.gold-beforeGold') >= 50);
  assert.equal(clover.nodes.get('lucky-clover').hidden, true);
  assert.equal(clover.nodes.get('clover-confetti').children.length, 55);
  const claimedGold = evaluate('s.gold');
  clover.click('lucky-clover');
  assert.equal(evaluate('s.gold'), claimedGold);
  clover.flushTimers();
  assert.equal(clover.nodes.get('clover-reward-toast').hidden, true);
  assert.ok(clover.nodes.get('clover-confetti').children.every(piece => piece.removed));
  evaluate(`s.luck.expiresAt=${time}+20000;Math.random=()=>.7`);
  clover.click('lucky-clover');
  assert.equal(evaluate('s.luck.activityUntil'), time + 60000);
  assert.equal(clover.nodes.get('luck-buffs').hidden, false);
  assert.ok(clover.nodes.get('luck-buffs').innerHTML.includes('町の活気'));
  evaluate(`s.luck.expiresAt=${time}+20000;Math.random=()=>.9`);
  clover.click('lucky-clover');
  assert.equal(evaluate('s.luck.commerceUntil'), time + 60000);
  assert.equal(evaluate(`luckProductionMultiplier('gold',${time})`), 3);
  assert.equal(evaluate(`luckProductionMultiplier('ore',${time})`), 2);
  assert.equal(evaluate(`luckProductionMultiplier('store',${time})`), 1);
  evaluate(`s.luck.activityUntil=${time}+30000`);
  assert.ok(Math.abs(evaluate(`facilityProduction(buildings[2],${time},${time}+120000) / baseFacilityRate(buildings[2])`) - 4) < 1e-9);
  assert.ok(Math.abs(evaluate(`facilityProduction(buildings[0],${time},${time}+120000) / baseFacilityRate(buildings[0])`) - 2.5) < 1e-9);
  evaluate('save()');
  const restored = boot({townSaveV7:clover.storage.townSaveV7});
  assert.equal(restored.run('s.luck.commerceUntil'), time + 60000);
  evaluate(`s.luck.expiresAt=${time}+1;tickLuck(${time}+2)`);
  assert.equal(clover.nodes.get('lucky-clover').hidden, true);
  assert.ok(evaluate('s.luck.nextAt') >= time + 60002);
  console.log('PASS: clover timing, skill floor, modal-independent position, click reward, duplicate prevention, confetti cleanup, all rewards, buff expiry integration, max multiplier, save/reload');
}
if (html.includes('function mapDropTable')) {
  const drops = boot();
  const evaluate = drops.run;
  const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10);
  for (let map = 1; map <= 512; map++) {
    evaluate(`const table${map}=mapDropTable(${map})`);
    closeTo(evaluate(`table${map}.gearRarities.reduce((sum,entry)=>sum+entry.probability,0)`), 1);
    closeTo(evaluate(`table${map}.equipmentTypes.reduce((sum,entry)=>sum+entry.probability,0)`), 1);
    closeTo(evaluate(`table${map}.socketChances.reduce((sum,p)=>sum+p,0)`), 1);
    closeTo(evaluate(`table${map}.basicMaterials.reduce((sum,entry)=>sum+entry.probability,0)`), evaluate(`mapInfo(${map}).matChance`));
    closeTo(evaluate(`table${map}.specialMaterials.reduce((sum,entry)=>sum+entry.probability,0)`), evaluate(`mapInfo(${map}).enemyMatChance`));
    if (map >= 113) closeTo(evaluate(`table${map}.accessoryRarities.reduce((sum,entry)=>sum+entry.probability,0)`), 1);
    else assert.equal(evaluate(`table${map}.accessoryChance`), 0);
    assert.equal(evaluate(`table${map}.hasBoss`), map % 16 === 0);
  }
  closeTo(evaluate("mapDropTable(512).equipmentTypes.find(type=>type.name==='片手剣').probability"), .08);
  closeTo(evaluate("mapDropTable(512).equipmentTypes.find(type=>type.name==='頭防具').probability"), .104);
  closeTo(evaluate('mapDropTable(16,true).specialMaterials[0].probability'), html.includes('function museumKills') ? .05 : .05/3);
  assert.equal(evaluate('mapDropTable(16,true).sourceName'), evaluate('BOSSES[0].name'));
  assert.equal(evaluate('mapDropTable(15,true).isBoss'), false);
  assert.notEqual(evaluate('dropPercent(rarityDistribution(512)[20]*mapInfo(512).gear*.08)'), '0%');
  evaluate('s.selected=1;s.unlocked=512');
  drops.click('drop-table-open');
  assert.equal(drops.nodes.get('drop-table-modal').classList.contains('open'), true);
  assert.equal(drops.nodes.get('drop-table-boss').hidden, true);
  assert.ok(drops.nodes.get('drop-table-content').innerHTML.includes('このマップではドロップしません'));
  evaluate('s.selected=16');drops.click('drop-table-open');
  assert.equal(drops.nodes.get('drop-table-boss').hidden, false);
  drops.click('drop-table-boss');
  assert.ok(drops.nodes.get('drop-table-content').innerHTML.includes('ボス素材・儀式素材'));
  evaluate('s.selected=17;render()');
  assert.equal(evaluate('dropTableMap'), 16);
  assert.ok(drops.nodes.get('drop-table-map').textContent.startsWith('1-16'));
  evaluate('s.selected=512');drops.click('drop-table-open');
  assert.ok(drops.nodes.get('drop-table-content').innerHTML.includes('迅速の石'));
  assert.ok(drops.nodes.get('drop-table-content').innerHTML.includes('10.32%'));
  assert.ok(drops.nodes.get('drop-table-content').innerHTML.includes('装備Lv <b>512'));
  drops.click('drop-table-close');
  assert.equal(drops.nodes.get('drop-table-modal').classList.contains('open'), false);
  console.log('PASS: all 512 map distributions, source settings, per-type odds, boss switching, locked accessories, tiny probabilities, effect values, pinned map and close action');
}
if (html.includes('function museumKills')) {
  const museum = boot(); const evaluate = museum.run;
  const closeTo = (a,b) => assert.ok(Math.abs(a-b)<1e-10);
  assert.equal(evaluate('museumKills(1,0)'), 0);
  evaluate("s.museum.kills['1:normal:0']=499;recordMuseumKill({isBoss:false},1)");
  assert.equal(evaluate('museumKills(1,0)'), 500);
  closeTo(evaluate('mapDropTable(1).multiplier'), 1.05);
  closeTo(evaluate('mapDropTable(6).multiplier'), 1);
  const notices = evaluate('s.notifications.length');
  evaluate('recordMuseumKill({isBoss:false},1)');
  assert.equal(evaluate('s.notifications.length'), notices);
  evaluate("s.museum.kills['1:normal:1']=500;s.museum.kills['1:normal:2']=500;s.museum.kills['1:boss']=99;recordMuseumKill({isBoss:true},16)");
  assert.equal(evaluate('museumEraComplete(1)'), true);
  closeTo(evaluate('mapDropTable(1).multiplier'), 1.15);
  closeTo(evaluate('mapDropTable(16,true).multiplier'), 1.10);
  closeTo(evaluate('mapDropTable(16,true).specialMaterials[0].probability'), .055);
  closeTo(evaluate('mapDropTable(17).multiplier'), 1);
  closeTo(evaluate('mapDropTable(1).gearChance/mapInfo(1).gear'),1.15);
  closeTo(evaluate('mapDropTable(16,true).gearChance/mapInfo(16).gear'),1.10);
  assert.equal(evaluate('JSON.stringify(mapDropTable(1).gearRarities)'),evaluate('JSON.stringify(rarityDistribution(1).slice(1).map((probability,index)=>({tier:index+1,probability})).filter(entry=>entry.probability>0))'));
  evaluate('save()');
  const restored = boot({townSaveV7:museum.storage.townSaveV7});
  assert.equal(restored.run('museumEraComplete(1)'), true);
  evaluate('s.lifetimePros=180;prestige()');
  assert.equal(evaluate('museumEraComplete(1)'), true);
  museum.click('museum-open');
  assert.equal(museum.nodes.get('museum-modal').classList.contains('open'),true);
  assert.ok(museum.nodes.get('museum-summary').innerHTML.includes('完成'));
  museum.click('museum-close');
  assert.equal(museum.nodes.get('museum-modal').classList.contains('open'),false);
  // Independent per-material rolls permit multiple drops in one boss kill.
  const boss = boot();
  boss.run("s=fresh();s.selected=16;s.unlocked=512;const rolls=[.5,.99,.99,.01,.99,.01,.99];Math.random=()=>rolls.shift();rewardForKill({isBoss:true})");
  assert.equal(boss.run('s.bossMaterials[1][BOSSES[0].materials[0]]'),1);
  assert.equal(boss.run('s.bossMaterials[1][BOSSES[0].materials[1]]||0'),0);
  assert.equal(boss.run('s.bossMaterials[1][BOSSES[0].materials[2]]'),1);
  assert.equal(boss.run('museumKills(1)'),1);
  // The threshold kill uses the old rate, the following kill uses the unlocked rate.
  const threshold = boot();
  threshold.run("s=fresh();s.unlocked=512;s.selected=1;s.museum.kills['1:normal:0']=499;const base=mapInfo(1).gear;const rolls=[.5,base*1.025,.99,.99,.99];Math.random=()=>rolls.shift()??.99;rewardForKill({isBoss:false})");
  assert.equal(threshold.run('s.inventory.length'),0);
  assert.equal(threshold.run('museumKills(1,0)'),500);
  closeTo(threshold.run('mapDropTable(1).gearChance'),threshold.run('mapInfo(1).gear*1.05'));
  console.log('PASS: 500/100 thresholds, permanent progress, additive bonuses, source and era isolation, unchanged rarity distribution, museum UI, independent boss materials, unlock applies on following kill');
}
if (html.includes('function renderGuildCompleteCount')) {
  const guild = boot();
  assert.equal(guild.nodes.get('guild-complete-count').hidden, true);
  guild.run('s.guild.missions=[{id:1,startedAt:100,durationMs:100},{id:2,startedAt:50,durationMs:150},{id:3,startedAt:100,durationMs:200}];renderGuildCompleteCount(199)');
  assert.equal(guild.nodes.get('guild-complete-count').hidden, true);
  guild.run('renderGuildCompleteCount(200)');
  assert.equal(guild.nodes.get('guild-complete-count').textContent, '2');
  assert.equal(guild.nodes.get('guild-complete-count').hidden, false);
  guild.run('s.guild.missions=s.guild.missions.filter(mission=>mission.id!==1);renderGuildCompleteCount(200)');
  assert.equal(guild.nodes.get('guild-complete-count').textContent, '1');
  guild.run('s.guild.missions=[];renderGuildCompleteCount()');
  assert.equal(guild.nodes.get('guild-complete-count').hidden, true);
  console.log('PASS: guild completion count, completion boundary, active mission exclusion, claimed mission removal, zero badge hidden');
}
if (html.includes('function resourceProductionRate')) {
  const production = boot(); const evaluate = production.run;
  const closeTo = (a,b) => assert.ok(Math.abs(a-b)<1e-10);
  const goldMultiplier = evaluate("buildings.find(building=>building[0]==='inn')[5]") / .84;
  evaluate('s=fresh();s.build.inn=1;s.build.market=0');
  closeTo(evaluate("resourceProductionRate('gold')"),.84*goldMultiplier);
  evaluate('s.build.market=1;render()');
  closeTo(evaluate("resourceProductionRate('gold')"),1.89*goldMultiplier);
  assert.ok(production.nodes.get('resources').innerHTML.includes(`+${(1.89*goldMultiplier).toFixed(2)}/分`));
  evaluate('s.build.inn=2;s.build.market=3;s.skill.production=2');
  const growth = html.includes('const RESOURCE_PRODUCTION_GROWTH = 1.15') ? 1.15 : 1;
  const wisdom = html.includes('const TOWN_WISDOM_PERCENT_PER_LEVEL = 30') ? 1.6 : 1.3;
  const baseGoldRate = (.84 * 2 * growth + 1.05 * 3 * growth ** 2) * wisdom * goldMultiplier;
  closeTo(evaluate("resourceProductionRate('gold')"),baseGoldRate);
  const time=Date.now();
  evaluate(`s.luck.activityUntil=${time}+120000;s.luck.commerceUntil=${time}+120000;render()`);
  closeTo(evaluate(`resourceProductionRate('gold',${time})`),baseGoldRate * 3);
  closeTo(evaluate(`resourceProductionRate('ore',${time})`),.16 * wisdom * 2);
  assert.ok(production.nodes.get('resources').innerHTML.includes('+' + evaluate("resourceProductionRate('gold').toFixed(2)") + '/分'));
  closeTo(evaluate(`buildings.filter(building=>building[3]==='gold').reduce((sum,building)=>sum+facilityProduction(building,${time},${time}+60000),0)`),baseGoldRate * 3);
  closeTo(evaluate(`resourceProductionRate('gold',${time}+120001)`),baseGoldRate);
  console.log('PASS: inn + market total, skills, clover multipliers, all-resource totals, display rounding, agreement with actual production');
}
if (html.includes('function guildMaterialRewardCount')) {
  const preview = boot(); const evaluate = preview.run;
  evaluate("s=fresh();s.guild.level=32;s.unlocked=512;s.selected=512;$('guild-stage').value='512';$('guild-type').value='enemy';renderGuild()");
  const enemyHelp = preview.nodes.get('guild-type-help').textContent;
  const enemyMaterials = evaluate('mapInfo(512).enemyMaterials');
  for (const name of enemyMaterials) assert.ok(enemyHelp.includes(name));
  assert.ok(enemyHelp.includes('各1/3'));
  evaluate('startGuildMission()');
  const enemyCount = evaluate('s.guild.missions[0].reward.enemyMaterial.count');
  assert.ok(enemyHelp.includes(`${enemyCount}個`));
  evaluate("$('guild-type').value='basic';renderGuild()");
  const basicHelp = preview.nodes.get('guild-type-help').textContent;
  assert.ok(basicHelp.includes(evaluate('mapInfo(512).matName')));
  evaluate('startGuildMission()');
  const key = evaluate('mapInfo(512).mat');
  assert.ok(basicHelp.includes(`${evaluate(`s.guild.missions[1].reward.${key}`)}個`));
  evaluate("$('guild-type').value='boss';renderGuild()");
  const bossHelp = preview.nodes.get('guild-type-help').textContent;
  for (const name of evaluate('BOSSES[31].materials')) assert.ok(bossHelp.includes(name));
  evaluate('startGuildMission()');
  assert.equal(evaluate('s.guild.missions[2].reward.bossMaterial.count'),1);
  assert.ok(bossHelp.includes('1個'));
  console.log('PASS: basic/enemy/boss material names before dispatch, random candidates labeled, preview counts match actual rewards');
}
if (html.includes('const emptySlots = Math.max(0, capacity() - s.stash.length)')) {
  const prestige = boot(); const evaluate = prestige.run;
  evaluate("s=fresh();s.lifetimePros=180;s.unlocked=20;s.selected=20;s.skill.storage=2;let warning='';confirm=message=>{warning=message;return false};prestige()");
  assert.ok(evaluate('warning').includes('3枠'));
  assert.equal(evaluate('s.selected'),20);
  assert.equal(evaluate('s.prestigeRank'),0);
  evaluate('confirm=()=>true;prestige()');
  assert.equal(evaluate('s.selected'),1);
  assert.equal(evaluate('s.prestigeRank'),1);
  evaluate("s=fresh();s.lifetimePros=180;s.stash=[makeItem(1,1)];let asked=false;confirm=()=>{asked=true;return false};prestige()");
  assert.equal(evaluate('asked'),false);
  assert.equal(evaluate('s.prestigeRank'),1);
  evaluate("s=fresh();let premature=false;confirm=()=>{premature=true;return true};prestige()");
  assert.equal(evaluate('premature'),false);
  console.log('PASS: empty stash warning, expanded capacity, cancellation preserves state, explicit continuation, full stash, unavailable prestige');
}
if (html.includes('function tickAutomation')) {
  const auto = boot(); const evaluate = auto.run;
  assert.equal(evaluate('s.automation.mode'), 'stopped');
  for (const mode of ['fusion','disassembly','sale']) {
    assert.equal(evaluate(`automationCapacity('${mode}')`),1);
    assert.equal(evaluate(`automationInterval('${mode}')`),240000);
    evaluate(`s.automation.modes.${mode}.quantityLevel=20;s.automation.modes.${mode}.intervalLevel=20`);
    assert.equal(evaluate(`automationCapacity('${mode}')`),21);
    assert.equal(evaluate(`automationInterval('${mode}')`),40000);
  }
  evaluate("s=fresh();s.unlocked=512;const item=makeItem(1,1);item.level=0;item.crit=0;item.critDamageBonus=0;item.attackSpeedBonus=0;item.sockets=[];s.inventory=[item]");
  const select=auto.nodes.get('automation-mode');select.value='sale';auto.fire('change',{target:select});
  evaluate('confirm=()=>false');auto.click('automation-start');
  assert.equal(evaluate('s.automation.mode'),'stopped');
  evaluate('confirm=()=>true');auto.click('automation-start');
  assert.equal(evaluate('s.automation.mode'),'sale');
  assert.equal(evaluate('s.inventory.length'),1);
  evaluate('tickAutomation(s.automation.nextAt-1)');assert.equal(evaluate('s.inventory.length'),1);
  evaluate('const beforeSale=s.gold;const expectedSale=equipmentSaleValue(item);tickAutomation(s.automation.nextAt)');
  assert.equal(evaluate('s.inventory.length'),0);
  assert.equal(evaluate('s.gold-beforeSale'),evaluate('expectedSale'));
  assert.equal(evaluate('s.automation.history.length'),1);
  const filter=auto.nodes.get('auto-filter-rarity');filter.value='3';auto.fire('change',{target:filter});
  assert.equal(evaluate('s.automation.mode'),'stopped');
  assert.equal(evaluate('s.automation.modes.sale.filters.rarity'),'3');
  select.value='disassembly';auto.fire('change',{target:select});
  assert.equal(auto.nodes.get('auto-filter-rarity').value,'1');
  auto.click('automation-start');assert.equal(evaluate('s.automation.mode'),'disassembly');
  select.value='sale';auto.fire('change',{target:select});
  assert.equal(auto.nodes.get('auto-filter-rarity').value,'3');
  assert.equal(evaluate('s.automation.mode'),'stopped');
  // Quantity limits, protected gear, and socketed gem refunds.
  const salvage=boot();
  salvage.run("s=fresh();s.unlocked=512;s.automation.mode='disassembly';s.automation.nextAt=1;s.automation.modes.disassembly.quantityLevel=1;s.automation.modes.disassembly.filters.sockets='all';for(const slot of ['weapon','body']){const gear=makeItem(1,1);Object.assign(gear,{slot,level:0,crit:0,critDamageBonus:0,attackSpeedBonus:0,sockets:[{id:'gem-'+slot,type:'hp',rarityTier:1}]});s.inventory.push(gear)}const favorite=makeItem(1,1);favorite.favorite=true;s.inventory.push(favorite);s.equipment.head=makeItem(1,1);s.stash=[makeItem(1,1)];tickAutomation(1)");
  assert.equal(salvage.run('s.inventory.length'),1);
  assert.equal(salvage.run('s.inventory[0].favorite'),true);
  assert.equal(salvage.run('s.ore'),5);
  assert.equal(salvage.run('s.cloth'),3);
  assert.equal(salvage.run('s.accessories.length'),2);
  assert.equal(salvage.run('s.stash.length'),1);
  assert.equal(salvage.run('Object.keys(s.equipment).length'),1);
  const fusion=boot();
  fusion.run("s=fresh();s.unlocked=512;s.selected=512;s.automation.mode='fusion';s.automation.nextAt=1;for(let index=0;index<32;index++){const gear=makeItem(1,1);Object.assign(gear,{level:0,crit:0,critDamageBonus:0,attackSpeedBonus:0,sockets:[]});s.inventory.push(gear)}fusionSelection=[s.inventory[0].id];Math.random=()=>.9;tickAutomation(1)");
  assert.equal(fusion.run('s.inventory.length'),16);
  assert.equal(fusion.run('s.inventory.some(item=>item.id===fusionSelection[0])'),true);
  assert.equal(fusion.run('s.automation.lastFusionReport.attempts.length'),1);
  fusion.run('tickAutomation(s.automation.nextAt)');assert.equal(fusion.run('s.inventory.length'),16);
  fusion.run('fusionSelection=[];tickAutomation(s.automation.nextAt)');assert.equal(fusion.run('s.inventory.length'),0);
  // Upgrade costs scale through the specified eras, and upgrades remain independent.
  const upgrade=boot();
  for(const [level,era] of [[0,1],[4,8],[8,16],[12,24],[16,32]]) {
    upgrade.run(`s.automation.modes.fusion.quantityLevel=${level}`);
    assert.equal(upgrade.run("automationUpgradeCost('fusion','quantityLevel').era"),era);
  }
  upgrade.run("s=fresh();s.gold=1000;const autoCost=automationUpgradeCost('sale','quantityLevel');s.enemyMaterials[autoCost.materials[0]]=5;s.enemyMaterials[autoCost.materials[1]]=5");
  assert.equal(upgrade.run("upgradeAutomation('sale','quantityLevel')"),true);
  assert.equal(upgrade.run('s.gold'),500);
  assert.equal(upgrade.run('s.automation.modes.sale.quantityLevel'),1);
  assert.equal(upgrade.run('s.automation.modes.sale.intervalLevel'),0);
  assert.equal(upgrade.run('s.automation.modes.fusion.quantityLevel'),0);
  assert.equal(upgrade.run('Object.values(s.enemyMaterials).reduce((sum,count)=>sum+count,0)'),0);
  assert.equal(upgrade.run("upgradeAutomation('sale','quantityLevel')"),false);
  upgrade.run("s.automation.modes.sale.quantityLevel=20");
  assert.equal(upgrade.run("automationUpgradeCost('sale','quantityLevel')"),null);
  upgrade.run("s.automation.mode='sale';s.lifetimePros=180;confirm=()=>true;prestige()");
  assert.equal(upgrade.run('s.automation.mode'),'stopped');
  assert.equal(upgrade.run('s.automation.modes.sale.quantityLevel'),20);
  upgrade.run('save()');
  const reload=boot({townSaveV7:upgrade.storage.townSaveV7});
  assert.equal(reload.run('s.automation.modes.sale.quantityLevel'),20);
  auto.run("s.automation.mode='sale';s.automation.nextAt=1;save()");
  const resume=boot({townSaveV7:auto.storage.townSaveV7});
  assert.equal(resume.run('s.automation.mode'),'sale');
  assert.ok(resume.run('s.automation.nextAt')>Date.now());
  // Input gestures delay automatic mutation just as they delay redraws.
  const held=boot();held.run("s=fresh();s.automation.mode='sale';s.automation.nextAt=1;const gear=makeItem(1,1);Object.assign(gear,{crit:0,critDamageBonus:0,attackSpeedBonus:0,sockets:[]});s.inventory=[gear]");
  held.fire('pointerdown',{pointerId:10});held.run('tickAutomation(1)');assert.equal(held.run('s.inventory.length'),1);
  held.fire('pointercancel',{pointerId:10});held.flushTimers();held.run('tickAutomation(1)');assert.equal(held.run('s.inventory.length'),0);
  const chain=boot();
  chain.run("s=fresh();s.unlocked=512;s.selected=512;s.automation.mode='fusion';s.automation.nextAt=1;s.automation.modes.fusion.quantityLevel=20;s.automation.modes.fusion.filters=Object.assign(defaultAutomationFilter(),{rarity:'all',traits:'all',sockets:'all'});for(const [tier,count] of [[1,16],[2,15]])for(let index=0;index<count;index++){const gear=makeItem(tier,1);Object.assign(gear,{crit:0,critDamageBonus:0,attackSpeedBonus:0,sockets:[]});s.inventory.push(gear)}Math.random=()=>.1;tickAutomation(1)");
  assert.equal(chain.run('s.inventory.length'),16);
  assert.equal(chain.run('s.automation.lastFusionReport.attempts.length'),1);
  chain.run('tickAutomation(s.automation.nextAt)');assert.equal(chain.run('s.inventory.length'),1);
  assert.equal(chain.run('s.inventory[0].rarityTier'),3);
  console.log('PASS: single automation mode, confirmation, per-mode filters, exact periods and capacities, automatic sale/disassembly/fusion, full groups, item protection, gem refunds, upgrade materials and caps, prestige, reload, interaction safety');
}
console.log('PASS: startup, 32 eras, exact rarity distributions, 120 effect values, both equip UI routes, stats, save/reload, legacy saves, breakage, six disposal routes, prestige, reward-before-auto-advance');
