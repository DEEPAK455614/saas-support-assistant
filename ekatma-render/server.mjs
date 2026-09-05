import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { canonicalFacts, sourceRegistry, probableQuestionGroups, canonicalStats } from './canonical-layer.mjs';
import { answerConversation } from './conversation-engine.mjs';
import { qaCorpus, qaSearch, qaResultToSource, qaStats, qaSourceRegistry, qaDataPolicy } from './qa-corpus.mjs';
import './canonical-sync.mjs';

const VERSION='5.0.0';
const PORTAL_HASH='02c68d33f7539ad63a46dd07a1401aadf1bd610177d7005e914e971b674316bf';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const REACT_UI=fs.readFileSync(path.join(ROOT,'react-ui.html'),'utf8');
const PUBLIC_PORT=Number(process.env.PORT||10000);
const INTERNAL_PORT=PUBLIC_PORT+1;
const ORIGINAL_PORT=process.env.PORT;
process.env.PORT=String(INTERNAL_PORT);
await import('./v4.mjs');
process.env.PORT=ORIGINAL_PORT||String(PUBLIC_PORT);

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
function buildRetrievalQuery(question,history=[]){
  const q=String(question||'').trim(); if(!q||!history.length||isSocial(q))return q;
  const n=norm(q);
  const followup=n.length<150||/\b(it|its|this|that|he|she|they|them|there|then|when|where|why|how|what about|and|also|same|above|previous)\b/i.test(n)||/(यह|ये|वह|वो|उसका|उसकी|उसमें|इसका|इसकी|इसमें|कब|कहाँ|कहा|क्यों|कैसे|और|फिर|उसी|ऊपर|पिछल)/u.test(q);
  if(!followup)return q;
  const recent=(history||[]).slice(-8);
  const lastUser=[...recent].reverse().find(m=>m.role==='user');
  const lastAssistant=[...recent].reverse().find(m=>m.role==='assistant');
  const context=[lastUser?.content?`Previous user topic: ${clip(lastUser.content,700)}`:'',lastAssistant?.content?`Previous answer context: ${clip(lastAssistant.content,950)}`:''].filter(Boolean).join(' | ');
  return context?`${q}\nContext for resolving references: ${context}`:q;
}
function mergeSources(qa,base){
  const out=[],seen=new Set();
  for(const s of [...qa,...base]){const key=norm(`${s.origin||''}|${s.title||''}|${s.content||s.excerpt||''}`).slice(0,900);if(!key||seen.has(key))continue;seen.add(key);out.push(s);if(out.length>=12)break;}
  return out;
}
async function rawInternalFetch(urlPath,{method='GET',headers={},body}={}){return fetch(`http://127.0.0.1:${INTERNAL_PORT}${urlPath}`,{method,headers:headersForFetch(headers),body})}
async function internalFetch(urlPath,opts={}){return rawInternalFetch(urlPath,opts)}
function contextualInternalFetch(retrievalQuery){
  return async(urlPath,opts={})=>{
    try{
      const u=new URL(urlPath,'http://internal.local');
      if((opts.method||'GET')==='GET'&&u.pathname==='/api'&&u.searchParams.get('op')==='search'){
        const q=retrievalQuery||u.searchParams.get('q')||'';
        const base=await rawInternalFetch(`/api?op=search&q=${encodeURIComponent(q)}`,opts);
        let baseJson={sources:[]};try{if(base.ok)baseJson=await base.json()}catch{}
        const qaSources=qaSearch(q,{limit:8,minScore:.16}).map(qaResultToSource);
        return new Response(JSON.stringify({query:q,sources:mergeSources(qaSources,baseJson.sources||[])}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
      }
    }catch{}
    return rawInternalFetch(urlPath,opts);
  };
}
async function forward(req,res,body=null,pathOverride=null,headersOverride=null){const target=pathOverride||req.url;const headers=headersOverride||req.headers;const r=await rawInternalFetch(target,{method:req.method,headers,body:body??(req.method==='GET'||req.method==='HEAD'?undefined:await readBody(req))});const b=Buffer.from(await r.arrayBuffer());res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream','cache-control':r.headers.get('cache-control')||'no-store','x-content-type-options':'nosniff'});res.end(b)}

async function handleChat(req,res,body){
  let payload={};try{payload=JSON.parse(body.toString('utf8')||'{}')}catch{}
  const question=String(payload.question||'').trim();if(!question)return sendJson(res,400,{error:'question_required'});
  const history=(Array.isArray(payload.history)?payload.history:[]).slice(-24).map(m=>({role:m.role==='assistant'?'assistant':'user',content:clip(m.content,2400)}));
  const retrievalQuery=buildRetrievalQuery(question,history);
  const result=await answerConversation({question,history,internalFetch:contextualInternalFetch(retrievalQuery)});
  return sendJson(res,200,{...result,contextAware:true});
}
async function health(res){let base={};try{const r=await rawInternalFetch('/health');if(r.ok)base=await r.json()}catch{}return sendJson(res,200,{...base,ok:true,service:'Ekatma Intelligence OS',version:VERSION,frontend:'React 18',canonicalKnowledge:canonicalStats(),qa930:qaStats(),geminiConfigured:!!process.env.GEMINI_API_KEY,answerPolicy:'conversation context > canonical + 930-QA + managed uploads > Gemini natural composition > safe grounded fallback',knowledgePortal:'/knowledge',knowledgeSync:'portal uploads and chat query the same managed knowledge store'});}
function knowledgeOverview(req,res){if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});const facts=canonicalFacts.map(f=>({fact_id:f.fact_id,topic:f.topic,question:f.canonical_question,answer:f.canonical_answer,status:f.status,confidence:f.confidence,verified_on:f.verified_on||null,source_ids:f.source_ids||[]}));const sources=Object.entries(sourceRegistry).map(([source_id,s])=>({source_id,...s}));return sendJson(res,200,{stats:canonicalStats(),qa930:qaStats(),facts,sources,qaSources:qaSourceRegistry,dataPolicy:qaDataPolicy,sync:'live-managed-kb'});}
function qaList(req,res,u){if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});const q=String(u.searchParams.get('q')||'').trim(),category=String(u.searchParams.get('category')||'').trim();const offset=Math.max(0,Number(u.searchParams.get('offset')||0)),limit=Math.max(1,Math.min(Number(u.searchParams.get('limit')||50),100));let rows=q?qaSearch(q,{limit:100,minScore:.10}):qaCorpus;if(category)rows=rows.filter(r=>r.category===category);const categories=[...new Set(qaCorpus.map(x=>x.category))].sort();return sendJson(res,200,{total:rows.length,offset,limit,categories,rows:rows.slice(offset,offset+limit)});}
async function kbStats(req,res){if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});let managed={documents:0,chunks:0,embeddedChunks:0};try{const r=await rawInternalFetch('/api?op=stats');if(r.ok)managed=await r.json()}catch{}return sendJson(res,200,{managed,canonical:canonicalStats(),qa930:qaStats()});}

