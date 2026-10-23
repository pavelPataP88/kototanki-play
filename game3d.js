import * as THREE from './vendor/three.module.js';
import {HERO_VIEWS} from './hero-impostor-data.js';

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
  {name:'СОЛНЕЧНАЯ ЦИТАДЕЛЬ',sky:0x7fc6ff,fog:0xffe3ba,ground:0x8da04c,road:0xd2a265,roof:0xc44835,leaf:0x63933b,kind:'citadel'}
];

const state={playing:false,level:1,score:0,home:5,lives:5,kills:0,targetKills:8,spawned:0,spawnTimer:0,bombs:3,combo:1,comboTimer:0,fireCooldown:0,invuln:0,valerian:0,poopSlow:0,last:0};
const keys=new Set(), obstacles=[], enemies=[], raccoons=[], shots=[], feathers=[], boneShots=[], mousePoops=[], enemyPoops=[], particles=[], allies=[], pickups=[], hazards=[], yarnBalls=[];
let player, helper, mouseCompanion, home, ground, world, playerFacing=new THREE.Vector3(0,0,-1), aimFacing=new THREE.Vector3(0,0,-1), helperCooldown=0, shake=0, cameraYaw=0, cameraYawVelocity=0;
const cameraDrag={active:false,id:null,lastX:0};
const moveInput={x:0,y:0,active:false},aimInput={x:0,y:-1,active:false};
const tune={speed:1,fire:1,damage:1,valerian:1,bombRadius:1};

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x87cfff);
scene.fog=new THREE.Fog(0xcfeeff,40,115);
const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,250);
camera.position.set(0,13.5,22);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.38;
root.appendChild(renderer.domElement);

const audio={ctx:null,master:null};
function initAudio(){
  if(audio.ctx)return;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  audio.ctx=new AC();audio.master=audio.ctx.createGain();audio.master.gain.value=.16;audio.master.connect(audio.ctx.destination)
}
function tone(freq=440,dur=.08,type='square',gain=.22,slide=1){
  initAudio();const ac=audio.ctx;if(!ac)return;
  const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(freq,ac.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*slide),ac.currentTime+dur);g.gain.setValueAtTime(gain,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);o.connect(g);g.connect(audio.master);o.start();o.stop(ac.currentTime+dur)
}
function noise(dur=.14,gain=.12){
  initAudio();const ac=audio.ctx;if(!ac)return;const len=Math.max(1,Math.floor(ac.sampleRate*dur)),buf=ac.createBuffer(1,len,ac.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);const s=ac.createBufferSource(),g=ac.createGain();s.buffer=buf;g.gain.value=gain;s.connect(g);g.connect(audio.master);s.start()
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


const hemi=new THREE.HemisphereLight(0xdff5ff,0x6e8c43,2.15); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff1c4,4.4); sun.position.set(-18,35,16); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-38;sun.shadow.camera.right=38;sun.shadow.camera.top=46;sun.shadow.camera.bottom=-46;sun.shadow.bias=-.00035;scene.add(sun);
const fill=new THREE.DirectionalLight(0xa7d8ff,1.45);fill.position.set(22,15,-28);scene.add(fill);

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
function mesh(g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;return o}
function box(p,sx,sy,sz,m,x=0,y=0,z=0,ry=0){const o=mesh(new THREE.BoxGeometry(sx,sy,sz),m,x,y,z);o.rotation.y=ry;p.add(o);return o}
function sph(p,r,m,x=0,y=0,z=0,s=[1,1,1],seg=14){const o=mesh(new THREE.SphereGeometry(r,seg,Math.max(10,seg-4)),m,x,y,z);o.scale.set(...s);p.add(o);return o}
function cyl(p,rt,rb,h,m,x=0,y=0,z=0,rx=0,rz=0){const o=mesh(new THREE.CylinderGeometry(rt,rb,h,14),m,x,y,z);o.rotation.x=rx;o.rotation.z=rz;p.add(o);return o}
function cone(p,r,h,m,x=0,y=0,z=0,rx=0,rz=0){const o=mesh(new THREE.ConeGeometry(r,h,12),m,x,y,z);o.rotation.x=rx;o.rotation.z=rz;p.add(o);return o}

function decor(g){g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true}});return g}
function bolt(p,x,y,z,m=M.bronze){return sph(p,.055,m,x,y,z,[1,1,.55],8)}
function whisker(p,x,y,z,len=.55,rz=0){const w=box(p,len,.025,.025,M.white,x,y,z);w.rotation.z=rz;return w}
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
  const p=mesh(new THREE.PlaneGeometry(w,h),m,x,y,z);p.rotation.y=ry;parent.add(p);return p
}

const heroViewTextures={};
function heroTextureView(name){
  if(heroViewTextures[name])return heroViewTextures[name];
  const t=new THREE.TextureLoader().load(HERO_VIEWS[name]);t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;heroViewTextures[name]=t;return t
}
function heroSpriteLayer(view='front3q',opacity=1){
  const mat=new THREE.SpriteMaterial({map:heroTextureView(view),transparent:true,depthWrite:false,depthTest:true,alphaTest:.025,toneMapped:false,opacity});
  const s=new THREE.Sprite(mat);s.position.set(0,2.35,.02);s.scale.set(7.4,6.25,1);s.renderOrder=7;s.userData.view=view;return s
}
function makeHeroImpostor(){
  const root=new THREE.Group(),a=heroSpriteLayer('front3q',1),b=heroSpriteLayer('side',0);root.add(a,b);
  root.userData={a,b,blend:0,lastAngle:0};return root
}
const heroViewSpec=[
  {name:'front',angle:0,dims:[5.0,5.95],y:2.45},
  {name:'front3q',angle:.76,dims:[7.4,6.25],y:2.35},
  {name:'side',angle:1.57,dims:[7.25,4.95],y:2.20},
  {name:'rear3q',angle:2.36,dims:[6.7,4.88],y:2.20},
  {name:'rear',angle:Math.PI,dims:[5.1,4.55],y:2.18}
];
function setHeroLayer(layer,spec,mirror,opacity){
  if(layer.userData.view!==spec.name){layer.material.map=heroTextureView(spec.name);layer.material.needsUpdate=true;layer.userData.view=spec.name}
  layer.material.opacity=opacity;
  layer.scale.set((mirror?-1:1)*spec.dims[0],spec.dims[1],1);layer.position.y=spec.y
}
function updateHeroImpostor(dt=.016,now=0){
  const root=player?.userData?.impostor;if(!root)return;
  const dx=camera.position.x-player.position.x,dz=camera.position.z-player.position.z;
  const worldAng=Math.atan2(dx,dz),rel=normalizeAngle(worldAng-player.rotation.y),a=Math.abs(rel),mirror=rel>0;
  let lo=heroViewSpec[0],hi=heroViewSpec[1];
  for(let i=0;i<heroViewSpec.length-1;i++)if(a>=heroViewSpec[i].angle&&a<=heroViewSpec[i+1].angle){lo=heroViewSpec[i];hi=heroViewSpec[i+1];break}
  let t=(a-lo.angle)/Math.max(.001,hi.angle-lo.angle);t=clamp(t,0,1);t=t*t*(3-2*t);
  const u=root.userData,blend=u.blend+(t-u.blend)*Math.min(1,dt*12);u.blend=blend;u.lastAngle=a;
  setHeroLayer(u.a,lo,mirror,1-blend);setHeroLayer(u.b,hi,mirror,blend);
  const speedBob=state.playing?(Math.sin(now*8)*.025):0;
  root.position.y+=((speedBob)-root.position.y)*Math.min(1,dt*10);
  root.rotation.z+=(0-root.rotation.z)*Math.min(1,dt*8);
}
function updateHeroWheels(dt=.016){
  const list=player?.userData?.tracks;if(!list?.length)return;
  const imp=player.userData.impostor?.userData,dominant=imp?(imp.blend>.5?imp.b.userData.view:imp.a.userData.view):'front3q';
  const layouts={
    front:[[-1.22,.57,.98],[1.22,.57,.98],[0,0,0],[0,0,0]],
    front3q:[[-1.62,.52,.92],[1.52,.64,1.00],[-.52,.38,.70],[0,0,0]],
    side:[[-1.95,.48,1.00],[1.70,.50,1.00],[0,0,0],[0,0,0]],
    rear3q:[[-1.55,.50,.90],[1.48,.55,.96],[.54,.38,.68],[0,0,0]],
    rear:[[-1.20,.52,.92],[1.20,.52,.92],[0,0,0],[0,0,0]]
  };
  const arr=layouts[dominant]||layouts.front3q,right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize(),up=new THREE.Vector3(0,1,0);
  for(let i=0;i<list.length;i++){const w=list[i],p=arr[i]||[0,0,0];w.visible=p[2]>0;if(!w.visible)continue;const worldOff=right.clone().multiplyScalar(p[0]).addScaledVector(up,p[1]),local=worldOff.applyAxisAngle(new THREE.Vector3(0,1,0),-player.rotation.y);w.position.copy(local);w.position.z-=.10;w.scale.setScalar(p[2]);w.material.rotation=w.userData.spin||0}
}


