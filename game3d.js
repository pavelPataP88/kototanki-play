import * as THREE from './vendor/three.module.js';

const $ = id => document.getElementById(id);
const root = $('game'), overlay = $('overlay'), startBtn = $('start'), toast = $('toast'), flash = $('flash');
const ui = {level:$('level'),home:$('home'),lives:$('lives'),enemies:$('enemies'),score:$('score'),combo:$('combo'),bombs:$('bombs'),boost:$('boost'),place:$('place')};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), rand=(a=0,b=1)=>a+Math.random()*(b-a);

const locations = [
  {name:'СОЛНЕЧНАЯ ДЕРЕВНЯ',sky:0x87cfff,fog:0xcfeeff,ground:0x6fa64a,road:0xcaa36f,roof:0x2d6da3,leaf:0x55a83e,kind:'village'},
  {name:'ИЗУМРУДНЫЕ ЛУГА',sky:0x7ed7ff,fog:0xd9f5ff,ground:0x5da946,road:0xd2af77,roof:0xd6553f,leaf:0x3f9838,kind:'meadow'},
  {name:'АЛЬПИЙСКАЯ ДОЛИНА',sky:0x9edcff,fog:0xeaf7ff,ground:0xb7d6a1,road:0xd9c9a8,roof:0x3c7faf,leaf:0x4f9d58,kind:'alpine'},
  {name:'КОРОЛЕВСКИЕ САДЫ',sky:0x8ed5ff,fog:0xe7f6ff,ground:0x79af55,road:0xd8b681,roof:0x9b5bd6,leaf:0x4aa957,kind:'garden'},
  {name:'ЗОЛОТАЯ ОСЕНЬ',sky:0x8fcfff,fog:0xffead1,ground:0x9ea24b,road:0xc99b65,roof:0xbf4e35,leaf:0xd48132,kind:'autumn'},
  {name:'СОЛНЕЧНАЯ ЦИТАДЕЛЬ',sky:0x7fc6ff,fog:0xffe3ba,ground:0x8da04c,road:0xd2a265,roof:0xc44835,leaf:0x63933b,kind:'citadel'},
  {name:'ТУМАННЫЙ ХЭЛЛОУИН',sky:0x111318,fog:0x34373b,ground:0x30352d,road:0x514b45,roof:0x34282d,leaf:0x252821,kind:'halloween'}
];
const zoneSpecs=[
  {chapter:'ДЕРЕВЕНСКИЙ ДВОР',landmark:'АМБАР И СИЛОС',halfW:50,minZ:-50,maxZ:50},
  {chapter:'ФЕРМЕРСКИЕ ПОЛЯ',landmark:'СТАРАЯ МЕЛЬНИЦА',halfW:50,minZ:-50,maxZ:50},
  {chapter:'ГОРНЫЙ ПОСЁЛОК',landmark:'АЛЬПИЙСКОЕ ШАЛЕ',halfW:50,minZ:-50,maxZ:50},
  {chapter:'ДВОРЦОВЫЙ ПАРК',landmark:'ПАВИЛЬОН И ОРАНЖЕРЕЯ',halfW:50,minZ:-50,maxZ:50},
  {chapter:'ОСЕННЯЯ ЯРМАРКА',landmark:'РЫНОЧНЫЙ ДВОР',halfW:50,minZ:-50,maxZ:50},
  {chapter:'КРЕПОСТНОЙ ДВОР',landmark:'ЦИТАДЕЛЬНЫЕ ВОРОТА',halfW:50,minZ:-50,maxZ:50},
  {chapter:'ТУМАННЫЙ ХЭЛЛОУИН',landmark:'КЛАДБИЩЕНСКАЯ ЧАСОВНЯ',halfW:50,minZ:-50,maxZ:50}
];
let arena=zoneSpecs[0],worldMeta={zone:0,chapter:zoneSpecs[0].chapter,landmark:zoneSpecs[0].landmark,halfW:50,minZ:-50,maxZ:50};

const PROGRESS_KEY='kototanki-garage-r14';
const garageDefaults=()=>({version:1,rank:1,xp:0,parts:0,wavesWon:0,upgrades:{engine:0,cannon:0,power:0,armor:0,squad:0,bomb:0,coil:0}});
function loadGarage(){
  try{const raw=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'null'),base=garageDefaults();if(!raw)return base;return {...base,...raw,upgrades:{...base.upgrades,...(raw.upgrades||{})}}}catch{return garageDefaults()}
}
let garage=loadGarage();
function saveGarage(){try{localStorage.setItem(PROGRESS_KEY,JSON.stringify(garage))}catch{}}
function xpNeed(rank=garage.rank){return 100+rank*55}
function awardProgress(xp=0,parts=0){
  garage.xp+=xp;garage.parts+=parts;let ranked=0;
  while(garage.xp>=xpNeed()){garage.xp-=xpNeed();garage.rank++;ranked++}
  while(garage.parts>=4){garage.parts-=4;const keys=['engine','cannon','power','armor','squad','bomb'],min=Math.min(...keys.map(k=>garage.upgrades[k]||0)),pool=keys.filter(k=>(garage.upgrades[k]||0)===min);garage.upgrades[pool[(garage.wavesWon+garage.rank)%pool.length]]++;ranked++}
  saveGarage();syncTuneFromGarage();if(ranked)showToast('🔧 ГАРАЖ УЛУЧШЕН · РАНГ '+garage.rank);return ranked
}
const MAX_LEVEL=35;
const state={playing:false,level:1,score:0,home:5,lives:5,kills:0,targetKills:8,spawned:0,spawnTimer:0,bombs:3,combo:1,comboTimer:0,fireCooldown:0,invuln:0,valerian:0,poopSlow:0,nitro:0,overdrive:0,shield:0,coilCooldown:0,last:0,uiTimer:0};
const keys=new Set(), obstacles=[], enemies=[], raccoons=[], shots=[], feathers=[], boneShots=[], mousePoops=[], enemyPoops=[], particles=[], allies=[], pickups=[], hazards=[], yarnBalls=[], goreDebris=[];
let player, helper, mouseCompanion, home, ground, world, playerFacing=new THREE.Vector3(0,0,-1), aimFacing=new THREE.Vector3(0,0,-1), helperCooldown=0, shake=0, shakePhase=0, cameraYaw=0, cameraYawVelocity=0;
const cameraDrag={active:false,id:null,lastX:0};
const moveInput={x:0,y:0,active:false},aimInput={x:0,y:-1,active:false};
const tune={speed:1,fire:1,damage:1,valerian:1,bombRadius:1,extraBombs:0,maxLives:5,maxHome:5,allyScale:1,allyHp:2,allyFire:1,twin:false,coil:0};
function syncTuneFromGarage(){
  const u=garage.upgrades;tune.speed=1+(u.engine||0)*.05;tune.fire=Math.max(.54,1-(u.cannon||0)*.055);tune.damage=1+(u.power||0)*.34;tune.valerian=1+(u.power||0)*.05;
  tune.bombRadius=1+(u.bomb||0)*.09;tune.extraBombs=Math.floor((u.bomb||0)/2);tune.maxLives=5+Math.floor(((u.armor||0)+1)/2);tune.maxHome=5+Math.floor((u.armor||0)/3);
  tune.allyScale=1+Math.min(.25,(u.squad||0)*.045);tune.allyHp=2+Math.floor((u.squad||0)/2);tune.allyFire=Math.max(.58,1-(u.squad||0)*.055);
  tune.twin=(u.cannon||0)>=4;tune.coil=u.coil||0;refreshEquipmentVisuals()
}
syncTuneFromGarage();

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x87cfff);
scene.fog=new THREE.Fog(0xcfeeff,40,115);
const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,250);const camFocus=new THREE.Vector3(),camFocusTarget=new THREE.Vector3(),camDesired=new THREE.Vector3();
camera.position.set(0,13.5,22);
const mobilePerf=matchMedia('(pointer:coarse)').matches||/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const qualityMax=Math.min(devicePixelRatio,mobilePerf?1.0:1.4),qualityMin=mobilePerf?.68:.90,qualityStart=mobilePerf?Math.min(qualityMax,.90):qualityMax;
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(qualityStart);
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=mobilePerf?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=true;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.24;
root.appendChild(renderer.domElement);
const renderQuality={ratio:qualityStart,recommended:qualityStart,ema:1/60,timer:0,min:qualityMin,max:qualityMax,mobile:mobilePerf,shadowStride:1};
const motionClock={dt:1/60,raw:1/60,jitter:0};
function applyRenderQuality(){
  const next=clamp(renderQuality.recommended,renderQuality.min,renderQuality.max);
  if(Math.abs(next-renderQuality.ratio)<.015)return;
  renderQuality.ratio=next;renderer.setPixelRatio(renderQuality.ratio)
}
function updateRenderQuality(rawDt){
  renderQuality.ema=renderQuality.ema*.94+rawDt*.06;renderQuality.timer+=rawDt;
  if(renderQuality.timer<1.25)return;renderQuality.timer=0;
  if(renderQuality.ema>(mobilePerf?.036:.032))renderQuality.recommended=Math.max(renderQuality.min,renderQuality.ratio-.12);
  else if(renderQuality.ema>(mobilePerf?.027:.026))renderQuality.recommended=Math.max(renderQuality.min,renderQuality.ratio-.06);
  else renderQuality.recommended=renderQuality.ratio;
  if(!state.playing)applyRenderQuality()
}

const audio={ctx:null,master:null,noiseBuffer:null};
function initAudio(){
  if(audio.ctx)return;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  const ac=audio.ctx=new AC();audio.master=ac.createGain();audio.master.gain.value=.16;audio.master.connect(ac.destination);
  const len=ac.sampleRate,buf=ac.createBuffer(1,len,ac.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  audio.noiseBuffer=buf
}
function tone(freq=440,dur=.08,type='square',gain=.22,slide=1){
  initAudio();const ac=audio.ctx;if(!ac)return;
  const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(freq,ac.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*slide),ac.currentTime+dur);g.gain.setValueAtTime(gain,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);o.connect(g);g.connect(audio.master);o.start();o.stop(ac.currentTime+dur)
}
function noise(dur=.14,gain=.12){
  initAudio();const ac=audio.ctx,buf=audio.noiseBuffer;if(!ac||!buf)return;
  const now=ac.currentTime,length=Math.min(dur,buf.duration-.001),maxOffset=Math.max(0,buf.duration-length-.001),offset=Math.random()*maxOffset;
  const src=ac.createBufferSource(),g=ac.createGain();src.buffer=buf;g.gain.setValueAtTime(Math.max(.001,gain),now);g.gain.exponentialRampToValueAtTime(.001,now+length);src.connect(g);g.connect(audio.master);src.start(now,offset,length);src.stop(now+length)
}
const sfx={
  shoot(){tone(210,.07,'square',.18,1.8)},
  bone(){tone(520,.08,'triangle',.12,.62)},
  hit(){noise(.09,.16);tone(95,.12,'sawtooth',.12,.55)},
  bomb(){noise(.28,.28);tone(80,.3,'sawtooth',.20,.38)},
  pickup(){tone(560,.08,'sine',.16,1.35);setTimeout(()=>tone(820,.11,'sine',.13,1.12),55)},
  valerian(){tone(320,.12,'triangle',.15,1.8);setTimeout(()=>tone(720,.16,'sine',.14,.8),80)},
  poop(){tone(105,.18,'sawtooth',.20,.45);noise(.20,.12)},
  wave(){tone(330,.1,'square',.13,1.4);setTimeout(()=>tone(520,.14,'square',.12,1.3),80)}
};


const hemi=new THREE.HemisphereLight(0xdff5ff,0x6e8c43,1.35); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffefc0,3.9); sun.position.set(-18,35,16); sun.castShadow=true; const shadowSize=mobilePerf?512:1024;sun.shadow.mapSize.set(shadowSize,shadowSize); sun.shadow.camera.left=-34;sun.shadow.camera.right=34;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-40;sun.shadow.camera.near=1;sun.shadow.camera.far=85;sun.shadow.bias=-.0002;sun.shadow.normalBias=.035;sun.shadow.radius=mobilePerf?1:2;scene.add(sun);
const fill=new THREE.DirectionalLight(0xa7d8ff,.72);fill.position.set(22,15,-28);scene.add(fill);

function std(color,rough=.72,metal=0){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal})}
const textureCache=new Map();
function shade(hex,f=.8){const c=new THREE.Color(hex);c.r*=f;c.g*=f;c.b*=f;return c.getHex()}
function patternTexture(base,accent,repeat=4,kind='noise'){
  const key=[base,accent,repeat,kind].join(':');if(textureCache.has(key))return textureCache.get(key);
  const cv=document.createElement('canvas');cv.width=cv.height=96;const x=cv.getContext('2d'),b=new THREE.Color(base),a=new THREE.Color(accent);
  x.fillStyle='#'+b.getHexString();x.fillRect(0,0,96,96);
  for(let i=0;i<260;i++){const mix=Math.random(),r=Math.round((b.r*(1-mix)+a.r*mix)*255),g=Math.round((b.g*(1-mix)+a.g*mix)*255),bl=Math.round((b.b*(1-mix)+a.b*mix)*255);x.fillStyle='rgba('+r+','+g+','+bl+','+(kind==='fur'?.16:.22)+')';const px=Math.random()*96,py=Math.random()*96;if(kind==='wood')x.fillRect(px,py,10+Math.random()*22,.7+Math.random()*1.2);else if(kind==='fur')x.fillRect(px,py,.8+Math.random()*2,3+Math.random()*7);else x.fillRect(px,py,1+Math.random()*3,1+Math.random()*3)}
  if(kind==='scratch'){x.strokeStyle='rgba(255,255,255,.16)';x.lineWidth=1;for(let i=0;i<14;i++){x.beginPath();x.moveTo(Math.random()*96,Math.random()*96);x.lineTo(Math.random()*96,Math.random()*96);x.stroke()}}
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);t.colorSpace=THREE.SRGBColorSpace;textureCache.set(key,t);return t
}
function texStd(base,accent,rough=.8,metal=0,repeat=4,kind='noise'){const tex=patternTexture(base,accent,repeat,kind);return new THREE.MeshStandardMaterial({map:tex,roughness:rough,metalness:metal})}
const M={
  orange:std(0xe77c32,.72),cream:std(0xffdfad,.78),white:std(0xfff7e8,.75),black:std(0x17191d,.65),eye:std(0x63c7ff,.2),pupil:std(0x10131a,.2),
  steel:std(0x555e69,.35,.72),darkSteel:std(0x303741,.42,.68),bronze:std(0xb26c32,.36,.62),tank:std(0xb9702d,.48,.48),tankDark:std(0x604122,.55,.45),red:std(0xd84435,.55),
  wood:texStd(0x8d5c31,0x5f3a20,.84,0,4,'wood'),woodLight:texStd(0xb77b43,0x7b4a27,.80,0,4,'wood'),stone:texStd(0xa69e8d,0x777064,.9,0,5,'noise'),plaster:texStd(0xffe3ad,0xd8b77c,.86,0,4,'noise'),grass:texStd(0x70ad4f,0x477d34,.98,0,10,'noise'),road:texStd(0xc9a474,0x9d754d,.97,0,9,'noise'),
  dog1:texStd(0x9b673f,0x6c452d,.84,0,5,'fur'),dog2:texStd(0x6d5140,0x46352d,.85,0,5,'fur'),dog3:texStd(0x8c8b86,0x5f6265,.85,0,5,'fur'),dog4:texStd(0x4c403d,0x282425,.87,0,5,'fur'),helmet:texStd(0x5a6066,0x35393d,.52,.38,3,'scratch'),
  bird:std(0x202a34,.8),birdWing:std(0x151d25,.82),beak:std(0xf4ad22,.58),bone:std(0xf7e6bd,.72),collar:std(0x2f77bd,.48,.12),tray:texStd(0x2f78a8,0x1f577a,.45,.12,3,'scratch'),trayLight:texStd(0x6cb7d8,0x3d8cb1,.38,.08,3,'scratch'),litter:texStd(0xd8c39a,0xaa9169,.98,0,8,'noise'),mouse:texStd(0xa8a39d,0x787570,.82,0,4,'fur'),mouseEar:std(0xf0a7b8,.72),raccoon:texStd(0x6e7278,0x4d5258,.84,0,5,'fur'),raccoonDark:texStd(0x2f343a,0x181b1e,.84,0,5,'fur'),trash:texStd(0x7b6b54,0x514535,.92,0,4,'noise'),
  glow:new THREE.MeshStandardMaterial({color:0xffbd57,emissive:0xff7b1f,emissiveIntensity:4,roughness:.45})
};
for(const m of Object.values(M))if(m?.isMaterial)m.userData.shared=true;
function mesh(g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;return o}
function box(p,sx,sy,sz,m,x=0,y=0,z=0,ry=0){const o=mesh(new THREE.BoxGeometry(sx,sy,sz),m,x,y,z);o.rotation.y=ry;p.add(o);return o}
function sph(p,r,m,x=0,y=0,z=0,s=[1,1,1],seg=14){const o=mesh(new THREE.SphereGeometry(r,seg,Math.max(10,seg-4)),m,x,y,z);o.scale.set(...s);p.add(o);return o}
function cyl(p,rt,rb,h,m,x=0,y=0,z=0,rx=0,rz=0){const o=mesh(new THREE.CylinderGeometry(rt,rb,h,14),m,x,y,z);o.rotation.x=rx;o.rotation.z=rz;p.add(o);return o}
function cone(p,r,h,m,x=0,y=0,z=0,rx=0,rz=0){const o=mesh(new THREE.ConeGeometry(r,h,12),m,x,y,z);o.rotation.x=rx;o.rotation.z=rz;p.add(o);return o}

function sharedGeo(g){g.userData.shared=true;return g}
const fenceUnitGeo=sharedGeo(new THREE.BoxGeometry(1,1,1));
const flowerGeo=sharedGeo(new THREE.SphereGeometry(.07,8,6));
const flowerMat=std(0xffffff,.7);flowerMat.userData.shared=true;
const fxSphereGeo=sharedGeo(new THREE.SphereGeometry(1,7,5));
const trailMat=new THREE.MeshBasicMaterial({color:0xffc77a});trailMat.userData.shared=true;
const dustMatA=new THREE.MeshBasicMaterial({color:0xd5bd8e,transparent:true,opacity:.8});dustMatA.userData.shared=true;
const dustMatB=new THREE.MeshBasicMaterial({color:0xb99866,transparent:true,opacity:.8});dustMatB.userData.shared=true;
const effectMatCache=new Map();
function effectMat(color){if(!effectMatCache.has(color)){const m=new THREE.MeshBasicMaterial({color});m.userData.shared=true;effectMatCache.set(color,m)}return effectMatCache.get(color)}
const fxMeshPool=[],particleRecordPool=[];
function fxSphere(pos,scale,mat){
  const m=fxMeshPool.pop()||new THREE.Mesh(fxSphereGeo,mat);m.material=mat;m.position.copy(pos);m.rotation.set(0,0,0);m.scale.setScalar(scale);m.visible=true;m.castShadow=false;m.receiveShadow=false;return m
}
function spawnParticle(pos,scale,mat,vx,vy,vz,life){
  const p=particleRecordPool.pop()||{};p.mesh=fxSphere(pos,scale,mat);p.vx=vx;p.vy=vy;p.vz=vz;p.life=life;scene.add(p.mesh);particles.push(p);return p
}
function releaseParticle(p){
  if(p.mesh.parent)p.mesh.parent.remove(p.mesh);p.mesh.visible=false;fxMeshPool.push(p.mesh);p.mesh=null;particleRecordPool.push(p)
}
function clearParticles(){for(let i=particles.length-1;i>=0;i--)releaseParticle(particles[i]);particles.length=0}
function retire(o){if(!o)return;if(o.parent)o.parent.remove(o);o.traverse?.(x=>{
  if(x.geometry&&!x.geometry.userData?.shared)x.geometry.dispose();
  const mats=Array.isArray(x.material)?x.material:[x.material];for(const m of mats)if(m?.isMaterial&&!m.userData?.shared)m.dispose()
})}
const sausageBodyGeo=sharedGeo(new THREE.CylinderGeometry(.13,.13,.72,14));
const sausageTipGeo=sharedGeo(new THREE.SphereGeometry(.14,10,6));
const sausageMat=std(0xd54f2d,.45);sausageMat.userData.shared=true;
const boneShaftGeo=sharedGeo(new THREE.CylinderGeometry(.10,.13,.72,14));
const boneEndGeo=sharedGeo(new THREE.SphereGeometry(.13,9,7));
const featherGeo=sharedGeo(new THREE.ConeGeometry(.11,.72,5));
const allyShotGeo=sharedGeo(new THREE.SphereGeometry(.09,7,5));
const featherMat=std(0x273846,.55,.12);featherMat.userData.shared=true;
const poopGeoA=sharedGeo(new THREE.SphereGeometry(.19,9,7));
const poopGeoB=sharedGeo(new THREE.SphereGeometry(.13,8,6));
const mousePoopMat=std(0x5a351f,.9);mousePoopMat.userData.shared=true;
const hazardPoopMat=std(0x6a3c1f,.92);hazardPoopMat.userData.shared=true;
const goreBoneGeo=sharedGeo(new THREE.CylinderGeometry(.055,.075,.55,7)),goreToothGeo=sharedGeo(new THREE.ConeGeometry(.075,.28,6)),goreSkullGeo=sharedGeo(new THREE.SphereGeometry(.22,8,6));
const goreBoneMat=std(0xe7dfc8,.82),goreToothMat=std(0xf4eddb,.72),goreSkullMat=std(0xd7d0bd,.88),bloodMat=effectMat(0x8b1018);
for(const m of [goreBoneMat,goreToothMat,goreSkullMat])m.userData.shared=true;
function decor(g){g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true}});return g}
function shadowBudget(g,budget){if(!mobilePerf)return g;let used=0;g.traverse(o=>{if(o.isMesh)o.castShadow=used++<budget});return g}
function noShadow(g){g.traverse(o=>{if(o.isMesh)o.castShadow=false});return g}
function bolt(p,x,y,z,m=M.bronze){return sph(p,.055,m,x,y,z,[1,1,.55],8)}
function whisker(p,x,y,z,len=.55,rz=0){const w=box(p,len,.025,.025,M.white,x,y,z);w.rotation.z=rz;w.castShadow=false;return w}
function makeBarrel(){
  const g=new THREE.Group(),m=std(0x8b5a2e,.82),band=M.darkSteel;
  cyl(g,.72,.76,1.48,m,0,.74,0);for(const y of [.16,.72,1.30])cyl(g,.77,.77,.10,band,0,y,0);
  for(let a=0;a<6;a++){const x=Math.cos(a*Math.PI/3)*.62,z=Math.sin(a*Math.PI/3)*.62;box(g,.08,1.35,.08,M.woodLight,x,.74,z)}
  return g
}
function makeGardenBed(){
  const g=new THREE.Group();box(g,5.4,.48,2.75,M.woodLight,0,.25,0);box(g,4.95,.34,2.30,std(0x5b3a24,.96),0,.52,0);
  for(const x of [-2.55,2.55])box(g,.24,.74,3.0,M.wood,x,.42,0);for(const z of [-1.30,1.30])box(g,5.25,.74,.24,M.wood,0,.42,z);
  const stem=std(0x3f8f3d,.86),tomato=std(0xe64b35,.58);
  for(let i=0;i<5;i++){const x=-1.9+i*.95;cyl(g,.045,.055,1.25,stem,x,1.10,0);for(let k=0;k<3;k++){const yy=.82+k*.34,zz=(k%2?-.28:.28);sph(g,.11,tomato,x+.10*(k-1),yy,zz,[1,1,1],10);const leaf=mesh(new THREE.ConeGeometry(.12,.36,5),stem,x-.16,yy+.05,-zz);leaf.rotation.z=.65;g.add(leaf)}}
  return g
}
function makeSunflower(){
  const g=new THREE.Group(),stem=std(0x4b9a42,.82),petal=std(0xf5c63f,.62),center=std(0x6b3c1d,.88);
  cyl(g,.055,.07,2.0,stem,0,1.0,0);sph(g,.22,center,0,2.02,0,[1,1,.55],12);
  for(let i=0;i<10;i++){const a=i*Math.PI/5,p=sph(g,.12,petal,Math.cos(a)*.28,2.02+Math.sin(a)*.28,.02,[1.4,.75,.45],8);p.rotation.z=a}
  return g
}
function makeTerracottaPot(){
  const g=new THREE.Group(),pot=std(0xb85f39,.82),soil=std(0x5a3a25,.96),leaf=std(0x4a9a43,.84);
  cyl(g,.54,.38,.74,pot,0,.37,0);cyl(g,.60,.60,.12,pot,0,.72,0);sph(g,.46,soil,0,.77,0,[1,.12,1],12);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;cyl(g,.035,.045,.9,leaf,0,1.15,0,0,.5*Math.sin(a));const l=mesh(new THREE.ConeGeometry(.14,.46,5),leaf,Math.cos(a)*.28,1.42,Math.sin(a)*.28);l.rotation.z=a;g.add(l)}
  return g
}