const gateway=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html'||u.pathname==='/knowledge'||u.pathname==='/knowledge/'))return sendHtml(res,REACT_UI);
  if(req.method==='GET'&&(u.pathname==='/health'||u.pathname==='/ready'))return health(res);
  if(req.method==='GET'&&u.pathname==='/api/probable-questions')return sendJson(res,200,{groups:probableQuestionGroups(),stats:canonicalStats(),qa930:qaStats(),source:'canonical-pack-v1+qa930'});
  if(req.method==='GET'&&u.pathname==='/api/canonical-stats')return sendJson(res,200,{...canonicalStats(),qa930:qaStats()});
  if(req.method==='GET'&&u.pathname==='/api/admin/knowledge-overview')return knowledgeOverview(req,res);
  if(req.method==='GET'&&u.pathname==='/api/admin/qa')return qaList(req,res,u);
  if(req.method==='GET'&&u.pathname==='/api/admin/kb-stats')return kbStats(req,res);
  if(u.pathname.startsWith('/api/admin/')){
    if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});
    const body=req.method==='GET'||req.method==='HEAD'?null:await readBody(req);
    return forward(req,res,body,null,internalAdminHeaders(req));
  }
  if(req.method==='POST'&&(u.pathname==='/api/chat'||u.pathname==='/api'))return handleChat(req,res,await readBody(req));
  return forward(req,res);
}catch(e){console.error('gateway_error',e?.message||e);return sendJson(res,e?.status||500,{error:e?.message||'gateway_error'})}});

setTimeout(()=>gateway.listen(PUBLIC_PORT,'0.0.0.0',()=>console.log(`Ekatma Intelligence OS ${VERSION} on ${PUBLIC_PORT} | React | context-aware | ${qaStats().questions} QA | ${canonicalStats().facts} canonical facts`)),40);
