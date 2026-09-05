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
#ekatma-runtime-badge{position:fixed;top:10px;right:10px;z-index:99999;border:1px solid rgba(15,81,67,.18);background:rgba(250,248,241,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 6px 24px rgba(0,0,0,.08);border-radius:999px;padding:7px 10px;font:600 11px/1.1 system-ui,-apple-system,sans-serif;color:#164b40;display:flex;align-items:center;gap:6px;max-width:180px;white-space:nowrap}
#ekatma-runtime-badge .dot{width:7px;height:7px;border-radius:50%;background:#1b8a64;box-shadow:0 0 0 3px rgba(27,138,100,.12)}
#ekatma-runtime-badge.offline .dot{background:#a26d2b;box-shadow:0 0 0 3px rgba(162,109,43,.12)}
.ekatma-smart-suggestions{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:8px 0 8px;padding:2px 1px;max-width:100%;width:100%;box-sizing:border-box;position:relative;z-index:2}.ekatma-smart-suggestions::-webkit-scrollbar{display:none}.ekatma-smart-suggestions button{flex:0 0 auto;border:1px solid rgba(20,78,65,.16);background:rgba(255,255,255,.78);color:#244c43;border-radius:999px;padding:8px 11px;font:500 12px/1.2 system-ui,-apple-system,sans-serif;cursor:pointer}.ekatma-smart-suggestions button:active{transform:scale(.98)}
textarea{writing-mode:horizontal-tb!important;text-orientation:mixed!important;min-width:0!important;max-width:100%!important}
@media(max-width:640px){#ekatma-runtime-badge{top:8px;right:8px;padding:6px 9px;font-size:10px;opacity:.92}.ekatma-smart-suggestions{margin:6px 0 6px}.ekatma-smart-suggestions button{font-size:11px;padding:7px 10px}}
</style>
<script>
(function(){
  var advaitaQuotes=[
    {q:'एकमेवाद्वितीयम्',s:'छान्दोग्य उपनिषद् 6.2.1',m:'एक ही सत्य है — दूसरा नहीं।'},
    {q:'तत्त्वमसि',s:'छान्दोग्य उपनिषद् 6.8.7',m:'जिस सत्य को तुम खोजते हो, उसी से तुम्हारा स्वरूप अलग नहीं।'},
    {q:'अहं ब्रह्मास्मि',s:'बृहदारण्यक उपनिषद् 1.4.10',m:'सीमित अहं के पार आत्मस्वरूप ब्रह्म है।'},
    {q:'अयमात्मा ब्रह्म',s:'माण्डूक्य उपनिषद् 2',m:'यह आत्मा ही ब्रह्म है।'},
    {q:'प्रज्ञानं ब्रह्म',s:'ऐतरेय उपनिषद् 3.3',m:'मूल चैतन्य ही ब्रह्म है।'},
    {q:'नेति नेति',s:'बृहदारण्यक उपनिषद् 2.3.6',m:'जो कुछ वस्तु बनकर पकड़ा जा सके, अंतिम सत्य उससे भी परे है।'},
    {q:'सर्वं खल्विदं ब्रह्म',s:'छान्दोग्य उपनिषद् 3.14.1',m:'यह समस्त अस्तित्व ब्रह्म से पृथक नहीं।'},
    {q:'द्वितीयाद्वै भयं भवति',s:'बृहदारण्यक उपनिषद् 1.4.2',m:'भय वहीं जन्मता है जहाँ दूसरा दिखाई देता है।'},
    {q:'यो वै भूमा तत्सुखम्',s:'छान्दोग्य उपनिषद् 7.23.1',m:'पूर्णता में ही वास्तविक आनंद है।'}
  ];
  var lastQuote=-1;
  function nextAdvaita(){
    var i=Math.floor(Math.random()*advaitaQuotes.length);
    if(advaitaQuotes.length>1&&i===lastQuote)i=(i+1)%advaitaQuotes.length;
    lastQuote=i;return advaitaQuotes[i];
  }
  function applyAdvaita(answer){
    if(typeof answer!=='string'||!answer)return answer;
    var x=nextAdvaita();
    var head='॥ '+x.q+' ॥\n**अद्वैत दृष्टि:** '+x.m+'  ·  _'+x.s+'_\n\n';
    var re=/^॥[^\n]+॥\n\*\*अद्वैत दृष्टि:\*\*[^\n]*\n\n/;
    return re.test(answer)?answer.replace(re,head):head+answer;
  }
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}
  ready(function(){
    var badge=document.createElement('div');
    badge.id='ekatma-runtime-badge';badge.setAttribute('role','status');badge.innerHTML='<span class="dot"></span><span class="label">Grounded • v3.1</span>';
    document.body.appendChild(badge);
    function net(){var on=navigator.onLine!==false;badge.classList.toggle('offline',!on);badge.querySelector('.label').textContent=(on?'Grounded • v3.1':'Offline • local UI');}
    window.addEventListener('online',net);window.addEventListener('offline',net);net();
    fetch('/health').then(function(r){return r.json()}).then(function(j){badge.title='Ekatma Intelligence OS '+(j.version||'v3.1')+' • '+(j.overlayChunks||0)+' curated evidence chunks';}).catch(function(){});

    function findTextarea(){return document.querySelector('textarea');}
    function setTextareaValue(t,value){
      try{var setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;setter.call(t,value);}catch(e){t.value=value;}
      t.dispatchEvent(new Event('input',{bubbles:true}));
      t.dispatchEvent(new Event('change',{bubbles:true}));
    }
    function healComposer(){
      var t=findTextarea();if(!t)return;
      t.disabled=false;t.removeAttribute('disabled');t.removeAttribute('readonly');
      t.style.writingMode='horizontal-tb';t.style.textOrientation='mixed';t.style.minWidth='0';t.style.maxWidth='100%';t.style.flex='1 1 0%';
      var form=t.closest('form');if(form){form.style.minWidth='0';}
    }
    var healTimer;
    function scheduleHeal(){clearTimeout(healTimer);healTimer=setTimeout(healComposer,30);setTimeout(healComposer,180);}
    var observer=new MutationObserver(scheduleHeal);observer.observe(document.body,{childList:true,subtree:true});scheduleHeal();

    document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){var t=findTextarea();if(t){e.preventDefault();healComposer();t.focus();}}});

    function showSuggestions(items){
      document.querySelectorAll('.ekatma-smart-suggestions[data-ekatma-smart="1"]').forEach(function(x){x.remove();});
      if(!Array.isArray(items)||!items.length)return;
      var t=findTextarea();if(!t)return;
      var form=t.closest('form');
      var bar=document.createElement('div');bar.className='ekatma-smart-suggestions';bar.dataset.ekatmaSmart='1';bar.setAttribute('aria-label','Suggested follow-up questions');
      items.slice(0,3).forEach(function(text){var b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=function(){healComposer();setTextareaValue(t,text);t.focus();};bar.appendChild(b);});
      if(form&&form.parentNode){form.parentNode.insertBefore(bar,form);}else if(t.parentNode){t.parentNode.insertBefore(bar,t);}
      scheduleHeal();
    }

    var browserFetch=window.fetch.bind(window);
    window.fetch=function(input,init){
      var u=typeof input==='string'?input:(input&&input.url)||'';
      var method=(init&&init.method)||'GET';
      var isAnswer=u.indexOf('/api')!==-1&&String(method).toUpperCase()==='POST';
      if(!isAnswer)return browserFetch(input,init);
      return browserFetch(input,init).then(async function(r){
        try{
          var j=await r.clone().json();
          if(j&&typeof j.answer==='string')j.answer=applyAdvaita(j.answer);
          showSuggestions(j&&j.suggestedFollowups);
          scheduleHeal();
          return new Response(JSON.stringify(j),{status:r.status,statusText:r.statusText,headers:new Headers(r.headers)});
        }catch(e){scheduleHeal();return r;}
      });
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
