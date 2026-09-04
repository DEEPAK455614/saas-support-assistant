# Sample API Requests and Expected Responses

Base URL when deployed: `https://saas-support-assistant.onrender.com`

The natural-language `answer` for RAG responses may vary slightly because Gemini composes it from verified context. The routing, evidence, tool metadata, and `verified` fields are the stable contract.

## 1. Knowledge-base question — RAG only

```bash
curl -X POST https://saas-support-assistant.onrender.com/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is your refund policy?"}'
```

Expected shape:

```json
{
  "answer": "<grounded answer based on Refund Policy>",
  "route": "rag_only",
  "evidence": [
    {
      "type": "knowledge_base",
      "id": "refund-policy",
      "title": "Refund Policy",
      "score": 0.7276
    }
  ],
  "tool": null,
  "verified": true
}
```

The live-calibrated top score for this query is approximately `0.7276`; small numeric variation is possible if the embedding service changes.

## 2. Order-status question — tool only

```bash
curl -X POST https://saas-support-assistant.onrender.com/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Where is order ORD-1001?"}'
```

Expected response:

```json
{
  "answer": "Order ORD-1001 is shipped. Carrier: DHL. Tracking number: DHL123456. Estimated delivery: 2026-09-08.",
  "route": "tool_only",
  "evidence": [],
  "tool": {
    "name": "get_order_status",
    "input": {"order_id": "ORD-1001"},
    "result": {
      "order_id": "ORD-1001",
      "found": true,
      "status": "shipped",
      "carrier": "DHL",
      "tracking_number": "DHL123456",
      "estimated_delivery": "2026-09-08"
    },
    "error": null
  },
  "verified": true
}
```

## 3. Combined policy + order lookup — RAG + tool

```bash
curl -X POST https://saas-support-assistant.onrender.com/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Can I cancel order ORD-1001 and get a refund?"}'
```

Expected shape:

```json
{
  "answer": "<grounded answer using policy evidence and the order-tool result>",
  "route": "rag_and_tool",
  "evidence": [
    {
      "type": "knowledge_base",
      "id": "<relevant policy document>",
      "title": "<policy title>",
      "score": 0.0
    }
  ],
  "tool": {
    "name": "get_order_status",
    "input": {"order_id": "ORD-1001"},
    "result": {
      "order_id": "ORD-1001",
      "found": true,
      "status": "shipped"
    },
    "error": null
  },
  "verified": true
}
```

The actual evidence score and the number of qualifying policy documents depend on semantic similarity; only threshold-qualified documents are sent to Gemini.

## 4. Question outside the knowledge base

```bash
curl -X POST https://saas-support-assistant.onrender.com/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Who won the FIFA World Cup?"}'
```

Expected response:

```json
{
  "answer": "I cannot verify that information from the available support knowledge base.",
  "route": "unsupported",
  "evidence": [],
  "tool": null,
  "verified": false
}
```

## 5. Missing order ID

```bash
curl -X POST https://saas-support-assistant.onrender.com/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Where is my order?"}'
```

Expected response:

```json
{
  "answer": "Please provide your order ID so I can check its status.",
  "route": "validation_error",
  "evidence": [],
  "tool": null,
  "verified": false
}
```

Malformed IDs such as `ORD-12` are also rejected with a controlled validation response.

## 6. Simulated tool failure

```bash
curl -X POST https://saas-support-assistant.onrender.com/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Where is ORD-FAIL?"}'
```

Expected response:

```json
{
  "answer": "I could not check the order because the order service is temporarily unavailable.",
  "route": "tool_error",
  "evidence": [],
  "tool": {
    "name": "get_order_status",
    "input": {"order_id": "ORD-FAIL"},
    "result": null,
    "error": "order_service_unavailable"
  },
  "verified": false
}
```

## Additional validation examples

Empty input returns HTTP `422` with `route: validation_error`. Unknown but syntactically valid order IDs such as `ORD-9999` return a controlled `found: false` tool result instead of inventing order data.