function roundedRectShape(w,h,r){
  const s=new THREE.Shape(),x=-w/2,y=-h/2,rr=Math.min(r,w/2,h/2);
  s.moveTo(x+rr,y);s.lineTo(x+w-rr,y);s.quadraticCurveTo(x+w,y,x+w,y+rr);
  s.lineTo(x+w,y+h-rr);s.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
  s.lineTo(x+rr,y+h);s.quadraticCurveTo(x,y+h,x,y+h-rr);
  s.lineTo(x,y+rr);s.quadraticCurveTo(x,y,x+rr,y);return s
}
function roundedSlab(parent,w,d,h,mat,x=0,y=0,z=0,r=.22,bevel=.06){
  const geo=new THREE.ExtrudeGeometry(roundedRectShape(w,d,r),{depth:h,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:bevel,bevelThickness:bevel});
  geo.translate(0,0,-h/2);geo.rotateX(-Math.PI/2);
  const o=mesh(geo,mat,x,y,z);parent.add(o);return o
}
function organic(parent,r,mat,x=0,y=0,z=0,scale=[1,1,1],kind='soft'){
  const geo=new THREE.SphereGeometry(r,20,14),a=geo.attributes.position;
  for(let i=0;i<a.count;i++){
    let px=a.getX(i),py=a.getY(i),pz=a.getZ(i),nx=px/r,ny=py/r,nz=pz/r;
    if(kind==='dogBody'){px*=.92+.10*Math.max(0,-nz);py*=.92+.10*Math.max(0,-nz);pz*=1+.06*Math.max(0,nz);py+=.07*r*(1-nz)}
    else if(kind==='dogHead'){px*=.96+.06*Math.max(0,-nz);py*=1+.08*Math.max(0,ny);pz*=.92;px*=1-.07*Math.max(0,-ny)}
    else if(kind==='catHead'){px*=1+.08*Math.max(0,-ny);py*=1+.06*Math.max(0,ny);pz*=.90;px*=1+.10*Math.max(0,-nz)*(1-Math.abs(ny))}
    else if(kind==='catBody'){px*=.90+.13*Math.max(0,-ny);py*=1+.08*Math.max(0,-ny);pz*=.92}
    else if(kind==='muzzle'){px*=1+.14*(1-Math.abs(ny));py*=.82;pz*=1.06}
    else if(kind==='paw'){px*=1.15;py*=.62;pz*=1.35}
    else if(kind==='raccoon'){px*=.96+.08*Math.max(0,-ny);py*=1.02;pz*=1.08}
    a.setXYZ(i,px,py,pz)
  }
  geo.computeVertexNormals();const o=mesh(geo,mat,x,y,z);o.scale.set(...scale);parent.add(o);return o
}
function tubePart(parent,pts,r,mat,segments=18){
  const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)));
  const o=mesh(new THREE.TubeGeometry(curve,segments,r,7,false),mat);parent.add(o);return o
}
function taperedTubePart(parent,pts,mat,tubular=32,radial=10,radiusFn=t=>.25){
  const curve=new THREE.CatmullRomCurve3(pts.map(p=>p.isVector3?p:new THREE.Vector3(...p))),geo=new THREE.TubeGeometry(curve,tubular,1,radial,false),a=geo.attributes.position,stride=radial+1,center=new THREE.Vector3();
  for(let i=0;i<a.count;i++){const ring=Math.min(tubular,Math.floor(i/stride)),t=ring/tubular;curve.getPointAt(t,center);const px=a.getX(i),py=a.getY(i),pz=a.getZ(i),r=radiusFn(t);a.setXYZ(i,center.x+(px-center.x)*r,center.y+(py-center.y)*r,center.z+(pz-center.z)*r)}
  geo.computeVertexNormals();const o=mesh(geo,mat);parent.add(o);return o
}

function softEar(parent,side,y,z,mat,floppy=false,scale=1){
  const sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(.50*side*scale,.12*scale);sh.lineTo(.18*side*scale,.88*scale);sh.lineTo(-.10*side*scale,.18*scale);sh.closePath();
  const geo=new THREE.ExtrudeGeometry(sh,{depth:.10*scale,bevelEnabled:true,bevelSegments:2,bevelSize:.045*scale,bevelThickness:.04*scale});
  geo.translate(0,0,-.05*scale);const o=mesh(geo,mat,side*.22,y,z);o.rotation.z=floppy?side*.55:side*.08;o.rotation.x=floppy?.20:-.05;parent.add(o);return o
}
function wheel(parent,x,z){
  const tire=mesh(new THREE.TorusGeometry(.42,.14,10,22),M.darkSteel,x,.48,z);tire.rotation.y=Math.PI/2;parent.add(tire);
  const hub=cyl(parent,.19,.19,.22,M.steel,x,.48,z,0,Math.PI/2);hub.rotation.z=Math.PI/2;return tire
}
function taperedTray(parent,bottomW,bottomD,topW,topD,h,mat,x=0,y=0,z=0){
  const bw=bottomW/2,bd=bottomD/2,tw=topW/2,td=topD/2;
  const v=[
    -bw,0,-bd, bw,0,-bd, bw,0,bd, -bw,0,bd,
    -tw,h,-td, tw,h,-td, tw,h,td, -tw,h,td
  ];
  const faces=[
    0,1,5, 0,5,4,
    1,2,6, 1,6,5,
    2,3,7, 2,7,6,
    3,0,4, 3,4,7,
    0,3,2, 0,2,1
  ];
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(faces);geo.computeVertexNormals();
  const m=mesh(geo,mat,x,y,z);parent.add(m);
  return m
}
function litterRim(parent,w,d,h,mat,y){
  roundedSlab(parent,w,.24,h,mat,0,y,-d/2,.10,.03);roundedSlab(parent,w,.24,h,mat,0,y,d/2,.10,.03);
  roundedSlab(parent,.24,d,h,mat,-w/2,y,0,.10,.03);roundedSlab(parent,.24,d,h,mat,w/2,y,0,.10,.03);
}


function heroTexture(base,accent,stripe,kind='fur'){
  const key='hero:'+base+':'+accent+':'+stripe+':'+kind;if(textureCache.has(key))return textureCache.get(key);
  const cv=document.createElement('canvas');cv.width=cv.height=256;const x=cv.getContext('2d');
  x.fillStyle='#'+new THREE.Color(base).getHexString();x.fillRect(0,0,256,256);
  const rng=seedRng((base^accent^stripe)>>>0);
  for(let i=0;i<1400;i++){const px=rng()*256,py=rng()*256,len=3+rng()*10,alpha=.035+rng()*.11;x.strokeStyle='rgba(255,244,218,'+alpha+')';x.lineWidth=.6+rng()*1.3;x.beginPath();x.moveTo(px,py);x.lineTo(px+(rng()-.5)*3,py+len);x.stroke()}
  if(kind==='fur'){x.strokeStyle='#'+new THREE.Color(stripe).getHexString();for(let band=0;band<9;band++){const cy=16+band*28+(rng()-.5)*8;x.globalAlpha=.22+rng()*.18;x.lineWidth=5+rng()*7;x.beginPath();x.moveTo(-12,cy);x.bezierCurveTo(60,cy-18,130,cy+20,270,cy-8);x.stroke()}x.globalAlpha=1}
  if(kind==='metal'){x.strokeStyle='rgba(255,255,255,.18)';x.lineWidth=1;for(let i=0;i<40;i++){x.beginPath();x.moveTo(rng()*256,rng()*256);x.lineTo(rng()*256,rng()*256);x.stroke()}for(let i=0;i<70;i++){x.fillStyle='rgba(91,45,21,.14)';x.fillRect(rng()*256,rng()*256,1+rng()*5,1+rng()*2)}}
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='fur'?2.2:2.8,kind==='fur'?2.2:2.8);t.colorSpace=THREE.SRGBColorSpace;textureCache.set(key,t);return t
}
function heroFur(base=0xe97925,accent=0xffb15b,stripe=0x8f3f18){
  const tex=heroTexture(base,accent,stripe,'fur');return new THREE.MeshPhysicalMaterial({map:tex,roughness:.78,metalness:0,sheen:.32,sheenColor:new THREE.Color(accent),clearcoat:.04})
}
function heroMetal(base,accent=0x5f321d,metal=.45){
  const tex=heroTexture(base,accent,accent,'metal');return new THREE.MeshPhysicalMaterial({map:tex,roughness:.42,metalness:metal,clearcoat:.18,clearcoatRoughness:.45})
}
function heroEye(parent,x,y,z,side=1){
  const white=new THREE.MeshPhysicalMaterial({color:0xfffbef,roughness:.18,clearcoat:.55});
  const green=new THREE.MeshPhysicalMaterial({color:0x62c84d,emissive:0x153d14,emissiveIntensity:.22,roughness:.12,clearcoat:.8});
  organic(parent,.245,white,x,y,z,[1.05,.92,.42],'soft');
  organic(parent,.135,green,x+side*.012,y-.005,z-.122,[1,.96,.36],'soft');
  organic(parent,.055,M.black,x+side*.012,y-.005,z-.168,[.72,1.24,.28],'soft');
  const brow=tubePart(parent,[[x-side*.19,y+.19,z-.12],[x,y+.25,z-.17],[x+side*.16,y+.18,z-.13]],.035,M.black,8);brow.rotation.z=side*.10
}
function heroFurTuft(parent,x,y,z,mat,scale=1,rz=0){
  const sh=new THREE.Shape();sh.moveTo(-.18*scale,0);sh.quadraticCurveTo(0,.52*scale,.18*scale,0);sh.lineTo(.06*scale,-.18*scale);sh.lineTo(0,-.05*scale);sh.lineTo(-.06*scale,-.18*scale);sh.closePath();
  const geo=new THREE.ExtrudeGeometry(sh,{depth:.055*scale,bevelEnabled:true,bevelSegments:2,bevelSize:.025*scale,bevelThickness:.02*scale});geo.translate(0,0,-.027*scale);
  const o=mesh(geo,mat,x,y,z);o.rotation.z=rz;parent.add(o);return o
}
function heroDecalTexture(kind){
  const key='decal:'+kind;if(textureCache.has(key))return textureCache.get(key);
  const cv=document.createElement('canvas');cv.width=256;cv.height=128;const x=cv.getContext('2d');x.clearRect(0,0,256,128);x.lineCap='round';x.lineJoin='round';x.strokeStyle='#f3e5cb';x.fillStyle='#f3e5cb';x.lineWidth=11;
  if(kind==='fish'){x.beginPath();x.moveTo(42,64);x.lineTo(188,64);x.stroke();for(let i=0;i<4;i++){const xx=82+i*26;x.beginPath();x.moveTo(xx,64);x.lineTo(xx-13,44);x.moveTo(xx,64);x.lineTo(xx-13,84);x.stroke()}x.beginPath();x.moveTo(42,64);x.lineTo(18,42);x.moveTo(42,64);x.lineTo(18,86);x.stroke();x.beginPath();x.arc(205,64,18,0,Math.PI*2);x.stroke()}
  else if(kind==='cat'){x.beginPath();x.arc(128,68,36,.15*Math.PI,.85*Math.PI,true);x.stroke();x.beginPath();x.moveTo(98,46);x.lineTo(104,18);x.lineTo(120,39);x.moveTo(136,39);x.lineTo(153,18);x.lineTo(159,47);x.stroke();x.fillStyle='#f3e5cb';x.beginPath();x.arc(115,66,4,0,7);x.arc(141,66,4,0,7);x.fill();x.beginPath();x.moveTo(128,73);x.lineTo(122,80);x.lineTo(134,80);x.closePath();x.fill();x.beginPath();x.moveTo(92,72);x.lineTo(66,65);x.moveTo(94,82);x.lineTo(67,86);x.moveTo(164,72);x.lineTo(190,65);x.moveTo(162,82);x.lineTo(189,86);x.stroke()}
  else if(kind==='paw'){for(const [px,py,r] of [[128,78,29],[87,45,15],[116,31,15],[145,31,15],[173,47,15]]){x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill()}}
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;textureCache.set(key,t);return t
}
function heroDecal(parent,kind,w,h,x,y,z,ry=0){
  const m=new THREE.MeshBasicMaterial({map:heroDecalTexture(kind),transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const p=mesh(new THREE.PlaneGeometry(w,h),m,x,y,z);p.rotation.y=ry;p.castShadow=false;p.receiveShadow=false;parent.add(p);return p
}

function makeCatTank(){
  const g=new THREE.Group(),vehicle=new THREE.Group();g.add(vehicle);
  const blue=heroMetal(0x2c6f9f,0x163b5d,.38),cream=heroMetal(0xeee2c9,0xa48a6c,.15),brass=heroMetal(0xc9842e,0x6e3518,.72),green=heroMetal(0x4d6f31,0x25391a,.34),rubber=heroMetal(0x25272a,0x0f1012,.05);
  const orange=heroFur(0xe97828,0xffb15a,0x8c3d18),creamFur=heroFur(0xf4d9b6,0xfff2d7,0xc58f62),pink=std(0xf08b7e,.42),scarf=heroMetal(0xd94336,0x7e1f1c,.08);

  // Reference-matched litter-box buggy: deep blue tub, cream lip, exposed wheels and front plate.
  taperedTray(vehicle,4.15,4.65,5.25,5.85,1.08,blue,0,.30,.10);
  litterRim(vehicle,5.34,5.96,.24,cream,1.40);
  roundedSlab(vehicle,4.34,4.78,.34,M.litter,0,1.06,.10,.50,.06);
  for(let i=0;i<34;i++){const grain=organic(vehicle,.055+Math.random()*.075,i%3===0?std(0xc8ad7b,.98):i%3===1?std(0xead8ad,.98):std(0xb79a66,.98),rand(-1.88,1.88),1.27+rand(-.02,.06),rand(-1.95,1.95),[1.55,.36,1.12],'soft');grain.castShadow=false}

  const wheels=[];
  for(const x of [-2.42,2.42])for(const z of [-1.66,1.66]){
    const wg=new THREE.Group();wg.position.set(x,.38,z);vehicle.add(wg);const arm=box(vehicle,.74,.18,.18,brass,x*.88,.70,z);arm.rotation.z=x<0?-.42:.42;
    const tire=mesh(new THREE.TorusGeometry(.54,.20,14,30),rubber);tire.rotation.y=Math.PI/2;wg.add(tire);
    const hub=mesh(new THREE.CylinderGeometry(.24,.24,.30,18),brass);hub.rotation.z=Math.PI/2;wg.add(hub);
    for(let a=0;a<8;a++){const ang=a*Math.PI/4,stud=organic(wg,.035,cream,0,Math.cos(ang)*.18,Math.sin(ang)*.18,[1,1,.7],'soft');stud.rotation.y=Math.PI/2}
    wg.userData={spin:0};wheels.push(wg)
  }
  // bumper / headlights / front paw badge
  roundedSlab(vehicle,2.55,.34,.78,cream,0,.62,-2.93,.17,.035);
  for(const x of [-1.58,1.58]){const lamp=organic(vehicle,.31,M.glow,x,.72,-2.92,[1,1,.58],'soft');const ring=mesh(new THREE.TorusGeometry(.34,.055,8,24),brass,x,.72,-2.94);vehicle.add(ring)}
  roundedSlab(vehicle,1.08,.12,.92,cream,0,.88,-3.03,.12,.025);heroDecal(vehicle,'paw',.80,.55,0,.89,-3.105,0);
  for(const x of [-2.00,-1.35,-.72,.72,1.35,2.00])bolt(vehicle,x,1.39,-2.85,brass);
  // side decals, patches and scratches
  heroDecal(vehicle,'fish',1.85,.90,-2.69,.88,.35,Math.PI/2);heroDecal(vehicle,'cat',1.55,.95,-2.69,.88,1.52,Math.PI/2);
  for(const [x,z,w,h] of [[-2.70,-.78,.32,.62],[-2.70,.90,.28,.45],[2.70,-.55,.30,.52]])roundedSlab(vehicle,w,.07,h,cream,x,.95,z,.05,.012);

  // rear cargo / flag / bell
  roundedSlab(vehicle,1.65,1.14,.96,heroMetal(0x486170,0x232e35,.45),-1.15,1.84,1.75,.18,.04);
  for(const x of [-1.76,-1.38,-1.00,-.62])bolt(vehicle,x,2.18,1.18,brass);
  tubePart(vehicle,[[-1.80,1.45,1.88],[-1.92,2.45,1.92],[-2.00,3.75,1.88]],.055,brass,12);
  const flagMat=new THREE.MeshPhysicalMaterial({color:0xefe1c4,roughness:.88,side:THREE.DoubleSide});const flag=roundedSlab(vehicle,1.62,.05,.82,flagMat,-1.19,3.18,1.89,.10,.02);flag.rotation.z=-.06;heroDecal(vehicle,'cat',.82,.50,-1.19,3.18,1.855,0);
  cyl(vehicle,.22,.30,.34,brass,-2.28,.93,1.34);tubePart(vehicle,[[-2.28,1.08,1.34],[-2.44,.73,1.47]],.055,brass,7);

  // Long brass/green cannon from the reference, independent of the cat.
  const turret=new THREE.Group();turret.position.set(1.18,1.92,.10);vehicle.add(turret);
  organic(turret,.68,brass,0,.08,0,[1.18,.44,1.02],'soft');
  const barrel=new THREE.Group();turret.add(barrel);
  const gun1=cyl(barrel,.24,.29,1.30,green,0,.10,-.95,Math.PI/2,0);gun1.rotation.x=Math.PI/2;
  const gun2=cyl(barrel,.31,.31,1.72,brass,0,.10,-2.25,Math.PI/2,0);gun2.rotation.x=Math.PI/2;
  const muzzle=cyl(barrel,.45,.38,.58,brass,0,.10,-3.30,Math.PI/2,0);muzzle.rotation.x=Math.PI/2;
  for(const z of [-1.42,-2.05,-2.68,-3.48]){const ring=mesh(new THREE.TorusGeometry(z<-3?.43:.31,.055,8,24),cream,0,.10,z);ring.rotation.x=Math.PI/2;barrel.add(ring)}
  heroDecal(barrel,'paw',.46,.34,.33,.10,-1.65,-Math.PI/2);

  // Hero cat: large triangular head, green eyes, cream muzzle, red scarf, huge fluffy tail.
  const cat=new THREE.Group();cat.position.set(-.48,1.72,.22);cat.scale.setScalar(1.20);cat.userData.baseScale=1.20;cat.rotation.y=Math.PI;g.add(cat);
  organic(cat,.78,orange,0,.72,.05,[1.00,1.12,.94],'catBody');
  organic(cat,.49,creamFur,0,.54,-.48,[.92,.82,.78],'soft');
  organic(cat,.27,orange,-.50,.72,-.72,[1.18,.80,1.25],'paw');organic(cat,.27,orange,.50,.72,-.72,[1.18,.80,1.25],'paw');

  // Continuous fluffy tail: one skinned-looking tube, no bead-chain silhouette.
  const tail=new THREE.Group();tail.position.set(.72,.68,.54);cat.add(tail);
  const tailPts=[[0,0,0],[.30,.10,.20],[.62,.36,.38],[.90,.72,.50],[1.00,1.08,.46],[.86,1.40,.31],[.62,1.64,.16],[.36,1.76,.02]];
  taperedTubePart(tail,tailPts,orange,36,11,t=>.25+.12*Math.sin(Math.PI*t)-.07*t);
  for(const [x,y,z,rz,s] of [[.55,.40,.36,.30,.30],[.86,.78,.48,.38,.36],[.82,1.22,.38,-.15,.34],[.56,1.57,.18,-.28,.30]])heroFurTuft(tail,x,y,z,orange,s,rz);
  organic(tail,.23,creamFur,.35,1.77,.02,[1.18,1.04,1.16],'soft');
  const tailSegments=[tail];
  // scarf tied at the neck with two flying tails
  roundedSlab(cat,1.28,.42,.20,scarf,0,1.18,-.04,.14,.035);
  const s1=roundedSlab(cat,.24,.90,.14,scarf,-.50,1.16,.54,.07,.02);s1.rotation.y=.15;s1.rotation.z=.10;
  const s2=roundedSlab(cat,.22,.82,.13,scarf,-.62,1.06,.58,.07,.02);s2.rotation.y=-.28;s2.rotation.z=-.18;

  const head=new THREE.Group();head.position.set(0,1.84,-.12);cat.add(head);
  organic(head,.76,orange,0,0,0,[1.12,.98,.98],'catHead');
  // pronounced forehead/cheeks for the reference expression
  organic(head,.28,orange,-.38,.05,-.35,[1.08,.92,.82],'soft');organic(head,.28,orange,.38,.05,-.35,[1.08,.92,.82],'soft');
  organic(head,.38,creamFur,-.20,-.17,-.59,[1.08,.72,.88],'muzzle');organic(head,.38,creamFur,.20,-.17,-.59,[1.08,.72,.88],'muzzle');
  const earL=softEar(head,-1,.44,.02,orange,false,1.08),earR=softEar(head,1,.44,.02,orange,false,1.08);
  softEar(head,-1,.47,-.005,pink,false,.68);softEar(head,1,.47,-.005,pink,false,.68);
  heroEye(head,-.30,.16,-.70,-1);heroEye(head,.30,.16,-.70,1);
  organic(head,.095,pink,0,-.18,-.91,[1.02,.72,.60],'soft');
  tubePart(head,[[-.02,-.25,-.83],[0,-.31,-.88],[.05,-.34,-.83]],.025,M.black,6);
  // whiskers
  for(const side of [-1,1])for(let k=0;k<4;k++){const yy=-.18+k*.10;const w=tubePart(head,[[side*.24,yy,-.74],[side*.52,yy+(k-1.5)*.025,-.86],[side*.84,yy+(k-1.5)*.05,-.78]],.012,M.white,7);w.renderOrder=2}
  // fur crown / cheek tufts
  for(const [x,y,s,r] of [[-.42,.48,.45,-.30],[-.18,.58,.38,-.12],[.12,.60,.34,.06],[.38,.49,.44,.28],[-.56,-.06,.34,-.75],[.56,-.06,.34,.75]])heroFurTuft(head,x,y,.02,orange,s,r);

  // paws gripping cannon as in reference
  organic(cat,.25,creamFur,-.14,1.22,-.88,[1.16,.82,1.34],'paw');organic(cat,.25,creamFur,.38,1.20,-.82,[1.16,.82,1.34],'paw');

  // True 3D hero: no sprites, no view switching.
  vehicle.visible=true;cat.visible=true;
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sx=shadowCanvas.getContext('2d'),sg=sx.createRadialGradient(64,64,5,64,64,60);sg.addColorStop(0,'rgba(30,20,12,.55)');sg.addColorStop(.55,'rgba(30,20,12,.28)');sg.addColorStop(1,'rgba(30,20,12,0)');sx.fillStyle=sg;sx.fillRect(0,0,128,128);const st=new THREE.CanvasTexture(shadowCanvas),sm=new THREE.MeshBasicMaterial({map:st,transparent:true,depthWrite:false,opacity:.75});const contactStrong=mesh(new THREE.PlaneGeometry(6.4,7.1),sm,0,.025,.18);contactStrong.rotation.x=-Math.PI/2;contactStrong.castShadow=false;contactStrong.receiveShadow=false;g.add(contactStrong);
  g.userData={tracks:wheels,wheels,cat,head,earL,earR,scarfTails:[s1,s2],turret,barrel,muzzle,vehicle,tail,tailSegments,catYaw:cat.rotation.y,recoil:0,kind:'litterbox',modelStyle:'true-3d-r8'};return g
}
function makeMouse(){
  const g=new THREE.Group(),fur=heroFur(0xaeb1b6,0xe0e3e6,0x74777d),belly=heroFur(0xd9d4cc,0xf2eee8,0xb9b2a8),pink=new THREE.MeshPhysicalMaterial({color:0xf0a5b0,roughness:.62,clearcoat:.08}),eye=new THREE.MeshPhysicalMaterial({color:0x17191d,roughness:.18,clearcoat:.75});
  // Compact pear-shaped mouse body: visible at game distance without reading as a rabbit.
  organic(g,.34,fur,0,.43,.02,[1.20,.94,1.34],'soft');
  organic(g,.21,belly,0,.44,-.27,[.82,1.10,.68],'soft');
  const head=new THREE.Group();head.position.set(0,.75,-.31);g.add(head);
  organic(head,.285,fur,0,0,0,[1.02,.94,1.08],'soft');
  // Smaller, rounder ears keep the silhouette mouse-like.
  for(const side of [-1,1]){organic(head,.155,pink,side*.20,.14,.03,[.50,.90,.86],'soft');organic(head,.116,fur,side*.20,.14,.04,[.45,.87,.84],'soft')}
  // Eyes, muzzle and nose.
  organic(head,.064,eye,-.10,.042,-.268,[1,.95,.48],'soft');organic(head,.064,eye,.10,.042,-.268,[1,.95,.48],'soft');
  organic(head,.105,belly,0,-.07,-.24,[1.16,.70,.84],'soft');organic(head,.052,pink,0,-.055,-.345,[1,.78,.72],'soft');
  for(const side of [-1,1])for(const yy of [-.10,-.025,.05])tubePart(head,[[side*.08,yy,-.29],[side*.25,yy+(yy*.15),-.37],[side*.43,yy+(yy*.22),-.33]],.007,M.white,5);
  // Front paws grip the rim; rear legs are rigged for the fetch/run cycle.
  organic(g,.095,pink,-.22,.34,-.30,[1.16,.50,1.26],'paw');organic(g,.095,pink,.22,.34,-.30,[1.16,.50,1.26],'paw');
  const legs=[];for(const side of [-1,1]){const hip=new THREE.Group();hip.position.set(side*.22,.32,.18);g.add(hip);tubePart(hip,[[0,0,0],[side*.02,-.15,.10],[side*.03,-.27,.18]],.045,fur,8);organic(hip,.075,pink,side*.02,-.30,.22,[1.18,.52,1.36],'paw');legs.push(hip)}
  // One continuous pink tail.
  tubePart(g,[[.24,.34,.22],[.48,.31,.42],[.69,.25,.56],[.88,.18,.48],[.99,.16,.31]],.032,pink,18);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});shadowBudget(g,4);
  g.userData={fireCooldown:.4,fetch:null,mode:'ride',phase:rand(0,6.28),head,legs,gait:0,modelStyle:'mouse-reference-r6'};return g
}
function makeBird(){
  const g=new THREE.Group(),feather=texStd(0x263341,0x111a22,.82,0,4,'fur'),wingMat=texStd(0x18232e,0x0d1319,.86,0,4,'fur'),beak=std(0xf4ad22,.58),scarf=std(0xd84435,.55);
  organic(g,.48,feather,0,.50,.04,[.88,1.20,1.04],'soft');organic(g,.43,feather,0,1.05,-.16,[1,.96,1.04],'soft');
  const head=new THREE.Group();head.position.set(0,1.22,-.35);g.add(head);organic(head,.38,feather,0,0,0,[1,.96,1.02],'soft');
  cone(head,.18,.58,beak,0,-.03,-.46,Math.PI/2,0);
  organic(head,.105,M.white,-.15,.10,-.35,[1,.96,.58],'soft');organic(head,.105,M.white,.15,.10,-.35,[1,.96,.58],'soft');
  organic(head,.046,M.pupil,-.15,.10,-.43,[1,1,.46],'soft');organic(head,.046,M.pupil,.15,.10,-.43,[1,1,.46],'soft');
  const leftWing=new THREE.Group(),rightWing=new THREE.Group();leftWing.position.set(-.38,.63,.08);rightWing.position.set(.38,.63,.08);g.add(leftWing,rightWing);
  organic(leftWing,.42,wingMat,-.23,0,0,[1.45,.30,.78],'soft');organic(rightWing,.42,wingMat,.23,0,0,[1.45,.30,.78],'soft');
  roundedSlab(g,.88,.34,.17,scarf,0,.72,.02,.10,.025);
  const tail=new THREE.Group();tail.position.set(0,.36,.40);g.add(tail);for(const x of [-.22,0,.22]){const f=softEar(tail,x<0?-1:1,.0,.0,wingMat,false,.42);f.position.x=x;f.rotation.x=-1.25}
  shadowBudget(g,4);g.userData={leftWing,rightWing,head,tail,phase:rand(0,6.28),modelStyle:'organic-r8'};return g
}

