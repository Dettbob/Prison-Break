// ===== ui_app.js (v2) : menus, panel, modals, notifications, input =====
const $ = id => document.getElementById(id);
const U = { w: null, viewer: 0, zoom: 64, cx: 8, cy: 5.5, W: 300, H: 300, vis: new Set(), mem: new Set(), moveOpts: [], runOpts: [], los: null, routes: [], disp: {}, rip: [], fxSeen: new WeakSet(),
  sel: null, cover: false, tab: 'actions', acts: [], follow: true, menuTile: null, modal: null, tipsOpen: false, paused: false, routeView: new Set(), noteSeen: {}, lastAlert: 0, lastStrikes: {}, alog: [], saveOk: true };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const setup = { n: 2, mode: 'coop', shared: true, diff: 'medium', seed: Math.floor(Math.random() * 1e6) };
// ---------- saving: the engine is deterministic, so a save is the setup plus the list of actions taken ----------
const SAVE_KEY = 'ts_save', SAVE_V = 4;
function A(a) { const pid = U.viewer, r = act(U.w, pid, a); U.alog.push([pid, a]); saveSoon(); return r; } // failed actions can still change state (rng, hidden), so every call is logged
let saveT = 0;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveNow, 150); }
function saveNow() {
  try {
    if (!U.w) return; if (U.w.over) { localStorage.removeItem(SAVE_KEY); return; }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_V, setup: U.setup, log: U.alog, round: U.w.round, at: Date.now() })); U.saveOk = true;
  } catch (e) { U.saveOk = false; }
}
function readSave() { try { const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return j && j.v === SAVE_V && j.setup && Array.isArray(j.log) ? j : null; } catch (e) { return null; } }
function loadSave() {
  const s = readSave(); if (!s) return false;
  try {
    const w = newWorld(s.setup);
    for (const [pid, a] of s.log) act(w, pid, a);
    U.setup = s.setup; U.alog = s.log.slice(); U.w = w; enterGame(); return true;
  } catch (e) { try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ } U.w = null; return false; }
}
function enterGame() {
  const w = U.w, n = w.players.length;
  Object.assign(U, { viewer: 0, sel: null, tab: 'actions', modal: null, menuTile: null, follow: true, disp: {}, rip: [], fxSeen: new WeakSet(), noteSeen: {}, paused: false, tipsOpen: false, routeView: new Set(), lastAlert: w.alert, lastStrikes: {} });
  for (const q of w.players) U.noteSeen[q.id] = w.notes.length ? w.notes[w.notes.length - 1].id : -1;
  showScreen('game'); resizeCanvas(); U.zoom = Math.max(48, Math.min(84, Math.floor(Math.min(U.W / 6.2, 84))));
  $('pause').hidden = true; $('notes').innerHTML = ''; U.cover = n > 1; AUDIO.init(); refresh(true); afterTurnChange(true); saveSoon();
}
const now_ = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------- screens ----------
function showScreen(name) {
  $('menu').hidden = name !== 'menu'; $('setup').hidden = name !== 'setup'; $('game').hidden = name !== 'game'; $('over').hidden = true;
  if (name === 'menu') { const s = readSave(); $('m-resume').hidden = !((U.w && !U.w.over) || s); $('m-resume').textContent = (U.w && !U.w.over) ? 'Resume game' : s ? 'Continue saved game (round ' + s.round + ', ' + (DIFFS[s.setup.diff] || DIFFS.medium).name + ')' : 'Resume game'; }
}
function renderSetup() {
  $('seg-n').innerHTML = [1, 2, 3, 4].map(n => `<button class="seg ${setup.n === n ? 'on' : ''}" data-n="${n}">${n}</button>`).join('');
  $('seg-mode').innerHTML = [['coop', 'Co-op'], ['race', 'Race (PvP)']].map(([m, l]) => `<button class="seg ${setup.mode === m ? 'on' : ''}" data-mode="${m}">${l}</button>`).join('');
  $('names').innerHTML = Array.from({ length: setup.n }, (_, i) => `<label class="name"><span class="dot" style="background:${PLAYER_COLORS[i]}"></span><input id="nm${i}" maxlength="14" placeholder="Player ${i + 1}" value="${esc(setup['nm' + i] || '')}"></label>`).join('');
  $('seg-diff').innerHTML = Object.keys(DIFFS).map(k => `<button class="seg ${setup.diff === k ? 'on' : ''}" data-diff="${k}">${DIFFS[k].name}</button>`).join(''); $('diff-hint').textContent = DIFFS[setup.diff].desc;
  $('shared-row').hidden = setup.mode !== 'coop' || setup.n < 2; $('shared').checked = setup.shared; $('seed').value = setup.seed;
  $('mode-hint').textContent = setup.mode === 'coop' ? 'Escape together. You share vision and can swap items. The run ends when everyone is out or transferred.' : 'First one over the wall wins. Prisoners can fight and rob each other.';
}
function startGame() {
  const names = Array.from({ length: setup.n }, (_, i) => (setup['nm' + i] || '').trim() || ('Player ' + (i + 1)));
  U.setup = { seed: setup.seed, players: setup.n, mode: setup.mode, shared: setup.shared, names, diff: setup.diff };
  U.w = newWorld(U.setup); U.alog = []; for (const q of U.w.players) U.noteSeen[q.id] = -1; enterGame();
}

