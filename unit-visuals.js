/* Canvas-only unit presentation. Animation reads simulation state; never changes it. */
(()=>{
const G=GW;
G.UnitVisuals={
 hero(g,u,z,t){
  const moving=u.path.length>0,lift=13+Math.sin(t*3.5+u.id)*1.8,pulse=1+Math.sin(t*23)*.12;
  g.save();g.fillStyle='#06101855';g.beginPath();g.ellipse(0,5,23,9,0,0,Math.PI*2);g.fill();
  // Ground illumination and a visibly suspended engine pod; there are no walking legs.
  let glow=g.createRadialGradient(0,1,0,0,1,28);glow.addColorStop(0,'#67dfff55');glow.addColorStop(1,'#67dfff00');g.fillStyle=glow;g.fillRect(-30,-25,60,54);
  g.translate(0,-lift);
  for(const x of [-10,10]){let len=(moving?26:18)*pulse;g.fillStyle='#36b8ef88';g.beginPath();g.moveTo(x-6,-1);g.lineTo(x+6,-1);g.lineTo(x+3,len*.62);g.lineTo(x,len);g.lineTo(x-3,len*.62);g.closePath();g.fill();g.fillStyle='#c8ffff';g.beginPath();g.moveTo(x-3,0);g.lineTo(x+3,0);g.lineTo(x,len*.65);g.closePath();g.fill()}
  g.strokeStyle='#172933';g.lineWidth=2;
  g.fillStyle='#263d4a';g.fillRect(-16,-8,32,10);g.fillStyle='#536f7f';g.fillRect(-15,-5,10,6);g.fillRect(5,-5,10,6);
  g.fillStyle='#a9bec4';g.beginPath();g.moveTo(-16,-35);g.lineTo(16,-35);g.lineTo(13,-9);g.lineTo(0,-4);g.lineTo(-13,-9);g.closePath();g.fill();g.stroke();
  g.fillStyle='#486879';g.fillRect(-24,-32,10,22);g.fillRect(14,-32,10,22);g.fillStyle='#c5d8dc';g.fillRect(-24,-33,10,6);g.fillRect(14,-33,10,6);
  g.fillStyle='#dfebe7';g.fillRect(-11,-48,22,16);g.strokeRect(-11,-48,22,16);g.fillStyle='#16343e';g.fillRect(-9,-44,18,7);g.fillStyle='#87f4ff';g.fillRect(-8,-43,16,3);
  g.fillStyle='#e1bd76';g.fillRect(-8,-29,16,12);g.fillStyle='#1c4458';g.fillRect(-3,-26,6,6);
  g.fillStyle='#192c37';g.fillRect(17,-19,8,25);g.fillStyle='#7596a5';g.fillRect(18,-18,6,8);g.fillStyle='#69e8ff';g.fillRect(18,4,6,3);
  g.restore();
 },
 utility(g,u,z,t){
  const moving=u.path.length>0,phase=t*9+u.id;
  g.save();g.fillStyle='#07101855';g.beginPath();g.ellipse(0,4,28,24,0,0,Math.PI*2);g.fill();
  for(let side of [-1,1])for(let i=0;i<4;i++){
   let hx=-12+i*8,hy=side*7,swing=moving?Math.sin(phase+i*Math.PI*.8+side)*5:Math.sin(t*1.4+i)*.3;
   let kx=hx+(i-1.5)*7+swing,ky=side*(18+Math.cos(phase+i)* (moving?2:0)),fx=hx+(i-1.5)*10+swing,fy=side*28;
   g.lineCap='round';g.strokeStyle='#132630';g.lineWidth=5;g.beginPath();g.moveTo(hx,hy);g.lineTo(kx,ky);g.lineTo(fx,fy);g.stroke();
   g.strokeStyle='#8cabb3';g.lineWidth=2.4;g.beginPath();g.moveTo(hx,hy);g.lineTo(kx,ky);g.lineTo(fx,fy);g.stroke();
   g.fillStyle='#d7b875';g.beginPath();g.arc(kx,ky,2.5,0,Math.PI*2);g.fill();g.fillStyle='#1a3543';g.beginPath();g.arc(fx,fy,3,0,Math.PI*2);g.fill();
  }
  g.fillStyle='#243e4d';g.strokeStyle='#adc4c5';g.lineWidth=1.5;g.beginPath();g.ellipse(0,0,19,12,0,0,Math.PI*2);g.fill();g.stroke();
  g.fillStyle='#bca372';g.fillRect(-12,-8,15,16);g.fillStyle='#344d59';g.fillRect(-9,-5,9,10);
  const cargo=Math.min(1,(u.resourceCargo?.metal||0)/(u.resourceCargoCapacity||600));g.fillStyle='#213039';g.fillRect(-12,5,23,3);g.fillStyle='#e5bf65';g.fillRect(-12,5,23*cargo,3);
  g.fillStyle='#728e9b';g.fillRect(5,-5,16,10);g.fillStyle='#143646';g.fillRect(16,-4,7,8);g.fillStyle='#96f5ff';g.beginPath();g.arc(21,0,3,0,Math.PI*2);g.fill();g.restore();
 },
 laserTarget(u){
  if(u.droneRole!=='Utility'||u.hp<=0)return null;
  let S=G.State;
  if(u.command==='scavenge'&&u.haulState==='collecting'){
   let n=S.scavengeNodes.find(n=>n.id===u.scavengeNodeId&&n.remaining>0),def=n&&G.DATA.SCAVENGE_NODES[n.type];
   if(n&&Math.hypot(u.x-n.x,u.y-n.y)<=def.range+.1)return {...n,mode:'mine'};
  }
  if(u.command==='build'&&u.buildSiteId){let b=S.constructionSites.find(b=>b.id===u.buildSiteId&&b.remaining>0);if(b&&Math.hypot(u.x-b.x,u.y-b.y)<=48*1.65)return {...b,mode:'build'}}
  return null;
 },
 lasers(g,z,t){
  for(const u of G.State.units){let target=this.laserTarget(u);if(!target)continue;
   let sx=u.x+Math.cos(u.heading)*21,sy=u.y+Math.sin(u.heading)*21,tx=target.x+Math.sin(t*7)*4,ty=target.y+Math.cos(t*11)*4,col=target.mode==='mine'?'#72e9ff':'#f1cc78';
   g.save();g.globalAlpha=.25;g.strokeStyle=col;g.lineWidth=7;g.beginPath();g.moveTo(sx,sy);g.lineTo(tx,ty);g.stroke();g.globalAlpha=.95;g.lineWidth=1.8;g.stroke();g.strokeStyle='#efffff';g.lineWidth=.7;g.stroke();
   for(let i=0;i<5;i++){let a=t*5+i*1.256,r=4+(Math.sin(t*13+i)+1)*4;g.strokeStyle=col;g.lineWidth=1.3;g.beginPath();g.moveTo(tx+Math.cos(a)*3,ty+Math.sin(a)*3);g.lineTo(tx+Math.cos(a)*r,ty+Math.sin(a)*r);g.stroke()}g.fillStyle='#fffde4';g.beginPath();g.arc(tx,ty,2.6,0,Math.PI*2);g.fill();g.restore();
  }
 }
};
})();
