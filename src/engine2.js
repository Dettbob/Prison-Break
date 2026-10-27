// ===== engine2.js (v2) : prisoner actions I (movement, loot, craft, stash, locks, alarms) =====
const has = (p, it, n = 1) => (p.items[it] || 0) >= n;
const addItem = (p, it, n = 1) => { p.items[it] = (p.items[it] || 0) + n; };
const takeItem = (p, it, n = 1) => { p.items[it] = (p.items[it] || 0) - n; if (p.items[it] <= 0) delete p.items[it]; };
const guardsAt = (w, x, y) => w.guards.filter(g => g.x === x && g.y === y && !g.off);
const playersAt = (w, x, y, except) => w.players.filter(p => p.x === x && p.y === y && p.status === 'free' && p.id !== except);
const itemName = it => ITEMS[it].name;
const fail = msg => ({ ok: false, msg });
const okk = msg => ({ ok: true, msg });
const anim = (w, k, id, x, y) => w.anim.push({ k, id, x, y });

function weaponOf(p) {
  if (has(p, 'pistol') && has(p, 'ammo')) return { id: 'pistol', dmg: 3, ranged: 2, lethal: 0.6 };
  if (has(p, 'shiv')) return { id: 'shiv', dmg: 2, lethal: 0.55 };
  if (has(p, 'baton')) return { id: 'baton', dmg: 2, lethal: 0 };
  return { id: 'fists', dmg: 1, lethal: 0 };
}
function rollLoot(w, type) {
  const table = LOOT[type]; if (!table) return null;
  const tot = table.reduce((a, r) => a + r[1], 0); let r = w.rng() * tot;
  for (const [it, wt, q] of table) { r -= wt; if (r <= 0) return it ? [it, Array.isArray(q) ? rint(w.rng, q[0], q[1]) : q] : null; }
  return null;
}
// rooms are locked as a whole. Cells that are not yours are also locked at night.
function roomLocked(w, room, p) {
  if (!room) return false;
  if (room.locked) return true;
  return room.type === 'cell' && isNight(w) && p && room.owner !== p.id && room.openUntil < w.round;
}
function canEnter(w, p, from, to) {
  if (!neighbors(w.map, from).includes(to)) return false;
  return !(to.room && to.room !== from.room && roomLocked(w, to.room, p));
}
function lockWhy(w, p, to) { return to.room && to.room.type === 'cell' && !to.room.locked ? 'That cell is locked for the night. Pick the lock.' : (to.name + ' is locked. You need a lockpick or a keycard.'); }

function canAct(w, p, ap) {
  if (w.over) return 'The game is over.';
  if (p.pending) return 'Deal with what is in front of you first.';
  if (w.phase !== 'players' || w.cur !== p.id) return 'Not your turn.';
  if (p.status !== 'free') return 'You are out of action.';
  if (p.ap < ap) return 'Not enough AP.';
  return null;
}
const COST = { move: 1, run: 2, sneakattack: 2, cutfence: 2, end: 0, sleep: 0, buy: 0, sell: 0, intel: 0, route: 0, stashmove: 0, resolve: 0 };
function actCost(a) { return a.t === 'move' ? (a.sneak ? 2 : 1) : (COST[a.t] !== undefined ? COST[a.t] : 1); }

