// ===== engine2b.js (v2) : trade, bribes, confrontations, violence, escape, strikes, turn flow =====
const sellPrice = it => Math.max(1, Math.floor(ITEMS[it].value * 0.5));
function shopNpc(w, p) {
  if (typeof p.shop !== 'string' || !p.shop.startsWith('npc:')) return null;
  const n = w.npcs.find(n => n.id === +p.shop.slice(4));
  return (n && n.x === p.x && n.y === p.y && n.ko <= 0 && !n.off) ? n : null;
}
function npcStock(n) { return n.role === 'inmate' ? n.stock : (VENDORS[n.role].sells || {}); }
function doTradeOpen(w, p, nid) {
  const n = w.npcs.find(n => n.id === nid);
  if (!n || n.x !== p.x || n.y !== p.y || n.off || n.ko > 0) return fail('Nobody to trade with.');
  if (n.hostile != null) return fail(n.name + ' wants to fight, not trade.');
  p.shop = 'npc:' + n.id; return okk('You start talking business with ' + n.name + '.');
}
function tradeWitness(w, p, item) { if (isContraband(item)) witness(w, p, 'sus', 'dealing contraband'); }
function doBuy(w, p, item) {
  const n = shopNpc(w, p); if (!n) return fail('Open trading first.');
  const price = npcStock(n)[item]; if (!price) return fail('Not for sale.');
  if (!has(p, 'cigs', price)) return fail('You need ' + price + ' cigarettes.');
  takeItem(p, 'cigs', price); addItem(p, item, 1); p.hidden = false; tradeWitness(w, p, item);
  if (n.role === 'inmate') { delete n.stock[item]; }
  return okk('You buy a ' + itemName(item) + ' for ' + price + '.');
}
function doSell(w, p, item) {
  const n = shopNpc(w, p); if (!n || n.role !== 'dealer') return fail('Only the dealer buys goods.');
  if (item === 'cigs' || !has(p, item)) return fail("You can't sell that.");
  const v = sellPrice(item); takeItem(p, item, 1); addItem(p, 'cigs', v); p.hidden = false; tradeWitness(w, p, item);
  return okk('You sell a ' + itemName(item) + ' for ' + v + '.');
}
function doIntel(w, p, kind) {
  const n = shopNpc(w, p); if (!n || n.role !== 'fixer') return fail('Talk to the fixer first.');
  if (!has(p, 'cigs', CFG.INTEL_PRICE)) return fail('Intel costs ' + CFG.INTEL_PRICE + ' cigarettes.');
  takeItem(p, 'cigs', CFG.INTEL_PRICE);
  if (kind === 'cams') { p.intel.cams = true; return okk('The fixer marks every camera on your map.'); }
  if (kind === 'corrupt') { p.intel.corrupt = true; return okk('The fixer tells you which guards take money.'); }
  p.intel.seeUntil = w.round + 3; return okk('The fixer whispers where every guard is right now.');
}
function doRoute(w, p, slot) {
  const n = shopNpc(w, p); if (!n || n.role !== 'informant') return fail('Talk to the informant first.');
  if (!/^[0-6]-(morning|day|evening|night)$/.test(slot || '')) return fail('Pick a day and time.');
  if (p.routeIntel.has(slot)) return fail('You already have those patrol routes.');
  if (!has(p, 'cigs', CFG.ROUTE_PRICE)) return fail('Patrol routes cost ' + CFG.ROUTE_PRICE + ' cigarettes.');
  takeItem(p, 'cigs', CFG.ROUTE_PRICE); p.routeIntel.add(slot);
  return okk('The informant sells you the guard patrol routes for ' + slotLabel(slot) + '.');
}
function doHire(w, p, a) {
  const n = w.npcs.find(n => n.id === a.nid); const room = w.map.rooms[a.rid];
  if (!n || n.role !== 'inmate' || n.x !== p.x || n.y !== p.y) return fail('Nobody here to hire.');
  if (!room || !['common', 'dining', 'court', 'showers', 'library', 'workshop', 'laundry', 'kitchen'].includes(room.type)) return fail('Pick a public room for the fight.');
  const price = 8; if (!has(p, 'cigs', price)) return fail('A brawl costs ' + price + ' cigarettes.');
  if (w.rng() < 0.2) return okk(n.name + ' shrugs. "Not for that money."');
  takeItem(p, 'cigs', price); const slot = nextSlot(w, a.phase);
  w.contracts.push({ nid: n.id, rid: room.id, slot, started: false, ended: false, by: p.id });
  p.hidden = false; return okk(n.name + ' agrees to start a fight in the ' + room.name + ' on ' + slotLabel(slot) + '.');
}

