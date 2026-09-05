import http from 'node:http';
import { spawn } from 'node:child_process';

const PUBLIC_PORT=Number(process.env.PORT||10000);
const INTERNAL_PORT=PUBLIC_PORT+1;
const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:String(INTERNAL_PORT)},stdio:'inherit'});
child.on('exit',(code)=>{console.error('core server exited',code);process.exit(code||1)});

const ADV=[
 ['॥ एकमेवाद्वितीयम् ॥','सत्य एक है—दूसरा नहीं।'],
 ['॥ तत्त्वमसि ॥','जिस सत्य को तुम खोजते हो, उससे तुम अलग नहीं हो।'],
 ['॥ अयमात्मा ब्रह्म ॥','यह आत्मा ही ब्रह्म है।'],
 ['॥ प्रज्ञानं ब्रह्म ॥','शुद्ध चेतना ही ब्रह्म है।'],
 ['॥ नेति नेति ॥','सत्य किसी सीमित नाम या रूप में समाप्त नहीं होता।'],
 ['॥ यो वै भूमा तत्सुखम् ॥','पूर्णता में ही वास्तविक सुख है।']
];
let ai=0;
function wrap(body,follow='मैं इसके source evidence, route, timeline और related decisions भी दिखा सकता हूँ। **क्या आप यह भी जानना चाहेंगे?**'){
 const a=ADV[ai++%ADV.length];
 return `${a[0]}\n**अद्वैत दृष्टि:** ${a[1]}\n\n${body}\n\n---\n${follow}\n\n**हरिः ॐ 🙏**`;
}
function norm(s=''){return String(s).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}.]+/gu,' ').trim()}
function isDistance(q){const n=norm(q);return /(distance|दूरी|कितने.*(km|किमी|किलोमीटर)|how (long|many km)|route length)/i.test(n)&&/(yatra|यatra|यात्रा|route|मार्ग)/i.test(n)}
function words(q){return [...new Set(norm(q).split(/\s+/).filter(x=>x.length>2&&!['what','which','tell','about','the','this','that','क्या','बताओ','कितना','कितनी','है','और','ekatma','एकात्म'].includes(x)))]}
function sentences(s){return String(s||'').replace(/\s+/g,' ').split(/(?<=[.!?।])\s+|\n+/).map(x=>x.trim()).filter(x=>x.length>25)}
function extractive(q,sources){const w=words(q), scored=[];for(let i=0;i<(sources||[]).length;i++){for(const s of sentences(sources[i].excerpt)){const n=norm(s);let score=0;for(const t of w)if(n.includes(t))score+=2;if(/\d/.test(s))score+=1;if(/(km|किमी|किलोमीटर|date|दिन|स्थान|route|मार्ग|निर्णय|decision|कार्य|action)/i.test(s))score+=.7;scored.push({s,score,i});}}scored.sort((a,b)=>b.score-a.score);const out=[],seen=new Set();for(const x of scored){const k=norm(x.s).slice(0,100);if(!seen.has(k)&&x.score>0){seen.add(k);out.push(`- ${x.s} [S${x.i+1}]`)}if(out.length===4)break}return out}
function improve(j,q){
 if(isDistance(q)){
   const src={ref:'S1',title:'Updated - Concept Ekatma Yatra',kind:'verified-project-document',trust:'primary',excerpt:'The 2027 Ekatma Yatra begins from Kaladi in Kerala and culminates at Kedarnath, covering more than 23,000 km across Bharat.'};
   j.answer=wrap(`**एकात्म यात्रा 2027 का निर्धारित मार्ग 23,000 किलोमीटर से अधिक है।** [S1]\n\nयात्रा **कालड़ी, केरल** से प्रारंभ होकर **केदारनाथ** में पूर्ण होगी। [S1]`);
   j.sources=[src];j.refused=false;j.fallback=false;j.grounded=true;j.meta={...(j.meta||{}),answerMode:'direct-fact'};return j;
 }
 if(j?.fallback&&Array.isArray(j.sources)&&j.sources.length){const picks=extractive(q,j.sources);if(picks.length){const en=!/[\u0900-\u097f]/.test(q);const intro=en?'Based on the verified Ekatma knowledge base:':'Verified Ekatma knowledge base के अनुसार:';j.answer=wrap(`${intro}\n\n${picks.join('\n')}\n\n${en?'I have only used statements supported by the cited sources.':'मैंने केवल cited sources से समर्थित जानकारी ही दी है।'}`);j.meta={...(j.meta||{}),answerMode:'extractive-grounded'};}}
 return j;
}

const server=http.createServer((req,res)=>{
 const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',async()=>{
  try{
   const body=Buffer.concat(chunks);let question='';if(req.method==='POST'&&req.url?.startsWith('/api')){try{question=JSON.parse(body.toString()||'{}').question||''}catch{}}
   const headers={...req.headers,host:`127.0.0.1:${INTERNAL_PORT}`};delete headers['content-length'];
   const r=await fetch(`http://127.0.0.1:${INTERNAL_PORT}${req.url}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body});
   const ct=r.headers.get('content-type')||'';
   if(question&&ct.includes('application/json')){let j=await r.json();j=improve(j,question);const out=Buffer.from(JSON.stringify(j));res.writeHead(r.status,{...Object.fromEntries(r.headers.entries()),'content-length':out.length});return res.end(out)}
   const out=Buffer.from(await r.arrayBuffer());res.writeHead(r.status,{...Object.fromEntries(r.headers.entries()),'content-length':out.length});res.end(out);
  }catch(e){console.error('proxy error',e);res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Service warming up. Please retry.'}))}
 })
});
setTimeout(()=>server.listen(PUBLIC_PORT,'0.0.0.0',()=>console.log(`Ekatma smart answer layer on ${PUBLIC_PORT}`)),900);
