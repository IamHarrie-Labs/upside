import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,http} from '../../app/node_modules/viem/_esm/index.js';
import {HandlesAbi,VaultFactoryAbi,FollowVaultAbi,DemoTokenAbi} from '../../app/src/abi.ts';
const d=JSON.parse(readFileSync('contracts/deployments/31337.json','utf8'));assert.equal(d.chainId,31337);
const owner='0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const pub=createPublicClient({transport:http('http://127.0.0.1:8547')});
const read=(address:any,abi:any,functionName:string,args:any[]=[])=>pub.readContract({address,abi,functionName,args} as any);
assert.equal(await pub.getChainId(),31337);
const vault=await read(d.factory,VaultFactoryAbi,'vaultOf',[owner]);
const {chromium}=createRequire(import.meta.url)('C:/Users/Harrie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
await page.route('**/*',async(r:any)=>r.request().url().includes(':8788')?r.fulfill({json:{markets:[],mode:'off',ok:true,flow:{}}}):r.continue());
const checks:string[]=[];
async function done(text:string){await page.getByRole('status').filter({hasText:text+'. Done.'}).waitFor();await page.getByRole('button',{name:'Dismiss notification'}).click();}
try {
  await page.goto('http://127.0.0.1:5173/');
  for(const [label,id] of [['How it works','how-it-works'],['Fees','fees']]){await page.getByRole('navigation',{name:'About Upside'}).getByRole('link',{name:label,exact:true}).click();assert.equal(new URL(page.url()).hash,'#'+id);assert.equal(await page.locator('#'+id).count(),1);}
  checks.push('Landing anchor links reach existing sections');
  await page.goto('http://127.0.0.1:5173/dashboard/profile');await page.getByRole('button',{name:'Local account 3'}).click();
  await page.getByLabel('Public name',{exact:true}).waitFor();await page.waitForTimeout(500);
  for(const name of ['qa_follower_v3','femi']){await page.getByLabel('Public name',{exact:true}).fill(name);await page.getByRole('button',{name:'Save public name'}).click();await done('Saving handle');assert.equal(await read(d.handles,HandlesAbi,'handleOf',[owner]),name);await page.waitForFunction(name=>(document.querySelector('[aria-label="Public name"]') as HTMLInputElement)?.value===name,name);await page.waitForTimeout(500);}
  checks.push('Profile changes persist onchain and update account name');
  await page.getByRole('button',{name:'Vault',exact:true}).click();await page.getByRole('button',{name:'Trading limit',exact:true}).click();await page.getByLabel('Trading limit (AUSD)').fill('777');await page.getByRole('button',{name:'Save trading limit'}).click();await done('Updating trading limit');assert.equal(await read(vault,FollowVaultAbi,'maxExposure'),777000000n);checks.push('Trading limit saves onchain');
  await page.getByRole('button',{name:'Funding',exact:true}).click();
  await page.getByRole('button',{name:'Copy account address'}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).toLowerCase(),owner.toLowerCase());
  await page.getByRole('button',{name:'Copy vault address'}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).toLowerCase(),vault.toLowerCase());checks.push('Both funding addresses copy correctly');
  const cash=await read(d.settlement,DemoTokenAbi,'balanceOf',[vault]);await page.getByRole('button',{name:'Add 500 test AUSD',exact:true}).click();await done('Adding 500 test AUSD');assert.equal(await read(d.settlement,DemoTokenAbi,'balanceOf',[vault]),cash+500000000n);
  const balance=await read(d.settlement,DemoTokenAbi,'balanceOf',[owner]);await page.getByLabel('Funding withdrawal amount').fill('1');await page.getByRole('button',{name:'Withdraw to my account',exact:true}).click();await done('Withdrawing cash');assert.equal(await read(d.settlement,DemoTokenAbi,'balanceOf',[owner]),balance+1000000n);checks.push('Funding faucet and withdrawal match actual token balances');
  assert.deepEqual(errors,[]);
  writeFileSync('docs/design/account-actions-results.json',JSON.stringify({date:new Date().toISOString(),chainId:31337,realLocalTransactions:true,realFundsUsed:false,checks,runtimeErrors:errors},null,2));console.log(JSON.stringify({checks,runtimeErrors:errors}));
} finally {await browser.close();}