// ----- bribes -----
const bribePrice = (w, g, purpose) => Math.max(1, Math.round(g.price * BRIBE[purpose].mult * (1 + 0.25 * w.alert)));
function doBribe(w, p, a) {
  const g = w.guards.find(g => g.id === a.gid);
  if (!g || g.ko > 0 || g.dead || g.off) return fail('No one to bribe.');
  if (pathDist(w, ptile(w, p), unitTile(w, g), 1) > 1) return fail('Too far away.');
  if (!BRIBE[a.purpose] || a.purpose === 'release') return fail('Choose what you are bribing him for.');
  const res = attemptBribe(w, p, g, a.purpose, a.offer, a.phase); if (!res.ok) return res;
  for (const o of w.guards) if (o !== g && guardSees(w, o, p)) markSuspect(w, o, p, 'sus', 'bribing a guard');
  return res;
}
function attemptBribe(w, p, g, purpose, offerKey, phase) {
  const f = (OFFERS.find(o => o.k === offerKey) || OFFERS[1]).f, price = bribePrice(w, g, purpose), amount = Math.round(price * f);
  if (!has(p, 'cigs', amount)) return fail('You need ' + amount + ' cigarettes for that offer.');
  if (purpose === 'alarm' && !CFG.PHASES.some(ph => ph.id === phase)) return fail('Pick a time of day.');
  p.hidden = false;
  if (!g.corrupt) {
    if (w.rng() < 0.6) { const r = arrestPlayer(w, g, p, 'attempted bribery'); return okk(g.name + ' will not be bought. ' + r); }
    markSuspect(w, g, p, 'sus', 'bribe attempt'); return okk(g.name + ' refuses and gives you a hard look.');
  }
  const r = w.rng(); const out = f >= 1.4 ? 'accept' : f >= 1 ? (r < 0.9 ? 'accept' : 'counter') : (r < 0.45 ? 'accept' : r < 0.85 ? 'counter' : 'strike');
  if (out === 'accept') { takeItem(p, 'cigs', amount); return applyBribe(w, p, g, purpose, phase, amount); }
  if (out === 'counter') {
    const counter = Math.ceil(price * (1.2 + w.rng() * 0.35));
    p.pending = { type: 'counter', gid: g.id, purpose, phase, price: counter, ctx: w.paused ? 'confront' : 'normal' };
    return okk(g.name + ' wants more: ' + counter + ' cigarettes.');
  }
  const res = arrestPlayer(w, g, p, 'insulting bribe'); return okk(g.name + ' is insulted by the offer. ' + res);
}
function applyBribe(w, p, g, purpose, phase, amount) {
  if (purpose === 'blind') { g.blind[p.id] = { until: w.round + 16, charges: 1 }; return okk('You slip ' + g.name + ' ' + amount + ' cigarettes. He will look the other way next time.'); }
  if (purpose === 'alarm') { const slot = nextSlot(w, phase); p.alarmOff.add(slot); return okk(g.name + ' takes ' + amount + ' cigarettes and promises the door alarms are "broken" on ' + slotLabel(slot) + '.'); }
  delete g.sus[p.id]; g.state = g.post ? 'post' : 'patrol'; g.target = null; g.wait = 1;
  return okk(g.name + ' pockets ' + amount + ' cigarettes and waves you on.');
}
function doBuyKey(w, p, gid) {
  const g = w.guards.find(g => g.id === gid); const bl = g && g.blind[p.id];
  if (!g || !g.corrupt || !bl) return fail('Bribe the guard first.');
  const price = 12 + g.price * 2; if (!has(p, 'cigs', price)) return fail('A keycard costs ' + price + ' cigarettes.');
  takeItem(p, 'cigs', price); addItem(p, 'keycard', 1); return okk(g.name + ' "loses" a keycard. It costs you ' + price + '.');
}

