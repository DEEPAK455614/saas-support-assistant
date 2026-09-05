import { matchCanonical, canonicalAnswerObject, canonicalFacts } from './canonical-layer.mjs';

const FACT_MAP=new Map(canonicalFacts.map(f=>[f.fact_id,f]));
const DOMAIN_TERMS=[
  'ekatma','ekatam','एकात्म','yatra','यात्रा','dham','धाम','nyas','न्यास','acharya shankar','आचार्य शंकर',
  'adi shankar','adi shankara','आदि शंकर','shankaracharya','शंकराचार्य','advaita','अद्वैत','vedanta','vedant','वेदांत','वेदान्त',
  'upanishad','उपनिषद','brahman','ब्रह्म','atman','आत्मा','maya','माया','moksha','मोक्ष','mahavakya','महावाक्य',
  'sringeri','शृंगेरी','श्रृंगेरी','dwarka','द्वारका','puri','पुरी','jyotirmath','ज्योतिर्मठ','peetha','peeth','peetham','पीठ','matha','mutt','मठ','kanchi','कांची',
  'omkareshwar','ओंकारेश्वर','oneness','statue of oneness','maharath','महारथ','rath yatra','रथ यात्रा','kaladi','kalady','कालड़ी','kedarnath','केदारनाथ',
  'govinda bhagavatpada','गोविन्द भगवत्पाद','sannyasa','संन्यास','shastra','शास्त्र','gita','गीता','brahma sutra','ब्रह्मसूत्र',
  'bhakti','भक्ति','karma yoga','कर्मयोग','jnana','ज्ञान','jivanmukti','जीवन्मुक्ति','shravan','श्रवण','manan','मनन','nididhyasan','निदिध्यासन',
  'dvaita','द्वैत','vishishtadvaita','विशिष्टाद्वैत','ramanuja','रामानुज','madhva','मध्व'
];
const INSTITUTION_TERMS=['ekatma','ekatam','एकात्म','yatra','यात्रा','dham','धाम','nyas','न्यास','maharath','महारथ','rath yatra','रथ यात्रा','meeting','बैठक','decision','निर्णय','approved','approval','route','मार्ग','chairman','trustee','कार्यक्रम','programme','event','contact','team','official','institution','संस्था'];
const PHILOSOPHY_TERMS=['advaita','अद्वैत','vedanta','vedant','वेदांत','वेदान्त','upanishad','उपनिषद','brahman','ब्रह्म','atman','आत्मा','maya','माया','moksha','मोक्ष','mahavakya','महावाक्य','adi shankar','adi shankara','आदि शंकर','shankaracharya','शंकराचार्य','gita','गीता','brahma sutra','ब्रह्मसूत्र','bhakti','भक्ति','karma yoga','कर्मयोग','jivanmukti','जीवन्मुक्ति'];

