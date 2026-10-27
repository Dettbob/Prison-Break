// ===== engine4.js (v2) : context actions, modal data and tips for the UI (and for test bots) =====
function moveOptions(w, p) {
  const t = ptile(w, p);
  return neighbors(w.map, t).map(n => {
    const locked = !!(n.room && n.room !== t.room && roomLocked(w, n.room, p));
    return { x: n.x, y: n.y, name: n.name, locked, why: locked ? lockWhy(w, p, n) : null, restricted: restricted(w, p, n), tile: n };
  });
}
function runOptions(w, p) { // tiles 2 or 3 steps away for 2 AP
  const t = ptile(w, p), res = [];
  for (const [k, d] of reach(w, t, 3, false)) {
    if (d < 2) continue; const [x, y] = k.split(',').map(Number), to = tileAt(w.map, x, y);
    const path = pathTo(w, p, t, to, 3); if (path && path.length >= 2) res.push({ x, y, name: to.name, steps: path.length, restricted: restricted(w, p, to) });
  }
  return res;
}

function getActions(w, p) {
  const t = ptile(w, p), R = ROOMS[t.type], room = t.room, list = [];
  const add = (id, label, ap, a, why, extra) => list.push(Object.assign({ id, label, ap, a, why: why || (p.ap < ap ? 'Needs ' + ap + ' AP' : null), enabled: !why && p.ap >= ap }, extra || {}));
  if (p.status !== 'free') return list;
  const own = room && room.type === 'cell' && room.owner === p.id;
  const cover = coverOf(t);
  add('hide', p.hidden ? 'Hidden' : 'Hide', 1, { t: 'hide' }, p.hidden ? 'Already hidden' : null, { note: cover === 'open' ? 'found within 2 tiles' : 'found only on the same tile' });
  const body = guardsAt(w, t.x, t.y).find(g => (g.ko > 0 || g.dead) && (g.carry.baton || g.carry.keycard || g.carry.cigs));
  if (body) add('loot', 'Search ' + body.name, 1, { t: 'loot' });
  else if (R.loot) {
    const src = room && room.type === 'cell' ? room : t; const left = src.spots;
    const steal = room && room.type === 'cell' && !own;
    add('loot', steal ? 'Steal' : 'Loot', 1, { t: 'loot' }, own ? 'Your own cell: use the stash' : (left <= 0 ? 'Nothing left here' : null), { note: left > 0 ? left + ' spot' + (left > 1 ? 's' : '') : '', sus: !!ROOMS[t.type].loot });
  }
  if (R.salvage) add('salvage', 'Salvage', 1, { t: 'salvage' }, (room && room.salv <= 0) ? 'Stripped bare' : null);
  if (R.work) add('work', 'Work shift (+1 cig)', 1, { t: 'work' }, isNight(w) ? 'Not at night' : ((p.workCd[room.id] || 0) > w.round ? 'Come back later' : null));
  if (t.type === 'cell' || t.type === 'workshop') for (const r of RECIPES) {
    const need = Object.entries(r.cost).map(([i, q]) => q + ' ' + ITEMS[i].name.toLowerCase()).join(', ');
    add('craft_' + r.out, 'Craft ' + ITEMS[r.out].name, 1, { t: 'craft', out: r.out }, Object.entries(r.cost).some(([i, q]) => !has(p, i, q)) ? 'Needs ' + need : null, { note: need });
  }
  if (own) {
    add('stash', 'Open stash', 0, { t: 'stash' }, null, { ui: 'stash' });
    add('dummy', 'Put dummy in bed', 1, { t: 'dummy' }, room.dummy ? 'Dummy already in bed' : (has(p, 'dummy') ? null : 'Needs a bed dummy'));
    if (isNight(w)) add('sleep', 'Sleep through the night', 0, { t: 'sleep' }, null, { note: 'skips ahead' });
  }
  for (const n of w.npcs) if (n.x === t.x && n.y === t.y && !n.off && !n.dead && n.ko <= 0) {
    if (n.hostile != null) { add('atkn_' + n.id, 'Fight ' + n.name, 1, { t: 'attack', kind: 'npc', id: n.id }, null); continue; }
    const label = n.role === 'inmate' ? 'Talk to ' + n.name : n.name + ' (' + n.role + ')';
    add('trade_' + n.id, label, 0, { t: 'trade', nid: n.id }, null, { ui: 'shop', nid: n.id });
    if (n.role === 'inmate') {
      add('hire_' + n.id, 'Hire ' + n.name + ' for a brawl', 0, { t: 'hire', nid: n.id }, null, { ui: 'hire', nid: n.id, note: '8 cigs' });
      add('atkn_' + n.id, 'Attack ' + n.name, 1, { t: 'attack', kind: 'npc', id: n.id }, null);
      if (weaponOf(p).id !== 'fists') add('snkn_' + n.id, 'Takedown ' + n.name, 2, { t: 'sneakattack', kind: 'npc', id: n.id }, (p.hidden || !tileLit(w, t)) ? null : 'Hide or use the dark first');
    }
  }
  // doors: locked rooms and other cells at night
  const seen = new Set();
  for (const n of neighbors(w.map, t)) if (n.room && n.room !== room && !seen.has(n.room.id) && roomLocked(w, n.room, p)) {
    seen.add(n.room.id); const r = n.room, kc = has(p, 'keycard'), lp = has(p, 'lockpick');
    const alarm = r.alarm && !(p.alarmOff.has(timeOf(w).slot) || w.camsOff > 0 && false);
    const quiet = !r.alarm || p.alarmOff.has(timeOf(w).slot) || has(p, 'jammer');
    add('unlock_' + r.id, (kc ? 'Swipe into ' : 'Pick lock: ') + r.name, 1, { t: 'unlock', rid: r.id }, (kc || lp) ? null : 'Needs lockpick or keycard', { note: kc || quiet ? '' : 'raises the alarm', sus: true, alarm: alarm && !quiet && !kc });
  }
  if (R.terminal) add('hack', 'Hack cameras', 1, { t: 'hack' }, (has(p, 'usb') || has(p, 'keycard')) ? null : 'Needs Hacker USB');
  if (R.breaker) add('power', 'Cut the power', 1, { t: 'power' }, null);
  const ex = exitsNear(w.map, t);
  if (ex.some(e => e.type === 'fence')) add('cutfence', 'Cut fence and run', 2, { t: 'cutfence' }, has(p, 'wirecutters') ? null : 'Needs wirecutters');
  if (ex.some(e => e.type === 'gate')) add('escape', 'Open gate and walk out', 1, { t: 'escape' }, has(p, 'keycard') ? null : 'Needs a keycard');
  const wp = weaponOf(p);
  for (const g of w.guards) {
    if (g.dead || g.off || g.ko > 0) continue;
    const d = pathDist(w, t, unitTile(w, g), 2);
    if (d <= 1) {
      const known = p.intel.corrupt;
      add('bribe_' + g.id, 'Bribe ' + g.name + (known ? (g.corrupt ? ' (~' + g.price + ')' : ' (honest!)') : ''), 0, { t: 'bribe', gid: g.id }, null, { ui: 'bribe', gid: g.id });
      if (g.corrupt && g.blind[p.id] && g.blind[p.id].until >= w.round) add('key_' + g.id, 'Buy keycard from ' + g.name, 1, { t: 'buykey', gid: g.id }, null);
    }
    if (d === 0) {
      add('atk_' + g.id, 'Attack ' + g.name + ' (' + wp.id + ')', 1, { t: 'attack', kind: 'guard', id: g.id }, null);
      const unaware = !['hunt', 'sus'].includes(g.state) && (p.hidden || !tileLit(w, t));
      add('snk_' + g.id, 'Takedown ' + g.name, 2, { t: 'sneakattack', kind: 'guard', id: g.id }, unaware ? null : 'Too alert. Hide or use the dark.');
    } else if (d <= 2 && wp.ranged) add('atk_' + g.id, 'Shoot ' + g.name, 1, { t: 'attack', kind: 'guard', id: g.id }, null);
  }
  const others = playersAt(w, t.x, t.y, p.id);
  if (others.length) {
    add('give', 'Give item', 0, { t: 'give' }, Object.keys(p.items).length ? null : 'Nothing to give', { ui: 'give', others: others.map(q => q.id) });
    if (w.mode === 'race') for (const q of others) add('pvp_' + q.id, 'Attack ' + q.name, 1, { t: 'attack', kind: 'player', id: q.id }, null);
  }
  if (has(p, 'pills')) add('pills', 'Take painkillers', 1, { t: 'use', item: 'pills' }, p.hp >= CFG.HP_PRISONER ? 'Not hurt' : null);
  if (has(p, 'meth')) add('meth', 'Take meth', 1, { t: 'use', item: 'meth' }, p.meth ? 'Already on it / crashing' : null, { note: '3 AP for ' + CFG.METH.high + ' turns, then ' + CFG.METH.crash + ' turns of 1 AP' });
  if (has(p, 'uniform')) add('uniform', p.wearing ? 'Take off uniform' : 'Wear uniform', 1, { t: 'use', item: 'uniform' }, null);
  return list;
}

