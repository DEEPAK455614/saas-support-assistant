import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDecipheriv } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

globalThis.Netlify={env:{get:(key)=>process.env[key]}};
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const GENERATED=path.join(ROOT,'generated');
const apiPath=path.join(GENERATED,'netlify','functions','api.mjs');
const indexPath=path.join(GENERATED,'public','index.html');
if(!fs.existsSync(apiPath)||!fs.existsSync(indexPath)) throw new Error('Generated app bundle missing');
const {default:apiHandler}=await import(pathToFileURL(apiPath).href);
const INDEX=fs.readFileSync(indexPath,'utf8');

const REFUSAL='इस प्रश्न के लिए उपलब्ध Ekatma knowledge base में विश्वसनीय संदर्भ नहीं मिला। संबंधित meeting, document या verified source जोड़ने पर मैं उसे evidence के साथ analyse कर सकता हूँ।';
const ADVAITA_HEADER=`॥ सर्वं खल्विदं ब्रह्म ॥\n**अद्वैत दृष्टि:** अनेक रूप, अनेक स्रोत — पर सत्य एक।`;
const CAPABILITY_FOOTER=`मैं इससे जुड़ी **meetings, decisions, timeline, action items, people, routes और source evidence** भी खोलकर दिखा सकता हूँ। **क्या आप यह भी जानना चाहेंगे?**\n\nहरिः ॐ 🙏`;
const WELCOME=`**Ekatma Intelligence OS में आपका स्वागत है।**\n\nयहाँ meetings, documents, people, routes, decisions और field intelligence अलग-अलग टुकड़े नहीं हैं — वे एक ही व्यापक दृष्टि में जुड़े हैं।\n\n**Oneness: अनेक स्रोत, एक स्पष्ट समझ।**\nपूछिए — आज आप किस विषय को स्पष्ट देखना चाहते हैं?`;
const BUILDER=`### Developer & Builder — Deepak Tiwari\n\n**Deepak Tiwari** ने Ekatma Intelligence OS को concept, design, develop और build किया है। वे इस system के **Developer, Builder और Product Architect** हैं।\n\nयह intelligence platform **Ekatma Dham, Ekatma Yatra और Acharya Shankar Sanskritik Ekta Nyas** के institutional knowledge और operations को एक जगह जोड़ने के लिए बनाया गया है।\n\nइसके प्रमुख हिस्सों में meeting intelligence, PDF/document knowledge, evidence-grounded search, decision tracking, action items, timeline analysis, people & network intelligence, route/place intelligence, research workflows, source citations और conversational history शामिल हैं।\n\nउद्देश्य केवल जानकारी याद रखना नहीं है — बल्कि उपलब्ध verified knowledge को **स्पष्ट निर्णय, समन्वित कार्य और संस्थागत स्मृति** में बदलना है।`;

