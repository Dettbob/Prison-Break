// ===== mapgen.js (v2) : seeded prison with multi-tile rooms, hallways, yard, court =====
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function shuffle(rng, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function mkTile(x, y, type) {
  return { x, y, type, name: ROOMS[type].name, room: null, camera: false, flood: false, nightLamp: false, spots: 0 };
}
function tileAt(map, x, y) { return (x < 0 || y < 0 || x >= map.W || y >= map.H) ? null : map.grid[y * map.W + x]; }
function kindOf(t) {
  if (t.type === 'fence' || t.type === 'gate') return 'exit';
  if (t.type === 'door') return 'door';
  if (t.type === 'corridor') return 'corr';
  if (t.type === 'yard' || t.type === 'court') return 'yard';
  return 'room';
}
// is there a passage between two adjacent tiles? Fence and gate are never walked on, they are exits.
function linked(map, a, b) {
  if (!a || !b) return false;
  const ka = kindOf(a), kb = kindOf(b);
  if (ka === 'exit' || kb === 'exit') return false;
  if (a.room && a.room === b.room) return true;
  const pair = (x, y) => (ka === x && kb === y) || (ka === y && kb === x);
  if (ka === 'corr' && kb === 'corr') return true;
  if (pair('corr', 'door') || pair('corr', 'room')) return true;
  if (ka === 'yard' && kb === 'yard') return true;
  if (pair('door', 'yard')) return true;
  if (ka === 'room' && kb === 'room') return ROOMS[a.type].link === b.type && ROOMS[b.type].link === a.type;
  return false;
}
function neighbors(map, t) {
  const res = [];
  for (const [dx, dy] of DIRS) { const n = tileAt(map, t.x + dx, t.y + dy); if (n && linked(map, t, n)) res.push(n); }
  return res;
}
function exitsNear(map, t) { // fence/gate tiles directly next to a yard tile
  const res = [];
  for (const [dx, dy] of DIRS) { const n = tileAt(map, t.x + dx, t.y + dy); if (n && kindOf(n) === 'exit') res.push(n); }
  return res;
}
function coverOf(t) { return ROOMS[t.type].cover; }

function generateMap(rng, nPlayers) {
  for (let attempt = 0; attempt < 300; attempt++) { const m = tryGenerate(rng, nPlayers); if (m) return m; }
  throw new Error('map generation failed');
}

function tryGenerate(rng, n) {
  const W = CFG.W, H = CFG.H, grid = new Array(W * H).fill(null);
  const map = { W, H, grid, rooms: [], cams: [] };
  const set = (x, y, type) => (grid[y * W + x] = mkTile(x, y, type));
  const bx0 = 2, bx1 = W - 3, by0 = 2, by1 = H - 5; // building area
  const inB = (x, y) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) set(x, y, 'fence');
    else if (!inB(x, y)) set(x, y, 'yard');
  }
  const mkRoom = (type, tiles) => {
    const d = ROOMS[type];
    const r = { id: map.rooms.length, type, name: d.name, tiles, locked: !!d.locked, alarm: !!d.alarm, owner: null, npcOwners: [],
      spots: d.spots ? rint(rng, d.spots[0], d.spots[1]) : 0, salv: d.salvage ? rint(rng, 2, 4) : 0, dummy: false, stash: {}, openUntil: 0 };
    tiles.forEach(t => (t.room = r)); map.rooms.push(r); return r;
  };
  // basketball court in the thick south yard
  const cx = rint(rng, 2, W - 6), ct = [];
  for (let y = by1 + 1; y <= by1 + 3; y++) for (let x = cx; x < cx + 4; x++) ct.push(set(x, y, 'court'));
  map.court = mkRoom('court', ct);
  for (const t of grid) if (t && t.type === 'yard') t.spots = rint(rng, 0, 1);
  // corridors: spine plus spokes
  const sr = rint(rng, by0 + 3, by1 - 3);
  for (let x = bx0 + 1; x <= bx1 - 1; x++) set(x, sr, 'corridor');
  set(bx0, sr, 'door'); set(bx1, sr, 'door');
  const cols = [], nSp = rint(rng, 3, 4); let tries = 0;
  while (cols.length < nSp && tries++ < 80) { const c = rint(rng, bx0 + 2, bx1 - 2); if (cols.every(o => Math.abs(o - c) >= 4)) cols.push(c); }
  if (cols.length < 3) return null;
  for (const c of cols) {
    let ya = by0, yb = by1;
    if (rng() < 0.35) { if (rng() < 0.5) ya += rint(rng, 1, 2); else yb -= rint(rng, 1, 2); }
    for (let y = ya; y <= yb; y++) if (y !== sr) set(c, y, ((y === by0 || y === by1) && rng() < 0.7) ? 'door' : 'corridor');
  }
  const isCorr = (x, y) => { const t = tileAt(map, x, y); return t && t.type === 'corridor'; };
  const free = (x, y) => inB(x, y) && !grid[y * W + x];
  const touchesCorr = cells => cells.some(([x, y]) => DIRS.some(([dx, dy]) => isCorr(x + dx, y + dy)));
  // cell block first so player cells sit together
  const front = []; for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (free(x, y) && touchesCorr([[x, y]])) front.push([x, y]);
  const nCells = n + 5 + 1; if (front.length < nCells + 6) return null;
  const seed = pick(rng, front);
  front.sort((a, b) => (Math.abs(a[0] - seed[0]) + Math.abs(a[1] - seed[1])) - (Math.abs(b[0] - seed[0]) + Math.abs(b[1] - seed[1])) + (rng() - 0.5));
  const cellSlots = front.slice(0, nCells);
  map.cells = [];
  cellSlots.forEach(([x, y], i) => {
    if (i < n) { const t = set(x, y, 'cell'); const r = mkRoom('cell', [t]); r.owner = i; map.cells.push(t); }
    else if (i < nCells - 1) { const t = set(x, y, 'cell'); mkRoom('cell', [t]); }
  });
  const sol = cellSlots[nCells - 1]; // solitary: the farthest slot of the cluster
  { const t = set(sol[0], sol[1], 'solitary'); mkRoom('solitary', [t]); map.solitary = t; }
  // bigger rooms next to a corridor
  const order = FIXED_ROOMS.slice().sort((a, b) => ROOMS[b].size[0] * ROOMS[b].size[1] - ROOMS[a].size[0] * ROOMS[a].size[1] + (rng() - 0.5));
  for (const type of order) {
    const [w0, h0] = ROOMS[type].size; const orients = w0 === h0 ? [[w0, h0]] : shuffle(rng, [[w0, h0], [h0, w0]]);
    let cands = [];
    for (const [rw, rh] of orients) for (let y = by0; y + rh - 1 <= by1; y++) for (let x = bx0; x + rw - 1 <= bx1; x++) {
      const cells = []; let ok = true;
      for (let j = 0; j < rh && ok; j++) for (let i = 0; i < rw; i++) { if (!free(x + i, y + j)) { ok = false; break; } cells.push([x + i, y + j]); }
      if (ok && touchesCorr(cells)) cands.push(cells);
    }
    if (type === 'kitchen') { const d = map.rooms.find(r => r.type === 'dining'); if (d) { const nb = cands.filter(cs => cs.some(([x, y]) => DIRS.some(([dx, dy]) => { const t = tileAt(map, x + dx, y + dy); return t && t.room === d; }))); if (nb.length) cands = nb; } }
    if (!cands.length) return null;
    const cells = pick(rng, cands); const tiles = cells.map(([x, y]) => set(x, y, type)); mkRoom(type, tiles);
  }
  // a few spare cells
  const spare = shuffle(rng, []); void spare;
  const extra = []; for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (free(x, y) && touchesCorr([[x, y]])) extra.push([x, y]);
  shuffle(rng, extra).slice(0, 3).forEach(([x, y]) => { const t = set(x, y, 'cell'); mkRoom('cell', [t]); });
  // gate: a border fence tile with a yard neighbour
  const gcs = [];
  for (const t of grid) if (t && t.type === 'fence') {
    const inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => tileAt(map, t.x + dx, t.y + dy)).filter(o => o && kindOf(o) === 'yard');
    if (inner.length && t.x > 2 && t.x < W - 3 || (inner.length && t.y > 2 && t.y < H - 3 && (t.x === 0 || t.x === W - 1))) gcs.push(t);
  }
  if (!gcs.length) return null;
  const g = pick(rng, gcs); g.type = 'gate'; g.name = ROOMS.gate.name; map.gate = g;
  // connectivity from the first cell
  const start = map.cells[0]; const seen = new Set([start]); const q = [start];
  while (q.length) { const c = q.shift(); for (const nb of neighbors(map, c)) if (!seen.has(nb)) { seen.add(nb); q.push(nb); } }
  if (grid.some(t => t && kindOf(t) !== 'exit' && !seen.has(t))) return null;
  if (grid.some(t => t && t.type === 'fence' && !exitsNearYard(map, t))) return null;
  // cameras and lights
  const addCam = t => { if (t && !t.camera) { t.camera = true; map.cams.push(t); } };
  addCam(tileAt(map, g.x, g.y)); // the gate camera watches the approach
  for (const type of ['armory', 'warden', 'control', 'common']) { const r = map.rooms.find(r => r.type === type); if (r && rng() < 0.85) addCam(r.tiles[0]); }
  shuffle(rng, grid.filter(t => t && t.type === 'corridor')).slice(0, 4).forEach(addCam);
  addCam(pick(rng, map.court.tiles));
  shuffle(rng, grid.filter(t => t && t.type === 'yard')).slice(0, 2).forEach(addCam);
  for (const c of map.cams) if (kindOf(c) === 'yard' || c.type === 'gate') c.flood = true;
  for (const t of grid) if (t && t.type === 'corridor') t.nightLamp = rng() < 0.45;
  for (const nb of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const y = tileAt(map, g.x + nb[0], g.y + nb[1]); if (y && kindOf(y) === 'yard') y.flood = true; }
  // random flips so the thick yard can be on any side
  flipMap(map, rng() < 0.5, rng() < 0.5);
  return map;
}
function exitsNearYard(map, t) { return DIRS.some(([dx, dy]) => { const n = tileAt(map, t.x + dx, t.y + dy); return n && kindOf(n) === 'yard'; }); }
function flipMap(map, fx, fy) {
  if (!fx && !fy) return;
  const ng = new Array(map.W * map.H).fill(null);
  for (const t of map.grid) if (t) { if (fx) t.x = map.W - 1 - t.x; if (fy) t.y = map.H - 1 - t.y; ng[t.y * map.W + t.x] = t; }
  map.grid = ng;
}
