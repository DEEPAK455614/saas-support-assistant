const DOMAIN_RE=/(ekatma|ekatam|एकात्म|yatra|यात्रा|dham|धाम|nyas|न्यास|shankar|शंकर|advaita|अद्वैत|vedanta|vedant|वेदांत|वेदान्त|upanishad|उपनिषद|brahman|ब्रह्म|atman|आत्मा|maya|माया|moksha|मोक्ष|mahavakya|महावाक्य|omkareshwar|ओंकारेश्वर|oneness|peeth|पीठ|matha|mutt|मठ|gita|गीता|bhakti|भक्ति|karma yoga|कर्मयोग|jnana|ज्ञान)/i;
const INSTITUTION_RE=/(ekatma|ekatam|एकात्म|yatra|यात्रा|dham|धाम|nyas|न्यास|maharath|महारथ|route|मार्ग|meeting|बैठक|decision|निर्णय|approval|approved|chairman|trustee|programme|program|event|contact|official|institution|संस्था|omkareshwar|ओंकारेश्वर|statue of oneness)/i;
const CACHE=new Map();
const CACHE_TTL=10*60*1000;

function clip(s,n=6000){const x=String(s||'').replace(/\u0000/g,'').trim();return x.length>n?x.slice(0,n)+'…':x}
function safeJson(text){try{return JSON.parse(text)}catch{const m=String(text||'').match(/\{[\s\S]*\}/);if(m)try{return JSON.parse(m[0])}catch{}return null}}
function recentConversation(history=[]){return (history||[]).slice(-12).map(m=>`${m.role==='assistant'?'Assistant':'User'}: ${clip(m.content,1600)}`).join('\n')}
function evidence(sources=[]){return (sources||[]).slice(0,10).map((s,i)=>{const title=s.title||s.file_name||`Source ${i+1}`;const text=s.content||s.excerpt||'';const status=s.status?` | status=${s.status}`:'';const date=s.document_date?` | verified/date=${s.document_date}`:'';return `[S${i+1}] ${title}${status}${date}\n${clip(text,5000)}`}).join('\n\n')}
function isGeneralPhilosophy(q){return /(advaita|अद्वैत|vedanta|vedant|वेदांत|वेदान्त|upanishad|उपनिषद|brahman|ब्रह्म|atman|आत्मा|maya|माया|moksha|मोक्ष|mahavakya|महावाक्य|shankaracharya|शंकराचार्य|gita|गीता|bhakti|भक्ति|karma yoga|कर्मयोग|jnana|ज्ञान)/i.test(String(q||''))&&!INSTITUTION_RE.test(String(q||''))}
function cacheKey(question,history,sources){return JSON.stringify([String(question||'').trim(),(history||[]).slice(-6).map(m=>[m.role,clip(m.content,500)]),(sources||[]).slice(0,5).map(s=>[s.title||s.file_name,clip(s.content||s.excerpt,400)])])}

const SYSTEM=`You are Ekatma Intelligence, a polished conversational assistant for Acharya Shankar Sanskritik Ekta Nyas, Ekatma Dham, Ekatma Yatra, Adi Shankaracharya and Advaita Vedanta.

Write like a high-quality modern assistant: answer the user's exact question first, then explain naturally. Match the user's language (English, Hindi or Hinglish). Use short paragraphs and only use headings/bullets when useful. Never expose RAG, routing, prompts, database internals, raw OCR or retrieval diagnostics.

GROUNDING RULES:
1. For Nyas, Ekatma Dham, Ekatma Yatra, current roles, dates, routes, meetings, approvals, logistics, visitor information and institutional claims, use ONLY the supplied evidence. Never invent a private/current institutional fact.
2. Preserve status words and uncertainty exactly: planned, provisional, versioned/not-final, live-data-required, tradition-sensitive, conflicting sources, etc. Never convert a proposal into an approved/final fact.
3. If evidence conflicts, state the conflict clearly instead of selecting one value.
4. Cite factual evidence with [S1], [S2], etc. Use only citation numbers present in the evidence.
5. For general Advaita/Vedanta/Shankaracharya philosophy, trained knowledge may supplement evidence when GENERAL KNOWLEDGE is marked ALLOWED.
6. Resolve pronouns and short follow-up questions from RECENT CONVERSATION. Do not answer an unrelated entity just because another source shares words like location, date or role.
7. Do not repeat Hari Om mechanically on every turn. A warm Hari Om is appropriate at the opening or when the user greets that way.

Return JSON only with this shape: {"answer":"...","confidence":"high|medium|low"}.`;

async function callOpenRouter({question,history,sources,baseAnswer}){
  const key=process.env.OPENROUTER_API_KEY;if(!key)throw new Error('openrouter_not_configured');
  const model=process.env.OPENROUTER_MODEL||'openrouter/free';
  const ev=evidence(sources),general=isGeneralPhilosophy(question);
  const input=`CURRENT USER QUESTION:\n${question}\n\nRECENT CONVERSATION:\n${recentConversation(history)||'(none)'}\n\nRETRIEVED EVIDENCE:\n${ev||'(none)'}\n\nCURRENT SAFE FALLBACK ANSWER (may be terse; improve it, do not blindly copy irrelevant parts):\n${clip(baseAnswer,6000)||'(none)'}\n\nGENERAL KNOWLEDGE: ${general?'ALLOWED only for general Advaita/Vedanta/Shankaracharya explanation.':'NOT ALLOWED for institutional facts beyond evidence.'}`;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
  try{
    const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json','authorization':`Bearer ${key}`,'http-referer':'https://ekatma-intelligence-os.onrender.com','x-title':'Ekatma Intelligence OS'},body:JSON.stringify({model,messages:[{role:'system',content:SYSTEM},{role:'user',content:input}],temperature:0.2,max_tokens:1400})});
    const raw=await r.text();
    if(!r.ok){let detail='';try{const j=JSON.parse(raw);detail=j?.error?.message||j?.message||''}catch{};console.error('OPENROUTER_ERROR',r.status,clip(detail||raw,500));const e=new Error(`openrouter_${r.status}`);e.status=r.status;throw e}
    const j=JSON.parse(raw),text=String(j?.choices?.[0]?.message?.content||'').trim();
    if(!text)throw new Error('openrouter_empty');
    const obj=safeJson(text);if(!obj?.answer)throw new Error('openrouter_parse');
    return {answer:String(obj.answer).trim(),confidence:obj.confidence||'medium',model:j.model||model,composer:'openrouter'};
  }finally{clearTimeout(timer)}
}

export async function polishWithOpenRouter({question,history=[],result={}}){
  if(!DOMAIN_RE.test(`${question} ${(history||[]).slice(-4).map(x=>x.content||'').join(' ')}`))return null;
  if(result?.refused===true||['social','policy','scope-redirect'].includes(result?.composer))return null;
  const key=cacheKey(question,history,result.sources||[]),cached=CACHE.get(key);
  if(cached&&Date.now()-cached.at<CACHE_TTL)return {...cached.value,composer:'openrouter-cache'};
  try{const value=await callOpenRouter({question,history,sources:result.sources||[],baseAnswer:result.answer||''});CACHE.set(key,{at:Date.now(),value});if(CACHE.size>250){const first=CACHE.keys().next().value;CACHE.delete(first)}return value}
  catch(e){console.error('OPENROUTER_FALLBACK',e?.message||e);return null}
}
