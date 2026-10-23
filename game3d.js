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
  {name:'СОЛНЕЧНАЯ ЦИТАДЕЛЬ',sky:0x7fc6ff,fog:0xffe3ba,ground:0x8da04c,road:0xd2a265,roof:0xc44835,leaf:0x63933b,kind:'citadel'}
];

const state={playing:false,level:1,score:0,home:5,lives:5,kills:0,targetKills:8,spawned:0,spawnTimer:0,bombs:3,combo:1,comboTimer:0,fireCooldown:0,invuln:0,valerian:0,poopSlow:0,last:0};
const keys=new Set(), obstacles=[], enemies=[], shots=[], feathers=[], boneShots=[], particles=[], allies=[], pickups=[], hazards=[], yarnBalls=[];
let player, helper, home, ground, world, playerFacing=new THREE.Vector3(0,0,-1), aimFacing=new THREE.Vector3(0,0,-1), helperCooldown=0, shake=0, cameraYaw=0, cameraYawVelocity=0;
const cameraDrag={active:false,id:null,lastX:0};
const moveInput={x:0,y:0,active:false},aimInput={x:0,y:-1,active:false};
const tune={speed:1,fire:1,damage:1,valerian:1,bombRadius:1};

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x87cfff);
scene.fog=new THREE.Fog(0xcfeeff,40,115);
const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,250);
camera.position.set(0,13.5,22);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.32;
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
const M={
  orange:std(0xe77c32,.72),cream:std(0xffdfad,.78),white:std(0xfff7e8,.75),black:std(0x17191d,.65),eye:std(0x63c7ff,.2),pupil:std(0x10131a,.2),
  steel:std(0x555e69,.35,.72),darkSteel:std(0x303741,.42,.68),bronze:std(0xb26c32,.36,.62),tank:std(0xb9702d,.48,.48),tankDark:std(0x604122,.55,.45),red:std(0xd84435,.55),
  wood:std(0x8d5c31,.8),woodLight:std(0xb77b43,.78),stone:std(0xa69e8d,.88),plaster:std(0xffe3ad,.84),grass:std(0x70ad4f,.95),road:std(0xc9a474,.96),
  dog1:std(0x9b673f,.86),dog2:std(0x6d5140,.86),dog3:std(0x8c8b86,.86),dog4:std(0x4c403d,.88),helmet:std(0x5a6066,.52,.38),
  bird:std(0x202a34,.8),birdWing:std(0x151d25,.82),beak:std(0xf4ad22,.58),bone:std(0xf7e6bd,.72),collar:std(0x2f77bd,.48,.12),
  glow:new THREE.MeshStandardMaterial({color:0xffbd57,emissive:0xff7b1f,emissiveIntensity:4,roughness:.45})
};
function mesh(g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;return o}
function box(p,sx,sy,sz,m,x=0,y=0,z=0,ry=0){const o=mesh(new THREE.BoxGeometry(sx,sy,sz),m,x,y,z);o.rotation.y=ry;p.add(o);return o}
function sph(p,r,m,x=0,y=0,z=0,s=[1,1,1],seg=14){const o=mesh(new THREE.SphereGeometry(r,seg,Math.max(10,seg-4)),m,x,y,z);o.scale.set(...s);p.add(o);return o}
function cyl(p,rt,rb,h,m,x=0,y=0,z=0,rx=0,rz=0){const o=mesh(new THREE.CylinderGeometry(rt,rb,h,14),m,x,y,z);o.rotation.x=rx;o.rotation.z=rz;p.add(o);return o}
function cone(p,r,h,m,x=0,y=0,z=0,rx=0,rz=0){const o=mesh(new THREE.ConeGeometry(r,h,12),m,x,y,z);o.rotation.x=rx;o.rotation.z=rz;p.add(o);return o}

