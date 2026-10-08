import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Harrie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const t=JSON.parse(readFileSync('brand/tokens.json','utf8'));
const mark=`<path d="M6 23C6 14 10 9 18 8V13C14 14 12 16 12 20H18V31H6V23ZM23 23C23 14 27 9 35 8V13C31 14 29 16 29 20H35V31H23V23Z" fill="${t.accent}"/>`;
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
