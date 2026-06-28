/**
 * La Fournée — Cloudflare Worker
 * KV binding: LAFOURNEE_KV
 *
 * Routes:
 *   POST /api/save  — body: JSON game state, identified by user IP
 *   GET  /api/load  — returns saved game state
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_PAYLOAD = 64 * 1024; // 64 KB

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function userKey(request) {
  // Use CF-Connecting-IP so each player has their own save slot.
  // In production replace with a proper auth token or session id.
  const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
  return `save:${ip}`;
}

async function handleSave(request, env) {
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (contentLength > MAX_PAYLOAD) {
    return json({ error: 'Payload too large' }, 413);
  }

  let body;
  try {
    body = await request.text();
    JSON.parse(body); // validate JSON
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const key = userKey(request);
  await env.LAFOURNEE_KV.put(key, body, { expirationTtl: 60 * 60 * 24 * 365 }); // 1 year

  return json({ ok: true });
}

async function handleLoad(request, env) {
  const key = userKey(request);
  const value = await env.LAFOURNEE_KV.get(key, 'text');

  if (!value) {
    return json({ ok: false, error: 'No save found' }, 404);
  }

  try {
    const data = JSON.parse(value);
    return json(data);
  } catch {
    return json({ error: 'Corrupted save' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { method, pathname } = { method: request.method, pathname: url.pathname };

    // Preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (pathname === '/api/save' && method === 'POST') return handleSave(request, env);
    if (pathname === '/api/load' && method === 'GET')  return handleLoad(request, env);

    return new Response('Not Found', { status: 404 });
  },
};
