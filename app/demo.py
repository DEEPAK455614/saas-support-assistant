DEMO_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SaaS Support Assistant</title>
  <style>
    :root { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color-scheme: light dark; }
    body { margin: 0; background: #f5f7fb; color: #172033; }
    main { max-width: 860px; margin: 48px auto; padding: 0 20px; }
    .card { background: white; border: 1px solid #e2e7f0; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(20,35,70,.06); margin-bottom: 18px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    p { line-height: 1.55; }
    .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #e8f7ee; color: #17663a; font-weight: 700; font-size: 13px; }
    label { display: block; font-weight: 700; margin: 14px 0 6px; }
    textarea, input { box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid #cfd7e6; border-radius: 10px; background: white; color: #172033; font: inherit; }
    textarea { min-height: 100px; resize: vertical; }
    button, a.button { display: inline-block; border: 0; border-radius: 10px; padding: 11px 15px; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; }
    button.primary { background: #2457e6; color: white; margin-top: 14px; }
    button.sample { background: #eef2fb; color: #234; margin: 6px 6px 0 0; }
    a.button { background: #eef2fb; color: #234; margin-right: 8px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0e1422; color: #dce6ff; padding: 16px; border-radius: 10px; min-height: 70px; overflow: auto; }
    .muted { color: #60708a; font-size: 14px; }
    @media (prefers-color-scheme: dark) {
      body { background: #0e1422; color: #ecf1fb; }
      .card { background: #151d2d; border-color: #263249; }
      textarea, input { background: #0f1727; color: #ecf1fb; border-color: #34425e; }
      .muted { color: #a8b4c8; }
      button.sample, a.button { background: #263249; color: #ecf1fb; }
    }
  </style>
</head>
<body>
<main>
  <section class="card">
    <span class="badge">API ONLINE</span>
    <h1>SaaS Support Assistant</h1>
    <p>This is the live demo for the FastAPI RAG + tool-using support assistant. Policy answers are grounded in the local knowledge base; order status comes only from the deterministic mock order tool.</p>
    <a class="button" href="/docs">Swagger API Docs</a>
    <a class="button" href="/health">Health</a>
    <a class="button" href="/ready">Configuration</a>
  </section>

  <section class="card">
    <h2>Try POST /chat</h2>
    <div>
      <button class="sample" data-q="What is your refund policy?">Refund policy</button>
      <button class="sample" data-q="Where is order ORD-1001?">Order ORD-1001</button>
      <button class="sample" data-q="Can I cancel order ORD-1001 and get a refund?">Combined RAG + tool</button>
      <button class="sample" data-q="Who won the FIFA World Cup?">Unsupported question</button>
    </div>
    <label for="message">Message</label>
    <textarea id="message">What is your refund policy?</textarea>
    <label for="orderId">Optional order_id</label>
    <input id="orderId" placeholder="ORD-1001" />
    <button id="send" class="primary">Send request</button>
    <p id="status" class="muted">Ready.</p>
    <pre id="output">Response JSON will appear here.</pre>
  </section>
</main>
<script>
  const message = document.getElementById('message');
  const orderId = document.getElementById('orderId');
  const output = document.getElementById('output');
  const status = document.getElementById('status');
  document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { message.value = b.dataset.q; }));
  document.getElementById('send').addEventListener('click', async () => {
    const payload = { message: message.value };
    if (orderId.value.trim()) payload.order_id = orderId.value.trim();
    status.textContent = 'Sending request...';
    output.textContent = '';
    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      status.textContent = `HTTP ${response.status}`;
      output.textContent = JSON.stringify(body, null, 2);
    } catch (error) {
      status.textContent = 'Request failed';
      output.textContent = String(error);
    }
  });
</script>
</body>
</html>
"""
