const REPO='priyankamandikal/vedantany-10m';
const PIN='42f7a6b1b8258e3bfeb9ce329307d2b028c07b6c';
const EVAL_DIR='eval/2-rag-vs-kwrag/answers/mixtral-nomic/json/rag-kw';
const REPO_URL=`https://github.com/${REPO}`;
const RAW_BASE=`https://raw.githubusercontent.com/${REPO}/${PIN}/${EVAL_DIR}`;
const CACHE_TTL=12*60*60*1000;
const FETCH_TIMEOUT=12000;

// The public repository does not bundle its full 612 Whisper transcript corpus.
// It does bundle these 25 RAG-evaluation knowledge records, each containing a
// question, a generated answer, keywords/category, lecture metadata and retrieved
// context. Pinning this manifest removes GitHub API directory/rate-limit dependence.
const MANIFEST=[
'Terminology_What_is_Upadana_Karana.json',
'Terminology_What_is_Vikshepa_Shakti.json',
'Terminology_What_is_Adhyaropa_Apavada.json',
'Reasoning_Can_AI_ever_become_conscious.json',
'Reasoning_Do_our_senses_report_reality_to_us.json',
'Terminology_What_constitutes_Sadhana_Chatushtaya.json',
'Anecdotal_Does_Swami_speak_about_The_Matrix_movie.json',
'Comparative_How_does_Sankhya_differ_from_Advaita_Vedanta.json',
'Terminology_What_is_the_significance_of_the_word_Shraddha.json',
'Anecdotal_What_was_Christopher_Isherwoods_contribution_to_V.json',
'Anecdotal_Does_Swami_speak_about_Vachaspati_Mishra_Does_he_.json',
'Anecdotal_Does_Swami_speak_about_Wittgensteins_thesis_defen.json',
'Scriptural_In_the_Gospel_of_Sri_Ramakrishna_how_do_we_unders.json',
'Reasoning_Is_the_waking_state_similar_to_a_dream_or_absolute.json',
'Scriptural_In_Mandukya_Upanishad_what_is_the_significance_of.json',
'Reasoning_Dis-identifying_myself_from_the_body-mind_seems_to.json',
'Scriptural_In_the_Mundaka_Upanishad_how_do_we_interpret_the_.json',
'Reasoning_If_Brahman_as_Existence-Consciousness-Bliss_is_the.json',
'Anecdotal_Does_Swami_narrate_any_incident_surrounding_Shivar.json',
'Scriptural_In_the_Gospel_what_parable_does_Sri_Ramakrishna_u.json',
'Comparative_As_mentioned_in_the_Yoga_Sutras_is_Samadhi_necess.json',
'Comparative_Would_Sri_Ramakrishnas_teachings_be_considered_pu.json',
'Comparative_In_Kashmir_Shaivism_Chit_is_both_Prakasha_and_Vim.json',
'Scriptural_How_is_Phala_Vyapti_and_Vritti_Vyapti_defined_in_V.json',
'Comparative_What_is_the_main_difference_between_Buddhist_Shuny.json'
];

let cache={loadedAt:0,rows:[],error:null,loading:null};

const VEDANTA_RE=/(advaita|अद्वैत|vedanta|vedant|वेदांत|वेदान्त|upanishad|उपनिषद|brahman|ब्रह्म|atman|आत्मा|maya|माया|moksha|मोक्ष|mahavakya|महावाक्य|shankaracharya|शंकराचार्य|gita|गीता|jnana|ज्ञान|bhakti|भक्ति|karma yoga|कर्मयोग|sankhya|सांख्य|samadhi|समाधि|yoga sutra|योगसूत्र|shunyata|शून्यता|kashmir shaiv|काश्मीर शैव|ramakrishna|रामकृष्ण|sarvapriyananda|सर्वप्रियानंद|viveka|विवेक|vairagya|वैराग्य|sadhana chatushtaya|साधन चतुष्टय|purusha|पुरुष|prakriti|प्रकृति|nyaya|न्याय|dvaita|द्वैत|vishishtadvaita|विशिष्टाद्वैत|sakshi|साक्षी|turiya|तुरीय|mandukya|माण्डूक्य|mundaka|मुण्डक|drig.?drishya|दृग.?दृश्य|consciousness|चेतना|upadana|vikshepa|adhyaropa|apavada|shraddha|phala vyapti|vritti vyapti|shivar|wittgenstein|isherwood|vachaspati)/i;
const INSTITUTION_RE=/(ekatma|ekatam|एकात्म|yatra|यात्रा|dham|धाम|nyas|न्यास|maharath|महारथ|route|मार्ग|meeting|बैठक|decision|निर्णय|approval|approved|chairman|trustee|programme|program|event|contact|official|institution|संस्था|omkareshwar|ओंकारेश्वर|statue of oneness)/i;

