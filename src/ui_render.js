// ===== ui_render.js (v2) : canvas top-down renderer =====
// Rooms are filled edge to edge, walls are drawn on every unlinked tile edge, corridors look like hallways.
const STYLE = {
  cell: ['#3a4452', 'CELL'], solitary: ['#242830', 'SOLITARY'], common: ['#44506b', 'COMMON ROOM'], dining: ['#4d5164', 'DINING HALL'], showers: ['#36606c', 'SHOWERS'],
  yard: ['#2f4632', 'YARD'], court: ['#6a4a30', 'BASKETBALL COURT'], corridor: ['#1d2226', ''], library: ['#56503c', 'LIBRARY'], workshop: ['#5a4a38', 'WORKSHOP'], laundry: ['#3a5a5e', 'LAUNDRY'],
  infirmary: ['#47625f', 'INFIRMARY'], visitor: ['#48505e', 'VISITORS'], kitchen: ['#5e5744', 'KITCHEN'], storage: ['#41413b', 'STORAGE'],
  armory: ['#653a3a', 'ARMORY'], guardroom: ['#383e66', 'GUARD ROOM'], warden: ['#613d52', "WARDEN'S OFFICE"], control: ['#2c5566', 'CONTROL'], electrical: ['#625430', 'POWER'],
  door: ['#4b4f55', 'EXIT'], gate: ['#7a6528', 'MAIN GATE'], fence: ['#20252b', ''],
};
const C = { amber: '#f2b441', alert: '#e5484d', ok: '#5fb878', ink: '#0e1114', fg: '#d9dee3' };
const NPC_COL = { dealer: '#9b6bd1', orderly: '#5fb8a0', fixer: '#3fa0c8', informant: '#d1a64a', inmate: '#c98a4b' };
const MONO = '"IBM Plex Mono", monospace';

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function lockIcon(ctx, cx, cy, s, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.14);
  ctx.beginPath(); ctx.arc(cx, cy - s * 0.12, s * 0.26, Math.PI, 0); ctx.stroke();
  rr(ctx, cx - s * 0.36, cy - s * 0.06, s * 0.72, s * 0.5, s * 0.08); ctx.fill(); ctx.restore();
}
function camIcon(ctx, cx, cy, s, col) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.4); ctx.fillStyle = col;
  rr(ctx, -s * 0.5, -s * 0.26, s * 0.78, s * 0.52, s * 0.1); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.28, -s * 0.12); ctx.lineTo(s * 0.6, -s * 0.3); ctx.lineTo(s * 0.6, s * 0.3); ctx.lineTo(s * 0.28, s * 0.12); ctx.closePath(); ctx.fill(); ctx.restore();
}
function eyeSlash(ctx, cx, cy, s, col) {
  eyeIcon(ctx, cx, cy, s, col); ctx.save(); ctx.strokeStyle = '#0e1114'; ctx.lineWidth = Math.max(3, s * 0.3); ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy + s * 0.45); ctx.lineTo(cx + s * 0.5, cy - s * 0.45); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.6, s * 0.14); ctx.stroke(); ctx.restore();
}
function eyeIcon(ctx, cx, cy, s, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.2, s * 0.12);
  ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.5, s * 0.3, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, s * 0.16, 0, 7); ctx.fill(); ctx.restore();
}

// where a unit is drawn: eases toward its real tile, which animates movement
function dispPos(U, key, x, y) {
  let d = U.disp[key]; if (!d) { d = U.disp[key] = { x, y }; return d; }
  const dx = x - d.x, dy = y - d.y; if (dx * dx + dy * dy > 64) { d.x = x; d.y = y; return d; }
  d.x += dx * 0.22; d.y += dy * 0.22; if (Math.abs(x - d.x) < 0.01) d.x = x; if (Math.abs(y - d.y) < 0.01) d.y = y; return d;
}

