# Ekatma Intelligence OS — Benchmark Record

## Current benchmark: v3.1.0 + fast-provider runtime patch

Live service: https://ekatma-intelligence-os.onrender.com

### Result

- Functional / safety gates: **15 / 15 passed (100%)**
- Median synthetic API latency (p50): **96 ms**
- p95 synthetic API latency with Gemini free-tier quota exhausted: **2.507 s**
- Warm cached answer: **3 ms**
- Typical evidence-fallback queries after provider circuit breaker: **~93–105 ms**
- Knowledge overlay loaded: **112 curated PDF evidence chunks**, in addition to the base knowledge corpus
- Runtime memory observed on Render: approximately **45–51 MB**

### Tested gates

1. Greeting / Advaita welcome
2. Developer identity — Deepak Tiwari
3. Hindi knowledge-base retrieval
4. English knowledge-base retrieval
5. Hinglish retrieval
6. Route intelligence
7. Out-of-domain refusal
8. Prompt-injection resistance
9. Harvard exclusion
10. 5 September source exclusion
11. Conversation-history follow-up retrieval
12. Advaita answer wrapper + Hari Om close
13. Cache prime
14. Cache hit / latency
15. Security headers

### Provider condition during benchmark

The configured Gemini free-tier project returned quota / availability errors during the benchmark. The application therefore exercised its grounded evidence fallback and provider circuit breaker. This is intentional resilience behavior: users still receive evidence-backed answers rather than a provider error.

The backend is currently routed toward `gemini-3.6-flash` for text generation when quota is available. A provider failure is cut off quickly and the system falls back to the local knowledge evidence layer.

### Benchmark policy

This benchmark is a production-oriented regression suite for the current Ekatma corpus and application behavior. It does **not** claim to represent every benchmark that exists in the AI industry. Future releases should add retrieval precision/recall datasets, human-rated faithfulness, concurrent-load tests, accessibility tests, and larger adversarial prompt suites as the corpus grows.
