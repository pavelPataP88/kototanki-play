const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');

(async()=>{
  const server=spawn('python3',['-m','http.server','4173','--bind','127.0.0.1'],{cwd:resolve(__dirname,'..'),stdio:'ignore'});
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  try{
    await new Promise(r=>setTimeout(r,700));
    const ctx=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message)});
    page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text())});
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__kototanki3d?.ready===true,{timeout:15000}).catch(async e=>{await page.screenshot({path:resolve(__dirname,'..','artifacts','boot-failure.png'),fullPage:true});throw e});

    await page.evaluate(()=>window.__kototanki3d.resetProgress());
    await page.evaluate(()=>{window.__kototanki3d.upgrade('engine');for(let i=0;i<4;i++)window.__kototanki3d.upgrade('cannon');for(let i=0;i<2;i++)window.__kototanki3d.upgrade('squad');window.__kototanki3d.upgrade('coil')});
    const garageSaved=await page.evaluate(()=>window.__kototanki3d.garage);
    assert.equal(garageSaved.upgrades.engine,1);assert.equal(garageSaved.upgrades.cannon,4);assert.equal(garageSaved.upgrades.squad,2);assert.equal(garageSaved.upgrades.coil,1);
    await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__kototanki3d?.ready===true,{timeout:15000});
    const garageReloaded=await page.evaluate(()=>window.__kototanki3d.garage);
    assert.deepEqual(garageReloaded.upgrades,garageSaved.upgrades);console.log('GARAGE_PERSISTENCE',JSON.stringify(garageReloaded));
    const mobileRender=await page.evaluate(()=>window.__kototanki3d.camera);
    assert.equal(mobileRender.mobilePerf,true);assert.ok(mobileRender.quality<=1.0);assert.ok(mobileRender.qualityMin<=.70);
    console.log('MOBILE_RENDER_BOOT',JSON.stringify(mobileRender));
    assert.equal(await page.locator('canvas').count(),1);
    assert.equal(await page.locator('#moveStick').count(),1);assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.kind),'litterbox');assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.modelStyle),'true-3d-r8');assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.revision),'garage-r14');assert.ok(Math.abs((await page.evaluate(()=>window.__kototanki3d.vehicle.catYaw))-Math.PI)<.03);assert.ok((await page.evaluate(()=>window.__kototanki3d.vehicle.wheels))>=4);assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.wheelCount),4);assert.equal(await page.evaluate(()=>window.__kototanki3d.mouse?.modelStyle),'mouse-reference-r6');
    assert.equal(await page.locator('#aimStick').count(),1);
    await page.click('#start');
    assert.equal(await page.evaluate(()=>window.__kototanki3d.state.playing),true);assert.deepEqual(await page.evaluate(()=>({d:window.__kototanki3d.diagnostics.blockedDogs,a:window.__kototanki3d.diagnostics.blockedAllies})),{d:0,a:0});assert.equal(await page.evaluate(()=>window.__kototanki3d.mouse?.riderVisible),false);const classicYaw=await page.evaluate(()=>window.__kototanki3d.camera.yaw);assert.ok(Math.abs(classicYaw)<0.03);assert.ok((await page.evaluate(()=>window.__kototanki3d.dogs.every(d=>d.modelStyle==='organic-r3'))));assert.ok((await page.evaluate(()=>window.__kototanki3d.allies.every(a=>a.modelStyle==='organic-r8'))));assert.ok((await page.evaluate(()=>window.__kototanki3d.allies.every(a=>a.scale>=1.08&&a.hp>=3))));assert.equal(await page.evaluate(()=>window.__kototanki3d.helper.modelStyle),'organic-r8');
    assert.equal(await page.evaluate(()=>window.__kototanki3d.world.width),100);assert.equal(await page.evaluate(()=>window.__kototanki3d.world.depth),100);
    assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.twinVisible),true);assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.coilVisible),true);
    const aiStart=await page.evaluate(()=>{const dogs=window.__kototanki3d.dogs;return {roles:[...new Set(dogs.map(d=>d.role))],variants:[...new Set(dogs.map(d=>d.variant))],total:dogs.length}});
    assert.ok(aiStart.roles.includes('rusher'));assert.ok(aiStart.roles.includes('flanker'));assert.ok(aiStart.roles.includes('marksman'));assert.ok(aiStart.roles.includes('raider'));
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.pickups))>=3);
    const parts0=await page.evaluate(()=>window.__kototanki3d.garage.parts);await page.evaluate(()=>window.__kototanki3d.spawnModule('parts'));
    await page.waitForFunction(p=>window.__kototanki3d.garage.parts>p,parts0,{timeout:3000});
    await page.waitForFunction(()=>window.__kototanki3d.camera.homeFade<.18,{timeout:5000});const homeFade=await page.evaluate(()=>window.__kototanki3d.camera.homeFade);assert.ok(homeFade<.18);await page.screenshot({path:resolve(__dirname,'..','artifacts','kototanki-studio-r8.png')});
    await page.evaluate(()=>window.__kototanki3d.spawnValerianAt(2.5,0));
    await page.waitForFunction(()=>window.__kototanki3d.state.valerian>0,{timeout:5000});
    assert.ok((await page.evaluate(()=>window.__kototanki3d.state.valerian))>0);
    assert.ok((await page.locator('#boost').textContent()).includes('🌿'));
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.activeDogs))>=4);
    const shotBase=await page.evaluate(()=>window.__kototanki3d.action.shots);await page.evaluate(()=>window.__kototanki3d.fire());await page.waitForTimeout(45);
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.shots))>=shotBase+2);
    await page.evaluate(()=>window.__kototanki3d.spawnDogNear(0,-7));await page.waitForFunction(()=>window.__kototanki3d.state.coilCooldown>1,{timeout:4000});
    const aiProfile=await page.evaluate(()=>{
      const dogs=window.__kototanki3d.dogs,roles=[...new Set(dogs.map(d=>d.role))];
      return {roles,total:dogs.length,totalStuck:dogs.reduce((n,d)=>n+(d.stuckCount||0),0),targets:dogs.map(d=>d.target)};
    });
    console.log('AI_PROFILE',JSON.stringify({...aiProfile,startRoles:aiStart.roles}));
    assert.ok(aiProfile.total>=3);assert.ok(aiProfile.totalStuck<6);
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.hazards))>=4);await page.evaluate(()=>window.__kototanki3d.spawnRaccoon());await page.waitForTimeout(120);assert.ok((await page.evaluate(()=>window.__kototanki3d.action.raccoons))>=1);
    assert.ok((await page.locator('#place').textContent()).includes('·'));

    await page.evaluate(()=>window.__kototanki3d.setCameraYaw(0));
    const p0=await page.evaluate(()=>window.__kototanki3d.player);const wheel0=await page.evaluate(()=>window.__kototanki3d.vehicle.wheelSpin);const tail0=await page.evaluate(()=>window.__kototanki3d.vehicle.tailPose);
    await page.evaluate(()=>window.__kototanki3d.setMove(.75,-.75));
    await page.waitForFunction(({x,z,w})=>{const p=window.__kototanki3d.player,v=window.__kototanki3d.vehicle;return Math.hypot(p.x-x,p.z-z)>.20&&Math.abs(v.wheelSpin-w)>.15},{x:p0.x,z:p0.z,w:wheel0},{timeout:5000});
    await page.evaluate(()=>window.__kototanki3d.setMove(0,0));
    const p1=await page.evaluate(()=>window.__kototanki3d.player);const wheel1=await page.evaluate(()=>window.__kototanki3d.vehicle.wheelSpin);const mouseRide=await page.evaluate(()=>window.__kototanki3d.mouse);
    const qualityBeforeSmooth=await page.evaluate(()=>window.__kototanki3d.camera.quality);
    const smoothProfile=await page.evaluate(async()=>{
      window.__kototanki3d.setCameraYaw(0);window.__kototanki3d.setMove(.55,0);
      await new Promise(r=>setTimeout(r,420));
      const steps=[];let prev=window.__kototanki3d.player;
      for(let i=0;i<30;i++)await new Promise(resolve=>requestAnimationFrame(()=>{
        const cur=window.__kototanki3d.player;steps.push(Math.hypot(cur.x-prev.x,cur.z-prev.z));prev=cur;resolve();
      }));
      window.__kototanki3d.setMove(0,0);
      const useful=steps.filter(v=>v>.001),mean=useful.reduce((a,b)=>a+b,0)/Math.max(1,useful.length),variance=useful.reduce((a,b)=>a+(b-mean)*(b-mean),0)/Math.max(1,useful.length);
      return {samples:useful.length,mean,std:Math.sqrt(variance),cv:mean?Math.sqrt(variance)/mean:99,camera:window.__kototanki3d.camera};
    });
    console.log('SMOOTH_MOTION_PROFILE',JSON.stringify(smoothProfile));
    assert.ok(smoothProfile.samples>=20);assert.ok(smoothProfile.cv<.22);assert.equal(smoothProfile.camera.shadowStride,1);
    assert.ok(Number.isFinite(smoothProfile.camera.jitterMs));assert.ok(Number.isFinite(smoothProfile.camera.motionFrameMs));
    assert.equal(await page.evaluate(()=>window.__kototanki3d.camera.quality),qualityBeforeSmooth);
    assert.ok(Math.hypot(p1.x-p0.x,p1.z-p0.z)>.20);assert.ok(Math.abs(wheel1-wheel0)>.15);assert.ok(mouseRide&&Math.hypot(mouseRide.x-p1.x,mouseRide.z-p1.z)<2.5);await page.waitForFunction(t=>Math.abs(window.__kototanki3d.vehicle.tailPose-t)>.01,tail0,{timeout:3000});

    const aim0=await page.evaluate(()=>window.__kototanki3d.player);
    await page.evaluate(()=>window.__kototanki3d.setAim(1,0,true));
    await page.waitForFunction(()=>Math.abs(window.__kototanki3d.player.aimX)>.7,{timeout:3000});
    await page.waitForFunction(t=>Math.abs(window.__kototanki3d.player.turret-t)>.02,aim0.turret,{timeout:5000});
    await page.waitForFunction(h=>Math.abs(window.__kototanki3d.player.head-h)>.015,aim0.head,{timeout:5000});
    const aim1=await page.evaluate(()=>window.__kototanki3d.player);
    assert.ok(Math.abs(aim1.turret-aim0.turret)>.02);assert.ok(Math.abs(aim1.head-aim0.head)>.015);
    await page.evaluate(()=>window.__kototanki3d.fire());await page.waitForFunction(()=>window.__kototanki3d.action.shots>0,{timeout:3000});
    await page.evaluate(()=>window.__kototanki3d.setAim(0,-1,false));
    await page.evaluate(()=>{window.__kototanki3d.setAim(1,0,true);window.dispatchEvent(new Event('blur'))});await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>window.__kototanki3d.sticks.aim.active),false);

    await page.waitForTimeout(550);assert.ok((await page.evaluate(()=>window.__kototanki3d.action.mousePoops))>=0);await page.evaluate(()=>window.__kototanki3d.launchYarn());
    await page.waitForTimeout(350);
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.yarns))>=1);

    await page.waitForTimeout(260);
    const dogFacing=await page.evaluate(()=>{
      const d=window.__kototanki3d.dogs.find(x=>x.targetX!==null);if(!d)return null;
      const dx=d.targetX-d.x,dz=d.targetZ-d.z,l=Math.hypot(dx,dz)||1;
      return {dot:d.forwardX*dx/l+d.forwardZ*dz/l,target:d.target};
    });
    assert.ok(dogFacing&&dogFacing.dot>.45);

    const yawBefore=await page.evaluate(()=>window.__kototanki3d.camera.yaw);
    const canvasBox=await page.locator('canvas').boundingBox();assert.ok(canvasBox);
    await page.mouse.move(canvasBox.x+canvasBox.width*.72,canvasBox.y+canvasBox.height*.44);
    await page.mouse.down();await page.mouse.move(canvasBox.x+canvasBox.width*.44,canvasBox.y+canvasBox.height*.44,{steps:8});await page.mouse.up();
    await page.waitForTimeout(160);
    const yawAfter=await page.evaluate(()=>window.__kototanki3d.camera.yaw);
    assert.ok(Math.abs(yawAfter-yawBefore)>.10);

    const camY=await page.evaluate(()=>window.__kototanki3d.camera.y);assert.ok(camY>12&&camY<14.5);
    const bombsBefore=await page.evaluate(()=>window.__kototanki3d.state.bombs);
    await page.evaluate(()=>window.__kototanki3d.bomb());
    assert.equal(await page.evaluate(()=>window.__kototanki3d.state.bombs),bombsBefore-1);

    const garageBeforeTune=await page.evaluate(()=>window.__kototanki3d.garage),upgradeSumBefore=Object.values(garageBeforeTune.upgrades).reduce((a,b)=>a+b,0);
    await page.evaluate(()=>window.__kototanki3d.completeLevel());
    await page.waitForFunction(()=>document.querySelectorAll('#upgrades button').length===3&&document.querySelector('#overlay').style.display==='flex',{timeout:4000});
    assert.ok((await page.locator('#subtitle').textContent()).includes('Постоянная модернизация'));
    await page.locator('#upgrades button').first().click();
    await page.waitForFunction(()=>window.__kototanki3d.state.playing&&window.__kototanki3d.state.level===2,{timeout:5000});
    const garageAfterTune=await page.evaluate(()=>window.__kototanki3d.garage),upgradeSumAfter=Object.values(garageAfterTune.upgrades).reduce((a,b)=>a+b,0);
    assert.equal(garageAfterTune.wavesWon,garageBeforeTune.wavesWon+1);assert.ok(garageAfterTune.xp>garageBeforeTune.xp);assert.equal(upgradeSumAfter,upgradeSumBefore+1);
    console.log('GARAGE_LEVEL_FLOW',JSON.stringify({before:garageBeforeTune,after:garageAfterTune}));

    const place1=await page.locator('#place').textContent();
    await page.evaluate(()=>window.__kototanki3d.next());
    const place2=await page.locator('#place').textContent();
    assert.notEqual(place2,place1);

    await page.screenshot({path:resolve(__dirname,'..','artifacts','kototanki-chaos-landscape.png')});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
    assert.equal(await page.locator('#moveStick').isVisible(),true);
    assert.equal(await page.locator('#aimStick').isVisible(),true);
    await page.screenshot({path:resolve(__dirname,'..','artifacts','kototanki-chaos-portrait.png')});
    const mem0=await page.evaluate(()=>window.__kototanki3d.diagnostics);
    for(let i=0;i<5;i++){await page.evaluate(()=>window.__kototanki3d.next());await page.waitForTimeout(120)}
    const mem1=await page.evaluate(()=>window.__kototanki3d.diagnostics);
    console.log('MEMORY_SOAK',JSON.stringify({before:mem0,after:mem1}));console.log('RENDER_PROFILE',JSON.stringify(mem1));
    assert.ok(mem1.geometries<mem0.geometries*1.8+120);assert.ok(mem1.textures<mem0.textures+30);

    // Final production sweep: rebuild every level, cover all 30 location/layout combinations,
    // and verify that repeated teardown/rebuild does not strand NPCs inside colliders or leak badly.
    const sweep0=await page.evaluate(()=>window.__kototanki3d.diagnostics);
    await page.evaluate(()=>window.__kototanki3d.start());
    const places=new Set(),chapters=new Set(),landmarks=new Set(),worlds=[];
    for(let level=1;level<=30;level++){
      if(level>1)await page.evaluate(()=>window.__kototanki3d.next());
      await page.waitForTimeout(70);
      const snap=await page.evaluate(()=>({
        state:window.__kototanki3d.state,
        diag:window.__kototanki3d.diagnostics,
        player:window.__kototanki3d.player,
        world:window.__kototanki3d.world,
        variants:window.__kototanki3d.dogs.map(d=>d.variant),
        place:document.querySelector('#place').textContent
      }));
      assert.equal(snap.state.level,level);
      assert.equal(snap.diag.blockedDogs,0);
      assert.equal(snap.diag.blockedAllies,0);
      assert.ok(Number.isFinite(snap.player.x)&&Number.isFinite(snap.player.z));
      assert.ok(Math.abs(snap.player.x)<snap.world.halfW&&snap.player.z>snap.world.minZ&&snap.player.z<snap.world.maxZ);
      if(level%5===0)assert.ok(snap.variants.includes('alpha'));
      places.add(snap.place);chapters.add(snap.world.chapter);landmarks.add(snap.world.landmark);worlds.push(snap.world);
    }
    assert.equal(places.size,30);assert.equal(chapters.size,6);assert.equal(landmarks.size,6);
    assert.ok(worlds.every(w=>w.width===100&&w.depth===100));
    console.log('WORLD_PROGRESSION',JSON.stringify({chapters:[...chapters],landmarks:[...landmarks],first:worlds[0],last:worlds[29]}));
    const sweep1=await page.evaluate(()=>window.__kototanki3d.diagnostics);
    console.log('FULL_SWEEP_PROFILE',JSON.stringify({before:sweep0,after:sweep1,uniquePlaces:places.size}));
    assert.ok(sweep1.geometries<2500);assert.ok(sweep1.textures<150);

    // Leak check uses repeated rebuilds of the same level so GPU lazy-allocation/culling
    // cannot make two different maps look like a memory regression.
    await page.evaluate(()=>window.__kototanki3d.start());await page.waitForTimeout(220);
    const same0=await page.evaluate(()=>window.__kototanki3d.diagnostics);
    for(let i=0;i<8;i++){await page.evaluate(()=>window.__kototanki3d.start());await page.waitForTimeout(120)}
    const same1=await page.evaluate(()=>window.__kototanki3d.diagnostics);
    console.log('SAME_LEVEL_LEAK_PROFILE',JSON.stringify({before:same0,after:same1}));
    assert.ok(same1.geometries<same0.geometries+320);assert.ok(same1.textures<same0.textures+8);

    for(let i=2;i<=30;i++){await page.evaluate(()=>window.__kototanki3d.next());await page.waitForTimeout(35)}
    await page.screenshot({path:resolve(__dirname,'..','artifacts','kototanki-level30-portrait.png')});
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(250);
    assert.equal(await page.locator('#moveStick').isVisible(),true);assert.equal(await page.locator('#aimStick').isVisible(),true);
    await page.screenshot({path:resolve(__dirname,'..','artifacts','kototanki-level30-landscape.png')});

    assert.deepEqual(errors,[]);
    console.log('KOTOTANKI_TWIN_STICK_CHAOS_E2E_PASS');
    await ctx.close();
  }finally{await browser.close();server.kill('SIGTERM')}
})().catch(e=>{console.error(e);process.exit(1)});
