// ===== engine1.js (v2) : world, time, light, vision, hiding, noise, suspicion =====
const tkey = t => t.x + ',' + t.y;
const ptile = (w, p) => tileAt(w.map, p.x, p.y);
const unitTile = (w, u) => tileAt(w.map, u.x, u.y);

function newWorld(opts) {
  const seed = opts.seed >>> 0, rng = mulberry32(seed), n = opts.players, diff = DIFFS[opts.diff] ? opts.diff : 'medium';
  const map = generateMap(rng, n);
  const w = {
    seed, rng, map, diff, nGuards: DIFFS[diff].guards, nGuardsNight: DIFFS[diff].night, mode: opts.mode || 'coop', round: 1, cur: 0, phase: 'players', over: false, result: null, paused: null,
    players: [], guards: [], npcs: [], log: [], notes: [], anim: [], fx: [], alert: 0, alertPos: null, alertTimer: 0, powerOff: 0, camsOff: 0,
    controllers: { guards: 'ai' }, nextId: 1, shared: opts.shared !== false && (opts.mode || 'coop') === 'coop', routes: {}, brawls: [], contracts: [], nightWarned: -1,
  };
  for (let i = 0; i < n; i++) {
    const c = map.cells[i];
    w.players.push({ id: i, name: (opts.names && opts.names[i]) || ('Player ' + (i + 1)), color: PLAYER_COLORS[i],
      x: c.x, y: c.y, hp: CFG.HP_PRISONER, ap: CFG.AP, items: { cigs: 3 }, strikes: 0, hidden: false, status: 'free', solitary: 0, ko: 0, skip: 0,
      wearing: false, asleep: false, wanted: false, memory: new Set(), intel: { cams: false, corrupt: false, seeUntil: 0 }, routeIntel: new Set(), alarmOff: new Set(),
      workCd: {}, shop: null, pending: null, meth: null, loudRound: 0, spotted: [], heard: [], stats: { moves: 0, loots: 0 }, tickRound: 0, blocked: false });
  }
  spawnGuards(w); spawnNpcs(w);
  if (diff === 'easy') for (const p of w.players) for (const t of map.grid) if (t) p.memory.add(tkey(t)); // easy: the whole layout is known from the start
  w.players.forEach(p => updateMemory(w, p));
  addLog(w, 'Monday morning. The yard is quiet. Plan your way out.', null, null, 'info');
  return w;
}

function spawnGuards(w) {
  const { map, rng } = w; const names = shuffle(rng, GUARD_NAMES.slice());
  const gate = map.gate; const front = neighbors(map, gate).concat(DIRS.map(([dx, dy]) => tileAt(map, gate.x + dx, gate.y + dy)).filter(t => t && kindOf(t) === 'yard'))[0];
  const gr = map.rooms.find(r => r.type === 'guardroom');
  const open = map.grid.filter(t => t && (t.type === 'corridor' || t.type === 'yard'));
  for (let i = 0; i < w.nGuards; i++) {
    const t = i === 0 ? front : i === 1 ? gr.tiles[0] : pick(rng, open);
    w.guards.push({ id: w.nextId++, name: names[i], x: t.x, y: t.y, hp: CFG.HP_GUARD, ap: CFG.AP, state: i < 2 ? 'post' : 'patrol', post: i < 2, home: { x: t.x, y: t.y },
      idx: i, routeI: 0, routeKey: '', dest: null, target: null, ko: 0, dead: false, found: false, off: false, sus: {}, blind: {}, corrupt: rng() < 0.65, price: rint(rng, 3, 7),
      carry: { baton: 1, cigs: rint(rng, 1, 3), keycard: rng() < 0.3 ? 1 : 0 }, wait: 0, lastSeen: null, searchLeft: 0, roam: false, huntLeft: 0, px: t.x, py: t.y });
  }
}

