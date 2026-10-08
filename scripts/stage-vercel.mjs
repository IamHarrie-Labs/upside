import {cpSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,relative} from 'node:path';
// Build locally first. The build output API deploys exactly the reviewed static artifact, including
// contract deployments imported from the repository, without uploading secrets or private source files.
const project=resolve('app'),target=resolve(project,'.vercel/output/static');
if(relative(project,target)!=='.vercel\\output\\static'&&relative(project,target)!=='.vercel/output/static')throw Error('Unexpected staging directory');
rmSync(target,{recursive:true,force:true});
mkdirSync(target,{recursive:true});
cpSync('app/dist',target,{recursive:true});
writeFileSync('app/.vercel/output/config.json',JSON.stringify({version:3,routes:[{src:'^/\\.well-known/(assetlinks\\.json|apple-app-site-association)$',headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=300'},continue:true},{handle:'filesystem'},{src:'/(.*)',dest:'/index.html'}]},null,2));
console.log('Staged reviewed Vite output for vercel deploy --prebuilt.');
