// ===== engine3.js (v2) : guard actions and AI =====
// Guards act only through guardAct(w, guard, action) so a human "prison" player can drive them later.
// States: patrol, post, investigate (heard noise), sus (yellow ?), hunt (red !), search, brawl, ko, dead.
function guardAct(w, g, a) {
  if (g.ko > 0 || g.dead || g.off) return fail('Guard is down.');
  if (g.ap <= 0) return fail('No AP.');
  if (a.t === 'move') {
    const t = unitTile(w, g), n = tileAt(w.map, a.x, a.y);
    if (!n || !neighbors(w.map, t).includes(n)) return fail('Blocked.');
    g.px = g.x; g.py = g.y; g.x = n.x; g.y = n.y; g.ap--; anim(w, 'g', g.id, n.x, n.y);
    emitNoise(w, n.x, n.y, CFG.HEAR, { kind: 'guard', id: g.id }, 'footsteps', false);
    return okk(null);
  }
  if (a.t === 'arrest') {
    const p = w.players.find(p => p.status === 'free' && p.x === g.x && p.y === g.y && (!p.hidden || g.target === p.id));
    if (!p) return fail('Nobody to arrest.');
    g.ap--; arrestPlayer(w, g, p, g.name + ' caught you'); return okk(null);
  }
  if (a.t === 'search') {
    g.ap--; const gt = unitTile(w, g);
    for (const p of w.players) if (p.hidden && p.status === 'free' && pathDist(w, gt, ptile(w, p), 1) <= (coverOf(ptile(w, p)) === 'open' ? 1 : 0) && w.rng() < 0.6) {
      p.hidden = false; notify(w, p.id, g.name + ' flushes you out of hiding!', 'bad'); markSuspect(w, g, p, trespassLevel(w, p) || 'sus', 'found hiding');
    }
    return okk(null);
  }
  if (a.t === 'wait') { g.ap = 0; return okk(null); }
  return fail('Unknown guard action.');
}
function nextStep(w, from, to) { // BFS ignoring locks (guards carry keys)
  if (from === to) return null;
  const prev = new Map([[tkey(from), null]]); const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const n of neighbors(w.map, c)) {
      const k = tkey(n); if (prev.has(k)) continue; prev.set(k, c);
      if (n === to) { let cur = n; while (prev.get(tkey(cur)) !== from) cur = prev.get(tkey(cur)); return cur; }
      q.push(n);
    }
  }
  return null;
}
const stepToward = (w, g, x, y) => { const st = nextStep(w, unitTile(w, g), tileAt(w.map, x, y)); if (!st) return false; return guardAct(w, g, { t: 'move', x: st.x, y: st.y }).ok; };
const at = (g, d) => d && g.x === d.x && g.y === d.y;

// weekly patrol routes: identical every Monday morning, every Tuesday night, etc.
function routeFor(w, g) {
  const t = timeOf(w), key = t.slot + '-' + g.id;
  if (!w.routes[key]) {
    const r = mulberry32((w.seed ^ (t.wi * 7919) ^ (t.pi * 104729) ^ (g.id * 1299709)) >>> 0);
    if (g.post) w.routes[key] = [g.home];
    else {
      const cells = w.map.rooms.filter(rm => rm.type === 'cell').flatMap(rm => rm.tiles);
      const nearCells = shuffle(r, w.map.grid.filter(x => x && x.type === 'corridor' && cells.some(c => Math.abs(c.x - x.x) + Math.abs(c.y - x.y) === 1)));
      const open = w.map.grid.filter(x => x && (x.type === 'corridor' || x.type === 'yard' || x.type === 'court' || x.type === 'door'));
      const rooms = w.map.grid.filter(x => x && x.room && !['cell', 'solitary', 'court'].includes(x.type));
      const pts = []; const night = t.phase === 'night';
      for (let i = 0; i < 5; i++) { const roll = r(); const pool = (night && nearCells.length && roll < 0.55) ? nearCells : (roll < 0.75 ? open : rooms); const x = pool[Math.floor(r() * pool.length)]; pts.push({ x: x.x, y: x.y }); }
      w.routes[key] = pts;
    }
  }
  return w.routes[key];
}
function guardRouteTiles(w, g, slot) { // for the route overlay (UI) in any slot
  const [wi, ph] = slot.split('-'); const saveRound = w.round; const pi = CFG.PHASES.findIndex(p => p.id === ph);
  w.round = 1 + (+wi) * 36 + CFG.PHASES.slice(0, pi).reduce((a, p) => a + p.len, 0); const r = routeFor(w, g); w.round = saveRound; return r;
}

