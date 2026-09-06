import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { canonicalFacts, sourceRegistry, probableQuestionGroups, canonicalStats, matchCanonical, canonicalAnswerObject } from './canonical-layer.mjs';
import { answerConversation } from './conversation-engine.mjs';
import { polishWithGemini } from './gemini-composer-v5.mjs';
import { qaCorpus, qaSearch, qaResultToSource, qaStats, qaSourceRegistry, qaDataPolicy } from './qa-corpus.mjs';
import { isVedantaKnowledgeQuery, vedantaNySearch, vedantaNyStats, warmVedantaNy } from './vedantany-source.mjs';
import './canonical-sync.mjs';

const VERSION='5.3.0';
const PORTAL_HASH='02c68d33f7539ad63a46dd07a1401aadf1bd610177d7005e914e971b674316bf';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const REACT_UI=fs.readFileSync(path.join(ROOT,'react-ui.html'),'utf8');
const PUBLIC_PORT=Number(process.env.PORT||10000);
const INTERNAL_PORT=PUBLIC_PORT+1;
const ORIGINAL_PORT=process.env.PORT;
process.env.PORT=String(INTERNAL_PORT);
await import('./v4.mjs');
process.env.PORT=ORIGINAL_PORT||String(PUBLIC_PORT);

const DOMAIN_RE=/(ekatma|ekatam|एकात्म|yatra|यात्रा|dham|धाम|nyas|न्यास|shankar|शंकर|advaita|अद्वैत|vedanta|vedant|वेदांत|वेदान्त|upanishad|उपनिषद|brahman|ब्रह्म|atman|आत्मा|maya|माया|moksha|मोक्ष|mahavakya|महावाक्य|omkareshwar|ओंकारेश्वर|oneness|peeth|पीठ|matha|mutt|मठ|gita|गीता|bhakti|भक्ति|karma yoga|कर्मयोग|jnana|ज्ञान|kalady|कालड़ी|kedarnath|केदारनाथ|statue of oneness|advaita lok|अद्वैत लोक)/i;
const INJECTION_RE=/(ignore (all|the|your) (previous|prior|system)|reveal (your|the) (prompt|instructions)|system prompt|jailbreak|forget your rules|override.*instructions|इन निर्देशों को भूल|सिस्टम प्रॉम्प्ट|अपने नियम भूल)/i;
const SUBJECTS=[/Ekatma Dham/i,/Ekatma Yatra/i,/Statue of Oneness/i,/Advaita Lok/i,/Acharya Shankar International Institute of Advaita Vedanta/i,/Acharya Shankar Sanskritik Ekta Nyas/i,/Adi Shankaracharya/i,/Omkareshwar/i,/Kalady/i,/Kedarnath/i,/एकात्म धाम/u,/एकात्म यात्रा/u,/स्टैच्यू ऑफ ऑननेस/u,/अद्वैत लोक/u,/आचार्य शंकर सांस्कृतिक एकता न्यास/u,/आदि शंकराचार्य/u,/ओंकारेश्वर/u,/कालड़ी/u,/केदारनाथ/u];