function makeCatTank(){
  const g=new THREE.Group();
  const chassis=new THREE.Group();g.add(chassis);
  box(chassis,3.5,.72,4.3,M.tank,0,.72,.15);box(chassis,2.9,.48,3.7,M.tankDark,0,1.14,.05);
  const tracks=[];
  for(const x of [-1.72,1.72]){
    box(chassis,.48,.82,4.35,M.darkSteel,x,.7,.18);
    for(let z=-1.55;z<=1.55;z+=.78){const w=cyl(chassis,.36,.36,.20,M.steel,x,.72,z,0,Math.PI/2);w.rotation.z=Math.PI/2;tracks.push(w)}
    for(let z=-1.8;z<=1.8;z+=.4) box(chassis,.56,.12,.25,M.black,x,.25,z);
  }
  const turret=new THREE.Group();turret.position.set(0,1.4,-.2);chassis.add(turret);
  cyl(turret,1.05,1.15,.55,M.tank,0,.15,0);const barrel=cyl(turret,.18,.26,3.5,M.steel,0,.2,-2.05,Math.PI/2,0);barrel.rotation.x=Math.PI/2;
  sph(turret,.28,M.glow,0,.2,-3.78,[1,1,1],12);

  const cat=new THREE.Group();cat.position.set(0,1.75,.2);g.add(cat);
  sph(cat,.82,M.orange,0,.65,0,[1.05,1.04,.95]);sph(cat,.65,M.cream,0,.45,-.48,[.92,.74,.7]);
  box(cat,1.18,.20,.42,M.red,0,1.12,-.1);const scarf=box(cat,.28,.18,1.25,M.red,.55,1.03,.48,.35);scarf.rotation.x=.18;
  for(const x of [-.58,.58])sph(cat,.23,M.orange,x,.72,-.75,[1.05,.8,1]);
  const tail=cyl(cat,.13,.17,2.05,M.orange,1.0,.62,.52,0,-1.02);tail.rotation.x=.4;

  const head=new THREE.Group();head.position.set(0,1.68,-.05);cat.add(head);
  sph(head,.74,M.orange,0,0,0,[1.03,.98,.96]);sph(head,.42,M.cream,0,-.13,-.53,[1,.68,.72]);
  cone(head,.34,.78,M.orange,-.43,.58,.03,0,-.1);cone(head,.34,.78,M.orange,.43,.58,.03,0,.1);
  sph(head,.16,M.eye,-.27,.10,-.66,[1,1,.55]);sph(head,.16,M.eye,.27,.10,-.66,[1,1,.55]);sph(head,.075,M.pupil,-.27,.10,-.75,[1,1,.45]);sph(head,.075,M.pupil,.27,.10,-.75,[1,1,.45]);
  sph(head,.09,M.red,0,-.20,-.87,[1,.7,.6]);
  const gog=std(0x65d4ff,.18,.18);sph(head,.23,gog,-.31,.34,-.48,[1.1,.65,.35]);sph(head,.23,gog,.31,.34,-.48,[1.1,.65,.35]);box(head,.22,.08,.08,M.darkSteel,0,.34,-.48);
  g.userData={tracks,cat,head,turret,barrel};return g;
}

function makeBird(){
  const g=new THREE.Group();sph(g,.48,M.bird,0,.35,0,[.9,1.15,.9]);sph(g,.50,M.bird,0,.92,-.08,[1,.92,1]);
  cone(g,.24,.72,M.beak,0,.86,-.62,Math.PI/2,0);sph(g,.12,M.white,-.18,1.05,-.46);sph(g,.12,M.white,.18,1.05,-.46);sph(g,.055,M.pupil,-.18,1.05,-.57);sph(g,.055,M.pupil,.18,1.05,-.57);
  const l=box(g,.78,.12,.9,M.birdWing,-.48,.42,.08,0),r=box(g,.78,.12,.9,M.birdWing,.48,.42,.08,0);l.rotation.z=.5;r.rotation.z=-.5;
  box(g,.82,.13,.22,M.red,0,.58,.05);g.userData={leftWing:l,rightWing:r};return g;
}