function act(w, pid, a) {
  const p = w.players[pid];
  if (a.t === 'resolve') return resolvePending(w, pid, a);
  const apCost = actCost(a);
  if (a.t !== 'end' && a.t !== 'sleep') { const err = canAct(w, p, apCost); if (err) return fail(err); }
  else if (p.pending || w.phase !== 'players' || w.cur !== p.id || w.over) return fail(p.pending ? 'Deal with what is in front of you first.' : 'Not your turn.');
  let res; const t = ptile(w, p);
  switch (a.t) {
    case 'move': res = doMove(w, p, t, a); break;
    case 'run': res = doRun(w, p, t, a); break;
    case 'hide': res = p.hidden ? fail('You are already hidden.') : (p.hidden = true, okk('You slip out of sight. ' + coverNote(t))); break;
    case 'loot': res = doLoot(w, p, t); break;
    case 'salvage': res = doSalvage(w, p, t); break;
    case 'work': res = doWork(w, p, t); break;
    case 'craft': res = doCraft(w, p, t, a.out); break;
    case 'trade': res = doTradeOpen(w, p, a.nid); break;
    case 'buy': res = doBuy(w, p, a.item); break;
    case 'sell': res = doSell(w, p, a.item); break;
    case 'intel': res = doIntel(w, p, a.kind); break;
    case 'route': res = doRoute(w, p, a.slot); break;
    case 'bribe': res = doBribe(w, p, a); break;
    case 'buykey': res = doBuyKey(w, p, a.gid); break;
    case 'unlock': res = doUnlock(w, p, t, a.rid); break;
    case 'hack': res = doHack(w, p, t); break;
    case 'power': res = doPower(w, p, t); break;
    case 'attack': case 'sneakattack': res = doAttack(w, p, t, a); break;
    case 'give': res = doGive(w, p, a); break;
    case 'use': res = doUse(w, p, a.item); break;
    case 'stash': res = (t.room && t.room === cellOf(w, p)) ? (p.shop = 'stash', okk('You open your hiding place.')) : fail('Only your own cell has your stash.'); break;
    case 'stashmove': res = doStashMove(w, p, t, a); break;
    case 'dummy': res = doDummy(w, p, t); break;
    case 'hire': res = doHire(w, p, a); break;
    case 'escape': case 'cutfence': res = doEscape(w, p, t, a.t); break;
    case 'sleep': res = doSleep(w, p); break;
    case 'end': p.ap = 0; endTurn(w); return okk('You end your turn.');
    default: return fail('Unknown action.');
  }
  if (!res.ok) return res;
  p.ap = Math.max(0, p.ap - apCost);
  const keepShop = ['buy', 'sell', 'intel', 'route', 'trade', 'stash', 'stashmove'].includes(a.t);
  if (!keepShop) p.shop = null;
  if (res.msg) addLog(w, res.msg, p.x, p.y, 'you', p.id);
  if (p.status === 'free') { updateMemory(w, p); if (!p.asleep) scanNotice(w, p); }
  refreshSpotted(w);
  checkEnd(w);
  if (!w.over && !p.pending && w.phase === 'players' && w.cur === p.id && a.t !== 'sleep' && (p.status !== 'free' || p.ap <= 0)) endTurn(w);
  return res;
}
const coverNote = t => coverOf(t) === 'open' ? 'Guards within 2 tiles may still spot you.' : 'Only a guard on this very tile might find you.';

