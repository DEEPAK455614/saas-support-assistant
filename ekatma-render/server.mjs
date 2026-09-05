import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { canonicalFacts, sourceRegistry, probableQuestionGroups, canonicalStats } from './canonical-layer.mjs';
import { answerConversation } from './conversation-engine.mjs';
import './canonical-sync.mjs';

const VERSION='4.4.0';
const PORTAL_HASH='02c68d33f7539ad63a46dd07a1401aadf1bd610177d7005e914e971b674316bf';
const PUBLIC_PORT=Number(process.env.PORT||10000);
const INTERNAL_PORT=PUBLIC_PORT+1;
const ORIGINAL_PORT=process.env.PORT;
process.env.PORT=String(INTERNAL_PORT);
await import('./v4.mjs');
process.env.PORT=ORIGINAL_PORT||String(PUBLIC_PORT);

async function readBody(req,max=40*1024*1024){const parts=[];let n=0;for await(const c of req){n+=c.length;if(n>max)throw new Error('request_too_large');parts.push(c)}return Buffer.concat(parts)}
function headersForFetch(headers={}){const out={};for(const[k,v]of Object.entries(headers)){if(v==null||['host','connection','content-length','transfer-encoding'].includes(k.toLowerCase()))continue;out[k]=Array.isArray(v)?v.join(', '):String(v)}return out}
async function internalFetch(urlPath,{method='GET',headers={},body}={}){return fetch(`http://127.0.0.1:${INTERNAL_PORT}${urlPath}`,{method,headers:headersForFetch(headers),body})}
function sendJson(res,status,obj){const out=Buffer.from(JSON.stringify(obj));res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':out.length,'x-content-type-options':'nosniff'});res.end(out)}
async function forward(req,res,body=null,pathOverride=null,headersOverride=null){const target=pathOverride||req.url;const headers=headersOverride||req.headers;const r=await internalFetch(target,{method:req.method,headers,body:body??(req.method==='GET'||req.method==='HEAD'?undefined:await readBody(req))});const b=Buffer.from(await r.arrayBuffer());res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream','cache-control':r.headers.get('cache-control')||'no-store','x-content-type-options':'nosniff'});res.end(b)}
function safeEq(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y)}
function portalOK(req){const supplied=String(req.headers['x-admin-key']||'');if(!supplied)return false;const got=createHash('sha256').update(supplied).digest('hex');return safeEq(got,PORTAL_HASH)}
function internalAdminHeaders(req){return{...req.headers,'x-admin-key':process.env.EKATMA_ADMIN_TOKEN||''}}

async function handleChat(req,res,body){let payload={};try{payload=JSON.parse(body.toString('utf8')||'{}')}catch{}const question=String(payload.question||'').trim();if(!question)return sendJson(res,400,{error:'question_required'});const result=await answerConversation({question,history:Array.isArray(payload.history)?payload.history:[],internalFetch});return sendJson(res,200,result)}
async function health(res){let base={};try{const r=await internalFetch('/health');if(r.ok)base=await r.json()}catch{}return sendJson(res,200,{...base,ok:true,service:'Ekatma Intelligence OS',version:VERSION,canonicalKnowledge:canonicalStats(),geminiConfigured:!!process.env.GEMINI_API_KEY,answerPolicy:'conversation-first > canonical/managed knowledge > Gemini natural composition > Advaita/Vedanta Gemini domain knowledge when needed > official institutional fallback > natural deterministic fallback',knowledgePortal:'/knowledge',knowledgeSync:'portal uploads are ingested into the same managed knowledge store queried by chat'});}
function knowledgeOverview(req,res){if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});const facts=canonicalFacts.map(f=>({fact_id:f.fact_id,topic:f.topic,question:f.canonical_question,answer:f.canonical_answer,status:f.status,confidence:f.confidence,verified_on:f.verified_on||null,source_ids:f.source_ids||[]}));const sources=Object.entries(sourceRegistry).map(([source_id,s])=>({source_id,...s}));return sendJson(res,200,{stats:canonicalStats(),facts,sources,sync:'live-managed-kb'});}

const gateway=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&(u.pathname==='/health'||u.pathname==='/ready'))return health(res);
  if(req.method==='GET'&&u.pathname==='/api/probable-questions')return sendJson(res,200,{groups:probableQuestionGroups(),stats:canonicalStats(),source:'canonical-pack-v1'});
  if(req.method==='GET'&&u.pathname==='/api/canonical-stats')return sendJson(res,200,canonicalStats());
  if(req.method==='GET'&&u.pathname==='/api/admin/knowledge-overview')return knowledgeOverview(req,res);
  if(u.pathname.startsWith('/api/admin/')){
    if(!portalOK(req))return sendJson(res,401,{error:'unauthorized'});
    const body=req.method==='GET'||req.method==='HEAD'?null:await readBody(req);
    return forward(req,res,body,null,internalAdminHeaders(req));
  }
  if(req.method==='POST'&&(u.pathname==='/api/chat'||u.pathname==='/api'))return handleChat(req,res,await readBody(req));
  if(req.method==='GET'&&(u.pathname==='/knowledge'||u.pathname==='/knowledge/'))return forward(req,res,null,'/');
  return forward(req,res);
}catch(e){console.error('gateway_error',e?.message||e);return sendJson(res,500,{error:'gateway_error'})}});

setTimeout(()=>gateway.listen(PUBLIC_PORT,'0.0.0.0',()=>console.log(`Ekatma Intelligence OS ${VERSION} on ${PUBLIC_PORT} | portal and chat share managed knowledge | ${canonicalStats().facts} facts / ${canonicalStats().reverseQuestionForms} reverse tests`)),40);
