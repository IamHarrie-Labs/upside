import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('C:/Users/Harrie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const proof=JSON.parse(readFileSync('docs/design/hosted-testnet-results.json','utf8'));
const api='https://keeper.38.49.210.22.sslip.io';
let history:any;
for(let n=0;n<20;n++){
  const res=await fetch(`${api}/receipts?vault=${proof.vault}`,{signal:AbortSignal.timeout(30_000)});
  assert.equal(res.status,200);history=await res.json();
  if(history.complete)break;
  console.log(`Receipt backfill pass ${n+1}: still indexing`);
  await new Promise(resolve=>setTimeout(resolve,10_100));
}
assert.equal(history.complete,true);assert.equal(history.receipts.length,1);
assert.equal(history.receipts[0].hash,'0x8db57557cfd52bc27bbd641714efc35e7310207b408600de3cf3a478fc648c94');
assert.equal(history.receipts[0].pnl,'-1');assert.equal(history.receipts[0].callerFee,'0');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
try{
  await page.goto('https://upside-monad.vercel.app/',{waitUntil:'domcontentloaded'});
  await page.locator('.cabin-illustration').waitFor();
  await page.waitForFunction(()=>{const img=document.querySelector('.cabin-illustration') as HTMLImageElement;return img?.complete&&img.naturalWidth>0;});
  assert.equal(await page.locator('.cabin-illustration').evaluate((img:any)=>img.complete&&img.naturalWidth>0),true);
  assert.match(await page.locator('.cabin-illustration').getAttribute('src')??'',/cabin-expressive-v4\.webp$/);
  assert.equal(await page.locator('#landing-main > section').count(),6);
  assert.equal(await page.locator('.proof-timeline a').count(),4);
  await page.getByRole('button',{name:'Explore the calls',exact:true}).click();
  await page.locator('.call').first().waitFor({timeout:45_000});
  assert.equal(await page.locator('.environment-strip').count(),0);
  assert.equal(await page.locator('.tabs').evaluate(el=>getComputedStyle(el).position),'static');
  await page.setViewportSize({width:1440,height:1000});
  for(const theme of ['light','ivory','dark','forest']){
    await page.getByLabel('Appearance',{exact:true}).selectOption(theme);
    assert.equal(await page.locator('.workspace-surface').getAttribute('data-workspace-theme'),theme);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`docs/design/screens/hosted-workspace-${theme}-1440.png`,fullPage:true});
  }
  assert.match(await page.locator('.trader-name').first().innerText(),/^@|^Trader /);
  await page.reload();await page.getByRole('button',{name:'Explore the calls',exact:true}).click();await page.locator('.call').first().waitFor({timeout:45_000});
  assert.equal(await page.getByLabel('Appearance',{exact:true}).inputValue(),'forest');
  await page.getByLabel('Appearance',{exact:true}).selectOption('light');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Record',exact:true}).click();
  await page.locator('.caller-comparison').waitFor({timeout:45_000});
  assert.equal(await page.locator('.comparison-table tbody tr').count(),8);
  await page.goto('https://upside-monad.vercel.app/#/docs/fees');
  await page.locator('.docs-content').waitFor();
  assert.match(await page.locator('.docs-content').innerText(),/open position losses are excluded/i);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Continue with passkey',exact:true}).waitFor();
  assert.equal(await page.locator('.onboard li').count(),0);
  assert.doesNotMatch(await page.locator('.onboard').innerText(),/chain 10143|demo venue|your account controls|your account/i);
  await page.screenshot({path:'docs/design/screens/hosted-sign-in-390.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  writeFileSync('docs/design/hosted-read-only-results.json',JSON.stringify({date:new Date().toISOString(),url:'https://upside-monad.vercel.app',actualHostedReceipt:true,completeHistory:true,matchingTransaction:true,landingArtwork:true,mainSections:6,proofTransactions:4,callerComparison:true,browseTestnetCalls:true,guideDisclosure:true,horizontalOverflow:false,runtimeErrors:errors,scope:'Read-only hosted browser and keeper check; no phone authentication or trading'},null,2));
  console.log('Hosted receipt, original artwork, testnet browsing and guide checks passed.');
}finally{await browser.close();}
