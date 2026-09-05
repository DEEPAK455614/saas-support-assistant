const url=process.env.KB_FUNCTION_URL;
const token=process.env.EKATMA_ADMIN_TOKEN;
export async function syncCanonicalPack(){
  if(!url||!token)return {ok:false,skipped:'knowledge_manager_not_configured'};
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-ekatma-admin':token},body:JSON.stringify({action:'canonical_seed_remote',branch:'ekatma-intelligence-os'})});
  const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={raw}};
  if(!r.ok)throw new Error(data?.detail||data?.error||`canonical_sync_${r.status}`);
  return data;
}
setTimeout(()=>syncCanonicalPack().then(x=>console.log('EKATMA_CANONICAL_SYNC',JSON.stringify(x))).catch(e=>console.error('EKATMA_CANONICAL_SYNC_ERROR',e?.message||e)),1200);