const ALIASES=[
  [/अद्वैत/g,' advaita '],[/वेदान्त|वेदांत/g,' vedanta '],[/उपनिषद/g,' upanishad '],[/ब्रह्म/g,' brahman '],[/आत्मा/g,' atman '],
  [/माया/g,' maya '],[/मोक्ष/g,' moksha '],[/महावाक्य/g,' mahavakya '],[/शंकराचार्य/g,' shankaracharya '],[/गीता/g,' gita '],
  [/ज्ञान/g,' jnana '],[/भक्ति/g,' bhakti '],[/कर्मयोग/g,' karma yoga '],[/सांख्य/g,' sankhya '],[/समाधि/g,' samadhi '],
  [/योगसूत्र/g,' yoga sutra '],[/शून्यता/g,' shunyata '],[/रामकृष्ण/g,' ramakrishna '],[/सर्वप्रियानंद/g,' sarvapriyananda '],
  [/वैराग्य/g,' vairagya '],[/विवेक/g,' viveka '],[/पुरुष/g,' purusha '],[/प्रकृति/g,' prakriti '],[/न्याय/g,' nyaya '],
  [/द्वैत/g,' dvaita '],[/साक्षी/g,' sakshi '],[/तुरीय/g,' turiya '],[/माण्डूक्य/g,' mandukya '],[/मुण्डक/g,' mundaka '],
  [/चेतना/g,' consciousness ']
];

function norm(s=''){
  let x=String(s).normalize('NFKC').toLowerCase();
  for(const [re,to] of ALIASES)x=x.replace(re,to);
  return x.replace(/[’']/g,'').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
function tokens(s=''){return new Set(norm(s).split(' ').filter(x=>x.length>1));}
function overlap(a,b){if(!a.size||!b.size)return 0;let hit=0;for(const x of a)if(b.has(x))hit++;return hit/Math.max(1,Math.min(a.size,b.size));}
function trigrams(s=''){const x=`  ${norm(s)}  `,out=new Set();for(let i=0;i<x.length-2;i++)out.add(x.slice(i,i+3));return out;}
function jaccard(a,b){if(!a.size||!b.size)return 0;let hit=0;for(const x of a)if(b.has(x))hit++;return hit/(a.size+b.size-hit||1);}
function clip(s,n=5200){const x=String(s||'').replace(/\s+/g,' ').trim();return x.length>n?x.slice(0,n)+'…':x;}

async function fetchJson(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),FETCH_TIMEOUT);
  try{
    const r=await fetch(url,{signal:controller.signal,headers:{'user-agent':'Ekatma-Intelligence-OS'}});
    if(!r.ok)throw new Error(`vedantany_fetch_${r.status}`);
    return await r.json();
  }finally{clearTimeout(timer)}
}

function toRow(j,fileName){
  if(!j||!j.q||!j.a)return null;
  const retrieved=Array.isArray(j.r)?j.r:[];
  const lectures=retrieved.slice(0,4).map(r=>({title:String(r.title||'').trim(),link:String(r.link||'').trim(),ep_id:String(r.ep_id||'').trim()})).filter(x=>x.title||x.link);
  const hay=[j.q,j.k,j.c,j.a,lectures.map(x=>x.title).join(' ')].filter(Boolean).join(' ');
  return {
    question:String(j.q).trim(),category:String(j.c||'Vedanta').trim(),keywords:String(j.k||'').trim(),answer:String(j.a).trim(),lectures,
    sourceFile:fileName,sourceUrl:`${REPO_URL}/blob/${PIN}/${EVAL_DIR}/${fileName}`,nh:norm(hay),tokens:tokens(hay),tris:trigrams(j.q)
  };
}

async function loadCorpus(){
  if(cache.rows.length&&Date.now()-cache.loadedAt<CACHE_TTL)return cache.rows;
  if(cache.loading)return cache.loading;
  cache.loading=(async()=>{
    try{
      const settled=await Promise.allSettled(MANIFEST.map(async fileName=>toRow(await fetchJson(`${RAW_BASE}/${encodeURIComponent(fileName)}`),fileName)));
      const rows=settled.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value);
      if(rows.length){cache={loadedAt:Date.now(),rows,error:rows.length===MANIFEST.length?null:`partial_${rows.length}_of_${MANIFEST.length}`,loading:null};return rows;}
      throw new Error('vedantany_empty');
    }catch(e){cache={...cache,error:e?.message||String(e),loading:null};return cache.rows||[];}
  })();
  return cache.loading;
}

