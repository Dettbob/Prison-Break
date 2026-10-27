// ===== engine5.js (v2) : NPCs (vendors and inmates), routines, hostility, hired brawls, witnesses =====
const WORK_TYPES = ['workshop', 'laundry', 'kitchen', 'library'];
function roomsOfType(w, type) { return w.map.rooms.filter(r => r.type === type); }

function spawnNpcs(w) {
  const { map, rng } = w; const names = shuffle(rng, NPC_NAMES.slice());
  const add = (o) => { const n = Object.assign({ id: w.nextId++, hp: 4, ko: 0, off: false, dead: false, hostile: null, hostLeft: 0, stock: {}, fight: null }, o); w.npcs.push(n); return n; };
  for (const role of Object.keys(VENDORS)) {
    const v = VENDORS[role], room = roomsOfType(w, v.room)[0]; if (!room) continue;
    const t = room.tiles[Math.floor(rng() * room.tiles.length)];
    add({ role, name: v.name, x: t.x, y: t.y, home: { x: t.x, y: t.y }, roomId: room.id });
  }
  const free = map.rooms.filter(r => r.type === 'cell' && r.owner === null);
  const keys = Object.keys(INMATE_STOCK).filter(k => k !== 'cigs');
  const count = Math.min(CFG.NPCS, free.length);
  for (let i = 0; i < count; i++) {
    const room = free[i], stock = {};
    for (const k of shuffle(rng, keys.slice()).slice(0, rint(rng, 1, 3))) stock[k] = INMATE_STOCK[k] + rint(rng, -1, 2);
    const stay = rng() < 0.6 ? pick(rng, ['morning', 'day', 'evening']) : null; // sits in the cell during this phase
    const n = add({ role: 'inmate', name: names[i % names.length], x: room.tiles[0].x, y: room.tiles[0].y, home: { x: room.tiles[0].x, y: room.tiles[0].y }, cellRoom: room, stock, stay });
    room.npcOwners.push(n.id);
    const t = npcTarget(w, n); if (t) { n.x = t.x; n.y = t.y; }
  }
}

// deterministic weekly routine: the same inmate is in the same place every Tuesday evening
function npcTarget(w, n) {
  const t = timeOf(w);
  if (n.role !== 'inmate') return n.home;
  if (t.phase === 'night' || n.stay === t.phase || (t.phase === 'evening' && t.left <= 3)) return n.home; // lights out: everyone is back in their own cell
  const r = mulberry32((w.seed ^ (t.wi * 31337) ^ (t.pi * 7919) ^ (n.id * 104729)) >>> 0);
  let types;
  if (t.phase === 'morning') types = ['dining', 'showers', 'common'];
  else if (t.phase === 'day') types = WORK_TYPES.concat(['court', 'common']);
  else types = ['common', 'court', 'dining'];
  const rooms = types.flatMap(ty => roomsOfType(w, ty));
  if (!rooms.length) return n.home;
  const room = rooms[Math.floor(r() * rooms.length)];
  const tile = room.tiles[Math.floor(r() * room.tiles.length)];
  return { x: tile.x, y: tile.y };
}
function npcStep(w, n, x, y) {
  const st = nextStep(w, tileAt(w.map, n.x, n.y), tileAt(w.map, x, y)); if (!st) return false;
  n.x = st.x; n.y = st.y; return true;
}

function npcTurnHostile(w, n, p, why) {
  if (n.role !== 'inmate' || n.dead) return;
  n.hostile = p.id; n.hostLeft = 8;
  notify(w, p.id, n.name + ' turns on you. ' + (why || ''), 'bad');
  emitNoise(w, n.x, n.y, 3, { kind: 'npc' }, 'shouting', true);
}

function attackNpc(w, p, t, a, wp, sneak) {
  const n = w.npcs.find(n => n.id === a.id);
  if (!n || n.dead || n.ko > 0 || n.off || n.x !== p.x || n.y !== p.y) return fail('No target here.');
  p.loudRound = w.round; p.hidden = false;
  emitNoise(w, t.x, t.y, wp.id === 'pistol' ? CFG.NOISE.gun : CFG.NOISE.fight, { kind: 'player', id: p.id }, 'fighting', true);
  if (wp.id === 'pistol') takeItem(p, 'ammo');
  witness(w, p, 'danger', 'fighting');
  const lethal = wp.lethal > 0 && w.rng() < Math.min(0.9, wp.lethal * (sneak ? 1.4 : 1));
  if (lethal) { n.dead = true; n.off = true; npcDrop(w, p, n); npcWitness(w, p, 'attack', n); return okk('You kill ' + n.name + '. The body will be found.'); }
  n.hp -= sneak ? 3 : wp.dmg;
  if (n.hp <= 0) { n.ko = 8; n.hp = 2; npcDrop(w, p, n); return okk('You knock ' + n.name + ' out.'); }
  npcTurnHostile(w, n, p, 'You hit first.'); return okk('You hit ' + n.name + '. He hits back soon.');
}
function npcDrop(w, p, n) { const c = Math.min(3, rint(w.rng, 0, 3)); if (c) addItem(p, 'cigs', c); for (const k of Object.keys(n.stock)) if (w.rng() < 0.3) addItem(p, k, 1); }