// ----- modal data -----
function shopFor(w, p) {
  const n = shopNpc(w, p); if (!n) return null;
  const mine = Object.keys(p.items).filter(i => i !== 'cigs').map(i => ({ item: i, price: sellPrice(i), qty: p.items[i] }));
  if (n.role === 'fixer') return { nid: n.id, role: 'fixer', name: 'Fixer', intel: [{ kind: 'cams', label: 'Camera locations', price: CFG.INTEL_PRICE }, { kind: 'corrupt', label: 'Which guards take bribes', price: CFG.INTEL_PRICE }, { kind: 'guards', label: 'Guard positions for 3 rounds', price: CFG.INTEL_PRICE }] };
  if (n.role === 'informant') {
    const slots = []; for (let d = 0; d < 7; d++) for (const ph of CFG.PHASES) { const s = d + '-' + ph.id; slots.push({ slot: s, label: slotLabel(s), owned: p.routeIntel.has(s), price: CFG.ROUTE_PRICE }); }
    return { nid: n.id, role: 'informant', name: 'Informant', slots };
  }
  return { nid: n.id, role: n.role, name: n.role === 'inmate' ? n.name : VENDORS[n.role].name, sells: Object.entries(npcStock(n)).map(([item, price]) => ({ item, price })), buys: n.role === 'dealer' ? mine : [] };
}
function stashData(w, p) {
  const room = cellOf(w, p); return { carry: Object.assign({}, p.items), stash: Object.assign({}, room.stash) };
}
function bribeData(w, p, gid) {
  const g = w.guards.find(x => x.id === gid); if (!g) return null;
  return { gid, name: g.name, known: p.intel.corrupt, corrupt: g.corrupt, purposes: ['blind', 'alarm'].map(k => ({ k, label: BRIBE[k].label, desc: BRIBE[k].desc, price: bribePrice(w, g, k), offers: OFFERS.map(o => ({ k: o.k, label: o.label, amount: Math.round(bribePrice(w, g, k) * o.f) })) })), phases: CFG.PHASES.map(ph => ({ id: ph.id, name: ph.name })) };
}
function confrontData(w, p) {
  const pd = p.pending; if (!pd) return null; const g = w.guards.find(x => x.id === pd.gid);
  if (pd.type === 'confront') return Object.assign({ type: 'confront', guard: g && g.name, price: g && bribePrice(w, g, 'release'), offers: g && OFFERS.map(o => ({ k: o.k, label: o.label, amount: Math.round(bribePrice(w, g, 'release') * o.f) })), canAttack: !!weaponOf(p) }, pd);
  return Object.assign({ type: pd.type }, pd);
}