function norm(s=''){return String(s).normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim()}
function hasAny(n,list){return list.some(x=>n.includes(norm(x)))}
function hasDevanagari(s){return /[\u0900-\u097f]/.test(String(s))}
function firstTurn(history=[]){return !(history||[]).some(m=>m.role==='assistant')}
function safeJson(text){try{return JSON.parse(text)}catch{const m=String(text||'').match(/\{[\s\S]*\}/);if(m)try{return JSON.parse(m[0])}catch{}return null}}
function greet(q){
  const n=norm(q);
  if(/^(hari ?om|hariom|हरि ?ओम|हरिः ?ॐ)$/.test(n))return hasDevanagari(q)?'हरिः ॐ 🙏\n\nस्वागत है। आप एकात्म धाम, एकात्म यात्रा, न्यास, आदि शंकराचार्य या अद्वैत वेदान्त से जुड़ा कोई भी प्रश्न पूछ सकते हैं।':'Hari Om 🙏\n\nWelcome. Ask me anything about Ekatma Dham, Ekatma Yatra, the Nyas, Adi Shankaracharya or Advaita Vedanta.';
  if(/^(जय ?शंकर|जयशंकर|jai ?shankar|jay ?shankar)$/.test(n))return hasDevanagari(q)?'जय शंकर 🙏\n\nपूछिए—एकात्म, न्यास या अद्वैत वेदान्त से जुड़ी किसी भी बात पर मैं मदद कर सकता हूँ।':'Jai Shankar 🙏\n\nAsk me anything about Ekatma, the Nyas or Advaita Vedanta.';
  if(/^(hi+|hii+|hello+|hey+|namaste|namaskar|pranam|नमस्ते|नमस्कार|प्रणाम|good morning|good evening|good afternoon)$/.test(n))return hasDevanagari(q)?'हरिः ॐ 🙏 नमस्ते!\n\nमैं Ekatma Intelligence हूँ। एकात्म धाम, एकात्म यात्रा, आचार्य शंकर सांस्कृतिक एकता न्यास, आदि शंकराचार्य और अद्वैत वेदान्त—इनमें से किसी भी विषय पर पूछिए।':'Hari Om 🙏 Hello!\n\nI’m Ekatma Intelligence. Ask me anything about Ekatma Dham, Ekatma Yatra, Acharya Shankar Sanskritik Ekta Nyas, Adi Shankaracharya or Advaita Vedanta.';
  if(/^(thanks|thank you|dhanyavad|धन्यवाद|शुक्रिया)$/.test(n))return hasDevanagari(q)?'हरिः ॐ 🙏 आपका स्वागत है। जब चाहें आगे पूछिए।':'Hari Om 🙏 You’re welcome. Ask whenever you’re ready.';
  if(/^(how are you|kaise ho|कैसे हो)$/.test(n))return hasDevanagari(q)?'मैं अच्छा हूँ 🙏 हरिः ॐ। आप बताइए—आज एकात्म, न्यास या अद्वैत पर क्या जानना चाहते हैं?':'I’m doing well 🙏 Hari Om. What would you like to explore today—Ekatma, the Nyas, or Advaita?';
  return null;
}
function isInjection(q){return /(ignore (all|the|your) (previous|prior|system)|reveal (your|the) (prompt|instructions)|system prompt|jailbreak|forget your rules|override.*instructions|इन निर्देशों को भूल|सिस्टम प्रॉम्प्ट|अपने नियम भूल)/i.test(norm(q))}
function inScope(q,history=[]){
  const n=norm(q);if(hasAny(n,DOMAIN_TERMS))return true;
  const recent=(history||[]).slice(-6).map(m=>norm(m.content||'')).join(' ');
  return recent&&hasAny(recent,DOMAIN_TERMS)&&n.length<260;
}
function institutional(q){return hasAny(norm(q),INSTITUTION_TERMS)}
function philosophical(q){return hasAny(norm(q),PHILOSOPHY_TERMS)}
function welcomePrefix(q,history){return firstTurn(history)&&!greet(q)?'हरिः ॐ 🙏\n\n':''}
function cleanSource(s,i){return {ref:`S${i+1}`,title:s.title||s.file_name||'Source',file_name:s.file_name||'',page_number:s.page_number||s.page||null,section_title:s.section_title||null,content:s.content||s.excerpt||'',excerpt:s.excerpt||s.content||'',trust:s.trust||'verified',origin:s.origin||'knowledge',uri:s.uri||null,document_date:s.document_date||null}}
function evidenceText(sources){return sources.map((s,i)=>`[S${i+1}] ${s.title||s.file_name||'Source'}${s.document_date?` | date ${s.document_date}`:''}${s.page_number?` | page ${s.page_number}`:''}${s.section_title?` | ${s.section_title}`:''}\n${String(s.content||s.excerpt||'').slice(0,7000)}`).join('\n\n')}

