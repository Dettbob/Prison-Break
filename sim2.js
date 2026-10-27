const fs=require('fs'),vm=require('vm');
const files=['data','mapgen','engine1','engine2','engine2b','engine3','engine4','engine5'];
const code=files.map(f=>fs.readFileSync('src/'+f+'.js','utf8')).join('\n')+'\n;globalThis.__e={newWorld,act,getActions,moveOptions,runOptions,CFG,timeOf,tileAt,continueGuards,getTips,confrontData,shopFor,bribeData};';
vm.runInThisContext(code);
const E=globalThis.__e;
function pend(w,p,r){ const pd=p.pending; if(!pd) return;
  const cs=pd.type==='confront'?['cooperate','bribe','attack','run']:pd.type==='counter'?['pay','refuse']:['pay','refuse'];
  const c=cs[Math.floor(r()*cs.length)]; const res=E.act(w,p.id,{t:'resolve',c,offer:'fair'}); if(!res.ok&&p.pending){ p.pending&&E.act(w,p.id,{t:'resolve',c:pd.type==='confront'?'cooperate':'refuse'}); } }
function bot(w,p,r){
  let guard=0;
  while(w.phase==='players'&&w.cur===p.id&&!w.over&&guard++<12){
    if(p.pending){ pend(w,p,r); continue; }
    if(p.ap<=0) break;
    const acts=E.getActions(w,p).filter(a=>a.enabled&&a.ui!=='shop'&&a.ui!=='stash'&&a.ui!=='give'&&a.ui!=='hire'&&a.ui!=='bribe');
    const mv=E.moveOptions(w,p).filter(m=>!m.locked);
    const roll=r(); let res;
    const prio=acts.filter(a=>/^(loot|salvage|escape|cutfence|hack|unlock|key_|craft|work|dummy|sleep)/.test(a.id));
    if(prio.length&&roll<0.5) res=E.act(w,p.id,prio[Math.floor(r()*prio.length)].a);
    else if(acts.length&&roll<0.6){ res=E.act(w,p.id,acts[Math.floor(r()*acts.length)].a);}
    else if(mv.length&&roll<0.9){ const m=mv[Math.floor(r()*mv.length)]; res=E.act(w,p.id,{t:'move',x:m.x,y:m.y,sneak:r()<0.3}); }
    else { const ro=E.runOptions(w,p); if(ro.length&&r()<0.5) res=E.act(w,p.id,{t:'run',x:ro[0].x,y:ro[0].y}); else res=E.act(w,p.id,{t:'end'}); }
    if(res&&!res.ok&&r()<0.4) E.act(w,p.id,{t:'end'});
  }
}
const N=+process.argv[2]||40; let st={games:0,over:0,rounds:0,esc:0,err:0,pend:0};
for(let s=1;s<=N;s++){
  const n=1+(s%4); let w;
  try{ w=E.newWorld({seed:s*977,players:n,mode:s%5===0?'race':'coop'});
    const r=require('./rng')(s);
    let it=0;
    while(!w.over&&it++<900){
      if(w.paused){ const p=w.players[w.paused.pid]; if(p.pending) pend(w,p,r); else {w.paused=null;} if(!p.pending) E.continueGuards(w); continue; }
      const p=w.players[w.cur]; if(!p||w.phase!=='players'){ E.continueGuards(w); continue; }
      bot(w,p,r);
      if(w.cur===p.id&&w.phase==='players'&&!w.over&&!p.pending&&p.ap>0) E.act(w,p.id,{t:'end'});
    }
    E.getTips(w,w.players[0]);
    st.games++; if(w.over)st.over++; st.rounds+=w.round; st.esc+=w.players.filter(p=>p.status==='escaped').length;
  }catch(e){ st.err++; if(st.err<=3) console.log('ERR seed',s,e.stack.split('\n').slice(0,4).join('\n')); }
}
console.log(st);