// ----- pending decisions: confrontations, counteroffers, extortion -----
function finishPending(w) { if (w.paused && !w.players.some(p => p.pending)) { w.paused = null; continueGuards(w); } }
function resolvePending(w, pid, a) {
  const p = w.players[pid], pd = p.pending; if (!pd) return fail('Nothing to resolve.');
  const g = w.guards.find(g => g.id === pd.gid); let res;
  if (pd.type === 'confront') {
    if (!g || g.ko > 0 || g.dead) { p.pending = null; finishPending(w); return okk(null); }
    p.pending = null;
    if (a.c === 'cooperate') res = cooperate(w, p, g);
    else if (a.c === 'bribe') {
      res = attemptBribe(w, p, g, 'release', a.offer, null);
      if (!res.ok) { p.pending = pd; return res; }
      if (!p.pending && g.sus[p.id] && p.status === 'free') res = okk(res.msg + ' ' + cooperate(w, p, g).msg);
    } else if (a.c === 'attack') res = confrontAttack(w, p, g);
    else if (a.c === 'run') res = confrontRun(w, p, g);
    else { p.pending = pd; return fail('Choose how to react.'); }
  } else if (pd.type === 'counter') {
    p.pending = null;
    if (a.c === 'pay' && g && has(p, 'cigs', pd.price)) { takeItem(p, 'cigs', pd.price); res = applyBribe(w, p, g, pd.purpose, pd.phase, pd.price); }
    else if (pd.ctx === 'confront' && g) res = okk('You decline. ' + cooperate(w, p, g).msg);
    else res = okk('You decline his price.');
  } else if (pd.type === 'extort') {
    p.pending = null; const n = w.npcs.find(n => n.id === pd.nid);
    if (a.c === 'pay' && has(p, 'cigs', pd.amount)) { takeItem(p, 'cigs', pd.amount); res = (w.rng() < 0.15 && n) ? (npcBetray(w, n, p), okk(n.name + ' takes the cigarettes... and sells you out anyway!')) : okk(n.name + ' pockets the cigarettes. "I saw nothing."'); }
    else res = (w.rng() < 0.5 && n) ? (npcBetray(w, n, p), okk('You refuse. ' + n.name + ' runs off to tell the guards!')) : okk('You refuse. ' + n.name + ' spits and walks away.');
  } else return fail('Nothing to resolve.');
  if (res.msg) addLog(w, res.msg, p.x, p.y, 'you', p.id);
  refreshSpotted(w); checkEnd(w);
  if (!p.pending) finishPending(w);
  if (!w.over && w.phase === 'players' && w.cur === p.id && p.status !== 'free' && !p.pending) endTurn(w);
  return res;
}
function cooperate(w, p, g) {
  const taken = Object.keys(p.items).filter(isContraband);
  const names = taken.map(i => itemName(i)); taken.forEach(i => delete p.items[i]);
  if (taken.includes('uniform')) p.wearing = false;
  clearSuspicion(w, g, p); g.state = g.post ? 'post' : 'patrol'; g.target = null; g.wait = 1;
  const msg = taken.length ? g.name + ' searches you and confiscates: ' + names.join(', ') + '. No strike.' : g.name + ' pats you down, finds nothing, and lets you go with a warning.';
  notify(w, p.id, msg, taken.length ? 'warn' : 'good'); return okk(msg);
}
const clearSuspicion = (w, g, p) => { delete g.sus[p.id]; };
function confrontAttack(w, p, g) {
  p.hidden = false; const t = ptile(w, p); const wp = weaponOf(p);
  g.state = 'hunt'; g.target = p.id; const r = attackGuard(w, p, t, g, wp, false); return r.ok ? r : okk('You swing at ' + g.name + ' but miss your chance.');
}
function confrontRun(w, p, g) {
  const from = unitTile(w, g); let steps = 0; p.hidden = false;
  for (let i = 0; i < 2; i++) {
    const t = ptile(w, p); const opts = neighbors(w.map, t).filter(n => canEnter(w, p, t, n) && !(n.x === g.x && n.y === g.y));
    if (!opts.length) break;
    opts.sort((a, b) => Math.abs(b.x - from.x) + Math.abs(b.y - from.y) - Math.abs(a.x - from.x) - Math.abs(a.y - from.y));
    p.x = opts[0].x; p.y = opts[0].y; anim(w, 'p', p.id, p.x, p.y); steps++;
  }
  emitNoise(w, p.x, p.y, CFG.NOISE.run, { kind: 'player', id: p.id }, 'running', true);
  markSuspect(w, g, p, 'danger', 'fled from a guard'); witness(w, p, 'danger', 'fleeing');
  return okk('You bolt! ' + g.name + ' shouts and gives chase.');
}

