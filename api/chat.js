// Vercel serverless function. The API key is read from environment variables only.
const SYSTEM_PROMPT = require('../lib/systemPrompt');

const MAX_MESSAGES = 20;
const MAX_CHARS = 8000;
const hits = new Map(); // best-effort per-instance rate limit
const LIMIT = 20, WINDOW = 60_000;

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > LIMIT;
}

function clean(text) {
  return String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_CHARS);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  // Groq API Key check
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server is missing GROQ_API_KEY. Add it in your hosting dashboard.' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !Array.isArray(body.messages)) return res.status(400).json({ error: 'Invalid request.' });

  let messages = body.messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map(m => ({ role: m.role, content: clean(m.content) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'Send a message first.' });

  // Prepend System Prompt as a system message for Groq format
  const formattedMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
  ];

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.DADA_MODEL || 'llama-3.3-70b-versatile',
        max_tokens: 4096,
        messages: formattedMessages
      })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Upstream error', r.status, data?.error?.message);
      return res.status(502).json({ error: 'The AI service returned an error. Check your API key and model name.' });
    }
    const reply = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ reply });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not reach the AI service.' });
  }
};