function resolveCoreFact(question){
  const n=norm(question),pick=id=>FACT_MAP.get(id)||null;
  const adv=hasAny(n,['advaita','अद्वैत','vedanta','vedant','वेदांत','वेदान्त']);
  if(hasAny(n,['aham brahmasmi','अहं ब्रह्मास्मि']))return pick('adv_010');
  if(hasAny(n,['tat tvam asi','तत् त्वम् असि','तत्त्वमसि']))return pick('adv_011');
  if(hasAny(n,['sarvam khalvidam','सर्वं खल्विदं ब्रह्म','सर्व खल्विदं ब्रह्म']))return pick('adv_012');
  if(hasAny(n,['vasudhaiva kutumbakam','वसुधैव कुटुम्बकम्','वसुधैव कुटुम्बकम']))return pick('adv_013');
  if(hasAny(n,['brahman','ब्रह्म'])&&hasAny(n,['atman','आत्मा','आत्मन्']))return pick('adv_004');
  if(hasAny(n,['brahman','ब्रह्म']))return pick('adv_002');
  if(hasAny(n,['atman','आत्मा','आत्मन्']))return pick('adv_003');
  if(hasAny(n,['maya','माया']))return pick('adv_005');
  if(hasAny(n,['moksha','मोक्ष']))return pick('adv_006');
  if(hasAny(n,['jivanmukti','जीवन्मुक्ति','jivanmukta','जीवन्मुक्त']))return pick('adv_007');
  if(hasAny(n,['shravan','श्रवण','manan','मनन','nididhyasan','निदिध्यासन']))return pick('adv_008');
  if(adv&&hasAny(n,['bhakti','भक्ति','karma','कर्म']))return pick('adv_009');
  if(adv&&hasAny(n,['diversity','uniformity','विविधता','एकरूपता']))return pick('adv_014');
  if(adv&&hasAny(n,['relevant','today','modern','आज','आज के समय','21st']))return pick('adv_015');
  if(adv&&hasAny(n,['what','meaning','मतलब','क्या है','samjha','समझा','समझाइए','basic','बेसिक']))return pick('adv_001');
  if(hasAny(n,['adi shankar','adi shankara','आदि शंकर','shankaracharya','शंकराचार्य'])){
    if(hasAny(n,['guru','गुरु']))return pick('shankara_004');
    if(hasAny(n,['parents','माता','पिता','mother','father','aryamba','shivaguru']))return pick('shankara_003');
    if(hasAny(n,['born','birth','जन्म']))return pick('shankara_002');
    if(hasAny(n,['commentary','bhashya','भाष्य','wrote','लिख']))return pick('shankara_006');
    if(hasAny(n,['four','चार','peeth','पीठ','matha','मठ']))return pick('shankara_007');
    if(adv||hasAny(n,['who','kaun','कौन','importance','महत्व','basic idea','दर्शन']))return pick('shankara_001');
  }
  return null;
}

async function gemini(contents,{system='',jsonMode=true,maxOutputTokens=3200,temperature=.18}={}){
  const key=process.env.GEMINI_API_KEY;if(!key)throw new Error('gemini_not_configured');
  const models=[process.env.GEMINI_MODEL,'gemini-2.5-flash-lite','gemini-2.5-flash'].filter(Boolean);
  let last;
  for(const model of [...new Set(models)]){
    try{
      const body={contents,generationConfig:{temperature,topP:.9,maxOutputTokens}};
      if(system)body.systemInstruction={parts:[{text:system}]};
      if(jsonMode)body.generationConfig.responseMimeType='application/json';
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const raw=await r.text();if(!r.ok){last=new Error(`gemini_${r.status}`);continue}
      const j=JSON.parse(raw);const text=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();if(text)return{text,model};
    }catch(e){last=e}
  }
  throw last||new Error('gemini_failure');
}