// ----- violence -----
function doAttack(w, p, t, a) {
  const wp = weaponOf(p), sneak = a.t === 'sneakattack';
  if (a.kind === 'npc') return attackNpc(w, p, t, a, wp, sneak);
  if (a.kind === 'guard') return attackGuard(w, p, t, w.guards.find(g => g.id === a.id), wp, sneak);
  if (w.mode !== 'race') return fail('You are on the same team.');
  const q = w.players[a.id]; if (!q || q.status !== 'free' || q.x !== p.x || q.y !== p.y) return fail('No target here.');
  const dark = !tileLit(w, t); const bonus = sneak && (p.hidden || dark); p.loudRound = w.round; p.hidden = false;
  q.hp -= bonus ? 3 : wp.dmg; emitNoise(w, t.x, t.y, CFG.NOISE.fight, { kind: 'player', id: p.id }, 'fighting', true);
  witness(w, p, 'danger', 'fighting');
  if (q.hp <= 0) { q.hp = 2; q.ko = 3; const st = q.items.cigs || 0; if (st) { addItem(p, 'cigs', st); delete q.items.cigs; } return okk('You knock ' + q.name + ' out and take ' + st + ' cigarettes.'); }
  return okk('You hit ' + q.name + '. They have ' + q.hp + ' HP.');
}
function incapacitate(w, g, lethal) {
  if (lethal) { g.dead = true; g.ko = 0; g.state = 'dead'; } else { g.ko = 10; g.hp = 2; g.state = 'ko'; }
  g.found = false; g.sus = {}; g.target = null;
}
function attackGuard(w, p, t, g, wp, sneak) {
  if (!g || g.ko > 0 || g.dead || g.off) return fail('No target.');
  const d = pathDist(w, t, unitTile(w, g), 2), ranged = wp.ranged && d > 0 && d <= wp.ranged && !sneak;
  if (d !== 0 && !ranged) return fail('Too far. Melee needs the same tile.');
  const unaware = !['hunt', 'sus'].includes(g.state);
  if (sneak) {
    if (d !== 0) return fail('Sneak attacks need the same tile.');
    if (!unaware || !(p.hidden || !tileLit(w, t))) return fail('He is too alert for a takedown. Hide first or use the dark.');
    if (w.rng() < 0.15) { p.loudRound = w.round; p.hidden = false; g.state = 'hunt'; g.target = p.id; emitNoise(w, t.x, t.y, 4, null, 'scuffle', true); markSuspect(w, g, p, 'danger', 'attacked a guard'); return okk('The takedown fails and ' + g.name + ' shouts!'); }
    const lethal = wp.id === 'shiv'; incapacitate(w, g, lethal); p.hidden = false;
    const seen = violenceSeen(w, p, g); return okk('You ' + (lethal ? 'knife ' + g.name + ' silently.' : 'choke ' + g.name + ' out silently.') + (seen ? ' Someone saw it!' : ' Nobody saw it.'));
  }
  p.loudRound = w.round; p.hidden = false; if (wp.id === 'pistol') takeItem(p, 'ammo');
  emitNoise(w, t.x, t.y, wp.id === 'pistol' ? CFG.NOISE.gun : CFG.NOISE.fight, { kind: 'player', id: p.id }, wp.id === 'pistol' ? 'gunshot' : 'fighting', true);
  const kill = wp.lethal > 0 && w.rng() < Math.min(0.9, wp.lethal * (unaware ? 1.3 : 1)); let msg;
  if (kill) { incapacitate(w, g, true); msg = 'Your ' + wp.id + ' finds its mark. ' + g.name + ' is dead.'; }
  else { g.hp -= wp.dmg; if (g.hp <= 0) { incapacitate(w, g, false); msg = g.name + ' goes down, out cold.'; } else msg = 'You hit ' + g.name + ' with your ' + wp.id + '. ' + g.hp + ' HP left.'; }
  const seen = violenceSeen(w, p, g); if (!g.dead && g.ko <= 0) { g.state = 'hunt'; g.target = p.id; markSuspect(w, g, p, 'danger', 'attacked a guard'); }
  return okk(msg + (g.dead || g.ko > 0 ? (seen ? ' Someone saw it!' : ' Nobody saw it.') : ''));
}
// guards and inmates who saw the violence treat p as dangerous (red !)
function violenceSeen(w, p, victim) {
  let seen = false;
  for (const o of w.guards) if (o !== victim && guardSees(w, o, p)) { markSuspect(w, o, p, 'danger', 'attacking a guard'); seen = true; }
  if (npcWitness(w, p, 'attack')) seen = true;
  return seen;
}