function makeDog(type=0){
  const g=new THREE.Group(),fur=[M.dog1,M.dog2,M.dog3,M.dog4][type%4],dark=[M.dog2,M.dog4,M.black,M.dog1][type%4];
  // Low-poly quadruped silhouette: long torso, raised chest, neck and forward muzzle.
  sph(g,.78,fur,0,1.18,.18,[1.02,.82,1.75]);
  sph(g,.62,fur,0,1.38,-1.02,[.9,1.12,.95]);
  sph(g,.58,fur,0,1.88,-1.45,[1,.94,1.03]);
  sph(g,.34,dark,0,1.72,-1.98,[.95,.62,1.12]);
  sph(g,.13,M.black,0,1.72,-2.31,[1.05,.72,.82]);
  // Eyes and brows.
  for(const x of [-.22,.22]){sph(g,.105,M.white,x,2.02,-1.86,[1,1,.65]);sph(g,.052,M.pupil,x,2.02,-1.94,[1,1,.55]);box(g,.27,.06,.08,dark,x,2.19,-1.78,x<0?-.16:.16)}
  // Ears: type 0/2 upright, type 1/3 partly floppy.
  const floppy=type%2===1;
  const le=cone(g,.28,.72,fur,-.38,2.42,-1.36,floppy?.28:0,-.18),re=cone(g,.28,.72,fur,.38,2.42,-1.36,floppy?.28:0,.18);
  if(floppy){le.rotation.z=-.55;re.rotation.z=.55}
  // Collar and tag.
  box(g,1.02,.18,.72,M.collar,0,1.52,-1.12);sph(g,.105,M.glow,0,1.36,-1.52,[1,.8,.45],8);
  // Four articulated legs with paws.
  const legs=[];
  for(const x of [-.47,.47])for(const z of [-.64,.72]){
    const upper=cyl(g,.13,.17,.72,fur,x,.68,z);upper.rotation.z=x<0?.05:-.05;legs.push(upper);
    sph(g,.18,dark,x,.24,z-.08,[1.25,.6,1.55],10);
  }
  // Curved-looking tail made from two segments.
  const tail1=cyl(g,.10,.15,.88,fur,.0,1.34,1.58,.55,-.92);tail1.rotation.z=.08;
  const tail2=cyl(g,.075,.10,.72,fur,.0,1.72,2.03,.72,-.52);tail2.rotation.z=.08;
  // Small shoulder harness, still clearly an animal rather than a humanoid.
  box(g,1.28,.15,.72,M.red,0,1.55,-.05);
  g.userData={hp:1+Math.floor(type/2),speed:4.35+type*.42,type,legs,fireCooldown:rand(.25,.75),preferredRange:7.2+type*.45,flankSign:Math.random()<.5?-1:1,thinkTimer:rand(0,.35),target:null,dodgeSeed:rand(0,6.28)};
  g.scale.setScalar(type===3?1.08:1);
  return g;
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
  const count=Math.min(8,5+Math.floor((state.level-1)/6));
  for(let i=0;i<count;i++){const a=makeAllyCat(i);const row=Math.floor(i/3),col=i%3;a.position.set((col-1)*2.3+(row%2?1.1:0),0,20+row*2.4);scene.add(a);allies.push(a)}
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
function clearWorld(){if(world){scene.remove(world);world.traverse(o=>{if(o.geometry)o.geometry.dispose()})}obstacles.length=0;enemies.splice(0).forEach(e=>scene.remove(e));shots.splice(0).forEach(e=>scene.remove(e.mesh));feathers.splice(0).forEach(e=>scene.remove(e.mesh));boneShots.splice(0).forEach(e=>scene.remove(e.mesh));particles.splice(0).forEach(e=>scene.remove(e.mesh));allies.splice(0).forEach(a=>scene.remove(a));pickups.splice(0).forEach(p=>scene.remove(p.mesh));hazards.splice(0).forEach(h=>scene.remove(h.mesh));yarnBalls.splice(0).forEach(y=>scene.remove(y.mesh));world=new THREE.Group();scene.add(world)}
function collider(x,z,r){obstacles.push({x,z,r})}
function addVillageSet(loc,rng){
  for(const side of [-1,1])for(let i=0;i<2;i++){
    const h=makeHouse([loc.roof,0xc44e3e,0x3b7baa][(i+(side>0?1:0))%3],.64+rng()*.12);h.position.set(side*(18+rng()*3),0,-14+i*20+rng()*2);h.rotation.y=side>0?-.18:.18;world.add(h);collider(h.position.x,h.position.z,2.4)
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
  for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.life-=dt;p.mesh.rotation.y+=dt*1.8;p.mesh.position.y=.14+Math.sin(now*4+p.bob)*.12;if(player.position.distanceTo(p.mesh.position)<1.45){if(p.type==='valerian'){state.valerian=6*tune.valerian;state.lives=Math.min(5,state.lives+1);sfx.valerian();showToast('🌿 ВАЛЕРЬЯНКА! КОТОБЕРСЕРК')}else if(p.type==='yarn'){launchYarn()}scene.remove(p.mesh);pickups.splice(i,1);updateUI();continue}if(p.life<=0){scene.remove(p.mesh);pickups.splice(i,1)}}
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
  if(player.userData.head){const headTarget=clamp(local,-1.2,1.2);player.userData.head.rotation.y+=(headTarget-player.userData.head.rotation.y)*Math.min(1,dt*9);player.userData.head.rotation.x=Math.sin(performance.now()*.006)*.035+(aimInput.active?-.035:0)}
}

function buildLevel(n){
  clearWorld();const loc=locations[Math.floor((n-1)/5)],rng=seedRng(1207+n*9137);scene.background.setHex(loc.sky);scene.fog.color.setHex(loc.fog);
  hemi.color.setHex(0xe9f9ff);hemi.groundColor.setHex(loc.ground);sun.color.setHex(0xfff0c2);
  ground=mesh(new THREE.PlaneGeometry(70,82),std(loc.ground,.98),0,0,0);ground.rotation.x=-Math.PI/2;world.add(ground);
  const road=mesh(new THREE.PlaneGeometry(10,78),std(loc.road,.96),0,.025,-1);road.rotation.x=-Math.PI/2;world.add(road);
  const castle=makeCastle();castle.position.set(0,0,-43);castle.scale.setScalar(.8);world.add(castle);
  for(const x of [-25,25]){const hill=mesh(new THREE.SphereGeometry(13,20,12),std(0x75a760,.98),x,-4,-46);hill.scale.set(1.5,.42,1.1);hill.castShadow=false;world.add(hill)}
  addVillageSet(loc,rng);const layoutName=addLevelLayout(n,loc,rng);ui.place.textContent=loc.name+' · '+layoutName;
  for(let i=0;i<18;i++){let x=(rng()<.5?-1:1)*(8+rng()*20),z=-30+rng()*57;if(Math.hypot(x,z-23)<8)continue;const t=makeTree(loc.leaf,.55+rng()*.58);t.position.set(x,0,z);world.add(t);if(Math.abs(x)<18)collider(x,z,.75)}
  for(let i=0;i<8;i++){const r=makeRock(.5+rng()*.7);r.position.set((rng()<.5?-1:1)*(7+rng()*18),0,-25+rng()*50);world.add(r)}
  for(let i=0;i<10;i++)flowerPatch(world,(rng()<.5?-1:1)*(6+rng()*20),-27+rng()*50,i);spawnPoopField(n,rng);
  home=makeBase();home.position.set(0,0,27);home.scale.setScalar(.88);world.add(home);
  player.position.set(0,0,18);helper.position.set(2,4.4,16);
  state.level=n;cameraYaw=0;cameraYawVelocity=0;moveInput.x=moveInput.y=0;aimInput.active=false;aimFacing.set(0,0,-1);spawnCatSquad();state.kills=0;state.spawned=0;state.targetKills=14+Math.floor(n*1.65);state.spawnTimer=.12;state.home=5;state.lives=5;state.bombs=3;state.combo=1;state.comboTimer=0;state.fireCooldown=0;state.invuln=0;state.valerian=0;state.poopSlow=0;state.playing=true;for(let i=0;i<Math.min(4,state.targetKills);i++)spawnDog();state.spawnTimer=.28;if(n%4===0){spawnValerian(new THREE.Vector3(-3,0,12));spawnValerian(new THREE.Vector3(4,0,5))}updateUI();sfx.wave();showToast(loc.name+' · '+layoutName+' · ВОЛНА '+n)
}

function makeCharacters(){player=makeCatTank();player.scale.setScalar(.82);scene.add(player);helper=makeBird();helper.scale.setScalar(.82);scene.add(helper)}makeCharacters();
function updateUI(){ui.level.textContent=state.level+' / 30';ui.home.textContent='❤'.repeat(Math.max(0,state.home));ui.lives.textContent='❤'.repeat(Math.max(0,state.lives));ui.enemies.textContent=Math.max(0,state.targetKills-state.kills);ui.score.textContent=state.score;ui.combo.textContent='×'+state.combo;ui.bombs.textContent=state.bombs;ui.boost.textContent=state.valerian>0?'🌿 '+state.valerian.toFixed(1)+'с':state.poopSlow>0?'💩 ТОРМОЗ':'—'}
function showToast(t){toast.textContent=t;toast.style.opacity='1';clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.style.opacity='0',1450)}
function pulseFlash(){flash.style.background='rgba(255,214,115,.28)';setTimeout(()=>flash.style.background='rgba(255,255,255,0)',90)}
function blocked(x,z){if(Math.abs(x)>24||z<-31||z>30)return true;for(const o of obstacles)if(Math.hypot(x-o.x,z-o.z)<o.r+1.15)return true;return false}
function nearestEnemy(from,max=999){let best=null,d=max;for(const e of enemies){const q=from.distanceTo(e.position);if(q<d){d=q;best=e}}return best}
function spawnDog(){const type=Math.min(3,Math.floor((state.level-1)/7)+(Math.random()<.25?1:0)),d=makeDog(type),side=Math.random();if(side<.68)d.position.set(rand(-18,18),0,-30);else d.position.set(side<.84?-23:23,0,rand(-26,-3));d.userData.hp+=Math.floor(state.level/10);scene.add(d);enemies.push(d);state.spawned++}
function burst(pos,color=0xffaa55,count=12){for(let i=0;i<count;i++){const m=mesh(new THREE.SphereGeometry(.07+Math.random()*.10,7,5),new THREE.MeshBasicMaterial({color}),pos.x,pos.y+1.1,pos.z);scene.add(m);particles.push({mesh:m,v:new THREE.Vector3(rand(-4.5,4.5),rand(2,7.5),rand(-4.5,4.5)),life:.4+Math.random()*.55})}}
function damageEnemy(e,dmg){e.userData.hp-=dmg;e.scale.setScalar(.88);setTimeout(()=>{if(e.parent)e.scale.setScalar(1)},55);if(e.userData.hp<=0){state.combo=state.comboTimer>0?Math.min(8,state.combo+1):1;state.comboTimer=2.7;state.score+=(18+e.userData.type*12)*state.combo;state.kills++;const deathPos=e.position.clone();burst(e.position,e.userData.type>=2?0xff6548:0xffb85b,16);sfx.hit();scene.remove(e);enemies.splice(enemies.indexOf(e),1);const roll=Math.random();if(roll<.20)spawnValerian(deathPos);else if(roll<.28)spawnYarnPickup(deathPos);updateUI();if(state.kills>=state.targetKills)winLevel()}}
function fireSausage(){
  if(!state.playing||state.fireCooldown>0)return;
  const berserk=state.valerian>0?.52:1;state.fireCooldown=.12*tune.fire*berserk;
  let dir=aimFacing.clone();
  if(!aimInput.active){const target=nearestEnemy(player.position,22);if(target){dir.copy(target.position).sub(player.position).setY(0).normalize();aimFacing.copy(dir)}}
  if(dir.lengthSq()<.01)dir.copy(playerFacing);dir.normalize();
  const g=new THREE.Group();const body=cyl(g,.13,.13,.72,std(0xd54f2d,.45),0,0,0,0,Math.PI/2);body.rotation.z=Math.PI/2;sph(g,.14,M.glow,0,0,-.42,[1,1,1],10);g.position.copy(player.position).add(new THREE.Vector3(0,1.55,0)).add(dir.clone().multiplyScalar(1.9));g.rotation.y=Math.atan2(dir.x,dir.z);scene.add(g);shots.push({mesh:g,v:dir.multiplyScalar(state.valerian>0?23:19),life:1.8,damage:tune.damage});
  burst(g.position,0xffc15a,5);shake=Math.max(shake,.16);sfx.shoot()
}
function bomb(){if(!state.playing||state.bombs<=0)return;state.bombs--;updateUI();pulseFlash();shake=1.1;sfx.bomb();burst(player.position,0xff7646,36);const radius=9.5*tune.bombRadius;for(const e of [...enemies])if(e.position.distanceTo(player.position)<radius)damageEnemy(e,5)}
function updateProjectiles(dt){
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.v.y-=10*dt;p.mesh.position.addScaledVector(p.v,dt);p.mesh.scale.multiplyScalar(.965);p.life-=dt;if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1)}}
  for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.mesh.position.addScaledVector(s.v,dt);s.life-=dt;if(Math.random()<.65){const tm=mesh(new THREE.SphereGeometry(.045,5,4),new THREE.MeshBasicMaterial({color:0xffc77a}),s.mesh.position.x,s.mesh.position.y,s.mesh.position.z);scene.add(tm);particles.push({mesh:tm,v:new THREE.Vector3(rand(-.3,.3),rand(.2,.8),rand(-.3,.3)),life:.18})}let hit=false;for(const e of [...enemies])if(s.mesh.position.distanceTo(e.position.clone().add(new THREE.Vector3(0,1.2,0)))<1.25){damageEnemy(e,s.damage||1);hit=true;break}if(hit||s.life<0){scene.remove(s.mesh);shots.splice(i,1)}}
  for(let i=feathers.length-1;i>=0;i--){const s=feathers[i];s.mesh.position.addScaledVector(s.v,dt);s.life-=dt;let hit=false;for(const e of [...enemies])if(s.mesh.position.distanceTo(e.position.clone().add(new THREE.Vector3(0,1.1,0)))<1){damageEnemy(e,1);hit=true;break}if(hit||s.life<0){scene.remove(s.mesh);feathers.splice(i,1)}}
  for(let i=boneShots.length-1;i>=0;i--){const s=boneShots[i];s.mesh.position.addScaledVector(s.v,dt);s.mesh.rotation.x+=s.spin*dt;s.mesh.rotation.z+=s.spin*.7*dt;s.life-=dt;let hit=false;
    if(s.mesh.position.distanceTo(player.position.clone().add(new THREE.Vector3(0,1.15,0)))<1.25&&state.invuln<=0){state.lives--;state.invuln=1.15;updateUI();pulseFlash();shake=.48;burst(player.position,0xf7e6bd,12);hit=true;if(state.lives<=0)lose('Кота закидали костями')}
    if(!hit){for(const a of [...allies]){if(s.mesh.position.distanceTo(a.position.clone().add(new THREE.Vector3(0,1.0,0)))<.9){a.userData.hp--;burst(a.position,0xf7e6bd,8);hit=true;if(a.userData.hp<=0){scene.remove(a);allies.splice(allies.indexOf(a),1)}break}}}
    if(!hit&&s.mesh.position.distanceTo(home.position.clone().add(new THREE.Vector3(0,1.5,0)))<2.8){state.home--;updateUI();pulseFlash();burst(home.position,0xf7e6bd,10);hit=true;if(state.home<=0)lose('База разбита костями')}
    if(hit||s.life<0){scene.remove(s.mesh);boneShots.splice(i,1)}
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
function updatePlayer(dt,now){
  let x=moveInput.active?moveInput.x:0,z=moveInput.active?moveInput.y:0;
  if(keys.has('left'))x-=1;if(keys.has('right'))x+=1;if(keys.has('up'))z-=1;if(keys.has('down'))z+=1;
  const mag=Math.min(1,Math.hypot(x,z));
  if(mag>.06){
    const l=Math.hypot(x,z);x/=l;z/=l;const cs=Math.cos(cameraYaw),sn=Math.sin(cameraYaw),wx=x*cs+z*sn,wz=-x*sn+z*cs;playerFacing.set(wx,0,wz);
    const desiredYaw=Math.atan2(wx,wz);player.rotation.y+=normalizeAngle(desiredYaw-player.rotation.y)*Math.min(1,dt*10);
    const boost=(state.valerian>0?1.38:1)*(state.poopSlow>0?.58:1),speed=8.7*tune.speed*boost*mag,nx=player.position.x+wx*speed*dt,nz=player.position.z+wz*speed*dt;
    if(!blocked(nx,player.position.z))player.position.x=nx;if(!blocked(player.position.x,nz))player.position.z=nz;for(const w of player.userData.tracks||[])w.rotation.x+=dt*10*mag
  }else{player.rotation.z=Math.sin(now*2.5)*.012}
  player.position.y=.06+Math.sin(now*4)*.025
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
function animate(ms){requestAnimationFrame(animate);const now=ms*.001,dt=Math.min(.04,state.last?now-state.last:.016);state.last=now;
  if(state.playing){
    state.fireCooldown=Math.max(0,state.fireCooldown-dt);state.invuln=Math.max(0,state.invuln-dt);state.comboTimer=Math.max(0,state.comboTimer-dt);state.valerian=Math.max(0,state.valerian-dt);state.poopSlow=Math.max(0,state.poopSlow-dt);
    if(state.comboTimer===0&&state.combo!==1){state.combo=1;updateUI()}
    player.visible=state.invuln<=0||Math.floor(now*12)%2===0;
    updatePlayer(dt,now);updateAim(dt);if(aimInput.active&&Math.hypot(aimInput.x,aimInput.y)>.24)fireSausage();
    updateHelper(dt,now);updateAllies(dt,now);updateProjectiles(dt);updateEnemies(dt,now);updateChaosItems(dt,now);updateUI();
    state.spawnTimer-=dt;if(state.spawned<state.targetKills&&state.spawnTimer<=0&&enemies.length<10){const batch=(state.spawned+1<state.targetKills&&enemies.length<8&&Math.random()<.45)?2:1;for(let i=0;i<batch;i++)spawnDog();state.spawnTimer=Math.max(.20,.56-state.level*.006)}
  }
  if(!cameraDrag.active&&Math.abs(cameraYawVelocity)>.0001){cameraYaw+=cameraYawVelocity*dt;cameraYawVelocity*=Math.pow(.035,dt)}
  const radius=21,focus=new THREE.Vector3(player.position.x,1.6,player.position.z),desired=new THREE.Vector3(focus.x+Math.sin(cameraYaw)*radius,13.2,focus.z+Math.cos(cameraYaw)*radius);camera.position.lerp(desired,.11);camera.lookAt(focus);
  if(shake>0){camera.position.x+=rand(-shake,shake)*.14;camera.position.y+=rand(-shake,shake)*.10;shake=Math.max(0,shake-dt*4.3)}
  renderer.render(scene,camera)
}
requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.35))});
window.__kototanki3d={get ready(){return true},get state(){return {...state}},get player(){return {x:player.position.x,z:player.position.z,aimX:aimFacing.x,aimZ:aimFacing.z,turret:player.userData.turret?.rotation.y||0,head:player.userData.head?.rotation.y||0}},get helper(){return {x:helper.position.x,y:helper.position.y,z:helper.position.z}},get allies(){return allies.map(a=>({x:a.position.x,z:a.position.z,fireCooldown:a.userData.fireCooldown}))},get dogs(){return enemies.map(e=>({x:e.position.x,z:e.position.z,type:e.userData.type,speed:e.userData.speed,fireCooldown:e.userData.fireCooldown,rotation:e.rotation.y,forwardX:-Math.sin(e.rotation.y),forwardZ:-Math.cos(e.rotation.y),target:e.userData.target===player?'player':e.userData.target===home?'home':e.userData.target?'ally':null,targetX:e.userData.target?.position.x??null,targetZ:e.userData.target?.position.z??null}))},get action(){return {activeDogs:enemies.length,targetKills:state.targetKills,spawnTimer:state.spawnTimer,bones:boneShots.length,pickups:pickups.length,hazards:hazards.length,yarns:yarnBalls.length}},get bones(){return boneShots.map(b=>({x:b.mesh.position.x,y:b.mesh.position.y,z:b.mesh.position.z}))},get controls(){return [...keys]},get sticks(){return {move:{...moveInput},aim:{...aimInput}}},get tuning(){return {...tune}},get camera(){return {yaw:cameraYaw,x:camera.position.x,y:camera.position.y,z:camera.position.z}},rotateCamera(delta){cameraYaw+=delta},setCameraYaw(value){cameraYaw=value;cameraYawVelocity=0},setMove(x,y){moveInput.x=x;moveInput.y=y;moveInput.active=Math.hypot(x,y)>.01},setAim(x,y,active=true){aimInput.x=x;aimInput.y=y;aimInput.active=active},spawnDog(){spawnDog()},spawnValerian(){spawnValerian(player.position.clone().add(new THREE.Vector3(1,0,0)))},spawnYarn(){spawnYarnPickup(player.position.clone().add(new THREE.Vector3(1,0,0)))},fireDogBone(){if(!enemies.length)spawnDog();fireBone(enemies[0],player)},start(){initAudio();buildLevel(1);overlay.style.display='none'},next(){buildLevel(Math.min(30,state.level+1))},fire:fireSausage,bomb};