function makeCatTank(){
  const g=new THREE.Group(),vehicle=new THREE.Group();g.add(vehicle);
  const blue=heroMetal(0x2c6f9f,0x163b5d,.38),cream=heroMetal(0xeee2c9,0xa48a6c,.15),brass=heroMetal(0xc9842e,0x6e3518,.72),green=heroMetal(0x4d6f31,0x25391a,.34),rubber=heroMetal(0x25272a,0x0f1012,.05);
  const orange=heroFur(0xe97828,0xffb15a,0x8c3d18),creamFur=heroFur(0xf4d9b6,0xfff2d7,0xc58f62),pink=std(0xf08b7e,.42),scarf=heroMetal(0xd94336,0x7e1f1c,.08);

  // Reference-matched litter-box buggy: deep blue tub, cream lip, exposed wheels and front plate.
  taperedTray(vehicle,4.15,4.65,5.25,5.85,1.08,blue,0,.30,.10);
  litterRim(vehicle,5.34,5.96,.24,cream,1.40);
  roundedSlab(vehicle,4.34,4.78,.34,M.litter,0,1.06,.10,.50,.06);
  for(let i=0;i<34;i++)organic(vehicle,.055+Math.random()*.075,i%3===0?std(0xc8ad7b,.98):i%3===1?std(0xead8ad,.98):std(0xb79a66,.98),rand(-1.88,1.88),1.27+rand(-.02,.06),rand(-1.95,1.95),[1.55,.36,1.12],'soft');

  const wheels=[];
  for(const x of [-2.05,2.05])for(const z of [-1.72,1.72]){
    const tire=mesh(new THREE.TorusGeometry(.47,.18,12,28),rubber,x,.47,z);tire.rotation.y=Math.PI/2;vehicle.add(tire);
    const hub=cyl(vehicle,.22,.22,.28,brass,x,.47,z,0,Math.PI/2);hub.rotation.z=Math.PI/2;
    for(let a=0;a<8;a++){const stud=organic(vehicle,.035,cream,x,.47+Math.cos(a*Math.PI/4)*.18,z+Math.sin(a*Math.PI/4)*.18,[1,1,.7],'soft');stud.rotation.y=Math.PI/2}
    wheels.push(tire)
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
  const cat=new THREE.Group();cat.position.set(-.48,1.72,.22);cat.scale.setScalar(1.20);cat.rotation.y=2.56;g.add(cat);
  organic(cat,.78,orange,0,.72,.05,[1.00,1.12,.94],'catBody');
  organic(cat,.49,creamFur,0,.54,-.48,[.92,.82,.78],'soft');
  organic(cat,.27,orange,-.50,.72,-.72,[1.18,.80,1.25],'paw');organic(cat,.27,orange,.50,.72,-.72,[1.18,.80,1.25],'paw');

  // Huge continuous fluffy tail, matching the reference's single sweeping plume.
  const tail=new THREE.Group();tail.position.set(.72,.68,.54);cat.add(tail);
  const tailCurve=[[0,0,0],[.30,.10,.24],[.56,.30,.48],[.72,.60,.66],[.68,.92,.70],[.50,1.20,.60],[.22,1.40,.46],[-.08,1.50,.34]];
  tubePart(tail,tailCurve,.29,orange,32);
  tubePart(tail,tailCurve.map((p,i)=>[p[0]+.02*Math.sin(i),p[1]+.02,p[2]-.02]),.18,heroFur(0xf0a24c,0xffd18a,0xb25722),28);
  for(let i=2;i<tailCurve.length;i++){const p=tailCurve[i];for(const side of [-1,1])heroFurTuft(tail,p[0]+side*.16,p[1]+.05,p[2]+.04,orange,.34,side*.32)}
  organic(tail,.30,creamFur,-.10,1.53,.34,[1.25,1.06,1.20],'soft');

  // scarf tied at the neck with two flying tails
  roundedSlab(cat,1.28,.42,.20,scarf,0,1.18,-.04,.14,.035);
  const s1=roundedSlab(cat,.24,.90,.14,scarf,-.50,1.16,.54,.07,.02);s1.rotation.y=.15;s1.rotation.z=.10;
  const s2=roundedSlab(cat,.22,.82,.13,scarf,-.62,1.06,.58,.07,.02);s2.rotation.y=-.28;s2.rotation.z=-.18;

  const head=new THREE.Group();head.position.set(0,1.84,-.12);cat.add(head);
  organic(head,.76,orange,0,0,0,[1.12,.98,.98],'catHead');
  // pronounced forehead/cheeks for the reference expression
  organic(head,.28,orange,-.38,.05,-.35,[1.08,.92,.82],'soft');organic(head,.28,orange,.38,.05,-.35,[1.08,.92,.82],'soft');
  organic(head,.38,creamFur,-.20,-.17,-.59,[1.08,.72,.88],'muzzle');organic(head,.38,creamFur,.20,-.17,-.59,[1.08,.72,.88],'muzzle');
  softEar(head,-1,.44,.02,orange,false,1.08);softEar(head,1,.44,.02,orange,false,1.08);
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

  const shcv=document.createElement('canvas');shcv.width=shcv.height=128;const shx=shcv.getContext('2d'),grad=shx.createRadialGradient(64,64,8,64,64,60);grad.addColorStop(0,'rgba(28,20,15,.40)');grad.addColorStop(.55,'rgba(28,20,15,.20)');grad.addColorStop(1,'rgba(28,20,15,0)');shx.fillStyle=grad;shx.fillRect(0,0,128,128);const sht=new THREE.CanvasTexture(shcv),shm=new THREE.MeshBasicMaterial({map:sht,transparent:true,depthWrite:false,opacity:.85});const contact=mesh(new THREE.PlaneGeometry(6.2,6.8),shm,0,.035,.18);contact.rotation.x=-Math.PI/2;contact.castShadow=false;contact.receiveShadow=false;g.add(contact);
  const impostor=makeHeroImpostor();g.add(impostor);
  vehicle.visible=false;cat.visible=false;
  const wheelOverlay=new THREE.Group();g.add(wheelOverlay);
  const wcv=document.createElement('canvas');wcv.width=wcv.height=128;const wx=wcv.getContext('2d'),wg=wx.createRadialGradient(64,64,12,64,64,60);wg.addColorStop(0,'#d28b34');wg.addColorStop(.28,'#6b472d');wg.addColorStop(.42,'#d8b06a');wg.addColorStop(.48,'#282a2d');wg.addColorStop(1,'rgba(24,25,27,0)');wx.fillStyle=wg;wx.fillRect(0,0,128,128);wx.strokeStyle='#e2c081';wx.lineWidth=6;for(let a=0;a<8;a++){wx.beginPath();wx.moveTo(64+Math.cos(a*Math.PI/4)*18,64+Math.sin(a*Math.PI/4)*18);wx.lineTo(64+Math.cos(a*Math.PI/4)*48,64+Math.sin(a*Math.PI/4)*48);wx.stroke()}wx.strokeStyle='#232427';wx.lineWidth=8;wx.beginPath();wx.arc(64,64,48,0,Math.PI*2);wx.stroke();
  const wtex=new THREE.CanvasTexture(wcv);wtex.colorSpace=THREE.SRGBColorSpace;const visualWheels=[];
  for(let i=0;i<4;i++){const wm=new THREE.SpriteMaterial({map:wtex,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});const ws=new THREE.Sprite(wm);ws.renderOrder=12;ws.scale.set(.95,.95,1);wheelOverlay.add(ws);visualWheels.push(ws)}
  g.userData={tracks:visualWheels,wheels:visualWheels,cat,head,turret,barrel,vehicle,tail,impostor,wheelOverlay,catYaw:cat.rotation.y,kind:'litterbox',modelStyle:'reference-impostor-r6'};return g
}
function makeMouse(){
  const g=new THREE.Group(),fur=heroFur(0xaeb1b6,0xe0e3e6,0x74777d),belly=heroFur(0xd9d4cc,0xf2eee8,0xb9b2a8),pink=new THREE.MeshPhysicalMaterial({color:0xf0a5b0,roughness:.62,clearcoat:.08}),eye=new THREE.MeshPhysicalMaterial({color:0x17191d,roughness:.18,clearcoat:.75});
  // Pear-shaped body and chest.
  organic(g,.34,fur,0,.43,.02,[1.28,.96,1.42],'soft');
  organic(g,.22,belly,0,.45,-.28,[.86,1.16,.72],'soft');
  const head=new THREE.Group();head.position.set(0,.77,-.32);g.add(head);
  organic(head,.30,fur,0,0,0,[1.02,.96,1.08],'soft');
  // Big round pink ears.
  for(const side of [-1,1]){organic(head,.19,pink,side*.23,.16,.03,[.34,1.08,1.02],'soft');organic(head,.145,fur,side*.23,.16,.04,[.30,1.05,1.0],'soft')}
  // Eyes, muzzle and nose.
  organic(head,.067,eye,-.105,.045,-.278,[1,.95,.48],'soft');organic(head,.067,eye,.105,.045,-.278,[1,.95,.48],'soft');
  organic(head,.11,belly,0,-.07,-.25,[1.18,.72,.86],'soft');organic(head,.055,pink,0,-.055,-.365,[1,.78,.72],'soft');
  for(const side of [-1,1])for(const yy of [-.11,-.03,.05])tubePart(head,[[side*.08,yy,-.31],[side*.26,yy+(yy*.15),-.39],[side*.47,yy+(yy*.22),-.34]],.008,M.white,5);
  // Tiny paws gripping the litter-box rim.
  organic(g,.10,pink,-.23,.35,-.31,[1.18,.52,1.30],'paw');organic(g,.10,pink,.23,.35,-.31,[1.18,.52,1.30],'paw');
  // One continuous pink tail.
  tubePart(g,[[.25,.35,.22],[.50,.32,.43],[.72,.26,.57],[.91,.18,.48],[1.02,.16,.30]],.035,pink,18);
  // Small poop pouch kept rounded, not a square backpack.
  organic(g,.16,std(0x6c4b32,.88),.28,.50,.18,[.90,1.10,.72],'soft');
  g.traverse(o=>{if(o.isMesh){o.renderOrder=10;o.material.depthTest=false;o.material.depthWrite=false}});
  g.userData={fireCooldown:.4,fetch:null,mode:'ride',phase:rand(0,6.28),head,modelStyle:'mouse-reference-r6'};return g
}
function makeBird(){
  const g=new THREE.Group();sph(g,.48,M.bird,0,.35,0,[.9,1.15,.9]);sph(g,.50,M.bird,0,.92,-.08,[1,.92,1]);
  cone(g,.24,.72,M.beak,0,.86,-.62,Math.PI/2,0);sph(g,.12,M.white,-.18,1.05,-.46);sph(g,.12,M.white,.18,1.05,-.46);sph(g,.055,M.pupil,-.18,1.05,-.57);sph(g,.055,M.pupil,.18,1.05,-.57);
  const l=box(g,.78,.12,.9,M.birdWing,-.48,.42,.08,0),r=box(g,.78,.12,.9,M.birdWing,.48,.42,.08,0);l.rotation.z=.5;r.rotation.z=-.5;
  box(g,.82,.13,.22,M.red,0,.58,.05);g.userData={leftWing:l,rightWing:r};return g;
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
  softEar(head,-1,.38,-.03,fur,floppy,floppy?.88:.82);softEar(head,1,.38,-.03,fur,floppy,floppy?.88:.82);
  // Open jaw and tongue.
  organic(head,.27,M.black,0,-.36,-.55,[.92,.42,.72],'soft');organic(head,.18,M.red,0,-.45,-.62,[.72,.24,.82],'soft');
  for(const x of [-.18,-.06,.06,.18]){const tooth=cone(head,.045,.18,M.white,x,-.24,-.72,Math.PI,0);tooth.rotation.x=Math.PI}
  // Articulated curved legs and broad paws.
  const legs=[];
  for(const x of [-.48,.48])for(const z of [-.52,.70]){
    const front=z<0,phase=(x<0?-.08:.08);
    const leg=tubePart(g,[[x,1.02,z],[x+phase,.65,z+(front?-.08:.08)],[x,.27,z+(front?-.16:.14)]],breed===1?.14:.12,fur,14);legs.push(leg);
    organic(g,.18,dark,x,.18,z+(front?-.20:.18),[1.25,.58,1.52],'paw')
  }
  tubePart(g,[[0,1.30,1.34],[.18,1.55,1.72],[.42,1.82,1.98],[.30,2.03,2.16]],breed===3?.12:.10,fur,18);
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
  g.userData={hp:1+Math.floor(type/2),speed:4.35+type*.42,type,legs,fireCooldown:rand(.25,.75),preferredRange:7.2+type*.45,flankSign:Math.random()<.5?-1:1,thinkTimer:rand(0,.35),target:null,dodgeSeed:rand(0,6.28),modelStyle:'organic-r3'};
  g.scale.set(breed===1?1.30:breed===2?1.16:1.22,breed===1?1.10:1.18,1.24);return g
}
function makeBone(){
  const g=new THREE.Group();
  const shaft=cyl(g,.10,.13,.72,M.bone,0,0,0,0,Math.PI/2);shaft.rotation.z=Math.PI/2;
  for(const x of [-.42,.42])for(const y of [-.11,.11])sph(g,.13,M.bone,x,y,0,[1,.9,.9],9);
  g.rotation.z=.4;
  return g
}
function fireBone(dog,target=player){
  if(!dog?.parent||!target)return;
  const aim=target.position.clone().add(new THREE.Vector3(0,target===player?1.2:1.0,0));
  const origin=dog.position.clone().add(new THREE.Vector3(0,1.65,0));
  const dir=aim.sub(origin).normalize();
  const b=makeBone();b.position.copy(origin).add(dir.clone().multiplyScalar(.9));b.rotation.y=Math.atan2(dir.x,dir.z);scene.add(b);
  boneShots.push({mesh:b,v:dir.multiplyScalar(14.5+dog.userData.type*1.15),life:2.6,spin:rand(-13,13),owner:dog});sfx.bone();
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
  for(const x of [-.28,.28])for(const z of [-.16,.24]){tubePart(g,[[x,.94,z],[x,.60,z],[x+.04*Math.sign(x),.26,z-.06]],.075,M.raccoonDark,10);organic(g,.12,M.raccoonDark,x,.18,z-.10,[1.2,.55,1.35],'paw')}
  // Curved striped tail.
  const tailMat=[M.raccoonDark,M.raccoon,M.raccoonDark,M.raccoon,M.raccoonDark];for(let i=0;i<5;i++)tubePart(g,[[.36+i*.12,1.02,.38+i*.12],[.54+i*.12,1.26,.52+i*.12],[.66+i*.12,1.50,.48+i*.12]],.13-i*.012,tailMat[i],8);
  const cart=new THREE.Group();cart.position.set(0,.24,.92);g.add(cart);roundedSlab(cart,1.48,1.16,.18,M.steel,0,.45,0,.16,.035);
  for(const x of [-.62,.62])for(const z of [-.46,.46])tubePart(cart,[[x,.45,z],[x,.86,z],[x,1.16,z]],.035,M.steel,8);
  for(let x=-.52;x<=.52;x+=.26)tubePart(cart,[[x,.48,-.50],[x,.83,-.50],[x,1.08,-.50]],.023,M.steel,6);
  for(const x of [-.56,.56])wheel(cart,x,.46);
  organic(cart,.45,std(0xb73731,.55,.25),0,1.12,.04,[1,1,1],'soft');
  const shield=mesh(new THREE.CylinderGeometry(.62,.62,.12,22),M.steel,.78,1.16,-.20);shield.rotation.z=Math.PI/2;g.add(shield);
  tubePart(g,[[-.64,1.05,-.03],[-.80,1.55,-.08],[-1.02,2.05,-.18]],.055,M.wood,10);
  const hoop=mesh(new THREE.TorusGeometry(.48,.055,8,22),M.steel,-1.08,2.20,-.25);hoop.rotation.y=Math.PI/2;hoop.rotation.z=-.45;g.add(hoop);
  g.userData={hp:2,speed:4.1,fireCooldown:rand(.55,1.1),escort:null,phase:rand(0,6.28),cart,modelStyle:'organic-r3'};return g
}
function makePoopBall(mat=M.trash){
  const g=new THREE.Group();sph(g,.19,mat,0,0,0,[1.15,.8,1],9);sph(g,.13,mat,.02,.15,0,[1,.7,1],8);return g
}
function fireMousePoop(target){
  if(!mouseCompanion||!target)return;const origin=mouseCompanion.position.clone().add(new THREE.Vector3(0,.7,0)),aim=target.position.clone().add(new THREE.Vector3(0,1,0)),dir=aim.sub(origin).normalize(),m=makePoopBall(std(0x5a351f,.9));m.position.copy(origin);scene.add(m);mousePoops.push({mesh:m,v:dir.multiplyScalar(15),life:2.2,spin:rand(-12,12)});sfx.poop()
}
function fireRaccoonPoop(r,target){
  if(!r?.parent||!target)return;const origin=r.position.clone().add(new THREE.Vector3(0,1.25,0)),aim=target.position.clone().add(new THREE.Vector3(0,1,0)),dir=aim.sub(origin).normalize(),m=makePoopBall(M.trash);m.position.copy(origin);scene.add(m);enemyPoops.push({mesh:m,v:dir.multiplyScalar(11.5),life:2.8,spin:rand(-10,10),owner:r});sfx.poop()
}
function spawnRaccoon(escort=null){
  const r=makeRaccoon();r.userData.escort=escort||nearestEnemy(home.position,999);if(escort)r.position.copy(escort.position).add(new THREE.Vector3(rand(-2,2),0,rand(1.5,3)));else r.position.set(rand(-18,18),0,-28);scene.add(r);raccoons.push(r);return r
}

function makeAllyCat(i=0){
  const g=new THREE.Group(),fur=[M.orange,std(0x8d6748,.8),std(0xc7c2b4,.8),std(0x4d5660,.8)][i%4];
  sph(g,.45,fur,0,1.15,0,[1,.95,.9]);sph(g,.38,M.cream,0,1.05,-.28,[.9,.68,.65]);
  sph(g,.42,fur,0,1.9,-.05,[1,.95,.95]);sph(g,.24,M.cream,0,1.78,-.35,[1,.7,.75]);
  cone(g,.2,.48,fur,-.25,2.32,-.02,0,-.12);cone(g,.2,.48,fur,.25,2.32,-.02,0,.12);
  sph(g,.08,M.eye,-.16,1.98,-.39);sph(g,.08,M.eye,.16,1.98,-.39);sph(g,.035,M.pupil,-.16,1.98,-.45);sph(g,.035,M.pupil,.16,1.98,-.45);
  box(g,.72,.34,.46,M.red,0,1.25,.05);
  const legs=[];for(const x of [-.23,.23])for(const z of [-.14,.18]){const leg=cyl(g,.075,.09,.58,fur,x,.48,z);legs.push(leg)}
  const gun=new THREE.Group();box(gun,.14,.15,.9,M.darkSteel,0,0,-.38);cyl(gun,.045,.055,.9,M.steel,0,.01,-1.05,Math.PI/2,0);gun.position.set(.42,1.33,-.12);gun.rotation.z=-.12;g.add(gun);
  const tail=cyl(g,.06,.08,.9,fur,.46,1.08,.26,0,-.95);tail.rotation.x=.35;
  g.userData={legs,fireCooldown:rand(.15,.8),slot:i,phase:rand(0,6.28),hp:2};g.scale.setScalar(.9);return g
}
function spawnCatSquad(){
  for(const a of allies)scene.remove(a);allies.length=0;
  const count=Math.min(6,4+Math.floor((state.level-1)/8));
  const slots=[[-6,10],[6,10],[-8,5],[8,5],[-10,0],[10,0]];
  for(let i=0;i<count;i++){const a=makeAllyCat(i),s=slots[i];a.scale.setScalar(.72);a.position.set(s[0],0,s[1]);scene.add(a);allies.push(a)}
}
function fireAlly(a,target){
  const dir=target.position.clone().sub(a.position).setY(.2).normalize();
  const m=mesh(new THREE.SphereGeometry(.09,7,5),M.glow);m.position.copy(a.position).add(new THREE.Vector3(0,1.35,0)).add(dir.clone().multiplyScalar(.8));scene.add(m);
  feathers.push({mesh:m,v:dir.multiplyScalar(16),life:1.7,ally:true})
}
function updateAllies(dt,now){
  for(let i=0;i<allies.length;i++){
    const a=allies[i],u=a.userData,target=nearestEnemy(a.position,18);
    let goal;
    if(target)goal=target.position.clone().add(new THREE.Vector3((i%3-1)*1.6,0,4.2+(i%2)*1.2));
    else goal=player.position.clone().add(new THREE.Vector3((i%3-1)*2.2,0,-2-Math.floor(i/3)*2.2));
    goal.x=clamp(goal.x,-18,18);goal.z=clamp(goal.z,-20,22);
    const d=goal.clone().sub(a.position);d.y=0;
    if(d.length()>.55){d.normalize();const step=d.multiplyScalar(4.2*dt);const nx=a.position.x+step.x,nz=a.position.z+step.z;if(!blocked(nx,a.position.z))a.position.x=nx;if(!blocked(a.position.x,nz))a.position.z=nz;a.rotation.y=Math.atan2(d.x,d.z)}
    for(let k=0;k<u.legs.length;k++)u.legs[k].rotation.x=Math.sin(now*11+u.phase+k*Math.PI)*.55;
    a.position.y=.03+Math.abs(Math.sin(now*11+u.phase))*.07;
    u.fireCooldown-=dt;
    if(target&&u.fireCooldown<=0){fireAlly(a,target);u.fireCooldown=.38+Math.random()*.36}
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
function makeFence(len=5){const g=new THREE.Group();for(let x=-len/2;x<=len/2;x+=1.55)box(g,.18,1.25,.18,M.wood,x,.62,0);box(g,len,.18,.16,M.wood,0,.92,0);box(g,len,.18,.16,M.wood,0,.36,0);return g}
function makeWatchTower(){const g=new THREE.Group();for(const x of [-1.15,1.15])for(const z of [-1.15,1.15])cyl(g,.13,.18,4.6,M.wood,x,2.3,z);box(g,3.0,.3,3.0,M.woodLight,0,4.25,0);for(const x of [-1.35,1.35])box(g,.16,1.2,3.0,M.wood,x,4.9,0);for(const z of [-1.35,1.35])box(g,3.0,1.2,.16,M.wood,0,4.9,z);const roof=mesh(new THREE.ConeGeometry(2.35,2.2,4),std(0x3c78af,.8),0,6.1,0);roof.rotation.y=Math.PI/4;g.add(roof);return g}
function makeCastle(){const g=new THREE.Group();for(const x of [-6,-2,2,6]){box(g,2.2,6.5,2.2,M.stone,x,3.25,0);const roof=mesh(new THREE.ConeGeometry(1.75,2.4,4),std(0x3976b1,.75),x,7.6,0);roof.rotation.y=Math.PI/4;g.add(roof)}box(g,11.5,4.8,2.0,M.stone,0,2.4,.6);box(g,4,8.2,3.0,M.plaster,0,4.1,1.0);const roof=mesh(new THREE.ConeGeometry(2.6,3.0,4),std(0xc34d40,.72),0,9.25,1.0);roof.rotation.y=Math.PI/4;g.add(roof);g.scale.setScalar(1.18);return g}
function flowerPatch(p,x,z,seed=0){const colors=[0xffffff,0xffdb4d,0xf06c9c,0x6fb8ff];for(let i=0;i<12;i++){const a=(i*2.4+seed)%6.28,r=.25+(i%5)*.22;const f=sph(p,.07,std(colors[i%colors.length],.7),x+Math.cos(a)*r,.12,z+Math.sin(a)*r,[1,1,1],8);f.castShadow=false}}
function makeBase(){const g=new THREE.Group();const h=makeHouse(0x2d6da3,1.15);g.add(h);const tower=makeWatchTower();tower.position.set(5.2,0,1.2);tower.scale.setScalar(.78);g.add(tower);box(g,.12,4,.12,M.steel,-4.2,5.4,.5);box(g,1.5,.75,.12,std(0xe94338,.7),-3.45,6.5,.5);return g}

function seedRng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296}}
function clearWorld(){if(world){scene.remove(world);world.traverse(o=>{if(o.geometry)o.geometry.dispose()})}obstacles.length=0;enemies.splice(0).forEach(e=>scene.remove(e));shots.splice(0).forEach(e=>scene.remove(e.mesh));feathers.splice(0).forEach(e=>scene.remove(e.mesh));boneShots.splice(0).forEach(e=>scene.remove(e.mesh));mousePoops.splice(0).forEach(e=>scene.remove(e.mesh));enemyPoops.splice(0).forEach(e=>scene.remove(e.mesh));raccoons.splice(0).forEach(r=>scene.remove(r));particles.splice(0).forEach(e=>scene.remove(e.mesh));allies.splice(0).forEach(a=>scene.remove(a));pickups.splice(0).forEach(p=>scene.remove(p.mesh));hazards.splice(0).forEach(h=>scene.remove(h.mesh));yarnBalls.splice(0).forEach(y=>scene.remove(y.mesh));world=new THREE.Group();scene.add(world)}
function collider(x,z,r){obstacles.push({x,z,r})}
function addVillageSet(loc,rng){
  for(const side of [-1,1])for(let i=0;i<2;i++){
    const h=makeHouse([loc.roof,0xc44e3e,0x3b7baa][(i+(side>0?1:0))%3],.58+rng()*.10);h.position.set(side*(22+rng()*2.5),0,-16+i*18+rng()*2);h.rotation.y=side>0?-.18:.18;world.add(h);collider(h.position.x,h.position.z,2.4)
  }
  for(let i=0;i<5;i++){const f=makeFence(5+rng()*3);f.position.set((i%2?-1:1)*(11+rng()*5),0,-20+i*10);f.rotation.y=(i%2?1:-1)*.08;world.add(f)}
  const wt=makeWatchTower();wt.position.set(-12,0,-8);wt.scale.setScalar(.72);world.add(wt);collider(-12,-8,1.5)
}
const layoutNames=['КРИВЫЕ ОГОРОДЫ','РЫНОЧНАЯ ПЛОЩАДЬ','ЗАБОРНЫЙ ЛАБИРИНТ','КАМЕННЫЙ КРУГ','МЕЛЬНИЧНЫЙ ПЕРЕКРЁСТОК'];
function addLevelLayout(n,loc,rng){
  const layout=(n-1)%layoutNames.length;
  if(layout===0){
    for(const x of [-9,9])for(const z of [-18,-6,6]){const f=makeFence(6.5);f.position.set(x,0,z);f.rotation.y=(z/6)*.12;world.add(f);collider(x,z,1.8)}
  }else if(layout===1){
    const plaza=mesh(new THREE.CylinderGeometry(8,8,.10,28),std(0xd9c08d,.95),0,.05,-4);world.add(plaza);
    for(let i=0;i<8;i++){const a=i*Math.PI/4,r=10;const rock=makeRock(.72);rock.position.set(Math.cos(a)*r,0,-4+Math.sin(a)*r);world.add(rock);collider(rock.position.x,rock.position.z,.75)}
  }else if(layout===2){
    for(let i=0;i<7;i++){const f=makeFence(8);f.position.set((i%2?7:-7),0,-25+i*8);f.rotation.y=(i%2?.58:-.58);world.add(f);collider(f.position.x,f.position.z,1.7)}
  }else if(layout===3){
    for(let i=0;i<12;i++){const a=i*Math.PI/6,r=12+(i%2)*3;const rock=makeRock(.75+(i%3)*.12);rock.position.set(Math.cos(a)*r,0,-3+Math.sin(a)*r);world.add(rock);collider(rock.position.x,rock.position.z,1.0)}
  }else{
    const cross=mesh(new THREE.PlaneGeometry(52,7),std(loc.road,.96),0,.028,-5);cross.rotation.x=-Math.PI/2;world.add(cross);
    const tower=makeWatchTower();tower.position.set(0,0,-8);tower.scale.setScalar(.72);world.add(tower);collider(0,-8,1.7);
    for(const p of [[-11,-18],[11,-18],[-11,8],[11,8]]){const h=makeHouse(loc.roof,.52);h.position.set(p[0],0,p[1]);world.add(h);collider(p[0],p[1],2.0)}
  }
  return layoutNames[layout]
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
  m.position.copy(player.position).add(new THREE.Vector3(0,1.0,0)).add(aimFacing.clone().multiplyScalar(1.5));scene.add(m);
  const dir=aimFacing.clone().normalize();yarnBalls.push({mesh:m,v:dir.multiplyScalar(12),life:6,hits:new Set()});sfx.pickup();showToast('🧶 БЕШЕНЫЙ КЛУБОК!')
}

function makePoop(){
  const g=new THREE.Group(),brown=std(0x6a3c1f,.92);sph(g,.42,brown,0,.22,0,[1.3,.55,1.2],10);sph(g,.30,brown,.05,.48,0,[1,.65,1],10);sph(g,.18,brown,-.04,.68,0,[1,.7,1],10);return g
}
function spawnPoopField(n,rng){
  const count=4+(n%4);
  for(let i=0;i<count;i++){let x=(rng()<.5?-1:1)*(4+rng()*16),z=-23+rng()*44;if(Math.hypot(x,z-18)<6)z-=8;const m=makePoop();m.position.set(x,0,z);scene.add(m);hazards.push({mesh:m,type:'poop',armed:true})}
}
function updateChaosItems(dt,now){
  for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.life-=dt;p.mesh.rotation.y+=dt*1.8;p.mesh.position.y=.14+Math.sin(now*4+p.bob)*.12;if(player.position.distanceTo(p.mesh.position)<1.45){applyPickup(p);continue}if(p.life<=0){scene.remove(p.mesh);pickups.splice(i,1)}}
  for(let i=hazards.length-1;i>=0;i--){const h=hazards[i];if(!h.armed)continue;h.mesh.rotation.y+=dt*.35;
    const pd=player.position.distanceTo(h.mesh.position);
    if(pd<1.35){h.armed=false;state.lives--;state.invuln=1.0;state.poopSlow=2.8;sfx.poop();burst(h.mesh.position,0x79502b,24);shake=.8;showToast('💩 БА-БАХ! ВЛИП!');scene.remove(h.mesh);hazards.splice(i,1);updateUI();if(state.lives<=0)lose('Кот героически подорвался на какашке');continue}
    for(const e of [...enemies])if(e.position.distanceTo(h.mesh.position)<1.05){h.armed=false;sfx.poop();burst(h.mesh.position,0x79502b,18);damageEnemy(e,2);scene.remove(h.mesh);hazards.splice(i,1);break}
  }
  for(let i=yarnBalls.length-1;i>=0;i--){const y=yarnBalls[i];y.life-=dt;y.mesh.position.addScaledVector(y.v,dt);y.mesh.rotation.x+=dt*5;y.mesh.rotation.y+=dt*7;
    if(Math.abs(y.mesh.position.x)>23){y.v.x*=-1;y.mesh.position.x=clamp(y.mesh.position.x,-23,23);sfx.hit()}
    if(y.mesh.position.z<-29||y.mesh.position.z>29){y.v.z*=-1;y.mesh.position.z=clamp(y.mesh.position.z,-29,29);sfx.hit()}
    for(const e of [...enemies])if(!y.hits.has(e)&&e.position.distanceTo(y.mesh.position)<1.5){y.hits.add(e);damageEnemy(e,2);burst(e.position,0xe45f9d,9)}
    if(y.life<=0){scene.remove(y.mesh);yarnBalls.splice(i,1)}
  }
}
function normalizeAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a}
function updateAim(dt){
  if(aimInput.active&&Math.hypot(aimInput.x,aimInput.y)>.18){
    const x=aimInput.x,z=aimInput.y,cs=Math.cos(cameraYaw),sn=Math.sin(cameraYaw);
    aimFacing.set(x*cs+z*sn,0,-x*sn+z*cs).normalize()
  }
  const worldYaw=Math.atan2(aimFacing.x,aimFacing.z)+Math.PI,local=normalizeAngle(worldYaw-player.rotation.y);
  if(player.userData.turret)player.userData.turret.rotation.y+=normalizeAngle(local-player.userData.turret.rotation.y)*Math.min(1,dt*14);
  if(player.userData.head){
    const catYaw=player.userData.catYaw||0;
    const activeTarget=normalizeAngle(local-catYaw);
    const neutral=Math.sin(performance.now()*.0009)*.12;
    const headTarget=aimInput.active?clamp(activeTarget,-2.65,2.65):neutral;
    player.userData.head.rotation.y+=normalizeAngle(headTarget-player.userData.head.rotation.y)*Math.min(1,dt*(aimInput.active?11:4.5));
    player.userData.head.rotation.x=Math.sin(performance.now()*.006)*.035+(aimInput.active?-.035:0)
  }
}