// ----- escape -----
function doEscape(w, p, t, kind) {
  const ex = exitsNear(w.map, t); p.hidden = false;
  if (kind === 'cutfence') {
    if (!ex.some(e => e.type === 'fence')) return fail('Stand next to the fence.');
    if (!has(p, 'wirecutters')) return fail('You need wirecutters to cut the fence.');
    emitNoise(w, p.x, p.y, CFG.NOISE.fence, { kind: 'player', id: p.id }, 'snapping', true);
    p.status = 'escaped'; addLog(w, p.name + ' cut through the fence and ran!', p.x, p.y, 'escape'); return okk(null);
  }
  if (!ex.some(e => e.type === 'gate')) return fail('Stand in front of the main gate.');
  if (!has(p, 'keycard')) return fail('The gate needs a keycard.');
  let blockers = 0;
  for (const g of w.guards) {
    if (!guardSees(w, g, p, true)) continue;
    const bl = g.blind[p.id]; if (bl && bl.until >= w.round && bl.charges > 0) { bl.charges--; continue; }
    if (p.wearing && !(sightDist(w, g, t) <= 1 && w.rng() < 0.35)) continue;
    markSuspect(w, g, p, 'danger', 'gate attempt'); blockers++;
  }
  if (blockers) return okk('A guard blocks the gate. "Where do you think you are going?"');
  p.status = 'escaped'; addLog(w, p.name + ' walked out of the main gate!', p.x, p.y, 'escape'); return okk(null);
}

