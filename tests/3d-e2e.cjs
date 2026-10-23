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

    assert.equal(await page.locator('canvas').count(),1);
    assert.equal(await page.locator('#moveStick').count(),1);assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.kind),'litterbox');assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.modelStyle),'true-3d-r8');assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.revision),'studio-r8');assert.ok(Math.abs((await page.evaluate(()=>window.__kototanki3d.vehicle.catYaw))-Math.PI)<.03);assert.ok((await page.evaluate(()=>window.__kototanki3d.vehicle.wheels))>=4);assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.wheelCount),4);assert.equal(await page.evaluate(()=>window.__kototanki3d.mouse?.modelStyle),'mouse-reference-r6');
    assert.equal(await page.locator('#aimStick').count(),1);
    await page.click('#start');
    assert.equal(await page.evaluate(()=>window.__kototanki3d.state.playing),true);assert.deepEqual(await page.evaluate(()=>({d:window.__kototanki3d.diagnostics.blockedDogs,a:window.__kototanki3d.diagnostics.blockedAllies})),{d:0,a:0});assert.equal(await page.evaluate(()=>window.__kototanki3d.mouse?.riderVisible),false);const classicYaw=await page.evaluate(()=>window.__kototanki3d.camera.yaw);assert.ok(Math.abs(classicYaw)<0.03);assert.ok((await page.evaluate(()=>window.__kototanki3d.dogs.every(d=>d.modelStyle==='organic-r3'))));assert.ok((await page.evaluate(()=>window.__kototanki3d.allies.every(a=>a.modelStyle==='organic-r8'))));assert.equal(await page.evaluate(()=>window.__kototanki3d.helper.modelStyle),'organic-r8');
    await page.waitForFunction(()=>window.__kototanki3d.camera.homeFade<.55,{timeout:5000});const homeFade=await page.evaluate(()=>window.__kototanki3d.camera.homeFade);assert.ok(homeFade<.55);await page.screenshot({path:resolve(__dirname,'..','artifacts','kototanki-studio-r8.png')});
    await page.evaluate(()=>window.__kototanki3d.spawnValerianAt(2.5,0));
    await page.waitForFunction(()=>window.__kototanki3d.state.valerian>0,{timeout:5000});
    assert.ok((await page.evaluate(()=>window.__kototanki3d.state.valerian))>0);
    assert.ok((await page.locator('#boost').textContent()).includes('🌿'));
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.activeDogs))>=4);
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.hazards))>=4);await page.evaluate(()=>window.__kototanki3d.spawnRaccoon());await page.waitForTimeout(120);assert.ok((await page.evaluate(()=>window.__kototanki3d.action.raccoons))>=1);
    assert.ok((await page.locator('#place').textContent()).includes('·'));

    await page.evaluate(()=>window.__kototanki3d.setCameraYaw(0));
    const p0=await page.evaluate(()=>window.__kototanki3d.player);const wheel0=await page.evaluate(()=>window.__kototanki3d.vehicle.wheelSpin);const tail0=await page.evaluate(()=>window.__kototanki3d.vehicle.tailPose);
    await page.evaluate(()=>window.__kototanki3d.setMove(.75,-.75));
    await page.waitForFunction(({x,z,w})=>{const p=window.__kototanki3d.player,v=window.__kototanki3d.vehicle;return Math.hypot(p.x-x,p.z-z)>.20&&Math.abs(v.wheelSpin-w)>.15},{x:p0.x,z:p0.z,w:wheel0},{timeout:5000});
    await page.evaluate(()=>window.__kototanki3d.setMove(0,0));
    const p1=await page.evaluate(()=>window.__kototanki3d.player);const wheel1=await page.evaluate(()=>window.__kototanki3d.vehicle.wheelSpin);const mouseRide=await page.evaluate(()=>window.__kototanki3d.mouse);
    assert.ok(Math.hypot(p1.x-p0.x,p1.z-p0.z)>.20);assert.ok(Math.abs(wheel1-wheel0)>.15);assert.ok(mouseRide&&Math.hypot(mouseRide.x-p1.x,mouseRide.z-p1.z)<2.5);await page.waitForFunction(t=>Math.abs(window.__kototanki3d.vehicle.tailPose-t)>.01,tail0,{timeout:3000});const tail1=await page.evaluate(()=>window.__kototanki3d.vehicle.tailPose);assert.ok(Math.abs(tail1-tail0)>.01);

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
    assert.deepEqual(errors,[]);
    console.log('KOTOTANKI_TWIN_STICK_CHAOS_E2E_PASS');
    await ctx.close();
  }finally{await browser.close();server.kill('SIGTERM')}
})().catch(e=>{console.error(e);process.exit(1)});
