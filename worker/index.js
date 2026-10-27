const MAX_UPLOAD = 30 * 1024 * 1024;
const MIME = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const encoder = new TextEncoder();
const json = (value, status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail = (status,message) => {throw Object.assign(new Error(message),{status});};
const keyPattern = /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

async function admin(request,env){
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))fail(401,'Please sign in.');
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:authorization};
  const userRes=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers});
  if(!userRes.ok)fail(401,'Your session has expired. Please sign in again.');
  const user=await userRes.json();
  if(!user.id)fail(401,'Invalid session.');
  const membership=await fetch(env.SUPABASE_URL+'/rest/v1/admins?select=user_id&user_id=eq.'+encodeURIComponent(user.id),{headers});
  if(!membership.ok || !(await membership.json()).length)fail(403,'Content administrator access is required.');
  return user;
}
async function signingKey(env){if(!env.PREVIEW_SIGNING_SECRET || env.PREVIEW_SIGNING_SECRET.length<32)fail(503,'Private media previews are not configured.');return crypto.subtle.importKey('raw',encoder.encode(env.PREVIEW_SIGNING_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function previewUrl(key,request,env){
  const expires=Math.floor(Date.now()/1000)+300;
  const signature=await crypto.subtle.sign('HMAC',await signingKey(env),encoder.encode(`${key}:${expires}`));
  const hex=Array.from(new Uint8Array(signature),x=>x.toString(16).padStart(2,'0')).join('');
  return `${new URL(request.url).origin}/media/${key}?expires=${expires}&signature=${hex}`;
}
async function validPreview(url,key,env){
  const exp=url.searchParams.get('expires'),sig=url.searchParams.get('signature');
  if(!/^\d+$/.test(exp||'') || Number(exp)<Date.now()/1000 || Number(exp)>Date.now()/1000+310 || !/^[a-f0-9]{64}$/.test(sig||''))return false;
  const bytes=Uint8Array.from(sig.match(/.{2}/g),x=>parseInt(x,16));
  return crypto.subtle.verify('HMAC',await signingKey(env),bytes,encoder.encode(`${key}:${exp}`));
}
async function publishedReference(key,env){
  const query=new URLSearchParams({select:'id',status:'eq.published','data->>media_key':'eq.'+key,limit:'1'});
  try{
    const response=await fetch(env.SUPABASE_URL+'/rest/v1/content_entries?'+query,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(5000)});
    return response.ok && (await response.json()).length>0;
  }catch{return false;}
}
function validMagic(buffer,type){
  const b=new Uint8Array(buffer),ascii=(start,end)=>new TextDecoder().decode(b.slice(start,end));
  return type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:
    type==='image/png'?b[0]===137&&ascii(1,4)==='PNG':
    type==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':
    type==='application/pdf'?ascii(0,5)==='%PDF-':false;
}
async function limitedBody(request,limit){
  const length=Number(request.headers.get('Content-Length'));
  if(length>limit)fail(413,'The file or message is too large.');
  const reader=request.body?.getReader();
  if(!reader)return new ArrayBuffer(0);
  const chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();fail(413,'The file or message is too large.');}chunks.push(value);}
  const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}return data.buffer;
}
async function parseBody(request,limit=15000){try{return JSON.parse(new TextDecoder().decode(await limitedBody(request,limit)));}catch(error){if(error.status)throw error;fail(400,'Invalid request.');}}