// ---------- view refresh ----------
const me = () => U.w.players[U.viewer];
function refresh(center) {
  const w = U.w, p = me();
  U.vis = teamVisible(w, p); U.mem = new Set(p.memory); if (w.shared) for (const q of w.players) for (const k of q.memory) U.mem.add(k);
  const turn = w.phase === 'players' && w.cur === U.viewer && p.status === 'free' && !p.pending;
  U.moveOpts = turn ? moveOptions(w, p) : []; U.runOpts = turn && p.ap >= 2 ? runOptions(w, p) : [];
  // what guards in view can see (line of sight)
  U.los = new Map();
  for (const g of w.guards) {
    if (g.ko > 0 || g.dead || g.off || !U.vis.has(g.x + ',' + g.y)) continue;
    const sees = p.spotted && p.spotted.some(s => s.gid === g.id), gt = unitTile(w, g), range = tileLit(w, gt) ? CFG.VISION_LIT : CFG.VISION_LIT;
    for (const [k] of reach(w, gt, range, true)) { const [x, y] = k.split(',').map(Number), t = tileAt(w.map, x, y); if (!t) continue; if (sightDist(w, g, t) !== Infinity) U.los.set(k, Math.max(U.los.get(k) || 0, sees ? 2 : 1)); }
  }
  U.routes = [];
  for (const slot of U.routeView) if (p.routeIntel.has(slot)) for (const g of w.guards) if (!g.post) U.routes.push({ name: g.name, pts: guardRouteTiles(w, g, slot) });
  if (center) { U.cx = p.x + 0.5; U.cy = p.y + 0.5; U.follow = true; }
}
function toast(msg, bad) {
  if (!msg) return; const t = $('toast'); t.textContent = msg; t.className = 'show ' + (bad ? 'bad' : 'ok');
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, 3600);
}
function pumpNotes() {
  if (U.cover) return; const w = U.w, id = U.viewer, seen = U.noteSeen[id] === undefined ? -1 : U.noteSeen[id];
  const fresh = w.notes.filter(n => n.id > seen && (n.pid == null || n.pid === id)); U.noteSeen[id] = w.notes.length ? w.notes[w.notes.length - 1].id : seen;
  if (!fresh.length) return;
  const box = $('notes');
  for (const n of fresh.slice(-5)) {
    const el = document.createElement('div'); el.className = 'note ' + (n.kind === 'bad' ? 'bad' : n.kind === 'good' ? 'good' : ''); el.innerHTML = esc(n.text) + `<small>Round ${n.round}</small>`;
    el.addEventListener('click', () => el.remove()); box.appendChild(el);
    if (n.kind !== 'bad') setTimeout(() => el.remove(), 9000);
  }
  while (box.children && box.children.length > 5) box.removeChild(box.children[0]);
  const worst = fresh.find(n => n.kind === 'bad') ? 'bad' : fresh.find(n => n.kind === 'warn') ? 'warn' : fresh.find(n => n.kind === 'good') ? 'good' : null; if (worst) AUDIO.sfx(worst);
}
function doAct(a) {
  const w = U.w; if (w.over) return; const p = me(), before = p.strikes;
  const r = A(a); if (!r.ok) { toast(r.msg, true); AUDIO.sfx('ui'); renderAll(); return r; }
  if (r.msg) toast(r.msg, false);
  const snd = { move: a.sneak ? 'sneak' : 'step', run: 'run', loot: 'loot', salvage: 'loot', work: 'loot', craft: 'click', buy: 'coin', sell: 'coin', intel: 'coin', route: 'coin', bribe: 'coin', buykey: 'coin', unlock: 'lock', hide: 'hide', attack: 'hit', sneakattack: 'hit', hack: 'click', power: 'click', escape: 'win', cutfence: 'win' }[a.t] || 'ui';
  AUDIO.sfx(snd); if (p.strikes > before) AUDIO.sfx('strike');
  afterTurnChange(); return r;
}
function afterTurnChange(first) {
  const w = U.w;
  if (w.over) { refresh(true); renderAll(); showOver(); return; }
  const pp = w.players.find(q => q.pending);
  const target = pp ? pp.id : (w.phase === 'players' ? w.cur : U.viewer);
  if (target !== U.viewer) { U.viewer = target; U.cover = w.players.length > 1; U.sel = null; U.tab = 'actions'; U.modal = null; U.menuTile = null; refresh(true); AUDIO.sfx('ui'); }
  else refresh(true);
  if (w.alert > U.lastAlert) AUDIO.sfx('siren'); U.lastAlert = w.alert;
  AUDIO.setMood(w.alert >= 2 ? 'alert' : isNight(w) ? 'night' : 'calm');
  U.menuTile = null; renderAll(); pumpNotes();
}