function doMove(w, p, t, a) {
  const n = tileAt(w.map, a.x, a.y);
  if (!n || !neighbors(w.map, t).includes(n)) return fail("You can't go that way.");
  if (n.room && n.room !== t.room && roomLocked(w, n.room, p)) return fail(lockWhy(w, p, n));
  p.x = n.x; p.y = n.y; p.hidden = false; p.stats.moves++; anim(w, 'p', p.id, n.x, n.y);
  emitNoise(w, n.x, n.y, a.sneak ? CFG.NOISE.sneak : CFG.NOISE.move, { kind: 'player', id: p.id }, a.sneak ? 'sneaking' : 'footsteps', noiseSus(w, p, false));
  return okk(null);
}
function pathTo(w, p, from, to, maxLen) { // shortest legal path for a prisoner, up to maxLen steps
  const prev = new Map([[tkey(from), null]]); const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const n of neighbors(w.map, c)) {
      const k = tkey(n); if (prev.has(k)) continue;
      if (n.room && n.room !== c.room && roomLocked(w, n.room, p)) continue;
      prev.set(k, c);
      if (n === to) { const path = []; let cur = n; while (cur !== from) { path.unshift(cur); cur = prev.get(tkey(cur)); } return path.length <= maxLen ? path : null; }
      q.push(n);
    }
  }
  return null;
}
function doRun(w, p, t, a) { // up to 3 tiles for 2 AP, loud and suspicious but not a crime in itself
  const to = tileAt(w.map, a.x, a.y); if (!to) return fail('Pick a tile to run to.');
  const path = pathTo(w, p, t, to, 3); if (!path || path.length < 2) return fail('Running needs a clear route of 2 to 3 tiles.');
  p.hidden = false;
  for (const s of path) { p.x = s.x; p.y = s.y; anim(w, 'p', p.id, s.x, s.y); witness(w, p, 'sus', 'running'); }
  p.stats.moves += path.length;
  emitNoise(w, p.x, p.y, CFG.NOISE.run, { kind: 'player', id: p.id }, 'running', true);
  return okk('You sprint ' + path.length + ' tiles. It is loud.');
}
function lootSource(t) { return t.room || t; }
function doLoot(w, p, t) {
  const body = guardsAt(w, t.x, t.y).find(g => (g.ko > 0 || g.dead) && (g.carry.baton || g.carry.keycard || g.carry.cigs));
  p.hidden = false;
  if (body) {
    const got = []; for (const [it, q] of Object.entries(body.carry)) if (q) { addItem(p, it, q); got.push(q + ' ' + itemName(it)); body.carry[it] = 0; }
    emitNoise(w, t.x, t.y, CFG.NOISE.loot, { kind: 'player', id: p.id }, 'rustling', noiseSus(w, p, false));
    witness(w, p, 'sus', 'looting a guard'); return okk('You go through ' + body.name + "'s pockets: " + got.join(', ') + '.');
  }
  const src = lootSource(t); const room = t.room;
  if (room && room.type === 'cell') {
    if (room.owner === p.id) return fail('Your own cell has no loot. Use your stash.');
    if (room.owner !== null) return fail("You can't rob a fellow prisoner's bunk. Their stash is locked up tight.");
  }
  if (!(src.spots > 0)) return fail('There is nothing left to steal here.');
  const occ = room && room.type === 'cell' ? w.npcs.find(n => n.cellRoom === room && n.x === t.x && n.y === t.y && n.ko <= 0) : null;
  src.spots--; p.stats.loots++;
  emitNoise(w, t.x, t.y, CFG.NOISE.steal, { kind: 'player', id: p.id }, 'rustling', noiseSus(w, p, false));
  witness(w, p, 'sus', 'stealing');
  if (occ) { npcTurnHostile(w, occ, p, 'You are robbing his bunk!'); }
  const r = rollLoot(w, ROOMS[t.type].loot);
  if (!r) return okk('You search the ' + t.name.toLowerCase() + ' and find nothing.' + (occ ? ' ' + occ.name + ' lunges at you!' : ''));
  addItem(p, r[0], r[1]);
  return okk('You ' + (room && room.type === 'cell' ? 'steal ' : 'find ') + r[1] + ' ' + itemName(r[0]) + '.' + (occ ? ' ' + occ.name + ' lunges at you!' : ''));
}
function doSalvage(w, p, t) {
  if (!ROOMS[t.type].salvage) return fail('Nothing to salvage here.');
  const r = t.room; if (!r || r.salv <= 0) return fail('You have stripped this place of anything useful.');
  r.salv--; addItem(p, 'scrap', 1); emitNoise(w, t.x, t.y, 2, { kind: 'player', id: p.id }, 'clanking', noiseSus(w, p, false)); p.hidden = false;
  return okk('You salvage some scrap.');
}
function doWork(w, p, t) {
  if (!ROOMS[t.type].work) return fail('There is no work detail here.');
  if (isNight(w)) return fail('No work at night.');
  const k = t.room.id; if ((p.workCd[k] || 0) > w.round) return fail('You already pulled a shift here. Come back later.');
  p.workCd[k] = w.round + 6; addItem(p, 'cigs', 1); p.hidden = false; return okk('You work a shift and earn 1 cigarette.');
}
function doCraft(w, p, t, out) {
  if (t.type !== 'cell' && t.type !== 'workshop') return fail('You need a cell or the workshop to craft.');
  const r = RECIPES.find(r => r.out === out); if (!r) return fail('Unknown recipe.');
  for (const [it, q] of Object.entries(r.cost)) if (!has(p, it, q)) return fail('You need ' + q + ' ' + itemName(it) + '.');
  for (const [it, q] of Object.entries(r.cost)) takeItem(p, it, q);
  addItem(p, out, 1); return okk('You craft a ' + itemName(out) + '.');
}
function doDummy(w, p, t) {
  if (!t.room || t.room !== cellOf(w, p)) return fail('Prop the dummy up in your own cell.');
  if (t.room.dummy) return fail('A dummy is already in your bed.');
  if (!has(p, 'dummy')) return fail('You need a bed dummy. Craft or buy one.');
  takeItem(p, 'dummy'); t.room.dummy = true; return okk('You shape a lumpy "sleeper" under the blanket.');
}
function doStashMove(w, p, t, a) {
  if (p.shop !== 'stash' || !t.room || t.room !== cellOf(w, p)) return fail('Open your stash first.');
  const st = t.room.stash, n = a.qty || 1;
  if (a.dir === 'in') { if (!has(p, a.item, n)) return fail('You do not have that.'); takeItem(p, a.item, n); st[a.item] = (st[a.item] || 0) + n; }
  else { if ((st[a.item] || 0) < n) return fail('Not in the stash.'); st[a.item] -= n; if (st[a.item] <= 0) delete st[a.item]; addItem(p, a.item, n); }
  return okk(null);
}
function doGive(w, p, a) {
  const q = w.players[a.to]; if (!q || q.status !== 'free' || q.x !== p.x || q.y !== p.y) return fail('They are not here.');
  const n = a.qty || 1; if (!has(p, a.item, n)) return fail('You do not have that.');
  takeItem(p, a.item, n); addItem(q, a.item, n); return okk('You hand ' + n + ' ' + itemName(a.item) + ' to ' + q.name + '.');
}
function doUse(w, p, item) {
  if (!has(p, item)) return fail('You do not have that.');
  if (item === 'pills') { if (p.hp >= CFG.HP_PRISONER) return fail('You are not hurt.'); takeItem(p, 'pills'); p.hp = Math.min(CFG.HP_PRISONER, p.hp + 2); return okk('You swallow a painkiller (+2 HP).'); }
  if (item === 'uniform') { p.wearing = !p.wearing; return okk(p.wearing ? 'You pull on the guard uniform.' : 'You take the uniform off.'); }
  if (item === 'meth') { takeItem(p, 'meth'); p.meth = { state: 'high', left: CFG.METH.high }; p.ap = CFG.AP + 1; p.apBonus = true; return okk('Your heart hammers. 3 AP for ' + CFG.METH.high + ' turns. The crash will hurt.'); }
  return fail('Nothing happens.');
}
function doSleep(w, p) {
  if (!isNight(w)) return fail('You can only sleep through the night.');
  if (!inOwnCell(w, p)) return fail('Get back to your own cell first.');
  p.asleep = true; p.hidden = false; p.ap = 0; addLog(w, p.name + ' turns in for the night.', null, null, 'info', p.id);
  endTurn(w); return okk(null);
}