function addGardenProps(rng,n){
  // Bird bath.
  const bath=new THREE.Group();cyl(bath,.55,.72,1.2,M.stone,0,.62,0);cyl(bath,1.45,1.25,.28,std(0x6aaed0,.35),0,1.30,0);sph(bath,1.05,std(0x63bddd,.18),0,1.43,0,[1,.12,1],16);bath.position.set(-11.5,0,5.5);world.add(bath);collider(-11.5,5.5,1.2);
  // Pink flamingo and gnome.
  const fl=new THREE.Group();cyl(fl,.06,.06,2.1,std(0xe95f91,.65),0,1.05,0);sph(fl,.52,std(0xee6b9d,.68),0,2.16,0,[.72,1,1.25]);cyl(fl,.11,.14,1.45,std(0xee6b9d,.68),.22,2.72,-.15,.3,.15);sph(fl,.25,std(0xee6b9d,.68),.36,3.32,-.28);cone(fl,.12,.45,M.black,.52,3.27,-.44,Math.PI/2,0);fl.position.set(11.8,0,8.0);world.add(fl);
  const gn=new THREE.Group();cyl(gn,.28,.38,.85,std(0x2f6fa8,.8),0,.46,0);sph(gn,.30,std(0xf2c7a3,.7),0,1.03,-.05);cone(gn,.38,1.05,std(0xd44738,.7),0,1.66,0);sph(gn,.22,M.white,0,.82,-.24,[1,1.25,.6]);gn.position.set(13.8,0,17.0);world.add(gn);

  // Raised tomato beds like the reference backyard.
  for(const p of [[-15,-18,.15],[15,-16,-.12],[-15,12,-.08],[15,15,.18]]){const bed=makeGardenBed();bed.position.set(p[0],0,p[1]);bed.rotation.y=p[2];bed.scale.setScalar(.72);world.add(decor(bed));collider(p[0],p[1],2.0)}

  // Barrels, pots and sunflowers.
  for(const p of [[-18,-6],[18,-4],[-19,20]]){const b=makeBarrel();b.position.set(p[0],0,p[1]);b.scale.setScalar(.82);world.add(decor(b));collider(p[0],p[1],.8)}
  for(let i=0;i<7;i++){const pot=makeTerracottaPot();pot.position.set((i%2?-1:1)*(17+rng()*3),0,-20+i*6.3);pot.scale.setScalar(.65+rng()*.18);world.add(decor(pot))}
  for(let i=0;i<12;i++){const s=makeSunflower();s.position.set((i%2?-1:1)*(18+rng()*2.5),0,-25+i*4.5);s.scale.setScalar(.60+rng()*.35);world.add(decor(s))}

  // Mud puddles and cat-logo manholes.
  for(let i=0;i<4;i++){const x=(i-1.5)*7+(n%2?1.5:-1.5),z=-17+i*11;const mud=mesh(new THREE.CylinderGeometry(1.8,2.35,.055,22),std(0x775238,.92),x,.03,z);world.add(mud);const shine=mesh(new THREE.CylinderGeometry(1.25,1.8,.02,22),std(0x6c91a0,.25),x,.065,z);world.add(shine)}
  for(let i=0;i<2;i++){const x=i?12:-12,z=i?-4:2;const lid=mesh(new THREE.CylinderGeometry(1.25,1.25,.10,24),M.darkSteel,x,.07,z);world.add(lid);sph(world,.30,M.cream,x,.14,z,[1,.18,1],10)}

  // White picket fence.
  const fenceMat=std(0xf4eee0,.78);
  for(const side of [-1,1])for(let z=-24;z<=20;z+=5.5){for(let k=0;k<4;k++){const x=side*22.2;box(world,.24,1.65,.24,fenceMat,x,.82,z+k*1.18);cone(world,.22,.42,fenceMat,x,1.85,z+k*1.18)}box(world,.18,.18,4.7,fenceMat,side*22.2,1.22,z+1.75);box(world,.18,.18,4.7,fenceMat,side*22.2,.52,z+1.75)}

  // Shed wall/tool rack at the far end.
  const shed=new THREE.Group();box(shed,12,4.5,.38,std(0x9b5e3a,.82),0,2.25,0);for(let x=-5.5;x<=5.5;x+=1.0)box(shed,.08,4.2,.12,M.woodLight,x,2.25,-.22);
  box(shed,1.4,.12,.15,M.steel,-2.4,2.4,-.35,.35);box(shed,.12,2.5,.12,M.steel,-2.4,1.45,-.35);box(shed,1.1,.10,.14,M.steel,1.5,2.7,-.35,-.4);box(shed,.12,2.3,.12,M.wood,1.5,1.45,-.35);shed.position.set(0,0,-36);world.add(decor(shed));

  for(let i=0;i<30;i++)flowerPatch(world,(rng()<.5?-1:1)*(7+rng()*14),-25+rng()*49,50+i)
}
function buildLevel(n){
  clearWorld();const loc=locations[Math.floor((n-1)/5)],rng=seedRng(1207+n*9137);scene.background.setHex(loc.sky);scene.fog.color.setHex(loc.fog);
  hemi.color.setHex(0xe9f9ff);hemi.groundColor.setHex(loc.ground);sun.color.setHex(0xfff0c2);
  ground=mesh(new THREE.PlaneGeometry(70,82),texStd(loc.ground,shade(loc.ground,.70),.98,0,14,'noise'),0,0,0);ground.rotation.x=-Math.PI/2;world.add(ground);
  const road=mesh(new THREE.PlaneGeometry(10,78),texStd(loc.road,shade(loc.road,.72),.96,0,10,'noise'),0,.025,-1);road.rotation.x=-Math.PI/2;world.add(road);
  const castle=makeCastle();castle.position.set(0,0,-43);castle.scale.setScalar(.8);world.add(castle);
  for(const x of [-25,25]){const hill=mesh(new THREE.SphereGeometry(13,20,12),std(0x75a760,.98),x,-4,-46);hill.scale.set(1.5,.42,1.1);hill.castShadow=false;world.add(hill)}
  addVillageSet(loc,rng);const layoutName=addLevelLayout(n,loc,rng);ui.place.textContent=loc.name+' · '+layoutName;
  for(let i=0;i<18;i++){let x=(rng()<.5?-1:1)*(8+rng()*20),z=-30+rng()*57;if(Math.hypot(x,z-23)<8)continue;const t=makeTree(loc.leaf,.55+rng()*.58);t.position.set(x,0,z);world.add(t);if(Math.abs(x)<18)collider(x,z,.75)}
  for(let i=0;i<8;i++){const r=makeRock(.5+rng()*.7);r.position.set((rng()<.5?-1:1)*(7+rng()*18),0,-25+rng()*50);world.add(r)}
  for(let i=0;i<10;i++)flowerPatch(world,(rng()<.5?-1:1)*(6+rng()*20),-27+rng()*50,i);addGardenProps(rng,n);spawnPoopField(n,rng);
  home=makeBase();home.position.set(0,0,27);home.scale.setScalar(.88);world.add(home);
  player.position.set(0,0,18);helper.position.set(2,4.4,16);mouseCompanion.position.set(1.05,1.62,18.15);mouseCompanion.userData.fetch=null;mouseCompanion.userData.mode='ride';
  state.level=n;cameraYaw=-.58;cameraYawVelocity=0;moveInput.x=moveInput.y=0;aimInput.active=false;aimFacing.set(0,0,-1);spawnCatSquad();state.kills=0;state.spawned=0;state.targetKills=14+Math.floor(n*1.65);state.spawnTimer=.12;state.home=5;state.lives=5;state.bombs=3;state.combo=1;state.comboTimer=0;state.fireCooldown=0;state.invuln=0;state.valerian=0;state.poopSlow=0;state.playing=true;for(let i=0;i<Math.min(4,state.targetKills);i++)spawnDog();state.spawnTimer=.28;if(n%4===0){spawnValerian(new THREE.Vector3(-3,0,12));spawnValerian(new THREE.Vector3(4,0,5))}updateUI();sfx.wave();showToast('ВОЛНА '+n+' · '+layoutName)
}

