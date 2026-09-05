const nativeFetch = globalThis.fetch.bind(globalThis);
let quotaCooldownUntil = 0;

function combineSignals(existing, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!existing) return timeout;
  if (AbortSignal.any) return AbortSignal.any([existing, timeout]);
  return existing;
}

globalThis.fetch = async function ekatmaFastFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  const isGemini = url.includes('generativelanguage.googleapis.com');

  if (!isGemini) return nativeFetch(input, init);

  // Avoid a slow model-list discovery request on every cold boot. This is the
  // current text-generation model recommended by the API response for this project.
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
      // Timeouts/network failures should fail fast; the main server will use its
      // grounded evidence fallback rather than making the user wait.
      quotaCooldownUntil = Date.now() + 30_000;
      throw error;
    }
  }

  return nativeFetch(input, {...init, signal: combineSignals(init.signal, 2200)});
};