function makeDog(type=0){
  const g=new THREE.Group(),fur=[M.dog1,M.dog2,M.dog3,M.dog4][type%4],dark=[M.dog2,M.dog4,M.black,M.dog1][type%4],floppy=type%2===1;
  const breed=type%4;
  // Sculpted torso/chest/neck create a single canine silhouette instead of stacked spheres.
  organic(g,.80,fur,0,1.10,.24,[breed===1?1.15:.98,breed===1?.82:.90,breed===2?1.58:1.48],'dogBody');
  organic(g,.61,fur,0,1.40,-.86,[breed===1?1.08:.92,1.08,.86],'dogBody');
  tubePart(g,[[0,1.42,-.72],[0,1.60,-1.05],[0,1.82,-1.26]],.37,fur,14);
  const head=new THREE.Group();head.position.set(0,1.88,-1.42);g.add(head);
  organic(head,.66,fur,0,0,0,[breed===1?1.14:1.05,.98,1.05],'dogHead');
  organic(head,.39,dark,0,-.16,-.56,[breed===1?1.22:1.02,.68,1.26],'muzzle');
  organic(head,.115,M.black,0,-.10,-.85,[1.08,.72,.82],'soft');
  organic(head,.100,M.white,-.22,.13,-.56,[1,.94,.55],'soft');organic(head,.100,M.white,.22,.13,-.56,[1,.94,.55],'soft');
  organic(head,.047,M.pupil,-.22,.13,-.64,[1,1,.45],'soft');organic(head,.047,M.pupil,.22,.13,-.64,[1,1,.45],'soft');
  const dogEarL=softEar(head,-1,.38,-.03,fur,floppy,floppy?.88:.82),dogEarR=softEar(head,1,.38,-.03,fur,floppy,floppy?.88:.82);dogEarL.userData.restZ=dogEarL.rotation.z;dogEarR.userData.restZ=dogEarR.rotation.z;
  // Open jaw and tongue.
  organic(head,.27,M.black,0,-.36,-.55,[.92,.42,.72],'soft');organic(head,.18,M.red,0,-.45,-.62,[.72,.24,.82],'soft');
  for(const x of [-.18,-.06,.06,.18]){const tooth=cone(head,.045,.18,M.white,x,-.24,-.72,Math.PI,0);tooth.rotation.x=Math.PI}
  // Rigged legs: each leg pivots from its own hip instead of around the dog's origin.
  const legs=[];
  for(const x of [-.48,.48])for(const z of [-.52,.70]){
    const front=z<0,hip=new THREE.Group();hip.position.set(x,1.04,z);g.add(hip);
    const phase=x<0?-.08:.08;
    tubePart(hip,[[0,0,0],[phase,-.38,front?-.08:.08],[0,-.77,front?-.16:.14]],breed===1?.14:.12,fur,12);
    organic(hip,.18,dark,0,-.86,front?-.20:.18,[1.25,.58,1.52],'paw');legs.push(hip)
  }
  const dogTail=new THREE.Group();dogTail.position.set(0,1.28,1.28);g.add(dogTail);
  tubePart(dogTail,[[0,0,0],[.18,.25,.38],[.42,.52,.64],[.30,.75,.82]],breed===3?.12:.10,fur,16);
  roundedSlab(g,1.18,.60,.16,M.collar,0,1.50,-.96,.14,.025);organic(g,.105,M.glow,0,1.35,-1.38,[1,.8,.45],'soft');
  // Fur tufts and bandana.
  for(const x of [-.28,0,.28])softEar(g,x<0?-1:1,1.72+x*.2,-.52,fur,false,.22);
  roundedSlab(g,1.30,.66,.15,std(type%2?0xd13c35:0xb52f2b,.62),0,1.44,-.20,.12,.02);
  // Shoulder/haunch masses, cheek fur and toe definition make the silhouette read as a dog at game distance.
  organic(g,.46,fur,0,1.12,-.44,[1.25,1.02,.90],'dogBody');
  organic(g,.49,fur,0,1.05,.78,[1.22,.98,1.00],'dogBody');
  organic(head,.24,fur,-.28,-.08,-.36,[1.05,.90,.78],'soft');organic(head,.24,fur,.28,-.08,-.36,[1.05,.90,.78],'soft');
  organic(head,.18,dark,0,.05,-.61,[1.05,.70,1.05],'muzzle');
  const innerEar=std(type%2?0x8e665e:0xb98269,.78);softEar(head,-1,.33,-.055,innerEar,floppy,.48);softEar(head,1,.33,-.055,innerEar,floppy,.48);
  for(const z of [-.10,.12,.34,.56]){const tuft=softEar(g,z<.25?-1:1,1.74,z+.28,fur,false,.18);tuft.rotation.x=-.25}
  shadowBudget(g,8);g.userData={hp:1+Math.floor(type/2),speed:4.35+type*.42,type,legs,dogEarL,dogEarR,dogTail,head,fireCooldown:rand(.25,.75),preferredRange:7.2+type*.45,flankSign:Math.random()<.5?-1:1,thinkTimer:rand(0,.35),target:null,dodgeSeed:rand(0,6.28),modelStyle:'organic-r3'};
  g.scale.set(breed===1?1.30:breed===2?1.16:1.22,breed===1?1.10:1.18,1.24);g.userData.baseScale=g.scale.clone();return g
}
function makeBone(){
  const g=new THREE.Group();
  const shaft=mesh(boneShaftGeo,M.bone);shaft.rotation.x=Math.PI/2;g.add(shaft);
  for(const x of [-.42,.42])for(const y of [-.11,.11]){const end=mesh(boneEndGeo,M.bone,x,y,0);g.add(end)}
  g.rotation.z=.4;noShadow(g);return g
}
function fireBone(dog,target=player,angleOffset=0){
  if(!dog?.parent||!target)return;
  const aim=target.position.clone();aim.y+=target===player?1.2:1.0;
  if(target===player&&player.userData.velocity){const d=dog.position.distanceTo(player.position),lead=clamp(d/55,.08,.28);aim.x+=player.userData.velocity.x*lead;aim.z+=player.userData.velocity.z*lead}
  const origin=dog.userData.shotOrigin||(dog.userData.shotOrigin=new THREE.Vector3());dog.localToWorld(origin.set(0,1.70,-1.80));
  const dir=aim.sub(origin).normalize();if(angleOffset){const cs=Math.cos(angleOffset),sn=Math.sin(angleOffset),x=dir.x,z=dir.z;dir.x=x*cs-z*sn;dir.z=x*sn+z*cs}
  const b=makeBone();b.position.copy(origin).addScaledVector(dir,.9);b.rotation.y=Math.atan2(dir.x,dir.z);scene.add(b);
  boneShots.push({mesh:b,v:dir.multiplyScalar(14.5+dog.userData.type*1.15),life:3.2,spin:rand(-13,13),owner:dog});sfx.bone()
}


function makeRaccoon(){
  const g=new THREE.Group();
  organic(g,.56,M.raccoon,0,1.00,.05,[1,.98,1.18],'raccoon');
  tubePart(g,[[0,1.28,-.18],[0,1.50,-.42],[0,1.68,-.56]],.29,M.raccoon,12);
  const head=new THREE.Group();head.position.set(0,1.72,-.52);g.add(head);
  organic(head,.47,M.raccoon,0,0,0,[1,.94,1.02],'dogHead');organic(head,.27,M.raccoonDark,0,-.12,-.47,[1,.60,1.08],'muzzle');
  roundedSlab(head,.86,.12,.18,M.raccoonDark,0,.12,-.43,.10,.02);
  organic(head,.088,M.white,-.20,.13,-.55,[1,.95,.60],'soft');organic(head,.088,M.white,.20,.13,-.55,[1,.95,.60],'soft');
  organic(head,.042,M.pupil,-.20,.13,-.62,[1,1,.48],'soft');organic(head,.042,M.pupil,.20,.13,-.62,[1,1,.48],'soft');
  softEar(head,-1,.30,-.02,M.raccoon,false,.50);softEar(head,1,.30,-.02,M.raccoon,false,.50);
  organic(head,.075,M.black,0,-.12,-.72,[1,.72,.80],'soft');
  const legs=[];for(const x of [-.28,.28])for(const z of [-.16,.24]){const hip=new THREE.Group();hip.position.set(x,.94,z);g.add(hip);tubePart(hip,[[0,0,0],[0,-.34,0],[.04*Math.sign(x),-.68,-.06]],.075,M.raccoonDark,10);organic(hip,.12,M.raccoonDark,0,-.76,-.10,[1.2,.55,1.35],'paw');legs.push(hip)}
  // One animated raccoon tail, with alternating dark ring overlays.
  const raccoonTail=new THREE.Group();raccoonTail.position.set(.30,1.02,.36);g.add(raccoonTail);
  const rtPts=[[0,0,0],[.26,.16,.25],[.48,.38,.43],[.62,.62,.46],[.58,.84,.34]];
  taperedTubePart(raccoonTail,rtPts,M.raccoon,18,8,t=>.15-.045*t);
  for(const [t,r] of [[.18,.145],[.46,.13],[.72,.112]]){const p=new THREE.CatmullRomCurve3(rtPts.map(v=>new THREE.Vector3(...v))).getPointAt(t),ring=mesh(new THREE.TorusGeometry(r,.038,6,14),M.raccoonDark,p.x,p.y,p.z);ring.rotation.x=Math.PI/2;raccoonTail.add(ring)}
  const cart=new THREE.Group();cart.position.set(0,.24,.92);g.add(cart);roundedSlab(cart,1.48,1.16,.18,M.steel,0,.45,0,.16,.035);
  for(const x of [-.62,.62])for(const z of [-.46,.46])tubePart(cart,[[x,.45,z],[x,.86,z],[x,1.16,z]],.035,M.steel,8);
  for(let x=-.52;x<=.52;x+=.26)tubePart(cart,[[x,.48,-.50],[x,.83,-.50],[x,1.08,-.50]],.023,M.steel,6);
  const cartWheels=[];for(const x of [-.56,.56])cartWheels.push(wheel(cart,x,.46));
  organic(cart,.45,std(0xb73731,.55,.25),0,1.12,.04,[1,1,1],'soft');
  const shield=mesh(new THREE.CylinderGeometry(.62,.62,.12,22),M.steel,.78,1.16,-.20);shield.rotation.z=Math.PI/2;g.add(shield);
  tubePart(g,[[-.64,1.05,-.03],[-.80,1.55,-.08],[-1.02,2.05,-.18]],.055,M.wood,10);
  const hoop=mesh(new THREE.TorusGeometry(.48,.055,8,22),M.steel,-1.08,2.20,-.25);hoop.rotation.y=Math.PI/2;hoop.rotation.z=-.45;g.add(hoop);
  shadowBudget(g,7);g.userData={hp:2,speed:4.1,fireCooldown:rand(.55,1.1),escort:null,phase:rand(0,6.28),cart,cartWheels,legs,raccoonTail,head,gait:0,wheelSpin:0,modelStyle:'organic-r8'};return g
}
function makePoopBall(mat=M.trash){
  const g=new THREE.Group(),a=mesh(poopGeoA,mat,0,0,0),b=mesh(poopGeoB,mat,.02,.15,0);a.scale.set(1.15,.8,1);b.scale.set(1,.7,1);g.add(a,b);noShadow(g);return g
}
function fireMousePoop(target){
  if(!mouseCompanion||!target)return;
  const origin=mouseCompanion.userData.shotOrigin||(mouseCompanion.userData.shotOrigin=new THREE.Vector3());origin.copy(mouseCompanion.position);origin.y+=.7;
  const dir=target.position.clone();dir.y+=1;dir.sub(origin).normalize();const m=makePoopBall(mousePoopMat);m.position.copy(origin);scene.add(m);mousePoops.push({mesh:m,v:dir.multiplyScalar(15),life:2.2,spin:rand(-12,12)});sfx.poop()
}
function fireRaccoonPoop(r,target){
  if(!r?.parent||!target)return;
  const origin=r.userData.shotOrigin||(r.userData.shotOrigin=new THREE.Vector3());origin.copy(r.position);origin.y+=1.25;
  const dir=target.position.clone();dir.y+=1;dir.sub(origin).normalize();const m=makePoopBall(M.trash);m.position.copy(origin);scene.add(m);enemyPoops.push({mesh:m,v:dir.multiplyScalar(11.5),life:2.8,spin:rand(-10,10),owner:r});sfx.poop()
}
function spawnRaccoon(escort=null){
  const r=makeRaccoon();r.userData.escort=escort||nearestEnemy(home.position,999);
  const anchor=escort?.position||new THREE.Vector3(rand(-arena.halfW*.55,arena.halfW*.55),0,arena.minZ+10),p=findClearSpawn(anchor.x+rand(-3,3),anchor.z+rand(1.5,3),1.05,18);
  r.position.set(p[0],0,p[1]);scene.add(r);raccoons.push(r);return r
}

