import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('C:/Users/Harrie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const baseUrl=process.env.UPSIDE_WEB_URL ?? 'http://127.0.0.1:5173';
const context=await browser.newContext();
await context.addInitScript(() => {
  (window as any).__name=(fn:any)=>fn;
  (window as any).ceremonies=[];
  (window as any).passkeyMode='success';
  const result=()=>({type:'public-key',rawId:new Uint8Array([1,2,3]).buffer,response:{getTransports:()=>['internal']},getClientExtensionResults:()=>({prf:{enabled:true,...((window as any).passkeyMode==='no-prf'?{}:{results:{first:new Uint8Array(32).fill(7).buffer}})}})});
  Object.defineProperty(navigator.credentials,'create',{value:async()=>{
    (window as any).ceremonies.push({kind:'create'});
    if((window as any).passkeyMode==='cancel')throw new DOMException('Cancelled','NotAllowedError');
    return result();
  }});
  Object.defineProperty(navigator.credentials,'get',{value:async(options:any)=>{
    (window as any).ceremonies.push({kind:'get',restricted:!!options.publicKey.allowCredentials});
    if((window as any).passkeyMode==='cancel')throw new DOMException('Cancelled','NotAllowedError');
    return result();
  }});
});
let writes=0;
await context.route('**/*',async(route:any)=>{
  if(/:8547|:8788|testnet-rpc\.monad\.xyz|keeper\.38\.49\.210\.22\.sslip\.io/.test(route.request().url())) {
    if(/:8788|keeper\.38/.test(route.request().url()))return route.fulfill({json:{mode:'off',markets:[],flow:{}}});
    const req=route.request().postDataJSON();
    const handle=(r:any)=>{
      if(/send/.test(r.method))writes++;
      return {jsonrpc:'2.0',id:r.id,error:{code:-32000,message:'Read unavailable in authentication-only test'}};
    };
    return route.fulfill({json:Array.isArray(req)?req.map(handle):handle(req)});
  }
  await route.continue();
});
const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
const checks:string[]=[];
try {
  await page.goto(baseUrl+'/signin');
  await page.evaluate(()=>{(window as any).passkeyMode='cancel';});
  await page.getByRole('button',{name:'Continue with passkey',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'cancelled or timed out'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Continue with passkey',exact:true}).isEnabled(),true);checks.push('Cancellation preserves sign-in and permits retry');
  await page.evaluate(()=>{(window as any).passkeyMode='no-prf';});
  await page.getByRole('button',{name:'Continue with passkey',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'PRF'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('upside.passkey.credentialId')),null);checks.push('Unsupported PRF cannot create an account or remember a credential');
  await page.evaluate(()=>{localStorage.setItem('upside.passkey.credentialId','c3RhbGU');});
  await page.goto(baseUrl+'/dashboard/profile');
  await page.evaluate(()=>{(window as any).passkeyMode='success';});
  await page.getByRole('button',{name:'Choose another existing passkey',exact:true}).click();
  await page.waitForURL('**/dashboard/profile');
  assert.equal(await page.evaluate(()=> (window as any).ceremonies.at(-1).restricted),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('upside.passkey.credentialId')),'AQID');
  const firstAddress=await page.locator('.account-popover code').textContent();
  checks.push('Stale credential can be replaced through discoverable sign-in; selected reference saved');
  await page.getByLabel('Open account menu').click();await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Continue with passkey',exact:true}).click();
  await page.waitForURL('**/dashboard/calls');
  assert.equal(await page.locator('.account-popover code').textContent(),firstAddress);
  assert.equal(await page.evaluate(()=> (window as any).ceremonies.at(-1).restricted),true);
  checks.push('Same PRF restores the same signing account after sign-out');
  assert.deepEqual(errors,[]);assert.equal(writes,0);
  writeFileSync(!baseUrl.includes('127.0.0.1')?'docs/design/hosted-passkey-qa-results.json':'docs/design/passkey-qa-results.json',JSON.stringify({date:new Date().toISOString(),url:baseUrl,checks,runtimeErrors:errors,transactionWrites:writes,scope:'Simulated WebAuthn credential responses through real Mera derivation and session code. No physical authenticator or transaction broadcast.'},null,2));
  console.log(JSON.stringify({checks,runtimeErrors:errors,transactionWrites:writes}));
} finally {await browser.close();}