function decorateAnswer(text){
  const body=String(text||'').trim()||REFUSAL;
  return `${ADVAITA_HEADER}\n\n${body}\n\n---\n${CAPABILITY_FOOTER}`;
}
function norm(s=''){return String(s).normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}
function isGreeting(q){return /^(hi+|hii+|hello+|hey+|namaste|namaskar|pranam|hari om|हरि ओम|नमस्ते|नमस्कार|प्रणाम)( ji)?$/.test(norm(q));}
function isBuilderQuestion(q){const n=norm(q);return /(who (made|built|developed|created|designed) you|who is your (developer|builder|creator|architect)|your (developer|builder|creator|architect)|who built this|who developed this|who made this|who created this|kisne (banaya|build|develop|design)|developer kaun|builder kaun|creator kaun|architect kaun|किसने.*(बनाया|डेवलप|बिल्ड|डिजाइन)|आपको किसने|तुम्हें किसने|तुमको किसने|इसे किसने)/i.test(n);}
function jsonRes(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function sendNode(res,response){res.writeHead(response.status,Object.fromEntries(response.headers.entries()));return response.arrayBuffer().then(b=>res.end(Buffer.from(b)));}

function loadOverlay(){
  try{
    const dir=path.join(ROOT,'overlay3');
    const keyHex=process.env.OVERLAY_KEY;
    if(!fs.existsSync(dir)||!keyHex||!/^[0-9a-f]{64}$/i.test(keyHex)) return [];
    const parts=fs.readdirSync(dir).filter(f=>/^part\d+$/.test(f)).sort();
    const blob=Buffer.from(parts.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join(''),'base64');
    if(blob.subarray(0,4).toString()!=='EK3O') return [];
    const nonce=blob.subarray(4,16),enc=blob.subarray(16),tag=enc.subarray(enc.length-16),ct=enc.subarray(0,-16);
    const d=createDecipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),nonce);d.setAAD(Buffer.from('EKATMA-OVERLAY3-V1'));d.setAuthTag(tag);
    return JSON.parse(gunzipSync(Buffer.concat([d.update(ct),d.final()])).toString('utf8'));
  }catch(e){console.error('overlay_load_error',e?.message||e);return [];}
}
const overlay=loadOverlay();
const STOP=new Set('the a an and or of to in on for from with by is are was were what who how when where tell give show me you your about please kya hai hain ka ki ke ko se me mein mai main aur ya ek ekatma ekatam क्या कैसी कैसे कौन कब कहाँ बताओ बताइए मुझे इसका उसके एक है हैं था थे और या'.split(/\s+/));
const GROUPS=[['ekatma','ekatam','एकात्म','oneness','एकत्व'],['yatra','यात्रा','journey','दिग्विजय'],['dham','धाम'],['nyas','न्यास','trust'],['route','मार्ग','रूट'],['meeting','मीटिंग','बैठक'],['decision','निर्णय','तय'],['action','कार्य','काम'],['mission','उद्देश्य','ध्येय'],['vision','दृष्टि'],['kalady','कालड़ी','kaladi'],['kedarnath','केदारनाथ'],['omkareshwar','ओंकारेश्वर']];
const SYN=new Map();for(const g of GROUPS)for(const t of g)SYN.set(norm(t),g.map(norm));
function toks(s){return norm(s).split(' ').filter(t=>t.length>1&&!STOP.has(t));}
function expanded(q){const out=[];for(const t of toks(q)){out.push(t);if(SYN.has(t))out.push(...SYN.get(t));}return [...new Set(out)];}
function overlayRetrieve(q,limit=10){
  const qt=expanded(q);if(!qt.length)return [];
  const nq=norm(q);
  return overlay.map(c=>{const text=norm(c.text),title=norm(c.title),tags=norm((c.tags||[]).join(' '));let score=0,hits=0;for(const t of qt){if(text.includes(t)){score+=1.7;hits++;}if(title.includes(t))score+=3.2;if(tags.includes(t))score+=2;}if(nq.length>7&&text.includes(nq))score+=8;return {c,score,hits};}).filter(x=>x.hits>0&&x.score>=2).sort((a,b)=>b.score-a.score).slice(0,limit).map((x,i)=>({ref:`N${i+1}`,id:x.c.id,title:x.c.title,date:x.c.date,kind:x.c.kind,trust:x.c.trust,page:x.c.page,pages:x.c.pages,score:Number(x.score.toFixed(2)),excerpt:String(x.c.text||'').slice(0,1100),source:x.c.source}));
}
async function oldSearch(base,q,mode){try{const r=await apiHandler(new Request(`${base}/api?op=search&q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode||'ask')}`));const j=await r.json();return j.sources||[];}catch(e){console.error('base_search_error',e?.message||e);return [];}}
function dedupeSources(items,limit=12){const out=[],seen=new Set();for(const s of items){const k=`${s.title}|${s.page||s.pages||''}|${s.start||''}|${String(s.excerpt||'').slice(0,100)}`;if(seen.has(k))continue;seen.add(k);out.push({...s,ref:`S${out.length+1}`});if(out.length>=limit)break;}return out;}
function fallbackFromEvidence(sources){
  const picks=sources.slice(0,3).map((s,i)=>{let x=String(s.excerpt||'').replace(/\s+/g,' ').trim();if(x.length>340)x=x.slice(0,337)+'…';return `**[S${i+1}] ${s.title}**\n${x}`;});
  return `उपलब्ध verified Ekatma sources से संबंधित सामग्री मिली है:\n\n${picks.join('\n\n')}\n\nऊपर के points सीधे knowledge base से हैं; कोई बाहरी जानकारी नहीं जोड़ी गई है।`;
}

