import fs from 'node:fs';
import crypto from 'node:crypto';
const content=JSON.parse(fs.readFileSync('dist/content.json','utf8'));
function uuid(key){const s=crypto.createHash('sha256').update('stand-for-women-v1:'+key).digest('hex').slice(0,32);return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;}
const rows=['projects','partners','reports','testimonials','team'].flatMap(kind=>(content[kind]||[]).map((item,index)=>({
 id:uuid(kind+':'+(item.id||index)),kind,title:item.title||item.name||'Untitled',slug:item.slug||null,status:item.status||'published',data:item
})));
if(!process.argv.includes('--apply')){console.log(`Dry run: ${rows.length} entries. Run with --apply only after configuring the target and reviewing the data.`);process.exit(0);}
const url=process.env.SFW_SUPABASE_URL,key=process.env.SFW_SUPABASE_SERVICE_ROLE_KEY;
if(!url?.startsWith('https://')||!key)throw new Error('Set SFW_SUPABASE_URL and SFW_SUPABASE_SERVICE_ROLE_KEY in your process environment.');
const response=await fetch(url+'/rest/v1/content_entries?on_conflict=id',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rows)});
if(!response.ok)throw new Error(`Import failed with HTTP ${response.status}. Check database schema and server logs.`);
console.log(`Imported ${rows.length} entries. No credentials were saved.`);
