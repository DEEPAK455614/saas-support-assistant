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
const WELCOME=`॥ सर्वं खल्विदं ब्रह्म ॥\n\nहरिः ॐ 🙏\nEkatma Intelligence OS में आपका स्वागत है।\n\nयहाँ meetings, documents, people, routes, decisions और field intelligence अलग-अलग टुकड़े नहीं हैं — वे एक ही व्यापक दृष्टि के रूप में जुड़े हैं।\n\n**Oneness: अनेक स्रोत, एक स्पष्ट समझ।**\nपूछिए — आज आप किस विषय को स्पष्ट देखना चाहते हैं?`;
const BUILDER=`Ekatma Intelligence OS को **Deepak Tiwari** ने design, develop और build किया है। वे इस intelligence system के developer और builder हैं।`;

function norm(s=''){return String(s).normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}
function isGreeting(q){
  const n=norm(q);
  return /^(hi+|hii+|hello+|hey+|namaste|namaskar|pranam|hari om|हरि ओम|नमस्ते|नमस्कार|प्रणाम)( ji)?[!. ]*$/.test(n);
}
function isBuilderQuestion(q){
  const n=norm(q);
  return /(who (made|built|developed|created) you|who is your (developer|builder|creator)|your (developer|builder|creator)|kisne (banaya|build|develop)|developer kaun|builder kaun|creator kaun|किसने.*(बनाया|डेवलप|बिल्ड)|आपको किसने|तुम्हें किसने|तुमको किसने)/i.test(n);
}
function jsonRes(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}

function loadOverlay(){
  try{
    const dir=path.join(ROOT,'overlay3');
    if(!fs.existsSync(dir)) return [];
    const keyHex=process.env.OVERLAY_KEY;
    if(!keyHex||!/^[0-9a-f]{64}$/i.test(keyHex)) return [];
    const b64=fs.readdirSync(dir).filter(f=>/^part\d+$/.test(f)).sort().map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('');
    const blob=Buffer.from(b64,'base64');
    if(blob.subarray(0,4).toString()!=='EK3O') return [];
    const nonce=blob.subarray(4,16), enc=blob.subarray(16), tag=enc.subarray(enc.length-16), ct=enc.subarray(0,-16);
    const d=createDecipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),nonce);
    d.setAAD(Buffer.from('EKATMA-OVERLAY3-V1')); d.setAuthTag(tag);
    const gz=Buffer.concat([d.update(ct),d.final()]);
    return JSON.parse(gunzipSync(gz).toString('utf8'));
  }catch(e){console.error('overlay_load_error',e?.message||e);return [];}
}
const overlay=loadOverlay();
const STOP=new Set('the a an and or of to in on for from with by is are was were what who how when where tell give show me you your about please kya hai hain ka ki ke ko se me mein aur ekatma ekatam'.split(/\s+/));
function toks(s){return norm(s).split(' ').filter(t=>t.length>1&&!STOP.has(t));}
function overlayRetrieve(q,limit=8){
  const qt=[...new Set(toks(q))]; if(!qt.length)return [];
  const scored=overlay.map(c=>{
    const t=norm(c.text), title=norm(c.title); let s=0,h=0;
    for(const x of qt){if(t.includes(x)){s+=1.6;h++;} if(title.includes(x))s+=3;}
    if(norm(q).length>8&&t.includes(norm(q)))s+=8;
    return {c,score:s,h};
  }).filter(x=>x.score>=2.2&&x.h>0).sort((a,b)=>b.score-a.score);
  return scored.slice(0,limit).map((x,i)=>({ref:`N${i+1}`,id:x.c.id,title:x.c.title,date:x.c.date,kind:x.c.kind,trust:x.c.trust,page:x.c.page,pages:x.c.pages,score:Number(x.score.toFixed(2)),excerpt:x.c.text}));
}
async function oldSearch(base,q,mode){
  try{
    const r=await apiHandler(new Request(`${base}/api?op=search&q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode||'ask')}`));
    const j=await r.json(); return j.sources||[];
  }catch{return []}
}
async function callGemini(question,mode,sources,history){
  const key=process.env.GEMINI_API_KEY;
  if(!key) throw new Error('engine_not_configured');
  const ev=sources.map((s,i)=>`[S${i+1}] ${s.title}${s.page?` | page ${s.page}`:(s.pages?` | pages ${s.pages}`:'')}${s.date?` | ${s.date}`:''}\n${s.excerpt||''}`).join('\n\n');
  const recent=(history||[]).slice(-6).map(m=>`${m.role==='assistant'?'Assistant':'User'}: ${String(m.content||'').slice(0,700)}`).join('\n');
  const prompt=`You are Ekatma Intelligence OS, the evidence-grounded operational intelligence system for Ekatma Dham, Ekatma Yatra and Acharya Shankar Sanskritik Ekta Nyas.
Use ONLY the evidence below. Do not use outside knowledge. Cite important factual claims with [S#]. Distinguish proposed/discussed from final/decided. If evidence is insufficient, say exactly: ${REFUSAL}
Match the user's language. Be clear, concise and operationally useful.
Recent conversation is only for resolving references, not evidence:
${recent||'(none)'}
Question: ${question}
Mode: ${mode}
Evidence:
${ev}`;
  const models=[process.env.GEMINI_MODEL||'gemini-2.5-flash','gemini-2.5-flash'];
  let last;
  for(const model of [...new Set(models)]){
    try{
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.12,topP:0.85,maxOutputTokens:1800}})
      });
      const raw=await r.text(); if(!r.ok){last=new Error(`gemini_${r.status}`);continue}
      const j=JSON.parse(raw); const text=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
      if(text)return text;
    }catch(e){last=e}
  }
  throw last||new Error('engine_failure');
}
function overlaySourceGroups(){
  const m=new Map();
  for(const c of overlay){if(!m.has(c.source))m.set(c.source,{source:c.source,title:c.title,date:c.date,kind:c.kind,trust:c.trust,chunks:0,kinds:['uploaded-pdf'],speakers:[]});m.get(c.source).chunks++;}
  return [...m.values()];
}