let modelCache={at:0,models:[]};
async function availableModels(key){
  if(Date.now()-modelCache.at<10*60*1000&&modelCache.models.length)return modelCache.models;
  try{
    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':key}});
    if(r.ok){const j=await r.json();const models=(j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>String(m.name||'').replace(/^models\//,''));modelCache={at:Date.now(),models};return models;}
  }catch(e){console.error('model_discovery_error',e?.message||e);}
  return [];
}
async function callGemini(question,mode,sources,history){
  const key=process.env.GEMINI_API_KEY;if(!key)throw new Error('engine_not_configured');
  const ev=sources.map((s,i)=>`[S${i+1}] ${s.title}${s.page?` | page ${s.page}`:(s.pages?` | pages ${s.pages}`:'')}${s.start?` | ${s.start}-${s.end||''}`:''}${s.date?` | ${s.date}`:''}\n${String(s.excerpt||'').slice(0,1400)}`).join('\n\n');
  const recent=(history||[]).slice(-6).map(m=>`${m.role==='assistant'?'Assistant':'User'}: ${String(m.content||'').slice(0,700)}`).join('\n');
  const prompt=`You are Ekatma Intelligence OS, an evidence-grounded operational intelligence system for Ekatma Dham, Ekatma Yatra and Acharya Shankar Sanskritik Ekta Nyas.\n\nRULES:\n1. Use ONLY EVIDENCE below. Never use outside/pretrained facts.\n2. Cite important factual claims with [S#].\n3. Separate discussed/proposed from decided/finalised.\n4. If evidence is insufficient, reply exactly: ${REFUSAL}\n5. Match the user's language and answer directly.\n6. Do not mention model/provider/retrieval.\n7. Do not add greetings, spiritual framing or closing phrases; the application adds those consistently.\n\nRecent conversation is context only, not evidence:\n${recent||'(none)'}\n\nQuestion: ${question}\nMode: ${mode}\n\nEVIDENCE:\n${ev}`;
  const discovered=await availableModels(key);
  const preferred=[process.env.GEMINI_MODEL,'gemini-3.8-flash','gemini-3.7-flash','gemini-2.5-flash','gemini-flash-latest'].filter(Boolean);
  const models=[...new Set([...preferred.filter(m=>!discovered.length||discovered.includes(m)),...discovered.filter(m=>/flash/i.test(m))])].slice(0,8);
  let last;
  for(const model of models.length?models:['gemini-2.5-flash']){
    try{
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1800}})});
      const raw=await r.text();
      if(!r.ok){console.error('gemini_model_error',model,r.status,raw.slice(0,220));last=new Error(`gemini_${r.status}`);continue;}
      const j=JSON.parse(raw);const text=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
      if(text){console.log('gemini_ok',model);return {text,model};}
    }catch(e){last=e;console.error('gemini_transport_error',model,e?.message||e);}
  }
  throw last||new Error('engine_failure');
}
function overlaySourceGroups(){const m=new Map();for(const c of overlay){if(!m.has(c.source))m.set(c.source,{source:c.source,title:c.title,date:c.date,kind:c.kind,trust:c.trust,chunks:0,kinds:['uploaded-pdf'],speakers:[]});m.get(c.source).chunks++;}return [...m.values()];}

