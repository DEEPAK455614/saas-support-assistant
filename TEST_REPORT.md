# Validation Report

Validated against the current `main` branch and the live Render deployment on 2026-09-04.

## Unit/API regression suite

Command:

```bash
pytest -q -m "not integration"
```

Latest GitHub Actions result:

```text
22 passed, 1 deselected, 2 warnings
```

The deselected test is the optional live Gemini integration test. The two warnings are dependency deprecation warnings from the FastAPI/Starlette test stack; they do not indicate application test failures.

Validated behaviors include:

- RAG-only knowledge-base question
- tool-only order-status question
- combined RAG + order-tool question
- question outside the knowledge base
- missing and malformed order IDs
- unknown valid order ID
- simulated tool failure
- empty-message validation
- order ID supplied in the request field
- prompt-injection resistance
- relevance-threshold rejection
- homepage, `/health`, and `/ready`
- general cancellation question without an unnecessary order lookup

## Live Render smoke test

The CI workflow tests the public deployment at `https://saas-support-assistant.onrender.com` using real HTTP requests.

Verified live checks:

- `GET /` -> HTTP 200 and demo page present
- `GET /health` -> HTTP 200 with `status: ok`
- `GET /ready` -> HTTP 200 with Gemini configured, `gemini-3.1-flash-lite`, and relevance threshold `0.60`
- Required case 1: refund-policy query -> `rag_only`, verified, `refund-policy` evidence returned
- Required case 2: `ORD-1001` lookup -> `tool_only`, verified, status `shipped`
- Required case 3: combined cancellation/refund + `ORD-1001` -> `rag_and_tool`, verified, with both KB evidence and tool result
- Required case 4: FIFA question -> `unsupported`, not verified
- Required case 5: missing order ID -> `validation_error`; malformed `ORD-12` -> `validation_error`
- Required case 6: `ORD-FAIL` -> `tool_error`, not verified, controlled `order_service_unavailable` metadata
- Additional edge case: whitespace-only message -> HTTP 422 with `validation_error`

Latest result:

```text
Live Render smoke tests passed for all required Task 1 cases
```

This validates both the repository implementation and the deployed Task 1 API path.