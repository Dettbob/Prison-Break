// ===== ui_render.js (v3) : cartoon top-down renderer =====
// Tiled floors, furniture in every room, chunky walls with green doors, orange jumpsuits for prisoners and blue uniforms for guards.
const FLOOR = {
  cell: ['#8a6a4a', '#7d5f42'], solitary: ['#4a4d55', '#42454c'], common: ['#7f8bb5', '#76829e'], dining: ['#aab6ac', '#9ca9a0'], showers: ['#a8d2e6', '#98c4d9'], wc: ['#d3dde2', '#c4d0d6'],
  library: ['#b08a5e', '#a37d52'], workshop: ['#a29a8a', '#968e7e'], laundry: ['#a9c8cc', '#9abbc0'], kitchen: ['#93b59f', '#86a992'], infirmary: ['#e4ecea', '#d6e0de'], visitor: ['#bdb4a2', '#b0a794'],
  storage: ['#847b6e', '#786f63'], closet: ['#9a9284', '#8e867a'], armory: ['#85504d', '#794644'], guardroom: ['#62759c', '#586a90'], warden: ['#94607a', '#885670'], control: ['#47687a', '#3e5e70'], electrical: ['#92803c', '#86753a'],
  corridor: ['#a3a9ae', '#979da3'], door: ['#7c776d', '#726d63'], yard: ['#6f9f52', '#679649'], court: ['#cc7a42', '#c2703a'], gate: ['#8a7a30', '#7e6e2a'], fence: ['#3a4048', '#343a42'],
};
const LABEL = { cell: 'CELL', solitary: 'SOLITARY', common: 'REC ROOM', dining: 'CANTEEN', showers: 'SHOWERS', wc: 'WC', library: 'LIBRARY', workshop: 'WORKSHOP', laundry: 'LAUNDRY', kitchen: 'KITCHEN', infirmary: 'INFIRMARY', visitor: 'VISITORS', storage: 'STORAGE', closet: 'SUPPLIES', armory: 'ARMORY', guardroom: 'GUARDS', warden: "WARDEN", control: 'CONTROL', electrical: 'POWER', court: 'BASKETBALL', gate: 'MAIN GATE' };
const C = { amber: '#f2b441', alert: '#e5484d', ok: '#5fb878', ink: '#0e1114', fg: '#d9dee3' };
const NPC_COL = { dealer: '#9b6bd1', orderly: '#5fb8a0', fixer: '#3fa0c8', informant: '#d1a64a', inmate: '#f2b441' };
const SKINS = ['#f1c9a0', '#d9a273', '#b9805a', '#8d5a3b', '#f4d6b8'];
const MONO = '"IBM Plex Mono", monospace';
const ORANGE = '#f28a22', ORANGE_D = '#b65a0e';

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function box(ctx, x, y, w, h, fill, line, r) { rr(ctx, x, y, w, h, r === undefined ? Math.min(w, h) * 0.18 : r); ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.08); ctx.stroke(); } }
function dot(ctx, x, y, r, fill, line) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, r * 0.3); ctx.stroke(); } }
function lockIcon(ctx, cx, cy, s, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.14);
  ctx.beginPath(); ctx.arc(cx, cy - s * 0.12, s * 0.26, Math.PI, 0); ctx.stroke(); rr(ctx, cx - s * 0.36, cy - s * 0.06, s * 0.72, s * 0.5, s * 0.08); ctx.fill(); ctx.restore();
}
function camIcon(ctx, cx, cy, s, col) { // wall camera, lens pointing left
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.4 + Math.PI); ctx.fillStyle = col;
  rr(ctx, -s * 0.5, -s * 0.26, s * 0.78, s * 0.52, s * 0.1); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.28, -s * 0.12); ctx.lineTo(s * 0.6, -s * 0.3); ctx.lineTo(s * 0.6, s * 0.3); ctx.lineTo(s * 0.28, s * 0.12); ctx.closePath(); ctx.fill(); ctx.restore();
}
function eyeIcon(ctx, cx, cy, s, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.2, s * 0.12);
  ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.5, s * 0.3, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, s * 0.16, 0, 7); ctx.fill(); ctx.restore();
}
function eyeSlash(ctx, cx, cy, s, col) {
  eyeIcon(ctx, cx, cy, s, col); ctx.save(); ctx.strokeStyle = '#0e1114'; ctx.lineWidth = Math.max(3, s * 0.3); ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy + s * 0.45); ctx.lineTo(cx + s * 0.5, cy - s * 0.45); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.6, s * 0.14); ctx.stroke(); ctx.restore();
}
// where a unit is drawn: eases toward its real tile, which animates movement and gives a facing
function dispPos(U, key, x, y) {
  let d = U.disp[key]; if (!d) { d = U.disp[key] = { x, y, ang: Math.PI / 2 }; return d; }
  const dx = x - d.x, dy = y - d.y; if (dx * dx + dy * dy > 64) { d.x = x; d.y = y; return d; }
  if (dx * dx + dy * dy > 0.0004) d.ang = Math.atan2(dy, dx);
  d.x += dx * 0.22; d.y += dy * 0.22; if (Math.abs(x - d.x) < 0.01) d.x = x; if (Math.abs(y - d.y) < 0.01) d.y = y; return d;
}
const hash = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + (k || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the side of a tile that opens to somewhere else (where the door is)
function doorDir(map, t) {
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) { const n = tileAt(map, t.x + dx, t.y + dy); if (n && linked(map, t, n) && n.room !== t.room) return [dx, dy]; }
  return [0, 1];
}