function makeAllyCat(i=0){
  const g=new THREE.Group(),palette=[[0xe97828,0xffb15a,0x8c3d18],[0x86644e,0xb99070,0x4c352a],[0xbab6ae,0xe4dfd7,0x77736d],[0x4d5660,0x7b8793,0x282e34]][i%4],fur=heroFur(...palette),cream=heroFur(0xf1d4ad,0xffead0,0xba875c);
  organic(g,.49,fur,0,1.04,.06,[.96,1.16,.92],'catBody');organic(g,.29,cream,0,.96,-.38,[.90,.84,.78],'soft');
  const head=new THREE.Group();head.position.set(0,1.72,-.17);g.add(head);organic(head,.45,fur,0,0,0,[1.04,.98,.98],'catHead');
  organic(head,.22,cream,-.12,-.10,-.38,[1,.74,.84],'muzzle');organic(head,.22,cream,.12,-.10,-.38,[1,.74,.84],'muzzle');
  const earL=softEar(head,-1,.25,.02,fur,false,.55),earR=softEar(head,1,.25,.02,fur,false,.55);
  organic(head,.085,M.eye,-.16,.08,-.43,[1,.94,.50],'soft');organic(head,.085,M.eye,.16,.08,-.43,[1,.94,.50],'soft');
  organic(head,.038,M.pupil,-.16,.08,-.50,[1,1,.38],'soft');organic(head,.038,M.pupil,.16,.08,-.50,[1,1,.38],'soft');
  organic(head,.055,std(0xe98f86,.55),0,-.11,-.54,[1,.72,.62],'soft');
  const legs=[];for(const x of [-.23,.23])for(const z of [-.12,.20]){const hip=new THREE.Group();hip.position.set(x,.75,z);g.add(hip);tubePart(hip,[[0,0,0],[0,-.30,z<0?-.04:.04],[0,-.57,z<0?-.08:.08]],.075,fur,9);organic(hip,.11,cream,0,-.62,z<0?-.10:.10,[1.12,.55,1.30],'paw');legs.push(hip)}
  const tail=new THREE.Group();tail.position.set(.40,1.00,.28);g.add(tail);tubePart(tail,[[0,0,0],[.24,.18,.30],[.37,.48,.48],[.25,.72,.55]],.085,fur,14);
  roundedSlab(g,.72,.38,.16,M.red,0,1.16,.04,.10,.02);
  const gun=new THREE.Group();gun.position.set(.42,1.30,-.18);g.add(gun);roundedSlab(gun,.14,.16,.86,M.darkSteel,0,0,-.34,.04,.01);const gb=mesh(new THREE.CylinderGeometry(.05,.055,.82,10),M.steel,0,.01,-.98);gb.rotation.x=Math.PI/2;gun.add(gb);
  shadowBudget(g,7);g.userData={legs,head,earL,earR,tail,gun,fireCooldown:rand(.15,.8),slot:i,phase:rand(0,6.28),hp:2,modelStyle:'organic-r8'};g.scale.setScalar(.9);return g
}
function spawnCatSquad(){
  for(const a of allies)retire(a);allies.length=0;
  const count=Math.min(6,4+Math.floor((state.level-1)/8)),slots=[[-6,-2],[6,-2],[-8,-7],[8,-7],[-10,-12],[10,-12]];
  for(let i=0;i<count;i++){
    const a=makeAllyCat(i),off=slots[i],sx=clamp(player.position.x+off[0],-arena.halfW+4,arena.halfW-4),sz=clamp(player.position.z+off[1],arena.minZ+5,arena.maxZ-5),p=findClearSpawn(sx,sz,.9,16);
    a.scale.setScalar(1.0*tune.allyScale);a.userData.hp=tune.allyHp;a.position.set(p[0],0,p[1]);scene.add(a);allies.push(a)
  }
}
function fireAlly(a,target){
  const dir=target.position.clone().sub(a.position).setY(.2).normalize(),m=mesh(allyShotGeo,M.glow);m.castShadow=false;m.position.copy(a.position);m.position.y+=1.35;m.position.addScaledVector(dir,.8);scene.add(m);
  feathers.push({mesh:m,v:dir.multiplyScalar(16),life:1.7,ally:true})
}
function updateAllies(dt,now){
  for(let i=0;i<allies.length;i++){
    const a=allies[i],u=a.userData,target=nearestHostile(a.position,22);let gx,gz;if(target){gx=target.position.x+(i%3-1)*2.2;gz=target.position.z+5.2+(i%2)*1.5}else{gx=player.position.x+(i%3-1)*3.0;gz=player.position.z-3-Math.floor(i/3)*2.8}
    gx=clamp(gx,-arena.halfW+3,arena.halfW-3);gz=clamp(gz,arena.minZ+3,arena.maxZ-5);let dx=gx-a.position.x,dz=gz-a.position.z,d=Math.hypot(dx,dz),oldX=a.position.x,oldZ=a.position.z;
    u.navTimer=(u.navTimer||0)-dt;const steer=u.navVec||(u.navVec=new THREE.Vector3(0,0,-1));if(d>.55&&u.navTimer<=0){navDirection(a.position,gx,gz,.68,(i%2?1:-1),steer,allies,a,steer);u.navTimer=mobilePerf?.09:.06}
    if(d>.55){const nx=a.position.x+steer.x*4.2*dt,nz=a.position.z+steer.z*4.2*dt;if(!blocked(nx,a.position.z,.65))a.position.x=nx;if(!blocked(a.position.x,nz,.65))a.position.z=nz}
    const moved=Math.hypot(a.position.x-oldX,a.position.z-oldZ);u.gait=(u.gait||0)+moved*10;if(moved>.002){const yaw=Math.atan2(a.position.x-oldX,a.position.z-oldZ);a.rotation.y+=normalizeAngle(yaw-a.rotation.y)*(1-Math.exp(-dt*9))}
    for(let k=0;k<u.legs.length;k++){const phase=(k%2?Math.PI:0)+(k>1?Math.PI:0);u.legs[k].rotation.x=Math.sin(u.gait+u.phase+phase)*.42*(moved>.001?1:.08)}
    if(u.tail)u.tail.rotation.z=Math.sin(now*4.5+u.phase)*.26;if(u.head)u.head.rotation.z=Math.sin(now*2.1+u.phase)*.025;
    if(target&&u.gun){const ty=Math.atan2(target.position.x-a.position.x,target.position.z-a.position.z),local=normalizeAngle(ty-a.rotation.y);u.gun.rotation.y+=normalizeAngle(clamp(local,-1.2,1.2)-u.gun.rotation.y)*(1-Math.exp(-dt*10))}
    a.position.y=.03+(moved>.001?Math.abs(Math.sin(u.gait+u.phase))*.045:0);u.fireCooldown-=dt;if(target&&u.fireCooldown<=0&&lineClearXZ(a.position,target.position,.42)){fireAlly(a,target);u.fireCooldown=(.38+Math.random()*.36)*tune.allyFire}
  }
}

function makeHouse(roofColor=0x2f6fa8,scale=1){
  const g=new THREE.Group(),roof=std(roofColor,.78);box(g,5.2,3.2,4.5,M.plaster,0,1.6,0);box(g,5.45,.28,.32,M.wood,0,2.65,-2.28);box(g,.28,3.1,4.7,M.wood,-2.25,1.7,0);box(g,.28,3.1,4.7,M.wood,2.25,1.7,0);
  const r=mesh(new THREE.ConeGeometry(3.85,2.7,4),roof,0,4.25,0);r.rotation.y=Math.PI/4;g.add(r);box(g,1.05,2.0,.2,M.wood,0,1.1,-2.3);
  for(const x of [-1.55,1.55]){box(g,.9,.82,.18,std(0x6fd0ff,.15),x,1.72,-2.32);box(g,1.08,.12,.25,M.wood,x,1.1,-2.34)}
  for(const x of [-1.55,1.55])for(let i=0;i<4;i++)sph(g,.09,std(i%2?0xffcf3f:0xf45c86,.7),x-.28+i*.18,1.15,-2.54,[1,1,1],10);
  g.scale.setScalar(scale);return g;
}
function makeTree(leaf=0x55a83e,scale=1){const g=new THREE.Group();cyl(g,.34,.48,4.2,M.wood,0,2.1,0);const lm=std(leaf,.98);for(const [x,y,z,r] of [[0,4.5,0,1.65],[-.9,4.25,.25,1.1],[.9,4.3,-.15,1.18],[0,5.25,.1,1.1]])sph(g,r,lm,x,y,z,[1,1.05,1]);g.scale.setScalar(scale);return g}
function makeRock(scale=1){const o=mesh(new THREE.DodecahedronGeometry(1.05,1),M.stone,0,.8,0);o.scale.set(scale,scale*.72,scale);o.rotation.set(rand(-.18,.18),rand(0,Math.PI),rand(-.12,.12));return o}
function makeFence(len=5){
  const g=new THREE.Group(),posts=[];for(let x=-len/2;x<=len/2;x+=1.55)posts.push(x);
  const inst=new THREE.InstancedMesh(fenceUnitGeo,M.wood,posts.length+2),d=new THREE.Object3D();let n=0;
  for(const x of posts){d.position.set(x,.62,0);d.scale.set(.18,1.25,.18);d.updateMatrix();inst.setMatrixAt(n++,d.matrix)}
  for(const y of [.92,.36]){d.position.set(0,y,0);d.scale.set(len,.18,.16);d.updateMatrix();inst.setMatrixAt(n++,d.matrix)}
  inst.instanceMatrix.needsUpdate=true;inst.castShadow=true;inst.receiveShadow=true;inst.computeBoundingSphere();g.add(inst);return g
}
function makeWatchTower(){const g=new THREE.Group();for(const x of [-1.15,1.15])for(const z of [-1.15,1.15])cyl(g,.13,.18,4.6,M.wood,x,2.3,z);box(g,3.0,.3,3.0,M.woodLight,0,4.25,0);for(const x of [-1.35,1.35])box(g,.16,1.2,3.0,M.wood,x,4.9,0);for(const z of [-1.35,1.35])box(g,3.0,1.2,.16,M.wood,0,4.9,z);const roof=mesh(new THREE.ConeGeometry(2.35,2.2,4),std(0x3c78af,.8),0,6.1,0);roof.rotation.y=Math.PI/4;g.add(roof);return g}
function makeCastle(){const g=new THREE.Group();for(const x of [-6,-2,2,6]){box(g,2.2,6.5,2.2,M.stone,x,3.25,0);const roof=mesh(new THREE.ConeGeometry(1.75,2.4,4),std(0x3976b1,.75),x,7.6,0);roof.rotation.y=Math.PI/4;g.add(roof)}box(g,11.5,4.8,2.0,M.stone,0,2.4,.6);box(g,4,8.2,3.0,M.plaster,0,4.1,1.0);const roof=mesh(new THREE.ConeGeometry(2.6,3.0,4),std(0xc34d40,.72),0,9.25,1.0);roof.rotation.y=Math.PI/4;g.add(roof);g.scale.setScalar(1.18);return g}
function makeBarnLandmark(){
  const g=new THREE.Group(),red=std(0xa54c36,.84),trim=std(0xf0dfbd,.78),roofMat=std(0x5b4335,.88);
  box(g,8.4,4.2,6.2,red,0,2.1,0);const roof=mesh(new THREE.ConeGeometry(5.5,3.0,4),roofMat,0,5.35,0);roof.rotation.y=Math.PI/4;g.add(roof);
  box(g,3.1,3.3,.22,trim,0,1.85,-3.18);box(g,.18,3.1,.28,red,0,1.85,-3.34);box(g,2.9,.18,.28,red,0,1.85,-3.34);
  const silo=new THREE.Group();cyl(silo,1.55,1.65,5.8,std(0xb8b4a6,.76),0,2.9,0);cone(silo,1.75,1.65,std(0x7b7165,.76),0,6.62,0);silo.position.set(6,0,1.0);g.add(silo);
  return g
}
function makeWindmillLandmark(){
  const g=new THREE.Group(),stone=std(0xc8b79a,.88),wood=std(0x6a472d,.82),roofMat=std(0x8e5139,.82);
  cyl(g,1.55,2.15,5.6,stone,0,2.8,0);cone(g,2.2,2.4,roofMat,0,6.2,0);
  const hub=sph(g,.34,wood,0,4.55,-1.72,[1,1,.65],10);hub.castShadow=false;
  for(let i=0;i<4;i++){const blade=box(g,.34,4.6,.18,wood,0,4.55,-1.88);blade.rotation.z=i*Math.PI/2+.34;blade.castShadow=false}
  for(const p of [[-4.8,0,1.4],[4.5,0,2.1]]){const bale=cyl(g,1.0,1.0,1.5,std(0xc49a43,.92),p[0],.8,p[2],Math.PI/2,0);bale.castShadow=false}
  return g
}
function makeAlpineLandmark(loc){
  const g=new THREE.Group(),base=std(0x8c8b83,.92),dark=std(0x5c4736,.88);
  box(g,9.2,1.1,6.5,base,0,.55,0);const h=makeHouse(loc.roof,1.12);h.position.y=.7;g.add(h);
  box(g,1.0,5.2,1.0,dark,3.2,4.0,1.4);const cap=mesh(new THREE.ConeGeometry(.9,1.4,4),std(0x3f3e3a,.9),3.2,7.2,1.4);cap.rotation.y=Math.PI/4;g.add(cap);
  return g
}
function makeGardenLandmark(){
  const g=new THREE.Group(),stone=std(0xe9dfc9,.72),roofMat=std(0x7b5bb6,.68),glass=std(0xa8e4d7,.25);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(g,.16,.19,3.2,stone,Math.cos(a)*3.2,1.6,Math.sin(a)*3.2)}
  const roof=mesh(new THREE.ConeGeometry(4.4,2.0,8),roofMat,0,4.05,0);g.add(roof);cyl(g,3.2,3.2,.24,stone,0,.12,0);
  const greenhouse=new THREE.Group();box(greenhouse,6.4,2.7,3.6,glass,0,1.35,0);for(const x of [-3.25,3.25])box(greenhouse,.12,3.0,3.8,stone,x,1.5,0);greenhouse.position.set(8.0,0,0);g.add(greenhouse);
  return g
}
function makeMarketLandmark(){
  const g=new THREE.Group(),wood=std(0x765137,.84),cloth=std(0xd8703d,.62),cream=std(0xf2d9a7,.72);
  box(g,11.5,.35,5.5,wood,0,3.8,0);for(const x of [-5.2,5.2])for(const z of [-2.2,2.2])box(g,.25,3.8,.25,wood,x,1.9,z);
  for(let i=-2;i<=2;i++){const stall=new THREE.Group();box(stall,1.8,.18,1.5,cream,0,.9,0);box(stall,2.1,.16,1.8,cloth,0,2.0,0);stall.position.set(i*2.25,0,-.4);g.add(stall)}
  const tower=new THREE.Group();box(tower,2.3,5.0,2.3,wood,0,2.5,0);cone(tower,1.8,2.2,cloth,0,6.05,0);tower.position.set(-7.0,0,0);g.add(tower);
  return g
}
function makeGatehouseLandmark(){
  const g=new THREE.Group(),stone=std(0x8c8a83,.94),roofMat=std(0xb94d3c,.78),dark=std(0x433b37,.9);
  for(const x of [-4.6,4.6]){cyl(g,2.25,2.45,7.0,stone,x,3.5,0);cone(g,2.75,2.7,roofMat,x,8.35,0)}
  box(g,6.4,2.1,2.2,stone,0,6.2,0);for(const x of [-2.7,-1.8,-.9,0,.9,1.8,2.7])box(g,.42,.7,2.4,stone,x,7.55,0);
  box(g,5.4,4.6,.5,dark,0,2.3,.2);box(g,2.8,4.0,.7,stone,-4.6,2.0,2.4);box(g,2.8,4.0,.7,stone,4.6,2.0,2.4);
  return g
}
function makeHalloweenChapel(){
  const g=new THREE.Group(),stone=std(0x45464a,.94),dark=std(0x25262a,.88),wood=std(0x352725,.88),glass=new THREE.MeshStandardMaterial({color:0x7d1020,emissive:0x5d0712,emissiveIntensity:2.2,roughness:.35});
  box(g,8.8,6.2,10.5,stone,0,3.1,0);box(g,3.4,9.5,3.5,dark,0,4.75,-4.0);cone(g,3.0,5.3,dark,0,11.8,-4.0);box(g,2.2,4.8,.35,wood,0,2.45,-5.45);
  for(const x of [-2.6,2.6]){const w=mesh(new THREE.CircleGeometry(.92,16),glass,x,4.3,-5.28);g.add(w)}
  const cross=new THREE.Group();box(cross,.22,3.1,.22,goreBoneMat,0,12.8,-4.0);box(cross,1.7,.22,.22,goreBoneMat,0,13.4,-4.0);g.add(cross);return g
}
function makeGravestone(){
  const g=new THREE.Group(),m=std(0x55565a,.96);box(g,1.2,1.7,.34,m,0,.85,0);sph(g,.60,m,0,1.65,0,[1,.75,.30],12);box(g,.18,.8,.12,std(0x333438,.95),0,1.05,-.20);box(g,.62,.16,.12,std(0x333438,.95),0,1.20,-.20);return g
}
function makeSkullProp(scale=1){
  const g=new THREE.Group();sph(g,.38*scale,goreSkullMat,0,.42*scale,0,[1,.95,.90],10);box(g,.46*scale,.24*scale,.32*scale,goreSkullMat,0,.15*scale,-.04*scale);
  for(const x of [-.14,.14])sph(g,.09*scale,M.black,x,.46*scale,-.31*scale,[1,1,.45],7);
  for(const x of [-.12,0,.12])cone(g,.045*scale,.16*scale,goreToothMat,x,.05*scale,-.18*scale,Math.PI,0);return g
}
function makePumpkinLamp(){
  const g=new THREE.Group(),pm=std(0xa95218,.72),stem=std(0x3b4a24,.88),glow=new THREE.MeshStandardMaterial({color:0xff8a24,emissive:0xff4d00,emissiveIntensity:3.2,roughness:.42});
  sph(g,.62,pm,0,.62,0,[1.10,.90,1],12);cyl(g,.08,.11,.35,stem,0,1.25,0);for(const x of [-.20,.20])cone(g,.11,.30,glow,x,.75,-.54,0,0);cone(g,.12,.34,glow,0,.46,-.56,Math.PI,0);return g
}
function addHalloweenProps(rng){
  const graveMat=std(0x4b4c50,.96),bloodGround=std(0x5e0b12,.58,.05);
  for(let i=0;i<20;i++){let x=(rng()<.5?-1:1)*(9+rng()*35),z=-38+rng()*72;if(Math.hypot(x,z-38)<10)continue;const g=makeGravestone();g.position.set(x,0,z);g.rotation.y=rand(-.3,.3);g.scale.setScalar(.72+rng()*.45);world.add(decor(g));if(i%3===0)collider(x,z,.55)}
  for(let i=0;i<14;i++){const x=(rng()<.5?-1:1)*(6+rng()*39),z=-40+rng()*76,p=mesh(new THREE.CylinderGeometry(.75+rng()*1.25,1.15+rng()*1.55,.025,18),bloodGround,x,.018,z);p.scale.z=.45+rng()*.8;world.add(decor(p))}
  for(let i=0;i<10;i++){const x=(rng()<.5?-1:1)*(7+rng()*38),z=-38+rng()*72,sk=makeSkullProp(.55+rng()*.45);sk.position.set(x,0,z);sk.rotation.y=rand(0,6.28);world.add(decor(sk));const b=makeBone();b.scale.setScalar(.45+rng()*.35);b.position.set(x+rand(-.7,.7),.08,z+rand(-.7,.7));b.rotation.z=rand(0,6.28);world.add(decor(b))}
  for(let i=0;i<7;i++){const p=makePumpkinLamp();p.position.set((i%2?-1:1)*(15+rng()*24),0,-36+i*11+rng()*3);p.scale.setScalar(.70+rng()*.35);world.add(decor(p))}
  for(const x of [-22,22])for(const z of [-24,8,32]){const post=new THREE.Group();cyl(post,.08,.11,4.5,M.darkSteel,0,2.25,0);box(post,.9,.12,.12,M.darkSteel,0,4.25,0);const lamp=sph(post,.22,new THREE.MeshStandardMaterial({color:0xff6b35,emissive:0xff2a00,emissiveIntensity:2.4,roughness:.5}),.34,3.92,0);post.position.set(x,0,z);post.rotation.z=(x<0?1:-1)*.10;world.add(decor(post))}
}
function spawnHalloweenGore(pos,intensity=1){
  if(worldMeta.zone!==6)return;
  const bloodCount=mobilePerf?8*intensity:13*intensity;burst(pos,0x8b1018,bloodCount);
  const count=Math.min(mobilePerf?6:10,3+intensity*3);
  for(let i=0;i<count;i++){
    let m,kind=i%4;if(kind===0){m=mesh(goreBoneGeo,goreBoneMat);m.rotation.z=Math.PI/2}
    else if(kind===1||kind===2)m=mesh(goreToothGeo,goreToothMat);
    else m=mesh(goreSkullGeo,goreSkullMat);
    m.position.copy(pos);m.position.y+=1.0+Math.random()*.8;m.scale.setScalar(kind===3?.75:.85+Math.random()*.45);m.castShadow=false;scene.add(m);
    const life=1.2+Math.random()*1.0;goreDebris.push({mesh:m,vx:rand(-4.6,4.6),vy:rand(3.6,8.0),vz:rand(-4.6,4.6),spin:rand(-10,10),life,expires:performance.now()+life*1000})
  }
  while(goreDebris.length>(mobilePerf?28:44)){const d=goreDebris.shift();retire(d.mesh)}
}
function updateHalloweenDebris(dt){
  for(let i=goreDebris.length-1;i>=0;i--){const d=goreDebris[i],m=d.mesh;d.vy-=11.5*dt;m.position.x+=d.vx*dt;m.position.y+=d.vy*dt;m.position.z+=d.vz*dt;m.rotation.x+=d.spin*dt;m.rotation.z+=d.spin*.73*dt;
    if(m.position.y<.05){m.position.y=.05;d.vy*=-.24;d.vx*=.74;d.vz*=.74}d.life-=dt;if(d.life<=0||performance.now()>=d.expires){retire(m);goreDebris.splice(i,1)}}
}

