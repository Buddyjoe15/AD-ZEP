/* AD-EZP debug menu: spawn catalog and hold-to-inspect details. */
(()=>{'use strict';
const G=GW,S=G.State,T=48,HOLD_MS=450,SLOP=10;
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=n=>Math.round(n*100)+'%';
let armed=null,tip=null,sticky=false;
const initials=n=>{const w=String(n).trim().split(/\s+/);return (w.length>1?w.map(x=>x[0]).join(''):w[0].slice(0,2)).toUpperCase()};
function symbolFor(e){if(e.kind==='building'){const d=G.DATA.BUILDABLES[e.key];if(d.symbol)return d.symbol}return initials(e.name)}

// ---- Catalog: everything that can exist on the map ----
function catalog(){
 const out=[];
 for(const [key,d]of Object.entries(G.DATA.BUILDABLES))out.push({group:'Buildings',kind:'building',key,name:d.name});
 for(const [key,d]of Object.entries(G.ItemDefs))out.push({group:'Items',kind:'item',key,name:d.name});
 for(const [key,d]of Object.entries(G.DATA.SCAVENGE_NODES))out.push({group:'Assets',kind:'node',key,name:d.name});
 out.push({group:'Assets',kind:'site',key:'Archive',name:'Archive signal'});
 out.push({group:'Assets',kind:'site',key:'Element P',name:'Element P'});
 return out;
}
function effectLines(fx){return Object.entries(fx||{}).map(([k,v])=>k==='damageReduction'?`Damage reduction ${pct(v)}`:k==='inventoryBonus'?`Inventory +${v} spaces`:`${k}: ${v}`)}
function itemDetails(d,it){
 const rows=[['Type',d.kind],['Slot',d.slot],['Durability',it?`${Math.round(it.durability??d.maxDurability)} / ${d.maxDurability}`:d.maxDurability]];
 effectLines(d.effects).forEach(l=>rows.push(['Effect',l]));
 return {title:d.name,sub:'Item',rows,desc:d.description};
}
function buildingDetails(d,b){
 const rows=[['Size',`${d.w}×${d.h}`]];
 if(d.level||b?.level)rows.push(['Level',b?.level||d.level]);
 if(b&&b.maxHp)rows.push(['HP',`${Math.ceil(b.hp)} / ${b.maxHp}`]);else if(d.maxHp)rows.push(['HP',d.maxHp]);
 if(b?.queue?.length)rows.push(['Queue',b.queue.length+' in production']);if(d.buildTime)rows.push(['Build time',d.buildTime+'s']);
 if(d.cost)rows.push(['Cost',G.Economy?.describe?G.Economy.describe(d.cost):JSON.stringify(d.cost)]);
 if(d.key==='chest')rows.push(['Capacity','24 slots']);
 return {title:d.name,sub:'Building',rows,desc:d.description};
}
function nodeDetails(d,n){
 const rows=[['Resource',d.resource],['Capacity',n?`${Math.round(n.remaining)} / ${d.capacity}`:d.capacity],['Rate',d.rate+'/s']];
 return {title:d.name,sub:'Asset',rows,desc:d.description};
}
function siteDetails(kind,p){
 const rows=[['Kind',kind]];if(p)rows.push(['Study',p.done?'Complete':`${Math.round(p.progress/4*100)}%`]);
 return {title:kind==='Archive'?'Archive signal':'Element P',sub:'Asset',rows,
  desc:kind==='Archive'?'Studied by the Commander, a Survey Drone, or a nearby Sensor Station. Yields 70 metal.':'Studied by the Commander, a Survey Drone, or a nearby Sensor Station. Secured into containment (max 10).'};
}
function entryDetails(e){
 if(e.kind==='building')return buildingDetails(G.DATA.BUILDABLES[e.key]);
 if(e.kind==='item')return itemDetails(G.ItemDefs[e.key]);
 if(e.kind==='node')return nodeDetails(G.DATA.SCAVENGE_NODES[e.key]);
 return siteDetails(e.key);
}
function containerDetails(c){
 if(c.type==='ground_item'&&c.items.length===1){const it=c.items[0],d=G.ItemDefs[it.key]||it;return itemDetails(d,it)}
 const rows=[['Contents',c.items.length?`${c.items.length} / ${c.capacity}`:`Empty (${c.capacity} slots)`],['State',c.opened?'Opened':'Unsearched']];
 c.items.forEach(it=>rows.push(['Item',it.name]));
 return {title:c.name||'Chest',sub:c.built?'Building':'Container',rows,desc:c.built?G.DATA.BUILDABLES.chest.description:''};
}

// ---- Spawning ----
function tileFree(gx,gy){return S.map.passable(gx,gy)&&!S.buildings.some(b=>gx>=b.gx&&gx<b.gx+b.w&&gy>=b.gy&&gy<b.gy+b.h)&&!S.containers.some(c=>c.gx===gx&&c.gy===gy&&!(c.type==='ground_item'&&!c.items.length))}
function spawn(e,wx,wy){
 const gx=Math.floor(wx/T),gy=Math.floor(wy/T),cx=(gx+.5)*T,cy=(gy+.5)*T;
 if(e.kind==='building'){const d=G.DATA.BUILDABLES[e.key];if(!G.Build.canPlace(gx,gy,d.w,d.h)||!tileFree(gx,gy)){G.toast('Tile is occupied');return false}}
 else if(e.kind==='item'){if(!tileFree(gx,gy)){G.toast('Tile is occupied');return false}}
 else if(!S.map.passable(gx,gy)){G.toast('Tile is blocked');return false}
 if(e.kind==='item'){let c=G.Containers.create(cx,cy,[G.createItem(e.key)],0,{opened:true,gx,gy});c.type='ground_item';c.name=G.ItemDefs[e.key].name}
 else if(e.key==='chest'&&e.kind==='building'){let c=G.Containers.create(cx,cy,[],0,{opened:true,built:true,gx,gy});c.name='Chest'}
 else if(e.kind==='building'){let d=G.DATA.BUILDABLES[e.key];S.buildings.push({id:'debug-'+S.nextId++,type:e.key,team:'blue',gx,gy,w:d.w,h:d.h,x:(gx+d.w/2)*T,y:(gy+d.h/2)*T,hp:d.hp??d.maxHp,maxHp:d.maxHp??d.hp,...(d.level?{level:d.level}:{})})}
 else if(e.kind==='node'){let d=G.DATA.SCAVENGE_NODES[e.key];S.scavengeNodes.push({id:'mine-'+S.nextId++,type:e.key,name:d.name,x:cx,y:cy,remaining:d.capacity})}
 else{let E=S.expedition;if(!E){G.toast('No active expedition');return false}E.sites.push({id:'debug-site-'+S.nextId++,x:cx,y:cy,kind:e.key,done:false,progress:0})}
 G.toast(e.name+' placed');return true;
}

// ---- Tooltip ----
function showTip(info,x,y){
 hideTip();tip=document.createElement('div');tip.id='dbgTip';
 tip.innerHTML=`<b>${esc(info.title)}</b><i>${esc(info.sub)}</i>${info.rows.filter(r=>r[1]!=null&&r[1]!=='').map(r=>`<div><span>${esc(r[0])}</span>${esc(r[1])}</div>`).join('')}${info.desc?`<p>${esc(info.desc)}</p>`:''}`;
 document.body.appendChild(tip);
 const r=tip.getBoundingClientRect(),W=innerWidth,H=innerHeight;
 let left=Math.min(Math.max(6,x+14),W-r.width-6),top=y-r.height-14;if(top<6)top=Math.min(H-r.height-6,y+18);
 tip.style.left=left+'px';tip.style.top=top+'px';
}
function hideTip(){tip?.remove();tip=null;sticky=false}

// ---- Panel ----
function renderPanel(){
 const p=document.getElementById('dbgPanel'),groups={};
 catalog().forEach((e,i)=>{(groups[e.group]??=[]).push([e,i])});
 p.innerHTML=`<div class="dbgHead"><b>Debug</b><button id="dbgClose" type="button">×</button></div>
  <div class="dbgHelp">${armed?`Tap the map to place <b>${esc(armed.name)}</b>. Tap it again here to stop.`:'Select an entry, then tap the map to place it. Hold an entry for details.'}</div>
  ${Object.entries(groups).map(([g,list])=>`<div class="dbgGroup">${g}</div>${list.map(([e,i])=>`<button type="button" class="dbgEntry${armed&&armed.kind===e.kind&&armed.key===e.key?' active':''}" data-i="${i}"><span class="dbgIcon dbg-${e.kind}">${esc(symbolFor(e))}</span>${esc(e.name)}</button>`).join('')}`).join('')}`;
 p.querySelector('#dbgClose').onclick=()=>togglePanel(false);
 const list=catalog();
 p.querySelectorAll('.dbgEntry').forEach(el=>{
  const e=list[+el.dataset.i];let t=null,held=false,start=null;
  el.addEventListener('pointerdown',ev=>{held=false;start={x:ev.clientX,y:ev.clientY};t=setTimeout(()=>{held=true;showTip(entryDetails(e),start.x,start.y)},HOLD_MS)});
  el.addEventListener('pointermove',ev=>{if(start&&!held&&Math.hypot(ev.clientX-start.x,ev.clientY-start.y)>SLOP){clearTimeout(t);t=null}});
  const end=()=>{clearTimeout(t);t=null;start=null;hideTip()};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('pointerleave',end);
  el.addEventListener('contextmenu',ev=>ev.preventDefault());
  el.addEventListener('click',()=>{if(held){held=false;return}armed=armed&&armed.kind===e.kind&&armed.key===e.key?null:e;renderPanel()});
 });
}
function togglePanel(open){
 const p=document.getElementById('dbgPanel'),b=document.getElementById('dbgBtn');
 open=open??p.classList.contains('hidden');p.classList.toggle('hidden',!open);b.classList.toggle('on',open);
 if(!open)armed=null;else renderPanel();
}

// ---- Map input: tap-to-place and hold-to-inspect ----
function hitContainerAt(sx,sy){const q=G.worldFromScreen(sx,sy);let best=null,dist=28/S.camera.z;for(const c of S.containers){if(c.type==='ground_item'&&!c.items.length)continue;let d=Math.hypot(c.x-q.x,c.y-q.y);if(d<dist){dist=d;best=c}}return best}
function hitBuildingAt(sx,sy){const q=G.worldFromScreen(sx,sy);return S.buildings.find(b=>b.hp>0&&q.x>=b.gx*T&&q.x<(b.gx+b.w)*T&&q.y>=b.gy*T&&q.y<(b.gy+b.h)*T)||null}
function inspectAt(sx,sy){const c=hitContainerAt(sx,sy);if(c)return containerDetails(c);const b=hitBuildingAt(sx,sy),d=b&&G.DATA.BUILDABLES[b.type];return d?buildingDetails(d,b):null}
let press=null;
function canvasPoint(e){const r=G.Renderer.cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function swallow(e){e.stopImmediatePropagation();G.Input.cancel(e);S.buildPreview=null}
document.addEventListener('pointerdown',e=>{
 if(sticky)hideTip();
 if(e.target!==G.Renderer?.cv)return;
 if(press){clearTimeout(press.timer);press=null;hideTip();return} // second finger: let pinch through
 const p=canvasPoint(e);
 press={id:e.pointerId,x:e.clientX,y:e.clientY,sx:p.x,sy:p.y,button:e.button,held:false,timer:setTimeout(()=>{
  if(!press)return;const info=inspectAt(press.sx,press.sy);if(!info)return;
  press.held=true;G.Input.cancelTouchHold();G.Input.box=null;G.Input.dragCam=null;
  showTip(info,press.x,press.y);
 },HOLD_MS)};
},true);
document.addEventListener('pointermove',e=>{if(press&&e.pointerId===press.id&&!press.held&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>SLOP){clearTimeout(press.timer);press.moved=true}},true);
document.addEventListener('pointerup',e=>{
 if(!press||e.pointerId!==press.id)return;const pr=press;press=null;clearTimeout(pr.timer);
 if(pr.held){hideTip();swallow(e);return}
 if(armed&&!pr.moved&&(pr.button===0||pr.button==null)&&!document.getElementById('dbgPanel').classList.contains('hidden')){
  const q=G.worldFromScreen(pr.sx,pr.sy);spawn(armed,q.x,q.y);swallow(e);return
 }
 if(!pr.moved&&(pr.button===0||pr.button==null)&&!G.State.buildMode?.active){
  const b=hitBuildingAt(pr.sx,pr.sy),d=b&&G.DATA.BUILDABLES[b.type];if(!d)return;
  swallow(e);
  if(b.type==='fabricator'&&G.EZP?.openFabricator){G.EZP.openFabricator(b);return}
  showTip(buildingDetails(d,b),pr.x,pr.y);sticky=true;
 }
},true);
addEventListener('wheel',()=>{if(sticky)hideTip()},{capture:true,passive:true});
document.addEventListener('pointercancel',e=>{if(press&&e.pointerId===press.id){clearTimeout(press.timer);press=null;hideTip()}},true);

// ---- Install ----
function install(){
 const st=document.createElement('style');st.textContent=`
#dbgBtn{position:fixed;top:max(5px,env(safe-area-inset-top));left:50%;z-index:32;min-height:26px;padding:3px 10px;font:700 10px system-ui;letter-spacing:.06em;background:#2a1f10ee;color:#f1d38a;border:1px solid #9b7a3a;border-radius:5px}
#dbgBtn.on{background:#6b4f16;color:#fff}
#dbgPanel{position:fixed;left:max(6px,env(safe-area-inset-left));top:44px;bottom:max(6px,env(safe-area-inset-bottom));width:min(250px,44vw);z-index:40;overflow:auto;background:#141a16f2;border:1px solid #6d6040;border-radius:7px;color:#e6e2d4;font:12px system-ui;padding:8px;-webkit-overflow-scrolling:touch;touch-action:pan-y}
#dbgPanel.hidden{display:none}
.dbgHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.dbgHead b{color:#f1d38a;letter-spacing:.08em}
.dbgHead button{min-height:26px;min-width:26px;padding:0}
.dbgHelp{font-size:10px;color:#b7b3a3;margin-bottom:6px}
.dbgGroup{font-size:10px;font-weight:800;letter-spacing:.1em;color:#9fb5a3;margin:8px 0 4px;text-transform:uppercase}
.dbgEntry{display:flex;align-items:center;gap:8px;width:100%;text-align:left;margin:0 0 4px;padding:5px 6px;min-height:34px;background:#232b25;color:#e6e2d4;border:1px solid #3b463d;border-radius:5px;font:12px system-ui;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none}
.dbgEntry.active{outline:2px solid #e2c35c;background:#414634}
.dbgIcon{flex:0 0 26px;height:26px;display:grid;place-items:center;border-radius:4px;font:800 9px system-ui;background:#3a4a3d}
.dbg-item{background:#3d4f6a}.dbg-node{background:#5a4a2c}.dbg-site{background:#2c5a5a}
#dbgTip{position:fixed;z-index:60;max-width:240px;background:#0d1310f7;border:1px solid #9b7a3a;border-radius:6px;padding:8px 10px;color:#e6e2d4;font:11px system-ui;pointer-events:none;box-shadow:0 4px 16px #000a}
#dbgTip b{display:block;color:#f1d38a;font-size:13px}#dbgTip i{display:block;color:#9fb5a3;font-size:10px;margin-bottom:4px}
#dbgTip div{display:flex;gap:6px}#dbgTip span{color:#9a978a;min-width:68px}#dbgTip p{margin:5px 0 0;color:#c9c5b6}
@media (max-width:700px){#dbgBtn{font-size:9px;min-height:24px;padding:2px 7px}}`;
 document.head.appendChild(st);
 const b=document.createElement('button');b.id='dbgBtn';b.type='button';b.textContent='DEBUG';b.onclick=()=>togglePanel();
 const p=document.createElement('div');p.id='dbgPanel';p.className='hidden';
 p.addEventListener('pointerdown',e=>e.stopPropagation());
 document.getElementById('app').append(b,p);
 const sync=()=>{const inGame=G.SceneManager?.currentName==='gameplay';b.style.display=inGame?'':'none';const t=document.getElementById('gameTitle')?.getBoundingClientRect();if(t&&t.width){b.style.left=(t.right+6)+'px';b.style.top=Math.max(2,t.top+t.height/2-b.offsetHeight/2)+'px'}if(!inGame&&!p.classList.contains('hidden'))togglePanel(false)};
 setInterval(sync,300);sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
G.Debug={catalog,spawn,entryDetails,containerDetails,togglePanel};
})();
