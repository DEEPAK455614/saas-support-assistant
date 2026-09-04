# SaaS Support Assistant — Task 1

A compact FastAPI customer-support assistant that answers SaaS product/policy questions from a local knowledge base and uses a deterministic order-status tool when necessary. It is designed specifically for the assessment's Task 1: practical RAG, tool use, grounding, validation, errors, tests, and clear architecture without unnecessary framework complexity.

## Architecture

```text
Request -> Validation -> Deterministic Router
                          /            \
                    Semantic RAG     Order Tool
                          \            /
                           Grounded Gemini
                                |
                       Structured JSON response
```

See [`architecture.md`](architecture.md) for the detailed design.

## Technology choices

- Python 3.11+
- FastAPI + Pydantic v2
- Current `google-genai` Python SDK
- Gemini text model: `gemini-3.7-flash` by default
- Gemini embedding model: `gemini-embedding-001`
- In-memory cosine-similarity vector search
- pytest + FastAPI TestClient

Gemini is used because the assignment requests a real LLM, while deterministic application logic remains responsible for routing safety, order-ID validation, tool allow-listing, and relevance gating.

## Knowledge base

`data/faq.json` contains 10 entries covering subscription plans, cancellation, refunds, billing, password reset, account deletion, trials, data retention, support availability, and plan upgrades/downgrades. This file is the only source of truth for product and policy facts.

## Retrieval approach

The first RAG request embeds the FAQ entries and keeps their vectors in memory. Each incoming query is embedded, cosine similarity is computed, and the best `TOP_K` entries are ranked. Context is passed to Gemini only when the best score clears `RELEVANCE_THRESHOLD`.

### Relevance threshold

The default threshold is `0.72`. Embedding scores are model- and corpus-dependent, so it is configurable and must be calibrated rather than treated as a universal constant. The intended calibration procedure is to run a small evaluation set containing clearly related FAQ queries and clearly unrelated queries, inspect their top similarities, then choose a threshold between the two observed ranges. The test suite independently proves that weak retrieval is rejected using a deterministic fake embedder. A threshold lowers risk but does not guarantee semantic correctness.

For a real submission demo, record your observed Gemini score ranges after running `scripts/calibrate_threshold.py` or a small equivalent evaluation and adjust `.env` if necessary.

## Routing logic

The router uses deterministic signals:

- order/shipping/tracking language or an `ORD-####` ID -> order tool
- policy terms plus order intent -> RAG + tool
- all other support questions -> semantic retrieval, then threshold decision
- weak retrieval -> unsupported

An order tool call is never generated dynamically by Gemini. Only `get_order_status` exists in the tool registry/code path.

## Order tool

Mock records:

- `ORD-1001`: shipped via DHL, tracking `DHL123456`, ETA `2026-09-08`
- `ORD-1002`: processing
- `ORD-1003`: delivered
- unknown valid IDs: controlled `found: false`
- `ORD-FAIL`: simulated service failure

Accepted normal format: `ORD-1234`.

## Grounding and prompt-injection defense

Gemini receives a system instruction requiring it to use only the supplied KB and tool evidence. User messages are marked as untrusted input. Policy facts are never imported from model memory, user-supplied order claims are not considered verified, and weak retrieval never becomes model context.

## Setup

### macOS/Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### Windows PowerShell

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set `GEMINI_API_KEY` in `.env`.

## Run locally

```bash
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for Swagger UI.

Health check:

```bash
curl http://127.0.0.1:8000/health
```

## API usage

### KB-only

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is your refund policy?"}'
```

### Tool-only

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Where is order ORD-1001?"}'
```

### Combined

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Can I cancel order ORD-1001 and get a refund?"}'
```

See [`examples/sample_requests.md`](examples/sample_requests.md) for complete examples.

## Tests

Unit/API tests use fakes and do not require paid Gemini calls:

```bash
pytest -v -m "not integration"
```

Optional live Gemini test:

```bash
GEMINI_API_KEY=... RUN_GEMINI_INTEGRATION=1 pytest -v -m integration
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | empty | Gemini API credential |
| `GEMINI_MODEL` | `gemini-3.7-flash` | grounded response generation |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | semantic retrieval |
| `TOP_K` | `3` | number of retrieved documents |
| `RELEVANCE_THRESHOLD` | `0.72` | minimum top similarity |
| `MAX_MESSAGE_LENGTH` | `4000` | request message limit |
| `LOG_LEVEL` | `INFO` | logging verbosity |

## Render deployment

This repository contains `render.yaml`. In Render:

1. Create a new Blueprint or Web Service from this repository.
2. Add `GEMINI_API_KEY` as a secret environment variable.
3. Deploy.

Manual settings if not using the Blueprint:

- Runtime: Python
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

## Assumptions

- The local FAQ is authoritative for product/policy facts.
- The mock order tool is authoritative for order-specific facts.
- Unknown valid order IDs are not treated as tool crashes.
- Expected conversational failures generally return HTTP 200 with an explicit route; malformed HTTP/request validation returns FastAPI 4xx responses.
- Gemini is only a grounded response composer, not the source of policy truth or tool names.

## Limitations

- In-memory embeddings are recomputed after process restart.
- The relevance threshold should be calibrated against the actual Gemini embedding model before production use.
- Mock orders are not persistent.
- No authentication/rate limiting is included because the assessment does not require them.
- One API instance has no shared cache/state across replicas.

## Production improvements

For a production system, consider a persistent vector database, Redis embedding/result caching, PostgreSQL, authentication/authorization, rate limiting, retries/backoff, circuit breakers, OpenTelemetry tracing, structured metrics, secret management, real OMS integration, idempotency keys, an evaluation dataset, RAGAS/DeepEval, semantic reranking, and streaming responses.