// ---------- furniture (drawn in a local frame: tile centre at 0,0, size S, door on the south side) ----------
function props(ctx, w, t, x, y, S, dir) {
  const type = t.type; ctx.save(); ctx.translate(x + S / 2, y + S / 2);
  const single = t.room && t.room.tiles.length === 1;
  if (single) ctx.rotate(Math.atan2(-dir[0], dir[1]));
  const u = S / 10, B = (a, b, c, d, f, l) => box(ctx, a * u, b * u, c * u, d * u, f, l || 'rgba(0,0,0,0.35)');
  switch (type) {
    case 'cell': { // bed with blanket (the owner's colour), toilet, little desk
      const own = t.room && t.room.owner !== null ? PLAYER_COLORS[t.room.owner] : null, blanket = own || '#5f9a62';
      B(-4.4, -4.6, 4.6, 6.4, '#f4efe6'); B(-4.4, -2.6, 4.6, 4.4, blanket); B(-3.8, -4.1, 2.2, 1.5, '#ffffff', 'rgba(0,0,0,0.2)');
      B(2.2, -4.5, 2.2, 2.4, '#e9eef0'); dot(ctx, 3.3 * u, -3.3 * u, 0.7 * u, '#9fb0b8'); B(2.4, -1.4, 1.8, 1.4, '#f4f6f7');
      B(2.2, 1.6, 2.4, 1.6, '#b98a55'); if (t.room && t.room.dummy) { B(-3.6, -2.3, 3.2, 3, 'rgba(255,255,255,0.55)'); dot(ctx, -2.0 * u, -2.6 * u, 0.9 * u, '#f1c9a0'); } break; }
    case 'solitary': B(-4, -4.5, 8, 3, '#6b6f78'); B(-4, 3.2, 3, 1.4, '#e1e6e9'); break;
    case 'wc': for (let i = 0; i < 2; i++) { B(-4.2 + i * 4.4, -4.6, 3.6, 3.4, '#f6f8f9'); dot(ctx, (-2.4 + i * 4.4) * u, -2.9 * u, 1.1 * u, '#c9d4d9'); } B(-3, 1.6, 6, 1.6, '#b9c8d0'); dot(ctx, -1.5 * u, 2.4 * u, 0.5 * u, '#6f8794'); dot(ctx, 1.5 * u, 2.4 * u, 0.5 * u, '#6f8794'); break;
    case 'closet': B(-4.4, -4.4, 3, 3, '#a8773f'); B(-1, -4.4, 3, 3, '#b98a4c'); dot(ctx, 3.2 * u, 2.6 * u, 1.5 * u, '#4f93c9', '#2a5a82'); B(-4, 1.8, 1.2, 3, '#7b5a35'); break;
    case 'storage': B(-4.4, -4.4, 3.6, 3.6, '#a8773f'); B(-0.6, -4.4, 4.4, 3.6, '#b98a4c'); B(-4.4, 0.4, 4.4, 4, '#b98a4c'); B(0.4, 0.8, 3.4, 3.2, '#a8773f'); break;
    case 'armory': for (let i = 0; i < 3; i++) { B(-4.4, -4.2 + i * 2.9, 8.8, 0.9, '#2f3236'); B(-3.6 + i, -4.5 + i * 2.9, 5, 0.5, '#c9ced2', null); } break;
    case 'electrical': B(-4.4, -4.6, 8.8, 4.4, '#5d6670'); for (let i = 0; i < 4; i++) B(-3.8 + i * 2.1, -4 + (i % 2) * 1.2, 1.5, 1.8, '#f2b441'); B(-1, 1.5, 2, 2.4, '#e5484d'); break;
    case 'control': for (let i = 0; i < 3; i++) { B(-4.4 + i * 3, -4.4, 2.7, 2.4, '#14202a'); B(-4.1 + i * 3, -4.1, 2.1, 1.8, '#46d39a', null); } B(-3.5, 0.4, 7, 2, '#7f8a93'); break;
    case 'infirmary': for (let i = 0; i < 1; i++) { B(-4.4, -4.5, 4.8, 3.4, '#ffffff'); B(-4.4, -3.1, 4.8, 2.1, '#8fd0d6'); } B(1.6, -4.2, 2.6, 2.6, '#f4f6f7'); B(2.3, -3.5, 1.2, 0.5, '#e5484d', null); B(2.6, -3.8, 0.6, 1.2, '#e5484d', null); B(-3.4, 1.8, 3, 2, '#c7d3d8'); break;
    case 'visitor': B(-4.4, -1.2, 8.8, 2.6, '#c19a63'); dot(ctx, -2.4 * u, -2.6 * u, 1 * u, '#6b7a99'); dot(ctx, 2.4 * u, -2.6 * u, 1 * u, '#6b7a99'); dot(ctx, -2.4 * u, 2.9 * u, 1 * u, '#6b7a99'); dot(ctx, 2.4 * u, 2.9 * u, 1 * u, '#6b7a99'); break;
    case 'guardroom': B(-4.4, -4.4, 4.2, 2.4, '#b38a58'); B(0.4, -4.4, 4.2, 2.4, '#b38a58'); dot(ctx, -2.3 * u, -0.9 * u, 1.1 * u, '#2b2f36'); dot(ctx, 2.5 * u, -0.9 * u, 1.1 * u, '#2b2f36'); B(-3, 2.2, 6, 1.6, '#3a4252'); break;
    case 'warden': B(-4.2, -3.6, 8.4, 3, '#7b4a2a'); B(-3.4, -3, 2.4, 1.6, '#e8e1cf', null); dot(ctx, 0, 0.6 * u, 1.2 * u, '#2b2f36'); B(-3.4, 2.4, 6.8, 2, '#b9363f'); break;
    case 'library': for (let i = 0; i < 3; i++) { B(-4.5 + i * 3.1, -4.6, 2.8, 2.6, '#7b4a2a'); for (let k = 0; k < 4; k++) B(-4.2 + i * 3.1 + k * 0.62, -4.3, 0.5, 2, ['#c0392b', '#2f6db3', '#2f9e5a', '#d1a64a'][(i + k) % 4], null); } B(-3, 0.8, 6, 2.6, '#c19a63'); break;
    case 'workshop': B(-4.4, -4.4, 8.8, 2.6, '#6e7782'); B(-3.6, -3.9, 1.6, 1.6, '#f2b441', null); dot(ctx, 1.6 * u, -3.1 * u, 1.1 * u, '#c9ced2', '#59616b'); B(-3.4, 1.4, 4, 2.8, '#a8773f'); dot(ctx, 3 * u, 3 * u, 1.2 * u, '#5d6670'); break;
    case 'laundry': for (let i = 0; i < 2; i++) { B(-4.4 + i * 4.5, -4.4, 4, 4, '#e8edf0'); dot(ctx, (-2.4 + i * 4.5) * u, -2.4 * u, 1.3 * u, '#6aa3c9', '#2f6a94'); } B(-3.4, 1.6, 6.8, 2.6, '#d1a64a'); break;
    case 'kitchen': B(-4.5, -4.5, 9, 2.6, '#c9d3d8'); for (let i = 0; i < 4; i++) dot(ctx, (-3.2 + i * 2.1) * u, -3.2 * u, 0.7 * u, '#2f3338'); B(-4.4, 0.4, 3.4, 3.4, '#e8edf0'); dot(ctx, -2.7 * u, 2.1 * u, 1.1 * u, '#9fb0b8'); B(1, 1, 3.4, 3, '#c9d3d8'); break;
    case 'showers': for (let i = 0; i < 2; i++) { dot(ctx, (-2.3 + i * 4.6) * u, -2.8 * u, 1.2 * u, '#dfeaf0', '#6f8794'); dot(ctx, (-2.3 + i * 4.6) * u, -2.8 * u, 0.4 * u, '#6f8794'); } B(-4.4, 0.8, 8.8, 0.5, '#7aa7bd', null); dot(ctx, 0, 3.2 * u, 0.7 * u, '#6f8794'); break;
    case 'common': B(-4.4, -4.4, 8.8, 3, '#4f5d88'); B(-4.4, -4.4, 8.8, 1, '#3f4a70', null); B(-1.6, 0.6, 3.2, 2.4, '#b98a55'); B(3, 0.8, 1.6, 2.4, '#2b2f36'); B(3.1, 0.9, 1.4, 1.8, '#46a0d3', null); break;
    case 'dining': B(-4.6, -3.4, 9.2, 2.4, '#d5c2a0'); B(-4.6, -4.5, 9.2, 0.9, '#8c6b44', null); B(-4.6, -0.9, 9.2, 0.9, '#8c6b44', null); B(-4.6, 1.4, 9.2, 2.4, '#d5c2a0'); B(-4.6, 3.8, 9.2, 0.9, '#8c6b44', null); break;
    case 'court': { // hoops painted on the floor, line pattern by position
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(1, u * 0.4); ctx.strokeRect(-5 * u, -5 * u, 10 * u, 10 * u);
      if (t.room) { const c = t.room.tiles, mx = c.reduce((a, q) => a + q.x, 0) / c.length, my = c.reduce((a, q) => a + q.y, 0) / c.length; if (Math.abs(t.x - mx) < 0.6 && Math.abs(t.y - my) < 0.6) { ctx.beginPath(); ctx.arc(0, 0, 3.4 * u, 0, 7); ctx.stroke(); } } break; }
    default: break;
  }
  ctx.restore();
}

