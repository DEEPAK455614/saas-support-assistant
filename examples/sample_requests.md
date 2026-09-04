# Sample API Requests and Expected Response Shapes

## 1. RAG only

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is your refund policy?"}'
```

Expected shape:

```json
{
  "answer": "...grounded refund-policy answer...",
  "route": "rag_only",
  "evidence": [{"type":"knowledge_base","id":"refund-policy","title":"Refund Policy","score":0.8}],
  "tool": null,
  "verified": true
}
```

## 2. Tool only

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Where is order ORD-1001?"}'
```

Expected tool result includes `status: shipped`, carrier `DHL`, tracking number `DHL123456`, and estimated delivery `2026-09-08`.

## 3. RAG + tool

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Can I cancel order ORD-1001 and get a refund?"}'
```

The response contains both policy evidence and the deterministic order-tool result.

## 4. Unsupported

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Who won the FIFA World Cup?"}'
```

Expected answer: `I cannot verify that information from the available support knowledge base.`

## 5. Missing order ID

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Where is my order?"}'
```

Expected route: `validation_error`.

## 6. Simulated tool failure

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Where is ORD-FAIL?"}'
```

Expected route: `tool_error`.
