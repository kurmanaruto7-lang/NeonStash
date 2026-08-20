# NeonStash + Proxy — combined server

One Node server that serves your NeonStash site AND runs a real proxy
endpoint, so the Proxy tab can actually load sites that block iframes.

## Setup

```bash
npm install
npm start
```

Then open http://localhost:8000 — the whole site (Stash + Proxy tab) loads
from this one server.

## Tunnel it with ngrok

```bash
ngrok http 8000
```

Send the `https://...ngrok-free.app` link — no filename needed, it serves
`index.html` at the root automatically.

## How the proxy tab works now

- You type a URL (or a search term) into the Proxy tab and hit Go
- Instead of loading that site directly in an iframe (which Chrome blocks
  for sites sending `X-Frame-Options`), the browser requests
  `/proxy?url=<target>` from THIS server
- The server fetches the target page itself, strips the frame-blocking
  headers, rewrites its links/images/CSS to keep routing through
  `/proxy?url=...`, and hands the result back
- Since the response now comes from your own origin, Chrome has no reason
  to block it

## Known limitations

- Sites with heavy client-side routing (single-page apps, some React/Vue
  sites) may partially break since not every dynamic request gets rewritten
- Sites that detect proxying via other means (some banks, Google login,
  Cloudflare bot checks) may still refuse or show a CAPTCHA
- WebSocket-based sites (some games, live chat) won't work — this proxy
  only handles standard HTTP requests
- This has zero authentication/rate limiting built in — if you expose it
  publicly via ngrok, anyone with the link can proxy any site through your
  IP. Consider adding a password check to `/proxy` if you're sharing the
  link widely.
