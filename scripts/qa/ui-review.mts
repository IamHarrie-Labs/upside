import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { decodeFunctionData, encodeFunctionResult, zeroAddress } from '../../app/node_modules/viem/_esm/index.js';
import * as abis from '../../app/src/abi.ts';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Harrie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const abi = Object.values(abis).flat();
const ADA='0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const SYBIL='0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
const VAULT='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const now=Math.floor(Date.now()/1000);
let mode='normal'; let writes=0;
const call=(id:number)=>({caller:id%2?SYBIL:ADA,base:VAULT,quote:VAULT,side:0,feeBps:2000,verifiedAtPost:id%2===0,scored:id>=2,postedAt:now-4000+id*100,expiry:id>=2?now-30:now+3600,entryMid:35000n,targetMid:36500n,stopMid:34000n,exitMid:id>=2?35500n:0n,returnBps:id===2?142n:id===3?-210n:0n});
const position=(id:number)=>({callId:BigInt(id),caller:id%2?SYBIL:ADA,base:VAULT,baseAmount:1500n*10n**18n,cost:50000000n,open:id<2});
function rpc(req:any) {
  if(req.method==='eth_getLogs')return [];
  if(req.method==='eth_blockNumber')return '0x1';
  if(req.method==='eth_chainId')return '0x7a69';
  if(req.method==='eth_getBalance')return '0xde0b6b3a7640000';
  if(req.method==='eth_call') {
    if(mode==='error')throw new Error('Simulated RPC unavailable');
    const data=decodeFunctionData({abi:abi as any,data:req.params[0].data});
    const name=data.functionName; const args:any[]=data.args as any[]??[];
    const f:any=abi.find((f:any)=>f.type==='function'&&f.name===name);
    let result:any;
    switch(name){
      case 'midPrice':if(mode==='stale')throw new Error('Stale price'); result=35000n;break;
      case 'callCount':result=mode==='empty'?0n:4n;break;
      case 'getCall':result=call(Number(args[0]));break;
      case 'records':result=args[0].toLowerCase()===ADA?[142n,2,1,1]:[-210n,2,1,0];break;
      case 'isVerified':result=args[0].toLowerCase()===ADA;break;
      case 'handleOf':result=args[0].toLowerCase()===ADA?'ada':args[0].toLowerCase()===SYBIL?'sybil_farm':'femi';break;
      case 'vaultOf':result=mode==='new-vault'?zeroAddress:VAULT;break;
      case 'positionCount':result=3n;break;
      case 'maxExposure':result=500000000n;break;
      case 'openCost':result=100000000n;break;
      case 'balanceOf':result=375500000n;break;
      case 'getPosition':result=position(Number(args[0]));break;
      case 'netPnl':result=-15000000n;break;
      case 'highWater':result=0n;break;
      default: throw new Error('Unhandled fixture read '+name);
    }
    return encodeFunctionResult({abi:[f],functionName:name,result} as any);
  }
  writes++;throw new Error('Transactions are deliberately blocked in UI QA');
}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.route('**/*',async(route:any)=>{
  const url=route.request().url();
  if(url.includes(':8547')||url.includes('rpc.monad.xyz')){
    if(mode==='loading')await new Promise(resolve=>setTimeout(resolve,1500));
    const req=route.request().postDataJSON();
    const handle=(x:any)=>{try{return {jsonrpc:'2.0',id:x.id,result:rpc(x)}}catch(e:any){return {jsonrpc:'2.0',id:x.id,error:{code:-32000,message:e.message}}}};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(Array.isArray(req)?req.map(handle):handle(req))});
  }
  if(url.includes(':8788')) return route.fulfill({contentType:'application/json',body:JSON.stringify(url.includes('/perpl/')?{markets:[]}:url.includes('/nansen')?{mode:'off'}:url.includes('/flow')?{flow:{}}:{ok:true})});
  return route.continue();
});
const page=await context.newPage();
const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
const shots:any[]=[];
async function snap(name:string){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);const styled=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor==='rgb(244, 238, 229)');if(!styled)throw new Error(name+': stylesheet did not apply');const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error(name+': horizontal overflow');await page.screenshot({path:`docs/design/screens/${name}.png`,fullPage:true});shots.push({name,overflow});}
for(const width of [1440,390,320]){
  mode='normal';await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:5173/');await page.getByRole('heading',{name:'Good calls. Shared upside.'}).waitFor();await snap(`landing-${width}`);
  if(width===1440){await page.locator('.crew-art .motion-toggle').evaluate(el=>el.style.visibility='hidden');await page.locator('.crew-art').screenshot({path:'mobile/assets/community-strip.png'});await page.locator('.crew-art .motion-toggle').evaluate(el=>el.style.visibility='');await page.getByRole('button',{name:'Resume motion'}).click();await page.getByRole('button',{name:'Pause motion'}).waitFor();}
  await page.getByRole('button',{name:'Open Upside'}).click();await page.getByRole('button',{name:'Create account with a passkey'}).waitFor();await snap(`onboarding-${width}`);
  await page.getByRole('button',{name:'Femi (follower)'}).click();await page.locator('.call').first().waitFor();await snap(`calls-${width}`);
  await page.getByRole('button',{name:'Live',exact:true}).click();if(await page.locator('.call').count()!==2)throw new Error('Live filter failed');
  await page.getByRole('button',{name:'Scored',exact:true}).click();if(await page.locator('.call').count()!==2)throw new Error('Scored filter failed');
  await page.getByRole('button',{name:'All calls',exact:true}).click();await page.getByRole('searchbox').fill('not-present');await page.getByRole('heading',{name:'Nothing in this view yet.'}).waitFor();await page.getByRole('button',{name:'Show all calls'}).click();
  await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByRole('heading',{name:'Post a call',exact:true}).waitFor();await snap(`create-${width}`);
  await page.getByLabel('Your fee, % of net gains').fill('31');if(!await page.getByRole('button',{name:'Commit call onchain'}).isDisabled())throw new Error('Invalid fee accepted');await page.getByLabel('Your fee, % of net gains').fill('20');
  await page.getByRole('button',{name:'Vault',exact:true}).click();await page.getByText('Cash in vault',{exact:true}).waitFor();await snap(`vault-${width}`);
  await page.getByTitle('Switch account').click();await page.getByRole('button',{name:'Ada (verified caller)'}).click();await page.getByText('Cash in vault',{exact:true}).waitFor();
  await page.getByTitle('Switch account').click();await page.getByRole('button',{name:'Femi (follower)'}).click();await page.getByText('Cash in vault',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Exposure limit',exact:true}).click();await page.getByLabel('Exposure limit (AUSD)').fill('50');if(!await page.getByRole('button',{name:'Save exposure limit'}).isDisabled())throw new Error('Limit below open exposure accepted');await snap(`vault-edit-${width}`);
  await page.getByText('Fund or withdraw your vault',{exact:true}).click();await page.getByLabel('Withdraw available AUSD to your account').fill('999');if(!await page.getByRole('button',{name:'Withdraw to my account'}).isDisabled())throw new Error('Overdraft accepted');await snap(`vault-funding-${width}`);
  await page.getByRole('button',{name:'Record',exact:true}).click();await page.locator('.leader').first().waitFor();await snap(`record-${width}`);await page.locator('.leader').first().click();await page.locator('.profile').waitFor();await snap(`caller-${width}`);
  await page.goto('http://127.0.0.1:5173/#/call/0');await page.locator('.call').waitFor();await snap(`detail-${width}`);await page.goto('http://127.0.0.1:5173/#/call/999');await page.getByRole('heading',{name:'That call is not on this record.'}).waitFor();await snap(`missing-call-${width}`);
  for(const route of ['guide','privacy','terms']){await page.goto('http://127.0.0.1:5173/#/'+route);await page.locator('.info-page').waitFor();await snap(`${route}-${width}`)}
  await page.goto('http://127.0.0.1:5173/#/caller/not-a-wallet');await page.getByRole('heading',{name:'This page is off the map.'}).waitFor();await snap(`not-found-${width}`);
}
await page.setViewportSize({width:390,height:844});
for(const state of ['empty','stale','error','new-vault','loading']){
 mode=state;await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'Open Upside'}).click();await page.getByRole('button',{name:'Femi (follower)'}).click();
 if(state==='loading')await page.getByRole('status',{name:'Loading the onchain record'}).waitFor();
 if(state==='empty')await page.getByRole('heading',{name:'The next call is still unwritten.'}).waitFor();
 if(state==='error'){await page.getByRole('button',{name:'Retry connection'}).waitFor();await snap('error-before-retry');mode='normal';await page.getByRole('button',{name:'Retry connection'}).click();await page.locator('.call').first().waitFor();}
 if(state==='stale'){await page.locator('.call').first().waitFor();await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByText('Waiting for a fresh price before this call can be committed.').waitFor();if(!await page.getByRole('button',{name:'Commit call onchain'}).isDisabled())throw new Error('Stale trading enabled')}
 if(state==='new-vault'){await page.locator('.call').first().waitFor();await page.getByRole('button',{name:'Vault',exact:true}).click();await page.getByRole('heading',{name:'Your vault',exact:true}).waitFor()}
 await snap(`state-${state}`);
}
if(errors.length)throw new Error('Runtime errors: '+errors.join('; '));
if(writes)throw new Error('Unexpected write attempts: '+writes);
writeFileSync('docs/design/ui-qa-results.json',JSON.stringify({date:'2026-10-08',fixtureOnly:true,transactionWrites:writes,runtimeErrors:errors,screens:shots},null,2));
console.log(JSON.stringify({screens:shots.length,runtimeErrors:errors,transactionWrites:writes}));await browser.close();