function addZoneLandmark(zone,loc){
  let g,label=arena.landmark,x=0,z=arena.minZ+(arena.maxZ-arena.minZ)*.34,r=4.2;
  if(zone===0){g=makeBarnLandmark();x=-(arena.halfW-7);r=4.6}
  else if(zone===1){g=makeWindmillLandmark();x=arena.halfW-7;r=3.0}
  else if(zone===2){g=makeAlpineLandmark(loc);x=-(arena.halfW-7);r=4.8}
  else if(zone===3){g=makeGardenLandmark();x=0;z=arena.minZ+(arena.maxZ-arena.minZ)*.30;r=4.0}
  else if(zone===4){g=makeMarketLandmark();x=arena.halfW-8;r=5.4}
  else if(zone===5){g=makeGatehouseLandmark();x=0;z=arena.minZ+(arena.maxZ-arena.minZ)*.35;r=0}
  else{g=makeHalloweenChapel();x=0;z=arena.minZ+(arena.maxZ-arena.minZ)*.30;r=5.6}
  g.position.set(x,0,z);world.add(decor(g));
  if(zone===5){collider(-4.6,z,2.3);collider(4.6,z,2.3)}else collider(x,z,r);
  return label
}
function flowerPatch(p,x,z,seed=0){
  const colors=[0xffffff,0xffdb4d,0xf06c9c,0x6fb8ff],inst=new THREE.InstancedMesh(flowerGeo,flowerMat,12),d=new THREE.Object3D(),c=new THREE.Color();
  for(let i=0;i<12;i++){const a=(i*2.4+seed)%6.28,r=.25+(i%5)*.22;d.position.set(x+Math.cos(a)*r,.12,z+Math.sin(a)*r);d.scale.set(1,1,1);d.updateMatrix();inst.setMatrixAt(i,d.matrix);inst.setColorAt(i,c.setHex(colors[i%colors.length]))}
  inst.instanceMatrix.needsUpdate=true;if(inst.instanceColor)inst.instanceColor.needsUpdate=true;inst.castShadow=false;inst.receiveShadow=true;inst.computeBoundingSphere();p.add(inst)
}
function makeBase(){
  const g=new THREE.Group();const h=makeHouse(0x2d6da3,1.15);g.add(h);const tower=makeWatchTower();tower.position.set(5.2,0,1.2);tower.scale.setScalar(.78);g.add(tower);box(g,.12,4,.12,M.steel,-4.2,5.4,.5);box(g,1.5,.75,.12,std(0xe94338,.7),-3.45,6.5,.5);
  g.userData.fade=1;g.userData.fadeMeshes=[];g.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.userData.shared=false;o.material.transparent=true;o.material.opacity=1;g.userData.fadeMeshes.push(o)}});return g
}
function updateHomeOcclusion(dt){
  if(!home)return;
  const ax=camera.position.x,az=camera.position.z,bx=player.position.x,bz=player.position.z,px=home.position.x,pz=home.position.z;
  const vx=bx-ax,vz=bz-az,len2=vx*vx+vz*vz||1,t=clamp(((px-ax)*vx+(pz-az)*vz)/len2,0,1),cx=ax+vx*t,cz=az+vz*t,dx=px-cx,dz=pz-cz;
  const occluded=t>.08&&t<.92&&dx*dx+dz*dz<40.96;
  if(occluded){home.userData.fade=0;for(const o of home.userData.fadeMeshes||[]){o.visible=false;o.material.opacity=0;o.material.depthWrite=false}return}
  const fade=home.userData.fade+(1-home.userData.fade)*(1-Math.exp(-dt*12));home.userData.fade=fade;
  for(const o of home.userData.fadeMeshes||[]){o.visible=fade>.18;o.material.opacity=fade;o.material.depthWrite=fade>.72}
}

function seedRng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296}}
function centerZForArena(){return (arena.minZ+arena.maxZ)*.5}
function clearWorld(){
  if(world)retire(world);obstacles.length=0;
  enemies.splice(0).forEach(retire);shots.splice(0).forEach(e=>retire(e.mesh));feathers.splice(0).forEach(e=>retire(e.mesh));boneShots.splice(0).forEach(e=>retire(e.mesh));mousePoops.splice(0).forEach(e=>retire(e.mesh));enemyPoops.splice(0).forEach(e=>retire(e.mesh));raccoons.splice(0).forEach(retire);clearParticles();allies.splice(0).forEach(retire);pickups.splice(0).forEach(p=>retire(p.mesh));hazards.splice(0).forEach(h=>retire(h.mesh));yarnBalls.splice(0).forEach(y=>retire(y.mesh));goreDebris.splice(0).forEach(d=>retire(d.mesh));world=new THREE.Group();scene.add(world)
}
function collider(x,z,r){obstacles.push({kind:'circle',x,z,r})}
function colliderSegment(x,z,half,r=.16,angle=0){obstacles.push({kind:'segment',x,z,half,r,angle})}
function addVillageSet(loc,rng){
  const edge=arena.halfW-2.2;
  for(const side of [-1,1])for(let i=0;i<2;i++){
    const h=makeHouse([loc.roof,0xc44e3e,0x3b7baa][(i+(side>0?1:0))%3],.58+rng()*.10);h.position.set(side*(edge+rng()*.8),0,arena.minZ+13+i*18+rng()*2);h.rotation.y=side>0?-.18:.18;world.add(h);collider(h.position.x,h.position.z,2.4)
  }
  for(let i=0;i<5;i++){const len=5+rng()*3,f=makeFence(len);f.position.set((i%2?-1:1)*(Math.min(16,arena.halfW-9)+rng()*2.5),0,arena.minZ+11+i*((arena.maxZ-arena.minZ-20)/4));f.rotation.y=(i%2?1:-1)*.08;world.add(f);colliderSegment(f.position.x,f.position.z,len/2,.16,f.rotation.y)}
  const wt=makeWatchTower();wt.position.set(-Math.min(13,arena.halfW-8),0,arena.minZ+22);wt.scale.setScalar(.72);world.add(wt);collider(wt.position.x,wt.position.z,1.5)
}
const layoutNames=['КРИВЫЕ ОГОРОДЫ','РЫНОЧНАЯ ПЛОЩАДЬ','ЗАБОРНЫЙ ЛАБИРИНТ','КАМЕННЫЙ КРУГ','МЕЛЬНИЧНЫЙ ПЕРЕКРЁСТОК'];
function addLevelLayout(n,loc,rng){
  const layout=(n-1)%layoutNames.length,span=arena.maxZ-arena.minZ,cx=arena.halfW*.34,z0=arena.minZ+span*.27,z1=arena.minZ+span*.48,z2=arena.minZ+span*.68;
  if(layout===0){
    const len=Math.min(10,arena.halfW*.24);for(const x of [-cx,cx])for(const z of [z0,z1,z2]){const f=makeFence(len);f.position.set(x,0,z);f.rotation.y=(z-centerZForArena())*.012;world.add(f);colliderSegment(x,z,len/2,.16,f.rotation.y)}
  }else if(layout===1){
    const r=Math.min(14,arena.halfW*.30),plaza=mesh(new THREE.CylinderGeometry(r*.78,r*.78,.10,28),std(0xd9c08d,.95),0,.05,z1);world.add(plaza);
    for(let i=0;i<10;i++){const a=i*Math.PI/5,rr=r;const rock=makeRock(.72);rock.position.set(Math.cos(a)*rr,0,z1+Math.sin(a)*rr);world.add(rock);collider(rock.position.x,rock.position.z,.75)}
  }else if(layout===2){
    const x=arena.halfW*.28,len=Math.min(11,arena.halfW*.25),step=span*.105;
    for(let i=0;i<8;i++){const f=makeFence(len);f.position.set((i%2?x:-x),0,arena.minZ+span*.18+i*step);f.rotation.y=(i%2?.58:-.58);world.add(f);colliderSegment(f.position.x,f.position.z,len/2,.16,f.rotation.y)}
  }else if(layout===3){
    const r=arena.halfW*.34;for(let i=0;i<14;i++){const a=i*Math.PI/7,rr=r+(i%2)*3.5;const rock=makeRock(.75+(i%3)*.12);rock.position.set(Math.cos(a)*rr,0,z1+Math.sin(a)*rr);world.add(rock);collider(rock.position.x,rock.position.z,1.0)}
  }else{
    const cross=mesh(new THREE.PlaneGeometry(arena.halfW*1.55,8),std(loc.road,.96),0,.028,z1);cross.rotation.x=-Math.PI/2;world.add(cross);
    const tower=makeWatchTower();tower.position.set(0,0,z1-3);tower.scale.setScalar(.72);world.add(tower);collider(0,z1-3,1.7);
    const hx=arena.halfW*.30,hz=span*.16;for(const p of [[-hx,z1-hz],[hx,z1-hz],[-hx,z1+hz],[hx,z1+hz]]){const h=makeHouse(loc.roof,.52);h.position.set(p[0],0,p[1]);world.add(h);collider(p[0],p[1],2.0)}
  }
  return layoutNames[layout]
}
function makeModulePickup(type='parts'){
  const g=new THREE.Group(),colors={nitro:0x49b7ff,shield:0x7dd8ff,overdrive:0xff7048,parts:0xf0c24e},mat=std(colors[type]||0xf0c24e,.38,.34),dark=M.darkSteel;
  roundedSlab(g,1.05,.82,.58,dark,0,.48,0,.16,.035);roundedSlab(g,.82,.58,.36,mat,0,.82,0,.13,.025);
  if(type==='nitro'){cyl(g,.10,.12,.65,M.glow,-.20,1.18,0);cyl(g,.10,.12,.65,M.glow,.20,1.18,0)}
  else if(type==='shield'){const ring=mesh(new THREE.TorusGeometry(.36,.08,8,20),mat,0,1.18,0);ring.rotation.x=Math.PI/2;g.add(ring)}
  else if(type==='overdrive'){for(const x of [-.26,0,.26])cone(g,.12,.55,mat,x,1.20,0)}
  else{for(const x of [-.24,.24])cyl(g,.13,.13,.55,mat,x,1.16,0,0,Math.PI/2)}
  noShadow(g);return g
}
function spawnModulePickup(type,pos){
  const m=makeModulePickup(type);m.position.copy(pos);m.position.y=.04;scene.add(m);pickups.push({mesh:m,type:'module-'+type,life:28,bob:rand(0,6.28)})
}
function spawnUpgradeModules(n,rng){
  const types=['nitro','shield','overdrive','parts'],count=3;
  for(let i=0;i<count;i++){
    let x=0,z=0;for(let t=0;t<18;t++){x=rand(-arena.halfW+8,arena.halfW-8);z=rand(arena.minZ+12,arena.maxZ-16);if(!blocked(x,z,1.1)&&x*x+(z-(arena.maxZ-12))*(z-(arena.maxZ-12))>100)break}
    spawnModulePickup(types[(n+i)%types.length],new THREE.Vector3(x,0,z))
  }
}

function makeValerian(){
  const g=new THREE.Group(),green=std(0x50d65b,.35,.08),glass=std(0xa8f2b0,.18,.05);
  cyl(g,.22,.26,.78,glass,0,.42,0);cyl(g,.15,.18,.24,M.steel,0,.92,0);sph(g,.18,green,0,.36,0,[1,.75,1],10);
  const leaf=mesh(new THREE.ConeGeometry(.16,.42,5),green,.22,.88,0);leaf.rotation.z=-.7;g.add(leaf);return g
}
function spawnValerian(pos){
  const m=makeValerian();m.position.copy(pos);m.position.y=.05;scene.add(m);pickups.push({mesh:m,type:'valerian',life:12,bob:rand(0,6.28)})
}
function makeYarnPickup(){
  const g=new THREE.Group(),pink=std(0xea6da8,.78);
  sph(g,.36,pink,0,.38,0,[1,1,1],12);
  for(let i=0;i<5;i++){const ring=mesh(new THREE.TorusGeometry(.37,.025,6,20),std(i%2?0xffd2e8:0xb94d83,.7),0,.38,0);ring.rotation.set(i*.42,i*.65,i*.31);g.add(ring)}
  return g
}
function spawnYarnPickup(pos){const m=makeYarnPickup();m.position.copy(pos);scene.add(m);pickups.push({mesh:m,type:'yarn',life:12,bob:rand(0,6.28)})}
function launchYarn(){
  const m=new THREE.Group(),pink=std(0xe45f9d,.74);sph(m,.72,pink,0,0,0,[1,1,1],14);
  for(let i=0;i<6;i++){const ring=mesh(new THREE.TorusGeometry(.73,.035,6,24),std(i%2?0xffd3e7:0xa84278,.7));ring.rotation.set(i*.51,i*.33,i*.77);m.add(ring)}
  const dir=aimFacing.clone().normalize();m.position.copy(player.position);m.position.y+=1.0;m.position.addScaledVector(dir,1.5);scene.add(m);
  yarnBalls.push({mesh:m,v:dir.multiplyScalar(12),life:6,hits:new Set()});sfx.pickup();showToast('🧶 БЕШЕНЫЙ КЛУБОК!')
}

function makePoop(){
  const g=new THREE.Group();sph(g,.42,hazardPoopMat,0,.22,0,[1.3,.55,1.2],10);sph(g,.30,hazardPoopMat,.05,.48,0,[1,.65,1],10);sph(g,.18,hazardPoopMat,-.04,.68,0,[1,.7,1],10);return g
}
function spawnPoopField(n,rng){
  const count=4+(n%4),span=arena.maxZ-arena.minZ;
  for(let i=0;i<count;i++){let x=(rng()<.5?-1:1)*(5+rng()*Math.max(9,arena.halfW-10)),z=arena.minZ+span*(.16+rng()*.66);const sx=0,sz=arena.maxZ-12;if((x-sx)*(x-sx)+(z-sz)*(z-sz)<64)z-=10;const m=makePoop();m.position.set(x,0,z);scene.add(m);hazards.push({mesh:m,type:'poop',armed:true})}
}
function updateChaosItems(dt,now){
  for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.life-=dt;p.mesh.rotation.y+=dt*1.8;p.mesh.position.y=.14+Math.sin(now*4+p.bob)*.12;if(player.position.distanceToSquared(p.mesh.position)<2.1025){applyPickup(p);continue}if(p.life<=0){retire(p.mesh);pickups.splice(i,1)}}
  for(let i=hazards.length-1;i>=0;i--){const h=hazards[i];if(!h.armed)continue;h.mesh.rotation.y+=dt*.35;
    if(player.position.distanceToSquared(h.mesh.position)<1.8225&&state.invuln<=0){h.armed=false;hitPlayer(1.0,2.8,'Кот героически подорвался на какашке');sfx.poop();burst(h.mesh.position,0x79502b,24);shake=.8;showToast(state.shield>0?'🛡 ЩИТ ДЕРЖИТ':'💩 БА-БАХ! ВЛИП!');retire(h.mesh);hazards.splice(i,1);continue}
    for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(e.position.distanceToSquared(h.mesh.position)<1.1025){h.armed=false;sfx.poop();burst(h.mesh.position,0x79502b,18);damageEnemy(e,2);retire(h.mesh);hazards.splice(i,1);break}}
    if(h.armed)for(let j=raccoons.length-1;j>=0;j--){const r=raccoons[j];if(r.position.distanceToSquared(h.mesh.position)<.9025){h.armed=false;sfx.poop();burst(h.mesh.position,0x79502b,18);damageRaccoon(r,2);retire(h.mesh);hazards.splice(i,1);break}}
  }
  for(let i=yarnBalls.length-1;i>=0;i--){const y=yarnBalls[i];y.life-=dt;y.mesh.position.addScaledVector(y.v,dt);y.mesh.rotation.x+=dt*5;y.mesh.rotation.y+=dt*7;
    if(Math.abs(y.mesh.position.x)>arena.halfW-1){y.v.x*=-1;y.mesh.position.x=clamp(y.mesh.position.x,-arena.halfW+1,arena.halfW-1);sfx.hit()}
    if(y.mesh.position.z<arena.minZ+1||y.mesh.position.z>arena.maxZ-1){y.v.z*=-1;y.mesh.position.z=clamp(y.mesh.position.z,arena.minZ+1,arena.maxZ-1);sfx.hit()}
    for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(!y.hits.has(e)&&e.position.distanceToSquared(y.mesh.position)<2.25){y.hits.add(e);damageEnemy(e,2);burst(e.position,0xe45f9d,9)}}
    for(let j=raccoons.length-1;j>=0;j--){const r=raccoons[j];if(!y.hits.has(r)&&r.position.distanceToSquared(y.mesh.position)<1.5625){y.hits.add(r);damageRaccoon(r,2);burst(r.position,0xe45f9d,9)}}
    if(y.life<=0){retire(y.mesh);yarnBalls.splice(i,1)}
  }
}
function distSqOffset(a,b,by=0){const dx=a.x-b.x,dy=a.y-(b.y+by),dz=a.z-b.z;return dx*dx+dy*dy+dz*dz}
function normalizeAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a}
function unwrapAngleNear(target,reference){return reference+normalizeAngle(target-reference)}
function aimAssistTarget(origin,baseDir,maxRange=44){
  const coneDot=Math.cos(.62);let best=null,bestScore=-1e9;
  const test=t=>{
    if(!t?.parent)return;const dx=t.position.x-origin.x,dz=t.position.z-origin.z,d2=dx*dx+dz*dz;if(d2<2.25||d2>maxRange*maxRange)return;
    const d=Math.sqrt(d2),dot=(dx*baseDir.x+dz*baseDir.z)/d;if(dot<coneDot)return;
    const lateral=Math.abs(dx*baseDir.z-dz*baseDir.x),score=dot*7-lateral*.24-d*.025;
    if(score>bestScore){bestScore=score;best=t}
  };
  for(const e of enemies)test(e);for(const r of raccoons)test(r);return best
}
function assistedShotDirection(origin,baseDir){
  const out=baseDir.clone().setY(0).normalize(),target=aimAssistTarget(origin,out,46);if(!target)return {dir:out,target:null};
  const lead=target.userData?.navVelocity||target.userData?.velocityEstimate,aim=target.position.clone();aim.y=origin.y;
  if(lead){const d=origin.distanceTo(target.position),t=clamp(d/21,.10,.70);aim.x+=lead.x*t*.65;aim.z+=lead.z*t*.65}
  out.copy(aim.sub(origin)).setY(0).normalize();return {dir:out,target}
}
function updateAim(dt){
  if(aimInput.active&&Math.hypot(aimInput.x,aimInput.y)>.18){
    const x=aimInput.x,z=aimInput.y,cs=Math.cos(cameraYaw),sn=Math.sin(cameraYaw);
    aimFacing.set(x*cs+z*sn,0,-x*sn+z*cs).normalize()
  }
  const worldYaw=Math.atan2(aimFacing.x,aimFacing.z)+Math.PI,turret=player.userData.turret;
  if(turret){
    if(!Number.isFinite(turret.userData.continuousYaw))turret.userData.continuousYaw=worldYaw;
    else turret.userData.continuousYaw=unwrapAngleNear(worldYaw,turret.userData.continuousYaw);
    const desiredLocal=turret.userData.continuousYaw-player.rotation.y;
    turret.rotation.y+=(desiredLocal-turret.rotation.y)*(1-Math.exp(-dt*16))
  }
  if(player.userData.head){
    const local=normalizeAngle(worldYaw-player.rotation.y),catYaw=player.userData.catYaw||0,activeTarget=normalizeAngle(local-catYaw),neutral=Math.sin(performance.now()*.0009)*.12;
    const headTarget=aimInput.active?clamp(activeTarget,-2.65,2.65):neutral;
    player.userData.head.rotation.y+=normalizeAngle(headTarget-player.userData.head.rotation.y)*(1-Math.exp(-dt*(aimInput.active?11:4.5)));
    player.userData.head.rotation.x=Math.sin(performance.now()*.006)*.035+(aimInput.active?-.035:0)
  }
}