// ----- strikes (suspicion never costs a strike, only danger does) -----
function arrestPlayer(w, g, p, why) {
  const kind = (g && g.sus && g.sus[p.id] && g.sus[p.id].kind) || '';
  if (w.diff === 'easy' && isNight(w) && !(p.violentRound && w.round - p.violentRound <= 14) && !/attack|fight|gate|ratted|bribe|insult|violen/i.test(kind + ' ' + (why || ''))) { // easy: caught out after lights out is a talking-to, not a strike
    const c = cellOf(w, p).tiles[0]; p.hidden = false; p.pending = null; p.wanted = false; p.x = c.x; p.y = c.y; p.skip = 1; p.ap = 0; anim(w, 'p', p.id, c.x, c.y);
    for (const o of w.guards) { delete o.sus[p.id]; if (o.target === p.id && ['hunt', 'sus'].includes(o.state)) { o.state = o.post ? 'post' : 'patrol'; o.target = null; } }
    const m = 'Caught out after lights out. Easy mode: no strike. The guards march you back to your cell.'; notify(w, p.id, m, 'warn'); return m;
  }
  p.strikes++; p.hidden = false; p.loudRound = 0; p.pending = null; p.wanted = false;
  const cellR = cellOf(w, p), c = cellR.tiles[0];
  const confiscate = (all) => { // cigarettes are currency and can never be taken
    const lost = []; for (const it of Object.keys(p.items)) if (it !== 'cigs' && (all || isContraband(it))) { lost.push(it); delete p.items[it]; }
    for (const it of Object.keys(cellR.stash)) if (it !== 'cigs') { lost.push(it); delete cellR.stash[it]; }
    if (cellR.dummy) { cellR.dummy = false; lost.push('dummy'); } p.wearing = false; return lost;
  };
  let msg;
  if (p.strikes === 1) {
    confiscate(false); p.hp = Math.max(2, p.hp - 3); p.x = c.x; p.y = c.y; p.skip = 1; p.ap = 0; p.asleep = false;
    msg = 'Strike 1 of 3. ' + (g ? g.name : 'The guards') + ' beat you, confiscate your contraband and everything in your cell, and drag you back to it.';
  } else if (p.strikes === 2) {
    confiscate(true); p.status = 'solitary'; p.solitary = 3; p.hp = Math.max(3, p.hp); p.x = w.map.solitary.x; p.y = w.map.solitary.y; p.ap = 0; p.asleep = false;
    msg = 'Strike 2 of 3. Solitary confinement. Everything but your cigarettes is gone.';
  } else { p.status = 'transferred'; p.ap = 0; msg = 'Strike 3. You are transferred to the high security block. You are out of the game.'; }
  anim(w, 'p', p.id, p.x, p.y, true);
  notify(w, p.id, (why ? why[0].toUpperCase() + why.slice(1) + '. ' : '') + msg, 'bad'); addLog(w, p.name + ' gets strike ' + p.strikes + '.', null, null, 'strike', p.id);
  for (const o of w.guards) { delete o.sus[p.id]; if (o.target === p.id && ['hunt', 'sus'].includes(o.state)) { o.state = o.post ? 'post' : 'patrol'; o.target = null; } }
  return msg;
}

