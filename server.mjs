import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(fileURLToPath(new URL('.',import.meta.url)),process.env.SFW_STATIC_DIR||'dist');
const basePath=(process.env.SFW_BASE_PATH||'').replace(/\/$/,'');
const port = Number(process.env.PORT || 5173);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.pdf':'application/pdf'};
http.createServer((req,res)=>{
  let name;
  try {name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400).end();return;}
  if(basePath){if(name===basePath)name='/';else if(name.startsWith(basePath+'/'))name=name.slice(basePath.length);else {res.writeHead(404).end('Not found');return;}}
  let file = path.resolve(root,'.'+name);
  if(file!==root && !file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
  if(!fs.existsSync(file)){if(path.extname(name)){res.writeHead(404).end('Not found');return;}file=path.join(root,'index.html');}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
  fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}${basePath}/`));