const server=http.createServer(async(req,res)=>{
  try{
    const proto=req.headers['x-forwarded-proto']||'https',base=`${proto}://${req.headers.host||'localhost'}`,u=new URL(req.url,base);
    if(u.pathname==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({ok:true,service:'Ekatma Intelligence OS',overlayChunks:overlay.length}));}
    if(u.pathname==='/api'){
      if(req.method==='GET'){
        const op=u.searchParams.get('op');
        if(op==='sources'){const r=await apiHandler(new Request(base+req.url)),j=await r.json().catch(()=>({sources:[]}));return sendNode(res,jsonRes({sources:[...(j.sources||[]),...overlaySourceGroups()]}));}
        if(op==='stats'){const r=await apiHandler(new Request(base+req.url)),j=await r.json().catch(()=>({}));return sendNode(res,jsonRes({...j,chunks:(j.chunks||0)+overlay.length,sources:(j.sources||0)+overlaySourceGroups().length,uploadedPdfChunks:overlay.length,engineConfigured:Boolean(process.env.GEMINI_API_KEY)}));}
        if(op==='search'){const q=u.searchParams.get('q')||'',mode=u.searchParams.get('mode')||'ask';const [old,neu]=await Promise.all([oldSearch(base,q,mode),Promise.resolve(overlayRetrieve(q,10))]);return sendNode(res,jsonRes({query:q,sources:dedupeSources([...neu,...old],14)}));}
        if(op==='diagnostic'){
          const q='एकात्म यात्रा';const merged=dedupeSources([...overlayRetrieve(q,6),...await oldSearch(base,q,'ask')],8);
          try{const out=await callGemini('एकात्म यात्रा के बारे में उपलब्ध sources से एक वाक्य में बताइए','ask',merged,[]);return sendNode(res,jsonRes({ok:true,evidenceCount:merged.length,model:out.model}));}catch(e){return sendNode(res,jsonRes({ok:false,evidenceCount:merged.length,error:String(e?.message||e)},503));}
        }
      }
      if(req.method==='POST'){
        const parts=[];for await(const c of req)parts.push(c);const body=JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');
        const question=String(body.question||'').trim(),mode=String(body.mode||'ask');
        if(!question)return sendNode(res,jsonRes({answer:decorateAnswer(REFUSAL),sources:[],grounded:true,refused:true}));
        if(isGreeting(question))return sendNode(res,jsonRes({answer:decorateAnswer(WELCOME),sources:[],grounded:true,refused:false,systemMessage:true}));
        if(isBuilderQuestion(question))return sendNode(res,jsonRes({answer:decorateAnswer(BUILDER),sources:[],grounded:true,refused:false,systemMessage:true}));
        const [old,neu]=await Promise.all([oldSearch(base,question,mode),Promise.resolve(overlayRetrieve(question,10))]);
        const merged=dedupeSources([...neu,...old],10);
        if(!merged.length)return sendNode(res,jsonRes({answer:decorateAnswer(REFUSAL),sources:[],grounded:true,refused:true}));
        try{
          const out=await callGemini(question,mode,merged,body.history);
          const refused=out.text===REFUSAL;
          return sendNode(res,jsonRes({answer:decorateAnswer(out.text),sources:merged,grounded:true,refused}));
        }catch(e){
          console.error('answer_generation_fallback',e?.message||e);
          return sendNode(res,jsonRes({answer:decorateAnswer(fallbackFromEvidence(merged)),sources:merged,grounded:true,refused:false,fallback:true}));
        }
      }
      const response=await apiHandler(new Request(base+req.url,{method:req.method,headers:req.headers}));return sendNode(res,response);
    }
    if(u.pathname==='/'||u.pathname==='/index.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(INDEX);}
    res.writeHead(404,{'content-type':'application/json'});return res.end(JSON.stringify({error:'Not found'}));
  }catch(e){console.error('server_error',e);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:'Internal error'}));}
});
const port=Number(process.env.PORT||10000);server.listen(port,'0.0.0.0',()=>console.log(`Ekatma Intelligence OS listening on ${port} | overlay ${overlay.length} | Gemini router v3 + Advaita frame`));