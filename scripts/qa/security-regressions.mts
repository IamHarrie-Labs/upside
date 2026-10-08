import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadLedger,saveLedger,withLedgerLock,emptyState} from '../../mm-plugin/dist/ledger.js';
import {validatePaymentOffer,paidFetch,nansenSmartMoney} from '../../mm-plugin/dist/x402.js';
import {autopilotPass,DEFAULT_RULES} from '../../mm-plugin/dist/core.js';
import {validateOffer,reserveBudget} from '../../keeper/src/payments.ts';
import {verificationMode} from '../../keeper/src/verification-policy.ts';
const dir=mkdtempSync(join(tmpdir(),'upside-security-'));process.env.UPSIDE_STATE_DIR=dir;
let checks=0;const check=(fn:()=>void)=>{fn();checks++;};
const address='0x1111111111111111111111111111111111111111';
const valid={scheme:'exact',network:'eip155:143',asset:'0x754704Bc059F8C67012fEd69BC8A327a5aafb603',amount:'50000',payTo:address,maxTimeoutSeconds:60};
for(const validate of [validatePaymentOffer,validateOffer]) {
 check(()=>assert.equal(validate(valid,.05),50000n));
 for(const offer of [{...valid,asset:address},{...valid,network:'eip155:8453'},{...valid,amount:'100001'},{...valid,amount:'-1'},{...valid,maxTimeoutSeconds:3600}]) check(()=>assert.throws(()=>validate(offer,.1)));
}
for(const args of [[undefined,10143,true],['typo',10143,true],['mock',143,true],['mock',10143,false]] as const)check(()=>assert.throws(()=>verificationMode(...args)));
check(()=>assert.equal(verificationMode('mock',10143,true),'mock'));check(()=>assert.equal(verificationMode('api',143,false),'api'));
const ledger=join(dir,'pilot.json');saveLedger(ledger,emptyState());check(()=>assert.equal(loadLedger(ledger).version,2));
writeFileSync(ledger,'bad json');check(()=>assert.throws(()=>loadLedger(ledger),/LEDGER_INVALID/));
writeFileSync(ledger,JSON.stringify({followed:[],spent:{'2026-10-08':'-5'}}));check(()=>assert.throws(()=>loadLedger(ledger),/LEDGER_INVALID/));
await withLedgerLock(ledger,async()=>{await assert.rejects(()=>withLedgerLock(ledger,async()=>1),/LEDGER_BUSY/);checks++;});
await withLedgerLock(ledger,async()=>{checks++;});
const budget=join(dir,'budget.json');reserveBudget(budget,50000n,.1);reserveBudget(budget,50000n,.1);check(()=>assert.throws(()=>reserveBudget(budget,1n,.1),/allowance/));
writeFileSync(budget,'corrupt');check(()=>assert.throws(()=>reserveBudget(budget,1n,.1),/Unreadable/));
const originalFetch=globalThis.fetch;let signatures=0,requests=0;
const signer={address,signTypedData:async()=>{signatures++;return '0x'+'11'.repeat(65);}} as any;
globalThis.fetch=async()=>{requests++;const required={x402Version:2,resource:{url:'https://example.org',description:'test',mimeType:'application/json'},accepts:[{...valid,asset:address}]};return new Response(JSON.stringify(required),{status:402,headers:{'content-type':'application/json','payment-required':Buffer.from(JSON.stringify(required)).toString('base64')}});};
await assert.rejects(()=>paidFetch('https://example.org',{},signer,{maxUsd:.1}),/USDC/);check(()=>assert.equal(signatures,0));
const intel=join(dir,`intelligence-143-${address}.json`);writeFileSync(intel,JSON.stringify({day:new Date().toISOString().slice(0,10),reserved:'1000000',cachedAt:Date.now(),entries:[[address,{label:'Snapshot',trades:1,volumeUsd:10}]]}));
const before=requests;const cached=await nansenSmartMoney(signer,{maxUsd:.1,maxDailyUsd:0});check(()=>assert.equal(cached.cached,true));check(()=>assert.equal(requests,before));
writeFileSync(intel,JSON.stringify({day:new Date().toISOString().slice(0,10),reserved:'nonsense'}));await assert.rejects(()=>nansenSmartMoney(signer,{maxUsd:.1}),/Malformed/);checks++;
globalThis.fetch=originalFetch;
// A held call older than the 50-call discovery window still closes on expiry. Missing spend state
// reconstructs confirmed follows before considering new orders; dry run never invokes paid intelligence.
const now=BigInt(Math.floor(Date.now()/1000));let olderRead=false,lookups=0,submits=0;
const read:any={getBlock:async()=>({timestamp:now}),getBlockNumber:async()=>20n,getLogs:async({fromBlock}:any)=>fromBlock===0n?[{args:{amountIn:25000000n}}]:[],readContract:async({functionName:f,args=[]}:any)=>{
 switch(f){case 'vaultOf':return address;case 'positionCount':return 1n;case 'maxExposure':return 500000000n;case 'openCost':return 10000000n;case 'balanceOf':return 400000000n;case 'getPosition':return {callId:0n,caller:address,base:address,baseAmount:1n,cost:10000000n,open:true};case 'callCount':return 60n;case 'records':return [100n,3,3,3];case 'isVerified':return true;case 'getCall':{const id=Number(args[0]);if(id===0)olderRead=true;return {caller:address,side:0,feeBps:1000,verifiedAtPost:true,scored:id!==59,postedAt:now-5n,expiry:id===0?now-1n:now+3600n,entryMid:2000000n,targetMid:2200000n,stopMid:1800000n,exitMid:0n,returnBps:0n};}default:throw Error(f);}
}};
const host:any={chainId:31337,account:address,d:{startBlock:0,factory:address,callBook:address,settlement:address,gate:address},read,submit:async()=>{submits++;throw Error('Dry run sent a transaction');}};
const opts={rules:{...DEFAULT_RULES,minScored:0,minWinRate:0},dailyBudget:20000000n,closeExpired:true,dryRun:true};
const actions=await autopilotPass(host,opts);check(()=>assert(olderRead));check(()=>assert(actions.some(a=>a.kind==='closed'&&a.callId===0)));check(()=>assert(actions.some(a=>a.kind==='skipped'&&a.reasons.some(r=>r.includes('daily budget')))));
await autopilotPass(host,{...opts,dailyBudget:100000000n,rules:{...opts.rules,requireSmartMoney:true},smartMoney:async()=>{lookups++;return new Map();}});check(()=>assert.equal(lookups,0));check(()=>assert.equal(submits,0));
writeFileSync(join(dir,`autopilot-31337-${address}.json`),JSON.stringify({...emptyState(),pending:{day:new Date().toISOString().slice(0,10),amount:'10000000',callId:59}}));const stopped=await autopilotPass(host,opts);check(()=>assert.equal(stopped[0].kind,'stopped'));
writeFileSync('docs/design/security-regressions.json',JSON.stringify({date:new Date().toISOString(),checks,scope:'Deterministic simulated payment offers, file concurrency, and chain-reader fixtures; no real payments or MetaMask host policy proof',passed:true},null,2));console.log(`${checks} security regression checks passed.`);