export async function handleRequest(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path.startsWith('/media/')){
    if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed.'},405);
    const key=path.slice(7);if(!keyPattern.test(key))return json({error:'Not found.'},404);
    const object=await env.MEDIA.get(key);if(!object)return json({error:'Not found.'},404);
    // Database publication, evaluated through anonymous RLS, is authoritative.
    // Changing R2 metadata before a failed database save cannot expose a draft.
    if(!(await publishedReference(key,env)) && !(await validPreview(url,key,env))){
      try{await admin(request,env);}catch{return json({error:'Not found.'},404);}
    }
    const headers=new Headers();object.writeHttpMetadata(headers);
    headers.set('ETag',object.httpEtag);headers.set('X-Content-Type-Options','nosniff');
    // Recheck visibility on every media request, including after unpublishing.
    headers.set('Cache-Control','no-store');
    if(object.httpMetadata?.contentType==='application/pdf')headers.set('Content-Disposition','inline');
    return new Response(request.method==='HEAD'?null:object.body,{headers});
  }
  if(path==='/api/media' && request.method==='POST'){
    const user=await admin(request,env);
    const type=request.headers.get('Content-Type')?.split(';')[0];if(!MIME.has(type))fail(415,'Use a JPEG, PNG, WebP image or PDF.');
    const body=await limitedBody(request,MAX_UPLOAD);if(!validMagic(body,type))fail(415,'The file does not match its declared format.');
    const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[type];
    const key=crypto.randomUUID()+'.'+extension;
    // Fail before storing if previews cannot be signed.
    const signed=await previewUrl(key,request,env);
    await env.MEDIA.put(key,body,{httpMetadata:{contentType:type},customMetadata:{status:'draft',uploadedBy:user.id}});
    return json({key,url:signed},201);
  }
  if(path==='/api/media/visibility' && request.method==='POST'){
    await admin(request,env);const body=await parseBody(request);
    if(!keyPattern.test(body.key||'') || !['draft','published'].includes(body.status))fail(400,'Invalid media request.');
    const object=await env.MEDIA.get(body.key);if(!object)fail(404,'File not found.');
    const signed=body.status==='draft'?await previewUrl(body.key,request,env):`${url.origin}/media/${body.key}`;
    await env.MEDIA.put(body.key,object.body,{httpMetadata:object.httpMetadata,customMetadata:{...object.customMetadata,status:body.status}});
    return json({url:signed});
  }
  if(path==='/api/media/preview' && request.method==='POST'){
    await admin(request,env);const body=await parseBody(request);if(!keyPattern.test(body.key||''))fail(400,'Invalid media key.');
    if(!(await env.MEDIA.head(body.key)))fail(404,'File not found.');
    return json({url:await previewUrl(body.key,request,env)});
  }
  if(path==='/api/media' && request.method==='DELETE'){
    await admin(request,env);const body=await parseBody(request);if(!keyPattern.test(body.key||''))fail(400,'Invalid media key.');
    await env.MEDIA.delete(body.key);return json({deleted:true});
  }
  if(path==='/api/contact' && request.method==='POST'){
    if(!env.CONTACT_RATE_LIMIT || !env.SUPABASE_SERVICE_ROLE_KEY)fail(503,'Please contact stand@standforwomen.org directly.');
    const limit=await env.CONTACT_RATE_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});
    if(!limit.success)fail(429,'Too many messages. Please try again later.');
    const body=await parseBody(request);if(body.website)return json({accepted:true});
    for(const key of ['firstName','lastName','email','interest','message'])if(typeof body[key]!=='string')fail(400,'Please complete all required fields.');
    if(!body.firstName.trim() || body.firstName.length>100 || !body.lastName.trim() || body.lastName.length>100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length>254 || !body.message.trim() || body.message.length>5000 || !['general','volunteer','partnership','business','donation'].includes(body.interest))fail(400,'Please check your name, email and message.');
    const stored=await fetch(env.SUPABASE_URL+'/rest/v1/contact_submissions',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({first_name:body.firstName.trim(),last_name:body.lastName.trim(),email:body.email.trim(),interest:body.interest,message:body.message.trim()})});
    if(!stored.ok)fail(502,'Your message could not be saved. Please email us directly.');
    return json({accepted:true},201);
  }
  if(path.startsWith('/api/'))return json({error:'Not found.'},404);
  return env.ASSETS?env.ASSETS.fetch(request):json({error:'Not found.'},404);
}

export default {async fetch(request,env){
  const origin=request.headers.get('Origin');const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(origin && !allowed.includes(origin))return json({error:'Origin not allowed.'},403);
  let response;
  if(request.method==='OPTIONS')response=new Response(null,{status:204});
  else{try{response=await handleRequest(request,env);}catch(error){response=json({error:error.status?error.message:'The request could not be completed.'},error.status||500);}}
  const headers=new Headers(response.headers);
  if(origin){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');headers.set('Access-Control-Allow-Headers','Authorization,Content-Type,X-File-Name');headers.set('Access-Control-Allow-Methods','GET,HEAD,POST,DELETE,OPTIONS');}
  headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  return new Response(response.body,{status:response.status,headers});
}};
