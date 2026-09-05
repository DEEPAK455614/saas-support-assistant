import fs from 'node:fs';

const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeReadFileSync = fs.readFileSync.bind(fs);
let quotaCooldownUntil = 0;

function combineSignals(existing, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!existing) return timeout;
  if (AbortSignal.any) return AbortSignal.any([existing, timeout]);
  return existing;
}

const UI_PATCH = String.raw`
<meta name="theme-color" content="#0b4b3f">
<style>
#ekatma-runtime-badge{position:fixed;top:10px;right:10px;z-index:99999;border:1px solid rgba(15,81,67,.18);background:rgba(250,248,241,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 6px 24px rgba(0,0,0,.08);border-radius:999px;padding:7px 10px;font:600 11px/1.1 system-ui,-apple-system,sans-serif;color:#164b40;display:flex;align-items:center;gap:6px;max-width:170px;white-space:nowrap}
#ekatma-runtime-badge .dot{width:7px;height:7px;border-radius:50%;background:#1b8a64;box-shadow:0 0 0 3px rgba(27,138,100,.12)}
#ekatma-runtime-badge.offline .dot{background:#a26d2b;box-shadow:0 0 0 3px rgba(162,109,43,.12)}
.ekatma-smart-suggestions{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:8px 0 6px;padding:2px 1px;max-width:100%}.ekatma-smart-suggestions::-webkit-scrollbar{display:none}.ekatma-smart-suggestions button{flex:0 0 auto;border:1px solid rgba(20,78,65,.16);background:rgba(255,255,255,.72);color:#244c43;border-radius:999px;padding:8px 11px;font:500 12px/1.2 system-ui,-apple-system,sans-serif;cursor:pointer}.ekatma-smart-suggestions button:active{transform:scale(.98)}
@media(max-width:640px){#ekatma-runtime-badge{top:8px;right:8px;padding:6px 9px;font-size:10px;opacity:.92}.ekatma-smart-suggestions button{font-size:11px;padding:7px 10px}}
</style>
<script>
(function(){
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}
  ready(function(){
    var badge=document.createElement('div');
    badge.id='ekatma-runtime-badge';badge.setAttribute('role','status');badge.innerHTML='<span class="dot"></span><span class="label">Grounded • v3.1</span>';
    document.body.appendChild(badge);
    function net(){var on=navigator.onLine!==false;badge.classList.toggle('offline',!on);badge.querySelector('.label').textContent=(on?'Grounded • v3.1':'Offline • local UI');}
    window.addEventListener('online',net);window.addEventListener('offline',net);net();
    fetch('/health').then(function(r){return r.json()}).then(function(j){badge.title='Ekatma Intelligence OS '+(j.version||'v3.1')+' • '+(j.overlayChunks||0)+' curated evidence chunks';}).catch(function(){});

    document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){var t=document.querySelector('textarea,[contenteditable="true"]');if(t){e.preventDefault();t.focus();}}});

    function showSuggestions(items){
      if(!Array.isArray(items)||!items.length)return;
      var t=document.querySelector('textarea');if(!t)return;
      var host=t.closest('form')||t.parentElement;if(!host)return;
      var old=host.querySelector('.ekatma-smart-suggestions');if(old)old.remove();
      var bar=document.createElement('div');bar.className='ekatma-smart-suggestions';bar.setAttribute('aria-label','Suggested follow-up questions');
      items.slice(0,3).forEach(function(text){var b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=function(){t.value=text;t.dispatchEvent(new Event('input',{bubbles:true}));t.focus();};bar.appendChild(b);});
      host.insertBefore(bar,t);
    }

    var browserFetch=window.fetch.bind(window);
    window.fetch=function(input,init){
      var p=browserFetch(input,init);
      try{var u=typeof input==='string'?input:(input&&input.url)||'';var method=(init&&init.method)||'GET';if(u.indexOf('/api')!==-1&&String(method).toUpperCase()==='POST'){p.then(function(r){return r.clone().json()}).then(function(j){showSuggestions(j.suggestedFollowups)}).catch(function(){});}}catch(e){}
      return p;
    };
  });
})();
</script>`;

fs.readFileSync = function ekatmaReadFileSync(file, options) {
  const result = nativeReadFileSync(file, options);
  try {
    const name = String(file || '');
    const isIndex = /(?:^|[/\\])index\.html$/i.test(name);
    const isText = typeof result === 'string';
    if (isIndex && isText && result.includes('</head>')) {
      return result.replace('</head>', UI_PATCH + '\n</head>');
    }
  } catch (_) {}
  return result;
};

globalThis.fetch = async function ekatmaFastFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  const isGemini = url.includes('generativelanguage.googleapis.com');

  if (!isGemini) return nativeFetch(input, init);

  if (/\/v1beta\/models(?:\?|$)/.test(url) && !url.includes(':generateContent')) {
    return new Response(JSON.stringify({
      models: [{
        name: 'models/gemini-3.6-flash',
        supportedGenerationMethods: ['generateContent']
      }]
    }), {
      status: 200,
      headers: {'content-type': 'application/json'}
    });
  }

  if (url.includes(':generateContent')) {
    if (Date.now() < quotaCooldownUntil) {
      return new Response(JSON.stringify({error:{code:429,message:'Provider temporarily cooling down'}}), {
        status: 429,
        headers: {'content-type': 'application/json'}
      });
    }

    const nextInit = {...init, signal: combineSignals(init.signal, 2200)};
    try {
      const response = await nativeFetch(input, nextInit);
      if (response.status === 429) quotaCooldownUntil = Date.now() + 90_000;
      return response;
    } catch (error) {
      quotaCooldownUntil = Date.now() + 30_000;
      throw error;
    }
  }

  return nativeFetch(input, {...init, signal: combineSignals(init.signal, 2200)});
};
