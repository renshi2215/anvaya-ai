// Same job as server.js, for Netlify hosting. Set GEMINI_API_KEY in Netlify env variables.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { statusCode: 503, headers: { 'x-no-key': '1' }, body: JSON.stringify({ error: { message: 'GEMINI_API_KEY not set' } }) };
  try {
    const b = JSON.parse(event.body || '{}');
    const model = process.env.GEMINI_MODEL || b.model || 'gemini-3.7-flash';
    const gen = { maxOutputTokens: Math.min(+(b.generationConfig || {}).maxOutputTokens || 2000, 4000) };
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: b.contents, generationConfig: gen })
    });
    return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body: await r.text() };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: { message: 'Server error: ' + e.message } }) };
  }
};
