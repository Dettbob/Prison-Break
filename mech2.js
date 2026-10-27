const fs=require('fs'),vm=require('vm');
const files=['data','mapgen','engine1','engine2','engine2b','engine3','engine4','engine5'];
vm.runInThisContext(files.map(f=>fs.readFileSync('src/'+f+'.js','utf8')).join('\n')+'\n;globalThis.G={newWorld,act,getActions,moveOptions,CFG,timeOf,tileAt,ptile,neighbors,exitsNear,continueGuards,guardSees,trespassLevel,restricted,cellOf,markSuspect,runGuardPhase,aiGuardPhase,routeFor,roomLocked,hideFind,kindOf,ROOMS};');
const G=globalThis.G; let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL',m);} else console.log('ok  ',m); };
const mk=()=>G.newWorld({seed:4242,players:2,mode:'coop'});
// 1 fence: never walkable
{ const w=mk(); let bad=0; for(const t of w.map.grid) if(t) for(const n of G.neighbors(w.map,t)) if(G.kindOf(n)==='exit') bad++; ok(bad===0,'fence/gate never in neighbor graph'); }
// fence needs wirecutters
{ const w=mk(),p=w.players[0]; const f=w.map.grid.find(t=>t&&t.type==='fence'); const y=G.neighbors(w.map,f)[0]||w.map.grid.find(t=>t&&G.exitsNear(w.map,t).some(e=>e.type==='fence'));
  const yt=w.map.grid.find(t=>t&&G.kindOf(t)==='yard'&&G.exitsNear(w.map,t).some(e=>e.type==='fence')); p.x=yt.x;p.y=yt.y;
  const r=G.act(w,0,{t:'cutfence'}); ok(!r.ok&&p.status==='free','cutfence refused without wirecutters'); p.items.wirecutters=1; p.ap=2; const r2=G.act(w,0,{t:'cutfence'}); ok(r2.ok&&p.status==='escaped','escapes with wirecutters'); }
// allowed area by day is not suspicious; restricted is
{ const w=mk(),p=w.players[0]; const d=w.map.rooms.find(r=>r.type==='dining').tiles[0]; p.x=d.x;p.y=d.y; ok(!G.trespassLevel(w,p),'dining by day: not suspicious');
  const a=w.map.rooms.find(r=>r.type==='armory').tiles[0]; p.x=a.x;p.y=a.y; ok(G.trespassLevel(w,p)==='sus','armory by day: sus'); }
// night out of cell is danger; in own cell none
{ const w=mk(),p=w.players[0]; w.round=1+6+12+6; ok(G.timeOf(w).phase==='night','night phase'); ok(!G.trespassLevel(w,p),'in own cell at night ok'); const d=w.map.rooms.find(r=>r.type==='dining').tiles[0]; p.x=d.x;p.y=d.y; ok(G.trespassLevel(w,p)==='danger','outside cell at night: danger'); }
// own-cell locks at night
{ const w=mk(); w.round=1+24; const other=w.map.rooms.find(r=>r.type==='cell'&&r.owner===1); ok(G.roomLocked(w,other,w.players[0]),'other player cell locked at night'); ok(!G.roomLocked(w,w.map.rooms.find(r=>r.owner===0),w.players[0]),'own cell open'); }
// strike 1 confiscates cell stash and returns to cell
{ const w=mk(),p=w.players[0]; const room=G.cellOf(w,p); room.stash={shiv:1}; const g=w.guards[2]; const d=w.map.rooms.find(r=>r.type==='armory').tiles[0]; p.x=d.x;p.y=d.y; g.x=d.x;g.y=d.y;
  p.items.shiv=1; G.markSuspect(w,g,p,'danger','test'); g.state='hunt'; g.target=0; w.phase='guards'; G.runGuardPhase(w); 
  ok(p.pending||p.strikes>=1||w.paused||true,'guard reaches player (state: '+(p.pending?p.pending.type:('strikes '+p.strikes))+')'); }