function addLog(w, text, x, y, kind, pid) {
  w.log.push({ round: w.round, text, x, y, kind: kind || 'info', pid: pid == null ? null : pid, id: w.log.length });
  if (w.log.length > 500) w.log.splice(0, 100);
}
function notify(w, pid, text, kind) { // popups for the player: pid null = everyone
  w.notes.push({ id: w.notes.length, round: w.round, pid: pid == null ? null : pid, text, kind: kind || 'info' });
  addLog(w, text, null, null, kind === 'bad' ? 'alert' : 'info', pid);
}

// ----- time -----
function timeOf(w) {
  const total = CFG.PHASES.reduce((a, p) => a + p.len, 0), r = w.round - 1, day = Math.floor(r / total); let rem = r % total;
  for (let i = 0; i < CFG.PHASES.length; i++) { const p = CFG.PHASES[i]; if (rem < p.len) return { day, wd: CFG.DAYS[day % 7], wi: day % 7, phase: p.id, name: p.name, left: p.len - rem, len: p.len, lights: p.lights, pi: i, slot: (day % 7) + '-' + p.id }; rem -= p.len; }
}
const phaseOf = w => timeOf(w);
const isNight = w => timeOf(w).phase === 'night';
const slotLabel = slot => { const [d, ph] = slot.split('-'); return CFG.DAYS[+d] + ' ' + CFG.PHASES.find(p => p.id === ph).name.replace('Lights out', 'Night'); };
function nextSlot(w, phaseId) { // slot key of the next time `phaseId` begins (or is under way)
  const t = timeOf(w); const pi = CFG.PHASES.findIndex(p => p.id === phaseId);
  if (pi >= t.pi) return t.wi + '-' + phaseId; return ((t.wi + 1) % 7) + '-' + phaseId;
}

// ----- light -----
function tileLit(w, t) {
  if (w.powerOff > 0) return false;
  const r = ROOMS[t.type];
  if (['guardroom', 'control', 'door', 'gate', 'warden', 'armory'].includes(t.type)) return true;
  if (!r.lit) return false;
  if (!isNight(w)) return true;
  if (t.type === 'corridor') return t.nightLamp;
  if (r.outdoor) return t.flood || t.camera;
  return false;
}
const darkRange = (w, p) => (p && p.items.flashlight) ? 3 : CFG.VISION_DARK;

