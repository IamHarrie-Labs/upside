import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {receiptsFor} from '../../keeper/src/receipts.js';
import {deployment} from '../../keeper/src/env.js';
if(deployment.chainId!==31337)throw Error('Local QA only');
// Resolve the known public Femi account's actual factory vault rather than relying on an address.
const {publicClient}=await import('../../keeper/src/env.js');
const actual:any=await publicClient.readContract({address:deployment.factory,abi:[{type:'function',name:'vaultOf',stateMutability:'view',inputs:[{type:'address'}],outputs:[{type:'address'}]}],functionName:'vaultOf',args:['0x90F79bf6EB2c4f870365E785982E1f101E93b906']});
// Put receipts outside the first bounded window; the next request must resume, not reset.
if(process.env.UPSIDE_RECEIPTS_ALREADY_AGED!=='1')await publicClient.request({method:'anvil_mine' as any,params:['0x834'] as any});
const initial=await receiptsFor(actual);assert.equal(initial.complete,false);
let result=initial;
for(let attempt=0;attempt<10&&!result.complete;attempt++){await new Promise(resolve=>setTimeout(resolve,10_100));result=await receiptsFor(actual);}
assert.equal(result.complete,true);assert.equal(result.receipts.length,3);
assert.equal(result.receipts[0].callerFee,'1800000');assert.equal(result.receipts[0].protocolFee,'200000');
assert.equal(result.receipts[1].callerFee,'0');assert.equal(result.receipts[2].callerFee,'0');
await assert.rejects(()=>receiptsFor('0x1111111111111111111111111111111111111111'));
writeFileSync('docs/design/receipt-index-results.json',JSON.stringify({date:new Date().toISOString(),scope:'Actual local closed events with global scanner not initialized',boundedBackfillResumes:true,partialHistoryRefused:true,completeHistory:true,closedPositions:3,correctFeeSplit:true,lossRecovery:true,invalidVaultRefused:true},null,2));
console.log('Complete recent receipt history, fee split, loss recovery and invalid vault refusal passed.');