function addGardenProps(rng,n){
  const edge=arena.halfW-2.2,span=arena.maxZ-arena.minZ;
  const bath=new THREE.Group();cyl(bath,.55,.72,1.2,M.stone,0,.62,0);cyl(bath,1.45,1.25,.28,std(0x6aaed0,.35),0,1.30,0);sph(bath,1.05,std(0x63bddd,.18),0,1.43,0,[1,.12,1],16);bath.position.set(-Math.min(11.5,edge-4),0,4.5);world.add(bath);collider(bath.position.x,bath.position.z,1.2);
  const fl=new THREE.Group();cyl(fl,.06,.06,2.1,std(0xe95f91,.65),0,1.05,0);sph(fl,.52,std(0xee6b9d,.68),0,2.16,0,[.72,1,1.25]);cyl(fl,.11,.14,1.45,std(0xee6b9d,.68),.22,2.72,-.15,.3,.15);sph(fl,.25,std(0xee6b9d,.68),.36,3.32,-.28);cone(fl,.12,.45,M.black,.52,3.27,-.44,Math.PI/2,0);fl.position.set(Math.min(12,edge-4),0,8.0);world.add(fl);
  const gn=new THREE.Group();cyl(gn,.28,.38,.85,std(0x2f6fa8,.8),0,.46,0);sph(gn,.30,std(0xf2c7a3,.7),0,1.03,-.05);cone(gn,.38,1.05,std(0xd44738,.7),0,1.66,0);sph(gn,.22,M.white,0,.82,-.24,[1,1.25,.6]);gn.position.set(Math.min(14,edge-3),0,Math.min(17,arena.maxZ-9));world.add(gn);
  const bedX=Math.min(15,arena.halfW-7);for(const p of [[-bedX,-18,.15],[bedX,-16,-.12],[-bedX,12,-.08],[bedX,15,.18]]){const bed=makeGardenBed();bed.position.set(p[0],0,clamp(p[1],arena.minZ+10,arena.maxZ-8));bed.rotation.y=p[2];bed.scale.setScalar(.72);world.add(decor(bed));collider(bed.position.x,bed.position.z,2.0)}
  const barrelX=arena.halfW-5;for(const p of [[-barrelX,-6],[barrelX,-4],[-barrelX,Math.min(20,arena.maxZ-8)]]){const b=makeBarrel();b.position.set(p[0],0,p[1]);b.scale.setScalar(.82);world.add(decor(b));collider(p[0],p[1],.8)}
  for(let i=0;i<7;i++){const pot=makeTerracottaPot();pot.position.set((i%2?-1:1)*(edge-2-rng()*1.5),0,arena.minZ+10+i*(span-20)/6);pot.scale.setScalar(.65+rng()*.18);world.add(decor(pot))}
  for(let i=0;i<10;i++){const sf=makeSunflower();sf.position.set((i%2?-1:1)*(edge-1-rng()*1.4),0,arena.minZ+8+i*(span-16)/9);sf.scale.setScalar(.60+rng()*.35);world.add(decor(sf))}
  for(let i=0;i<4;i++){const x=(i-1.5)*7+(n%2?1.5:-1.5),z=clamp(-17+i*11,arena.minZ+8,arena.maxZ-8);const mud=mesh(new THREE.CylinderGeometry(1.8,2.35,.055,22),std(0x775238,.92),x,.03,z);world.add(mud);const shine=mesh(new THREE.CylinderGeometry(1.25,1.8,.02,22),std(0x6c91a0,.25),x,.065,z);world.add(shine)}
  for(let i=0;i<2;i++){const x=i?12:-12,z=i?-4:2;const lid=mesh(new THREE.CylinderGeometry(1.25,1.25,.10,24),M.darkSteel,x,.07,z);world.add(lid);sph(world,.30,M.cream,x,.14,z,[1,.18,1],10)}
  const fenceMat=std(0xf4eee0,.78),start=arena.minZ+6,end=arena.maxZ-10,step=(end-start)/8;
  for(const side of [-1,1])for(let zi=0;zi<8;zi++){const z=start+zi*step;for(let k=0;k<4;k++){box(world,.24,1.65,.24,fenceMat,side*edge,.82,z+k*1.18);cone(world,.22,.42,fenceMat,side*edge,1.85,z+k*1.18)}box(world,.18,.18,4.7,fenceMat,side*edge,1.22,z+1.75);box(world,.18,.18,4.7,fenceMat,side*edge,.52,z+1.75)}
  const shed=new THREE.Group();box(shed,12,4.5,.38,std(0x9b5e3a,.82),0,2.25,0);for(let x=-5.5;x<=5.5;x+=1.0)box(shed,.08,4.2,.12,M.woodLight,x,2.25,-.22);
  box(shed,1.4,.12,.15,M.steel,-2.4,2.4,-.35,.35);box(shed,.12,2.5,.12,M.steel,-2.4,1.45,-.35);box(shed,1.1,.10,.14,M.steel,1.5,2.7,-.35,-.4);box(shed,.12,2.3,.12,M.wood,1.5,1.45,-.35);shed.position.set(0,0,arena.minZ-4.5);world.add(decor(shed));
  for(let i=0;i<26;i++)flowerPatch(world,(rng()<.5?-1:1)*(7+rng()*Math.max(8,arena.halfW-13)),arena.minZ+7+rng()*(span-16),50+i)
}
function buildLevel(n){
  clearWorld();const zone=Math.min(6,Math.floor((n-1)/5)),loc=locations[zone],rng=seedRng(1207+n*9137);arena=zoneSpecs[zone];
  worldMeta={zone,chapter:arena.chapter,landmark:arena.landmark,kind:loc.kind,halfW:arena.halfW,minZ:arena.minZ,maxZ:arena.maxZ};
  scene.background.setHex(loc.sky);scene.fog.color.setHex(loc.fog);scene.fog.near=zone===6?12:40;scene.fog.far=zone===6?72:115;
  hemi.color.setHex(zone===6?0x8992a0:0xe9f9ff);hemi.groundColor.setHex(loc.ground);hemi.intensity=zone===6?.72:1.35;
  sun.color.setHex(zone===6?0xc5c9d6:0xfff0c2);sun.intensity=zone===6?1.05:3.9;fill.color.setHex(zone===6?0x6f7fa8:0xa7d8ff);fill.intensity=zone===6?.34:.72;renderer.toneMappingExposure=zone===6?.86:1.24;
  const span=arena.maxZ-arena.minZ,centerZ=(arena.minZ+arena.maxZ)/2,groundW=arena.halfW*2+22,groundD=span+22;
  ground=mesh(new THREE.PlaneGeometry(groundW,groundD),texStd(loc.ground,shade(loc.ground,.70),.98,0,14,'noise'),0,0,centerZ);ground.rotation.x=-Math.PI/2;world.add(ground);
  const road=mesh(new THREE.PlaneGeometry(10,span+16),texStd(loc.road,shade(loc.road,.72),.96,0,10,'noise'),0,.025,centerZ);road.rotation.x=-Math.PI/2;world.add(road);
  const castle=makeCastle();castle.position.set(0,0,arena.minZ-12);castle.scale.setScalar(zone===5?1.05:zone===6?.58:.72);world.add(decor(castle));
  for(const x of [-(arena.halfW+2),arena.halfW+2]){const hill=mesh(new THREE.SphereGeometry(13,20,12),std(0x75a760,.98),x,-4,arena.minZ-14);hill.scale.set(1.5,.42,1.1);hill.castShadow=false;world.add(hill)}
  addVillageSet(loc,rng);const landmarkName=addZoneLandmark(zone,loc),layoutName=addLevelLayout(n,loc,rng);ui.place.textContent=loc.name+' · '+layoutName;
  for(let i=0;i<18+zone;i++){let x=(rng()<.5?-1:1)*(8+rng()*Math.max(10,arena.halfW-8)),z=arena.minZ+4+rng()*(span-9);if(Math.hypot(x,z-(arena.maxZ-7))<8)continue;const t=makeTree(loc.leaf,.55+rng()*.58);t.position.set(x,0,z);world.add(t);if(Math.abs(x)<arena.halfW-6)collider(x,z,.75)}
  for(let i=0;i<8+Math.floor(zone/2);i++){const r=makeRock(.5+rng()*.7);r.position.set((rng()<.5?-1:1)*(7+rng()*Math.max(8,arena.halfW-9)),0,arena.minZ+7+rng()*(span-14));world.add(r)}
  if(zone!==6)for(let i=0;i<10;i++)flowerPatch(world,(rng()<.5?-1:1)*(6+rng()*Math.max(9,arena.halfW-11)),arena.minZ+7+rng()*(span-14),i);
  if(zone===6)addHalloweenProps(rng);else addGardenProps(rng,n);spawnPoopField(n,rng);spawnUpgradeModules(n,rng);
  home=makeBase();home.position.set(0,0,arena.maxZ-3);home.scale.setScalar(.88);world.add(home);
  const startZ=arena.maxZ-12;player.position.set(0,0,startZ);player.rotation.set(0,0,0);playerFacing.set(0,0,-1);if(player.userData.velocity)player.userData.velocity.set(0,0,0);if(player.userData.moveTarget)player.userData.moveTarget.set(0,0,0);
  helper.position.set(2,5.15,startZ-2);helperCooldown=0;mouseCompanion.position.set(1.18,1.88,startZ-.18);mouseCompanion.rotation.set(0,Math.PI,0);mouseCompanion.userData.fetch=null;mouseCompanion.userData.mode='ride';
  camFocus.set(player.position.x,1.6,player.position.z);camFocusTarget.copy(camFocus);state.last=0;motionClock.dt=1/60;applyRenderQuality();
  state.level=n;cameraYaw=0;cameraYawVelocity=0;moveInput.x=moveInput.y=0;aimInput.active=false;aimFacing.set(.28,0,-.96).normalize();spawnCatSquad();state.kills=0;state.spawned=0;state.targetKills=14+Math.floor(n*1.65);state.spawnTimer=.12;state.home=tune.maxHome;state.lives=tune.maxLives;state.bombs=3+tune.extraBombs;state.combo=1;state.comboTimer=0;state.fireCooldown=0;state.invuln=0;state.valerian=0;state.poopSlow=0;state.nitro=0;state.overdrive=0;state.shield=0;state.coilCooldown=.8;state.playing=true;
  for(let i=0;i<Math.min(4,state.targetKills);i++)spawnDog();state.spawnTimer=.28;if(n%4===0){spawnValerian(new THREE.Vector3(-3,0,startZ-6));spawnValerian(new THREE.Vector3(4,0,startZ-13))}
  updateUI();sfx.wave();showToast('ВОЛНА '+n+' · '+arena.chapter+' · '+landmarkName)
}

function makeCharacters(){player=makeCatTank();player.scale.setScalar(1.10);scene.add(player);helper=makeBird();helper.scale.setScalar(.72);scene.add(helper);mouseCompanion=makeMouse();mouseCompanion.scale.setScalar(1.30);scene.add(mouseCompanion)}
function mountProgressEquipment(){
  const v=player.userData.vehicle,brass=std(0xc9842e,.62,.68),blue=std(0x65d9ff,.32,.30),steel=M.darkSteel;
  const coil=new THREE.Group();coil.position.set(-1.58,1.55,-.25);cyl(coil,.20,.28,.68,steel,0,.34,0);for(let i=0;i<3;i++){const ring=mesh(new THREE.TorusGeometry(.32+i*.08,.045,7,18),blue,0,.68+i*.20,0);ring.rotation.x=Math.PI/2;coil.add(ring)}sph(coil,.18,M.glow,0,1.35,0,[1,1,1],10);v.add(coil);
  const twin=new THREE.Group();twin.position.set(1.18,1.92,.10);for(const x of [-.38,.38]){const b=cyl(twin,.12,.15,1.45,brass,x,.03,-2.2,Math.PI/2,0);b.rotation.x=Math.PI/2}v.add(twin);
  player.userData.coilRig=coil;player.userData.twinRig=twin;refreshEquipmentVisuals()
}
function refreshEquipmentVisuals(){if(!player)return;if(player.userData.coilRig)player.userData.coilRig.visible=tune.coil>0;if(player.userData.twinRig)player.userData.twinRig.visible=tune.twin}
makeCharacters();mountProgressEquipment();
function updateUI(){
  ui.level.textContent=state.level+' / '+MAX_LEVEL;ui.home.textContent='❤'.repeat(Math.max(0,state.home));ui.lives.textContent='❤'.repeat(Math.max(0,state.lives));ui.enemies.textContent=Math.max(0,state.targetKills-state.kills);ui.score.textContent=state.score;ui.combo.textContent='×'+state.combo;ui.bombs.textContent=state.bombs;
  ui.boost.textContent=state.shield>0?'🛡 ×'+state.shield:state.nitro>0?'⚡ '+state.nitro.toFixed(1)+'с':state.overdrive>0?'🔥 '+state.overdrive.toFixed(1)+'с':state.valerian>0?'🌿 '+state.valerian.toFixed(1)+'с':state.poopSlow>0?'💩 ТОРМОЗ':'🔧 R'+garage.rank+' · 🔩'+garage.parts
}
function showToast(t){toast.textContent=t;toast.style.opacity='1';clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.style.opacity='0',1450)}
function pulseFlash(){flash.style.background='rgba(255,214,115,.28)';setTimeout(()=>flash.style.background='rgba(255,255,255,0)',90)}
function hitPlayer(invuln=1,slow=0,reason='Кота победили'){
  if(state.invuln>0)return false;state.invuln=invuln;
  if(state.shield>0){state.shield--;pulseFlash();burst(player.position,0x72d9ff,14);showToast('🛡 ЩИТ ПРИНЯЛ УДАР');updateUI();return true}
  state.lives--;if(slow>0)state.poopSlow=Math.max(state.poopSlow,slow);updateUI();pulseFlash();if(state.lives<=0)lose(reason);return true
}
function distSqXZ(a,b){const dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz}
function blocked(x,z,radius=1.05){
  if(Math.abs(x)>arena.halfW-radius||z<arena.minZ+radius||z>arena.maxZ-radius)return true;
  for(const o of obstacles){
    const limit=o.r+radius,limit2=limit*limit;
    if(o.kind==='segment'){
      const cs=Math.cos(o.angle),sn=Math.sin(o.angle),dx=x-o.x,dz=z-o.z,along=dx*cs+dz*sn,side=-dx*sn+dz*cs,q=clamp(along,-o.half,o.half),da=along-q;
      if(da*da+side*side<limit2)return true
    }else{const dx=x-o.x,dz=z-o.z;if(dx*dx+dz*dz<limit2)return true}
  }
  return false
}
const navOffsets=[0,.34,-.34,.68,-.68,1.05,-1.05,1.45,-1.45,Math.PI];
function lineClearXZ(a,b,radius=.72){
  const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);if(dist<1.2)return true;
  const steps=Math.ceil(dist/1.15);for(let i=1;i<steps;i++){const t=i/steps;if(blocked(a.x+dx*t,a.z+dz*t,radius))return false}return true
}
function navDirection(pos,gx,gz,radius,sign,out,team=null,self=null,prev=null){
  let dx=gx-pos.x,dz=gz-pos.z,len=Math.hypot(dx,dz);if(len<.001){dx=0;dz=-1;len=1}dx/=len;dz/=len;
  const base=Math.atan2(dx,dz),px=pos.x,pz=pos.z;let bestScore=-1e9,bx=dx,bz=dz;
  for(let i=0;i<navOffsets.length;i++){
    const off=navOffsets[i],ang=base+off,vx=Math.sin(ang),vz=Math.cos(ang);
    let score=(vx*dx+vz*dz)*3.2;
    if(prev)score+=(vx*prev.x+vz*prev.z)*.55;
    if(off!==0)score+=Math.sign(off)*sign*.10;
    if(blocked(px+vx*1.8,pz+vz*1.8,radius))score-=60;
    else if(blocked(px+vx*3.6,pz+vz*3.6,radius))score-=16;
    else if(blocked(px+vx*5.6,pz+vz*5.6,radius))score-=4;
    const ex=px+vx*2.4,ez=pz+vz*2.4;
    if(team)for(const other of team){if(other===self)continue;const ox=ex-other.position.x,oz=ez-other.position.z,d2=ox*ox+oz*oz;if(d2<10)score-=(10-d2)*.14}
    if(score>bestScore){bestScore=score;bx=vx;bz=vz}
  }
  return out.set(bx,0,bz)
}

function nearestEnemy(from,max=999){
  let best=null,d2=max*max;for(const e of enemies){const q=from.distanceToSquared(e.position);if(q<d2){d2=q;best=e}}return best
}
function nearestHostile(from,max=999){
  let best=null,d2=max*max;for(const e of enemies){const q=from.distanceToSquared(e.position);if(q<d2){d2=q;best=e}}for(const r of raccoons){const q=from.distanceToSquared(r.position);if(q<d2){d2=q;best=r}}return best
}
function findClearSpawn(x,z,radius=1.2,tries=14){
  let sx=x,sz=z;const minX=-arena.halfW+2,maxX=arena.halfW-2,minZ=arena.minZ+2,maxZ=arena.maxZ-5;
  const clear=(px,pz)=>{const dx=px-player.position.x,dz=pz-player.position.z;return !blocked(px,pz,radius)&&dx*dx+dz*dz>64};
  for(let i=0;i<tries;i++){if(clear(sx,sz))return [sx,sz];sx=clamp(x+rand(-5,5),minX,maxX);sz=clamp(z+rand(-4,5),minZ,maxZ)}
  for(let ring=2;ring<=14;ring+=2)for(let i=0;i<16;i++){const a=i*Math.PI/8,px=clamp(x+Math.cos(a)*ring,minX,maxX),pz=clamp(z+Math.sin(a)*ring,minZ,maxZ);if(clear(px,pz))return [px,pz]}
  return [clamp(x,minX,maxX),clamp(z,minZ,maxZ)]
}
function spawnDog(){
  const type=Math.min(3,Math.floor((state.level-1)/7)+(Math.random()<.25?1:0)),d=makeDog(type),side=Math.random(),u=d.userData;
  const roleCycle=['rusher','flanker','marksman','raider'];let role=roleCycle[state.spawned%roleCycle.length],variant='normal';
  if(state.level===35&&state.spawned===0){variant='nightmare';role='marksman'}
  else if(state.level%5===0&&state.spawned===0){variant='alpha';role='marksman'}
  else if(state.spawned%7===3)variant='charger';else if(state.spawned%7===5)variant='armored';
  u.role=role;u.variant=variant;u.stuckTime=0;u.stuckCount=0;u.unstuck=0;u.lastSteer=new THREE.Vector3(0,0,-1);
  if(role==='rusher'){u.preferredRange=4.4;u.speed*=1.12}else if(role==='flanker'){u.preferredRange=8.2;u.speed*=1.06}else if(role==='marksman'){u.preferredRange=12.8;u.speed*=.94}else{u.preferredRange=6.3;u.speed*=1.08}
  if(variant==='charger'){u.speed*=1.26;u.preferredRange=Math.min(u.preferredRange,5.2);const horn=cone(d,.28,.85,std(0xd9c28f,.65),0,2.5,-2.0,Math.PI/2,0);horn.castShadow=false}
  else if(variant==='armored'){u.hp+=3;u.speed*=.90;const plate=roundedSlab(d,1.65,.18,.92,M.steel,0,1.45,.50,.15,.025);plate.rotation.x=-.18}
  else if(variant==='alpha'){u.hp+=6+Math.floor(state.level/5);u.speed*=.92;u.preferredRange=13.5;d.scale.multiplyScalar(1.34);u.baseScale=d.scale.clone();const crown=cone(d,.62,1.0,std(0xd7a832,.48,.45),0,3.15,-.35);crown.castShadow=false}
  else if(variant==='nightmare'){u.hp+=18;u.speed*=.88;u.preferredRange=15;d.scale.multiplyScalar(1.62);u.baseScale=d.scale.clone();const skull=makeSkullProp(.90);skull.position.set(0,2.85,-.10);d.add(skull);const eyeMat=new THREE.MeshStandardMaterial({color:0xff2c22,emissive:0xff0000,emissiveIntensity:4,roughness:.35});sph(d,.12,eyeMat,-.28,2.38,-2.10,[1,1,.55],8);sph(d,.12,eyeMat,.28,2.38,-2.10,[1,1,.55],8)}
  const flank=arena.halfW-3,front=arena.minZ+9;let x,z;if(side<.56){x=rand(-arena.halfW+8,arena.halfW-8);z=front}else{x=side<.78?-flank:flank;z=rand(arena.minZ+12,arena.maxZ*.12)}
  const p=findClearSpawn(x,z,1.25,22);d.position.set(p[0],0,p[1]);u.lastX=p[0];u.lastZ=p[1];u.hp+=Math.floor(state.level/10);scene.add(d);enemies.push(d);state.spawned++;if((state.spawned%3===0||Math.random()<.22)&&raccoons.length<4)spawnRaccoon(d)
}
function burst(pos,color=0xffaa55,count=12){
  const mat=effectMat(color);for(let i=0;i<count;i++)spawnParticle(pos,.07+Math.random()*.10,mat,rand(-4.5,4.5),rand(2,7.5),rand(-4.5,4.5),.4+Math.random()*.55)
}
function damageEnemy(e,dmg){
  e.userData.hp-=dmg;const bs=e.userData.baseScale;e.userData.hitFlash=true;e.scale.copy(bs).multiplyScalar(.92);
  if(worldMeta.zone===6)burst(e.position,0x8b1018,mobilePerf?3:5);
  setTimeout(()=>{if(e.parent)e.scale.copy(bs);e.userData.hitFlash=false},55);
  if(e.userData.hp<=0){
    state.combo=state.comboTimer>0?Math.min(8,state.combo+1):1;state.comboTimer=2.7;
    const variant=e.userData.variant,stateBonus=variant==='nightmare'?420:variant==='alpha'?150:0;state.score+=(18+e.userData.type*12+stateBonus)*state.combo;state.kills++;
    if(worldMeta.zone===6)spawnHalloweenGore(e.position,variant==='nightmare'?3:variant==='alpha'?2:1);else burst(e.position,variant==='alpha'?0xffd54c:e.userData.type>=2?0xff6548:0xffb85b,variant==='alpha'?30:16);
    sfx.hit();const dropPos=e.position.clone();retire(e);enemies.splice(enemies.indexOf(e),1);const roll=Math.random();
    if(variant==='nightmare'||variant==='alpha'||variant==='armored')spawnModulePickup('parts',dropPos);else if(roll<.20)spawnValerian(dropPos);else if(roll<.28)spawnYarnPickup(dropPos);
    updateUI();if(state.playing&&state.kills>=state.targetKills)winLevel()
  }
}
function damageRaccoon(r,dmg){r.userData.hp-=dmg;r.scale.setScalar(.9);setTimeout(()=>{if(r.parent)r.scale.setScalar(1)},55);if(r.userData.hp<=0){burst(r.position,0x6e7278,14);sfx.hit();retire(r);raccoons.splice(raccoons.indexOf(r),1);state.score+=35;updateUI()}}
function fireSausage(){
  if(!state.playing||state.fireCooldown>0)return;
  const berserk=state.valerian>0?.52:1,over=state.overdrive>0?.58:1;state.fireCooldown=.12*tune.fire*berserk*over;
  let base=aimFacing.clone();
  if(!aimInput.active){const target=nearestHostile(player.position,38);if(target){base.copy(target.position).sub(player.position).setY(0).normalize();aimFacing.copy(base)}}
  if(base.lengthSq()<.01)base.copy(playerFacing);base.normalize();
  const origin=player.userData.shotOrigin||(player.userData.shotOrigin=new THREE.Vector3());if(player.userData.muzzle)player.userData.muzzle.getWorldPosition(origin);else{origin.copy(player.position);origin.y+=1.55}
  const assisted=assistedShotDirection(origin,base),dir=assisted.dir,target=assisted.target;
  if(target)aimFacing.lerp(dir,.30).normalize();
  const fireOne=(lateral=0)=>{
    const d=dir.clone(),g=new THREE.Group(),body=mesh(sausageBodyGeo,sausageMat),tip=mesh(sausageTipGeo,M.glow,0,0,-.42);body.castShadow=tip.castShadow=false;body.rotation.x=Math.PI/2;g.add(body,tip);
    const px=-d.z,pz=d.x;g.position.copy(origin).addScaledVector(d,.38);g.position.x+=px*lateral;g.position.z+=pz*lateral;g.rotation.y=Math.atan2(d.x,d.z);scene.add(g);
    shots.push({mesh:g,v:d.multiplyScalar(state.valerian>0?23:20.5),life:2.8,damage:tune.damage,target,assistLife:target?.parent?.4:0})
  };
  if(tune.twin){fireOne(-.24);fireOne(.24)}else fireOne(0);
  player.userData.recoil=Math.min(1,(player.userData.recoil||0)+.72);burst(origin,state.overdrive>0?0xff7646:0xffc15a,tune.twin?8:5);shake=Math.max(shake,.16);sfx.shoot()
}
function updateCoil(dt){
  if(tune.coil<=0||!state.playing)return;state.coilCooldown-=dt;if(state.coilCooldown>0)return;
  const range=15+tune.coil*1.5,target=nearestHostile(player.position,range);if(!target)return;
  const dx=target.position.x-player.position.x,dz=target.position.z-player.position.z,steps=7,mat=effectMat(0x65d9ff);
  for(let i=1;i<=steps;i++){const t=i/steps,p=player.userData.coilFxPos||(player.userData.coilFxPos=new THREE.Vector3());p.set(player.position.x+dx*t+rand(-.18,.18),.9+Math.sin(t*Math.PI)*1.1,target.position.z-dz*(1-t)+rand(-.18,.18));spawnParticle(p,.07+(i%2)*.035,mat,rand(-.15,.15),rand(.3,.9),rand(-.15,.15),.18)}
  if(enemies.includes(target))damageEnemy(target,1+Math.floor(tune.coil/3));else if(raccoons.includes(target))damageRaccoon(target,1+Math.floor(tune.coil/3));
  state.coilCooldown=Math.max(.85,2.45-tune.coil*.16);tone(900,.07,'sawtooth',.08,.42);shake=Math.max(shake,.08)
}