// ---------- rendering ----------
function renderAll() { renderTop(); renderPanel(); renderCover(); renderMenu(); renderModal(); renderTips(); const mb = $('mutebtn'); mb.className = 'hbtn' + (AUDIO.state.muted ? ' on' : ''); mb.innerHTML = AUDIO.state.muted ? '&#128263;' : '&#9835;'; }
function renderTop() {
  const w = U.w, ph = timeOf(w), dark = ph.phase === 'night' || w.powerOff > 0;
  $('round').textContent = 'Round ' + w.round + ' \u00b7 ' + DIFFS[w.diff].name;
  let warn = '';
  if (ph.phase === 'evening' && ph.left <= CFG.NIGHT_WARN) warn = `<span class="chip warnchip">Lights out in ${ph.left}: go to your cell</span>`;
  else if (ph.phase === 'night') warn = `<span class="chip dim">Sleep in your cell to skip the night</span>`;
  $('phase').innerHTML = `<span class="chip ${dark ? 'night' : 'day'}">${dark ? '&#9790;' : '&#9728;'} ${esc(ph.wd)} ${esc(w.powerOff > 0 ? 'Blackout' : ph.name)}<small>${ph.left} left</small></span> ${warn}`;
  $('alert').innerHTML = `<span class="lbl">Alert</span>` + [1, 2, 3].map(i => `<i class="pip ${w.alert >= i ? 'hot' : ''}"></i>`).join('') + (w.camsOff > 0 ? `<span class="chip dim">Cams off ${w.camsOff}</span>` : '');
}
function inv(p) { return Object.entries(p.items).map(([i, q]) => `<span class="item" title="${esc(ITEMS[i].desc)}"><b>${esc(ITEMS[i].icon)}</b>${esc(ITEMS[i].name)}${isContraband(i) ? ' <em title="contraband">*</em>' : ''}${q > 1 ? ' <em>x' + q + '</em>' : ''}</span>`).join('') || '<span class="muted">Empty pockets.</span>'; }
function renderPanel() {
  const w = U.w, p = me(), t = ptile(w, p), myTurn = w.phase === 'players' && w.cur === U.viewer && p.status === 'free' && !p.pending;
  const maxAp = CFG.AP + (p.meth ? (p.meth.state === 'high' ? 1 : -1) : 0), lvl = trespassLevel(w, p);
  let h = (w.players.length < 2 ? '' : '<div class="roster">' + w.players.map(q => `<span class="rchip ${q.id === U.viewer ? 'on' : ''} ${q.status !== 'free' ? 'out' : ''}" style="--c:${q.color}"><i></i>${esc(q.name)}${q.status === 'escaped' ? ' &#10003;' : q.status === 'transferred' ? ' &#10005;' : q.status === 'solitary' ? ' (solitary)' : ''}</span>`).join('') + '</div>');
  h += `<div class="card"><div class="cardhead"><b style="color:${p.color}">${esc(p.name)}</b><span class="cigs" title="Cigarettes are currency and cannot be confiscated"><u>C</u> ${p.items.cigs || 0}</span></div>
   <div class="stats"><div><span class="lbl">HP</span>${Array.from({ length: CFG.HP_PRISONER }, (_, i) => `<i class="seg2 ${i < p.hp ? 'hp' : ''}"></i>`).join('')}</div>
   <div><span class="lbl">AP</span>${Array.from({ length: Math.max(1, maxAp) }, (_, i) => `<i class="ap ${i < p.ap ? 'on' : ''}"></i>`).join('')}</div>
   <div><span class="lbl">Strikes</span>${[0, 1, 2].map(i => `<i class="strike ${i < p.strikes ? 'on' : ''}"></i>`).join('')}</div></div>
   <div class="where">${esc(t.name)} ${inOwnCell(w, p) ? '<span class="tag you">your cell</span>' : ''}<span class="tag ${restricted(w, p, t) ? 'bad' : 'good'}">${restricted(w, p, t) ? 'restricted' : 'allowed'}</span> <span class="tag">${tileLit(w, t) ? 'lit' : 'dark'}</span>${p.hidden ? ' <span class="tag good">hidden</span>' : ''}${p.wearing ? ' <span class="tag">in uniform</span>' : ''}${p.asleep ? ' <span class="tag">asleep</span>' : ''}
   ${p.meth ? `<span class="meth ${p.meth.state === 'crash' ? 'crash' : ''}">${p.meth.state === 'high' ? 'HIGH' : 'CRASH'} ${p.meth.left}</span>` : ''}</div></div>`;
  if (myTurn && lvl) h += `<div class="warn ${lvl === 'sus' ? 'soft' : ''}"><span class="mark ${lvl === 'sus' ? 'sus' : 'dan'}">${lvl === 'sus' ? '?' : '!'}</span> ${lvl === 'sus' ? 'You are somewhere you should not be. Guards will find this suspicious.' : 'You are out of bounds. A guard who sees you will hunt you.'}</div>`;
  if (myTurn && p.spotted && p.spotted.length) h += `<div class="warn ${p.spotted.some(s => s.hunting || s.level === 'danger') ? '' : 'soft'}">${p.spotted.length} guard${p.spotted.length > 1 ? 's have' : ' has'} line of sight to you (eye lines on the map).</div>`;
  if (myTurn && p.wanted) h += '<div class="warn">You are wanted: your bed was empty. Guards are searching everywhere.</div>';
  h += `<div class="tabs">${['actions', 'pack', 'intel', 'log'].map(k => `<button class="tab ${U.tab === k ? 'on' : ''}" data-tab="${k}">${{ actions: 'Actions', pack: 'Pack', intel: 'Intel', log: 'Log' }[k]}</button>`).join('')}</div>`;
  if (U.tab === 'actions') {
    U.acts = myTurn ? getActions(w, p) : [];
    if (!myTurn) h += `<p class="muted pad">${w.over ? 'Game over.' : p.pending ? 'Answer the guard first.' : 'Waiting for the next turn.'}</p>`;
    else {
      h += '<p class="hint">Tap a glowing tile to move, sneak or run (3 tiles, 2 AP, loud). Small amber dots mark run targets.</p><div class="acts">';
      U.acts.forEach((a, i) => { h += `<button class="act ${a.enabled ? '' : 'off'}" data-i="${i}" ${a.enabled ? '' : 'aria-disabled="true"'}><span class="al">${esc(a.label)}</span>${a.ap ? `<span class="ap-b">${a.ap} AP</span>` : ''}${a.why ? `<small>${esc(a.why)}</small>` : (a.note ? `<small>${esc(a.note)}</small>` : '')}</button>`; });
      h += '</div>';
    }
  } else if (U.tab === 'pack') {
    h += `<div class="pack">${inv(p)}</div>`; const wp = weaponOf(p);
    h += `<p class="hint">Best weapon: <b>${wp.id}</b> (${wp.dmg} dmg). Items marked * are contraband: a guard who catches you with them takes them. Store them in your cell stash. Cigarettes are safe.</p>`;
    if (U.sel) { const s = U.sel; h += `<div class="seltile"><b>${esc(s.name)}</b> <span class="tag ${restricted(w, p, s) ? 'bad' : 'good'}">${restricted(w, p, s) ? 'restricted' : 'allowed'}</span> <span class="tag">${tileLit(w, s) ? 'lit' : 'dark'}</span></div>`; }
  } else if (U.tab === 'intel') {
    const slots = [...p.routeIntel];
    h += '<p class="hint">Guards repeat the same patrol in the same weekday slot. Buy routes from the Informant in the Library.</p>';
    h += slots.length ? '<div class="opts">' + slots.map(s => `<button data-route="${s}" class="${U.routeView.has(s) ? 'on' : ''}">${esc(slotLabel(s))}<small>${U.routeView.has(s) ? 'shown on map' : 'tap to show'}</small></button>`).join('') + '</div>' : '<p class="muted">No routes bought yet.</p>';
    h += `<p class="hint" style="margin-top:10px">Camera map: ${p.intel.cams ? 'known' : 'not bought'}. Corrupt guards: ${p.intel.corrupt ? 'known (green dot = takes bribes)' : 'not bought'}.</p>`;
    h += `<p class="hint">Alarm-off bribes: ${p.alarmOff.size ? [...p.alarmOff].map(slotLabel).join(', ') : 'none'}.</p>`;
  } else {
    const seen = w.log.filter(l => logVisible(l, p)).slice(-40).reverse();
    h += '<div class="log">' + (seen.map(l => `<p class="l-${l.kind}"><em>R${l.round}</em> ${esc(l.text)}</p>`).join('') || '<p class="muted">Nothing yet.</p>') + '</div>';
  }
  $('panel-body').innerHTML = h;
  $('endturn').disabled = !myTurn; $('endturn').textContent = myTurn ? (p.ap > 0 ? 'End turn (' + p.ap + ' AP left)' : 'End turn') : 'Not your turn';
}
function logVisible(l, p) {
  if (l.pid === p.id || (l.pid == null && l.x == null)) return true; if (l.pid != null && l.pid !== p.id) return false;
  if (l.kind === 'strike' || l.kind === 'escape' || l.kind === 'alert') return true;
  return l.x != null && U.vis.has(l.x + ',' + l.y);
}
function renderCover() {
  const w = U.w, c = $('cover'); c.hidden = !(U.cover && !w.over); if (c.hidden) return;
  const p = me(); c.innerHTML = `<div class="coverbox"><span class="lbl">${p.pending ? 'A guard has stopped' : 'Hand the device to'}</span><h2 style="color:${p.color}">${esc(p.name)}</h2><p class="muted">${esc(timeOf(w).wd)} ${esc(timeOf(w).name)}, round ${w.round}. Eyes only. Others look away.</p><button id="ready" class="primary">I'm ready</button></div>`;
}
function renderMenu() {
  const m = $('movemenu'), t = U.menuTile; if (!t || U.cover || U.modal || U.paused) { m.hidden = true; return; }
  const w = U.w, p = me(), mo = U.moveOpts.find(o => o.x === t.x && o.y === t.y), ro = U.runOpts.find(o => o.x === t.x && o.y === t.y);
  if (!mo && !ro) { m.hidden = true; return; }
  const sx = (t.x - U.cx) * U.zoom + U.W / 2 + U.zoom / 2, sy = (t.y - U.cy) * U.zoom + U.H / 2;
  m.hidden = false; m.style.left = Math.max(8, Math.min(U.W - 190, sx - 90)) + 'px'; m.style.top = Math.max(8, Math.min(U.H - 130, sy - 110)) + 'px';
  const r = restricted(w, p, t);
  m.innerHTML = `<b>${esc(t.name)}</b> <span class="tag ${r ? 'bad' : 'good'}">${r ? 'restricted' : 'allowed'}</span>` + (mo && mo.locked ? `<p class="muted">${esc(mo.why)}</p>` :
    `<div class="mrow">${mo ? `<button data-mv="0" ${p.ap < 1 ? 'disabled' : ''}>Move <small>1 AP</small></button><button data-mv="1" ${p.ap < 2 ? 'disabled' : ''}>Sneak <small>2 AP</small></button>` : ''}${ro ? `<button data-mv="2" ${p.ap < 2 ? 'disabled' : ''}>Run <small>2 AP, loud</small></button>` : ''}</div>`);
}
function offerBtns(list, attr, p) { return '<div class="opts">' + list.map(o => `<button ${attr}="${o.k}" ${(p.items.cigs || 0) < o.amount ? 'disabled' : ''}>${esc(o.label)}<small>${o.amount} C</small></button>`).join('') + '</div>'; }
function renderModal() {
  const el = $('modal'), w = U.w, p = me(); let mo = U.modal;
  if (U.cover || U.paused) { el.hidden = true; return; }
  if (p.pending) mo = { type: 'pending' };
  if (!mo) { el.hidden = true; return; }
  el.hidden = false; let h = '';
  if (mo.type === 'pending') {
    const d = confrontData(w, p), pd = p.pending;
    if (pd.type === 'confront') {
      const sus = d.kind && /trespass|running|stealing|dealing|bribe|lingering/.test(d.kind);
      h = `<div class="mhead"><b>${esc(d.guard)} stops you</b></div><p class="muted" style="margin:0">Reason: ${esc(d.kind)}. <span class="mark ${sus ? 'sus' : 'dan'}">${sus ? '?' : '!'}</span> ${sus ? 'Cooperating costs your contraband but no strike.' : 'He treats you as dangerous: cooperating means a strike.'}</p>
        <h4>Your move</h4><button class="row" data-res="cooperate"><span>Cooperate <small>Let him search you</small></span></button>
        <h4>Pay him off (${d.price} C normal)</h4>${offerBtns(d.offers, 'data-resbribe', p)}
        <button class="row" data-res="attack"><span>Attack ${esc(d.guard)} <small>Weapon: ${weaponOf(p).id}. Risky.</small></span></button>
        <button class="row" data-res="run"><span>Run for it <small>Roll to break away. He keeps chasing.</small></span></button>`;
    } else if (pd.type === 'counter') {
      h = `<div class="mhead"><b>Counteroffer</b></div><p style="margin:0">The guard wants <b>${pd.price} cigarettes</b>. You have ${p.items.cigs || 0}.</p><button class="row" data-res="pay" ${(p.items.cigs || 0) < pd.price ? 'disabled' : ''}><span>Pay ${pd.price} C</span></button><button class="row" data-res="refuse"><span>Refuse <small>He may walk away or report you</small></span></button>`;
    } else {
      const n = w.npcs.find(n => n.id === pd.nid);
      h = `<div class="mhead"><b>${esc(n ? n.name : 'An inmate')} saw you</b></div><p style="margin:0">He wants <b>${pd.amount} cigarettes</b> to keep quiet. He might sell you out anyway.</p><button class="row" data-res="pay" ${(p.items.cigs || 0) < pd.amount ? 'disabled' : ''}><span>Pay ${pd.amount} C</span></button><button class="row" data-res="refuse"><span>Refuse <small>Risky: he may go to the guards</small></span></button>`;
    }
  } else if (mo.type === 'shop') {
    const s = shopFor(w, p); if (!s) { U.modal = null; el.hidden = true; return; }
    h = `<div class="mhead"><b>${esc(s.name)}</b><span class="cigs"><u>C</u> ${p.items.cigs || 0}</span></div>`;
    if (s.sells) h += '<h4>Buy</h4>' + (s.sells.map(x => `<button class="row" data-buy="${x.item}" ${(p.items.cigs || 0) < x.price ? 'disabled' : ''}><span>${esc(ITEMS[x.item].name)} <small>${esc(ITEMS[x.item].desc)}</small></span><b>${x.price} C</b></button>`).join('') || '<p class="muted">Nothing for sale.</p>');
    if (s.buys && s.buys.length) h += '<h4>Sell</h4>' + s.buys.map(x => `<button class="row" data-sell="${x.item}"><span>${esc(ITEMS[x.item].name)} <em>x${x.qty}</em></span><b>+${x.price} C</b></button>`).join('');
    if (s.intel) h += '<h4>Intel</h4>' + s.intel.map(x => `<button class="row" data-intel="${x.kind}" ${(p.items.cigs || 0) < x.price ? 'disabled' : ''}><span>${esc(x.label)}</span><b>${x.price} C</b></button>`).join('');
    if (s.slots) { h += `<h4>Guard patrol routes (${CFG.ROUTE_PRICE} C each)</h4>`; for (let d = 0; d < 7; d++) h += `<div class="lbl" style="margin:8px 0 4px">${CFG.DAYS[d]}</div><div class="opts">` + s.slots.slice(d * 4, d * 4 + 4).map(x => `<button data-buyroute="${x.slot}" ${x.owned || (p.items.cigs || 0) < x.price ? 'disabled' : ''}>${esc(x.label.split(' ').slice(1).join(' '))}<small>${x.owned ? 'owned' : x.price + ' C'}</small></button>`).join('') + '</div>'; }
    h += '<button class="primary" data-close="1">Done</button>';
  } else if (mo.type === 'stash') {
    const d = stashData(w, p), line = (it, n, dir) => `<div class="row"><span>${esc(ITEMS[it].name)} <em>x${n}</em></span><span class="giverow"><button data-stash="${dir}|${it}|1">1</button>${n > 1 ? `<button data-stash="${dir}|${it}|${n}">all</button>` : ''}</span></div>`;
    h = '<div class="mhead"><b>Your stash</b></div><p class="muted" style="margin:0;font-size:12.5px">Only you can open it. If you get strike 1 everything in it is confiscated.</p><h4>Stored</h4>' + (Object.entries(d.stash).map(([i, n]) => line(i, n, 'out')).join('') || '<p class="muted">Empty.</p>') + '<h4>Carrying</h4>' + (Object.entries(d.carry).filter(([i]) => i !== 'cigs').map(([i, n]) => line(i, n, 'in')).join('') || '<p class="muted">Nothing to store.</p>') + '<button class="primary" data-close="1">Done</button>';
  } else if (mo.type === 'give') {
    const others = playersAt(w, p.x, p.y, p.id);
    h = '<div class="mhead"><b>Give an item</b></div>' + others.map(q => `<h4 style="color:${q.color}">${esc(q.name)}</h4><div class="giverow">` + Object.entries(p.items).map(([i, n]) => `<button data-give="${q.id}|${i}|1">${esc(ITEMS[i].name)} x1</button>` + (n > 1 ? `<button data-give="${q.id}|${i}|${n}">all ${n}</button>` : '')).join('') + '</div>').join('') + '<button class="primary" data-close="1">Cancel</button>';
  } else if (mo.type === 'bribe') {
    const d = bribeData(w, p, mo.gid); if (!d) { U.modal = null; el.hidden = true; return; }
    mo.purpose = mo.purpose || 'blind'; mo.phase = mo.phase || 'night'; mo.offer = mo.offer || 'fair'; const pu = d.purposes.find(x => x.k === mo.purpose);
    h = `<div class="mhead"><b>Bribe ${esc(d.name)}</b><span class="cigs"><u>C</u> ${p.items.cigs || 0}</span></div>${d.known ? `<p class="muted" style="margin:0">${d.corrupt ? 'Known to take bribes.' : 'Honest. He will arrest you for trying!'}</p>` : '<p class="muted" style="margin:0">You do not know if he takes bribes. A refusal may cost a strike.</p>'}
      <h4>What for?</h4><div class="opts">${d.purposes.map(x => `<button data-bp="${x.k}" class="${mo.purpose === x.k ? 'on' : ''}">${esc(x.label)}<small>about ${x.price} C</small></button>`).join('')}</div><p class="muted" style="margin:4px 0 0;font-size:12.5px">${esc(pu.desc)}</p>`;
    if (mo.purpose === 'alarm') h += '<h4>Which time of day?</h4><div class="opts">' + d.phases.map(x => `<button data-bph="${x.id}" class="${mo.phase === x.id ? 'on' : ''}">${esc(x.name)}</button>`).join('') + '</div>';
    h += '<h4>Your offer</h4><div class="opts">' + pu.offers.map(o => `<button data-bo="${o.k}" class="${mo.offer === o.k ? 'on' : ''}" ${(p.items.cigs || 0) < o.amount ? 'disabled' : ''}>${esc(o.label)}<small>${o.amount} C</small></button>`).join('') + '</div>';
    h += '<p class="muted" style="font-size:12.5px;margin:6px 0 0">Low offers may be refused or countered. Other guards who watch you do it get suspicious.</p><button class="primary" data-dobribe="1">Offer the bribe (1 AP)</button><button class="ghost" data-close="1">Cancel</button>';
  } else if (mo.type === 'hire') {
    const rooms = w.map.rooms.filter(r => ['common', 'dining', 'court', 'showers', 'library', 'workshop', 'laundry', 'kitchen'].includes(r.type)); mo.rid = mo.rid === undefined ? rooms[0].id : mo.rid; mo.phase = mo.phase || 'day';
    const n = w.npcs.find(n => n.id === mo.nid);
    h = `<div class="mhead"><b>Hire ${esc(n ? n.name : 'inmate')}</b><span class="cigs"><u>C</u> ${p.items.cigs || 0}</span></div><p class="muted" style="margin:0">8 cigarettes. He starts a brawl in the place and time you choose. Guards rush to it, leaving other posts thin.</p>
      <h4>Where?</h4><div class="opts">${rooms.map(r => `<button data-hr="${r.id}" class="${mo.rid === r.id ? 'on' : ''}">${esc(r.name)}</button>`).join('')}</div>
      <h4>When?</h4><div class="opts">${CFG.PHASES.filter(x => x.id !== 'night').map(x => `<button data-hp="${x.id}" class="${mo.phase === x.id ? 'on' : ''}">${esc(x.name)}<small>${esc(slotLabel(nextSlot(w, x.id)))}</small></button>`).join('')}</div>
      <button class="primary" data-dohire="1" ${(p.items.cigs || 0) < 8 ? 'disabled' : ''}>Pay 8 C</button><button class="ghost" data-close="1">Cancel</button>`;
  }
  el.innerHTML = '<div class="msheet">' + h + '</div>';
}
function renderTips() {
  const el = $('tips'); el.hidden = !U.tipsOpen || U.cover; if (el.hidden) return;
  el.innerHTML = '<h4>What to do next</h4><ul>' + getTips(U.w, me()).map(t => `<li>${esc(t)}</li>`).join('') + '</ul>';
}
function showOver() {
  const w = U.w, r = w.result, o = $('over'); o.hidden = false; let title, sub;
  if (r.type === 'race') { title = w.players[r.winner].name + ' is free'; sub = 'First over the wall in round ' + w.round + '.'; }
  else if (r.type === 'full') { title = 'Everyone made it out'; sub = 'A clean break in ' + w.round + ' rounds.'; }
  else if (r.type === 'partial') { title = r.escaped.length + ' of ' + w.players.length + ' escaped'; sub = 'The rest are in the high security block.'; }
  else { title = 'Transferred. All of you.'; sub = 'Three strikes. The prison wins this time.'; }
  AUDIO.sfx(r.type === 'lost' ? 'lose' : 'win');
  o.innerHTML = `<div class="overbox"><span class="lbl">Round ${w.round} / seed ${w.seed}</span><h2>${esc(title)}</h2><p>${esc(sub)}</p><div class="results">${w.players.map(p => `<div><b style="color:${p.color}">${esc(p.name)}</b> <span>${esc(p.status)}</span> <span>${p.strikes} strike${p.strikes === 1 ? '' : 's'}</span></div>`).join('')}</div>
   <div class="btns"><button id="again" class="primary">Same prison again</button><button id="newgame">Main menu</button></div></div>`;
}