// ----- tips ("?" corner): what to do next -----
function getTips(w, p) {
  const t = timeOf(w), tips = [], c = (txt) => tips.push(txt);
  const room = cellOf(w, p);
  if (p.pending) c('Something is happening to you right now. Choose a reaction in the window.');
  if (t.phase === 'evening' && t.left <= CFG.NIGHT_WARN) c('Lights out soon. Walk back to your own cell (highlighted YOUR CELL) before night. Place a dummy in the bed if you want to roam later.');
  if (t.phase === 'night') c(inOwnCell(w, p) ? 'You are in your cell at night: safe. Sleep to skip to morning, or sneak out with a lockpick and a bed dummy.' : 'Guards expect you in your cell. Anyone out of bed is hunted. Get back, or make sure a dummy covers for you.');
  if (!p.items.lockpick && !p.items.keycard) c('Next step: collect 3 scrap (salvage in workshop, laundry, kitchen), craft a lockpick in your cell, or buy one from the Dealer in the Common Room.');
  if (!p.items.wirecutters && !p.items.keycard) c('To escape you need wirecutters (fence, 2 AP) or a keycard (gate). Wirecutters: craft with 5 scrap or buy from the Dealer.');
  if (!Object.keys(room.stash).length && Object.keys(p.items).filter(i => i !== 'cigs' && isContraband(i)).length) c('Contraband on you gets confiscated if you are caught. Store it in your cell stash.');
  if ((p.items.cigs || 0) < 5) c('Cigarettes are currency and cannot be confiscated. Earn them with work shifts (library, kitchen, laundry, workshop).');
  c('Yellow ? above a guard = suspicious of you. Red ! = hunting you. Out of sight for a while and he gives up.');
  c('Lockpicking rooms with alarms alerts everyone. Get a jammer, or bribe a guard to switch alarms off for a time of day.');
  c('The Informant in the Library sells patrol routes. Guards repeat the same routes every week, in the same time slot.');
  return tips.slice(0, 7);
}
