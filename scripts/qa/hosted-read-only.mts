import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('C:/Users/Harrie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
import {createPublicClient,http} from '../../app/node_modules/viem/_esm/index.js';
import {CallBookAbi} from '../../app/src/abi.ts';
const deployment=JSON.parse(readFileSync('contracts/deployments/10143.json','utf8'));
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
  await page.waitForURL('**/signin?next=*');await page.getByRole('button',{name:'Continue with passkey',exact:true}).waitFor();
  assert.equal(await page.locator('.dashboard-shell').count(),0);
  assert.equal(await page.getByRole('button',{name:/Local account/}).count(),0);
  assert.equal(await page.locator('.onboard li').count(),0);
  await page.screenshot({path:`docs/design/screens/${process.env.UPSIDE_QA_PREFIX ?? 'hosted'}-sign-in-390.png`,fullPage:true});
  for(const path of ['/dashboard','/dashboard/calls','/dashboard/create','/dashboard/vault','/dashboard/record','/dashboard/profile','/dashboard/funding','/dashboard/calls/11']){
    const response=await page.goto('https://upside-monad.vercel.app'+path);assert.equal(response?.status(),200);
    await page.waitForURL('**/signin?next=*');await page.getByRole('button',{name:'Continue with passkey',exact:true}).waitFor();assert.equal(await page.locator('.dashboard-shell').count(),0);
  }
  for(const path of ['/docs','/docs/assets','/docs/calls','/docs/fees','/docs/vault','/docs/security','/privacy','/terms']){
    const response=await page.goto('https://upside-monad.vercel.app'+path);assert.equal(response?.status(),200);
    await page.locator(path.startsWith('/docs')?'.docs-content':'.info-page').waitFor();assert.equal(await page.locator('.dashboard-shell').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal((await page.locator('body').innerText()).includes('\u2014'),false);
  }
  await page.goto('https://upside-monad.vercel.app/#/call/11');await page.waitForURL('**/signin?next=*');assert.equal(new URL(page.url()).searchParams.get('next'),'/dashboard/calls/11');
  await page.goto('https://upside-monad.vercel.app/docs/fees');await page.locator('.docs-content').waitFor();assert.match(await page.locator('.docs-content').innerText(),/open position losses are excluded/i);
  const client=createPublicClient({transport:http('https://testnet-rpc.monad.xyz')});
  const actualCall=await client.readContract({address:deployment.callBook,abi:CallBookAbi,functionName:'getCall',args:[BigInt(proof.callId)]});assert.equal(actualCall.caller.toLowerCase(),proof.caller.toLowerCase());
  assert.deepEqual(errors,[]);
  writeFileSync('docs/design/hosted-read-only-results.json',JSON.stringify({date:new Date().toISOString(),url:'https://upside-monad.vercel.app',actualHostedReceipt:true,completeHistory:true,matchingTransaction:true,actualTestnetCall:true,landingArtwork:true,mainSections:6,proofTransactions:4,dashboardAuthenticationGate:true,cleanDirectPaths:true,legacyCallLink:true,publicResources:true,productionDevAccountsAbsent:true,guideDisclosure:true,horizontalOverflow:false,runtimeErrors:errors,scope:'Read-only hosted gate, public resources, RPC and keeper checks. Signing and dashboard interactions tested locally with fixtures; hardware passkeys remain separate.'},null,2));
  console.log('Hosted authentication gates, direct links, public help and real testnet reads passed.');
}finally{await browser.close();}
