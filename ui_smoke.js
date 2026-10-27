const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('dist/three-strikes.html','utf8');
const js=html.split('<script>')[1].split('</script>')[0];
const ids=[...html.matchAll(/id="([\w-]+)"/g)].map(m=>m[1]);
const handlers={doc:{},win:{}};
function mkEl(id){const el={id,innerHTML:'',textContent:'',hidden:false,style:{},className:'',value:'',checked:true,disabled:false,dataset:{},children:[],
  addEventListener(t,f){(el._h=el._h||{})[t]=f;},getBoundingClientRect(){return{left:0,top:0,width:420,height:380};},setPointerCapture(){},
  appendChild(c){el.children.push(c);return c;},removeChild(c){el.children=el.children.filter(x=>x!==c);},remove(){},
  getContext(){const g={addColorStop(){}};return new Proxy({},{get:(t,k)=>k==='createRadialGradient'||k==='createLinearGradient'?()=>g:k==='measureText'?()=>({width:10}):(()=>{}),set:()=>true});},
  tagName:'DIV',width:0,height:0,classList:{add(){},remove(){}}};return el;}
const els={};ids.forEach(i=>els[i]=mkEl(i));
for(const i of ['over','how','cover','modal','movemenu','game','setup','pause','settings','tips','p-howbox','m-resume']) els[i].hidden=true;
const ctxObj={document:{getElementById:i=>els[i],createElement:()=>mkEl('x'),addEventListener(t,f){handlers.doc[t]=f;}},
 window:{addEventListener(t,f){handlers.win[t]=f;},devicePixelRatio:1},requestAnimationFrame(){},setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},console,Math,Set,Map,WeakSet,Object,Array,String,Number,JSON,Date,performance:{now:()=>Date.now()},
 localStorage:(()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem(k,v){m.set(k,String(v));},removeItem(k){m.delete(k);}};})()};
ctxObj.window.document=ctxObj.document;
const test=`
;(function(){
 let saves=0,errs=0,games=0,acts=0,overs=0,modals=0,pend=0;
 const tryf=(f,l)=>{try{f();}catch(e){errs++;console.log('UIERR',l,e.stack.split('\\n').slice(0,3).join(' | '));}};
 for(const n of [1,2,3,4]) for(const mode of ['coop','race']){
  setup.diff=['easy','medium','hard'][(n+(mode==='race'?1:0))%3];setup.n=n;setup.mode=mode;setup.seed=2000+n*13+(mode==='race'?5:0);
  tryf(()=>startGame(),'start'); renderAll();
  let guard=0;
  while(!U.w.over&&guard++<500){
   try{
    if(guard===120&&!U.w.over){ saveNow(); const fp=w=>JSON.stringify([w.round,w.cur,w.alert,w.players.map(p=>[p.x,p.y,p.hp,p.ap,p.strikes,p.items,p.status]),w.guards.map(g=>[g.x,g.y,g.state,g.ko]),w.npcs.map(n=>[n.x,n.y,n.hostile])]); const b4=fp(U.w); const okk_=loadSave(); if(!okk_||b4!==fp(U.w)){errs++;console.log('SAVE MISMATCH',okk_,n,mode);} saves++; }
    const w=U.w;const p=me(); if(U.cover){U.cover=false;refresh(true);}
    renderAll(); drawGame(ctx,U,guard*50);
    if(p.pending){pend++; const d=confrontData(w,p); const opts=p.pending.type==='confront'?['cooperate','bribe','attack','run']:['pay','refuse']; const c=opts[Math.floor(Math.random()*opts.length)]; resolve(c,'fair'); continue;}
    const acts_=U.acts.filter(a=>a.enabled);
    const mv=U.moveOpts.filter(o=>!o.locked);
    const r=Math.random();
    if(acts_.length&&r<0.5){const a=acts_[Math.floor(Math.random()*acts_.length)];
       if(a.ui==='shop'){doAct(a.a);U.modal={type:'shop'};renderAll();modals++;const sh=shopFor(w,me());if(sh&&sh.sells&&sh.sells[0])A({t:'buy',item:sh.sells[0].item});if(sh&&sh.slots)A({t:'route',slot:'1-night'});U.modal=null;}
       else if(a.ui==='stash'){doAct(a.a);U.modal={type:'stash'};renderAll();modals++;A({t:'stashmove',dir:'in',item:Object.keys(me().items)[0]||'cigs',qty:1});renderAll();U.modal=null;}
       else if(a.ui==='give'){U.modal={type:'give'};renderAll();U.modal=null;}
       else if(a.ui==='bribe'){U.modal={type:'bribe',gid:a.gid};renderAll();modals++;doAct({t:'bribe',gid:a.gid,purpose:Math.random()<0.5?'blind':'alarm',offer:'fair',phase:'night'});U.modal=null;}
       else if(a.ui==='hire'){U.modal={type:'hire',nid:a.nid};renderAll();modals++;U.modal=null;}
       else doAct(a.a);}
    else if(U.runOpts.length&&r<0.6){const o=U.runOpts[0];handleTap(tileAt(w.map,o.x,o.y));renderAll();doAct({t:'run',x:o.x,y:o.y});}
    else if(mv.length&&r<0.92){const o=mv[Math.floor(Math.random()*mv.length)];handleTap(o.tile);renderAll();doAct({t:'move',x:o.x,y:o.y,sneak:Math.random()<0.3});}
    else doAct({t:'end'});
    acts++;
    U.tipsOpen=(guard%7===0); U.routeView.add('0-day'); U.tab=['actions','pack','intel','log'][guard%4];
   }catch(e){errs++;console.log('UIERR',e.stack.split('\\n').slice(0,3).join(' | '));break;}
  }
  if(true){ U.w=U.midw||U.w; }
  if(!U.w.over){ saveNow(); const fp=w=>JSON.stringify([w.round,w.cur,w.alert,w.players.map(p=>[p.x,p.y,p.hp,p.ap,p.strikes,p.items,p.status]),w.guards.map(g=>[g.x,g.y,g.state,g.ko]),w.npcs.map(n=>[n.x,n.y,n.hostile])]); const before=fp(U.w); const keep=U.w; const ok=loadSave(); const after=ok?fp(U.w):'';
    if(!ok||before!==after){errs++;console.log('SAVE MISMATCH',ok,n,mode);} saves++; }
  games++; if(U.w.over){overs++;tryf(()=>showOver(),'over');}
 }
 openPause(true);openPause(false);openSettings(true);openSettings(false);
 console.log(JSON.stringify({saves,games,overs,acts,errs,modals,pend}));
})();`;
vm.createContext(ctxObj);
try{vm.runInContext(js+test,ctxObj);}catch(e){console.log('FATAL',e.stack.split('\n').slice(0,6).join('\n'));}
