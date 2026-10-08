import {existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync} from "node:fs";
import {dirname} from "node:path";
import {parseUnits, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {x402Client,x402HTTPClient} from "@x402/core/client";
import {registerExactEvmScheme} from "@x402/evm/exact/client";

const NETWORK="eip155:143", USDC="0x754704bc059f8c67012fed69bc8a327a5aafb603";
export function validateOffer(offer:any,maxUsd:number) {
  if(!Number.isFinite(maxUsd)||maxUsd<0) throw Error("Invalid intelligence price cap");
  if(offer?.scheme!=="exact"||offer.network!==NETWORK||String(offer.asset).toLowerCase()!==USDC) throw Error("Only exact Monad USDC payments are allowed");
  if(!/^0x[0-9a-fA-F]{40}$/.test(offer.payTo)||!/^\d+$/.test(String(offer.amount))||!Number.isSafeInteger(offer.maxTimeoutSeconds)||offer.maxTimeoutSeconds<1||offer.maxTimeoutSeconds>300) throw Error("Invalid payment offer");
  const amount=BigInt(offer.amount);
  if(amount>parseUnits(maxUsd.toFixed(6),6)) throw Error("Intelligence request exceeds price cap");
  return amount;
}
export function reserveBudget(path:string,amount:bigint,cap:number,day=new Date().toISOString().slice(0,10)) {
  if(!Number.isFinite(cap)||cap<0||amount<0n) throw Error("Invalid intelligence budget");
  let state={day,reserved:"0"};
  if(existsSync(path)) {
    try {state=JSON.parse(readFileSync(path,"utf8"));}catch{throw Error("Unreadable intelligence ledger; payment refused");}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(state.day)||!/^\d+$/.test(state.reserved)) throw Error("Malformed intelligence ledger; payment refused");
  }
  if(state.day!==day) state={day,reserved:"0"};
  const reserved=BigInt(state.reserved)+amount;
  if(reserved>parseUnits(cap.toFixed(6),6)) throw Error("Daily USDC intelligence allowance reached");
  mkdirSync(dirname(path),{recursive:true});
  const temp=`${path}.${process.pid}.tmp`;
  writeFileSync(temp,JSON.stringify({day,reserved:String(reserved)}),{mode:0o600});renameSync(temp,path);
}
/** Reserve before signing. Failed/uncertain authorization stays reserved; no automatic budget refund. */
export async function paidNansen(url:string,init:RequestInit) {
  const path=process.env.NANSEN_STATE;
  if(!path) throw Error("NANSEN_STATE is required for paid intelligence");
  mkdirSync(dirname(path),{recursive:true});
  const fd=openSync(`${path}.lock`,"wx",0o600);
  try {
    const request={...init,signal:AbortSignal.timeout(30_000)};
    const first=await fetch(url,request);
    if(first.status!==402) return first;
    const account=privateKeyToAccount((process.env.NANSEN_PAY_KEY??process.env.KEEPER_KEY) as Hex);
    const client=new x402Client();registerExactEvmScheme(client,{signer:account,networks:[NETWORK]});
    const http=new x402HTTPClient(client);
    const required=http.getPaymentRequiredResponse(n=>first.headers.get(n),await first.clone().json().catch(()=>undefined));
    const offer=required.accepts.find(a=>a.network===NETWORK);
    const amount=validateOffer(offer,Number(process.env.NANSEN_MAX_PRICE??0.10));
    reserveBudget(path,amount,Number(process.env.NANSEN_DAILY_USDC??1));
    const payload=await http.createPaymentPayload({...required,accepts:[offer!]});
    const res=await fetch(url,{...request,headers:{...Object.fromEntries(new Headers(init.headers).entries()),...http.encodePaymentSignatureHeader(payload)}});
    if(!res.ok) throw Error(`Paid intelligence returned ${res.status}; authorization remains reserved`);
    const settlement=http.getPaymentSettleResponse(n=>res.headers.get(n));
    if(!settlement?.success) throw Error("Intelligence payment settlement is unconfirmed; authorization remains reserved");
    console.log(`Nansen settlement confirmed: ${settlement.transaction??"receipt without transaction"}`);
    return res;
  } finally {closeSync(fd);unlinkSync(`${path}.lock`);}
}