function makeCharacters(){player=makeCatTank();player.scale.setScalar(1.16);scene.add(player);helper=makeBird();helper.scale.setScalar(.82);scene.add(helper);mouseCompanion=makeMouse();mouseCompanion.scale.setScalar(1.58);scene.add(mouseCompanion)}makeCharacters();
function updateUI(){ui.level.textContent=state.level+' / 30';ui.home.textContent='❤'.repeat(Math.max(0,state.home));ui.lives.textContent='❤'.repeat(Math.max(0,state.lives));ui.enemies.textContent=Math.max(0,state.targetKills-state.kills);ui.score.textContent=state.score;ui.combo.textContent='×'+state.combo;ui.bombs.textContent=state.bombs;ui.boost.textContent=state.valerian>0?'🌿 '+state.valerian.toFixed(1)+'с':state.poopSlow>0?'💩 ТОРМОЗ':'—'}
function showToast(t){toast.textContent=t;toast.style.opacity='1';clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.style.opacity='0',1450)}
function pulseFlash(){flash.style.background='rgba(255,214,115,.28)';setTimeout(()=>flash.style.background='rgba(255,255,255,0)',90)}
function blocked(x,z){if(Math.abs(x)>24||z<-31||z>30)return true;for(const o of obstacles)if(Math.hypot(x-o.x,z-o.z)<o.r+1.15)return true;return false}
function nearestEnemy(from,max=999){let best=null,d=max;for(const e of enemies){const q=from.distanceTo(e.position);if(q<d){d=q;best=e}}return best}
function spawnDog(){const type=Math.min(3,Math.floor((state.level-1)/7)+(Math.random()<.25?1:0)),d=makeDog(type),side=Math.random();if(side<.68)d.position.set(rand(-18,18),0,-23);else d.position.set(side<.84?-22:22,0,rand(-20,4));d.userData.hp+=Math.floor(state.level/10);scene.add(d);enemies.push(d);state.spawned++;if((state.spawned%3===0||Math.random()<.22)&&raccoons.length<4)spawnRaccoon(d)}
function burst(pos,color=0xffaa55,count=12){for(let i=0;i<count;i++){const m=mesh(new THREE.SphereGeometry(.07+Math.random()*.10,7,5),new THREE.MeshBasicMaterial({color}),pos.x,pos.y+1.1,pos.z);scene.add(m);particles.push({mesh:m,v:new THREE.Vector3(rand(-4.5,4.5),rand(2,7.5),rand(-4.5,4.5)),life:.4+Math.random()*.55})}}
function damageEnemy(e,dmg){e.userData.hp-=dmg;e.scale.setScalar(.88);setTimeout(()=>{if(e.parent)e.scale.setScalar(1)},55);if(e.userData.hp<=0){state.combo=state.comboTimer>0?Math.min(8,state.combo+1):1;state.comboTimer=2.7;state.score+=(18+e.userData.type*12)*state.combo;state.kills++;const deathPos=e.position.clone();burst(e.position,e.userData.type>=2?0xff6548:0xffb85b,16);sfx.hit();scene.remove(e);enemies.splice(enemies.indexOf(e),1);const roll=Math.random();if(roll<.20)spawnValerian(deathPos);else if(roll<.28)spawnYarnPickup(deathPos);updateUI();if(state.kills>=state.targetKills)winLevel()}}
function damageRaccoon(r,dmg){r.userData.hp-=dmg;r.scale.setScalar(.9);setTimeout(()=>{if(r.parent)r.scale.setScalar(1)},55);if(r.userData.hp<=0){burst(r.position,0x6e7278,14);sfx.hit();scene.remove(r);raccoons.splice(raccoons.indexOf(r),1);state.score+=35;updateUI()}}
function fireSausage(){
  if(!state.playing||state.fireCooldown>0)return;
  const berserk=state.valerian>0 ? .52 : 1;state.fireCooldown=.12*tune.fire*berserk;
  let dir=aimFacing.clone();
  if(!aimInput.active){const target=nearestEnemy(player.position,22);if(target){dir.copy(target.position).sub(player.position).setY(0).normalize();aimFacing.copy(dir)}}
  if(dir.lengthSq()<.01)dir.copy(playerFacing);dir.normalize();
  const g=new THREE.Group();const body=cyl(g,.13,.13,.72,std(0xd54f2d,.45),0,0,0,0,Math.PI/2);body.rotation.z=Math.PI/2;sph(g,.14,M.glow,0,0,-.42,[1,1,1],10);g.position.copy(player.position).add(new THREE.Vector3(0,1.55,0)).add(dir.clone().multiplyScalar(1.9));g.rotation.y=Math.atan2(dir.x,dir.z);scene.add(g);shots.push({mesh:g,v:dir.multiplyScalar(state.valerian>0?23:19),life:1.8,damage:tune.damage});
  burst(g.position,0xffc15a,5);shake=Math.max(shake,.16);sfx.shoot()
}
function bomb(){if(!state.playing||state.bombs<=0)return;state.bombs--;updateUI();pulseFlash();shake=1.1;sfx.bomb();burst(player.position,0xff7646,36);const radius=9.5*tune.bombRadius;for(const e of [...enemies])if(e.position.distanceTo(player.position)<radius)damageEnemy(e,5);for(const r of [...raccoons])if(r.position.distanceTo(player.position)<radius)damageRaccoon(r,5)}
function updateProjectiles(dt){
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.v.y-=10*dt;p.mesh.position.addScaledVector(p.v,dt);p.mesh.scale.multiplyScalar(.965);p.life-=dt;if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1)}}
  for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.mesh.position.addScaledVector(s.v,dt);s.life-=dt;if(Math.random()<.65){const tm=mesh(new THREE.SphereGeometry(.045,5,4),new THREE.MeshBasicMaterial({color:0xffc77a}),s.mesh.position.x,s.mesh.position.y,s.mesh.position.z);scene.add(tm);particles.push({mesh:tm,v:new THREE.Vector3(rand(-.3,.3),rand(.2,.8),rand(-.3,.3)),life:.18})}let hit=false;for(const e of [...enemies])if(s.mesh.position.distanceTo(e.position.clone().add(new THREE.Vector3(0,1.2,0)))<1.25){damageEnemy(e,s.damage||1);hit=true;break}if(!hit)for(const r of [...raccoons])if(s.mesh.position.distanceTo(r.position.clone().add(new THREE.Vector3(0,1.1,0)))<1.05){damageRaccoon(r,s.damage||1);hit=true;break}if(hit||s.life<0){scene.remove(s.mesh);shots.splice(i,1)}}
  for(let i=feathers.length-1;i>=0;i--){const s=feathers[i];s.mesh.position.addScaledVector(s.v,dt);s.life-=dt;let hit=false;for(const e of [...enemies])if(s.mesh.position.distanceTo(e.position.clone().add(new THREE.Vector3(0,1.1,0)))<1){damageEnemy(e,1);hit=true;break}if(!hit)for(const r of [...raccoons])if(s.mesh.position.distanceTo(r.position.clone().add(new THREE.Vector3(0,1.0,0)))<.9){damageRaccoon(r,1);hit=true;break}if(hit||s.life<0){scene.remove(s.mesh);feathers.splice(i,1)}}
  for(let i=boneShots.length-1;i>=0;i--){const s=boneShots[i];s.mesh.position.addScaledVector(s.v,dt);s.mesh.rotation.x+=s.spin*dt;s.mesh.rotation.z+=s.spin*.7*dt;s.life-=dt;let hit=false;
    if(s.mesh.position.distanceTo(player.position.clone().add(new THREE.Vector3(0,1.15,0)))<1.25&&state.invuln<=0){state.lives--;state.invuln=1.15;updateUI();pulseFlash();shake=.48;burst(player.position,0xf7e6bd,12);hit=true;if(state.lives<=0)lose('Кота закидали костями')}
    if(!hit){for(const a of [...allies]){if(s.mesh.position.distanceTo(a.position.clone().add(new THREE.Vector3(0,1.0,0)))<.9){a.userData.hp--;burst(a.position,0xf7e6bd,8);hit=true;if(a.userData.hp<=0){scene.remove(a);allies.splice(allies.indexOf(a),1)}break}}}
    if(!hit&&s.mesh.position.distanceTo(home.position.clone().add(new THREE.Vector3(0,1.5,0)))<2.8){state.home--;updateUI();pulseFlash();burst(home.position,0xf7e6bd,10);hit=true;if(state.home<=0)lose('База разбита костями')}
    if(hit||s.life<0){scene.remove(s.mesh);boneShots.splice(i,1)}
  }
  for(let i=mousePoops.length-1;i>=0;i--){const s=mousePoops[i];s.mesh.position.addScaledVector(s.v,dt);s.mesh.rotation.x+=s.spin*dt;s.mesh.rotation.z+=s.spin*.8*dt;s.life-=dt;let hit=false;
    for(const e of [...enemies])if(s.mesh.position.distanceTo(e.position.clone().add(new THREE.Vector3(0,.9,0)))<1.0){damageEnemy(e,1);burst(e.position,0x6a3c1f,8);hit=true;break}
    if(!hit)for(const r of [...raccoons])if(s.mesh.position.distanceTo(r.position.clone().add(new THREE.Vector3(0,.9,0)))<.9){damageRaccoon(r,1);burst(r.position,0x6a3c1f,8);hit=true;break}
    if(hit||s.life<0){scene.remove(s.mesh);mousePoops.splice(i,1)}
  }
  for(let i=enemyPoops.length-1;i>=0;i--){const s=enemyPoops[i];s.mesh.position.addScaledVector(s.v,dt);s.mesh.rotation.x+=s.spin*dt;s.life-=dt;let hit=false;
    if(s.mesh.position.distanceTo(player.position.clone().add(new THREE.Vector3(0,1.0,0)))<1.1&&state.invuln<=0){state.lives--;state.invuln=1.0;state.poopSlow=2.1;sfx.poop();burst(player.position,0x5a351f,12);hit=true;updateUI();if(state.lives<=0)lose('Еноты закидали лоток мусором')}
    if(!hit){for(const a of [...allies])if(s.mesh.position.distanceTo(a.position.clone().add(new THREE.Vector3(0,.9,0)))<.85){a.userData.hp--;hit=true;if(a.userData.hp<=0){scene.remove(a);allies.splice(allies.indexOf(a),1)}break}}
    if(hit||s.life<0){scene.remove(s.mesh);enemyPoops.splice(i,1)}
  }
}
function fireFeather(target){const dir=target.position.clone().sub(helper.position).normalize(),m=mesh(new THREE.ConeGeometry(.11,.72,5),std(0x273846,.55,.12));m.rotation.x=Math.PI/2;m.position.copy(helper.position);scene.add(m);feathers.push({mesh:m,v:dir.multiplyScalar(15),life:2})}
function updateHelper(dt,now){const anchor=player.position.clone();anchor.x+=Math.cos(now*1.55)*3.6;anchor.z+=Math.sin(now*1.55)*2.4;anchor.y=4.3+Math.sin(now*4.2)*.4;helper.position.lerp(anchor,Math.min(1,dt*5));helper.rotation.y=Math.sin(now*.8)*.22;const w=helper.userData;if(w.leftWing){w.leftWing.rotation.z=.35+Math.sin(now*10)*.42;w.rightWing.rotation.z=-.35-Math.sin(now*10)*.42}helperCooldown-=dt;const target=nearestEnemy(helper.position,20);if(target&&helperCooldown<=0){fireFeather(target);helperCooldown=.78}}
function chooseDogTarget(e){
  let best=player,bestScore=e.position.distanceTo(player.position);
  for(const a of allies){const d=e.position.distanceTo(a.position)*.92;if(d<bestScore){best=a;bestScore=d}}
  const homeScore=e.position.distanceTo(home.position)*1.12;
  if(homeScore<bestScore)best=home;
  return best
}
function dogSteer(e,target,now){
  const u=e.userData,pos=e.position,to=target.position.clone().sub(pos).setY(0),dist=Math.max(.001,to.length()),forward=to.clone().divideScalar(dist);
  const side=new THREE.Vector3(-forward.z,0,forward.x).multiplyScalar(u.flankSign);
  const desired=new THREE.Vector3();
  if(dist>u.preferredRange+1.6)desired.add(forward);
  else if(dist<u.preferredRange-1.5)desired.addScaledVector(forward,-.42);
  desired.addScaledVector(side,.52+Math.sin(now*2.4+u.dodgeSeed)*.18);
  const separation=new THREE.Vector3();
  for(const other of enemies){if(other===e)continue;const off=pos.clone().sub(other.position);const d=off.length();if(d>0&&d<3.4)separation.add(off.multiplyScalar((3.4-d)/(d*3.4)))}
  desired.addScaledVector(separation,1.35);
  const avoid=new THREE.Vector3();
  for(const o of obstacles){const off=pos.clone().sub(new THREE.Vector3(o.x,0,o.z));const d=off.length(),limit=o.r+2.2;if(d>0&&d<limit)avoid.add(off.multiplyScalar((limit-d)/(d*limit)))}
  desired.addScaledVector(avoid,1.8);
  for(const s of shots){const off=pos.clone().sub(s.mesh.position).setY(0),d=off.length();if(d<5.0&&d>.01){const sv=s.v.clone().setY(0).normalize(),cross=sv.x*off.z-sv.z*off.x;desired.addScaledVector(new THREE.Vector3(-sv.z,0,sv.x),cross>0?1.2:-1.2)}}
  if(desired.lengthSq()<.01)desired.copy(forward);
  return desired.normalize()
}
function updateEnemies(dt,now){for(const e of [...enemies]){
  const u=e.userData;
  u.thinkTimer-=dt;
  if(u.thinkTimer<=0||!u.target||!u.target.parent){u.target=chooseDogTarget(e);u.thinkTimer=.22+Math.random()*.28}
  const target=u.target||player,dist=e.position.distanceTo(target.position);
  u.fireCooldown-=dt;
  const steer=dogSteer(e,target,now);
  const wantsShoot=dist<u.preferredRange+4.0;
  if(wantsShoot&&u.fireCooldown<=0){fireBone(e,target===home?home:target);u.fireCooldown=Math.max(.42,.82-state.level*.008)+Math.random()*.34}
  const rush=dist>15?1.28:1;
  const moveScale=(wantsShoot?.72:1)*u.speed*rush*dt;
  let step=steer.clone().multiplyScalar(moveScale),nx=e.position.x+step.x,nz=e.position.z+step.z;
  if(blocked(nx,nz)){
    u.flankSign*=-1;
    const alt=new THREE.Vector3(-steer.z,0,steer.x).multiplyScalar(u.flankSign*u.speed*dt*1.15);
    nx=e.position.x+alt.x;nz=e.position.z+alt.z;
  }
  if(!blocked(nx,e.position.z))e.position.x=nx;
  if(!blocked(e.position.x,nz))e.position.z=nz;
  const face=target.position.clone().sub(e.position).setY(0);
  if(face.lengthSq()>.001){face.normalize();e.rotation.y=Math.atan2(face.x,face.z)+Math.PI}
  if(u.legs)for(let i=0;i<u.legs.length;i++)u.legs[i].rotation.x=Math.sin(now*16+i*Math.PI)*.68;
  const distPlayer=e.position.distanceTo(player.position);
  if(distPlayer<2.0&&state.invuln<=0){state.lives--;state.invuln=1.3;updateUI();pulseFlash();shake=.65;burst(player.position,0xffd36d,18);player.position.set(0,0,18);scene.remove(e);enemies.splice(enemies.indexOf(e),1);if(state.lives<=0)lose('Кота победили')}
}}
function applyPickup(p){
  if(p.type==='valerian'){state.valerian=6*tune.valerian;state.lives=Math.min(5,state.lives+1);sfx.valerian();showToast('🌿 ВАЛЕРЬЯНКА! КОТОБЕРСЕРК')}
  else if(p.type==='yarn'){launchYarn()}
  scene.remove(p.mesh);const idx=pickups.indexOf(p);if(idx>=0)pickups.splice(idx,1);updateUI()
}
function updateMouse(dt,now){
  if(!mouseCompanion)return;
  const u=mouseCompanion.userData;
  let best=null,bestD=11;
  for(const p of pickups){const d=player.position.distanceTo(p.mesh.position);if(d<bestD){best=p;bestD=d}}
  if(best&&!u.fetch){u.fetch=best;u.mode='fetch'}else if(u.fetch&&!pickups.includes(u.fetch)){u.fetch=null;u.mode='return'}
  let moving=false;
  if(u.mode==='fetch'&&u.fetch){
    const d=u.fetch.mesh.position.clone().sub(mouseCompanion.position);d.y=0;
    if(d.length()<.65){applyPickup(u.fetch);u.fetch=null;u.mode='return';sfx.pickup()}
    else{d.normalize();const speed=10.2;mouseCompanion.position.addScaledVector(d,dt*speed);mouseCompanion.position.y+=(.18-mouseCompanion.position.y)*Math.min(1,dt*10);mouseCompanion.rotation.y+=normalizeAngle(Math.atan2(d.x,d.z)-mouseCompanion.rotation.y)*Math.min(1,dt*13);moving=true}
  }else{
    const rideLocal=new THREE.Vector3(1.48,2.22,-.05).applyAxisAngle(new THREE.Vector3(0,1,0),player.rotation.y),ride=player.position.clone().add(rideLocal);
    const d=ride.clone().sub(mouseCompanion.position);
    mouseCompanion.position.lerp(ride,1-Math.exp(-dt*11));
    mouseCompanion.rotation.y+=normalizeAngle((player.rotation.y+2.56)-mouseCompanion.rotation.y)*Math.min(1,dt*8);
    if(d.length()<.24)u.mode='ride';moving=d.length()>.12
  }
  const hop=moving?Math.abs(Math.sin(now*15+u.phase))*.10:Math.sin(now*5+u.phase)*.025;
  mouseCompanion.position.y+=hop;
  if(u.head){u.head.rotation.y=Math.sin(now*2.6+u.phase)*.24;u.head.rotation.z=Math.sin(now*4.3+u.phase)*.035}
  u.fireCooldown-=dt;const target=nearestEnemy(mouseCompanion.position,18);
  if(target&&u.fireCooldown<=0&&u.mode!=='fetch'){fireMousePoop(target);u.fireCooldown=.48+Math.random()*.35}
}
function updateRaccoons(dt,now){
  for(const r of [...raccoons]){
    const u=r.userData,escort=u.escort&&u.escort.parent?u.escort:nearestEnemy(r.position,999);
    u.escort=escort;const target=player;
    const anchor=escort?escort.position.clone().add(new THREE.Vector3(Math.sin(u.phase)*2.2,0,2.0)):target.position.clone();
    const d=anchor.sub(r.position);d.y=0;if(d.length()>.8){d.normalize();const nx=r.position.x+d.x*u.speed*dt,nz=r.position.z+d.z*u.speed*dt;if(!blocked(nx,r.position.z))r.position.x=nx;if(!blocked(r.position.x,nz))r.position.z=nz;r.rotation.y=Math.atan2(d.x,d.z)+Math.PI}
    u.fireCooldown-=dt;if(r.position.distanceTo(target.position)<16&&u.fireCooldown<=0){fireRaccoonPoop(r,target);u.fireCooldown=.75+Math.random()*.55}
    r.position.y=.02+Math.abs(Math.sin(now*10+u.phase))*.05
  }
}