// ----- turn flow -----
function endTurn(w) {
  for (let i = w.cur + 1; i < w.players.length; i++) if (startPlayerTurn(w, i)) { w.cur = i; return; }
  runGuardPhase(w);
}
function startPlayerTurn(w, i) { // true if the player can act now. Timers tick once per round.
  const p = w.players[i];
  if (p.status === 'escaped' || p.status === 'transferred') return false;
  if (p.tickRound !== w.round) {
    p.tickRound = w.round; p.blocked = false;
    if (p.status === 'solitary') { p.solitary--; p.blocked = true; if (p.solitary <= 0) { p.status = 'free'; const c = cellOf(w, p).tiles[0]; p.x = c.x; p.y = c.y; addLog(w, p.name + ' is released from solitary.', null, null, 'info', p.id); } }
    else if (p.ko > 0) { p.ko--; p.blocked = true; }
    else if (p.skip > 0) { p.skip--; p.blocked = true; addLog(w, p.name + ' recovers from the beating.', null, null, 'info', p.id); }
    else if (p.asleep) { if (isNight(w)) p.blocked = true; else p.asleep = false; }
    if (p.meth) { p.meth.left--; if (p.meth.left <= 0) {
      if (p.meth.state === 'high') { p.meth = { state: 'crash', left: CFG.METH.crash }; notify(w, p.id, 'The high is over. You crash: only 1 AP for ' + CFG.METH.crash + ' turns.', 'warn'); }
      else { p.meth = null; notify(w, p.id, 'The crash is over. You feel almost human.', 'good'); } } }
  }
  if (p.blocked || p.status !== 'free') return false;
  p.ap = CFG.AP + (p.meth ? (p.meth.state === 'high' ? 1 : -1) : 0); p.heard = p.heard.filter(h => h.round >= w.round - 1); updateMemory(w, p); return true;
}
function firstPlayer(w) { for (let i = 0; i < w.players.length; i++) if (startPlayerTurn(w, i)) { w.cur = i; return true; } return false; }
function applyShift(w, t) {
  if (t.phase === 'night') { for (const g of w.guards) if (!g.post && !g.dead && g.idx >= w.nGuardsNight && g.state !== 'hunt') { g.off = true; g.state = 'patrol'; g.dest = null; } }
  if (t.phase === 'morning') {
    const gr = w.map.rooms.find(r => r.type === 'guardroom');
    for (const g of w.guards) { if (g.off) { g.off = false; g.x = gr.tiles[0].x; g.y = gr.tiles[0].y; g.px = g.x; g.py = g.y; g.routeKey = ''; } }
    for (const p of w.players) { p.wanted = false; }
    restock(w);
  }
  for (const g of w.guards) g.routeKey = '';
}
function finishRound(w) {
  checkEnd(w); if (w.over) return;
  w.round++; w.phase = 'players';
  if (w.powerOff > 0 && --w.powerOff === 0) addLog(w, 'Power is restored.', null, null, 'alert');
  if (w.camsOff > 0 && --w.camsOff === 0) addLog(w, 'The cameras reboot.', null, null, 'alert');
  if (w.alert > 0 && ++w.alertTimer >= 6) { w.alert--; w.alertTimer = 0; if (w.alert === 0) addLog(w, 'The prison settles down.', null, null, 'info'); }
  const t = timeOf(w);
  if (t.left === t.len) {
    addLog(w, t.wd + ' ' + t.name + ' begins.' + (t.phase === 'night' ? ' Prisoners must be in their cells.' : ''), null, null, 'info'); applyShift(w, t);
    if (t.phase === 'night') notify(w, null, 'Lights out. Anyone outside their cell is in serious trouble.', 'bad');
  }
  if (t.phase === 'evening' && t.left === CFG.NIGHT_WARN && w.nightWarned !== t.day) { w.nightWarned = t.day; notify(w, null, 'Lights out in ' + CFG.NIGHT_WARN + ' rounds. Be in your own cell before then.', 'warn'); }
  for (const g of w.guards) if (g.ko > 0) { g.ko--; if (g.ko === 0) { g.state = 'patrol'; g.dest = null; notify(w, null, g.name + ' wakes up with a headache.', 'warn'); } }
  checkEnd(w);
  let guard = 0;
  while (!w.over && !firstPlayer(w) && guard++ < 80) { runGuardPhase(w); if (w.paused) return; }
  refreshSpotted(w);
}
function checkEnd(w) {
  if (w.over) return;
  const esc = w.players.filter(p => p.status === 'escaped'), done = w.players.every(p => p.status === 'escaped' || p.status === 'transferred');
  if (w.mode === 'race' && esc.length) { w.over = true; w.result = { type: 'race', winner: esc[0].id }; }
  else if (done) { w.over = true; w.result = { type: esc.length === w.players.length ? 'full' : esc.length ? 'partial' : 'lost', escaped: esc.map(p => p.id) }; }
  if (w.over) w.phase = 'over';
}

// every morning the prison is restocked: loot lands in random places, some rooms stay empty, salvage partly refills
function restock(w) {
  for (const r of w.map.rooms) {
    const d = ROOMS[r.type]; if (r.type === 'cell' && r.owner !== null) continue;
    if (d.loot && d.spots) r.spots = w.rng() < 0.75 ? rint(w.rng, Math.max(1, d.spots[0]), Math.max(1, d.spots[1])) : 0;
    if (d.salvage) r.salv = Math.min(4, r.salv + rint(w.rng, 0, 2));
  }
  for (const t of w.map.grid) if (t && t.type === 'yard') t.spots = w.rng() < 0.35 ? 1 : 0;
  addLog(w, 'Supplies were moved around overnight. New loot is lying about.', null, null, 'info');
}
