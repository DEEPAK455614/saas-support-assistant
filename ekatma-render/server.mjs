import http from 'node:http';
import { Readable } from 'node:stream';

const originalCreateServer=http.createServer.bind(http);
http.createServer=(listener)=>originalCreateServer(async(req,res)=>{
  if(req.method==='POST'&&(req.url==='/api/chat'||req.url==='/api')){
    const chunks=[];
    for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks);
    try{
      const payload=JSON.parse(body.toString('utf8')||'{}');
      const q=String(payload.question||'').normalize('NFKC').trim().replace(/\s+/g,' ');
      const lower=q.toLowerCase();
      let answer=null;
      if(/^(जय\s*शंकर)$/u.test(q))answer='जय शंकर 🙏';
      else if(/^(हरि\s*ओम|हरिः\s*ॐ)$/u.test(q))answer='हरिः ॐ 🙏';
      else if(/^(नमस्ते|नमस्कार|प्रणाम)$/u.test(q))answer='नमस्ते 🙏';
      else if(/^(jai\s*shankar|jay\s*shankar)$/i.test(q))answer=/^jai/i.test(q)?'Jai Shankar 🙏':'Jay Shankar 🙏';
      else if(/^(hari\s*om|hariom)$/i.test(lower))answer='Hari Om 🙏';
      if(answer){
        const out=JSON.stringify({answer,sources:[],grounded:true,systemMessage:true});
        res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(out)});
        return res.end(out);
      }
    }catch{}
    const replay=Readable.from([body]);
    replay.method=req.method;replay.url=req.url;replay.headers=req.headers;
    return listener(replay,res);
  }
  return listener(req,res);
});

await import('./v4.mjs');