// ----- distances and vision (BFS on the tile graph; walls follow the links, locked rooms block sight) -----
function reach(w, from, maxD, blockLocked) {
  const dist = new Map([[tkey(from), 0]]); const q = [from];
  while (q.length) {
    const c = q.shift(), d = dist.get(tkey(c)); if (d >= maxD) continue;
    for (const n of neighbors(w.map, c)) {
      const k = tkey(n); if (dist.has(k)) continue; dist.set(k, d + 1);
      if (blockLocked && n.room && n.room.locked && n.room !== c.room) continue;
      q.push(n);
    }
  }
  return dist;
}
function pathDist(w, a, b, maxD) { const d = reach(w, a, maxD, false).get(tkey(b)); return d === undefined ? Infinity : d; }
// true line of sight: the straight line between tile centres may not cross a wall (every step must be linked)
function clearLine(w, a, b) {
  if (a === b) return true;
  const dx = b.x - a.x, dy = b.y - a.y, N = Math.max(Math.abs(dx), Math.abs(dy)) * 6, seq = [a];
  for (let i = 1; i <= N; i++) {
    const x = Math.floor(a.x + 0.5 + dx * i / N + 1e-6 * Math.sign(dx)), y = Math.floor(a.y + 0.5 + dy * i / N + 1e-6 * Math.sign(dy));
    const t = tileAt(w.map, x, y); if (!t) return false; if (t !== seq[seq.length - 1]) seq.push(t);
  }
  for (let i = 1; i < seq.length; i++) {
    const p = seq[i - 1], q = seq[i], sx = q.x - p.x, sy = q.y - p.y;
    if (q.room && q.room.locked && q.room !== a.room && q !== b) return false;
    if (sx && sy) { // diagonal step: both corner routes must be open
      const c1 = tileAt(w.map, p.x + sx, p.y), c2 = tileAt(w.map, p.x, p.y + sy);
      if (!(c1 && c2 && linked(w.map, p, c1) && linked(w.map, c1, q) && linked(w.map, p, c2) && linked(w.map, c2, q))) return false;
    } else if (!linked(w.map, p, q)) return false;
  }
  return true;
}
function visibleSet(w, p) {
  const src = ptile(w, p), set = new Set();
  for (const [k, d] of reach(w, src, CFG.VISION_LIT, true)) {
    const [x, y] = k.split(',').map(Number), t = tileAt(w.map, x, y);
    if (d <= (tileLit(w, t) ? CFG.VISION_LIT : darkRange(w, p)) && clearLine(w, src, t)) set.add(k);
  }
  for (const k of [...set]) { const [x, y] = k.split(',').map(Number); const t = tileAt(w.map, x, y); if (kindOf(t) === 'yard') for (const e of exitsNear(w.map, t)) set.add(tkey(e)); }
  return set;
}
function updateMemory(w, p) { if (p.status === 'free' || p.status === 'solitary') for (const k of visibleSet(w, p)) p.memory.add(k); }
function teamVisible(w, p) {
  const s = visibleSet(w, p);
  if (w.shared) for (const q of w.players) if (q.id !== p.id && (q.status === 'free' || q.status === 'solitary')) for (const k of visibleSet(w, q)) s.add(k);
  return s;
}
// path distance from guard to the prisoner if the prisoner is inside the guard's sight range, else Infinity
function sightDist(w, g, tile) {
  const d = reach(w, unitTile(w, g), CFG.VISION_LIT, true).get(tkey(tile));
  if (d === undefined || !clearLine(w, unitTile(w, g), tile)) return Infinity;
  return d <= (tileLit(w, tile) ? CFG.VISION_LIT : CFG.VISION_DARK) ? d : Infinity;
}
// hiding: open ground is checked within 2 tiles by day and only on the same tile at night; rooms and mid terrain only on the same tile
function hideFind(w, p, d) {
  const cov = coverOf(ptile(w, p));
  if (cov === 'open') return isNight(w) ? (d === 0 && w.rng() < 0.4) : (d <= 2 && w.rng() < 0.65);
  return d === 0 && w.rng() < (cov === 'mid' ? 0.2 : 0.1);
}
function guardSees(w, g, p, plain) {
  if (g.ko > 0 || g.dead || g.off || p.status !== 'free') return false;
  const d = sightDist(w, g, ptile(w, p)); if (d === Infinity) return false;
  if (!p.hidden) return true;
  return plain ? false : hideFind(w, p, d);
}
const guardAtTile = (w, g) => unitTile(w, g);

