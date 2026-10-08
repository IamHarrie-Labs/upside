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
  await page.getByRole('button',{name:'Explore the calls',exact:true}).click();
  await page.locator('.call').first().waitFor({timeout:45_000});
  assert.match(await page.locator('body').innerText(),/test tokens only/i);
  await page.goto('https://upside-monad.vercel.app/#/guide');
  await page.locator('.info-page').waitFor();
  assert.match(await page.locator('.info-page').innerText(),/open position losses are excluded/i);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  writeFileSync('docs/design/hosted-read-only-results.json',JSON.stringify({date:new Date().toISOString(),url:'https://upside-monad.vercel.app',actualHostedReceipt:true,completeHistory:true,matchingTransaction:true,landingArtwork:true,browseTestnetCalls:true,guideDisclosure:true,horizontalOverflow:false,runtimeErrors:errors,scope:'Read-only hosted browser and keeper check; no phone authentication or trading'},null,2));
  console.log('Hosted receipt, original artwork, testnet browsing and guide checks passed.');
}finally{await browser.close();}
