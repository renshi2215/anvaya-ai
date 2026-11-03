// Local server: serves index.html and proxies /api/gemini using the key from .env
// Run:  node server.js   (Node 18+)   then open http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path');

// tiny .env loader (no packages needed)
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {}

const PORT = process.env.PORT || 3000;
const hits = new Map(); // simple per-IP rate limit
function limited(ip) {
  const now = Date.now(), max = +process.env.RATE_LIMIT_PER_MIN || 20;
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      res.writeHead(503, { 'x-no-key': '1', 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'GEMINI_API_KEY missing in .env' } }));
    }
    if (limited(req.socket.remoteAddress)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'Too many requests. Wait a minute.' } }));
    }
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const b = JSON.parse(raw);
        const model = process.env.GEMINI_MODEL || b.model || 'gemini-3.7-flash';
        const gen = { maxOutputTokens: Math.min(+(b.generationConfig || {}).maxOutputTokens || 2000, 4000) };
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: b.contents, generationConfig: gen })
        });
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(await r.text());
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Server error: ' + e.message } }));
      }
    });
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/index.html') || req.url.startsWith('/?'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  res.writeHead(404); res.end('Not found');
}).listen(PORT, () => console.log('ANVAYA AI running at http://localhost:' + PORT +
  (process.env.GEMINI_API_KEY ? '  (key loaded from .env)' : '  (WARNING: GEMINI_API_KEY not set in .env)')));
