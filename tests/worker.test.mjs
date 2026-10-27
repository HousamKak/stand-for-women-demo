import test, {beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const origin='https://standforwomen.org';
const makeEnv=()=>({ALLOWED_ORIGINS:origin,SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',PREVIEW_SIGNING_SECRET:'test-only-signing-secret-at-least-32-characters'});
const req=(path,options={})=>new Request('https://api.example.test'+path,options);
let realFetch;
beforeEach(()=>{realFetch=global.fetch;global.fetch=async()=>Response.json([]);});
afterEach(()=>{global.fetch=realFetch;});

test('untrusted origins are rejected before any side effects',async()=>{
 const r=await worker.fetch(req('/api/media',{method:'POST',headers:{Origin:'https://evil.test'}}),makeEnv());assert.equal(r.status,403);
});
test('trusted preflight gets an exact CORS origin',async()=>{
 const r=await worker.fetch(req('/api/media',{method:'OPTIONS',headers:{Origin:origin}}),makeEnv());assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
});
test('anonymous uploads fail closed',async()=>{
 const r=await worker.fetch(req('/api/media',{method:'POST'}),makeEnv());assert.equal(r.status,401);
});
test('a valid Supabase user without admin membership cannot upload',async()=>{
 const before=global.fetch;global.fetch=async url=>String(url).includes('/auth/v1/user')?Response.json({id:'test-user'}):Response.json([]);
 try{const r=await worker.fetch(req('/api/media',{method:'POST',headers:{Authorization:'Bearer valid-user'}}),makeEnv());assert.equal(r.status,403);}finally{global.fetch=before;}
});
test('private objects are not readable without authorization',async()=>{
 const env={...makeEnv(),MEDIA:{get:async()=>({customMetadata:{status:'draft'}})}};
 const r=await worker.fetch(req('/media/12345678-1234-1234-1234-123456789abc.jpg'),env);assert.equal(r.status,404);
});
test('expired and fabricated preview signatures cannot expose drafts',async()=>{
 const env={...makeEnv(),MEDIA:{get:async()=>({customMetadata:{status:'draft'}})}};
 for(const expires of [1,Math.floor(Date.now()/1000)+100]){
   const r=await worker.fetch(req(`/media/12345678-1234-1234-1234-123456789abc.jpg?expires=${expires}&signature=${'a'.repeat(64)}`),env);assert.equal(r.status,404);
 }
});
test('published files are readable and not cached past unpublishing',async()=>{
 global.fetch=async()=>Response.json([{id:'published-reference'}]);
 const env={...makeEnv(),MEDIA:{get:async()=>({customMetadata:{status:'published'},writeHttpMetadata:h=>h.set('Content-Type','image/jpeg'),httpEtag:'etag',body:new Uint8Array([1,2,3])})}};
 const r=await worker.fetch(req('/media/12345678-1234-1234-1234-123456789abc.jpg'),env);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');
});
test('R2 metadata alone cannot expose media when no published database row references it',async()=>{
 const env={...makeEnv(),MEDIA:{get:async()=>({customMetadata:{status:'published'}})}};
 const r=await worker.fetch(req('/media/12345678-1234-1234-1234-123456789abc.jpg'),env);assert.equal(r.status,404);
});
test('a database failure does not expose files',async()=>{
 global.fetch=async()=>{throw new Error('database unavailable');};
 const env={...makeEnv(),MEDIA:{get:async()=>({customMetadata:{status:'published'}})}};
 const r=await worker.fetch(req('/media/12345678-1234-1234-1234-123456789abc.jpg'),env);assert.equal(r.status,404);
});
test('public contact endpoint requires configured storage and rate limiting',async()=>{
 const r=await worker.fetch(req('/api/contact',{method:'POST'}),makeEnv());assert.equal(r.status,503);
});
test('contact rate limits run before insertion',async()=>{
 const env={...makeEnv(),SUPABASE_SERVICE_ROLE_KEY:'server-only-test-key',CONTACT_RATE_LIMIT:{limit:async()=>({success:false})}};
 const r=await worker.fetch(req('/api/contact',{method:'POST'}),env);assert.equal(r.status,429);
});
test('invalid contact content is rejected without database access',async()=>{
 const env={...makeEnv(),SUPABASE_SERVICE_ROLE_KEY:'server-only-test-key',CONTACT_RATE_LIMIT:{limit:async()=>({success:true})}};
 const r=await worker.fetch(req('/api/contact',{method:'POST',body:JSON.stringify({firstName:'A',lastName:'B',email:'not-an-email',interest:'general',message:'Hello'})}),env);assert.equal(r.status,400);
});
test('validated inquiries are saved through a server-only credential',async()=>{
 const before=global.fetch;let saved;
 global.fetch=async(url,options)=>{saved=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer server-only-test-key');return new Response(null,{status:201});};
 try{
  const env={...makeEnv(),SUPABASE_SERVICE_ROLE_KEY:'server-only-test-key',CONTACT_RATE_LIMIT:{limit:async()=>({success:true})}};
  const r=await worker.fetch(req('/api/contact',{method:'POST',body:JSON.stringify({firstName:' Jane ',lastName:'Doe',email:'jane@example.com',interest:'volunteer',message:'I would like to volunteer.'})}),env);
  assert.equal(r.status,201);assert.equal(saved.first_name,'Jane');assert.equal(saved.interest,'volunteer');
 }finally{global.fetch=before;}
});