const server=http.createServer(async(req,res)=>{
  try{
    const proto=req.headers['x-forwarded-proto']||'https';
    const base=`${proto}://${req.headers.host||'localhost'}`;
    const u=new URL(req.url,base);
    if(u.pathname==='/health'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      return res.end(JSON.stringify({ok:true,service:'Ekatma Intelligence OS',overlayChunks:overlay.length}));
    }
    if(u.pathname==='/api'){
      if(req.method==='GET'){
        const op=u.searchParams.get('op');
        if(op==='sources'){
          const r=await apiHandler(new Request(base+req.url)); const j=await r.json().catch(()=>({sources:[]}));
          const response=jsonRes({sources:[...(j.sources||[]),...overlaySourceGroups()]}); res.writeHead(response.status,Object.fromEntries(response.headers.entries()));return res.end(Buffer.from(await response.arrayBuffer()));
        }
        if(op==='stats'){
          const r=await apiHandler(new Request(base+req.url)); const j=await r.json().catch(()=>({}));
          const response=jsonRes({...j,chunks:(j.chunks||0)+overlay.length,sources:(j.sources||0)+overlaySourceGroups().length,uploadedPdfChunks:overlay.length}); res.writeHead(response.status,Object.fromEntries(response.headers.entries()));return res.end(Buffer.from(await response.arrayBuffer()));
        }
        if(op==='search'){
          const q=u.searchParams.get('q')||'',mode=u.searchParams.get('mode')||'ask';
          const old=await oldSearch(base,q,mode), neu=overlayRetrieve(q,10);
          const response=jsonRes({query:q,sources:[...neu,...old].slice(0,14)});res.writeHead(response.status,Object.fromEntries(response.headers.entries()));return res.end(Buffer.from(await response.arrayBuffer()));
        }
      }
      if(req.method==='POST'){
        const parts=[];for await(const c of req)parts.push(c);const bodyBuf=Buffer.concat(parts);
        const body=JSON.parse(bodyBuf.toString('utf8')||'{}'); const question=String(body.question||'').trim(), mode=String(body.mode||'ask');
        if(isGreeting(question)){
          const response=jsonRes({answer:WELCOME,sources:[],grounded:true,refused:false,systemMessage:true});
          res.writeHead(response.status,Object.fromEntries(response.headers.entries()));return res.end(Buffer.from(await response.arrayBuffer()));
        }
        if(isBuilderQuestion(question)){
          const response=jsonRes({answer:BUILDER,sources:[],grounded:true,refused:false,systemMessage:true});
          res.writeHead(response.status,Object.fromEntries(response.headers.entries()));return res.end(Buffer.from(await response.arrayBuffer()));
        }
        const neu=overlayRetrieve(question,mode,8);
        if(neu.length){
          const old=await oldSearch(base,question,mode);
          const merged=[...neu,...old].slice(0,10).map((s,i)=>({...s,ref:`S${i+1}`}));
          let answer;
          try{answer=await callGemini(question,mode,merged,body.history);}
          catch(e){console.error('overlay_engine_error',e?.message||e);answer=REFUSAL;}
          const response=jsonRes({answer,sources:merged,grounded:true,refused:answer===REFUSAL});
          res.writeHead(response.status,Object.fromEntries(response.headers.entries()));return res.end(Buffer.from(await response.arrayBuffer()));
        }
        const request=new Request(base+req.url,{method:'POST',headers:req.headers,body:bodyBuf});
        const response=await apiHandler(request);res.writeHead(response.status,Object.fromEntries(response.headers.entries()));return res.end(Buffer.from(await response.arrayBuffer()));
      }
      const request=new Request(base+req.url,{method:req.method,headers:req.headers});
      const response=await apiHandler(request);res.writeHead(response.status,Object.fromEntries(response.headers.entries()));return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if(u.pathname==='/'||u.pathname==='/index.html'){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(INDEX);
    }
    res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:'Not found'}));
  }catch(e){console.error(e);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:'Internal error'}));}
});
const port=Number(process.env.PORT||10000);
server.listen(port,'0.0.0.0',()=>console.log(`Ekatma Intelligence OS listening on ${port} | overlay ${overlay.length}`));