// ----- locks and alarms -----
function raiseAlarm(w, p, room, tile) {
  raiseAlert(w, 1, tile.x, tile.y);
  addLog(w, 'ALARM: the ' + room.name + ' door alarm trips!', tile.x, tile.y, 'alert');
  notify(w, null, 'A door alarm is ringing at the ' + room.name + '.', 'bad');
  emitNoise(w, tile.x, tile.y, CFG.NOISE.alarm, { kind: 'player', id: p.id }, 'alarm', true);
}
function doUnlock(w, p, t, rid) {
  const room = w.map.rooms[rid]; if (!room) return fail('Nothing to unlock.');
  const door = room.tiles.find(rt => neighbors(w.map, t).includes(rt)); if (!door) return fail('You must stand next to the door.');
  const nightCell = room.type === 'cell' && !room.locked;
  if (!room.locked && !(nightCell && roomLocked(w, room, p))) return fail('It is not locked.');
  const open = () => { if (nightCell) room.openUntil = w.round + timeOf(w).left; else room.locked = false; };
  p.hidden = false;
  if (has(p, 'keycard')) { open(); return okk('You swipe the keycard. The ' + room.name + ' door clicks open.'); }
  if (!has(p, 'lockpick')) return fail('You need a lockpick or a keycard.');
  emitNoise(w, door.x, door.y, CFG.NOISE.lockpick, { kind: 'player', id: p.id }, 'scraping', true);
  witness(w, p, 'sus', 'lockpicking');
  let note = '';
  if (room.alarm) {
    if (has(p, 'jammer')) { takeItem(p, 'jammer'); note = ' The jammer keeps the alarm quiet.'; }
    else if (p.alarmOff.has(timeOf(w).slot)) note = ' The bribed alarm stays silent.';
    else raiseAlarm(w, p, room, door);
  }
  if (w.rng() < 0.65) { open(); return okk('The lock gives way. ' + room.name + ' is open.' + note); }
  if (w.rng() < 0.3) { takeItem(p, 'lockpick'); return okk('Your lockpick snaps in the lock.' + note); }
  return okk('You fumble the lock. It holds.' + note);
}
function doHack(w, p, t) {
  if (!(t.room && ROOMS[t.type].terminal)) return fail('There is no terminal here.');
  if (!has(p, 'usb') && !has(p, 'keycard')) return fail('You need a Hacker USB or a keycard.');
  w.camsOff = CFG.HACK_TURNS; emitNoise(w, p.x, p.y, CFG.NOISE.hack, { kind: 'player', id: p.id }, 'keys', true); p.hidden = false;
  return okk('The cameras go blind for ' + CFG.HACK_TURNS + ' rounds.');
}
function doPower(w, p, t) {
  if (!(t.room && ROOMS[t.type].breaker)) return fail('There is no breaker panel here.');
  w.powerOff = CFG.POWER_TURNS; p.hidden = false;
  emitNoise(w, p.x, p.y, CFG.NOISE.power, { kind: 'player', id: p.id }, 'clunk', true);
  raiseAlert(w, 1, p.x, p.y, 'The power fails. Lights and cameras are down.'); notify(w, null, 'Blackout! The power just failed.', 'bad');
  for (const g of w.guards) if (g.ko <= 0 && !g.dead && !g.off && ['patrol', 'post', 'investigate', 'search'].includes(g.state)) { g.state = 'investigate'; g.dest = { x: p.x, y: p.y }; }
  return okk('You throw the main breaker. Everything goes dark.');
}
function refreshSpotted(w) {
  for (const p of w.players) {
    p.spotted = []; if (p.status !== 'free') continue;
    const lvl = p.asleep ? null : trespassLevel(w, p);
    for (const g of w.guards) if (guardSees(w, g, p, true)) p.spotted.push({ gid: g.id, level: lvl, hunting: g.state === 'hunt' && g.target === p.id });
  }
}
