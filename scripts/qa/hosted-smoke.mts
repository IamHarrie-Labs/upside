// A bounded, real TESTNET-only round trip. Never use a mainnet key here.
// Uses the previously supplied deployer to post one demo call and fund 0.20 test MON in a temporary
// follower. That follower key remains in memory. Leftover test MON is returned after settlement.
import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,createWalletClient,defineChain,http,parseEther,encodeFunctionData,parseEventLogs,formatEther} from '../../app/node_modules/viem/_esm/index.js';
import {privateKeyToAccount,generatePrivateKey} from '../../app/node_modules/viem/_esm/accounts/index.js';
import {CallBookAbi,FollowVaultAbi,DemoTokenAbi} from '../../app/src/abi.ts';
import {ensureVault,deposit,follow,close,getVaultState} from '../../mm-plugin/dist/core.js';
const d=JSON.parse(readFileSync('contracts/deployments/10143.json','utf8'));if(d.chainId!==10143||!d.demo)throw Error('Testnet demo deployment required');
const text=readFileSync('.env.deploy','utf8');const key=text.match(/^DEPLOYER_KEY\s*=\s*(?:0x)?([0-9a-fA-F]{64})\s*$/m)?.[1];if(!key)throw Error('No valid deployer key in ignored .env.deploy');
const caller=privateKeyToAccount(`0x${key}`);const follower=privateKeyToAccount(generatePrivateKey());
const chain=defineChain({id:10143,name:'Monad Testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:['https://testnet-rpc.monad.xyz']}}});
const rpcFetch:typeof fetch=async(...args)=>{for(let n=0;;n++){const r=await fetch(...args);if(n>=6||!(r.status===429||(r.ok&&(await r.clone().text()).includes('"code":-32011'))))return r;await new Promise(resolve=>setTimeout(resolve,500*2**n));}};
const transport=()=>http(undefined,{fetchFn:rpcFetch});const reader=createPublicClient({chain,transport:transport()});const callerWallet=createWalletClient({chain,account:caller,transport:transport()});const wallet=createWalletClient({chain,account:follower,transport:transport()});
if(await reader.getChainId()!==10143)throw Error('RPC chain mismatch');if(await reader.getBalance({address:caller.address})<parseEther('.50'))throw Error('Insufficient test MON reserve; no transaction sent');
const transactions:any[]=[];const record=async(hash:any,label:string)=>{const r=await reader.waitForTransactionReceipt({hash});if(r.status!=='success')throw Error(`Reverted ${label}`);transactions.push({label,hash,block:Number(r.blockNumber),url:`https://testnet.monadvision.com/tx/${hash}`});await new Promise(resolve=>setTimeout(resolve,2000));return r;};
const api='https://keeper.38.49.210.22.sslip.io';await fetch(`${api}/poke`,{method:'POST'});
let mid:bigint|undefined;for(let i=0;i<10&&!mid;i++){try{mid=await reader.readContract({address:d.priceSource,abi:[{type:'function',name:'midPrice',stateMutability:'view',inputs:[{type:'address'},{type:'address'}],outputs:[{type:'uint256'}]}],functionName:'midPrice',args:[d.base,d.settlement]}) as bigint;}catch{await new Promise(resolve=>setTimeout(resolve,4000));}}if(!mid)throw Error('Keeper price unavailable; no transaction sent');
await record(await callerWallet.writeContract({address:d.callBook,abi:CallBookAbi,functionName:'postCall',args:[d.base,d.settlement,0,mid*103n/100n,mid*98n/100n,2000,180]} as any),'post demo call');
const callId=Number(await reader.readContract({address:d.callBook,abi:CallBookAbi,functionName:'callCount'}))-1;
await record(await callerWallet.sendTransaction({to:follower.address,value:parseEther('.20')}),'fund follower with 0.20 test MON');
// Read propagation can lag a newly confirmed funding transaction. Also avoid an unnecessarily high
// EIP-1559 maximum fee reserve on tiny test accounts: use the RPC's current legacy gas price.
for(let n=0;n<15;n++){if(await reader.getBalance({address:follower.address})>=parseEther('.20'))break;await new Promise(resolve=>setTimeout(resolve,1000));}
const checkpoint=()=>writeFileSync('docs/design/hosted-testnet-progress.json',JSON.stringify({chainId:10143,demo:true,callId,follower:follower.address,transactions},null,2));checkpoint();
const host:any={chainId:10143,d,read:reader,account:follower.address,keeperApi:api,submit:async(tx:any,label:string)=>{const hash=await wallet.sendTransaction({...tx,gasPrice:await reader.getGasPrice()});await record(hash,label);checkpoint();return {hash,status:'confirmed'};}};
try {
const {vault}=await ensureVault(host,50000000n);await deposit(host,vault,10000000n);
const call:any={id:callId,caller:caller.address,feeBps:2000};await follow(host,vault,call,10000000n);
const position=(await getVaultState(host,vault)).positions[0];const result=await close(host,vault,position);
const closeReceipt=await reader.getTransactionReceipt({hash:result.hash});const closed:any=parseEventLogs({abi:FollowVaultAbi,logs:closeReceipt.logs,eventName:'Closed'})[0];if(!closed)throw Error('Missing settlement event');
const state=await getVaultState(host,vault);if(state.openCost!==0n)throw Error('Position remains open');
await record(await wallet.writeContract({address:vault,abi:FollowVaultAbi,functionName:'withdraw',args:[d.settlement,state.cash,follower.address],gasPrice:await reader.getGasPrice()} as any),'withdraw test AUSD');
const withdrawn=await reader.readContract({address:d.settlement,abi:DemoTokenAbi,functionName:'balanceOf',args:[follower.address]});if(withdrawn!==state.cash)throw Error('Withdrawal differs from vault cash');
const balance=await reader.getBalance({address:follower.address});const gasPrice=await reader.getGasPrice();const reserve=21000n*gasPrice;if(balance>reserve)await record(await wallet.sendTransaction({to:caller.address,value:balance-reserve,gas:21000n,gasPrice}),'return remaining test MON');
const event=Object.fromEntries(Object.entries(closed.args).map(([k,v])=>[k,typeof v==='bigint'?String(v):v]));
writeFileSync('docs/design/hosted-testnet-results.json',JSON.stringify({date:new Date().toISOString(),chainId:10143,demo:true,venue:'DemoRouter',price:'Keeper-generated demo prices',realMarketTrade:false,physicalPhone:false,metamaskHost:false,callId,caller:caller.address,follower:follower.address,vault,settlement:event,withdrawn:String(withdrawn),followerGasRemaining:formatEther(await reader.getBalance({address:follower.address})),transactions},null,2));
console.log(`Hosted testnet round trip passed: call ${callId}, vault ${vault}. Proof saved; no private key saved.`);
} finally {
  // Best-effort recovery even when an intermediate test fails; retain public progress for diagnosis.
  checkpoint();
  const remaining=await reader.getBalance({address:follower.address});const price=await reader.getGasPrice();
  if(remaining>21000n*price) {try{await record(await wallet.sendTransaction({to:caller.address,value:remaining-21000n*price,gas:21000n,gasPrice:price}),'recover remaining test MON');checkpoint();}catch{console.warn('Testnet gas recovery unavailable; inspect the public progress record.');}}
}
