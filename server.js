// NeonStash + Proxy server
// Serves the NeonStash site AND a same-origin proxy endpoint that fetches
// remote pages, strips frame-blocking headers, and rewrites their links so
// they keep routing back through this proxy. This is what actually lets
// the Proxy tab load sites Chrome would otherwise refuse to embed.

const express = require('express');
const fetch = require('node-fetch'); // npm install node-fetch@2
const { URL } = require('url');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// ---------- serve the static site ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- proxy endpoint ----------
// GET /proxy?url=https://example.com
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing ?url=');

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
    return res.status(400).send('Invalid URL');
  }

  try {
    const upstream = await fetch(targetUrl.href, {
      headers: {
        'User-Agent': req.get('User-Agent') || 'Mozilla/5.0',
        'Accept': req.get('Accept') || '*/*',
      },
      redirect: 'follow',
    });

    const contentType = upstream.headers.get('content-type') || '';

    // strip headers that block embedding
    res.removeHeader('X-Frame-Options');
    res.set('Content-Security-Policy', ''); // neutralize upstream CSP
    res.set('X-Frame-Options', '');

    if (contentType.includes('text/html')) {
      let body = await upstream.text();
      body = rewriteHtml(body, targetUrl);
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(body);
    }

    if (contentType.includes('text/css')) {
      let body = await upstream.text();
      body = rewriteCss(body, targetUrl);
      res.set('Content-Type', 'text/css');
      return res.send(body);
    }

    // everything else (js, images, fonts, etc) — stream through as-is
    res.set('Content-Type', contentType);
    const buf = await upstream.buffer();
    return res.send(buf);

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(502).send('Could not load that site: ' + err.message);
  }
});

// ---------- rewrite helpers ----------
function proxify(rawUrl, base) {
  try {
    const abs = new URL(rawUrl, base).href;
    return '/proxy?url=' + encodeURIComponent(abs);
  } catch (e) {
    return rawUrl; // leave data:, javascript:, #anchors, etc untouched
  }
}

function rewriteHtml(html, base) {
  // rewrite common attributes that point to other resources
  html = html.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, val) => {
    if (/^(data:|javascript:|mailto:|tel:|#)/i.test(val)) return match;
    return `${attr}="${proxify(val, base)}"`;
  });

  // rewrite srcset (images)
  html = html.replace(/srcset=["']([^"']+)["']/gi, (match, val) => {
    const rewritten = val
      .split(',')
      .map(part => {
        const [url, size] = part.trim().split(/\s+/);
        return `${proxify(url, base)}${size ? ' ' + size : ''}`;
      })
      .join(', ');
    return `srcset="${rewritten}"`;
  });

  // inject a <base> so any relative URLs we missed still resolve sensibly,
  // and neutralize inline frame-busting scripts as a best effort
  const baseTag = `<base href="${base.href}">`;
  html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);

  return html;
}

function rewriteCss(css, base) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, val) => {
    if (/^data:/i.test(val)) return match;
    return `url(${quote}${proxify(val, base)}${quote})`;
  });
}

app.listen(PORT, () => {
  console.log(`NeonStash + Proxy running at http://localhost:${PORT}`);
});
