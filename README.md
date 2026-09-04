# SaaS Support Assistant — Task 1

A compact FastAPI customer-support assistant that answers SaaS product/policy questions from a local knowledge base and uses a deterministic order-status tool when necessary. It is designed specifically for the assessment's Task 1: practical RAG, tool use, grounding, validation, errors, tests, and clear architecture without unnecessary framework complexity.

## Architecture

```text
Request -> Validation -> Deterministic Router
                          /            \
                    Semantic RAG     Order Tool
                          \            /
                     Grounded response
                  (Gemini, safe fallback)
                                |
                       Structured JSON response
```

See [`architecture.md`](architecture.md) for the detailed design.

## Technology choices

- Python 3.11+
- FastAPI + Pydantic v2
- Current `google-genai` Python SDK
- Gemini text model: `gemini-3.1-flash-lite` by default
- Gemini embedding model: `gemini-embedding-001`
- In-memory cosine-similarity vector search
- pytest + FastAPI TestClient

Gemini is the actual LLM used for grounded natural-language generation. Deterministic application logic remains responsible for routing safety, order-ID validation, tool allow-listing, relevance gating, and fail-safe behavior.

## Knowledge base

`data/faq.json` contains 10 entries covering subscription plans, cancellation, refunds, billing, password reset, account deletion, trials, data retention, support availability, and plan upgrades/downgrades. This file is the only source of truth for product and policy facts.

## Retrieval approach

The first RAG request embeds the FAQ entries and keeps their vectors in memory. Each incoming query is embedded, cosine similarity is computed, and the best `TOP_K` entries are ranked. Context is passed to Gemini only when the best score clears `RELEVANCE_THRESHOLD`.

### Relevance threshold

The default threshold is `0.60`, selected from live Gemini embedding calibration against this exact FAQ corpus.

Observed top cosine similarities during deployment calibration:

| Query type | Example | Top score |
|---|---|---:|
| related | refund policy | 0.7276 |
| related | password reset | 0.6991 |
| related | cancellation | 0.7055 |
| unrelated | FIFA World Cup | 0.5073 |
| unrelated | Tokyo weather | 0.5037 |
| unrelated | Roman emperor | 0.4880 |

The minimum observed related score was `0.6991`; the maximum observed unrelated score was `0.5073`; their midpoint was `0.6032`. `0.60` was therefore selected as a practical configurable boundary for this small assessment corpus. This does not guarantee semantic correctness and should be recalibrated if the embedding model or knowledge base changes.

The deployed service also completed a live grounded-generation self-test with `gemini-3.1-flash-lite` and received HTTP 200 from the Gemini API.

## Routing logic

The router uses deterministic signals:

- order/shipping/tracking language or an `ORD-####` ID -> order tool
- policy terms plus order intent -> RAG + tool
- all other support questions -> semantic retrieval, then threshold decision
- weak retrieval -> unsupported

An order tool call is never generated dynamically by Gemini. Only `get_order_status` exists in the allow-listed code path.

## Order tool

Mock records:

- `ORD-1001`: shipped via DHL, tracking `DHL123456`, ETA `2026-09-08`
- `ORD-1002`: processing
- `ORD-1003`: delivered
- unknown valid IDs: controlled `found: false`
- `ORD-FAIL`: simulated service failure

Accepted normal format: `ORD-1234`.

Tool-only answers are composed deterministically from the authoritative tool result and do not depend on Gemini availability.

## Grounding and prompt-injection defense

Gemini receives a system instruction requiring it to use only the supplied KB and tool evidence. User messages are marked as untrusted input. Policy facts are never imported from model memory, user-supplied order claims are not considered verified, and weak retrieval never becomes model context.

If Gemini generation has a transient timeout after valid evidence has already been retrieved, the API returns a deterministic grounded fallback from the retrieved FAQ/tool result instead of hallucinating or failing the whole request.

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

Open `http://127.0.0.1:8000/` for the browser demo or `http://127.0.0.1:8000/docs` for Swagger UI.

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Runtime readiness/configuration:

```bash
curl http://127.0.0.1:8000/ready
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

Unit/API tests use fakes and do not require Gemini calls:

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
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | grounded response generation |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | semantic retrieval |
| `GEMINI_TIMEOUT_SECONDS` | `12` | Gemini request timeout |
| `TOP_K` | `3` | number of retrieved documents |
| `RELEVANCE_THRESHOLD` | `0.60` | minimum top cosine similarity |
| `MAX_MESSAGE_LENGTH` | `4000` | request message limit |
| `LOG_LEVEL` | `INFO` | logging verbosity |
| `STARTUP_SELF_TEST` | `false` | optional deployment calibration diagnostic |

## Render deployment

This repository contains `render.yaml`. In Render:

1. Create a Blueprint or Web Service from this repository.
2. Add `GEMINI_API_KEY` as a secret environment variable.
3. Deploy.

Manual settings:

- Runtime: Python
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

## Error and degradation behavior

- Missing/malformed order ID -> `validation_error`
- Unknown order -> controlled `tool_only` response with `found: false`
- Simulated order-service failure -> `tool_error`
- Weak KB relevance -> `unsupported`
- Embedding service failure -> `service_error`, or verified order data only for a combined request
- Gemini generation timeout/error after successful retrieval -> deterministic grounded fallback from the already-verified evidence
- Missing Gemini key -> order-tool requests still work; RAG requests return a controlled service error

No stack traces or credentials are exposed in API responses.

## Assumptions

- The local FAQ is authoritative for product/policy facts.
- The mock order tool is authoritative for order-specific facts.
- Unknown valid order IDs are not treated as tool crashes.
- Gemini is a grounded response composer, not the source of policy truth or tool names.

## Limitations

- In-memory embeddings are recomputed after process restart.
- The relevance threshold is corpus/model-specific.
- Mock orders are not persistent.
- No authentication/rate limiting is included because the assessment does not require them.
- One API instance has no shared cache/state across replicas.

## Production improvements

For a production system, consider a persistent vector database, Redis embedding/result caching, PostgreSQL, authentication/authorization, rate limiting, retries/backoff, circuit breakers, OpenTelemetry tracing, structured metrics, secret management, real OMS integration, idempotency keys, an evaluation dataset, RAGAS/DeepEval, semantic reranking, and streaming responses.