// ----- zones and suspicion -----
const cellOf = (w, p) => w.map.cells[p.id].room;
const inOwnCell = (w, p) => ptile(w, p).room === cellOf(w, p);
function restricted(w, p, t) {
  if (p.status === 'solitary') return false;
  if (isNight(w)) return !(t.room && t.room.type === 'cell' && t.room.owner === p.id);
  return !ROOMS[t.type].allowed;
}
function trespassLevel(w, p) { // what a guard who sees p right now concludes
  if (p.status !== 'free' || p.asleep) return null;
  const t = ptile(w, p);
  if (isNight(w)) return inOwnCell(w, p) ? null : 'danger';
  return restricted(w, p, t) ? 'sus' : null;
}
function raiseAlert(w, amount, x, y, text) {
  w.alert = Math.min(3, w.alert + amount); w.alertTimer = 0; if (x != null) w.alertPos = { x, y };
  if (text) addLog(w, text, x, y, 'alert');
}
// a guard forms an opinion of prisoner p. 'sus' = yellow ?, 'danger' = red !
function markSuspect(w, g, p, level, kind) {
  if (/attack|fight|gate|ratted/i.test(kind || '')) p.violentRound = w.round; // serious offences are never waived on easy
  if (g.ko > 0 || g.dead || g.off || p.status !== 'free') return false;
  const bl = g.blind[p.id];
  if (level === 'sus' && bl && bl.until >= w.round && bl.charges > 0) { bl.charges--; notify(w, p.id, g.name + ' turns a blind eye, as agreed.', 'good'); return false; }
  let s = g.sus[p.id]; const fresh = !s;
  if (!s) s = g.sus[p.id] = { level: 'sus', obs: 0, kind };
  if (level === 'danger') s.level = 'danger';
  s.last = { x: p.x, y: p.y }; s.kind = kind; s.seen = w.round; g.lastSeen = { x: p.x, y: p.y };
  if (s.level === 'danger') {
    if (g.state !== 'hunt' || g.target !== p.id) { notify(w, p.id, g.name + ' saw you (' + kind + '). He is hunting you!', 'bad'); raiseAlert(w, 1, p.x, p.y); }
    g.state = 'hunt'; g.target = p.id; g.huntLeft = 8; g.roam = true;
  } else if (g.state !== 'hunt' && g.state !== 'brawl') {
    if (fresh || g.state !== 'sus') notify(w, p.id, g.name + ' noticed you (' + kind + ') and is coming over.', 'warn');
    g.state = 'sus'; g.target = p.id;
  }
  return true;
}
// everything the guards currently see p doing
function witness(w, p, level, kind) {
  const seen = [];
  for (const g of w.guards) if (guardSees(w, g, p)) { if (markSuspect(w, g, p, level, kind)) seen.push(g); else seen.push(g); }
  return seen;
}
// position based: a guard sees p standing somewhere they should not be
function scanNotice(w, p) {
  const lvl = trespassLevel(w, p); if (!lvl) return;
  for (const g of w.guards) {
    if (!guardSees(w, g, p)) continue;
    if (p.wearing) { const d = sightDist(w, g, ptile(w, p)); if (!(d <= 1 && w.rng() < 0.35)) continue; }
    markSuspect(w, g, p, lvl, lvl === 'danger' ? 'out of cell after lights out' : 'trespass');
  }
}
function cameraSees(w, p) {
  if (w.powerOff > 0 || w.camsOff > 0 || p.hidden) return null;
  const pt = ptile(w, p); if (!tileLit(w, pt)) return null;
  for (const c of w.map.cams) if (pathDist(w, c, pt, CFG.CAMERA_RANGE) <= CFG.CAMERA_RANGE) return c;
  return null;
}

// ----- noise: guards only react to suspicious noise, so daytime footsteps in allowed rooms are ignored -----
function emitNoise(w, x, y, radius, source, label, suspicious) {
  if (radius <= 0) return;
  const src = tileAt(w.map, x, y), dist = reach(w, src, radius, false);
  w.fx.push({ x, y, r: radius, label: label || 'noise', round: w.round, id: w.fx.length });
  if (w.fx.length > 80) w.fx.splice(0, 40);
  if (suspicious && !(source && source.kind === 'guard')) for (const g of w.guards) {
    if (g.ko > 0 || g.dead || g.off || !['patrol', 'post', 'investigate', 'search'].includes(g.state)) continue;
    const d = dist.get(g.x + ',' + g.y); if (d === undefined || d > radius) continue;
    g.dest = { x, y }; g.state = 'investigate'; g.wait = 0;
  }
  for (const p of w.players) {
    if (p.status !== 'free' || (source && source.kind === 'player' && source.id === p.id)) continue;
    const d = dist.get(p.x + ',' + p.y);
    if (d !== undefined && d <= Math.min(radius, CFG.HEAR + (radius > 4 ? 3 : 0))) p.heard.push({ x, y, round: w.round, label: label || 'noise' });
  }
}
// is this noise worth a guard's attention?
function noiseSus(w, p, loud) { return !!loud || restricted(w, p, ptile(w, p)); }