function bomb(){
  if(!state.playing||state.bombs<=0)return;state.bombs--;updateUI();pulseFlash();shake=1.1;sfx.bomb();burst(player.position,0xff7646,36);const radius=9.5*tune.bombRadius,r2=radius*radius;
  for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(e.position.distanceToSquared(player.position)<r2)damageEnemy(e,5)}
  for(let i=raccoons.length-1;i>=0;i--){const r=raccoons[i];if(r.position.distanceToSquared(player.position)<r2)damageRaccoon(r,5)}
}
function updateProjectiles(dt){
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.vy-=10*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.mesh.scale.multiplyScalar(.965);p.life-=dt;if(p.life<=0){particles.splice(i,1);releaseParticle(p)}}
  for(let i=shots.length-1;i>=0;i--){const s=shots[i];
    if(s.assistLife>0&&s.target?.parent){
      s.assistLife-=dt;const desired=s.target.position.clone().sub(s.mesh.position).setY(0);if(desired.lengthSq()>.01){desired.normalize();const speed=Math.hypot(s.v.x,s.v.z),cur=s.v.clone().setY(0).normalize(),turn=1-Math.exp(-dt*5.2);cur.lerp(desired,turn).normalize();s.v.x=cur.x*speed;s.v.z=cur.z*speed;s.mesh.rotation.y=Math.atan2(cur.x,cur.z)}
    }
    s.mesh.position.addScaledVector(s.v,dt);s.life-=dt;if(Math.random()<.65)spawnParticle(s.mesh.position,.045,trailMat,rand(-.3,.3),rand(.2,.8),rand(-.3,.3),.18);let hit=false;
    for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(distSqOffset(s.mesh.position,e.position,1.2)<3.0625){damageEnemy(e,s.damage||1);hit=true;break}}
    if(!hit)for(let j=raccoons.length-1;j>=0;j--){const r=raccoons[j];if(distSqOffset(s.mesh.position,r.position,1.1)<2.1025){damageRaccoon(r,s.damage||1);hit=true;break}}
    if(hit||s.life<0){retire(s.mesh);shots.splice(i,1)}
  }
  for(let i=feathers.length-1;i>=0;i--){const s=feathers[i];s.mesh.position.addScaledVector(s.v,dt);s.life-=dt;let hit=false;
    for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(distSqOffset(s.mesh.position,e.position,1.1)<1){damageEnemy(e,1);hit=true;break}}
    if(!hit)for(let j=raccoons.length-1;j>=0;j--){const r=raccoons[j];if(distSqOffset(s.mesh.position,r.position,1.0)<.81){damageRaccoon(r,1);hit=true;break}}
    if(hit||s.life<0){retire(s.mesh);feathers.splice(i,1)}
  }
  for(let i=boneShots.length-1;i>=0;i--){const s=boneShots[i];s.mesh.position.addScaledVector(s.v,dt);s.mesh.rotation.x+=s.spin*dt;s.mesh.rotation.z+=s.spin*.7*dt;s.life-=dt;let hit=false;
    if(distSqOffset(s.mesh.position,player.position,1.15)<1.5625&&state.invuln<=0){hitPlayer(1.15,0,'Кота закидали костями');shake=.48;burst(player.position,0xf7e6bd,12);hit=true}
    if(!hit)for(let j=allies.length-1;j>=0;j--){const a=allies[j];if(distSqOffset(s.mesh.position,a.position,1.0)<.81){a.userData.hp--;burst(a.position,0xf7e6bd,8);hit=true;if(a.userData.hp<=0){retire(a);allies.splice(j,1)}break}}
    if(!hit&&distSqOffset(s.mesh.position,home.position,1.5)<7.84){state.home--;updateUI();pulseFlash();burst(home.position,0xf7e6bd,10);hit=true;if(state.home<=0)lose('База разбита костями')}
    if(hit||s.life<0){retire(s.mesh);boneShots.splice(i,1)}
  }
  for(let i=mousePoops.length-1;i>=0;i--){const s=mousePoops[i];s.mesh.position.addScaledVector(s.v,dt);s.mesh.rotation.x+=s.spin*dt;s.mesh.rotation.z+=s.spin*.8*dt;s.life-=dt;let hit=false;
    for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(distSqOffset(s.mesh.position,e.position,.9)<1){damageEnemy(e,1);burst(e.position,0x6a3c1f,8);hit=true;break}}
    if(!hit)for(let j=raccoons.length-1;j>=0;j--){const r=raccoons[j];if(distSqOffset(s.mesh.position,r.position,.9)<.81){damageRaccoon(r,1);burst(r.position,0x6a3c1f,8);hit=true;break}}
    if(hit||s.life<0){retire(s.mesh);mousePoops.splice(i,1)}
  }
  for(let i=enemyPoops.length-1;i>=0;i--){const s=enemyPoops[i];s.mesh.position.addScaledVector(s.v,dt);s.mesh.rotation.x+=s.spin*dt;s.life-=dt;let hit=false;
    if(distSqOffset(s.mesh.position,player.position,1.0)<1.21&&state.invuln<=0){hitPlayer(1.0,2.1,'Еноты закидали лоток мусором');sfx.poop();burst(player.position,0x5a351f,12);hit=true}
    if(!hit)for(let j=allies.length-1;j>=0;j--){const a=allies[j];if(distSqOffset(s.mesh.position,a.position,.9)<.7225){a.userData.hp--;hit=true;if(a.userData.hp<=0){retire(a);allies.splice(j,1)}break}}
    if(hit||s.life<0){retire(s.mesh);enemyPoops.splice(i,1)}
  }
}
function fireFeather(target){const dir=target.position.clone().sub(helper.position).normalize(),m=mesh(featherGeo,featherMat);m.rotation.x=Math.PI/2;m.position.copy(helper.position);scene.add(m);feathers.push({mesh:m,v:dir.multiplyScalar(15),life:2})}
function updateHelper(dt,now){const anchor=helper.userData.anchor||(helper.userData.anchor=new THREE.Vector3());anchor.set(player.position.x+Math.cos(now*1.55)*4.1,5.15+Math.sin(now*4.2)*.42,player.position.z+Math.sin(now*1.55)*2.7);helper.position.lerp(anchor,Math.min(1,dt*5));helper.rotation.y=Math.sin(now*.8)*.22;const w=helper.userData;if(w.leftWing){const flap=Math.sin(now*10+w.phase)*.72;w.leftWing.rotation.z=.30+flap;w.rightWing.rotation.z=-.30-flap;w.leftWing.rotation.x=.18+Math.sin(now*5)*.08;w.rightWing.rotation.x=.18-Math.sin(now*5)*.08;if(w.tail)w.tail.rotation.y=Math.sin(now*3.2)*.12}helperCooldown-=dt;const target=nearestHostile(helper.position,20);if(target&&helperCooldown<=0){fireFeather(target);helperCooldown=.78}}
function chooseDogTarget(e){
  const u=e.userData,role=u.role||'rusher';
  if(role==='raider'&&home)return home;
  if(role==='rusher'&&allies.length){
    let best=player,bestD=e.position.distanceToSquared(player.position);
    for(const a of allies){const d=e.position.distanceToSquared(a.position)*.90;if(d<bestD){best=a;bestD=d}}return best
  }
  if(role==='marksman'&&allies.length&&!lineClearXZ(e.position,player.position,.68)){
    let best=player,bestD=1e9;for(const a of allies){const d=e.position.distanceToSquared(a.position);if(d<bestD&&lineClearXZ(e.position,a.position,.68)){best=a;bestD=d}}return best
  }
  return player
}
function dogSteer(e,target,now){
  const u=e.userData,pos=e.position,role=u.role||'rusher';
  let fx=target.position.x-pos.x,fz=target.position.z-pos.z,dist=Math.max(.001,Math.hypot(fx,fz));fx/=dist;fz/=dist;
  const sx=-fz*u.flankSign,sz=fx*u.flankSign;let dx=fx,dz=fz;
  if(role==='flanker'){
    const forward=dist>u.preferredRange+4?.78:.35;dx=fx*forward+sx*.95;dz=fz*forward+sz*.95
  }else if(role==='marksman'){
    if(dist>u.preferredRange+2){dx=fx;dz=fz}
    else if(dist<u.preferredRange-2){dx=-fx;dz=-fz}
    else{dx=sx;dz=sz}
  }else if(role==='raider'){dx=fx+sx*.18;dz=fz+sz*.18}
  if(u.unstuck>0){dx=sx*1.6-fx*.15;dz=sz*1.6-fz*.15}
  for(const other of enemies){if(other===e)continue;const ox=pos.x-other.position.x,oz=pos.z-other.position.z,d2=ox*ox+oz*oz;if(d2>0&&d2<12){const k=(12-d2)/12;dx+=ox*k*.13;dz+=oz*k*.13}}
  for(const shot of shots){const ox=pos.x-shot.mesh.position.x,oz=pos.z-shot.mesh.position.z,d2=ox*ox+oz*oz;if(d2<30&&d2>.001){let svx=shot.v.x,svz=shot.v.z,sl=Math.hypot(svx,svz)||1;svx/=sl;svz/=sl;const cross=svx*oz-svz*ox,dodge=cross>0?1:-1;dx+=-svz*dodge*.75;dz+=svx*dodge*.75}}
  let len=Math.hypot(dx,dz);if(len<.01){dx=fx;dz=fz;len=1}dx/=len;dz/=len;
  const out=u.steerVec||(u.steerVec=new THREE.Vector3()),goal=u.navGoal||(u.navGoal=new THREE.Vector3());
  goal.set(pos.x+dx*12,0,pos.z+dz*12);
  return navDirection(pos,goal.x,goal.z,1.25,u.flankSign,out,enemies,e,u.lastSteer)
}
function updateEnemies(dt,now){
  for(let ei=enemies.length-1;ei>=0;ei--){const e=enemies[ei],u=e.userData;u.thinkTimer-=dt;u.unstuck=Math.max(0,(u.unstuck||0)-dt);
    if(u.thinkTimer<=0||!u.target||!u.target.parent){u.target=chooseDogTarget(e);u.thinkTimer=.32+Math.random()*.28}
    const target=u.target||player,tx=target.position.x-e.position.x,tz=target.position.z-e.position.z,dist=Math.hypot(tx,tz);u.fireCooldown-=dt;
    u.steerTimer=(u.steerTimer||0)-dt;let steer=u.steerVec;const steerCadence=mobilePerf?(renderQuality.ema>.028?.10:.075):.05;
    if(!steer||u.steerTimer<=0){steer=dogSteer(e,target,now);u.lastSteer.copy(steer);u.steerTimer=steerCadence}
    const role=u.role||'rusher',fireRange=u.variant==='alpha'?26:role==='marksman'?22:u.preferredRange+5.5,hasLos=dist<fireRange&&lineClearXZ(e.position,target.position,.68),canShoot=u.variant!=='charger'||dist<6.5;
    if(hasLos&&canShoot&&u.fireCooldown<=0){const shotTarget=target===home?home:target;if(u.variant==='alpha'||u.variant==='nightmare'){fireBone(e,shotTarget,-.12);fireBone(e,shotTarget,0);fireBone(e,shotTarget,.12)}else fireBone(e,shotTarget);const base=u.variant==='nightmare'?.70:u.variant==='alpha'?.92:role==='marksman'?.68:role==='rusher'?.84:.76;u.fireCooldown=Math.max(.38,base-state.level*.006)+Math.random()*.30}
    const hold=role==='marksman'&&Math.abs(dist-u.preferredRange)<2.4,rush=dist>20?1.22:1,moveScale=(hold?.68:hasLos?.82:1)*u.speed*rush*dt,oldX=e.position.x,oldZ=e.position.z;
    let nx=e.position.x+steer.x*moveScale,nz=e.position.z+steer.z*moveScale;
    if(blocked(nx,nz,1.25)){u.unstuck=Math.max(u.unstuck,.55);u.flankSign*=-1;u.steerTimer=0;nx=e.position.x-steer.z*u.flankSign*u.speed*dt;nz=e.position.z+steer.x*u.flankSign*u.speed*dt}
    if(!blocked(nx,e.position.z,1.25))e.position.x=nx;if(!blocked(e.position.x,nz,1.25))e.position.z=nz;
    const moved=Math.hypot(e.position.x-oldX,e.position.z-oldZ);u.gait=(u.gait||0)+moved*10.5;
    const vel=u.navVelocity||(u.navVelocity=new THREE.Vector3());if(dt>.001)vel.set((e.position.x-oldX)/dt,0,(e.position.z-oldZ)/dt);
    if(moved<.015&&dist>3.5)u.stuckTime=(u.stuckTime||0)+dt;else u.stuckTime=Math.max(0,(u.stuckTime||0)-dt*2.5);
    if(u.stuckTime>.42){u.stuckTime=0;u.stuckCount=(u.stuckCount||0)+1;u.unstuck=.85;u.flankSign*=-1;u.steerTimer=0}
    const moveYaw=Math.atan2(steer.x,steer.z)+Math.PI,targetYaw=Math.atan2(tx,tz)+Math.PI,desiredYaw=moved>.003?moveYaw:targetYaw;
    e.rotation.y+=normalizeAngle(desiredYaw-e.rotation.y)*(1-Math.exp(-dt*8));
    if(u.head){const localAim=clamp(normalizeAngle(targetYaw-e.rotation.y),-.85,.85);u.head.rotation.y+=normalizeAngle(localAim-u.head.rotation.y)*(1-Math.exp(-dt*9));u.head.rotation.z=Math.sin(now*2.2+u.dodgeSeed)*.025}
    if(u.legs)for(let i=0;i<u.legs.length;i++){const phase=(i%2?Math.PI:0)+(i>1?Math.PI:0);u.legs[i].rotation.x=Math.sin(u.gait+phase)*.44*(moved>.001?1:.08)}
    if(u.dogTail)u.dogTail.rotation.z=Math.sin(now*5.5+u.dodgeSeed)*.32;
    if(u.dogEarL&&u.dogEarR){const et=Math.sin(now*4+u.dodgeSeed)*.07,k=1-Math.exp(-dt*8);u.dogEarL.rotation.z+=(u.dogEarL.userData.restZ-et-u.dogEarL.rotation.z)*k;u.dogEarR.rotation.z+=(u.dogEarR.userData.restZ+et-u.dogEarR.rotation.z)*k}
    const bs=u.baseScale;if(!u.hitFlash){const bob=1+(moved>.001?Math.abs(Math.sin(u.gait))*.012:0);e.scale.set(bs.x,bs.y*bob,bs.z)}
    const pdx=e.position.x-player.position.x,pdz=e.position.z-player.position.z;if(pdx*pdx+pdz*pdz<4&&state.invuln<=0){hitPlayer(1.3,0,'Кота победили');state.kills++;shake=.65;burst(player.position,0xffd36d,18);player.position.set(0,0,arena.maxZ-12);if(player.userData.velocity)player.userData.velocity.set(0,0,0);retire(e);enemies.splice(ei,1);if(state.playing&&state.kills>=state.targetKills)winLevel()}
  }
}
function applyPickup(p){
  if(p.type==='valerian'){state.valerian=6*tune.valerian;state.lives=Math.min(tune.maxLives,state.lives+1);sfx.valerian();showToast('🌿 ВАЛЕРЬЯНКА! КОТОБЕРСЕРК')}
  else if(p.type==='yarn'){launchYarn()}
  else if(p.type==='module-nitro'){state.nitro=Math.max(state.nitro,9);showToast('⚡ НИТРО · 9 СЕКУНД')}
  else if(p.type==='module-overdrive'){state.overdrive=Math.max(state.overdrive,9);showToast('🔥 ОВЕРДРАЙВ · 9 СЕКУНД')}
  else if(p.type==='module-shield'){state.shield=Math.min(3,state.shield+1);showToast('🛡 ЩИТ +1')}
  else if(p.type==='module-parts'){awardProgress(20,1);showToast('🔩 ДЕТАЛЬ В ГАРАЖ')}
  retire(p.mesh);const idx=pickups.indexOf(p);if(idx>=0)pickups.splice(idx,1);updateUI()
}
function updateMouse(dt,now){
  if(!mouseCompanion)return;
  const u=mouseCompanion.userData;let best=null,bestD2=121;
  for(const p of pickups){const d2=player.position.distanceToSquared(p.mesh.position);if(d2<bestD2){best=p;bestD2=d2}}
  if(best&&!u.fetch&&u.mode==='ride'){u.fetch=best;u.mode='fetch'}if(u.fetch&&!pickups.includes(u.fetch)){u.fetch=null;u.mode='return'}
  const cs=Math.cos(player.rotation.y),sn=Math.sin(player.rotation.y),seatX=player.position.x+1.18*cs-.18*sn,seatZ=player.position.z-1.18*sn-.18*cs,seatY=player.position.y+1.88;let moving=false;
  if(u.mode==='fetch'&&u.fetch){
    let dx=u.fetch.mesh.position.x-mouseCompanion.position.x,dz=u.fetch.mesh.position.z-mouseCompanion.position.z,d=Math.hypot(dx,dz);
    if(d<.62){applyPickup(u.fetch);u.fetch=null;u.mode='return'}else{dx/=d;dz/=d;mouseCompanion.position.x+=dx*dt*10.4;mouseCompanion.position.z+=dz*dt*10.4;mouseCompanion.rotation.y+=normalizeAngle(Math.atan2(dx,dz)-mouseCompanion.rotation.y)*Math.min(1,dt*14);moving=true}
  }else{
    const dx=seatX-mouseCompanion.position.x,dz=seatZ-mouseCompanion.position.z,d2=dx*dx+dz*dz;
    if(u.mode==='ride'){mouseCompanion.position.x=seatX;mouseCompanion.position.z=seatZ}else{const k=1-Math.exp(-dt*9);mouseCompanion.position.x+=dx*k;mouseCompanion.position.z+=dz*k;moving=d2>.0144;if(d2<.0324)u.mode='ride'}
    mouseCompanion.rotation.y+=normalizeAngle((player.rotation.y+Math.PI)-mouseCompanion.rotation.y)*Math.min(1,dt*10)
  }
  u.gait=(u.gait||0)+(moving?dt*18:dt*2.2);const targetY=u.mode==='ride'?seatY+Math.sin(now*5.5+u.phase)*.018:(.16+Math.abs(Math.sin(u.gait+u.phase))*.065);
  mouseCompanion.position.y+=(targetY-mouseCompanion.position.y)*Math.min(1,dt*12);
  if(u.legs)for(let i=0;i<u.legs.length;i++){const phase=i?Math.PI:0,target=moving?Math.sin(u.gait+phase)*.50:-.18;u.legs[i].rotation.x+=(target-u.legs[i].rotation.x)*(1-Math.exp(-dt*13))}
  if(u.head){u.head.rotation.y=Math.sin(now*2.8+u.phase)*.22;u.head.rotation.z=Math.sin(now*4.6+u.phase)*.03}mouseCompanion.rotation.z=moving?Math.sin(u.gait+u.phase)*.045:Math.sin(now*4+u.phase)*.015;
  u.fireCooldown-=dt;const target=nearestHostile(mouseCompanion.position,18);if(target&&u.fireCooldown<=0&&u.mode!=='fetch'){fireMousePoop(target);u.fireCooldown=.48+Math.random()*.35}
}
function updateRaccoons(dt,now){
  for(let ri=raccoons.length-1;ri>=0;ri--){const r=raccoons[ri],u=r.userData,escort=u.escort&&u.escort.parent?u.escort:nearestEnemy(r.position,999);u.escort=escort;
    const ax=escort?escort.position.x+Math.sin(u.phase)*2.2:player.position.x,az=escort?escort.position.z+2.0:player.position.z,oldX=r.position.x,oldZ=r.position.z;
    let dx=ax-r.position.x,dz=az-r.position.z,d=Math.hypot(dx,dz);if(d>.8){dx/=d;dz/=d;const nx=r.position.x+dx*u.speed*dt,nz=r.position.z+dz*u.speed*dt;if(!blocked(nx,r.position.z,1.05))r.position.x=nx;if(!blocked(r.position.x,nz,1.05))r.position.z=nz}
    const moved=Math.hypot(r.position.x-oldX,r.position.z-oldZ);u.gait=(u.gait||0)+moved*9;
    const vel=u.navVelocity||(u.navVelocity=new THREE.Vector3());if(dt>.001)vel.set((r.position.x-oldX)/dt,0,(r.position.z-oldZ)/dt);if(moved>.002){const yaw=Math.atan2(r.position.x-oldX,r.position.z-oldZ)+Math.PI;r.rotation.y+=normalizeAngle(yaw-r.rotation.y)*(1-Math.exp(-dt*8))}
    const px=player.position.x-r.position.x,pz=player.position.z-r.position.z;if(u.head){const targetYaw=Math.atan2(px,pz)+Math.PI,local=clamp(normalizeAngle(targetYaw-r.rotation.y),-.85,.85);u.head.rotation.y+=normalizeAngle(local-u.head.rotation.y)*(1-Math.exp(-dt*8))}
    u.fireCooldown-=dt;if(px*px+pz*pz<256&&u.fireCooldown<=0){fireRaccoonPoop(r,player);u.fireCooldown=.75+Math.random()*.55}
    if(u.legs)for(let i=0;i<u.legs.length;i++){const phase=(i===0||i===3)?0:Math.PI;u.legs[i].rotation.x=Math.sin(u.gait+phase)*.38*(moved>.001?1:.08)}
    if(moved>.001&&u.cartWheels){u.wheelSpin=(u.wheelSpin||0)+moved/.42;for(const w of u.cartWheels)w.rotation.x=-u.wheelSpin}
    r.position.y=.02+(moved>.001?Math.abs(Math.sin(u.gait))*.035:0);r.rotation.z=(moved>.001?Math.sin(u.gait)*.010:0);
    if(u.cart)u.cart.rotation.x=Math.sin(u.gait)*.018;if(u.raccoonTail){u.raccoonTail.rotation.z=Math.sin(now*4.6+u.phase)*.34;u.raccoonTail.rotation.x=Math.sin(now*3.3+u.phase)*.08}
  }
}
function litterDust(now,dt=.016){
  player.userData.dustTimer=(player.userData.dustTimer||0)-dt;if(player.userData.dustTimer>0)return;player.userData.dustTimer=.075;
  const back=player.userData.dustBack||(player.userData.dustBack=new THREE.Vector3());back.set(-playerFacing.x*1.8,0,-playerFacing.z*1.8).add(player.position);
  for(let i=0;i<2;i++){const px=back.x+rand(-.9,.9),pz=back.z+rand(-.7,.7),mat=i%2?dustMatA:dustMatB;const p=spawnParticle(back,.07+Math.random()*.08,mat,rand(-.8,.8),rand(.7,1.8),rand(-.8,.8),.25+Math.random()*.2);p.mesh.position.set(px,.28,pz)}
}
function updatePlayer(dt,now){
  const prevX=player.position.x,prevZ=player.position.z;
  let x=moveInput.active?moveInput.x:0,z=moveInput.active?moveInput.y:0;
  if(keys.has('left'))x-=1;if(keys.has('right'))x+=1;if(keys.has('up'))z-=1;if(keys.has('down'))z+=1;
  const mag=Math.min(1,Math.hypot(x,z));
  if(mag>.06){
    const l=Math.hypot(x,z);x/=l;z/=l;const cs=Math.cos(cameraYaw),sn=Math.sin(cameraYaw),wx=x*cs+z*sn,wz=-x*sn+z*cs;playerFacing.set(wx,0,wz);
    const desiredYaw=Math.atan2(wx,wz);player.rotation.y+=normalizeAngle(desiredYaw-player.rotation.y)*Math.min(1,dt*10);
    const boost=(state.valerian>0?1.38:1)*(state.nitro>0?1.32:1)*(state.poopSlow>0?.58:1),speed=8.7*tune.speed*boost*mag,targetV=player.userData.moveTarget||(player.userData.moveTarget=new THREE.Vector3());targetV.set(wx*speed,0,wz*speed);
    const vel=player.userData.velocity||(player.userData.velocity=new THREE.Vector3());vel.lerp(targetV,1-Math.exp(-dt*8.5));
    const nx=player.position.x+vel.x*dt,nz=player.position.z+vel.z*dt;if(!blocked(nx,player.position.z,1.72))player.position.x=nx;else vel.x*=.2;if(!blocked(player.position.x,nz,1.72))player.position.z=nz;else vel.z*=.2;litterDust(now,dt)
  }else{const vel=player.userData.velocity||(player.userData.velocity=new THREE.Vector3());vel.multiplyScalar(Math.exp(-dt*10));if(vel.lengthSq()>.002){const nx=player.position.x+vel.x*dt,nz=player.position.z+vel.z*dt;if(!blocked(nx,player.position.z,1.72))player.position.x=nx;if(!blocked(player.position.x,nz,1.72))player.position.z=nz}player.rotation.z=Math.sin(now*2.5)*.012}
  const dxMove=player.position.x-prevX,dzMove=player.position.z-prevZ,travelled=Math.hypot(dxMove,dzMove),signed=(dxMove*playerFacing.x+dzMove*playerFacing.z)>=0?1:-1,spin=signed*travelled/.54;
  for(let wi=0;wi<(player.userData.tracks||[]).length;wi++){const w=player.userData.tracks[wi];w.userData.spin=(w.userData.spin||0)+spin;w.rotation.x=w.userData.spin;w.position.y=.38+Math.abs(Math.sin(now*8+wi*.7))*mag*.018}
  const lean=mag>.06?clamp(normalizeAngle(Math.atan2(playerFacing.x,playerFacing.z)-player.rotation.y),-.25,.25):0;
  if(player.userData.cat){player.userData.cat.rotation.z+=(lean*.16-player.userData.cat.rotation.z)*Math.min(1,dt*8);player.userData.cat.position.y=1.72+Math.abs(Math.sin(now*8))*mag*.055}
  const segs=player.userData.tailSegments||[];for(let i=0;i<segs.length;i++){const s=segs[i],phase=now*3.5-i*.32;s.rotation.z=Math.sin(phase)*(0.12+i*.018)+lean*.18;s.rotation.x=Math.sin(phase*.83+i*.41)*(.035+i*.006)}
  if(player.userData.cat){const breathe=Math.sin(now*2.2)*.012,base=player.userData.cat.userData.baseScale||1;player.userData.cat.scale.setScalar(base*(1+breathe));player.userData.cat.rotation.x=Math.sin(now*1.7)*.012}
  if(player.userData.head&&!aimInput.active){player.userData.head.rotation.y+=normalizeAngle(Math.sin(now*.85)*.18-player.userData.head.rotation.y)*Math.min(1,dt*3.2);player.userData.head.rotation.z=Math.sin(now*1.3)*.025}
  if(player.userData.earL&&player.userData.earR){const twitch=Math.sin(now*2.1)*.035+(Math.sin(now*7.7)> .96?.10:0);player.userData.earL.rotation.z=-.08-twitch;player.userData.earR.rotation.z=.08+twitch}
  const scarf=player.userData.scarfTails||[];if(scarf[0])scarf[0].rotation.z=.10+Math.sin(now*5.4)*.07+mag*.06;if(scarf[1])scarf[1].rotation.z=-.18+Math.sin(now*4.8+1.2)*.08-mag*.04;
  player.userData.recoil=Math.max(0,(player.userData.recoil||0)-dt*5.5);if(player.userData.barrel)player.userData.barrel.position.z=player.userData.recoil*.26;

  player.position.y=.06+Math.sin(now*(mag>.06?8:4))*(mag>.06?.035:.018)
}
const upgradeDefs=[
  {key:'engine',name:'⚡ ДВИГАТЕЛЬ',desc:l=>'+5% скорость тележки · уровень '+l},
  {key:'cannon',name:'🌭 СОСИСКОМЁТ',desc:l=>'+скорострельность'+(l>=4?' · ДВОЙНОЙ СТВОЛ ОТКРЫТ':' · двойной ствол на 4 ур.')},
  {key:'power',name:'💥 БОЕПРИПАСЫ',desc:l=>'+урон и валерьянка · уровень '+l},
  {key:'armor',name:'🛡 БРОНЯ ЛОТКА',desc:l=>'+жизни и прочность базы · уровень '+l},
  {key:'squad',name:'🐈 КОТООТРЯД',desc:l=>'+размер, HP и скорострельность помощников · уровень '+l},
  {key:'bomb',name:'💣 БОМБОВЫЙ ОТСЕК',desc:l=>'+радиус и запас бомб · уровень '+l},
  {key:'coil',name:'⚡ КАТУШКА ТЕСЛЫ',minRank:3,desc:l=>'авторазряд по врагам · уровень '+l}
];
function applyGarageUpgrade(key){
  if(!garage.upgrades[key]&&garage.upgrades[key]!==0)return;garage.upgrades[key]=Math.min(10,(garage.upgrades[key]||0)+1);saveGarage();syncTuneFromGarage()
}
function resetTune(){syncTuneFromGarage()}
function showTuning(nextLevel){
  state.playing=false;overlay.style.display='flex';overlay.querySelector('h1').textContent='🔧 ГАРАЖ · РАНГ '+garage.rank;$('subtitle').textContent='Постоянная модернизация. Она сохранится после перезапуска. XP '+garage.xp+'/'+xpNeed()+' · детали '+garage.parts+'/4';startBtn.style.display='none';
  const host=$('upgrades');host.innerHTML='';const eligible=upgradeDefs.filter(u=>(!u.minRank||garage.rank>=u.minRank)&&(garage.upgrades[u.key]||0)<10),pool=[...eligible].sort(()=>Math.random()-.5).slice(0,3);
  for(const u of pool){const lvl=garage.upgrades[u.key]||0,b=document.createElement('button');b.innerHTML='<b>'+u.name+' · '+(lvl+1)+'</b><br><small>'+u.desc(lvl+1)+'</small>';b.onclick=()=>{initAudio();applyGarageUpgrade(u.key);sfx.pickup();host.innerHTML='';startBtn.style.display='block';overlay.style.display='none';buildLevel(nextLevel)};host.appendChild(b)}
}
function winLevel(){
  state.playing=false;state.score+=state.level*120;garage.wavesWon++;awardProgress(45+state.level*7,state.level%5===0?1:0);updateUI();
  if(state.level>=MAX_LEVEL){showOverlay('ПОБЕДА!','35 волн отбиты, включая Туманный Хэллоуин. Гараж сохранён: ранг '+garage.rank+', детали '+garage.parts+'. Новый поход начинается уже с этой техникой.','НОВЫЙ ПОХОД',()=>{state.score=0;syncTuneFromGarage();buildLevel(1);overlay.style.display='none'});return}
  showTuning(state.level+1)
}
function lose(t){state.playing=false;showOverlay('ПОРАЖЕНИЕ',t+'. Перегруппируйся и дави их снова.','ПОВТОРИТЬ',()=>{buildLevel(state.level);overlay.style.display='none'})}
function showOverlay(title,desc,label,cb){overlay.style.display='flex';$('upgrades').innerHTML='';startBtn.style.display='block';overlay.querySelector('h1').textContent=title;$('subtitle').textContent=desc;startBtn.textContent=label;startBtn.onclick=cb}