function litterDust(now){
  player.userData.dustTimer=(player.userData.dustTimer||0)-.016;if(player.userData.dustTimer>0)return;player.userData.dustTimer=.075;
  const back=new THREE.Vector3(-playerFacing.x,0,-playerFacing.z).multiplyScalar(1.8).add(player.position);
  for(let i=0;i<3;i++){const m=mesh(new THREE.SphereGeometry(.07+Math.random()*.08,6,4),new THREE.MeshBasicMaterial({color:i%2?0xd5bd8e:0xb99866,transparent:true,opacity:.8}),back.x+rand(-.9,.9),.28,back.z+rand(-.7,.7));m.castShadow=false;scene.add(m);particles.push({mesh:m,v:new THREE.Vector3(rand(-.8,.8),rand(.7,1.8),rand(-.8,.8)),life:.25+Math.random()*.2})}
}
function updatePlayer(dt,now){
  const prevX=player.position.x,prevZ=player.position.z;
  let x=moveInput.active?moveInput.x:0,z=moveInput.active?moveInput.y:0;
  if(keys.has('left'))x-=1;if(keys.has('right'))x+=1;if(keys.has('up'))z-=1;if(keys.has('down'))z+=1;
  const mag=Math.min(1,Math.hypot(x,z));
  if(mag>.06){
    const l=Math.hypot(x,z);x/=l;z/=l;const cs=Math.cos(cameraYaw),sn=Math.sin(cameraYaw),wx=x*cs+z*sn,wz=-x*sn+z*cs;playerFacing.set(wx,0,wz);
    const desiredYaw=Math.atan2(wx,wz);player.rotation.y+=normalizeAngle(desiredYaw-player.rotation.y)*Math.min(1,dt*10);
    const boost=(state.valerian>0?1.38:1)*(state.poopSlow>0?.58:1),speed=8.7*tune.speed*boost*mag,targetV=new THREE.Vector3(wx*speed,0,wz*speed);
    const vel=player.userData.velocity||(player.userData.velocity=new THREE.Vector3());vel.lerp(targetV,1-Math.exp(-dt*8.5));
    const nx=player.position.x+vel.x*dt,nz=player.position.z+vel.z*dt;if(!blocked(nx,player.position.z))player.position.x=nx;else vel.x*=.2;if(!blocked(player.position.x,nz))player.position.z=nz;else vel.z*=.2;litterDust(now)
  }else{const vel=player.userData.velocity||(player.userData.velocity=new THREE.Vector3());vel.multiplyScalar(Math.exp(-dt*10));if(vel.lengthSq()>.002){const nx=player.position.x+vel.x*dt,nz=player.position.z+vel.z*dt;if(!blocked(nx,player.position.z))player.position.x=nx;if(!blocked(player.position.x,nz))player.position.z=nz}player.rotation.z=Math.sin(now*2.5)*.012}
  const travelled=Math.hypot(player.position.x-prevX,player.position.z-prevZ),spin=travelled/.47;
  for(const w of player.userData.tracks||[])w.userData.spin=(w.userData.spin||0)+spin*2.15;
  const lean=mag>.06?clamp(normalizeAngle(Math.atan2(playerFacing.x,playerFacing.z)-player.rotation.y),-.25,.25):0;
  if(player.userData.impostor)player.userData.impostor.rotation.z+=(lean*.10-player.userData.impostor.rotation.z)*Math.min(1,dt*7);
  player.position.y=.06+Math.sin(now*(mag>.06?8:4))*(mag>.06?.035:.018)
}
const upgrades=[
  {name:'⚡ ТУРБО-ГУСЕНИЦЫ',desc:'+12% скорость',apply(){tune.speed*=1.12}},
  {name:'🌭 СОСИСКОМЁТ',desc:'+16% темп огня',apply(){tune.fire*=.84}},
  {name:'💥 ЖИРНАЯ СОСИСКА',desc:'+1 урон',apply(){tune.damage=Math.min(4,tune.damage+1)}},
  {name:'🌿 ВАЛЕРЬЯНКА XL',desc:'+30% длительность',apply(){tune.valerian*=1.30}},
  {name:'💣 БОМБА-БОЧКА',desc:'+18% радиус, +1 бомба',apply(){tune.bombRadius*=1.18;state.bombs++}}
];
function resetTune(){tune.speed=tune.fire=tune.damage=tune.valerian=tune.bombRadius=1}
function showTuning(nextLevel){
  state.playing=false;overlay.style.display='flex';overlay.querySelector('h1').textContent='🔧 ТЮНИНГ';$('subtitle').textContent='Выбери одну дурную модернизацию перед следующей волной.';startBtn.style.display='none';
  const host=$('upgrades');host.innerHTML='';
  const pool=[...upgrades].sort(()=>Math.random()-.5).slice(0,3);
  for(const u of pool){const b=document.createElement('button');b.innerHTML='<b>'+u.name+'</b><br><small>'+u.desc+'</small>';b.onclick=()=>{initAudio();u.apply();sfx.pickup();host.innerHTML='';startBtn.style.display='block';overlay.style.display='none';buildLevel(nextLevel)};host.appendChild(b)}
}

