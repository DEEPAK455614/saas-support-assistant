import http from 'node:http';
import { matchCanonical, canonicalAnswerObject, probableQuestionGroups, canonicalStats } from './canonical-layer.mjs';
import './canonical-sync.mjs';

const PUBLIC_PORT=Number(process.env.PORT||10000);
const INTERNAL_PORT=PUBLIC_PORT+1;
const ORIGINAL_PORT=process.env.PORT;
process.env.PORT=String(INTERNAL_PORT);
await import('./v4.mjs');
process.env.PORT=ORIGINAL_PORT||String(PUBLIC_PORT);

const REFUSAL_PREFIX='इस प्रश्न के लिए उपलब्ध Ekatma knowledge base में विश्वसनीय संदर्भ नहीं मिला';
const STOP=new Set('the a an and or of to in on for from with by is are was were what who how when where tell give show me you your about please kya hai hain ka ki ke ko se me mein aur क्या है हैं का की के को से में और कौन कब कहाँ कहां बताओ बताइए'.split(/\s+/));

function norm(s=''){return String(s).normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim()}
function toks(s){return [...new Set(norm(s).split(' ').filter(t=>t.length>1&&!STOP.has(t)))]}
function greeting(q){const raw=String(q||'').normalize('NFKC').trim().replace(/\s+/g,' '),lower=raw.toLowerCase();if(/^जय\s*शंकर$/u.test(raw))return'जय शंकर 🙏';if(/^(हरि\s*ओम|हरिः\s*ॐ)$/u.test(raw))return'हरिः ॐ 🙏';if(/^(नमस्ते|नमस्कार|प्रणाम)$/u.test(raw))return'नमस्ते 🙏';if(/^(jai\s*shankar|jay\s*shankar)$/i.test(raw))return/^jai/i.test(raw)?'Jai Shankar 🙏':'Jay Shankar 🙏';if(/^(hari\s*om|hariom)$/i.test(lower))return'Hari Om 🙏';return null}
async function readBody(req,max=40*1024*1024){const parts=[];let n=0;for await(const c of req){n+=c.length;if(n>max)throw new Error('request_too_large');parts.push(c)}return Buffer.concat(parts)}
function headersForFetch(headers={}){const out={};for(const[k,v]of Object.entries(headers)){if(v==null||['host','connection','content-length','transfer-encoding'].includes(k.toLowerCase()))continue;out[k]=Array.isArray(v)?v.join(', '):String(v)}return out}
async function internalFetch(urlPath,{method='GET',headers={},body}={}){return fetch(`http://127.0.0.1:${INTERNAL_PORT}${urlPath}`,{method,headers:headersForFetch(headers),body})}
function sendJson(res,status,obj){const out=Buffer.from(JSON.stringify(obj));res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':out.length,'x-content-type-options':'nosniff'});res.end(out)}
async function forward(req,res,body=null){const r=await internalFetch(req.url,{method:req.method,headers:req.headers,body:body??(req.method==='GET'||req.method==='HEAD'?undefined:await readBody(req))});const b=Buffer.from(await r.arrayBuffer());const h={'content-type':r.headers.get('content-type')||'application/octet-stream','cache-control':r.headers.get('cache-control')||'no-store','x-content-type-options':'nosniff'};res.writeHead(r.status,h);res.end(b)}
function sentenceCandidates(text){return String(text||'').replace(/\r/g,'').split(/(?<=[।.!?])\s+|\n+/u).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>=35&&s.length<=520)}
function hasBothRoutePlaces(text){const n=norm(text);return /(kaladi|kalady|kālaḍī|कालडी|कालड़ी)/u.test(n)&&/(kedarnath|kedāra|केदारनाथ|केदार)/u.test(n)}
function extractiveAnswer(question,sources){if(!Array.isArray(sources)||!sources.length)return null;const qn=norm(question);const routeIntent=/(कहाँ से कहाँ|कहां से कहां|where.*(?:to|end)|from.*to|route|मार्ग|आरंभ.*समापन|शुरू.*खत्म)/iu.test(qn);if(routeIntent){for(let i=0;i<sources.length;i++){const text=sources[i].content||sources[i].excerpt||'';if(hasBothRoutePlaces(text)){return{answer:`उपलब्ध evidence के अनुसार, एकात्म यात्रा का route **कालड़ी/कलाड़ी, केरल से केदारनाथ, उत्तराखण्ड तक** दिया गया है। [S${i+1}]`,sources,grounded:true,degraded:true,model:'extractive-evidence-fallback'}}}}
 const qt=toks(question),scored=[];for(let i=0;i<sources.length;i++){for(const sentence of sentenceCandidates(sources[i].content||sources[i].excerpt||'')){const sn=norm(sentence);let hits=0;for(const t of qt)if(sn.includes(t))hits++;let score=qt.length?hits/qt.length:0;if(/(distance|दूरी|km|किलोमीटर)/iu.test(qn)&&/\b\d[\d,\.]*\s*(km|किमी|किलोमीटर)/iu.test(sentence))score+=.55;if(/(date|तिथि|तारीख|कब)/iu.test(qn)&&/(20\d\d|जनवरी|january|february|march|april|may|november|december)/iu.test(sentence))score+=.45;if(/(duration|अवधि|days|दिन|month|महीने)/iu.test(qn)&&/(\d+\s*(days|दिन)|month|महीने|weeks|सप्ताह)/iu.test(sentence))score+=.45;if(score>.12)scored.push({score,i,sentence})}}
 scored.sort((a,b)=>b.score-a.score);const picked=[],seen=new Set();for(const x of scored){const k=norm(x.sentence).slice(0,180);if(seen.has(k))continue;seen.add(k);picked.push(x);if(picked.length===3)break}if(!picked.length)return null;const answer='उपलब्ध evidence के आधार पर:\n'+picked.map(x=>`• ${x.sentence} [S${x.i+1}]`).join('\n');return{answer,sources,grounded:true,degraded:true,model:'extractive-evidence-fallback'}}

