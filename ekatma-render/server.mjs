import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.Netlify={env:{get:(key)=>process.env[key]}};
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const GENERATED=path.join(ROOT,'generated');
const apiPath=path.join(GENERATED,'netlify','functions','api.mjs');
const indexPath=path.join(GENERATED,'public','index.html');
if(!fs.existsSync(apiPath)||!fs.existsSync(indexPath)) throw new Error('Generated app bundle missing');
const {default:apiHandler}=await import(pathToFileURL(apiPath).href);
const INDEX=fs.readFileSync(indexPath,'utf8');

const server=http.createServer(async(req,res)=>{
  try{
    const proto=req.headers['x-forwarded-proto']||'https';
    const base=`${proto}://${req.headers.host||'localhost'}`;
    const u=new URL(req.url,base);
    if(u.pathname==='/health'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      return res.end(JSON.stringify({ok:true,service:'Ekatma Intelligence OS'}));
    }
    if(u.pathname==='/api'){
      let body;
      if(req.method!=='GET'&&req.method!=='HEAD'){
        const parts=[];for await(const c of req)parts.push(c);body=Buffer.concat(parts);
      }
      const request=new Request(base+req.url,{method:req.method,headers:req.headers,body:body?.length?body:undefined});
      const response=await apiHandler(request);
      res.writeHead(response.status,Object.fromEntries(response.headers.entries()));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if(u.pathname==='/'||u.pathname==='/index.html'){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      return res.end(INDEX);
    }
    res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:'Not found'}));
  }catch(e){
    console.error(e);
    res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:'Internal error'}));
  }
});
const port=Number(process.env.PORT||10000);
server.listen(port,'0.0.0.0',()=>console.log(`Ekatma Intelligence OS listening on ${port}`));