function runGuardPhase(w) { w.phase = 'guards'; w.gStage = null; w.paused = null; continueGuards(w); }
function continueGuards(w) {
  if (w.controllers.guards !== 'ai') return;
  if (aiGuardPhase(w) === 'paused') return;
  finishRound(w);
}
function aiGuardPhase(w) {
  if (!w.gStage) {
    w.gStage = 'guards'; w.gi = 0;
    for (const p of w.players) { if (p.status !== 'free' || p.hidden || p.asleep) continue; const lvl = trespassLevel(w, p); if (!lvl) continue; const cam = cameraSees(w, p); if (!cam) continue;
      const pt = ptile(w, p); const free = w.guards.filter(g => g.ko <= 0 && !g.dead && !g.off && g.state !== 'hunt');
      if (!free.length) continue;
      free.sort((a, b) => pathDist(w, unitTile(w, a), pt, 40) - pathDist(w, unitTile(w, b), pt, 40));
      p.camSeen = w.round; notify(w, p.id, 'A camera spotted you in the ' + pt.name + '.', 'bad');
      if (lvl === 'danger') markSuspect(w, free[0], p, 'danger', 'camera'); else { free[0].state = 'investigate'; free[0].dest = { x: p.x, y: p.y }; free[0].wait = 0; }
      raiseAlert(w, 1, p.x, p.y);
    }
    for (const g of w.guards) { g.ap = w.alert >= 3 ? 3 : CFG.AP; g.px = g.x; g.py = g.y; }
  }
  while (w.gi < w.guards.length) {
    const g = w.guards[w.gi];
    if (!g.dead && !g.off && g.ko <= 0) { if (aiGuardTurn(w, g) === 'paused') return 'paused'; }
    w.gi++;
  }
  npcPhase(w); tickBrawls(w); w.gStage = null; return 'done';
}