function winLevel(){state.playing=false;state.score+=state.level*120;updateUI();if(state.level>=30){showOverlay('ПОБЕДА!','Кототанк и Галчонок отбили все 30 волн. Крепость спасена.','ИГРАТЬ СНАЧАЛА',()=>{state.score=0;resetTune();buildLevel(1);overlay.style.display='none'});return}showTuning(state.level+1)}
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

function clearMovement(){keys.delete('up');keys.delete('down');keys.delete('left');keys.delete('right');moveInput.x=moveInput.y=0;moveInput.active=false}
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
window.addEventListener('blur',clearMovement);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearMovement()});
for(const evt of ['contextmenu','selectstart','dragstart'])document.addEventListener(evt,e=>{if(e.target.closest('#controls'))e.preventDefault()});
document.addEventListener('keydown',e=>{const m={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};if(m[e.code])keys.add(m[e.code]);if(e.code==='Space')fireSausage();if(e.code==='KeyB')bomb()});
document.addEventListener('keyup',e=>{const m={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};if(m[e.code])keys.delete(m[e.code])});
$('bomb').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();initAudio();bomb()});
startBtn.onclick=()=>{initAudio();resetTune();state.score=0;buildLevel(1);overlay.style.display='none'};
function animate(ms){requestAnimationFrame(animate);const now=ms*.001,dt=Math.min(.055,state.last?now-state.last:.016);state.last=now;
  if(state.playing){
    state.fireCooldown=Math.max(0,state.fireCooldown-dt);state.invuln=Math.max(0,state.invuln-dt);state.comboTimer=Math.max(0,state.comboTimer-dt);state.valerian=Math.max(0,state.valerian-dt);state.poopSlow=Math.max(0,state.poopSlow-dt);
    if(state.comboTimer===0&&state.combo!==1){state.combo=1;updateUI()}
    player.visible=state.invuln<=0||Math.floor(now*12)%2===0;
    updatePlayer(dt,now);updateAim(dt);if(aimInput.active&&Math.hypot(aimInput.x,aimInput.y)>.24)fireSausage();
    updateHelper(dt,now);updateMouse(dt,now);updateAllies(dt,now);updateRaccoons(dt,now);updateProjectiles(dt);updateEnemies(dt,now);updateChaosItems(dt,now);updateUI();
    state.spawnTimer-=dt;if(state.spawned<state.targetKills&&state.spawnTimer<=0&&enemies.length<10){const batch=(state.spawned+1<state.targetKills&&enemies.length<8&&Math.random()<.45)?2:1;for(let i=0;i<batch;i++)spawnDog();state.spawnTimer=Math.max(.20,.56-state.level*.006)}
  }
  if(!cameraDrag.active&&Math.abs(cameraYawVelocity)>.0001){cameraYaw+=cameraYawVelocity*dt;cameraYawVelocity*=Math.pow(.035,dt)}
  const radius=16.8,focus=new THREE.Vector3(player.position.x,1.65,player.position.z),desired=new THREE.Vector3(focus.x+Math.sin(cameraYaw)*radius,9.25,focus.z+Math.cos(cameraYaw)*radius);camera.position.lerp(desired,.11);camera.lookAt(focus);
  if(shake>0){camera.position.x+=rand(-shake,shake)*.14;camera.position.y+=rand(-shake,shake)*.10;shake=Math.max(0,shake-dt*4.3)}
  updateHeroImpostor(dt,now);updateHeroWheels(dt);
  renderer.render(scene,camera)
}
requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.4))});
window.__kototanki3d={get ready(){return true},get state(){return {...state}},get player(){return {x:player.position.x,z:player.position.z,aimX:aimFacing.x,aimZ:aimFacing.z,turret:player.userData.turret?.rotation.y||0,head:player.userData.head?.rotation.y||0}},get helper(){return {x:helper.position.x,y:helper.position.y,z:helper.position.z}},get allies(){return allies.map(a=>({x:a.position.x,z:a.position.z,fireCooldown:a.userData.fireCooldown}))},get dogs(){return enemies.map(e=>({x:e.position.x,z:e.position.z,type:e.userData.type,modelStyle:e.userData.modelStyle||null,speed:e.userData.speed,fireCooldown:e.userData.fireCooldown,rotation:e.rotation.y,forwardX:-Math.sin(e.rotation.y),forwardZ:-Math.cos(e.rotation.y),target:e.userData.target===player?'player':e.userData.target===home?'home':e.userData.target?'ally':null,targetX:e.userData.target?.position.x??null,targetZ:e.userData.target?.position.z??null}))},get action(){return {activeDogs:enemies.length,raccoons:raccoons.length,targetKills:state.targetKills,spawnTimer:state.spawnTimer,bones:boneShots.length,mousePoops:mousePoops.length,enemyPoops:enemyPoops.length,shots:shots.length,pickups:pickups.length,hazards:hazards.length,yarns:yarnBalls.length}},get mouse(){return mouseCompanion?{x:mouseCompanion.position.x,y:mouseCompanion.position.y,z:mouseCompanion.position.z,mode:mouseCompanion.userData.mode,fetching:!!mouseCompanion.userData.fetch,modelStyle:mouseCompanion.userData.modelStyle||null}:null},get vehicle(){return {kind:player.userData.kind,wheels:player.userData.wheels?.length||0,modelStyle:player.userData.modelStyle||null,revision:'motion-mouse-r6',wheelCount:player.userData.tracks?.length||0,wheelSpin:player.userData.tracks?.[0]?.userData?.spin||0,catYaw:player.userData.catYaw||0}},get bones(){return boneShots.map(b=>({x:b.mesh.position.x,y:b.mesh.position.y,z:b.mesh.position.z}))},get controls(){return [...keys]},get sticks(){return {move:{...moveInput},aim:{...aimInput}}},get tuning(){return {...tune}},get camera(){return {yaw:cameraYaw,x:camera.position.x,y:camera.position.y,z:camera.position.z}},rotateCamera(delta){cameraYaw+=delta},setCameraYaw(value){cameraYaw=value;cameraYawVelocity=0},setMove(x,y){moveInput.x=x;moveInput.y=y;moveInput.active=Math.hypot(x,y)>.01},setAim(x,y,active=true){aimInput.x=x;aimInput.y=y;aimInput.active=active},spawnDog(){spawnDog()},spawnRaccoon(){spawnRaccoon(enemies[0]||null)},spawnValerian(){spawnValerian(player.position.clone().add(new THREE.Vector3(1,0,0)))},spawnValerianAt(dx=5,dz=0){spawnValerian(player.position.clone().add(new THREE.Vector3(dx,0,dz)))},spawnYarn(){spawnYarnPickup(player.position.clone().add(new THREE.Vector3(1,0,0)))},launchYarn(){launchYarn()},fireDogBone(){if(!enemies.length)spawnDog();fireBone(enemies[0],player)},start(){initAudio();buildLevel(1);overlay.style.display='none'},next(){buildLevel(Math.min(30,state.level+1))},fire:fireSausage,bomb};