// inmates who see violence: ask for money, betray, or keep quiet. Returns true when someone saw.
function npcWitness(w, p, what, victim) {
  let saw = false;
  for (const n of w.npcs) {
    if (n.role !== 'inmate' || n.dead || n.ko > 0 || n.off || n === victim || n.hostile === p.id) continue;
    if (sightDist(w, { x: n.x, y: n.y, __npc: true }, ptile(w, p)) > 3 && !(n.x === p.x && n.y === p.y)) continue;
    saw = true; const roll = w.rng();
    if (roll < 0.4 && !p.pending) { p.pending = { type: 'extort', nid: n.id, amount: rint(w.rng, 2, 4) }; notify(w, p.id, n.name + ' saw what you did and wants a payoff.', 'warn'); }
    else if (roll < 0.65) npcBetray(w, n, p);
  }
  return saw;
}
function npcBetray(w, n, p) {
  const gs = w.guards.filter(g => g.ko <= 0 && !g.dead && !g.off).sort((a, b) => pathDist(w, unitTile(w, a), tileAt(w.map, n.x, n.y), 30) - pathDist(w, unitTile(w, b), tileAt(w.map, n.x, n.y), 30));
  if (!gs.length) return;
  markSuspect(w, gs[0], p, 'danger', n.name + ' ratted on you');
  notify(w, p.id, n.name + ' told the guards it was you!', 'bad');
}

function npcPhase(w) {
  const t = timeOf(w), night = t.phase === 'night';
  for (const n of w.npcs) {
    if (n.dead) continue;
    if (n.ko > 0) { n.ko--; continue; }
    if (n.role !== 'inmate') { n.off = night; continue; }
    n.off = false;
    if (n.hostile != null) {
      const p = w.players[n.hostile];
      if (!p || p.status !== 'free' || --n.hostLeft <= 0) { n.hostile = null; continue; }
      for (let i = 0; i < 2 && !(n.x === p.x && n.y === p.y); i++) npcStep(w, n, p.x, p.y);
      if (n.x === p.x && n.y === p.y) {
        p.hp -= 1; p.hidden = false; emitNoise(w, n.x, n.y, CFG.NOISE.fight, { kind: 'npc' }, 'fighting', true);
        notify(w, p.id, n.name + ' hits you. (' + Math.max(p.hp, 0) + ' HP)', 'bad');
        if (p.hp <= 0) { p.hp = 2; p.ko = 3; const c = Math.ceil((p.items.cigs || 0) / 2); if (c) takeItem(p, 'cigs', c); n.hostile = null; notify(w, p.id, n.name + ' beats you senseless and takes ' + c + ' cigarettes.', 'bad'); }
      }
      continue;
    }
    const c = w.contracts.find(c => c.nid === n.id && !c.ended && c.slot === t.slot);
    if (c) {
      const room = w.map.rooms[c.rid], dest = room.tiles[0];
      if (!c.started) {
        if (n.x === dest.x && n.y === dest.y || (t.len - t.left >= 3)) { c.started = true; startBrawl(w, n.x, n.y, c.rid); notify(w, c.by, n.name + ' starts the brawl you paid for in the ' + room.name + '.', 'good'); }
        else { npcStep(w, n, dest.x, dest.y); npcStep(w, n, dest.x, dest.y); }
      } else if (!w.brawls.some(b => b.rid === c.rid && b.left > 0)) c.ended = true;
      continue;
    }
    if (night) { n.x = n.home.x; n.y = n.home.y; continue; } // at night every inmate sleeps in his cell
    const goal = npcTarget(w, n);
    for (let i = 0; i < 2 && !(n.x === goal.x && n.y === goal.y); i++) npcStep(w, n, goal.x, goal.y);
  }
  for (const c of w.contracts) if (c.slot !== t.slot && c.started) c.ended = true;
}
