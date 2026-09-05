import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const KDIR=path.join(ROOT,'knowledge');
const FACT_FILES=['facts-01.json','facts-02.json','facts-03.json','facts-04.json','facts-05.json','facts-06.json'];
export const canonicalFacts=FACT_FILES.flatMap(name=>JSON.parse(fs.readFileSync(path.join(KDIR,name),'utf8')));
export const sourceRegistry=JSON.parse(fs.readFileSync(path.join(KDIR,'sources.json'),'utf8'));
const byId=new Map(canonicalFacts.map(f=>[f.fact_id,f]));

export function normText(s=''){
  return String(s).normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
const STOP=new Set('the a an and or of to in on for from with by is are was were what who how when where tell give show me you your about please kya hai hain ka ki ke ko se me mein mai main aur ya kya कौन कब कहाँ कहां क्या कैसे बताओ बताइए मुझे इसका उसके एक है हैं था थे और या'.split(/\s+/));
function toks(s){return normText(s).split(' ').filter(t=>t.length>1&&!STOP.has(t));}
function grams(s,n=3){const x=` ${normText(s)} `;const g=new Set();for(let i=0;i<=x.length-n;i++)g.add(x.slice(i,i+n));return g;}
function jaccard(a,b){if(!a.size||!b.size)return 0;let n=0;for(const x of a)if(b.has(x))n++;return n/(a.size+b.size-n);}
function tokenF1(a,b){const A=new Set(toks(a)),B=new Set(toks(b));if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return (2*hit)/(A.size+B.size);}
function scorePair(q,c){const nq=normText(q),nc=normText(c);if(!nq||!nc)return 0;if(nq===nc)return 1;if(nc.includes(nq)||nq.includes(nc))return Math.max(.82,Math.min(.96,.82+.12*Math.min(nq.length,nc.length)/Math.max(nq.length,nc.length)));const tf=tokenF1(nq,nc),cg=jaccard(grams(nq),grams(nc));return tf*.66+cg*.34;}
function statusPrefix(f,hi=false){
  if(f.status==='provisional')return hi?'**स्थिति: प्रस्तावित / कार्यशील योजना।**\n\n':'**Status: Provisional / working plan.**\n\n';
  if(f.status==='conflicting_sources')return hi?'**स्थिति: स्रोतों में अंतर है — किसी एक संख्या को final न मानें।**\n\n':'**Status: Sources conflict — do not treat one figure as final.**\n\n';
  if(f.status==='tradition_sensitive')return hi?'**परंपरा-संवेदनशील तथ्य:** अलग परंपराओं में भिन्न विवरण मिल सकते हैं।\n\n':'**Tradition-sensitive:** different lineages may preserve different accounts.\n\n';
  if(f.status==='not_publicly_confirmed')return hi?'**स्थिति: सार्वजनिक रूप से पुष्टि नहीं हुई है।**\n\n':'**Status: Not publicly confirmed.**\n\n';
  if(f.status==='time_sensitive')return hi?'**स्थिति: समय-संवेदनशील जानकारी।**\n\n':'**Status: Time-sensitive information.**\n\n';
  return '';
}
function sourceObjects(f){return (f.source_ids||[]).map((id,i)=>{const s=sourceRegistry[id]||{};return {ref:`S${i+1}`,source_id:id,title:s.title||id,uri:s.url||null,origin:s.type||'approved_source',trust:(s.type||'').includes('internal')?'internal':'approved',excerpt:f.canonical_answer,status:f.status,fact_id:f.fact_id};});}
export function canonicalAnswerObject(f,question){
  const hi=/[\u0900-\u097f]/.test(String(question));
  const sources=sourceObjects(f);
  const cite=sources.length?' [S1]':'';
  let answer=statusPrefix(f,hi)+f.canonical_answer+cite;
  if(f.time_sensitive)answer+=hi?'\n\n_यह time-sensitive तथ्य है; knowledge pack verification date: 5 September 2026._':'\n\n_Time-sensitive fact; knowledge-pack verification date: 5 September 2026._';
  if(f.notes)answer+=`\n\n${f.notes}`;
  return {answer,sources,grounded:true,canonical:true,factId:f.fact_id,status:f.status,confidence:f.confidence,timeSensitive:!!f.time_sensitive};
}
export function specialCanonical(question){
  const n=normText(question),hi=/[\u0900-\u097f]/.test(String(question));
  const yatra=/ekatma|ekatam|एकात्म/.test(n)&&/yatra|यात्रा/.test(n);
  if(yatra&&(/कहाँ से कहाँ|कहा से कहा|where.*(?:to|end)|start.*end|begin.*end/.test(n))){
    const a=byId.get('yatra_003'),b=byId.get('yatra_004');
    if(a&&b){const s1=sourceObjects(a)[0],s2=sourceObjects(b)[0];const answer=hi?'**स्थिति: प्रस्तावित / कार्यशील योजना।**\n\nवर्तमान approved knowledge pack के अनुसार, एकात्म यात्रा 2027 का प्रारम्भ **कालड़ी/वेलियानाडु क्षेत्र, केरल** से प्रस्तावित है और इसका समापन **केदारनाथ, उत्तराखण्ड** में प्रस्तावित है। अंतिम ceremonial start-point और itinerary latest approved Nyas route document के अनुसार मानी जाएगी। [S1][S2]':'**Status: Provisional / working plan.**\n\nThe current approved knowledge pack places the proposed start in the **Kalady/Veliyanadu area of Kerala** and the proposed culmination at **Kedarnath, Uttarakhand**. Final ceremonial start-point and itinerary should follow the latest approved Nyas route document. [S1][S2]';return {answer,sources:[{...s1,ref:'S1'},{...s2,ref:'S2'}],grounded:true,canonical:true,factId:'yatra_003+yatra_004',status:'provisional',confidence:'high',timeSensitive:true};}
  }
  return null;
}
export function matchCanonical(question,{threshold=.67}={}){
  const special=specialCanonical(question);if(special)return {special};
  let best=null;
  for(const fact of canonicalFacts){
    const candidates=[fact.canonical_question,...(fact.variants||[])];
    let score=0,matched='';
    for(const c of candidates){const s=scorePair(question,c);if(s>score){score=s;matched=c;}}
    if(!best||score>best.score)best={fact,score,matched};
  }
  if(!best||best.score<threshold)return null;
  return best;
}
export function probableQuestionGroups(){
  const groups=new Map();
  for(const f of canonicalFacts){if(!groups.has(f.topic))groups.set(f.topic,[]);const arr=groups.get(f.topic);for(const q of [f.canonical_question,...(f.variants||[])])if(!arr.includes(q))arr.push(q);}
  return [...groups].map(([name,questions])=>({name,questions}));
}
export function canonicalStats(){
  const status={},topics={};for(const f of canonicalFacts){status[f.status]=(status[f.status]||0)+1;topics[f.topic]=(topics[f.topic]||0)+1;}
  return {facts:canonicalFacts.length,questionForms:canonicalFacts.reduce((n,f)=>n+1+(f.variants?.length||0),0),topics:Object.keys(topics).length,status,topicCounts:topics,sources:Object.keys(sourceRegistry).length};
}
