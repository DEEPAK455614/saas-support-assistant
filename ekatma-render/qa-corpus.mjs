import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, inflateRawSync } from 'node:zlib';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PARTS=Array.from({length:6},(_,i)=>path.join(ROOT,'knowledge',`qa-930.part${String(i+1).padStart(2,'0')}.b64`));
const b64=PARTS.map(p=>fs.readFileSync(p,'utf8').replace(/\s+/g,'')).join('');
const compressed=Buffer.from(b64,'base64');
let decoded;
try{
  decoded=gunzipSync(compressed);
}catch(err){
  // The corpus was split across repository text parts. If only the gzip trailer/CRC
  // is damaged by transport, the raw DEFLATE stream is still complete. Inflate it
  // directly so the knowledge corpus remains available instead of crashing startup.
  if(compressed.length<19||compressed[0]!==0x1f||compressed[1]!==0x8b)throw err;
  decoded=inflateRawSync(compressed.subarray(10,compressed.length-8));
}
const payload=JSON.parse(decoded.toString('utf8'));

export const qaCorpus=Array.isArray(payload.qa)?payload.qa:[];
export const qaSourceRegistry=Array.isArray(payload.sources)?payload.sources:[];
export const qaDataPolicy=payload.policy||{};
export const qaVersion=payload.version||'ekatma-dham-930-qa';
export const qaVerifiedOn=payload.verified_on||'2026-09-06';

function norm(s=''){
  return String(s).normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
function tokenSet(s){return new Set(norm(s).split(' ').filter(x=>x.length>1));}
function overlap(a,b){if(!a.size||!b.size)return 0;let hit=0;for(const x of a)if(b.has(x))hit++;return hit/Math.max(1,Math.min(a.size,b.size));}
function trigrams(s){const x=`  ${norm(s)}  `;const out=new Set();for(let i=0;i<x.length-2;i++)out.add(x.slice(i,i+3));return out;}
function jaccard(a,b){if(!a.size||!b.size)return 0;let hit=0;for(const x of a)if(b.has(x))hit++;return hit/(a.size+b.size-hit||1);}

const INDEX=qaCorpus.map(row=>{
  const hay=[row.category,row.question,row.answer,row.status,row.primary_source].filter(Boolean).join(' ');
  return {row,nq:norm(row.question),nh:norm(hay),tokens:tokenSet(hay),tris:trigrams(row.question)};
});

export function qaStats(){
  const categories=[...new Set(qaCorpus.map(x=>x.category).filter(Boolean))];
  const statuses={}; const confidence={};
  for(const x of qaCorpus){statuses[x.status||'unknown']=(statuses[x.status||'unknown']||0)+1;confidence[x.confidence||'unknown']=(confidence[x.confidence||'unknown']||0)+1;}
  return {version:qaVersion,verifiedOn:qaVerifiedOn,questions:qaCorpus.length,categories:categories.length,sources:qaSourceRegistry.length,statuses,confidence};
}

export function qaSearch(query,{limit=8,minScore=.18}={}){
  const q=norm(query); if(!q)return [];
  const qt=tokenSet(q),qg=trigrams(q);
  const scored=[];
  for(const it of INDEX){
    let score=0;
    if(it.nq===q)score=1;
    else {
      if(it.nq.includes(q)||q.includes(it.nq))score=Math.max(score,.92);
      score=Math.max(score,overlap(qt,it.tokens)*.82);
      score=Math.max(score,jaccard(qg,it.tris)*.72);
      const category=norm(it.row.category||'');
      if(category&&q.includes(category))score+=.06;
      const source=norm(it.row.primary_source||'');
      if(source&&q.includes(source))score+=.03;
    }
    if(score>=minScore)scored.push({score:Math.min(score,1),...it.row});
  }
  scored.sort((a,b)=>b.score-a.score||Number(a.id||0)-Number(b.id||0));
  return scored.slice(0,Math.max(1,Math.min(Number(limit)||8,20)));
}

export function qaResultToSource(result){
  return {
    title:`930 QA · ${result.category||'Knowledge'}`,
    file_name:'Ekatma_Dham_930_QA_Knowledge_Base.xlsx',
    content:[
      `QUESTION: ${result.question}`,
      `ANSWER: ${result.answer}`,
      result.status?`STATUS: ${result.status}`:'',
      result.confidence?`CONFIDENCE: ${result.confidence}`:'',
      result.primary_source?`PRIMARY_SOURCE: ${result.primary_source}`:'',
      result.last_verified?`LAST_VERIFIED: ${result.last_verified}`:''
    ].filter(Boolean).join('\n'),
    excerpt:result.answer||'',
    trust:String(result.confidence||'').toLowerCase()==='high'?'verified':'working',
    origin:'qa_930',
    document_date:result.last_verified||qaVerifiedOn,
    qa_id:result.id,
    category:result.category,
    status:result.status,
    score:result.score
  };
}