function drawGame(ctx, U, now) {
  const w = U.w, p = w.players[U.viewer], W = U.W, H = U.H, TS = U.zoom, map = w.map;
  ctx.clearRect(0, 0, W, H);
  const sx = x => (x - U.cx) * TS + W / 2, sy = y => (y - U.cy) * TS + H / 2;
  const vis = U.vis, mem = U.mem; const night = isNight(w);
  const isVisT = t => vis.has(tkey(t)); const known = t => isVisT(t) || mem.has(tkey(t));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const onScreen = t => { const x = sx(t.x), y = sy(t.y); return !(x > W || y > H || x + TS < 0 || y + TS < 0); };
  // ---- floors ----
  for (const t of map.grid) {
    if (!t || !known(t) || !onScreen(t)) continue;
    const v = isVisT(t), x = sx(t.x), y = sy(t.y), st = STYLE[t.type], e = 0.6;
    ctx.fillStyle = st[0]; ctx.fillRect(x - e, y - e, TS + 2 * e, TS + 2 * e);
    if (t.type === 'corridor') {
      ctx.fillStyle = 'rgba(255,255,255,0.035)'; for (let i = 0; i < 4; i++) ctx.fillRect(x, y + (i + 0.5) * TS / 4, TS, 1);
      ctx.strokeStyle = 'rgba(242,180,65,0.28)'; ctx.setLineDash([TS * 0.1, TS * 0.1]); ctx.lineWidth = Math.max(1, TS * 0.03);
      ctx.beginPath(); let any = false;
      for (const n of neighbors(map, t)) if (n.type === 'corridor' || n.type === 'door') { ctx.moveTo(x + TS / 2, y + TS / 2); ctx.lineTo(x + TS / 2 + (n.x - t.x) * TS / 2, y + TS / 2 + (n.y - t.y) * TS / 2); any = true; }
      if (!any) { ctx.moveTo(x + TS / 2, y + TS * 0.3); ctx.lineTo(x + TS / 2, y + TS * 0.7); }
      ctx.stroke(); ctx.setLineDash([]);
    } else if (t.type === 'yard') {
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 5; i++) ctx.fillRect(x + ((t.x * 7 + t.y * 13 + i * 11) % 9) / 9 * TS, y + ((t.x * 5 + i * 17) % 9) / 9 * TS, TS * 0.06, TS * 0.06);
    } else if (t.type === 'court') {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(x + 2, y + 2, TS - 4, TS - 4);
    } else if (t.type === 'fence') {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, TS, TS); ctx.clip(); ctx.strokeStyle = '#7b8591'; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
      for (let i = -TS; i < TS * 2; i += TS * 0.17) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + TS, y + TS); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + i, y + TS); ctx.lineTo(x + i + TS, y); ctx.stroke(); } ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.03)'; if (((t.x + t.y) & 1) === 0) ctx.fillRect(x, y, TS, TS);
    }
    if (v) {
      if (tileLit(w, t)) { const g = ctx.createRadialGradient(x + TS / 2, y + TS / 2, 2, x + TS / 2, y + TS / 2, TS * 0.8); g.addColorStop(0, 'rgba(255,200,110,0.2)'); g.addColorStop(1, 'rgba(255,200,110,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, TS, TS); }
      else { ctx.fillStyle = 'rgba(4,8,18,0.5)'; ctx.fillRect(x, y, TS, TS); }
    } else { ctx.fillStyle = 'rgba(8,11,15,0.6)'; ctx.fillRect(x, y, TS, TS); }
  }
  // ---- guard line of sight tint (what guards in view can see) ----
  if (U.los && w.phase === 'players') {
    for (const [k, lvl] of U.los) {
      const t = map.grid[0] && tileAt(map, +k.split(',')[0], +k.split(',')[1]); if (!t || !isVisT(t) || !onScreen(t)) continue;
      const x = sx(t.x), y = sy(t.y); const red = lvl >= 2; ctx.fillStyle = red ? 'rgba(229,72,77,0.3)' : 'rgba(107,134,201,0.18)'; ctx.fillRect(x, y, TS, TS);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, TS, TS); ctx.clip(); ctx.strokeStyle = red ? 'rgba(229,72,77,0.3)' : 'rgba(107,134,201,0.22)'; ctx.lineWidth = 1;
      for (let i = -TS; i < TS; i += TS * 0.22) { ctx.beginPath(); ctx.moveTo(x + i, y + TS); ctx.lineTo(x + i + TS, y); ctx.stroke(); } ctx.restore();
    }
  }
  // ---- owned cells ----
  for (const r of map.rooms) {
    if (r.type !== 'cell' || r.owner === null) continue; const t = r.tiles[0]; if (!known(t) || !onScreen(t)) continue;
    const x = sx(t.x), y = sy(t.y), col = PLAYER_COLORS[r.owner], mine = r.owner === U.viewer;
    ctx.fillStyle = col; ctx.globalAlpha = mine ? 0.3 : 0.14; ctx.fillRect(x, y, TS, TS); ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.lineWidth = mine ? Math.max(3, TS * 0.07) : 1.5; ctx.strokeRect(x + 1.5, y + 1.5, TS - 3, TS - 3);
    if (mine) { // bed
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; rr(ctx, x + TS * 0.2, y + TS * 0.55, TS * 0.6, TS * 0.26, TS * 0.04); ctx.fill(); ctx.fillStyle = col; ctx.fillRect(x + TS * 0.2, y + TS * 0.55, TS * 0.14, TS * 0.26);
      if (r.dummy) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x + TS * 0.55, y + TS * 0.66, TS * 0.2, TS * 0.07, 0, 0, 7); ctx.fill(); }
    }
  }
  // ---- walls on every unlinked edge, doorways on linked edges between different spaces ----
  const wt = Math.max(2.5, TS * 0.085);
  for (const t of map.grid) {
    if (!t || !known(t) || !onScreen(t) || t.type === 'fence' || t.type === 'gate') continue;
    const x = sx(t.x), y = sy(t.y), v = isVisT(t);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const n = tileAt(map, t.x + dx, t.y + dy); const nk = n && kindOf(n) === 'exit';
      if (nk) continue; // the fence draws itself
      const link = n && linked(map, t, n);
      if ((dx < 0 || dy < 0) && link) continue; // handle shared edges once from the +x/+y side
      let ex, ey, ew, eh;
      if (dx === 1) { ex = x + TS; ey = y; ew = 0; eh = TS; } else if (dx === -1) { ex = x; ey = y; ew = 0; eh = TS; } else if (dy === 1) { ex = x; ey = y + TS; ew = TS; eh = 0; } else { ex = x; ey = y; ew = TS; eh = 0; }
      if (!link) {
        if (n && t.type === 'yard' && n.type === 'yard') continue;
        ctx.strokeStyle = v ? '#05070a' : '#0a0d11'; ctx.lineWidth = wt; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + ew, ey + eh); ctx.stroke();
        ctx.strokeStyle = v ? 'rgba(160,172,186,0.5)' : 'rgba(120,130,142,0.3)'; ctx.lineWidth = Math.max(1, wt * 0.3); ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + ew, ey + eh); ctx.stroke();
      } else if (n.room !== t.room || kindOf(n) !== kindOf(t)) {
        const locked = (t.room && t.room.locked && t.room !== n.room) || (n.room && n.room.locked && n.room !== t.room) || (n.room && n.room !== t.room && n.room.type === 'cell' && night) || (t.room && t.room !== n.room && t.room.type === 'cell' && night);
        const mx = ex + ew / 2, my = ey + eh / 2, len = TS * 0.34;
        ctx.strokeStyle = locked ? '#c58a2a' : 'rgba(210,220,230,0.55)'; ctx.lineWidth = Math.max(2, wt * 0.8);
        ctx.beginPath(); if (dx) { ctx.moveTo(mx, my - len / 2); ctx.lineTo(mx, my + len / 2); } else { ctx.moveTo(mx - len / 2, my); ctx.lineTo(mx + len / 2, my); } ctx.stroke();
      }
    }
  }
  // ---- zone outlines, labels, icons ----
  for (const r of map.rooms) {
    const t0 = r.tiles.find(known) ; if (!t0) continue;
    for (const t of r.tiles) {
      if (!known(t) || !onScreen(t)) continue; const x = sx(t.x), y = sy(t.y);
      if (restricted(w, p, t)) { ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(229,72,77,0.7)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + wt * 0.7, y + wt * 0.7, TS - wt * 1.4, TS - wt * 1.4); ctx.setLineDash([]); }
    }
    if (TS >= 30 && STYLE[r.type][1]) {
      const kt = r.tiles.filter(known); let cx = 0, cy = 0; kt.forEach(t => { cx += t.x + 0.5; cy += t.y + 0.5; }); cx /= kt.length; cy /= kt.length;
      let label = STYLE[r.type][1], col = isVisT(t0) ? 'rgba(235,240,245,0.85)' : 'rgba(180,190,200,0.5)', fs = Math.max(8, TS * 0.15);
      if (r.type === 'cell' && r.owner !== null) { label = r.owner === U.viewer ? 'YOUR CELL' : w.players[r.owner].name.toUpperCase() + "'S CELL"; col = PLAYER_COLORS[r.owner]; fs = Math.max(8, TS * (r.owner === U.viewer ? 0.16 : 0.12)); }
      ctx.font = '700 ' + fs + 'px ' + MONO; ctx.fillStyle = col; ctx.fillText(label, sx(cx), sy(cy) - (r.type === 'cell' ? TS * 0.3 : 0));
      if (r.locked || (r.type === 'cell' && night && roomLocked(w, r, p))) lockIcon(ctx, sx(r.tiles[0].x) + TS * 0.82, sy(r.tiles[0].y) + TS * 0.8, TS * 0.22, isVisT(t0) ? C.amber : '#8a6a2a');
    }
  }
  // ---- cameras (any tile), loot bags and salvage gears ----
  for (const t of map.grid) {
    if (!t || !t.camera || !known(t) && !p.intel.cams || !onScreen(t)) continue;
    const x = sx(t.x), y = sy(t.y), off = w.camsOff > 0 || w.powerOff > 0;
    if (!off && isVisT(t)) { ctx.strokeStyle = 'rgba(229,72,77,0.1)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + TS / 2, y + TS / 2, (CFG.CAMERA_RANGE + 0.5) * TS, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = 'rgba(10,12,15,0.8)'; ctx.beginPath(); ctx.arc(x + TS * 0.82, y + TS * 0.2, TS * 0.17, 0, 7); ctx.fill();
    camIcon(ctx, x + TS * 0.82, y + TS * 0.2, TS * 0.27, off ? '#7a8590' : C.alert);
  }
  const bag = (x, y, n, live) => {
    const s = TS * 0.3; ctx.globalAlpha = live ? 1 : 0.45; ctx.fillStyle = '#b5832a'; ctx.beginPath(); ctx.moveTo(x - s * 0.25, y - s * 0.55); ctx.lineTo(x + s * 0.25, y - s * 0.55); ctx.lineTo(x + s * 0.55, y + s * 0.5); ctx.lineTo(x - s * 0.55, y + s * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a1d08'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#2a1d08'; ctx.font = '800 ' + s * 0.8 + 'px ' + MONO; ctx.fillText(live && n > 0 ? String(n) : '$', x, y + s * 0.12); ctx.globalAlpha = 1;
  };
  const gear = (x, y, n, live) => {
    const s = TS * 0.17; ctx.globalAlpha = live ? 1 : 0.45; ctx.fillStyle = '#8fb4d9'; ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rad = i % 2 ? s * 0.8 : s * 1.15; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b2733'; ctx.beginPath(); ctx.arc(x, y, s * 0.42, 0, 7); ctx.fill();
    if (live && n > 0) { ctx.fillStyle = '#fff'; ctx.font = '800 ' + s * 0.9 + 'px ' + MONO; ctx.fillText(String(n), x + s * 1.5, y + s * 0.1); } ctx.globalAlpha = 1;
  };
  for (const r of map.rooms) {
    const d = ROOMS[r.type], kt = r.tiles.filter(known); if (!kt.length || (r.type === 'cell' && r.owner !== null)) continue;
    const live = kt.some(isVisT), t = kt[0]; if (!onScreen(t)) continue; const x = sx(t.x), y = sy(t.y);
    if (d.loot && !(r.locked && !live)) { if (r.spots > 0 || !live) bag(x + TS * 0.2, y + TS * 0.8, r.spots, live && r.spots > 0); }
    if (d.salvage && (r.salv > 0 || !live)) gear(x + TS * 0.62, y + TS * 0.82, r.salv, live && r.salv > 0);
  }
  for (const t of map.grid) if (t && t.type === 'yard' && t.spots > 0 && isVisT(t) && onScreen(t)) bag(sx(t.x) + TS * 0.2, sy(t.y) + TS * 0.8, t.spots, true);
  // ---- route intel ----
  if (U.routes) for (const rt of U.routes) {
    ctx.strokeStyle = 'rgba(107,134,201,0.8)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.beginPath();
    rt.pts.forEach((q, i) => { const px = sx(q.x + 0.5), py = sy(q.y + 0.5); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke(); ctx.setLineDash([]);
    rt.pts.forEach((q, i) => { ctx.fillStyle = 'rgba(107,134,201,0.95)'; ctx.beginPath(); ctx.arc(sx(q.x + 0.5), sy(q.y + 0.5), TS * 0.1, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 ' + TS * 0.12 + 'px ' + MONO; ctx.fillText(rt.name[0] + (i + 1), sx(q.x + 0.5), sy(q.y + 0.5) - TS * 0.2); });
  }
  // ---- move / run options ----
  if (U.moveOpts && !U.cover && w.phase === 'players' && w.cur === U.viewer) {
    const pulse = 0.55 + 0.25 * Math.sin(now / 280);
    for (const o of U.runOpts || []) { const x = sx(o.x) + TS / 2, y = sy(o.y) + TS / 2; ctx.fillStyle = 'rgba(242,180,65,' + (0.35 + 0.2 * Math.sin(now / 280)) + ')'; ctx.beginPath(); ctx.arc(x, y, TS * 0.07, 0, 7); ctx.fill(); }
    for (const o of U.moveOpts) {
      const x = sx(o.x), y = sy(o.y); ctx.lineWidth = 2.5; ctx.strokeStyle = o.locked ? 'rgba(229,72,77,0.8)' : 'rgba(242,180,65,' + pulse + ')'; ctx.strokeRect(x + 2, y + 2, TS - 4, TS - 4);
      if (o.locked) lockIcon(ctx, x + TS / 2, y + TS / 2, TS * 0.3, 'rgba(229,72,77,0.9)');
    }
  }
  if (U.sel) { const x = sx(U.sel.x), y = sy(U.sel.y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2); }
  // ---- brawls ----
  for (const b of w.brawls) if (b.left > 0 && vis.has(b.x + ',' + b.y)) { ctx.fillStyle = C.alert; ctx.font = '800 ' + TS * 0.3 + 'px ' + MONO; ctx.fillText('✖', sx(b.x + 0.5), sy(b.y + 0.5) + Math.sin(now / 90) * 2); }
  // ---- units ----
  const seeAll = p.intel.seeUntil >= w.round, unitsAt = {};
  const add = (u, kind, key) => { const k = u.x + ',' + u.y; (unitsAt[k] = unitsAt[k] || []).push({ u, kind, key }); };
  for (const g of w.guards) { if (g.dead && g.found && !vis.has(g.x + ',' + g.y)) continue; if (g.off && !seeAll) continue; if (vis.has(g.x + ',' + g.y) || seeAll) add(g, 'g', 'g' + g.id); }
  for (const n of w.npcs) { if (n.off || n.dead) continue; if (vis.has(n.x + ',' + n.y) || (n.role !== 'inmate' && mem.has(n.x + ',' + n.y) && false)) add(n, 'n', 'n' + n.id); }
  for (const q of w.players) { if (q.status !== 'free' && q.status !== 'solitary') continue; if (q.id === U.viewer || vis.has(q.x + ',' + q.y)) add(q, 'p', 'p' + q.id); }
  // eye lines: guards that can see the viewer
  if (p.spotted && p.status === 'free') for (const s of p.spotted) {
    const g = w.guards.find(g => g.id === s.gid); if (!g) continue; const a = dispPos(U, 'g' + g.id, g.x, g.y), b = dispPos(U, 'p' + p.id, p.x, p.y);
    ctx.strokeStyle = 'rgba(229,72,77,0.9)'; ctx.setLineDash([]); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sx(a.x + 0.5), sy(a.y + 0.5)); ctx.lineTo(sx(b.x + 0.5), sy(b.y + 0.5)); ctx.stroke(); ctx.setLineDash([]);
    eyeIcon(ctx, (sx(a.x + 0.5) + sx(b.x + 0.5)) / 2, (sy(a.y + 0.5) + sy(b.y + 0.5)) / 2, TS * 0.28, ctx.strokeStyle);
  }
  for (const k in unitsAt) {
    const arr = unitsAt[k];
    arr.forEach((e, i) => {
      const n = arr.length, ang = n === 1 ? 0 : (i / n) * Math.PI * 2 + 0.8, off = n === 1 ? 0 : TS * 0.2, d = dispPos(U, e.key, e.u.x, e.u.y);
      const cx = sx(d.x) + TS / 2 + Math.cos(ang) * off, cy = sy(d.y) + TS / 2 + Math.sin(ang) * off + TS * 0.04, r = TS * 0.19;
      if (e.kind === 'g') { drawGuard(ctx, e.u, cx, cy, r, w, p, now); const gg = e.u; if (gg.ko <= 0 && !gg.dead && !gg.off && p.status === 'free') { const sees = p.spotted && p.spotted.some(s => s.gid === gg.id); if (sees) eyeIcon(ctx, cx - r * 1.05, cy - r * 1.35, TS * 0.3, '#ff5a5f'); else eyeSlash(ctx, cx - r * 1.05, cy - r * 1.35, TS * 0.3, '#7c95d6'); } } else if (e.kind === 'n') drawNpc(ctx, e.u, cx, cy, r, TS); else drawPlayer(ctx, e.u, cx, cy, r, U.viewer, w, now);
    });
  }
  // ---- noise ripples and heard noises ----
  for (const rp of U.rip) { const age = (now - rp.t0) / 900; if (age > 1) continue; ctx.strokeStyle = 'rgba(242,180,65,' + (0.6 * (1 - age)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(rp.x + 0.5), sy(rp.y + 0.5), TS * (0.2 + Math.min(rp.r, 4) * age), 0, 7); ctx.stroke(); }
  for (const h of p.heard) {
    const t = tileAt(map, h.x, h.y); if (!t || isVisT(t)) continue; const cx = sx(h.x) + TS / 2, cy = sy(h.y) + TS / 2, ph = (now / 700) % 1;
    ctx.strokeStyle = 'rgba(242,180,65,' + (0.7 - ph * 0.6) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, TS * (0.18 + ph * 0.25), 0, 7); ctx.stroke();
    ctx.fillStyle = C.amber; ctx.font = '700 ' + TS * 0.26 + 'px ' + MONO; ctx.fillText('?', cx, cy);
  }
  if (night || w.powerOff > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,10,0)'); g.addColorStop(1, 'rgba(0,0,12,0.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
}

function drawPlayer(ctx, q, cx, cy, r, viewer, w, now) {
  ctx.save(); if (q.hidden) ctx.globalAlpha = q.id === viewer ? 0.5 : 0.2;
  if (q.id === viewer && w.cur === viewer && w.phase === 'players') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r + 3 + Math.sin(now / 300) * 1.2, 0, 7); ctx.stroke(); }
  ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#0e1114'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#0e1114'; ctx.font = '700 ' + r * 1.15 + 'px "Big Shoulders Stencil Display", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(q.asleep ? 'z' : String(q.id + 1), cx, cy + 1);
  if (q.wearing) { ctx.fillStyle = '#3a3f60'; ctx.fillRect(cx - r * 0.7, cy - r * 1.25, r * 1.4, r * 0.4); }
  if (q.meth) { ctx.fillStyle = q.meth.state === 'high' ? '#7cf' : '#a77'; ctx.fillRect(cx + r * 0.7, cy + r * 0.5, r * 0.5, r * 0.5); }
  if (q.hidden) { ctx.setLineDash([3, 3]); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
}
function drawGuard(ctx, g, cx, cy, r, w, p, now) {
  ctx.save(); const down = g.ko > 0 || g.dead;
  ctx.fillStyle = down ? '#3b4048' : '#1d2a4a'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.strokeStyle = down ? '#6b7480' : '#6b86c9'; ctx.lineWidth = 2; ctx.stroke();
  if (!down) { ctx.fillStyle = '#3b6ee0'; ctx.beginPath(); ctx.arc(cx, cy - r * 0.15, r * 0.95, Math.PI * 1.1, Math.PI * 1.9); ctx.lineTo(cx, cy - r * 0.15); ctx.fill(); }
  ctx.fillStyle = '#e8edf3'; ctx.font = '700 ' + r * 0.95 + 'px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g.dead ? 'x' : down ? 'z' : g.name[0], cx, cy + r * 0.2);
  const hunting = g.state === 'hunt', mark = down ? '' : hunting ? '!' : (g.state === 'sus' || g.state === 'investigate' || g.state === 'search') ? '?' : g.state === 'brawl' ? '!' : '';
  if (mark) { const danger = hunting && true; ctx.fillStyle = danger || g.state === 'brawl' ? C.alert : C.amber; ctx.font = '800 ' + r * 1.6 + 'px ' + MONO; ctx.fillText(mark, cx + r * 0.9, cy - r * 1.15 + Math.sin(now / 120) * 1.5); }
  const bl = g.blind[p.id]; if (bl && bl.until >= w.round && bl.charges > 0 && !down) { ctx.fillStyle = C.ok; ctx.font = '800 ' + r * 1.1 + 'px ' + MONO; ctx.fillText('$', cx - r * 0.9, cy - r * 1.05); }
  if (p.intel.corrupt && !down) { ctx.fillStyle = g.corrupt ? C.ok : C.alert; ctx.beginPath(); ctx.arc(cx + r * 0.85, cy + r * 0.85, r * 0.22, 0, 7); ctx.fill(); }
  ctx.restore();
}
function drawNpc(ctx, n, cx, cy, r, TS) {
  ctx.save(); const col = NPC_COL[n.role] || '#999', down = n.ko > 0;
  ctx.fillStyle = down ? '#444' : col; rr(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.35); ctx.fill(); ctx.strokeStyle = n.hostile != null ? C.alert : '#0e1114'; ctx.lineWidth = n.hostile != null ? 3 : 2; ctx.stroke();
  ctx.fillStyle = '#0e1114'; ctx.font = '800 ' + r * 1.1 + 'px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(down ? 'z' : n.name[0], cx, cy + 1);
  if (TS >= 46) { ctx.fillStyle = 'rgba(235,240,245,0.85)'; ctx.font = '600 ' + Math.max(8, TS * 0.12) + 'px ' + MONO; ctx.fillText(n.name, cx, cy + r + TS * 0.1); }
  ctx.restore();
}