// ---------- events ----------
function openPause(v) { if (v) { saveNow(); $('p-savemsg').textContent = U.saveOk ? 'Progress is saved automatically on this device.' : 'Saving is not available in this browser, so progress will be lost when you close the page.'; } U.paused = v; $('pause').hidden = !v; $('p-howbox').hidden = true; if (v) AUDIO.sfx('ui'); renderMenu(); renderModal(); }
function openSettings(v) { const s = AUDIO.state; $('settings').hidden = !v; if (v) { $('a-mute').checked = s.muted; $('a-music').value = Math.round(s.music * 100); $('a-sfx').value = Math.round(s.sfx * 100); } }
function resolve(c, offer) {
  const p = me(), r = A({ t: 'resolve', c, offer }); toast(r.msg, !r.ok); AUDIO.sfx(c === 'attack' ? 'hit' : c === 'pay' || c === 'bribe' ? 'coin' : 'ui'); afterTurnChange();
}
document.addEventListener('pointerdown', () => AUDIO.init(), { once: true });
document.addEventListener('click', e => {
  const t = e.target; AUDIO.init();
  const b = t.closest('[data-n]'); if (b && !$('setup').hidden) { setup.n = +b.dataset.n; renderSetup(); return; }
  const df = t.closest('[data-diff]'); if (df) { setup.diff = df.dataset.diff; renderSetup(); return; }
  const m = t.closest('[data-mode]'); if (m) { setup.mode = m.dataset.mode; renderSetup(); return; }
  if (t.closest('#m-new')) { showScreen('setup'); renderSetup(); return; }
  if (t.closest('#m-resume')) { if (U.w && !U.w.over) { showScreen('game'); resizeCanvas(); refresh(false); renderAll(); } else if (!loadSave()) toast('The save could not be loaded.', true); return; }
  if (t.closest('#m-how')) { $('how').hidden = !$('how').hidden; return; }
  if (t.closest('#m-set') || t.closest('#p-set')) { openSettings(true); return; }
  if (t.closest('#a-close')) { openSettings(false); renderAll(); return; }
  if (t.closest('#s-back')) { showScreen('menu'); return; }
  if (t.closest('#start')) { startGame(); return; }
  if (t.closest('#pausebtn')) { openPause(true); return; }
  if (t.closest('#p-resume')) { openPause(false); return; }
  if (t.closest('#p-how')) { const hb = $('p-howbox'); hb.innerHTML = $('how').innerHTML; hb.className = 'phow'; hb.hidden = !hb.hidden; return; }
  if (t.closest('#p-restart')) { openPause(false); startGame(); return; }
  if (t.closest('#p-quit')) { openPause(false); showScreen('menu'); return; }
  if (t.closest('#mutebtn')) { AUDIO.setMuted(!AUDIO.state.muted); renderAll(); return; }
  if (t.closest('#tipbtn')) { U.tipsOpen = !U.tipsOpen; renderTips(); return; }
  if (U.paused || !U.w || $('game').hidden) return;
  if (t.closest('#ready')) { U.cover = false; refresh(true); renderAll(); pumpNotes(); return; }
  const tab = t.closest('[data-tab]'); if (tab) { U.tab = tab.dataset.tab; renderPanel(); return; }
  const rt = t.closest('[data-route]'); if (rt) { const s = rt.dataset.route; U.routeView.has(s) ? U.routeView.delete(s) : U.routeView.add(s); refresh(false); renderPanel(); return; }
  const rs = t.closest('[data-res]'); if (rs) { resolve(rs.dataset.res); return; }
  const rb = t.closest('[data-resbribe]'); if (rb) { resolve('bribe', rb.dataset.resbribe); return; }
  const ab = t.closest('.act'); if (ab) {
    const a = U.acts[+ab.dataset.i]; if (!a) return;
    if (!a.enabled) { toast(a.why || 'Not available.', true); AUDIO.sfx('ui'); return; }
    if (a.ui === 'shop') { const r = doAct(a.a); if (r && r.ok) { U.modal = { type: 'shop' }; renderAll(); } return; }
    if (a.ui === 'stash') { const r = doAct(a.a); if (r && r.ok) { U.modal = { type: 'stash' }; renderAll(); } return; }
    if (a.ui === 'give') { U.modal = { type: 'give' }; renderModal(); return; }
    if (a.ui === 'bribe') { U.modal = { type: 'bribe', gid: a.gid }; renderModal(); return; }
    if (a.ui === 'hire') { U.modal = { type: 'hire', nid: a.nid }; renderModal(); return; }
    doAct(a.a); return;
  }
  if (t.closest('#endturn')) { doAct({ t: 'end' }); return; }
  const mv = t.closest('[data-mv]'); if (mv && U.menuTile) { const o = U.menuTile, k = mv.dataset.mv; doAct(k === '2' ? { t: 'run', x: o.x, y: o.y } : { t: 'move', x: o.x, y: o.y, sneak: k === '1' }); return; }
  const by = t.closest('[data-buy]'); if (by) { const r = A({ t: 'buy', item: by.dataset.buy }); toast(r.msg, !r.ok); AUDIO.sfx(r.ok ? 'coin' : 'ui'); renderAll(); return; }
  const sl = t.closest('[data-sell]'); if (sl) { const r = A({ t: 'sell', item: sl.dataset.sell }); toast(r.msg, !r.ok); AUDIO.sfx(r.ok ? 'coin' : 'ui'); renderAll(); return; }
  const it = t.closest('[data-intel]'); if (it) { const r = A({ t: 'intel', kind: it.dataset.intel }); toast(r.msg, !r.ok); AUDIO.sfx(r.ok ? 'coin' : 'ui'); refresh(false); renderAll(); return; }
  const br = t.closest('[data-buyroute]'); if (br) { const r = A({ t: 'route', slot: br.dataset.buyroute }); toast(r.msg, !r.ok); AUDIO.sfx(r.ok ? 'coin' : 'ui'); if (r.ok) U.routeView.add(br.dataset.buyroute); refresh(false); renderAll(); return; }
  const st = t.closest('[data-stash]'); if (st) { const [dir, item, qty] = st.dataset.stash.split('|'); const r = A({ t: 'stashmove', dir, item, qty: +qty }); if (!r.ok) toast(r.msg, true); AUDIO.sfx('click'); renderAll(); return; }
  const gv = t.closest('[data-give]'); if (gv) { const [to, item, qty] = gv.dataset.give.split('|'); U.modal = null; doAct({ t: 'give', to: +to, item, qty: +qty }); return; }
  const bp = t.closest('[data-bp]'); if (bp && U.modal) { U.modal.purpose = bp.dataset.bp; renderModal(); return; }
  const bph = t.closest('[data-bph]'); if (bph && U.modal) { U.modal.phase = bph.dataset.bph; renderModal(); return; }
  const bo = t.closest('[data-bo]'); if (bo && U.modal) { U.modal.offer = bo.dataset.bo; renderModal(); return; }
  if (t.closest('[data-dobribe]') && U.modal) { const m = U.modal; U.modal = null; doAct({ t: 'bribe', gid: m.gid, purpose: m.purpose, offer: m.offer, phase: m.phase }); return; }
  const hr = t.closest('[data-hr]'); if (hr && U.modal) { U.modal.rid = +hr.dataset.hr; renderModal(); return; }
  const hp = t.closest('[data-hp]'); if (hp && U.modal) { U.modal.phase = hp.dataset.hp; renderModal(); return; }
  if (t.closest('[data-dohire]') && U.modal) { const m = U.modal; U.modal = null; doAct({ t: 'hire', nid: m.nid, rid: m.rid, phase: m.phase }); return; }
  if (t.closest('[data-close]') || t.id === 'modal') { if (!me().pending) { U.modal = null; renderModal(); renderPanel(); } return; }
  if (t.closest('#again')) { startGame(); return; }
  if (t.closest('#newgame')) { U.w = null; setup.seed = Math.floor(Math.random() * 1e6); showScreen('menu'); return; }
  if (t.closest('#zin')) { U.zoom = Math.min(120, U.zoom * 1.2); renderMenu(); return; }
  if (t.closest('#zout')) { U.zoom = Math.max(26, U.zoom / 1.2); renderMenu(); return; }
  if (t.closest('#zhome')) { refresh(true); renderMenu(); return; }
});
$('shared').addEventListener('change', e => { setup.shared = e.target.checked; });
$('seed').addEventListener('input', e => { setup.seed = parseInt(e.target.value, 10) || 0; });
$('reseed').addEventListener('click', () => { setup.seed = Math.floor(Math.random() * 1e6); $('seed').value = setup.seed; });
$('names').addEventListener('input', e => { if (e.target.id && e.target.id.startsWith('nm')) setup[e.target.id] = e.target.value; });
$('a-mute').addEventListener('change', e => { AUDIO.setMuted(e.target.checked); renderAll(); });
$('a-music').addEventListener('input', e => AUDIO.setMusic(+e.target.value / 100));
$('a-sfx').addEventListener('input', e => { AUDIO.setSfx(+e.target.value / 100); });
$('a-sfx').addEventListener('change', () => AUDIO.sfx('coin'));

