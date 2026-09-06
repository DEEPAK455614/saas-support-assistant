const REPO='priyankamandikal/vedantany-10m';
const BRANCH='main';
const EVAL_DIR='eval/2-rag-vs-kwrag/answers/mixtral-nomic/json/rag-kw';
const DIR_API=`https://api.github.com/repos/${REPO}/contents/${EVAL_DIR}?ref=${BRANCH}`;
const REPO_URL=`https://github.com/${REPO}`;
const CACHE_TTL=12*60*60*1000;
const FETCH_TIMEOUT=12000;

let cache={loadedAt:0,rows:[],error:null,loading:null};

const VEDANTA_RE=/(advaita|अद्वैत|vedanta|vedant|वेदांत|वेदान्त|upanishad|उपनिषद|brahman|ब्रह्म|atman|आत्मा|maya|माया|moksha|मोक्ष|mahavakya|महावाक्य|shankaracharya|शंकराचार्य|gita|गीता|jnana|ज्ञान|bhakti|भक्ति|karma yoga|कर्मयोग|sankhya|सांख्य|samadhi|समाधि|yoga sutra|योगसूत्र|shunyata|शून्यता|kashmir shaiv|काश्मीर शैव|ramakrishna|रामकृष्ण|sarvapriyananda|सर्वप्रियानंद|viveka|विवेक|vairagya|वैराग्य|sadhana chatushtaya|साधन चतुष्टय|purusha|पुरुष|prakriti|प्रकृति|nyaya|न्याय|dvaita|द्वैत|vishishtadvaita|विशिष्टाद्वैत|sakshi|साक्षी|turiya|तुरीय|mandukya|माण्डूक्य|mundaka|मुण्डक|drig.?drishya|दृग.?दृश्य|consciousness|चेतना)/i;
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
    const r=await fetch(url,{signal:controller.signal,headers:{'accept':'application/vnd.github+json','user-agent':'Ekatma-Intelligence-OS','x-github-api-version':'2022-11-28'}});
    if(!r.ok)throw new Error(`vedantany_fetch_${r.status}`);
    return await r.json();
  }finally{clearTimeout(timer)}
}

function toRow(j,file){
  if(!j||!j.q||!j.a)return null;
  const retrieved=Array.isArray(j.r)?j.r:[];
  const lectures=retrieved.slice(0,4).map(r=>({title:String(r.title||'').trim(),link:String(r.link||'').trim(),ep_id:String(r.ep_id||'').trim()})).filter(x=>x.title||x.link);
  const hay=[j.q,j.k,j.c,j.a,lectures.map(x=>x.title).join(' ')].filter(Boolean).join(' ');
  return {
    question:String(j.q).trim(),category:String(j.c||'Vedanta').trim(),keywords:String(j.k||'').trim(),answer:String(j.a).trim(),lectures,
    sourceFile:file?.name||'',sourceUrl:file?.html_url||REPO_URL,nh:norm(hay),tokens:tokens(hay),tris:trigrams(j.q)
  };
}

async function loadCorpus(){
  if(cache.rows.length&&Date.now()-cache.loadedAt<CACHE_TTL)return cache.rows;
  if(cache.loading)return cache.loading;
  cache.loading=(async()=>{
    try{
      const listing=await fetchJson(DIR_API);
      const files=(Array.isArray(listing)?listing:[]).filter(x=>x?.type==='file'&&String(x.name||'').endsWith('.json')&&x.download_url);
      const settled=await Promise.allSettled(files.map(async file=>toRow(await fetchJson(file.download_url),file)));
      const rows=settled.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value);
      if(rows.length){cache={loadedAt:Date.now(),rows,error:null,loading:null};return rows;}
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
      content:[`QUESTION: ${row.question}`,`ANSWER: ${clip(row.answer)}`,row.category?`CATEGORY: ${row.category}`:'',row.keywords?`KEYWORDS: ${row.keywords}`:'',...lectureLines,`SOURCE_REPOSITORY: ${REPO_URL}`].filter(Boolean).join('\n'),
      excerpt:clip(row.answer,1800),
      trust:'research-corpus',origin:'vedantany_10m',category:row.category,score,source_url:row.sourceUrl,repository:REPO,
      notes:'VedantaNY-10M evaluation RAG material derived from public Vedanta Society of New York discourses. Use for general Vedanta/Advaita knowledge, never for Ekatma/Nyas institutional facts.'
    };
  });
}

export function vedantaNyStats(){
  return {repository:REPO,url:REPO_URL,mode:'live-upstream-evaluation-rag',loaded:cache.rows.length>0,entries:cache.rows.length,lastLoaded:cache.loadedAt||null,error:cache.error||null,scope:'general Advaita/Vedanta philosophy only',fullTranscriptCorpusBundled:false};
}

export async function warmVedantaNy(){return loadCorpus();}