async function readBody(req,max=42*1024*1024){const parts=[];let n=0;for await(const c of req){n+=c.length;if(n>max)throw Object.assign(new Error('request_too_large'),{status:413});parts.push(c)}return Buffer.concat(parts)}
function headersForFetch(headers={}){const out={};for(const[k,v]of Object.entries(headers)){if(v==null||['host','connection','content-length','transfer-encoding'].includes(k.toLowerCase()))continue;out[k]=Array.isArray(v)?v.join(', '):String(v)}return out}
function sendJson(res,status,obj){const out=Buffer.from(JSON.stringify(obj));res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':out.length,'x-content-type-options':'nosniff'});res.end(out)}
function sendHtml(res,body){const out=Buffer.from(body);res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-length':out.length,'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'});res.end(out)}
function safeEq(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y)}
function portalOK(req){const supplied=String(req.headers['x-admin-key']||'');if(!supplied)return false;const got=createHash('sha256').update(supplied).digest('hex');return safeEq(got,PORTAL_HASH)}
function internalAdminHeaders(req){return{...req.headers,'x-admin-key':process.env.EKATMA_ADMIN_TOKEN||''}}
function norm(s=''){return String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim()}
function isSocial(q){return /^(hi+|hii+|hello+|hey+|namaste|namaskar|pranam|hari ?om|hariom|जय ?शंकर|जयशंकर|नमस्ते|नमस्कार|प्रणाम|हरि ?ओम|हरिः ?ॐ|thanks|thank you|धन्यवाद|शुक्रिया|how are you|kaise ho|कैसे हो)$/i.test(norm(q))}
function clip(s,n=1100){const x=String(s||'').replace(/\s+/g,' ').trim();return x.length>n?x.slice(0,n)+'…':x}
function subjectFromHistory(history=[]){const text=(history||[]).slice(-8).reverse().map(m=>String(m.content||'')).join('\n');for(const re of SUBJECTS){const m=text.match(re);if(m)return m[0]}return''}
function isReferential(q){const n=norm(q);return n.length<180&&(/\b(it|its|this|that|he|she|they|them|there|then|when|where|why|how|what about|and|also|same|above|previous|isme|usme|iska|iski|iske|uska|uski|uske|inme|unme|aur|phir|toh|to)\b/i.test(n)||/(यह|ये|वह|वो|उसका|उसकी|उसके|उसमें|इसका|इसकी|इसके|इसमें|कब|कहाँ|कहा|क्यों|कैसे|और|फिर|उसी|ऊपर|पिछल)/u.test(q))}
function inScope(q,history=[]){if(DOMAIN_RE.test(q)||isVedantaKnowledgeQuery(q))return true;const h=(history||[]).slice(-8).map(m=>m.content||'').join(' ');return isReferential(q)&&(DOMAIN_RE.test(h)||isVedantaKnowledgeQuery(h))}
function buildRetrievalQuery(question,history=[]){const q=String(question||'').trim();if(!q||!history.length||isSocial(q)||!isReferential(q))return q;const subject=subjectFromHistory(history);if(subject){const replaced=q.replace(/\b(it|this|that|isme|usme|iska|iski|iske|uska|uski|uske|inme|unme)\b/ig,subject);return `${replaced}\nSubject: ${subject}`}const lastUser=[...history].reverse().find(m=>m.role==='user');return lastUser?.content?`${q}\nPrevious topic: ${clip(lastUser.content,700)}`:q}
function chunkText(text,size=2600,overlap=260){const t=String(text||'').replace(/\r/g,'').trim(),out=[];for(let start=0;start<t.length;start+=size-overlap){const content=t.slice(start,start+size).trim();if(content.length>40)out.push({pageNumber:null,sectionTitle:null,content,metadata:{}});if(start+size>=t.length)break}return out.slice(0,500)}
async function kbCall(action,payload={}){const url=process.env.KB_FUNCTION_URL,token=process.env.EKATMA_ADMIN_TOKEN;if(!url||!token)throw new Error('knowledge_backend_not_configured');const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-ekatma-admin':token},body:JSON.stringify({action,...payload})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||j.detail||`knowledge_backend_${r.status}`);return j}
async function ingestTextUpload(body){const raw=Buffer.from(String(body.base64||''),'base64');if(!raw.length)throw Object.assign(new Error('empty_file'),{status:400});const text=raw.toString('utf8').trim();if(!text)throw Object.assign(new Error('no_extractable_text'),{status:400});const chunks=chunkText(text);const result=await kbCall('ingest',{fileName:String(body.fileName||'knowledge.txt'),mimeType:String(body.mimeType||'text/plain'),base64:raw.toString('base64'),sizeBytes:raw.length,title:String(body.title||body.fileName||'Knowledge').trim(),documentDate:body.documentDate||null,trust:body.trust||'verified',sourceType:'portal_upload',notes:body.notes||'Uploaded through Ekatma Knowledge Portal',chunks});return {...result,indexing:'lexical-ready',syncedWithChat:true}}
function withRefs(sources=[]){return sources.map((s,i)=>({...s,ref:`S${i+1}`}))}
function mergeSources(...groups){const out=[],seen=new Set();for(const s of groups.flat().filter(Boolean)){const key=norm(`${s.origin||''}|${s.title||''}|${s.content||s.excerpt||''}`).slice(0,900);if(!key||seen.has(key))continue;seen.add(key);out.push(s);if(out.length>=10)break}return withRefs(out)}
async function rawInternalFetch(urlPath,{method='GET',headers={},body}={}){return fetch(`http://127.0.0.1:${INTERNAL_PORT}${urlPath}`,{method,headers:headersForFetch(headers),body})}
function categoryMatchesSubject(category,subject){const c=norm(category),s=norm(subject);if(!c||!s)return false;if(c.includes(s)||s.includes(c))return true;if(/nyas|न्यास/i.test(subject))return /nyas|न्यास/i.test(category);if(/institute|institute of advaita|संस्थान/i.test(subject))return /institute|संस्थान/i.test(category);if(/shankaracharya|शंकराचार्य/i.test(subject))return /shankaracharya|शंकराचार्य/i.test(category);return false}
async function searchSources(query,subject=''){
  const base=await rawInternalFetch(`/api?op=search&q=${encodeURIComponent(query)}`);let j={sources:[]};try{if(base.ok)j=await base.json()}catch{}
  let qaRows=qaSearch(query,{limit:12,minScore:.18});if(subject){const focused=qaRows.filter(r=>categoryMatchesSubject(r.category,subject));if(focused.length)qaRows=focused}
  const qa=qaRows.slice(0,8).map(qaResultToSource);
  let vedanta=[];try{vedanta=await vedantaNySearch(query,{limit:5,minScore:.13})}catch(e){console.error('VEDANTANY_SEARCH_ERROR',e?.message||e)}
  return mergeSources(vedanta,qa,j.sources||[])
}
function answerFromSourceText(s=''){const text=String(s||'');const m=text.match(/(?:^|\n)ANSWER:\s*([\s\S]*?)(?=\n(?:STATUS|CONFIDENCE|PRIMARY_SOURCE|LAST_VERIFIED|SOURCE|URL|CATEGORY|KEYWORDS|LECTURE_|SOURCE_REPOSITORY|SOURCE_REVISION):|$)/i);if(m)return m[1].trim();return text.replace(/^(SOURCE|URL|QUESTION|STATUS|CONFIDENCE|PRIMARY_SOURCE|LAST_VERIFIED|CATEGORY|KEYWORDS|LECTURE_\d+|SOURCE_REPOSITORY|SOURCE_REVISION):.*$/gmi,'').replace(/\s+/g,' ').trim()}
function fallbackFromSources(question,sources=[]){const pieces=[];const strongQA=sources[0]?.origin==='qa_930'&&Number(sources[0]?.score||0)>=.78;const strongVedanta=sources[0]?.origin==='vedantany_10m'&&Number(sources[0]?.score||0)>=.55;const maxPieces=(strongQA||strongVedanta)?1:2;for(const s of sources.slice(0,4)){const a=answerFromSourceText(s.content||s.excerpt||'');if(a&&a.length>20&&!pieces.includes(a))pieces.push(a);if(pieces.length>=maxPieces)break}if(!pieces.length)return'';return pieces.map((x,i)=>`${x} [S${i+1}]`).join('\n\n')}
function scopeRedirect(q){return /[\u0900-\u097f]/.test(q)?'हरिः ॐ 🙏\n\nमैं Ekatma Intelligence हूँ। आप एकात्म धाम, एकात्म यात्रा, आचार्य शंकर सांस्कृतिक एकता न्यास, आदि शंकराचार्य या अद्वैत वेदान्त से जुड़ा प्रश्न पूछिए।':'Hari Om 🙏\n\nI’m Ekatma Intelligence. Ask me about Ekatma Dham, Ekatma Yatra, Acharya Shankar Sanskritik Ekta Nyas, Adi Shankaracharya or Advaita Vedanta.'}

async function handleChat(req,res,body){
  let payload={};try{payload=JSON.parse(body.toString('utf8')||'{}')}catch{}
  const question=String(payload.question||'').trim();if(!question)return sendJson(res,400,{error:'question_required'});
  const history=(Array.isArray(payload.history)?payload.history:[]).slice(-24).map(m=>({role:m.role==='assistant'?'assistant':'user',content:clip(m.content,2400)}));
  if(isSocial(question)){const result=await answerConversation({question,history,internalFetch:rawInternalFetch});return sendJson(res,200,{...result,contextAware:true})}
  if(INJECTION_RE.test(question))return sendJson(res,200,{answer:'हरिः ॐ 🙏\n\nमैं अपने grounding और safety rules को bypass नहीं कर सकता। एकात्म, न्यास, शंकराचार्य या अद्वैत से जुड़ा वास्तविक प्रश्न पूछिए।',sources:[],grounded:true,refused:true,inScope:true,composer:'policy',contextAware:true});
  if(!inScope(question,history))return sendJson(res,200,{answer:scopeRedirect(question),sources:[],grounded:true,refused:true,inScope:false,composer:'scope-redirect',contextAware:true});

  const referential=isReferential(question),subject=referential?subjectFromHistory(history):'';
  const retrievalQuery=buildRetrievalQuery(question,history);
  let result=null;
  if(!referential){
    const canonical=matchCanonical(question,{threshold:.64});
    if(canonical?.special)result={...canonical.special,sources:withRefs(canonical.special.sources||[]),canonical:true};
    else if(canonical?.fact){const c=canonicalAnswerObject(canonical.fact,question);result={...c,sources:withRefs(c.sources||[]),canonical:true}}
  }
  if(!result){
    const sources=await searchSources(retrievalQuery,subject);
    const fallback=fallbackFromSources(question,sources);
    const usesVedantaNY=sources.some(s=>s.origin==='vedantany_10m');
    result={answer:fallback,sources,grounded:!!sources.length,confidence:sources.length?'medium':'low',composer:usesVedantaNY?'vedantany-retrieval':sources.length?'grounded-retrieval':'domain-general',inScope:true,...(usesVedantaNY?{meta:{knowledgeLayer:'VedantaNY-10M',vedantany:vedantaNyStats()}}:{})};
  }
  const polished=await polishWithGemini({question,history,result});
  if(polished)return sendJson(res,200,{...result,...polished,sources:result.sources||[],grounded:result.grounded,contextAware:true,...(result.meta?{meta:result.meta}:{})});
  if(result.answer)return sendJson(res,200,{...result,contextAware:true,composer:result.meta?.knowledgeLayer==='VedantaNY-10M'?'vedantany-grounded':result.canonical?'canonical-safe-fallback':'grounded-safe-fallback'});
  const msg=/[\u0900-\u097f]/.test(question)?'इस विषय पर AI composer अभी उपलब्ध नहीं है और उपलब्ध knowledge में पर्याप्त प्रत्यक्ष सामग्री नहीं मिली। मैं अनुमान लगाकर उत्तर नहीं दूँगा।':'The AI composer is temporarily unavailable for this question and the available knowledge does not contain enough direct material. I won’t invent an answer.';
  return sendJson(res,200,{...result,answer:msg,refused:true,contextAware:true,composer:'safe-fallback'});
}
async function health(res){let base={};try{const r=await rawInternalFetch('/health');if(r.ok)base=await r.json()}catch{}return sendJson(res,200,{...base,ok:true,service:'Ekatma Intelligence OS',version:VERSION,frontend:'React 18',canonicalKnowledge:canonicalStats(),qa930:qaStats(),vedantaNY:vedantaNyStats(),geminiConfigured:!!process.env.GEMINI_API_KEY,geminiModel:process.env.GEMINI_MODEL||'gemini-3.8-flash',geminiCallsPerAnswer:'1 primary generation; model failover only on API error',answerPolicy:'conversation context > canonical + 930-QA + VedantaNY + managed uploads > grounded AI composition > safe grounded fallback',knowledgePortal:'/knowledge',knowledgeSync:'portal uploads and chat query the same managed knowledge store'});}
function knowledgeOverview(req,res){if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});const facts=canonicalFacts.map(f=>({fact_id:f.fact_id,topic:f.topic,question:f.canonical_question,answer:f.canonical_answer,status:f.status,confidence:f.confidence,verified_on:f.verified_on||null,source_ids:f.source_ids||[]}));const sources=Object.entries(sourceRegistry).map(([source_id,s])=>({source_id,...s}));return sendJson(res,200,{stats:canonicalStats(),qa930:qaStats(),vedantaNY:vedantaNyStats(),facts,sources,qaSources:qaSourceRegistry,dataPolicy:qaDataPolicy,sync:'live-managed-kb'});}
function qaList(req,res,u){if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});const q=String(u.searchParams.get('q')||'').trim(),category=String(u.searchParams.get('category')||'').trim();const offset=Math.max(0,Number(u.searchParams.get('offset')||0)),limit=Math.max(1,Math.min(Number(u.searchParams.get('limit')||50),100));let rows=q?qaSearch(q,{limit:100,minScore:.10}):qaCorpus;if(category)rows=rows.filter(r=>r.category===category);const categories=[...new Set(qaCorpus.map(x=>x.category))].sort();return sendJson(res,200,{total:rows.length,offset,limit,categories,rows:rows.slice(offset,offset+limit)});}
async function kbStats(req,res){if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});let managed={documents:0,chunks:0,embeddedChunks:0};try{const r=await rawInternalFetch('/api?op=stats');if(r.ok)managed=await r.json()}catch{}return sendJson(res,200,{managed,canonical:canonicalStats(),qa930:qaStats(),vedantaNY:vedantaNyStats()});}
async function forward(req,res,body=null,pathOverride=null,headersOverride=null){const target=pathOverride||req.url;const headers=headersOverride||req.headers;const r=await rawInternalFetch(target,{method:req.method,headers,body:body??(req.method==='GET'||req.method==='HEAD'?undefined:await readBody(req))});const b=Buffer.from(await r.arrayBuffer());res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream','cache-control':r.headers.get('cache-control')||'no-store','x-content-type-options':'nosniff'});res.end(b)}

const gateway=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html'||u.pathname==='/knowledge'||u.pathname==='/knowledge/'))return sendHtml(res,REACT_UI);
  if(req.method==='GET'&&(u.pathname==='/health'||u.pathname==='/ready'))return health(res);
  if(req.method==='GET'&&u.pathname==='/api/probable-questions')return sendJson(res,200,{groups:probableQuestionGroups(),stats:canonicalStats(),qa930:qaStats(),vedantaNY:vedantaNyStats(),source:'canonical-pack-v1+qa930+vedantany-10m'});
  if(req.method==='GET'&&u.pathname==='/api/canonical-stats')return sendJson(res,200,{...canonicalStats(),qa930:qaStats(),vedantaNY:vedantaNyStats()});
  if(req.method==='GET'&&u.pathname==='/api/admin/knowledge-overview')return knowledgeOverview(req,res);
  if(req.method==='GET'&&u.pathname==='/api/admin/qa')return qaList(req,res,u);
  if(req.method==='GET'&&u.pathname==='/api/admin/kb-stats')return kbStats(req,res);
  if(req.method==='POST'&&u.pathname==='/api/admin/upload'){
    if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});
    const raw=await readBody(req),body=JSON.parse(raw.toString('utf8')||'{}');
    const mime=String(body.mimeType||'').toLowerCase();
    if(mime.startsWith('text/'))return sendJson(res,200,await ingestTextUpload(body));
    return forward(req,res,raw,null,internalAdminHeaders(req));
  }
  if(u.pathname.startsWith('/api/admin/')){
    if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});
    const body=req.method==='GET'||req.method==='HEAD'?null:await readBody(req);
    return forward(req,res,body,null,internalAdminHeaders(req));
  }
  if(req.method==='POST'&&(u.pathname==='/api/chat'||u.pathname==='/api'))return handleChat(req,res,await readBody(req));
  return forward(req,res);
}catch(e){console.error('gateway_error',e?.message||e);return sendJson(res,e?.status||500,{error:e?.message||'gateway_error'})}});

setTimeout(()=>gateway.listen(PUBLIC_PORT,'0.0.0.0',()=>console.log(`Ekatma Intelligence OS ${VERSION} on ${PUBLIC_PORT} | React | grounded composer | context-aware | ${qaStats().questions} QA | ${canonicalStats().facts} canonical facts | VedantaNY-10M`)),40);
setTimeout(()=>warmVedantaNy().then(rows=>console.log(`VEDANTANY_READY ${rows.length} pinned upstream RAG entries`)).catch(e=>console.error('VEDANTANY_WARM_ERROR',e?.message||e)),1200);
