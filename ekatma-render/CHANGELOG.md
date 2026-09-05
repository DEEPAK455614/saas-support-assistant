# Ekatma Intelligence OS — Changelog

## v3.1.0 — 2026-09-05

### Intelligence quality
- Added stricter knowledge-only grounding.
- Added trust-weighted evidence ranking and deduplication.
- Added Hindi / Hinglish / English query handling.
- Added history-aware retrieval for short follow-up questions.
- Added mode-aware answer structure for meetings, decisions, actions, timelines, routes, and people.
- Added answer confidence metadata, evidence counts, request IDs, and suggested follow-up questions.

### Safety / provenance
- Added prompt-injection detection and document-instruction isolation.
- Added explicit source exclusions for Harvard-related material and 5 September material.
- Added clean out-of-domain refusal behavior.
- Added security headers and request-size / JSON validation.

### Performance / resilience
- Added in-memory response cache and search cache.
- Added fast provider circuit breaker.
- Routed text generation toward Gemini 3.6 Flash when available.
- Added evidence fallback so provider quota or network failure does not break the user experience.
- Reduced provider-failure p95 latency from ~11 s to ~2.5 s; normal evidence queries after cooldown are ~100 ms and cache hits ~3 ms in the current benchmark.

### Identity / UX behavior
- Every answer begins with the Advaita framing `॥ सर्वं खल्विदं ब्रह्म ॥`.
- Every answer closes with guided next actions and `हरिः ॐ 🙏`.
- Greeting behavior uses the Oneness welcome.
- Builder questions identify Deepak Tiwari as Developer, Builder & Product Architect.

### Regression suite
- Expanded self-benchmark to 15 production-oriented gates.
- Current result: 15/15 passed.

## v3.0.0 — 2026-09-05
- Introduced benchmark-driven backend hardening, caching, security headers, confidence metadata, request IDs, prompt-injection resistance, and operational intent routing.

## v2.x — 2026-09-05
- Stabilized Gemini-grounded RAG, evidence fallback, expanded Ekatma knowledge corpus, Advaita welcome, builder identity, chat-history-oriented UI, and operational intelligence modes.