function floorTile(ctx, w, t, x, y, S, v) {
  const f = FLOOR[t.type] || FLOOR.corridor, e = 0.6;
  ctx.fillStyle = f[0]; ctx.fillRect(x - e, y - e, S + 2 * e, S + 2 * e);
  // tile pattern
  ctx.fillStyle = f[1]; const n = t.type === 'yard' || t.type === 'court' ? 1 : 2, h = S / n;
  if (t.type === 'yard') { // grass blades and dirt
    ctx.fillStyle = '#5e8c45'; for (let i = 0; i < 6; i++) ctx.fillRect(x + hash(t.x, t.y, i) * S * 0.9, y + hash(t.y, t.x, i + 9) * S * 0.9, S * 0.05, S * 0.09);
    ctx.fillStyle = 'rgba(150,120,80,0.35)'; if (hash(t.x, t.y, 77) > 0.7) { ctx.beginPath(); ctx.ellipse(x + S * 0.5, y + S * 0.55, S * 0.28, S * 0.16, 0, 0, 7); ctx.fill(); }
  } else if (t.type === 'fence') { /* drawn below */ }
  else for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2 === 0) ctx.fillRect(x + i * h, y + j * h, h, h);
  if (t.type === 'corridor' || t.type === 'door') { ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, S - 1, S - 1); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(x + S / 2, y); ctx.lineTo(x + S / 2, y + S); ctx.moveTo(x, y + S / 2); ctx.lineTo(x + S, y + S / 2); ctx.stroke(); }
  if (t.type === 'fence') {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, S, S); ctx.clip(); ctx.strokeStyle = '#aab4bf'; ctx.lineWidth = 1; ctx.globalAlpha = 0.85;
    for (let i = -S; i < S * 2; i += S * 0.2) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + S, y + S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + i, y + S); ctx.lineTo(x + i + S, y); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#d4dae0'; ctx.fillRect(x, y + S * 0.46, S, S * 0.08); ctx.restore();
  }
  if (t.type === 'gate') { ctx.fillStyle = '#1e1e1e'; for (let i = 0; i < 6; i++) ctx.fillRect(x + i * S / 6, y, S / 12, S); }
  if (t.type !== 'corridor' && t.type !== 'yard' && t.type !== 'door') props(ctx, w, t, x, y, S, doorDir(w.map, t));
}

