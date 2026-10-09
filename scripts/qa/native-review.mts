import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { decodeFunctionData, encodeFunctionResult, zeroAddress } from '../../app/node_modules/viem/_esm/index.js';
import * as abis from '../../app/src/abi.ts';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Harrie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const nativeUrl=process.env.UPSIDE_NATIVE_URL??'http://127.0.0.1:8081/';
const abi = Object.values(abis).flat();
const ADA='0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const SYBIL='0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
const VAULT='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const now=Math.floor(Date.now()/1000);
let mode='normal'; let writes=0;let confirmationRefusals=0;const failureOnly=process.env.UPSIDE_REVIEW_FAILURE_ONLY==='1';
const call=(id:number)=>({caller:id%2?SYBIL:ADA,base:VAULT,quote:VAULT,side:id===1?1:0,feeBps:2000,verifiedAtPost:id%2===0,scored:id>=2,postedAt:now-4000+id*100,expiry:id>=2?now-30:now+3600,entryMid:35000n,targetMid:36500n,stopMid:34000n,exitMid:id>=2?35500n:0n,returnBps:id===2?142n:id===3?-210n:0n});
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
  if(mode==='confirmation-refused'){confirmationRefusals++;throw Error('Approval refused in confirmation QA');}
  writes++;throw new Error('Transactions are deliberately blocked in UI QA');
}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.route('**/*',async(route:any)=>{
  const url=route.request().url();
  if(url.includes(':8547')||url.includes('rpc.monad.xyz')){
    const req=route.request().postDataJSON();
    const handle=(x:any)=>{try{return {jsonrpc:'2.0',id:x.id,result:rpc(x)}}catch(e:any){return {jsonrpc:'2.0',id:x.id,error:{code:-32000,message:e.message}}}};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(Array.isArray(req)?req.map(handle):handle(req))});
  }
  if(url.includes(':8788')) return route.fulfill({contentType:'application/json',body:JSON.stringify(url.includes('/perpl/')?{markets:[]}:url.includes('/nansen')?{mode:'off'}:url.includes('/flow')?{flow:{}}:{ok:true})});
  return route.continue();
});
const page=await context.newPage();page.setDefaultTimeout(45000);
const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));page.on('console',(m:any)=>{if(m.type()==='error')errors.push(m.text());});
const shots:any[]=[];
async function snap(name:string){await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));await page.waitForTimeout(150);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error(name+': horizontal overflow');await page.screenshot({path:`docs/design/screens/${failureOnly?"native-error-check":"native"}-${name}.png`,fullPage:true});shots.push({name,overflow});}

for (const width of [320,390,430]) {
  mode='normal';await page.setViewportSize({width,height:720});await page.goto(nativeUrl,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Get started',exact:true}).waitFor();const welcomeFits=await page.getByRole('button',{name:'Explore calls',exact:true}).evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight);if(!welcomeFits)throw Error('Initial welcome requires scrolling');await snap(`onboarding-${width}`);
  await page.getByRole('button',{name:'Get started',exact:true}).click();await snap(`welcome-benefits-${width}`);await page.getByRole('button',{name:'Continue',exact:true}).click();await snap(`welcome-account-${width}`);await page.getByRole('button',{name:'Local account 3'}).click();await page.getByText(/0x7099…79c8/i).first().waitFor();await snap(`calls-${width}`);await page.getByRole('button',{name:'Follow $50',exact:true}).click();await page.getByText('Review your follow',{exact:true}).waitFor();await snap(`trade-review-${width}`);
  if(failureOnly){mode='confirmation-refused';await page.getByRole('button',{name:'Confirm follow',exact:true}).click();await page.getByRole('dialog').getByRole('alert').waitFor();await snap(`review-error-${width}`);mode='normal';}
  await page.getByRole('button',{name:'Cancel',exact:true}).click();if(failureOnly)continue;
  if(await page.getByRole('button',{name:'Follow $50',exact:true}).count()!==1)throw new Error('Short calls must not offer spot follow');
  await page.getByRole('button',{name:'Scored',exact:true}).click();
  if(await page.getByRole('button',{name:'Follow $50',exact:true}).count())throw new Error('Scored filter includes followable calls');
  await page.getByLabel('Search calls').fill('no-matching-handle');await page.getByText('No calls match these filters.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Reset filters'}).click();await page.getByRole('button',{name:'Follow $50',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Create',exact:true}).click();await page.getByText('The trade plan',{exact:true}).waitFor();await snap(`create-${width}`);
  await page.getByRole('tab',{name:'Vault',exact:true}).click();await page.getByText('Cash in vault',{exact:true}).waitFor();await snap(`vault-${width}`);
  await page.getByRole('button',{name:'Exposure limit',exact:true}).click();await page.getByRole('button',{name:'Save exposure limit'}).waitFor();await snap(`vault-editor-${width}`);
  await page.getByRole('tab',{name:'Record',exact:true}).click();await page.getByText('Leaders',{exact:true}).waitFor();await snap(`record-${width}`);if(!await page.getByRole('button',{name:'Switch account',exact:true}).count())throw Error('Session lost across native routes');
  await page.getByText(/0x7099…79c8/i).first().click();await page.getByRole('button',{name:'Share profile'}).waitFor();await snap(`caller-${width}`);await page.goto(new URL('/call/0',nativeUrl).href,{waitUntil:'domcontentloaded'});await page.getByText('Back',{exact:true}).waitFor();await snap(`detail-${width}`);
}
for (const state of failureOnly?[]:['empty','stale','error','new-vault']) {
  mode=state;await page.goto(nativeUrl,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Get started',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Local account 3'}).click();
  if(state==='empty')await page.getByText('No calls here yet.',{exact:true}).waitFor();
  if(state==='error')await page.getByRole('button',{name:'Retry connection'}).waitFor();
  if(state==='stale'){await page.getByText(/0x7099…79c8/i).first().waitFor();await page.getByRole('tab',{name:'Create',exact:true}).click();await page.getByText('Waiting for a fresh price before you can commit this call.',{exact:true}).waitFor();}
  if(state==='new-vault'){await page.getByText(/0x7099…79c8/i).first().waitFor();await page.getByRole('tab',{name:'Vault',exact:true}).click();await page.getByText('Your vault',{exact:true}).waitFor();}
  await snap(`state-${state}`);
}
await page.setViewportSize({width:320,height:640});await page.goto(nativeUrl);await page.getByRole('button',{name:'Get started',exact:true}).waitFor();if(!await page.getByRole('button',{name:'Explore calls',exact:true}).evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight))throw Error('Welcome actions overflow a short screen');await snap('welcome-short-screen');
if(errors.length)throw new Error('Native-web runtime errors: '+errors.join('; '));
if(failureOnly&&confirmationRefusals===0)throw Error('Native confirmation failure path was not exercised');
if(writes)throw Error('Unexpected native write attempts');
writeFileSync(failureOnly?'docs/design/review-error-native-results.json':'docs/design/native-web-qa-results.json',JSON.stringify({date:new Date().toISOString(),fixtureOnly:true,platform:'Expo web (not a physical phone)',runtimeErrors:errors,transactionWrites:writes,confirmationRefusals,screens:shots},null,2));
console.log(JSON.stringify({nativeWebScreens:shots.length,runtimeErrors:errors,transactionWrites:writes}));await browser.close();