export function isVedantaKnowledgeQuery(query=''){
  const q=String(query||'');
  return VEDANTA_RE.test(q)&&!INSTITUTION_RE.test(q);
}

export async function vedantaNySearch(query,{limit=4,minScore=.14}={}){
  if(!isVedantaKnowledgeQuery(query))return [];
  const rows=await loadCorpus();if(!rows.length)return [];
  const qn=norm(query),qt=tokens(query),qg=trigrams(query),scored=[];
  for(const row of rows){
    const rq=norm(row.question);let score=0;
    if(rq===qn)score=1;
    else{
      if(rq.includes(qn)||qn.includes(rq))score=Math.max(score,.94);
      score=Math.max(score,overlap(qt,row.tokens)*.84);
      score=Math.max(score,jaccard(qg,row.tris)*.72);
      const kw=norm(row.keywords);if(kw&&[...qt].some(t=>kw.includes(t)))score+=.08;
    }
    if(score>=minScore)scored.push({score:Math.min(1,score),row});
  }
  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0,Math.max(1,Math.min(Number(limit)||4,6))).map(({score,row})=>{
    const lectureLines=row.lectures.slice(0,3).map((x,i)=>`LECTURE_${i+1}: ${x.title}${x.link?` | ${x.link}`:''}`);
    return {
      title:`VedantaNY-10M · ${row.question}`,
      file_name:row.sourceFile,
      content:[`QUESTION: ${row.question}`,`ANSWER: ${clip(row.answer)}`,row.category?`CATEGORY: ${row.category}`:'',row.keywords?`KEYWORDS: ${row.keywords}`:'',...lectureLines,`SOURCE_REPOSITORY: ${REPO_URL}`,`SOURCE_REVISION: ${PIN}`].filter(Boolean).join('\n'),
      excerpt:clip(row.answer,1800),
      trust:'research-corpus',origin:'vedantany_10m',category:row.category,score,source_url:row.sourceUrl,repository:REPO,
      notes:'VedantaNY-10M evaluation RAG material derived from public Vedanta Society of New York discourses. Use for general Vedanta/Advaita knowledge, never for Ekatma/Nyas institutional facts.'
    };
  });
}

export function vedantaNyStats(){
  return {repository:REPO,url:REPO_URL,revision:PIN,mode:'pinned-upstream-evaluation-rag',loaded:cache.rows.length>0,entries:cache.rows.length,expectedEntries:MANIFEST.length,lastLoaded:cache.loadedAt||null,error:cache.error||null,scope:'general Advaita/Vedanta philosophy only',fullTranscriptCorpusBundled:false};
}

export async function warmVedantaNy(){return loadCorpus();}
