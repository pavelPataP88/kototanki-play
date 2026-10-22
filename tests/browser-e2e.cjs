const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {mkdirSync} = require('node:fs');
const {resolve} = require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const target=pathToFileURL(resolve(__dirname,'..','index.html')).href;
  const errors=[];
  mkdirSync(resolve(__dirname,'..','artifacts'),{recursive:true});
  try {
    const portrait=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const page=await portrait.newPage();
    page.on('pageerror',e=>errors.push('portrait: '+e.message));
    await page.goto(target);
    assert.equal(await page.locator('#metaPanel').isVisible(),true);
    await page.screenshot({path:resolve(__dirname,'..','artifacts','menu-portrait.png')});
    await page.locator('#start').click();
    assert.equal(await page.evaluate(()=>window.__gameDebug.get().state),'playing');
    const right=page.locator('[data-dir="right"]'), box=await right.boundingBox();
    assert.ok(box&&box.width>=35&&box.height>=35,'touch arrow is too small');
    const initial=await page.evaluate(()=>window.__gameDebug.get().cat.x);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();
    await page.evaluate(()=>window.__gameDebug.update(.1));
    await page.mouse.up();
    const final=await page.evaluate(()=>window.__gameDebug.get().cat.x);
    assert.ok(final>initial,'movement did not respond: '+initial+' to '+final);
    await page.evaluate(()=>{const g=window.__gameDebug.get();g.toSpawn=0;g.dogs=[];window.__gameDebug.update(.016);});
    assert.equal(await page.evaluate(()=>window.__premiumDebug.getSave().unlocked),2);
    await page.screenshot({path:resolve(__dirname,'..','artifacts','victory-portrait.png')});
    await page.reload();
    assert.equal(await page.evaluate(()=>window.__premiumDebug.getSave().unlocked),2);
    await page.locator('#start').click();
    assert.equal(await page.evaluate(()=>window.__gameDebug.get().n),2);
    await page.screenshot({path:resolve(__dirname,'..','artifacts','game-portrait.png')});
    const stage=await page.locator('.stage').boundingBox();
    const shoot=await page.locator('#fire').boundingBox();
    assert.ok(stage&&shoot,'required UI invisible');
    assert.ok(shoot.x>stage.x+stage.width*.4,'fire button overlaps wrong side of layout');
    assert.ok(shoot.y+shoot.height<=844+2,'fire button overflows portrait');

    const landscape=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const wide=await landscape.newPage();
    wide.on('pageerror',e=>errors.push('landscape: '+e.message));
    await wide.goto(target);
    await wide.locator('#start').click();
    await wide.screenshot({path:resolve(__dirname,'..','artifacts','game-landscape.png')});
    const board=await wide.locator('.stage').boundingBox();
    const left=await wide.locator('.pad').boundingBox();
    const fire=await wide.locator('#fire').boundingBox();
    assert.ok(board&&left&&fire,'landscape controls missing');
    assert.ok(left.x+left.width<=board.x+8,'left pad overlaps board');
    assert.ok(fire.x>=board.x+board.width-8,'right fire overlaps board');
    assert.ok(fire.y+fire.height<=390+2,'landscape fire overflows viewport');

    assert.deepEqual(errors,[],'uncaught page errors');
    await landscape.close();
    await portrait.close();
    process.stdout.write('CHROMIUM_E2E_PASS: portrait, landscape, movement, reward, persistence; screenshots generated.\n');
  }finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
