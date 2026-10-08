import {parseAbi,decodeEventLog} from "viem";
import {deployment,publicClient} from "./env.js";
import {receiptSnapshot} from "./flow.js";
const abi=parseAbi(['function owner() view returns(address)','function vaultOf(address) view returns(address)','function positionCount() view returns(uint256)','function getPosition(uint256) view returns((uint256 callId,address caller,address base,uint256 baseAmount,uint256 cost,bool open))','event Closed(uint256 indexed positionId,uint256 indexed callId,address indexed caller,uint256 proceeds,int256 pnl,uint256 callerFee,uint256 protocolFee)']);
const cache=new Map<string,{at:number;result:any}>();const running=new Map<string,Promise<any>>();
type Scan={at:number;expected:number;head:bigint;anchor:string;next:bigint;rows:any[]};
const scans=new Map<string,Scan>();
/** Bounded, resumable vault backfill. No partial fee history is presented as complete. */
export async function receiptsFor(vault:string) {
  const key=vault.toLowerCase();const hit=cache.get(key);if(hit&&Date.now()-hit.at<10_000)return hit.result;
  if(running.has(key))return running.get(key)!;
  if(running.size>=8)throw Error('Receipt service busy; retry shortly');
  const task=(async()=>{
    const read=(address:any,functionName:any,args:any[]=[])=>publicClient.readContract({address,abi,functionName,args} as any);
    const owner=await read(vault,'owner') as string;
    if(String(await read(deployment.factory,'vaultOf',[owner])).toLowerCase()!==key) throw Error('Not an Upside factory vault');
    const count=Number(await read(vault,'positionCount'));
    if(count>50)return {...receiptSnapshot(vault),complete:false};
    let expected=0;for(let id=0;id<count;id++){const position:any=await read(vault,'getPosition',[BigInt(id)]);if(!position.open)expected++;}
    const indexed=receiptSnapshot(vault);
    if(indexed.receipts.length===expected){scans.delete(key);return {...indexed,complete:true};}
    for(const [k,v]of scans)if(Date.now()-v.at>300_000)scans.delete(k);
    let scan=scans.get(key);
    if(scan&&(scan.expected!==expected||(await publicClient.getBlock({blockNumber:scan.head})).hash!==scan.anchor)){scans.delete(key);scan=undefined;}
    if(!scan){
      if(scans.size>=256)throw Error('Receipt backfill busy; retry shortly');
      const head=await publicClient.getBlockNumber({cacheTime:0});
      const anchor=(await publicClient.getBlock({blockNumber:head})).hash;
      if(!anchor)throw Error('Receipt block unavailable');
      scan={at:Date.now(),expected,head,anchor,next:head,rows:[]};scans.set(key,scan);
    }
    const floor=BigInt(deployment.startBlock);
    for(let chunks=0;scan.next>=floor&&chunks<20&&scan.rows.length<expected;chunks++){
      const end=scan.next,start=end-99n>floor?end-99n:floor;
      const logs=await publicClient.getLogs({address:vault as any,event:abi.find(e=>e.type==='event') as any,fromBlock:start,toBlock:end});
      const rows=logs.filter(l=>!l.removed).map(l=>{const ev:any=decodeEventLog({abi,data:l.data,topics:l.topics as any});return {...Object.fromEntries(Object.entries(ev.args).map(([k,v])=>[k,typeof v==='bigint'?String(v):v])),hash:l.transactionHash,block:Number(l.blockNumber),logIndex:l.logIndex};});
      scan.rows.push(...rows);scan.next=start-1n;scan.at=Date.now();
    }
    if(scan.rows.length!==expected)return {...indexed,complete:false};
    scan.rows.sort((a,b)=>a.block-b.block||a.logIndex-b.logIndex);
    return {cursor:Number(scan.head)+1,receipts:scan.rows,complete:true};
  })();running.set(key,task);
  try{const result=await task;for(const [k,v]of cache)if(Date.now()-v.at>60_000)cache.delete(k);if(cache.size<256)cache.set(key,{at:Date.now(),result});return result;}finally{running.delete(key);}
}