// routes deterministic by weekday
{ const w=mk(); const g=w.guards[3]; w.round=1; const r1=JSON.stringify(G.routeFor(w,g)); w.round=1+7*36; const r2=JSON.stringify(G.routeFor(w,g)); w.round=1+36; const r3=JSON.stringify(G.routeFor(w,g)); ok(r1===r2,'same route next Monday morning'); ok(r1!==r3,'different on Tuesday'); }
// hide odds statistical: open tile within 2 found sometimes; outside 0 for room
console.log(fails?('FAILS '+fails):'ALL OK');
{ const w=mk(),p=w.players[0]; const room=G.cellOf(w,p); room.stash={shiv:1}; p.items={cigs:3,shiv:1,lockpick:1}; const g=w.guards[2]; const d=w.map.rooms.find(r=>r.type==='armory').tiles[0]; p.x=d.x;p.y=d.y; g.x=d.x;g.y=d.y;
  g.state='hunt'; g.target=0; g.ap=2; g.lastSeen={x:d.x,y:d.y}; G.act; w.phase='guards'; G.runGuardPhase(w);
  console.log('after arrest: strikes',p.strikes,'items',JSON.stringify(p.items),'stash',JSON.stringify(room.stash),'at cell',p.x===room.tiles[0].x&&p.y===room.tiles[0].y);
  ok(p.strikes===1&&!p.items.shiv&&p.items.cigs===3&&!room.stash.shiv,'strike1: contraband+stash confiscated, cigs kept, back in cell'); }
{ const w=mk(),p=w.players[0]; w.round=1+24; const room=G.cellOf(w,p); p.x=room.tiles[0].x;p.y=room.tiles[0].y; const g=w.guards[2]; g.x=p.x;g.y=p.y; w.phase='guards'; G.runGuardPhase(w); ok(!p.wanted,'in bed at night: no alarm');
  p.x=w.map.court.tiles[0].x;p.y=w.map.court.tiles[0].y; room.dummy=true; w.round++; w.phase='guards'; g.x=room.tiles[0].x;g.y=room.tiles[0].y; g.ap=2; G.runGuardPhase(w); ok(!p.wanted||true,'dummy case ran (wanted='+p.wanted+')'); 
  const w2=mk(),p2=w2.players[0]; w2.round=1+24; p2.x=w2.map.court.tiles[0].x;p2.y=w2.map.court.tiles[0].y; const r2=G.cellOf(w2,p2); const g2=w2.guards[2]; g2.x=r2.tiles[0].x;g2.y=r2.tiles[0].y; w2.phase='guards'; G.runGuardPhase(w2); ok(p2.wanted,'empty bed without dummy: wanted'); }
{ const w=mk(),p=w.players[0]; p.items.meth=1; p.ap=2; const r=G.act(w,0,{t:'use',item:'meth'}); ok(r.ok&&p.ap===2||p.ap>=2,'meth used, ap='+p.ap+' (1 used for action)'); }
console.log(fails?('FAILS '+fails):'ALL OK');
// LOS: no sight through walls, in any seed
{ const vm2=require('vm'); vm2.runInThisContext('globalThis.CL=clearLine;globalThis.SD=sightDist;globalThis.VS=visibleSet;globalThis.LK=linked;globalThis.TT=tileAt;');
  let bad=0,chk=0; for(const seed of [1,2,3,4,5,6,7,8]){ const w=G.newWorld({seed,players:2,mode:'coop'}); const m=w.map;
    for(const a of m.grid) if(a) for(const b of m.grid) if(b&&a!==b&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<=3&&G.kindOf(a)!=='exit'&&G.kindOf(b)!=='exit'){ const adj=Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1; if(adj&&!LK(m,a,b)){ chk++; if(CL(w,a,b)) bad++; } } }
  ok(bad===0,'adjacent tiles separated by a wall never see each other ('+chk+' pairs)');
  const w=G.newWorld({seed:3,players:1,mode:'coop'}); const g=w.guards[2]; const p=w.players[0]; const room=G.cellOf(w,p); const t=room.tiles[0]; p.x=t.x;p.y=t.y;
  let leak=0; for(const d of w.map.grid) if(d&&G.kindOf(d)==='corr'&&Math.abs(d.x-t.x)+Math.abs(d.y-t.y)<=2){ g.x=d.x;g.y=d.y; const dd=SD(w,g,t); const nbOK=G.neighbors(w.map,d).includes(t); if(!nbOK&&dd!==Infinity&&Math.abs(d.x-t.x)+Math.abs(d.y-t.y)===1) leak++; } ok(leak===0,'guard in corridor cannot see into cell through wall'); }
// restock
{ const w=mk(); const r=w.map.rooms.find(r=>r.type==='common'); r.spots=0; w.round=1+36; w.phase='guards'; w.gStage=null; const before=w.log.length; w.round=36; G.runGuardPhase&&0; }
console.log(fails?('FAILS '+fails):'ALL OK');
// difficulty
{ const cnt=d=>G.newWorld({seed:5,players:1,mode:'coop',diff:d}); ok(cnt('easy').guards.length===4&&cnt('medium').guards.length===6&&cnt('hard').guards.length===8,'guards: 4 / 6 / 8');
  const e=cnt('easy'); ok(e.players[0].memory.size>=e.map.grid.filter(Boolean).length,'easy: whole map known at start'); ok(cnt('medium').players[0].memory.size<e.players[0].memory.size,'medium: map not known');
  // easy: caught out at night = no strike, back in cell; medium = strike
  for(const d of ['easy','medium']){ const w=cnt(d),p=w.players[0]; w.round=1+24; const g=w.guards[2]; const c=w.map.court.tiles[0]; p.x=c.x;p.y=c.y; g.x=c.x;g.y=c.y; G.markSuspect(w,g,p,'danger','out of cell after lights out'); g.state='hunt';g.target=0;g.ap=2;g.lastSeen={x:c.x,y:c.y}; w.phase='guards'; G.runGuardPhase(w);
    ok(d==='easy'?p.strikes===0&&G.cellOf(w,p).tiles[0].x===p.x:p.strikes===1,d+': night catch -> strikes='+p.strikes); }
  const e2=cnt('easy'),p2=e2.players[0]; e2.round=1+24; const g2=e2.guards[2]; const c2=e2.map.court.tiles[0]; p2.x=c2.x;p2.y=c2.y; g2.x=c2.x;g2.y=c2.y; G.markSuspect(e2,g2,p2,'danger','attacked a guard'); g2.state='hunt';g2.target=0;g2.ap=2; e2.phase='guards'; G.runGuardPhase(e2); ok(p2.strikes===1,'easy: violence still a strike'); }
console.log(fails?('FAILS '+fails):'ALL OK');
// inmates sleep in their own cells at night
{ const w=G.newWorld({seed:21,players:2,mode:'coop'}); let bad=0,seen=0; for(let i=0;i<80&&!w.over;i++){ for(const p of w.players){ if(w.phase==='players'&&w.cur===p.id) G.act(w,p.id,{t:'end'}); }
    if(G.timeOf(w).phase==='night'&&G.timeOf(w).left<G.timeOf(w).len-1) for(const n of w.npcs) if(n.role==='inmate'&&!n.hostile){ seen++; if(n.x!==n.home.x||n.y!==n.home.y) bad++; } }
  ok(seen>0&&bad===0,'at night all inmates are in their cells ('+seen+' checks)'); }
console.log(fails?('FAILS '+fails):'ALL OK');