async function handleChat(req,res,body){let payload={};try{payload=JSON.parse(body.toString('utf8')||'{}')}catch{}const question=String(payload.question||'').trim();const salute=greeting(question);if(salute)return sendJson(res,200,{answer:salute,sources:[],grounded:true,systemMessage:true});
 const canonical=question?matchCanonical(question,{threshold:.67}):null;
 if(canonical?.special)return sendJson(res,200,{...canonical.special,model:'canonical-pack-v1'});
 if(canonical?.fact)return sendJson(res,200,{...canonicalAnswerObject(canonical.fact,question),matchScore:Number(canonical.score.toFixed(3)),matchedQuestion:canonical.matched,model:'canonical-pack-v1'});
 const r=await internalFetch(req.url,{method:'POST',headers:req.headers,body});const raw=await r.text();let result;try{result=JSON.parse(raw)}catch{result={answer:raw}}if(r.ok&&result?.refused===true&&String(result.answer||'').startsWith(REFUSAL_PREFIX)&&question){try{const sr=await internalFetch(`/api?op=search&q=${encodeURIComponent(question)}`);if(sr.ok){const sj=await sr.json();const fallback=extractiveAnswer(question,sj.sources||[]);if(fallback)result=fallback}}catch(e){console.error('extractive_fallback_error',e?.message||e)}}return sendJson(res,r.status,result)}

async function healthWithCanonical(req,res){try{const r=await internalFetch('/health');const j=await r.json();return sendJson(res,r.status,{...j,version:'4.1.0',canonicalKnowledge:canonicalStats(),answerPolicy:'canonical-first > approved RAG > safe extractive > refusal'});}catch{return sendJson(res,200,{ok:true,service:'Ekatma Intelligence OS',version:'4.1.0',canonicalKnowledge:canonicalStats()})}}

const gateway=http.createServer(async(req,res)=>{try{const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(req.method==='GET'&&(u.pathname==='/health'||u.pathname==='/ready'))return healthWithCanonical(req,res);if(req.method==='GET'&&u.pathname==='/api/probable-questions')return sendJson(res,200,{groups:probableQuestionGroups(),stats:canonicalStats(),source:'canonical-pack-v1'});if(req.method==='GET'&&u.pathname==='/api/canonical-stats')return sendJson(res,200,canonicalStats());if(req.method==='POST'&&(u.pathname==='/api/chat'||u.pathname==='/api'))return handleChat(req,res,await readBody(req));return forward(req,res)}catch(e){console.error('gateway_error',e?.message||e);return sendJson(res,500,{error:'gateway_error'})}});
setTimeout(()=>gateway.listen(PUBLIC_PORT,'0.0.0.0',()=>console.log(`Ekatma Intelligence OS 4.1 gateway on ${PUBLIC_PORT} | canonical ${canonicalStats().facts} facts / ${canonicalStats().questionForms} question forms / ${canonicalStats().reverseQuestionForms} reverse tests`)),40);