// ---------- canvas input ----------
const cv = $('cv'), ctx = cv.getContext('2d');
function resizeCanvas() {
  const r = $('stage').getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
  U.W = Math.max(100, r.width); U.H = Math.max(100, r.height); cv.width = U.W * d; cv.height = U.H * d; cv.style.width = U.W + 'px'; cv.style.height = U.H + 'px'; U.dpr = d;
}
window.addEventListener('resize', () => { resizeCanvas(); renderMenu(); });
if (window.ResizeObserver) new ResizeObserver(() => { resizeCanvas(); }).observe($('stage'));
const ptrs = new Map(); let drag = null, pinch = null;
const tileFromScreen = (px, py) => tileAt(U.w.map, Math.floor((px - U.W / 2) / U.zoom + U.cx), Math.floor((py - U.H / 2) / U.zoom + U.cy));
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); const r = cv.getBoundingClientRect(); ptrs.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
  if (ptrs.size === 1) drag = { sx: e.clientX, sy: e.clientY, cx: U.cx, cy: U.cy, moved: false }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: U.zoom }; drag = null; } });
cv.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; const r = cv.getBoundingClientRect(); ptrs.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; U.zoom = Math.max(26, Math.min(120, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); renderMenu(); return; }
  if (drag) { const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true; if (drag.moved) { U.cx = drag.cx - dx / U.zoom; U.cy = drag.cy - dy / U.zoom; U.follow = false; U.menuTile = null; renderMenu(); } } });
