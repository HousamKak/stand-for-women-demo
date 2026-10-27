import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const input=path.join(root,'dist'),output=path.join(root,'pages-dist');
const name=process.argv[2]||'stand-for-women-demo';
if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name))throw new Error('Provide a valid repository name.');
const base='/'+name;
const rebase=value=>value===base||value.startsWith(base+'/')?value:base+value;
function copy(dir,relative=''){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const rel=path.join(relative,entry.name),source=path.join(dir,entry.name),target=path.join(output,rel);
  if(entry.isDirectory()){fs.mkdirSync(target,{recursive:true});copy(source,rel);continue;}
  if(!entry.isFile()||entry.name==='_redirects')continue;
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if(entry.name.endsWith('.html')){
   let html=fs.readFileSync(source,'utf8').replace(/\b(href|src)="(\/[^\"]*)"/g,(_,attr,value)=>`${attr}="${rebase(value)}"`);
   if(!html.includes('name="robots"'))html=html.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
   fs.writeFileSync(target,html);
  }else if(entry.name.endsWith('.css')){
   fs.writeFileSync(target,fs.readFileSync(source,'utf8').replace(/url\((['"]?)(\/[^\)'"\s]+)/g,(_,quote,value)=>`url(${quote}${rebase(value)}`));
  }else if(entry.name==='config.js'){
   const config=fs.readFileSync(source,'utf8');
   if(/mode\s*:\s*['"]production/.test(config))throw new Error('GitHub Pages publishing is configured for the sales demo only.');
   fs.writeFileSync(target,config+`\nwindow.SFW_CONFIG.basePath = ${JSON.stringify(base)};\n`);
  }else fs.copyFileSync(source,target);
 }
}
fs.mkdirSync(output,{recursive:true});copy(input);
fs.copyFileSync(path.join(output,'index.html'),path.join(output,'404.html'));
fs.writeFileSync(path.join(output,'.nojekyll'),'');
fs.writeFileSync(path.join(output,'robots.txt'),'User-agent: *\nDisallow: /\n');
console.log(`Pages artifact ready at ${output}. Base path: ${base}/`);
