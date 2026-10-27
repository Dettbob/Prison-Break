const fs=require('fs'),vm=require('vm');
vm.runInThisContext(['data','mapgen'].map(f=>fs.readFileSync('src/'+f+'.js','utf8')).join('\n')+'\n;globalThis.__x={generateMap,mulberry32,tileAt,neighbors,CFG,kindOf};');
const {generateMap,mulberry32,neighbors}=globalThis.__x;
let fail=0,counts=[],spread=[];
const t0=Date.now();
for(let s=1;s<=300;s++) for(const n of [1,2,3,4]){
  try{
    const m=generateMap(mulberry32(s*7+n),n);
    const tiles=m.grid.filter(Boolean); counts.push(tiles.length);
    const types=new Set(tiles.map(t=>t.type));
    for(const need of ['common','dining','kitchen','armory','warden','showers','gate','fence','yard','court','solitary','control','electrical','guardroom']) if(!types.has(need)){console.log('missing',need,s,n);fail++;}
    if(m.cells.length!==n){fail++;}
    // cell closeness
    let md=0;for(const a of m.cells)for(const b of m.cells)md=Math.max(md,Math.abs(a.x-b.x)+Math.abs(a.y-b.y));spread.push(md);
    const dn=m.rooms.find(r=>r.type==='dining');if(dn.tiles.length!==6)fail++;
    const kt=m.rooms.find(r=>r.type==='kitchen');if(kt.tiles.length!==2)fail++;
    if(m.court.tiles.length!==12)fail++;
  }catch(e){fail++;if(fail<4)console.log('ERR',s,n,e.message);}
}
console.log('fail',fail,'avg tiles',(counts.reduce((a,b)=>a+b,0)/counts.length).toFixed(0),'max cell spread',Math.max(...spread),'avg spread',(spread.reduce((a,b)=>a+b,0)/spread.length).toFixed(1),'ms',Date.now()-t0);
const m=generateMap(mulberry32(42),4);
const ch={fence:'#',yard:'.',court:'o',corridor:'=',door:'D',gate:'G',cell:'c',solitary:'S',common:'C',dining:'d',showers:'s',library:'L',workshop:'w',laundry:'l',kitchen:'k',infirmary:'i',visitor:'v',storage:'t',armory:'A',guardroom:'g',warden:'W',control:'X',electrical:'E'};
for(let y=0;y<m.H;y++){let r='';for(let x=0;x<m.W;x++){const t=m.grid[y*m.W+x];r+=t?(ch[t.type]||'?'):' ';}console.log(r);}