function aiGuardTurn(w, g) {
  let safety = 16;
  if (!g.looked) { g.looked = true; for (const p of w.players) scanOne(w, g, p); }
  while (g.ap > 0 && g.ko <= 0 && !g.dead && safety-- > 0) {
    observe(w, g);
    let r;
    switch (g.state) {
      case 'hunt': r = huntStep(w, g); break;
      case 'sus': r = susStep(w, g); break;
      case 'investigate': r = investigateStep(w, g); break;
      case 'search': r = searchStep(w, g); break;
      case 'brawl': r = brawlStep(w, g); break;
      default: r = patrolStep(w, g);
    }
    if (r === 'paused') return 'paused';
  }
  g.looked = false;
}
// one guard looks at one prisoner: trespassing, staying put in a restricted area
function scanOne(w, g, p) {
  const lvl = trespassLevel(w, p); if (!lvl || !guardSees(w, g, p)) return;
  if (p.wearing && !(sightDist(w, g, ptile(w, p)) <= 1 && w.rng() < 0.35)) return;
  const s = g.sus[p.id];
  if (lvl === 'sus' && s && s.level === 'sus' && s.kind === 'trespass') { s.obs++; if (s.obs >= 2) { markSuspect(w, g, p, 'danger', 'lingering in a restricted area'); return; } }
  markSuspect(w, g, p, lvl, lvl === 'danger' ? 'out of cell after lights out' : 'trespass');
}
function observe(w, g) {
  // bodies
  for (const o of w.guards) if ((o.ko > 0 || o.dead) && !o.found && o !== g && !o.off && sightDist(w, g, unitTile(w, o)) !== Infinity) {
    o.found = true;
    if (o.dead) { raiseAlert(w, 2, o.x, o.y, g.name + ' finds ' + o.name + "'s body. Lockdown!"); notify(w, null, 'A guard has been found dead. The prison is on high alert.', 'bad'); }
    else { raiseAlert(w, 1, o.x, o.y, g.name + ' finds ' + o.name + ' unconscious.'); notify(w, null, 'A guard was found knocked out.', 'warn'); }
    for (const h of w.guards) if (!h.dead && !h.off && h.ko <= 0 && ['patrol', 'post', 'investigate', 'search'].includes(h.state)) { h.state = 'search'; h.lastSeen = { x: o.x, y: o.y }; h.roam = true; h.searchLeft = 5; }
  }
  // night bed checks: an empty bed without a dummy means an escaped prisoner
  if (isNight(w)) for (const p of w.players) {
    if (p.status !== 'free' || p.wanted) continue;
    const room = cellOf(w, p), tile = room.tiles[0], d = sightDist(w, g, tile); if (d > 1) continue;
    const inside = p.x === tile.x && p.y === tile.y;
    if (!inside && (!room.dummy || (d === 0 && w.rng() < 0.15))) {
      p.wanted = true; raiseAlert(w, 2, tile.x, tile.y, g.name + ' finds an empty bed in ' + p.name + "'s cell!");
      notify(w, p.id, g.name + ' found your bed empty at lights out. Every guard is looking for you.', 'bad');
      for (const h of w.guards) if (!h.dead && !h.off && h.ko <= 0 && ['patrol', 'post', 'investigate', 'search'].includes(h.state)) { h.state = 'search'; h.lastSeen = { x: tile.x, y: tile.y }; h.roam = true; h.searchLeft = 6; }
    }
  }
}
function susStep(w, g) {
  const p = w.players[g.target], s = p && g.sus[p.id];
  if (!p || p.status !== 'free' || !s) { g.state = g.post ? 'post' : 'patrol'; g.target = null; return; }
  if (guardSees(w, g, p)) {
    s.last = { x: p.x, y: p.y }; g.lastSeen = s.last; const d = sightDist(w, g, ptile(w, p));
    if (d <= 1 && !p.pending) {
      p.pending = { type: 'confront', gid: g.id, kind: s.kind }; w.paused = { gid: g.id, pid: p.id };
      notify(w, p.id, g.name + ' stops you (' + s.kind + '). React!', 'bad'); return 'paused';
    }
    if (!stepToward(w, g, p.x, p.y)) g.ap = 0; return;
  }
  if (at(g, s.last)) { g.state = 'search'; g.lastSeen = s.last; g.roam = false; g.searchLeft = 2; delete g.sus[p.id]; g.target = null; return; }
  if (!stepToward(w, g, s.last.x, s.last.y)) { g.state = 'patrol'; g.ap = 0; }
}
function huntStep(w, g) {
  const p = w.players[g.target];
  if (!p || p.status !== 'free') { g.state = g.post ? 'post' : 'patrol'; g.target = null; return; }
  if (p.x === g.x && p.y === g.y && (!p.hidden || guardSees(w, g, p))) { guardAct(w, g, { t: 'arrest' }); g.ap = 0; return; }
  if (guardSees(w, g, p)) { g.lastSeen = { x: p.x, y: p.y }; if (g.sus[p.id]) g.sus[p.id].last = g.lastSeen; }
  const L = g.lastSeen;
  if (L && !at(g, L)) { if (!stepToward(w, g, L.x, L.y)) g.ap = 0; return; }
  g.state = 'search'; g.roam = true; g.searchLeft = 6; // lost sight of a dangerous prisoner: keep looking nearby
}
function investigateStep(w, g) {
  if (!g.dest) { g.state = 'patrol'; return; }
  if (at(g, g.dest)) { guardAct(w, g, { t: 'search' }); g.state = 'patrol'; g.dest = null; g.wait = 1; g.ap = 0; return; }
  if (!stepToward(w, g, g.dest.x, g.dest.y)) { g.state = 'patrol'; g.dest = null; g.ap = 0; }
}
function searchStep(w, g) {
  const L = g.lastSeen; if (!L) { g.state = 'patrol'; return; }
  if (!at(g, L)) { if (!stepToward(w, g, L.x, L.y)) { g.state = 'patrol'; g.ap = 0; } return; }
  guardAct(w, g, { t: 'search' }); g.searchLeft--;
  if (g.searchLeft <= 0) { g.state = g.post ? 'post' : 'patrol'; g.dest = null; g.ap = 0; return; }
  if (g.roam) { const near = w.map.grid.filter(t => t && t.type !== 'exit' && kindOf(t) !== 'exit' && Math.abs(t.x - L.x) + Math.abs(t.y - L.y) <= 4 && t.type !== 'solitary'); const t = pick(w.rng, near); g.lastSeen = { x: t.x, y: t.y }; }
  g.ap = 0;
}
function brawlStep(w, g) {
  const b = w.brawls.find(b => b.left > 0);
  if (!b) { g.state = 'search'; g.roam = false; g.searchLeft = 2; return; }
  if (g.x === b.x && g.y === b.y) { g.ap = 0; return; }
  if (!stepToward(w, g, b.x, b.y)) g.ap = 0;
}
function patrolStep(w, g) {
  const t = timeOf(w);
  if (g.routeKey !== t.slot) { g.routeKey = t.slot; g.routeI = 0; }
  const route = routeFor(w, g), wp = route[g.routeI % route.length];
  if (g.post) { if (!at(g, g.home)) { if (stepToward(w, g, g.home.x, g.home.y)) return; } g.ap = 0; return; }
  if (at(g, wp)) { if (g.wait > 0) { g.wait--; g.ap = 0; return; } g.routeI++; g.wait = w.rng() < 0.4 ? 1 : 0; return; }
  if (!stepToward(w, g, wp.x, wp.y)) { g.routeI++; g.ap = 0; }
}
function tickBrawls(w) {
  for (const b of w.brawls) if (b.left > 0) { b.left--; emitNoise(w, b.x, b.y, 5, { kind: 'npc' }, 'brawl', true); if (b.left === 0) addLog(w, 'The brawl is broken up.', b.x, b.y, 'info'); }
  w.brawls = w.brawls.filter(b => b.left > 0 || w.round - b.round < 2);
}
function startBrawl(w, x, y, rid) {
  w.brawls.push({ x, y, left: 4, rid, round: w.round });
  addLog(w, 'A brawl breaks out!', x, y, 'alert'); emitNoise(w, x, y, 7, { kind: 'npc' }, 'brawl', true);
  for (const g of w.guards) if (!g.dead && !g.off && g.ko <= 0 && ['patrol', 'post', 'investigate', 'search'].includes(g.state) && pathDist(w, unitTile(w, g), tileAt(w.map, x, y), 9) <= 9) { g.state = 'brawl'; g.dest = null; }
}