cv.addEventListener('pointerup', e => { const r = cv.getBoundingClientRect(); ptrs.delete(e.pointerId); if (pinch && ptrs.size < 2) { pinch = null; return; }
  if (drag && !drag.moved && !U.cover && !U.paused) { const t = tileFromScreen(e.clientX - r.left, e.clientY - r.top); handleTap(t); } drag = null; });
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); U.zoom = Math.max(26, Math.min(120, U.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); renderMenu(); }, { passive: false });
function handleTap(t) {
  U.sel = t; U.menuTile = null;
  if (t && (U.moveOpts.some(o => o.x === t.x && o.y === t.y) || U.runOpts.some(o => o.x === t.x && o.y === t.y))) U.menuTile = t;
  else if (t) { const k = tkey(t); if (U.vis.has(k) || U.mem.has(k)) toast(t.name + (restricted(U.w, me(), t) ? ' (restricted)' : ' (allowed)') + (tileLit(U.w, t) ? ', lit' : ', dark')); }
  renderMenu(); if (U.tab === 'pack') renderPanel();
}
window.addEventListener('pagehide', () => saveNow()); document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('keydown', e => {
  if (!U.w || (e.target && e.target.tagName === 'INPUT')) return;
  if (e.key === 'Escape') { if (!$('settings').hidden) { openSettings(false); return; } if (!$('game').hidden) { openPause(!U.paused); } return; }
  if ($('game').hidden || U.cover || U.paused || U.w.over || me().pending) return;
  if (e.key === '?') { U.tipsOpen = !U.tipsOpen; renderTips(); return; }
  const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, p = me();
  if (map[k]) { e.preventDefault(); const t = tileAt(U.w.map, p.x + map[k][0], p.y + map[k][1]); if (t && U.moveOpts.some(o => o.x === t.x && o.y === t.y && !o.locked)) doAct({ t: 'move', x: t.x, y: t.y, sneak: e.shiftKey }); }
  else if (k === 'e') doAct({ t: 'end' }); else if (k === 'h') doAct({ t: 'hide' }); else if (k === 'f') doAct({ t: 'loot' });
});