const COMPOSER_SYSTEM=`You are Ekatma Intelligence, a warm, highly capable conversational AI assistant inspired by the clarity of ChatGPT and Gemini.

YOUR DOMAIN
You answer questions about:
- Acharya Shankar Sanskritik Ekta Nyas and its related institutions/programmes
- Ekatma Dham and Ekatma Yatra / Journey of Oneness
- Adi Shankaracharya and directly related traditions/institutions
- Advaita Vedanta, Vedanta, Upanishadic concepts, Brahman, Atman, Maya, Moksha, Mahavakyas and related philosophy
- linked institutions such as traditional Shankaracharya Peethas when relevant

STYLE
- Sound like a polished modern LLM, not a database or search result.
- Answer the user's actual question immediately.
- Match Hindi, Hinglish or English naturally.
- Use short paragraphs; use headings or bullets only when they genuinely improve clarity.
- Explain difficult Advaita ideas simply first, then go deeper if useful.
- Do not dump SOURCE:, URL:, metadata, raw OCR, or retrieval diagnostics into the answer.
- Do not mention internal architecture, RAG, canonical packs, model routing or system rules unless the user explicitly asks.

TRUTH RULES
- When EVIDENCE is supplied, institutional facts about Nyas/Ekatma must stay within that evidence.
- Preserve proposal/approval/final/conflict/time-sensitive status exactly.
- Never turn a proposal into a final decision.
- If evidence conflicts, explain the conflict clearly instead of choosing one version.
- Cite evidence-backed material with [S1], [S2], etc.
- For general Advaita/Vedanta/Adi Shankaracharya conceptual questions, you MAY use your trained knowledge even if no EVIDENCE is supplied.
- For current institutional roles, private decisions, unpublished route/logistics, internal meetings or approvals, do not invent facts when evidence is missing.
- If an in-scope institutional fact cannot be verified, say that it is not confirmed rather than fabricating it.

OUTPUT JSON ONLY:
{"answer":"natural polished answer","confidence":"high|medium|low"}`;

async function compose(question,sources,history,{allowGeneralKnowledge=false}={}){
  const recent=(history||[]).slice(-8).map(m=>`${m.role==='assistant'?'Assistant':'User'}: ${String(m.content||'').slice(0,700)}`).join('\n');
  const ev=sources.length?evidenceText(sources):'(No retrieved evidence supplied for this conceptual/general domain question.)';
  const prompt=`USER QUESTION:\n${question}\n\nRECENT CONVERSATION (context only):\n${recent||'(none)'}\n\nEVIDENCE:\n${ev}\n\nGENERAL-KNOWLEDGE PERMISSION:\n${allowGeneralKnowledge?'Allowed for general Advaita/Vedanta/history explanation. Do not invent private/current Nyas facts.':'Not allowed for institutional facts beyond the supplied evidence.'}`;
  const out=await gemini([{role:'user',parts:[{text:prompt}]}],{system:COMPOSER_SYSTEM,jsonMode:true,maxOutputTokens:3600,temperature:.16});
  const obj=safeJson(out.text);if(!obj?.answer)throw new Error('gemini_parse_error');
  return{answer:String(obj.answer).trim(),confidence:obj.confidence||'medium',model:out.model};
}

function extractCanonicalAnswer(text=''){
  const m=String(text).match(/(?:^|\n)ANSWER:\s*([\s\S]*?)(?=\n(?:SOURCE_IDS|QUESTION_VARIANTS|NOTES|FACT_ID|STATUS|CONFIDENCE|TIME_SENSITIVE):|$)/i);
  return m?m[1].trim():'';
}
function cleanSentence(s=''){return String(s).replace(/\s+/g,' ').replace(/^(source|url|fact_id|status|confidence|question|question_variants)\s*:\s*/i,'').trim()}
function naturalFallback(question,sources,history=[]){
  const prefix=welcomePrefix(question,history),lines=[];
  for(const s of sources.slice(0,5)){
    const raw=String(s.content||s.excerpt||'');const canonical=extractCanonicalAnswer(raw);
    if(canonical){lines.push(canonical);continue}
    const candidates=raw.split(/(?<=[।.!?])\s+|\n+/u).map(cleanSentence).filter(x=>x.length>35&&!/^(source|url|https?:)/i.test(x));
    if(candidates[0])lines.push(candidates[0]);
    if(lines.length>=3)break;
  }
  const uniq=[...new Set(lines)].slice(0,3);if(!uniq.length)return null;
  const body=uniq.map((x,i)=>`${x} [S${Math.min(i+1,sources.length)}]`).join('\n\n');
  return{answer:prefix+body,sources,grounded:true,composer:'evidence-natural-fallback',confidence:'medium'};
}

async function searchKnowledge(question,internalFetch){
  try{const r=await internalFetch(`/api?op=search&q=${encodeURIComponent(question)}`);if(!r.ok)return[];const j=await r.json();return (j.sources||[]).slice(0,8).map(cleanSource)}catch{return[]}
}