function bindCameraOrbit(){
  const surface=renderer.domElement;
  surface.style.touchAction='none';
  surface.addEventListener('pointerdown',e=>{
    if(!state.playing)return;
    cameraDrag.active=true;cameraDrag.id=e.pointerId;cameraDrag.lastX=e.clientX;cameraYawVelocity=0;
    try{surface.setPointerCapture(e.pointerId)}catch{}
  });
  surface.addEventListener('pointermove',e=>{
    if(!cameraDrag.active||e.pointerId!==cameraDrag.id)return;
    const dx=e.clientX-cameraDrag.lastX;cameraDrag.lastX=e.clientX;
    const delta=-dx*.009;cameraYaw+=delta;cameraYawVelocity=delta*38;
    e.preventDefault();
  });
  const end=e=>{
    if(e.pointerId!==cameraDrag.id)return;
    cameraDrag.active=false;cameraDrag.id=null;
    try{if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId)}catch{}
  };
  surface.addEventListener('pointerup',end);surface.addEventListener('pointercancel',end);surface.addEventListener('lostpointercapture',()=>{cameraDrag.active=false;cameraDrag.id=null});
}
bindCameraOrbit();

function clearMovement(){keys.delete('up');keys.delete('down');keys.delete('left');keys.delete('right');moveInput.x=moveInput.y=0;moveInput.active=false;aimInput.x=0;aimInput.y=-1;aimInput.active=false}
function bindStick(id,target){
  const el=$(id),knob=el.querySelector('.knob');let pointer=null;
  const update=e=>{const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width*.34,dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy)||1,scale=Math.min(1,max/len),px=dx*scale,py=dy*scale;target.x=px/max;target.y=py/max;target.active=true;knob.style.transform='translate(calc(-50% + '+px+'px),calc(-50% + '+py+'px))'};
  el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();initAudio();pointer=e.pointerId;try{el.setPointerCapture(pointer)}catch{}update(e)});
  el.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;e.preventDefault();update(e)});
  const stop=e=>{if(e.pointerId!==pointer)return;pointer=null;target.active=false;if(id==='moveStick'){target.x=target.y=0}knob.style.transform='translate(-50%,-50%)';try{if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId)}catch{}};
  el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);el.addEventListener('lostpointercapture',()=>{pointer=null;target.active=false;if(id==='moveStick'){target.x=target.y=0}knob.style.transform='translate(-50%,-50%)'})
}
bindStick('moveStick',moveInput);bindStick('aimStick',aimInput);
document.addEventListener('pointerup',e=>{if(!e.target.closest?.('.joy')){moveInput.active=false;moveInput.x=moveInput.y=0}},{passive:true});
window.addEventListener('blur',()=>{clearMovement();state.last=0;motionClock.dt=1/60});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearMovement();state.last=0;motionClock.dt=1/60}});
for(const evt of ['contextmenu','selectstart','dragstart'])document.addEventListener(evt,e=>{if(e.target.closest('#controls'))e.preventDefault()});
document.addEventListener('keydown',e=>{const m={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};if(m[e.code])keys.add(m[e.code]);if(e.code==='Space')fireSausage();if(e.code==='KeyB')bomb()});
document.addEventListener('keyup',e=>{const m={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};if(m[e.code])keys.delete(m[e.code])});
$('bomb').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();initAudio();bomb()});
startBtn.onclick=()=>{initAudio();syncTuneFromGarage();state.score=0;buildLevel(1);overlay.style.display='none'};
function animate(ms){
  requestAnimationFrame(animate);
  const now=ms*.001,rawDt=state.last?now-state.last:1/60;state.last=now;
  const safeRaw=rawDt>0&&rawDt<.12?Math.min(.05,rawDt):1/60,alpha=1-Math.exp(-safeRaw*7);
  motionClock.raw=safeRaw;const dtAdjust=clamp((safeRaw-motionClock.dt)*alpha,-.0022,.0022);motionClock.dt=clamp(motionClock.dt+dtAdjust,1/120,.05);motionClock.jitter=motionClock.jitter*.92+Math.abs(safeRaw-motionClock.dt)*.08;
  const dt=motionClock.dt;updateRenderQuality(safeRaw);
  if(state.playing){
    state.fireCooldown=Math.max(0,state.fireCooldown-dt);state.invuln=Math.max(0,state.invuln-dt);state.comboTimer=Math.max(0,state.comboTimer-dt);state.valerian=Math.max(0,state.valerian-dt);state.poopSlow=Math.max(0,state.poopSlow-dt);state.nitro=Math.max(0,state.nitro-dt);state.overdrive=Math.max(0,state.overdrive-dt);
    if(state.comboTimer===0&&state.combo!==1){state.combo=1;updateUI()}
    player.visible=state.invuln<=0||Math.floor(now*12)%2===0;
    updatePlayer(dt,now);updateAim(dt);if(aimInput.active&&Math.hypot(aimInput.x,aimInput.y)>.24)fireSausage();
    updateHelper(dt,now);updateMouse(dt,now);updateAllies(dt,now);updateRaccoons(dt,now);updateProjectiles(dt);
    if(state.playing)updateEnemies(dt,now);if(state.playing)updateChaosItems(dt,now);if(state.playing)updateCoil(dt);
    state.uiTimer-=dt;if(state.uiTimer<=0){updateUI();state.uiTimer=.10}
    if(state.playing){state.spawnTimer-=dt;if(state.spawned<state.targetKills&&state.spawnTimer<=0&&enemies.length<10){const batch=(state.spawned+1<state.targetKills&&enemies.length<8&&Math.random()<.45)?2:1;for(let i=0;i<batch;i++)spawnDog();state.spawnTimer=Math.max(.20,.56-state.level*.006)}}
  }
  updateHalloweenDebris(dt);
  if(!cameraDrag.active&&Math.abs(cameraYawVelocity)>.0001){cameraYaw+=cameraYawVelocity*dt;cameraYawVelocity*=Math.pow(.035,dt)}
  const portrait=camera.aspect<.75,radius=portrait?24.2:21,camH=portrait?14.8:13.2;
  camFocusTarget.set(player.position.x,1.6,player.position.z);camFocus.lerp(camFocusTarget,1-Math.exp(-dt*13));
  camDesired.set(camFocus.x+Math.sin(cameraYaw)*radius,camH,camFocus.z+Math.cos(cameraYaw)*radius);camera.position.lerp(camDesired,1-Math.exp(-dt*8));camera.lookAt(camFocus);updateHomeOcclusion(dt);
  if(shake>0){shakePhase+=dt*46;camera.position.x+=Math.sin(shakePhase)*shake*.10;camera.position.y+=Math.sin(shakePhase*1.31+.8)*shake*.055;shake=Math.max(0,shake-dt*4.8)}
  renderQuality.shadowStride=1;renderer.render(scene,camera)
}
requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderQuality.ratio=Math.min(renderQuality.ratio,renderQuality.max);renderer.setPixelRatio(renderQuality.ratio)});
window.__kototanki3d={get ready(){return true},get state(){return {...state}},get player(){return {x:player.position.x,z:player.position.z,rotation:player.rotation.y,aimX:aimFacing.x,aimZ:aimFacing.z,turret:player.userData.turret?.rotation.y||0,turretContinuous:player.userData.turret?.userData?.continuousYaw??0,head:player.userData.head?.rotation.y||0}},get helper(){return {x:helper.position.x,y:helper.position.y,z:helper.position.z,modelStyle:helper.userData.modelStyle||null}},get allies(){return allies.map(a=>({x:a.position.x,z:a.position.z,hp:a.userData.hp,scale:a.scale.x,fireCooldown:a.userData.fireCooldown,modelStyle:a.userData.modelStyle||null}))},get dogs(){return enemies.map(e=>({x:e.position.x,z:e.position.z,type:e.userData.type,hp:e.userData.hp,role:e.userData.role||'rusher',variant:e.userData.variant||'normal',stuckCount:e.userData.stuckCount||0,modelStyle:e.userData.modelStyle||null,speed:e.userData.speed,fireCooldown:e.userData.fireCooldown,rotation:e.rotation.y,forwardX:-Math.sin(e.rotation.y),forwardZ:-Math.cos(e.rotation.y),target:e.userData.target===player?'player':e.userData.target===home?'home':e.userData.target?'ally':null,targetX:e.userData.target?.position.x??null,targetZ:e.userData.target?.position.z??null}))},get action(){return {activeDogs:enemies.length,raccoons:raccoons.length,targetKills:state.targetKills,spawnTimer:state.spawnTimer,bones:boneShots.length,mousePoops:mousePoops.length,enemyPoops:enemyPoops.length,shots:shots.length,pickups:pickups.length,hazards:hazards.length,yarns:yarnBalls.length,goreDebris:goreDebris.length}},get shots(){return shots.map(s=>({x:s.mesh.position.x,z:s.mesh.position.z,vx:s.v.x,vz:s.v.z,assisted:!!s.target,assistLife:s.assistLife||0}))},get mouse(){return mouseCompanion?{x:mouseCompanion.position.x,y:mouseCompanion.position.y,z:mouseCompanion.position.z,mode:mouseCompanion.userData.mode,fetching:!!mouseCompanion.userData.fetch,modelStyle:mouseCompanion.userData.modelStyle||null,riderVisible:false}:null},get vehicle(){return {kind:player.userData.kind,wheels:player.userData.wheels?.length||0,modelStyle:player.userData.modelStyle||null,revision:'garage-r14',wheelCount:player.userData.tracks?.length||0,wheelSpin:player.userData.tracks?.[0]?.userData?.spin||0,tailPose:player.userData.tailSegments?.[0]?.rotation.z||0,catYaw:player.userData.catYaw||0,coilVisible:!!player.userData.coilRig?.visible,twinVisible:!!player.userData.twinRig?.visible}},get bones(){return boneShots.map(b=>({x:b.mesh.position.x,y:b.mesh.position.y,z:b.mesh.position.z}))},get controls(){return [...keys]},get sticks(){return {move:{...moveInput},aim:{...aimInput}}},get tuning(){return {...tune}},get garage(){return JSON.parse(JSON.stringify(garage))},get camera(){return {yaw:cameraYaw,x:camera.position.x,y:camera.position.y,z:camera.position.z,quality:renderQuality.ratio,qualityMin:renderQuality.min,qualityMax:renderQuality.max,mobilePerf,shadowStride:renderQuality.shadowStride,frameMs:renderQuality.ema*1000,rawFrameMs:motionClock.raw*1000,motionFrameMs:motionClock.dt*1000,jitterMs:motionClock.jitter*1000,homeFade:home?.userData?.fade??1}},get world(){return {...worldMeta,width:arena.halfW*2,depth:arena.maxZ-arena.minZ}},get diagnostics(){return {geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length||0,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,lines:renderer.info.render.lines,blockedDogs:enemies.filter(e=>blocked(e.position.x,e.position.z,1.20)).length,blockedAllies:allies.filter(a=>blocked(a.position.x,a.position.z,.65)).length}},rotateCamera(delta){cameraYaw+=delta},setCameraYaw(value){cameraYaw=value;cameraYawVelocity=0},setMove(x,y){moveInput.x=x;moveInput.y=y;moveInput.active=Math.hypot(x,y)>.01},setAim(x,y,active=true){aimInput.x=x;aimInput.y=y;aimInput.active=active},aimTurret(x,y,steps=24){aimInput.x=x;aimInput.y=y;aimInput.active=true;for(let i=0;i<steps;i++)updateAim(1/60);aimInput.active=false;return player.userData.turret?.userData?.continuousYaw??0},spawnDog(){spawnDog()},spawnDogNear(dx=0,dz=-9){spawnDog();const e=enemies[enemies.length-1],x=clamp(player.position.x+dx,-arena.halfW+3,arena.halfW-3),z=clamp(player.position.z+dz,arena.minZ+3,arena.maxZ-3);if(!blocked(x,z,1.25))e.position.set(x,0,z);else{const p=findClearSpawn(x,z,1.25,24);e.position.set(p[0],0,p[1])}return true},triggerCoil(){state.coilCooldown=0;updateCoil(0);return state.coilCooldown},pauseCombat(){state.playing=false},spawnGore(){spawnHalloweenGore(player.position.clone(),2);return goreDebris.length},completeLevel(){winLevel()},spawnRaccoon(){spawnRaccoon(enemies[0]||null)},spawnValerian(){spawnValerian(player.position.clone().add(new THREE.Vector3(1,0,0)))},spawnValerianAt(dx=5,dz=0){spawnValerian(player.position.clone().add(new THREE.Vector3(dx,0,dz)))},spawnYarn(){spawnYarnPickup(player.position.clone().add(new THREE.Vector3(1,0,0)))},spawnModule(type='parts'){spawnModulePickup(type,player.position.clone().add(new THREE.Vector3(1,0,0)))},launchYarn(){launchYarn()},fireDogBone(){if(!enemies.length)spawnDog();fireBone(enemies[0],player)},upgrade(key){applyGarageUpgrade(key);updateUI()},resetProgress(){garage=garageDefaults();saveGarage();syncTuneFromGarage();updateUI()},start(){initAudio();syncTuneFromGarage();buildLevel(1);overlay.style.display='none'},next(){buildLevel(Math.min(MAX_LEVEL,state.level+1))},fire:fireSausage,bomb};