// ---------- loop ----------
const FXSND = { gunshot: 'shot', fighting: 'hit', alarm: 'alarm', brawl: 'hit', shouting: 'hit', snapping: 'click', scuffle: 'hit' };
function frame(now) {
  requestAnimationFrame(frame);
  if (!U.w || $('game').hidden) return;
  const w = U.w, p = me();
  for (const f of w.fx) if (!U.fxSeen.has(f)) { U.fxSeen.add(f); if (f.round < w.round - 1) continue; const k = f.x + ',' + f.y, near = U.vis.has(k) || p.heard.some(h => h.x === f.x && h.y === f.y);
    if (near) { U.rip.push({ x: f.x, y: f.y, r: f.r, t0: now }); if (FXSND[f.label]) AUDIO.sfx(FXSND[f.label]); } }
  if (U.rip.length > 20) U.rip.splice(0, U.rip.length - 20);
  if (U.follow && !drag) { U.cx += (p.x + 0.5 - U.cx) * 0.18; U.cy += (p.y + 0.5 - U.cy) * 0.18; }
  const d = U.dpr || 1; ctx.setTransform(d, 0, 0, d, 0, 0);
  if (U.cover) { ctx.clearRect(0, 0, U.W, U.H); return; }
  drawGame(ctx, U, now);
}
renderSetup(); showScreen('menu'); requestAnimationFrame(frame);
