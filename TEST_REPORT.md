# Validation Report

Validated in the build environment on 2026-09-04.

Command:

```bash
pytest -q
```

Result:

```text
17 passed, 1 skipped
```

The skipped test is the optional live Gemini integration test because no runtime `GEMINI_API_KEY` was configured in the test environment.

Validated behaviors include RAG-only routing, tool-only routing, combined RAG+tool, unsupported queries, missing/malformed/unknown order IDs, simulated tool failure, empty-message validation, request-field order IDs, prompt-injection resistance, and relevance-threshold rejection.
