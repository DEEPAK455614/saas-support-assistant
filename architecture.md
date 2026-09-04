# Architecture

```text
Client
  |
  v
POST /chat
  |
  v
Pydantic validation
  |
  v
Deterministic router
  |--------------------------|
  v                          v
Gemini embedding RAG     allow-listed order tool
  |                          |
  v                          v
Top-k cosine search      get_order_status(order_id)
  |
  v
Relevance threshold
  |__________________________|
             |
             v
Grounded Gemini generation
             |
             v
Structured JSON + evidence
```

## Deterministic logic vs. LLM reasoning

The application uses code, not the model, to decide whether the order tool is permitted. Order intent and order IDs are detected deterministically, IDs are validated before execution, and only the registered `get_order_status` function can run. For non-order questions the application performs semantic retrieval and refuses weak context before Gemini sees it.

Gemini is used only after evidence has been collected. It converts verified evidence into concise natural language; it is not the source of truth.

## Retrieval

The knowledge base is intentionally small, so document embeddings are stored in process memory. On first retrieval, all FAQ documents are embedded with Gemini and cached in the retriever. Queries are embedded separately. Cosine similarity ranks the documents, `TOP_K` limits candidates, and `RELEVANCE_THRESHOLD` gates them.

This design is transparent and appropriate for 10 FAQ entries. A production corpus would use a persistent vector index, metadata filtering, evaluation, and potentially reranking.

## Tool design

`get_order_status(order_id)` is deterministic mock code. It validates IDs, returns exact predefined records, represents unknown orders as `found: false`, and supports `ORD-FAIL` to exercise failure handling. The model cannot request arbitrary functions.

## Hallucination controls

1. Policies come only from threshold-qualified KB context.
2. Order facts come only from the deterministic tool.
3. User claims are never treated as evidence.
4. Unsupported retrieval is refused.
5. The grounded system instruction forbids model-memory supplementation.
6. If Gemini fails, the service does not silently invent an answer.
7. Evidence metadata is returned to the caller.

## Scaling path

For production: persistent vector DB, Postgres for customer/application state, Redis for caching/idempotency, authenticated real order APIs, retries with bounded exponential backoff, rate limiting, OpenTelemetry tracing, structured logs/metrics, offline retrieval/grounding evaluations (RAGAS/DeepEval), semantic reranking, and optionally streaming responses.
