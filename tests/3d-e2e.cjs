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
    assert.equal(await page.locator('#moveStick').count(),1);assert.equal(await page.evaluate(()=>window.__kototanki3d.vehicle.kind),'litterbox');assert.ok((await page.evaluate(()=>window.__kototanki3d.vehicle.wheels))>=4);assert.ok(await page.evaluate(()=>!!window.__kototanki3d.mouse));
    assert.equal(await page.locator('#aimStick').count(),1);
    await page.click('#start');
    assert.equal(await page.evaluate(()=>window.__kototanki3d.state.playing),true);
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.activeDogs))>=4);
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.hazards))>=4);await page.evaluate(()=>window.__kototanki3d.spawnRaccoon());await page.waitForTimeout(120);assert.ok((await page.evaluate(()=>window.__kototanki3d.action.raccoons))>=1);
    assert.ok((await page.locator('#place').textContent()).includes('·'));

    const p0=await page.evaluate(()=>window.__kototanki3d.player);
    await page.evaluate(()=>window.__kototanki3d.setMove(.75,-.75));
    await page.waitForTimeout(420);
    await page.evaluate(()=>window.__kototanki3d.setMove(0,0));
    const p1=await page.evaluate(()=>window.__kototanki3d.player);
    assert.ok(Math.abs(p1.x-p0.x)>.12&&Math.abs(p1.z-p0.z)>.12);

    const aim0=await page.evaluate(()=>window.__kototanki3d.player);
    await page.evaluate(()=>window.__kototanki3d.setAim(1,0,true));
    await page.waitForTimeout(320);
    const aim1=await page.evaluate(()=>window.__kototanki3d.player);
    assert.ok(Math.abs(aim1.turret-aim0.turret)>.12);
    assert.ok(Math.abs(aim1.head-aim0.head)>.05);
    assert.ok((await page.evaluate(()=>window.__kototanki3d.action.shots))>0);
    await page.evaluate(()=>window.__kototanki3d.setAim(0,-1,false));

    const mouse0=await page.evaluate(()=>window.__kototanki3d.mouse);await page.evaluate(()=>window.__kototanki3d.spawnValerianAt(5,0));await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>window.__kototanki3d.mouse.fetching||window.__kototanki3d.mouse.mode==='fetch'),true);await page.waitForTimeout(900);const mouse1=await page.evaluate(()=>window.__kototanki3d.mouse);assert.ok(Math.hypot(mouse1.x-mouse0.x,mouse1.z-mouse0.z)>.5);await page.waitForTimeout(500);assert.ok((await page.evaluate(()=>window.__kototanki3d.state.valerian))>0);
    assert.ok((await page.locator('#boost').textContent()).includes('🌿'));

    await page.waitForTimeout(550);assert.ok((await page.evaluate(()=>window.__kototanki3d.action.mousePoops))>=0);await page.evaluate(()=>window.__kototanki3d.spawnYarn());
    await page.waitForTimeout(220);
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
    assert.deepEqual(errors,[]);
    console.log('KOTOTANKI_TWIN_STICK_CHAOS_E2E_PASS');
    await ctx.close();
  }finally{await browser.close();server.kill('SIGTERM')}
})().catch(e=>{console.error(e);process.exit(1)});
