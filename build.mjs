import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
fs.mkdirSync('dist',{recursive:true});
for(const file of ['index.html','app.js','style.css','config.js','favicon.svg'])fs.copyFileSync('src/'+file,'dist/'+file);
if(!fs.existsSync('dist/content.json'))throw new Error('Run python scripts/prepare_website_content.py from the workspace first.');
const content=JSON.parse(fs.readFileSync('dist/content.json','utf8'));
const routes=['about','programs','projects','partners','impact','get-involved','contact','admin',...content.projects.map(p=>'projects/'+p.slug)];
const html=fs.readFileSync('src/index.html','utf8');
for(const route of routes){
 const project=content.projects.find(p=>route==='projects/'+p.slug);
 const names={about:'Our story',programs:'What we do',projects:'Our projects',partners:'Our partners',impact:'Our impact','get-involved':'Get involved',contact:'Get in touch',admin:'Content Studio'};
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const title=escape(project?.title||names[route]||'Stand For Women');
 let page=html.replace(/<title>.*?<\/title>/,`<title>${title} — Stand For Women</title>`);
 if(project)page=page.replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${escape(project.description.slice(0,250))}">`);
 if(route==='admin')page=page.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
 fs.mkdirSync('dist/'+route,{recursive:true});fs.writeFileSync('dist/'+route+'/index.html',page);
}
fs.writeFileSync('dist/_redirects','/* /index.html 200\n');
fs.writeFileSync('dist/robots.txt','User-agent: *\nDisallow: /admin\n');
console.log(`Built ${routes.length+1} routes with ${content.projects.length} projects.`);