export async function answerConversation({question,history=[],internalFetch}){
  const q=String(question||'').trim();
  const greeting=greet(q);if(greeting)return{answer:greeting,sources:[],grounded:true,conversational:true,inScope:true,composer:'social'};
  if(isInjection(q))return{answer:'हरिः ॐ 🙏\n\nमैं अपने grounding और safety rules को bypass नहीं कर सकता। लेकिन एकात्म, न्यास, आदि शंकराचार्य या अद्वैत वेदान्त से जुड़ा कोई वास्तविक प्रश्न पूछिए—मैं पूरी मदद करूँगा।',sources:[],grounded:true,refused:true,inScope:true,composer:'policy'};
  if(!inScope(q,history))return{answer:'हरिः ॐ 🙏\n\nमैं **Ekatma Intelligence** हूँ। मेरी विशेषज्ञता एकात्म धाम, एकात्म यात्रा, आचार्य शंकर सांस्कृतिक एकता न्यास, आदि शंकराचार्य और अद्वैत वेदान्त में है। उसी क्षेत्र से जुड़ा प्रश्न पूछिए—मैं विस्तार से उत्तर दूँगा।',sources:[],grounded:true,refused:true,inScope:false,composer:'scope-redirect'};

  const coreFact=resolveCoreFact(q);
  const canonical=coreFact?{fact:coreFact,score:1,matched:'core-concept-resolver'}:matchCanonical(q,{threshold:.64});
  if(canonical?.special){
    const sources=(canonical.special.sources||[]).map(cleanSource);
    try{const c=await compose(q,sources,history,{allowGeneralKnowledge:false});return{...c,answer:welcomePrefix(q,history)+c.answer,sources,grounded:true,canonical:true,status:canonical.special.status,confidence:c.confidence,composer:'gemini-canonical'}}catch{}
    return{...canonical.special,answer:welcomePrefix(q,history)+canonical.special.answer,composer:'canonical-deterministic-fallback'};
  }
  if(canonical?.fact){
    const base=canonicalAnswerObject(canonical.fact,q),sources=(base.sources||[]).map(cleanSource);
    try{const c=await compose(q,sources,history,{allowGeneralKnowledge:philosophical(q)&&!institutional(q)});return{...base,...c,answer:welcomePrefix(q,history)+c.answer,sources,composer:'gemini-canonical'}}catch{}
    return{...base,answer:welcomePrefix(q,history)+base.answer,composer:'canonical-deterministic-fallback'};
  }

  const sources=await searchKnowledge(q,internalFetch);
  if(sources.length){
    try{const c=await compose(q,sources,history,{allowGeneralKnowledge:philosophical(q)&&!institutional(q)});return{...c,answer:welcomePrefix(q,history)+c.answer,sources,grounded:true,composer:'gemini-grounded'}}catch{}
    const fallback=naturalFallback(q,sources,history);if(fallback)return fallback;
  }

  if(philosophical(q)||!institutional(q)){
    try{const c=await compose(q,[],history,{allowGeneralKnowledge:true});return{...c,answer:welcomePrefix(q,history)+c.answer,sources:[],grounded:false,knowledgeMode:'gemini-general-domain',composer:'gemini-domain'}}catch{}
  }

  try{
    const r=await internalFetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:q,history})});
    if(r.ok){const j=await r.json();if(j?.answer&&!j.refused)return{...j,answer:welcomePrefix(q,history)+String(j.answer),composer:j.webFallback?'gemini-official-web':'legacy-grounded'};}
  }catch{}

  return{answer:welcomePrefix(q,history)+(hasDevanagari(q)?'इस प्रश्न का विश्वसनीय उत्तर अभी उपलब्ध knowledge या Gemini service से पुष्ट नहीं हो पाया। मैं अनुमान लगाकर गलत institutional fact नहीं दूँगा।':'I could not verify this answer from the available knowledge or Gemini service right now. I won’t invent an institutional fact.'),sources:[],grounded:true,refused:true,inScope:true,composer:'safe-refusal'};
}
