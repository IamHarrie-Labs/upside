import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const current='https://onlyupside.xyz',legacy='https://upside-monad.vercel.app';
const checks:string[]=[];
for(const host of [current,legacy]){
  const root=await fetch(host,{redirect:'manual'});assert.equal(root.status,200);assert.equal(root.headers.get('location'),null);
  const association=await fetch(host+'/.well-known/assetlinks.json',{redirect:'manual'});assert.equal(association.status,200);assert.match(association.headers.get('content-type')??'',/application\/json/);const apps=await association.json();assert.equal(apps[0].target.package_name,'xyz.upside.app');assert.match(apps[0].target.sha256_cert_fingerprints[0],/^15:93:64:/);
  const apple=await fetch(host+'/.well-known/apple-app-site-association');assert.equal(apple.status,200);assert.deepEqual((await apple.json()).webcredentials.apps,[]);
  const preflight=await fetch('https://keeper.38.49.210.22.sslip.io/flow',{method:'OPTIONS',headers:{Origin:host,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});assert.equal(preflight.status,200);assert.equal(preflight.headers.get('access-control-allow-origin'),host);assert.match(preflight.headers.get('access-control-allow-methods')??'',/POST/);
  checks.push(host+': direct service, genuine Android association, honest Apple placeholder and keeper preflight');
}
const bad=await fetch('https://keeper.38.49.210.22.sslip.io/flow',{headers:{Origin:'https://untrusted.example'}});assert.equal(bad.status,403);checks.push('Unknown browser origin rejected');
const {chromium}=createRequire(import.meta.url)('C:/Users/Harrie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:390,height:844}});const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
try {
  await page.goto(current+'/dashboard/vault');await page.waitForURL(current+'/signin?next=*');
  const link=page.getByRole('link',{name:'Use your original account',exact:true});assert.equal(new URL(await link.getAttribute('href')).searchParams.get('next'),'/dashboard/vault');
  await link.click();await page.waitForURL(legacy+'/signin?next=*');await page.getByRole('button',{name:'Continue with passkey',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('next'),'/dashboard/vault');checks.push('Legacy sign-in link preserves original domain and requested destination');
  await page.getByRole('link',{name:'Start on onlyupside.xyz',exact:true}).click();await page.waitForURL(current+'/signin');await page.getByRole('button',{name:'Continue with passkey',exact:true}).waitFor();checks.push('New-account link returns to custom domain');
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  assert.deepEqual(errors,[]);writeFileSync('docs/design/domain-migration-results.json',JSON.stringify({date:new Date().toISOString(),checks,runtimeErrors:errors,hardwarePasskeysVerified:false,scope:'Real hosting, associations, CORS and browser account links; no credentials created or transactions sent.'},null,2));console.log(JSON.stringify({checks,runtimeErrors:errors}));
}finally{await browser.close();}