function drawGame(ctx, U, now) {
  const w = U.w, p = w.players[U.viewer], W = U.W, H = U.H, TS = U.zoom, map = w.map;
  ctx.clearRect(0, 0, W, H);
  const sx = x => (x - U.cx) * TS + W / 2, sy = y => (y - U.cy) * TS + H / 2;
  const vis = U.vis, mem = U.mem, night = isNight(w);
  const isVisT = t => vis.has(tkey(t)), known = t => isVisT(t) || mem.has(tkey(t));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const onScreen = t => { const x = sx(t.x), y = sy(t.y); return !(x > W || y > H || x + TS < 0 || y + TS < 0); };
  // ---- floors and furniture ----
  for (const t of map.grid) {
    if (!t || !known(t) || !onScreen(t)) continue;
    const v = isVisT(t), x = sx(t.x), y = sy(t.y);
    floorTile(ctx, w, t, x, y, TS, v);
    if (v) {
      if (tileLit(w, t)) { const g = ctx.createRadialGradient(x + TS / 2, y + TS / 2, 2, x + TS / 2, y + TS / 2, TS * 0.85); g.addColorStop(0, 'rgba(255,236,170,0.16)'); g.addColorStop(1, 'rgba(255,236,170,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, TS, TS); }
      else { ctx.fillStyle = 'rgba(6,10,28,0.55)'; ctx.fillRect(x, y, TS, TS); }
    } else { ctx.fillStyle = 'rgba(10,14,22,0.62)'; ctx.fillRect(x, y, TS, TS); }
  }
  // ---- guard line of sight: the exact area each guard can see, cut by walls (not by tiles) ----
  if (U.vpolys && w.phase === 'players') {
    const cv = drawGame.cv || (drawGame.cv = document.createElement('canvas'));
    if (cv.width !== ctx.canvas.width || cv.height !== ctx.canvas.height) { cv.width = ctx.canvas.width; cv.height = ctx.canvas.height; }
    const c2 = cv.getContext('2d'), kx = ctx.canvas.width / (ctx.canvas.clientWidth || ctx.canvas.width), ky = ctx.canvas.height / (ctx.canvas.clientHeight || ctx.canvas.height);
    for (const vp of U.vpolys) {
      c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, cv.width, cv.height); c2.setTransform(kx, 0, 0, ky, 0, 0);
      c2.globalCompositeOperation = 'source-over'; c2.beginPath();
      vp.pts.forEach(([px, py], i) => { const X = sx(px), Y = sy(py); if (i) c2.lineTo(X, Y); else c2.moveTo(X, Y); }); c2.closePath();
      const col = vp.red ? '229,72,77' : '60,110,255';
      c2.fillStyle = 'rgba(' + col + ',' + (vp.red ? 0.45 : 0.38) + ')'; c2.fill();
      c2.lineWidth = 3; c2.strokeStyle = 'rgba(' + col + ',0.85)'; c2.stroke();
      // keep only tiles you can see and that are within the guard's range (lit rooms 5.4, dark ones about 1.5)
      const mk = drawGame.mk || (drawGame.mk = document.createElement('canvas'));
      if (mk.width !== cv.width || mk.height !== cv.height) { mk.width = cv.width; mk.height = cv.height; }
      const m2 = mk.getContext('2d'); m2.setTransform(1, 0, 0, 1, 0, 0); m2.clearRect(0, 0, mk.width, mk.height); m2.setTransform(kx, 0, 0, ky, 0, 0); m2.fillStyle = '#000';
      for (const t of map.grid) {
        if (!t || !onScreen(t) || !isVisT(t)) continue;
        if (Math.hypot(t.x - vp.gx, t.y - vp.gy) <= (tileLit(w, t) ? LIT_R() : DARK_R(CFG.VISION_DARK))) m2.fillRect(sx(t.x) - 0.5, sy(t.y) - 0.5, TS + 1, TS + 1);
      }
      c2.setTransform(1, 0, 0, 1, 0, 0); c2.globalCompositeOperation = 'destination-in'; c2.drawImage(mk, 0, 0);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cv, 0, 0); ctx.restore();
    }
  }
  // ---- your cell glow ----
  const mine = cellOf(w, p), mt = mine.tiles[0];
  if (known(mt) && onScreen(mt)) { const x = sx(mt.x), y = sy(mt.y), col = PLAYER_COLORS[U.viewer]; ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, TS * 0.06); ctx.setLineDash([TS * 0.14, TS * 0.08]); ctx.strokeRect(x + 2, y + 2, TS - 4, TS - 4); ctx.setLineDash([]); }
  // ---- walls on every unlinked edge, doors on linked edges between different spaces ----
  const wt = Math.max(3, TS * 0.15);
  for (const t of map.grid) {
    if (!t || !known(t) || !onScreen(t) || t.type === 'fence' || t.type === 'gate') continue;
    const x = sx(t.x), y = sy(t.y), v = isVisT(t);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const n = tileAt(map, t.x + dx, t.y + dy); if (n && kindOf(n) === 'exit') continue;
      const link = n && linked(map, t, n); if ((dx < 0 || dy < 0) && link) continue;
      let ex, ey, ew, eh;
      if (dx === 1) { ex = x + TS; ey = y; ew = 0; eh = TS; } else if (dx === -1) { ex = x; ey = y; ew = 0; eh = TS; } else if (dy === 1) { ex = x; ey = y + TS; ew = TS; eh = 0; } else { ex = x; ey = y; ew = TS; eh = 0; }
      if (!link) {
        if (n && t.type === 'yard' && n.type === 'yard') continue;
        ctx.lineCap = 'butt'; ctx.strokeStyle = v ? '#2a2e35' : '#1a1d22'; ctx.lineWidth = wt; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + ew, ey + eh); ctx.stroke();
        ctx.strokeStyle = v ? '#8a929c' : '#5a616b'; ctx.lineWidth = Math.max(1.5, wt * 0.32); ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + ew, ey + eh); ctx.stroke();
      } else if (n.room !== t.room || kindOf(n) !== kindOf(t)) {
        const locked = (t.room && t.room.locked && t.room !== n.room) || (n.room && n.room.locked && n.room !== t.room) || (n.room && n.room !== t.room && n.room.type === 'cell' && night) || (t.room && t.room !== n.room && t.room.type === 'cell' && night);
        const mx = ex + ew / 2, my = ey + eh / 2, len = TS * 0.46, hw = wt * 0.7;
        ctx.save(); ctx.translate(mx, my); if (dx) ctx.rotate(Math.PI / 2);
        box(ctx, -len / 2, -hw / 2, len, hw, locked ? '#d9822b' : '#3fae6a', '#14301f', hw * 0.3); ctx.fillStyle = '#ffffff55'; ctx.fillRect(-len / 2 + 2, -hw / 2 + 1, len - 4, Math.max(1, hw * 0.2)); ctx.restore();
      }
    }
  }
  // ---- room labels (big and faint, like floor paint), restricted outlines ----
  for (const r of map.rooms) {
    const kt = r.tiles.filter(known); if (!kt.length) continue;
    for (const t of r.tiles) if (known(t) && onScreen(t) && restricted(w, p, t)) { const x = sx(t.x), y = sy(t.y); ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(229,72,77,0.85)'; ctx.lineWidth = 2; ctx.strokeRect(x + wt * 0.75, y + wt * 0.75, TS - wt * 1.5, TS - wt * 1.5); ctx.setLineDash([]); }
    if (TS >= 34 && LABEL[r.type]) {
      let cx = 0, cy = 0; kt.forEach(t => { cx += t.x + 0.5; cy += t.y + 0.5; }); cx /= kt.length; cy /= kt.length;
      let label = LABEL[r.type], col = 'rgba(255,255,255,0.5)', fs = Math.max(9, TS * (r.tiles.length > 1 ? 0.24 : 0.15));
      if (r.type === 'cell' && r.owner !== null) { label = r.owner === U.viewer ? 'YOUR CELL' : w.players[r.owner].name.toUpperCase(); col = PLAYER_COLORS[r.owner]; fs = Math.max(9, TS * 0.13); }
      else if (r.type === 'cell') label = '';
      if (label) { ctx.font = '900 ' + fs + 'px "Big Shoulders Stencil Display", Impact, sans-serif'; ctx.lineWidth = Math.max(2, fs * 0.2); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.fillStyle = col; const lx = sx(cx), ly = sy(cy) + (r.type === 'cell' ? TS * 0.36 : 0); ctx.strokeText(label, lx, ly); ctx.fillText(label, lx, ly); }
      if (r.locked || (r.type === 'cell' && night && roomLocked(w, r, p))) lockIcon(ctx, sx(r.tiles[0].x) + TS * 0.84, sy(r.tiles[0].y) + TS * 0.78, TS * 0.22, C.amber);
    }
  }
  // ---- cameras, loot bags, salvage gears ----
  for (const t of map.grid) {
    if (!t || !t.camera || (!known(t) && !p.intel.cams) || !onScreen(t)) continue;
    const x = sx(t.x), y = sy(t.y), off = w.camsOff > 0 || w.powerOff > 0;
    if (!off && isVisT(t)) { ctx.strokeStyle = 'rgba(229,72,77,0.12)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + TS / 2, y + TS / 2, (CFG.CAMERA_RANGE + 0.5) * TS, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    dot(ctx, x + TS * 0.82, y + TS * 0.2, TS * 0.17, 'rgba(10,12,15,0.85)'); camIcon(ctx, x + TS * 0.82, y + TS * 0.2, TS * 0.27, off ? '#7a8590' : C.alert);
  }
  const bag = (x, y, n, live) => {
    const s = TS * 0.3; ctx.globalAlpha = live ? 1 : 0.45; ctx.fillStyle = '#b5832a'; ctx.beginPath(); ctx.moveTo(x - s * 0.25, y - s * 0.55); ctx.lineTo(x + s * 0.25, y - s * 0.55); ctx.lineTo(x + s * 0.55, y + s * 0.5); ctx.lineTo(x - s * 0.55, y + s * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a1d08'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#2a1d08'; ctx.font = '800 ' + s * 0.8 + 'px ' + MONO; ctx.fillText(live && n > 0 ? String(n) : '$', x, y + s * 0.12); ctx.globalAlpha = 1;
  };
  const gear = (x, y, n, live) => {
    const s = TS * 0.17; ctx.globalAlpha = live ? 1 : 0.45; ctx.fillStyle = '#8fb4d9'; ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rad = i % 2 ? s * 0.8 : s * 1.15; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#1b2733'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#1b2733'; ctx.beginPath(); ctx.arc(x, y, s * 0.42, 0, 7); ctx.fill();
    if (live && n > 0) { ctx.fillStyle = '#fff'; ctx.font = '800 ' + s * 0.9 + 'px ' + MONO; ctx.fillText(String(n), x + s * 1.5, y + s * 0.1); } ctx.globalAlpha = 1;
  };
  for (const r of map.rooms) {
    const d = ROOMS[r.type], kt = r.tiles.filter(known); if (!kt.length || (r.type === 'cell' && r.owner !== null)) continue;
    const live = kt.some(isVisT), t = kt[0]; if (!onScreen(t)) continue; const x = sx(t.x), y = sy(t.y);
    if (d.loot && live && !r.locked && r.spots > 0) bag(x + TS * 0.2, y + TS * 0.8, r.spots, live && r.spots > 0);
    if (d.salvage && (r.salv > 0 || !live)) gear(x + TS * 0.62, y + TS * 0.82, r.salv, live && r.salv > 0);
  }
  for (const t of map.grid) if (t && t.type === 'yard' && t.spots > 0 && isVisT(t) && onScreen(t)) bag(sx(t.x) + TS * 0.2, sy(t.y) + TS * 0.8, t.spots, true);
  // ---- route intel ----
  if (U.routes) for (const rt of U.routes) {
    ctx.strokeStyle = 'rgba(80,120,230,0.9)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2.5; ctx.beginPath();
    rt.pts.forEach((q, i) => { const px = sx(q.x + 0.5), py = sy(q.y + 0.5); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke(); ctx.setLineDash([]);
    rt.pts.forEach((q, i) => { dot(ctx, sx(q.x + 0.5), sy(q.y + 0.5), TS * 0.11, 'rgba(80,120,230,0.95)', '#fff'); ctx.fillStyle = '#fff'; ctx.font = '700 ' + TS * 0.13 + 'px ' + MONO; ctx.fillText(rt.name[0] + (i + 1), sx(q.x + 0.5), sy(q.y + 0.5) - TS * 0.22); });
  }
  // ---- move / run options ----
  if (U.moveOpts && !U.cover && w.phase === 'players' && w.cur === U.viewer) {
    const pulse = 0.55 + 0.25 * Math.sin(now / 280);
    for (const o of U.runOpts || []) { if (!known(tileAt(map, o.x, o.y))) continue; const x = sx(o.x) + TS / 2, y = sy(o.y) + TS / 2; dot(ctx, x, y, TS * 0.07, 'rgba(255,255,255,' + (0.45 + 0.25 * Math.sin(now / 280)) + ')'); }
    for (const o of U.moveOpts) {
      const x = sx(o.x), y = sy(o.y); ctx.lineWidth = 3; ctx.strokeStyle = o.locked ? 'rgba(229,72,77,0.9)' : 'rgba(255,214,90,' + pulse + ')'; ctx.strokeRect(x + 2, y + 2, TS - 4, TS - 4);
      if (!o.locked) { ctx.fillStyle = 'rgba(255,214,90,0.12)'; ctx.fillRect(x + 2, y + 2, TS - 4, TS - 4); }
      if (o.locked) lockIcon(ctx, x + TS / 2, y + TS / 2, TS * 0.3, 'rgba(229,72,77,0.95)');
    }
  }
  if (U.sel) { const x = sx(U.sel.x), y = sy(U.sel.y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2); }
  for (const b of w.brawls) if (b.left > 0 && vis.has(b.x + ',' + b.y)) { ctx.fillStyle = C.alert; ctx.font = '800 ' + TS * 0.34 + 'px ' + MONO; ctx.fillText('✖', sx(b.x + 0.5), sy(b.y + 0.5) + Math.sin(now / 90) * 2); }
  // ---- people ----
  const seeAll = p.intel.seeUntil >= w.round, unitsAt = {};
  const add = (u, kind, key) => { const k = u.x + ',' + u.y; (unitsAt[k] = unitsAt[k] || []).push({ u, kind, key }); };
  for (const g of w.guards) { if (g.dead && g.found && !vis.has(g.x + ',' + g.y)) continue; if (g.off && !seeAll) continue; if (vis.has(g.x + ',' + g.y) || seeAll) add(g, 'g', 'g' + g.id); }
  for (const n of w.npcs) { if (n.off || n.dead) continue; if (vis.has(n.x + ',' + n.y)) add(n, 'n', 'n' + n.id); }
  for (const q of w.players) { if (q.status !== 'free' && q.status !== 'solitary') continue; if (q.id === U.viewer || vis.has(q.x + ',' + q.y)) add(q, 'p', 'p' + q.id); }
  if (p.spotted && p.status === 'free') for (const s of p.spotted) {
    const g = w.guards.find(g => g.id === s.gid); if (!g) continue; const a = dispPos(U, 'g' + g.id, g.x, g.y), b = dispPos(U, 'p' + p.id, p.x, p.y);
    ctx.strokeStyle = 'rgba(229,72,77,0.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(sx(a.x + 0.5), sy(a.y + 0.5)); ctx.lineTo(sx(b.x + 0.5), sy(b.y + 0.5)); ctx.stroke();
    eyeIcon(ctx, (sx(a.x + 0.5) + sx(b.x + 0.5)) / 2, (sy(a.y + 0.5) + sy(b.y + 0.5)) / 2, TS * 0.3, '#ff5a5f');
  }
  for (const k in unitsAt) {
    const arr = unitsAt[k];
    arr.forEach((e, i) => {
      const n = arr.length, ang = n === 1 ? 0 : (i / n) * Math.PI * 2 + 0.8, off = n === 1 ? 0 : TS * 0.2, d = dispPos(U, e.key, e.u.x, e.u.y);
      const cx = sx(d.x) + TS / 2 + Math.cos(ang) * off, cy = sy(d.y) + TS / 2 + Math.sin(ang) * off + TS * 0.02, r = TS * 0.2;
      if (e.kind === 'g') {
        drawGuard(ctx, e.u, cx, cy, r, w, p, now, d.ang); const gg = e.u;
        if (gg.ko <= 0 && !gg.dead && !gg.off && p.status === 'free') { const sees = p.spotted && p.spotted.some(s => s.gid === gg.id); if (sees) eyeIcon(ctx, cx - r * 1.2, cy - r * 1.8, TS * 0.3, '#ff5a5f'); else eyeSlash(ctx, cx - r * 1.2, cy - r * 1.8, TS * 0.3, '#7c95d6'); }
      } else if (e.kind === 'n') drawNpc(ctx, e.u, cx, cy, r, TS, d.ang); else drawPlayer(ctx, e.u, cx, cy, r, U.viewer, w, now, TS, d.ang);
    });
  }
  for (const rp of U.rip) { const age = (now - rp.t0) / 900; if (age > 1) continue; ctx.strokeStyle = 'rgba(255,214,90,' + (0.7 * (1 - age)) + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx(rp.x + 0.5), sy(rp.y + 0.5), TS * (0.2 + Math.min(rp.r, 4) * age), 0, 7); ctx.stroke(); }
  for (const h of p.heard) {
    const t = tileAt(map, h.x, h.y); if (!t || isVisT(t)) continue; const cx = sx(h.x) + TS / 2, cy = sy(h.y) + TS / 2, ph = (now / 700) % 1;
    ctx.strokeStyle = 'rgba(255,214,90,' + (0.8 - ph * 0.6) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, TS * (0.18 + ph * 0.25), 0, 7); ctx.stroke();
    ctx.fillStyle = '#ffd65a'; ctx.font = '800 ' + TS * 0.3 + 'px ' + MONO; ctx.fillText('?', cx, cy);
  }
  if (night || w.powerOff > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,30,0.12)'); g.addColorStop(1, 'rgba(0,0,20,0.5)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
}

// ---------- people ----------
// top-down cartoon person: shoulders, head, little hands. `ang` is the direction of travel.
function person(ctx, cx, cy, r, o) {
  ctx.save(); ctx.translate(cx, cy); if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 1.2, r * 0.8, 0, 0, 7); ctx.fill();
  ctx.rotate((o.ang === undefined ? Math.PI / 2 : o.ang) + Math.PI / 2);
  if (o.down) ctx.rotate(Math.PI / 2);
  // hands
  dot(ctx, -r * 1.1, r * 0.1, r * 0.28, o.skin, '#00000066'); dot(ctx, r * 1.1, r * 0.1, r * 0.28, o.skin, '#00000066');
  // body
  ctx.beginPath(); ctx.ellipse(0, 0.1 * r, r * 1.15, r * 0.78, 0, 0, 7); ctx.fillStyle = o.suit; ctx.fill(); ctx.strokeStyle = o.suitD; ctx.lineWidth = Math.max(1.5, r * 0.18); ctx.stroke();
  if (o.stripe) { ctx.fillStyle = o.stripe; ctx.fillRect(-r * 0.12, -r * 0.7, r * 0.24, r * 1.5); }
  // head
  dot(ctx, 0, -r * 0.08, r * 0.62, o.skin, '#00000077');
  if (o.hat === 'cap') { ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.66, Math.PI * 0.95, Math.PI * 2.05); ctx.fillStyle = '#1d2f5c'; ctx.fill(); ctx.fillStyle = '#10204a'; ctx.fillRect(-r * 0.5, -r * 0.82, r, r * 0.18); }
  else { ctx.beginPath(); ctx.arc(0, -r * 0.04, r * 0.63, Math.PI * 0.08, Math.PI * 0.92); ctx.fillStyle = o.hair || '#3a2a1c'; ctx.fill(); }
  if (o.hat !== 'cap') { dot(ctx, -r * 0.2, -r * 0.32, r * 0.08, '#1a1a1a'); dot(ctx, r * 0.2, -r * 0.32, r * 0.08, '#1a1a1a'); }
  ctx.restore();
}
function drawPlayer(ctx, q, cx, cy, r, viewer, w, now, TS, ang) {
  ctx.save(); const own = q.id === viewer;
  if (own && w.cur === viewer && w.phase === 'players') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r * 1.6 + Math.sin(now / 300) * 1.2, 0, 7); ctx.stroke(); }
  dot(ctx, cx, cy + r * 0.45, r * 1.3, q.color + '33', q.color + 'cc'); // coloured ring so you can tell prisoners apart
  person(ctx, cx, cy, r, { suit: q.wearing ? '#2f55a4' : ORANGE, suitD: q.wearing ? '#1d3670' : ORANGE_D, skin: SKINS[q.id % SKINS.length], hat: q.wearing ? 'cap' : null, hair: ['#2a1d12', '#a34b1a', '#c9b037', '#1a1a1a'][q.id % 4], stripe: q.wearing ? null : '#ffe2b5', ang, alpha: q.hidden ? (own ? 0.5 : 0.2) : 1, down: q.asleep });
  // number badge
  ctx.globalAlpha = q.hidden ? 0.6 : 1; box(ctx, cx - r * 0.6, cy - r * 2.2, r * 1.2, r * 0.95, q.color, '#0e1114', r * 0.25); ctx.fillStyle = '#0e1114'; ctx.font = '900 ' + r * 0.85 + 'px "Big Shoulders Stencil Display", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(q.asleep ? 'z' : String(q.id + 1), cx, cy - r * 1.72);
  if (q.meth) { ctx.fillStyle = q.meth.state === 'high' ? '#7cf' : '#e99'; ctx.fillRect(cx + r * 1.0, cy + r * 0.6, r * 0.5, r * 0.5); }
  if (q.hidden) { ctx.setLineDash([3, 3]); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r * 1.4, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
}
function drawGuard(ctx, g, cx, cy, r, w, p, now, ang) {
  ctx.save(); const down = g.ko > 0 || g.dead;
  person(ctx, cx, cy, r, { suit: down ? '#59606b' : '#2f55a4', suitD: down ? '#3b4048' : '#1d3670', skin: SKINS[g.id % SKINS.length], hat: down ? null : 'cap', stripe: down ? null : '#f2b441', ang, down });
  if (!down) { ctx.fillStyle = '#e8c35a'; ctx.beginPath(); ctx.arc(cx + r * 0.55, cy + r * 0.2, r * 0.17, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#e8edf3'; ctx.font = '800 ' + r * 0.8 + 'px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if (down) ctx.fillText(g.dead ? 'x' : 'z', cx, cy - r * 1.4);
  const hunting = g.state === 'hunt', mark = down ? '' : hunting ? '!' : (g.state === 'sus' || g.state === 'investigate' || g.state === 'search') ? '?' : g.state === 'brawl' ? '!' : '';
  if (mark) { const red = hunting || g.state === 'brawl'; ctx.lineWidth = r * 0.35; ctx.strokeStyle = '#0e1114'; ctx.fillStyle = red ? '#ff4b52' : '#ffd23f'; ctx.font = '900 ' + r * 2 + 'px ' + MONO; const mx = cx + r * 1.2, my = cy - r * 1.6 + Math.sin(now / 120) * 1.5; ctx.strokeText(mark, mx, my); ctx.fillText(mark, mx, my); }
  const bl = g.blind[p.id]; if (bl && bl.until >= w.round && bl.charges > 0 && !down) { ctx.fillStyle = C.ok; ctx.font = '900 ' + r * 1.2 + 'px ' + MONO; ctx.fillText('$', cx + r * 1.3, cy + r * 0.2); }
  if (p.intel.corrupt && !down) dot(ctx, cx - r * 1.2, cy + r * 0.9, r * 0.28, g.corrupt ? C.ok : C.alert, '#0e1114');
  ctx.restore();
}
function drawNpc(ctx, n, cx, cy, r, TS, ang) {
  ctx.save(); const down = n.ko > 0, vendor = n.role !== 'inmate';
  person(ctx, cx, cy, r, { suit: down ? '#9a8a76' : ORANGE, suitD: ORANGE_D, skin: SKINS[n.id % SKINS.length], hair: ['#2a1d12', '#8a8a8a', '#a34b1a', '#111'][n.id % 4], stripe: down ? null : '#ffe2b5', ang, down });
  if (vendor) { ctx.fillStyle = NPC_COL[n.role]; ctx.beginPath(); ctx.arc(cx, cy - r * 0.2, r * 0.7, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); box(ctx, cx - r * 0.55, cy + r * 0.2, r * 1.1, r * 0.4, NPC_COL[n.role], '#0e1114', r * 0.1); }
  if (n.hostile != null) { ctx.strokeStyle = C.alert; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, 7); ctx.stroke(); }
  if (TS >= 40) { ctx.font = '700 ' + Math.max(9, TS * 0.14) + 'px "IBM Plex Sans", sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const ly = cy + r * 1.75; ctx.strokeText(n.name, cx, ly); ctx.fillText(n.name, cx, ly); }
  ctx.restore();
}
