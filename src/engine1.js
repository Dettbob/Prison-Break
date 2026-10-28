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
// ===== true geometric vision =====
// Walls are line segments on the tile edges. A viewer sees a point only if the straight line from his eye (tile centre)
// to that point crosses no wall. Locked doors count as walls (you still see the locked door tile itself).
function wallSegs(w) {
  const m = w.map, sig = m.rooms.map(r => (r.locked ? 1 : 0)).join('');
  if (m._segSig === sig && m._segs) return m._segs;
  const segs = [];
  for (const t of m.grid) {
    if (!t || kindOf(t) === 'exit') continue;
    for (const [dx, dy] of DIRS) {
      const n = tileAt(m, t.x + dx, t.y + dy);
      if (n && kindOf(n) === 'exit') continue;
      if (n && (dx < 0 || dy < 0)) continue; // shared edges are added once, from the +x / +y side
      let a, b;
      if (dx === 1) { a = [t.x + 1, t.y]; b = [t.x + 1, t.y + 1]; } else if (dy === 1) { a = [t.x, t.y + 1]; b = [t.x + 1, t.y + 1]; } else if (dx === -1) { a = [t.x, t.y]; b = [t.x, t.y + 1]; } else { a = [t.x, t.y]; b = [t.x + 1, t.y]; }
      if (!n || !linked(m, t, n)) { segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], hard: true }); continue; }
      const lt = t.room && t.room.locked && t.room !== n.room ? t : (n.room && n.room.locked && n.room !== t.room ? n : null);
      if (lt) segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], hard: false, rt: lt, room: lt.room });
    }
  }
  m._segSig = sig; m._segs = segs; return segs;
}
function segHit(ox, oy, ex, ey, s) { // distance fraction along o->e where it meets the segment, or Infinity
  const rx = ex - ox, ry = ey - oy, sx = s.x2 - s.x1, sy = s.y2 - s.y1, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return Infinity; // parallel
  const qx = s.x1 - ox, qy = s.y1 - oy, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den, eps = 1e-9;
  return (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) ? t : Infinity;
}
// can a viewer standing on tile `from` see the middle of tile `to`?
function lineClear(w, from, to) {
  if (from === to) return true;
  const ox = from.x + 0.5, oy = from.y + 0.5, ex = to.x + 0.5, ey = to.y + 0.5;
  const minx = Math.min(ox, ex) - 1e-6, maxx = Math.max(ox, ex) + 1e-6, miny = Math.min(oy, ey) - 1e-6, maxy = Math.max(oy, ey) + 1e-6;
  for (const s of wallSegs(w)) {
    if (Math.max(s.x1, s.x2) < minx || Math.min(s.x1, s.x2) > maxx || Math.max(s.y1, s.y2) < miny || Math.min(s.y1, s.y2) > maxy) continue;
    if (!s.hard && (s.rt === to || (from.room && from.room === s.room))) continue;
    if (segHit(ox, oy, ex, ey, s) !== Infinity) return false;
  }
  return true;
}
const LIT_R = () => CFG.VISION_LIT + 0.4, DARK_R = r => r + 0.45;
function seeRange(w, tile, darkR) { return tileLit(w, tile) ? LIT_R() : DARK_R(darkR); }
// polygon of everything visible from a tile within radius R (tile coordinates), by casting rays at every wall corner
function visionPoly(w, from, R) {
  const ox = from.x + 0.5, oy = from.y + 0.5;
  const segs = wallSegs(w).filter(s => !(!s.hard && from.room && from.room === s.room) && Math.abs((s.x1 + s.x2) / 2 - ox) <= R + 1 && Math.abs((s.y1 + s.y2) / 2 - oy) <= R + 1);
  const angs = [];
  for (const s of segs) for (const [px, py] of [[s.x1, s.y1], [s.x2, s.y2]]) { const a = Math.atan2(py - oy, px - ox); angs.push(a - 1e-4, a, a + 1e-4); }
  for (let i = 0; i < 72; i++) angs.push(-Math.PI + i * Math.PI / 36);
  angs.sort((a, b) => a - b);
  const pts = [];
  for (const a of angs) {
    const dx = Math.cos(a), dy = Math.sin(a); let best = R;
    for (const s of segs) { const t = segHit(ox, oy, ox + dx * R, oy + dy * R, s); if (t !== Infinity && t * R < best) best = t * R; }
    pts.push([ox + dx * best, oy + dy * best]);
  }
  return pts;
}

function visibleSet(w, p) {
  const src = ptile(w, p), set = new Set(), dr = darkRange(w, p), maxR = Math.ceil(LIT_R());
  for (let y = src.y - maxR; y <= src.y + maxR; y++) for (let x = src.x - maxR; x <= src.x + maxR; x++) {
    const t = tileAt(w.map, x, y); if (!t || kindOf(t) === 'exit') continue;
    if (Math.hypot(x - src.x, y - src.y) <= seeRange(w, t, dr) && lineClear(w, src, t)) set.add(tkey(t));
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
// manhattan distance from guard to the tile if the guard can really see it (clear line, in range), else Infinity
function sightDist(w, g, tile) {
  const gt = unitTile(w, g); if (!gt || !tile) return Infinity;
  if (gt === tile) return 0;
  if (Math.hypot(tile.x - gt.x, tile.y - gt.y) > seeRange(w, tile, CFG.VISION_DARK) || !lineClear(w, gt, tile)) return Infinity;
  return Math.abs(tile.x - gt.x) + Math.abs(tile.y - gt.y);
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
