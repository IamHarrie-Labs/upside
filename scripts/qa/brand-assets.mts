import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Harrie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const t=JSON.parse(readFileSync('brand/tokens.json','utf8'));
const mark=`<path d="M7 30V22L17 13V23L30 10" stroke="${t.accent}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M23 10H31V18" stroke="${t.accent}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="9" cy="34" r="2" fill="${t.accent}"/>`;
const svg=(solid=true)=>`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64">${solid?`<rect width="64" height="64" rx="14" fill="${t.bg}"/>`:''}<g transform="translate(12 10)">${mark}</g></svg>`;
writeFileSync('app/public/favicon.svg',svg());
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});const p=await b.newPage({viewport:{width:512,height:512}});
for(const [size,paths,solid] of [[512,['app/public/icon-512.png','app/public/icon-maskable-512.png'],true],[1024,['mobile/assets/icon.png'],true],[192,['app/public/icon-192.png'],true],[180,['app/public/apple-touch-icon.png'],true],[64,['mobile/assets/favicon.png'],true],[1024,['mobile/assets/android-icon-foreground.png'],false],[96,['mobile/assets/brand-mark.png'],false]]){
 await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg(solid as boolean)}`);for(const path of paths as string[])await p.locator('svg').screenshot({path,omitBackground:!solid});
}
await p.setViewportSize({width:1024,height:1024});
await p.setContent(`<style>html,body{margin:0}svg{display:block;width:1024px;height:1024px}</style>${svg(false).replaceAll(t.accent,t.ink)}`);await p.locator('svg').screenshot({path:'mobile/assets/android-icon-monochrome.png',omitBackground:true});
await p.setContent(`<style>html,body{margin:0}</style><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${t.bg}"/></svg>`);await p.locator('svg').screenshot({path:'mobile/assets/android-icon-background.png'});
await b.close();console.log('Exported original brand assets.');
