'use strict';

const express = require('express');
const path    = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app          = express();
const SUPA_URL     = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_ANON    = process.env.SUPABASE_KEY         || '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPA_ANON;
const GROQ_KEY     = process.env.GROQ_KEY             || '';
const IS_PROD      = process.env.NODE_ENV === 'production';

// ── Validação de ambiente ─────────────────────────────────────────────────────
// Falha rápido na inicialização — melhor que erros silenciosos em runtime.

const MISSING = ['SUPABASE_URL', 'SUPABASE_KEY', 'GROQ_KEY'].filter(k => !process.env[k]);
if (MISSING.length) {
  console.error(`[Atlas] Variáveis de ambiente ausentes: ${MISSING.join(', ')}`);
  if (IS_PROD) process.exit(1);
}

// ── Middleware global ─────────────────────────────────────────────────────────

app.use(express.json());

// ── CORS ──────────────────────────────────────────────────────────────────────
// Middleware próprio — o pacote cors não expõe req no callback de origin,
// impedindo a comparação com o Host header para detectar same-origin.

const extraOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
);

app.use((req, res, next) => {
  const origin = (req.headers.origin || '').replace(/\/+$/, '');

  // Sem Origin = same-origin (GET sem fetch, curl, Postman)
  if (!origin) return next();

  // Same-origin: browser envia Origin mesmo em fetch() POST same-origin.
  // Comparar com o Host header resolve sem precisar configurar ALLOWED_ORIGINS.
  const host = req.headers.host || '';
  const isSameOrigin = origin === `https://${host}` || origin === `http://${host}`;

  const isAllowed =
    isSameOrigin ||
    extraOrigins.has(origin) ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);

  if (!isAllowed) {
    return res.status(403).json({ message: 'Origem não permitida.' });
  }

  // Cabeçalhos CORS para origens permitidas
  res.setHeader('Access-Control-Allow-Origin',      origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods',     'GET, POST, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type');
  res.setHeader('Vary', 'Origin');

  // Responde preflight diretamente
  if (req.method === 'OPTIONS') return res.status(204).end();

  next();
});

// ── Arquivos estáticos ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ── Cookie ────────────────────────────────────────────────────────────────────

const SESSION_COOKIE  = 'atlas_sid';
const REFRESH_COOKIE  = 'atlas_refresh';
const COOKIE_OPTS     = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: 'lax',
  path:     '/',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 dias
};

function setSessionCookies(res, access_token, refresh_token) {
  res.cookie(SESSION_COOKIE, access_token, COOKIE_OPTS);
  if (refresh_token) res.cookie(REFRESH_COOKIE, refresh_token, COOKIE_OPTS);
}

function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE,  { path: '/', secure: IS_PROD, sameSite: 'lax' });
  res.clearCookie(REFRESH_COOKIE, { path: '/', secure: IS_PROD, sameSite: 'lax' });
}

function parseCookies(req) {
  const out = {};
  for (const pair of (req.headers.cookie || '').split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

function makeRateLimiter(windowMs, max, message) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }, windowMs);

  return function rateLimiter(req, res, next) {
    const ip  = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) entry = { count: 0, resetAt: now + windowMs };
    entry.count++;
    hits.set(ip, entry);
    if (entry.count > max) return res.status(429).json({ message });
    next();
  };
}

const aiLimiter   = makeRateLimiter(60_000,       20, 'Muitas requisições. Tente novamente em 1 minuto.');
const authLimiter = makeRateLimiter(15 * 60_000,  10, 'Muitas tentativas. Tente novamente em 15 minutos.');

// ── Utilitários ───────────────────────────────────────────────────────────────

function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function supaHeaders(token) {
  return {
    'Content-Type':  'application/json',
    'apikey':        SUPA_ANON,
    'Authorization': `Bearer ${token}`,
  };
}

// Faz fetch ao proxy externo com tratamento de erro claro.
async function proxyFetch(url, opts) {
  let r;
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    r = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(tid);
  } catch (err) {
    // Erro de rede / DNS / timeout — Supabase ou Groq inacessível
    const isTimeout = err.name === 'AbortError';
    const e = new Error(isTimeout ? 'Tempo limite excedido. Tente novamente.' : 'Serviço externo inacessível. Tente novamente.');
    e.status = 502;
    throw e;
  }

  const text = await r.text().catch(() => '');
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  return { ok: r.ok, status: r.status, data };
}

// Extrai a mensagem de erro do payload Supabase.
function supaErrorMsg(data) {
  return data?.error_description || data?.msg || data?.message || data?.error || 'Erro desconhecido.';
}

// ── Middleware de autenticação ────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  let token     = cookies[SESSION_COOKIE];

  if (!token) return res.status(401).json({ message: 'Autenticação necessária.' });

  let payload = decodeJwtPayload(token);
  if (!payload?.sub) return res.status(401).json({ message: 'Token inválido.' });

  // Token expirado — tenta refresh automático com o refresh_token
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    const refreshToken = cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      clearSessionCookies(res);
      return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    try {
      const { ok, data } = await proxyFetch(
        `${SUPA_URL}/auth/v1/token?grant_type=refresh_token`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
          body:    JSON.stringify({ refresh_token: refreshToken }),
        }
      );

      if (!ok || !data?.access_token) {
        clearSessionCookies(res);
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
      }

      token   = data.access_token;
      payload = decodeJwtPayload(token);
      setSessionCookies(res, token, data.refresh_token || refreshToken);
    } catch {
      clearSessionCookies(res);
      return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }
  }

  req.userId    = payload.sub;
  req.userEmail = payload.email || '';
  req.authToken = token;
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', authLimiter, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify(req.body),
    });

    if (!ok) return res.status(status).json({
      error_code:        data?.error_code  || null,
      error_description: supaErrorMsg(data),
    });

    if (data?.user && !data.session && !data.access_token) {
      return res.status(200).json({ ok: true, confirmEmail: true });
    }

    const token   = data?.session?.access_token || data?.access_token;
    const refresh = data?.session?.refresh_token || data?.refresh_token;
    if (token) setSessionCookies(res, token, refresh);

    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/auth/signin', authLimiter, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(
      `${SUPA_URL}/auth/v1/token?grant_type=password`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
        body:    JSON.stringify(req.body),
      }
    );

    if (!ok) return res.status(status).json({
      error_code:        data?.error_code  || null,
      error_description: supaErrorMsg(data),
    });

    setSessionCookies(res, data.access_token, data.refresh_token);
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// Converte o token do redirect de confirmação de email em cookie httpOnly.
app.post('/api/auth/confirm', authLimiter, (req, res) => {
  const { access_token, refresh_token } = req.body || {};
  if (!access_token) return res.status(400).json({ message: 'Token ausente.' });

  const payload = decodeJwtPayload(access_token);
  if (!payload?.sub)                                return res.status(400).json({ message: 'Token inválido.' });
  if (payload.exp && Date.now() / 1000 > payload.exp) return res.status(400).json({ message: 'Token expirado.' });

  setSessionCookies(res, access_token, refresh_token || undefined);
  res.status(200).json({ ok: true });
});

app.post('/api/auth/signout', (req, res) => {
  clearSessionCookies(res);
  res.status(200).json({ ok: true });
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    let email = req.userEmail;
    if (!email) {
      const { ok, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
        headers: supaHeaders(req.authToken),
      });
      if (ok) email = data?.email || '';
    }
    res.status(200).json({ id: req.userId, email });
  } catch (err) { next(err); }
});

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/api/transactions', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?user_id=eq.${encodeURIComponent(req.userId)}`
              + `&select=*&order=date.desc`;

    const { ok, status, data } = await proxyFetch(url, { headers: supaHeaders(req.authToken) });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch (err) { next(err); }
});

app.post('/api/transactions', requireAuth, async (req, res, next) => {
  try {
    const body = { ...req.body, user_id: req.userId };

    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/rest/v1/transactions`, {
      method:  'POST',
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(body),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(201).end();
  } catch (err) { next(err); }
});

app.delete('/api/transactions/:id', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;

    const { ok, status, data } = await proxyFetch(url, {
      method:  'DELETE',
      headers: supaHeaders(req.authToken),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).end();
  } catch (err) { next(err); }
});

app.patch('/api/transactions/:id', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;

    const { ok, status, data } = await proxyFetch(url, {
      method:  'PATCH',
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(req.body),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).end();
  } catch (err) { next(err); }
});

// ── Profile ───────────────────────────────────────────────────────────────────

app.post('/api/profile/photo', requireAuth, async (req, res, next) => {
  try {
    const { base64 } = req.body || {};
    if (!base64) return res.status(400).json({ message: 'Imagem obrigatória.' });

    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ message: 'Formato de imagem inválido.' });

    const [, contentType, imageData] = match;
    const ext     = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const buffer  = Buffer.from(imageData, 'base64');
    const filePath = `${req.userId}.${ext}`;

    let uploadRes;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 30_000);
      uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/avatars/${filePath}`, {
        method:  'POST',
        headers: {
          'Content-Type':  contentType,
          'apikey':        SUPA_SERVICE,
          'Authorization': `Bearer ${SUPA_SERVICE}`,
          'x-upsert':      'true',
        },
        body:   buffer,
        signal: controller.signal,
      });
      clearTimeout(tid);
    } catch (err) {
      const e = new Error(err.name === 'AbortError' ? 'Tempo limite ao enviar foto.' : 'Erro ao enviar foto.');
      e.status = 502;
      throw e;
    }

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      let errData; try { errData = JSON.parse(errText); } catch { errData = null; }
      return res.status(uploadRes.status).json({ message: errData?.message || 'Erro ao salvar foto.' });
    }

    const photoUrl = `${SUPA_URL}/storage/v1/object/public/avatars/${filePath}`;

    // Salva a URL (pequena) no user_metadata — não o base64
    await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: supaHeaders(req.authToken),
      body:    JSON.stringify({ data: { photo: photoUrl } }),
    });

    res.status(200).json({ url: photoUrl });
  } catch (err) { next(err); }
});

app.delete('/api/profile/photo', requireAuth, async (req, res, next) => {
  try {
    // Busca metadados para encontrar URL atual da foto
    const { ok, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      headers: supaHeaders(req.authToken),
    });
    if (ok && data?.user_metadata?.photo) {
      // Extrai o caminho do arquivo da URL pública
      const url = data.user_metadata.photo;
      const match = url.match(/\/object\/public\/avatars\/(.+)$/);
      if (match) {
        await fetch(`${SUPA_URL}/storage/v1/object/avatars/${match[1]}`, {
          method:  'DELETE',
          headers: { 'apikey': SUPA_SERVICE, 'Authorization': `Bearer ${SUPA_SERVICE}` },
        });
      }
    }
    // Remove foto dos metadados
    await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: supaHeaders(req.authToken),
      body:    JSON.stringify({ data: { photo: null } }),
    });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/profile', requireAuth, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      headers: supaHeaders(req.authToken),
    });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json(data?.user_metadata || {});
  } catch (err) { next(err); }
});

app.patch('/api/profile', requireAuth, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: supaHeaders(req.authToken),
      body:    JSON.stringify({ data: req.body }),
    });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// ── Auth extra ───────────────────────────────────────────────────────────────

// Envia email de redefinição de senha (não requer autenticação prévia)
app.post('/api/auth/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email obrigatório.' });

    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/recover`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify({ email }),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// Atualiza senha do usuário autenticado (chamado após fluxo de recovery)
app.post('/api/auth/update-password', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });

    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPA_ANON,
        'Authorization': `Bearer ${req.authToken}`,
      },
      body: JSON.stringify({ password }),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// Exclui a conta do usuário autenticado (usa service key para admin)
app.delete('/api/auth/account', requireAuth, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(
      `${SUPA_URL}/auth/v1/admin/users/${req.userId}`,
      {
        method:  'DELETE',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        SUPA_SERVICE,
          'Authorization': `Bearer ${SUPA_SERVICE}`,
        },
      }
    );

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    clearSessionCookies(res);
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// ── AI ────────────────────────────────────────────────────────────────────────

app.post('/api/ai/chat', aiLimiter, requireAuth, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body:    JSON.stringify(req.body),
      }
    );

    if (!ok) return res.status(status).json({ message: data?.error?.message || 'Erro na IA.' });
    res.status(200).json(data);
  } catch (err) { next(err); }
});

// ── Error handler global ──────────────────────────────────────────────────────
// Centraliza todos os erros não tratados — CORS, proxy, runtime.

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status  = err.status || 500;
  const message = err.status ? err.message : 'Erro interno do servidor.';
  if (!err.status) console.error('[Atlas] Erro interno:', err);
  res.status(status).json({ message });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`Atlas Finance → http://localhost:${PORT}  [${IS_PROD ? 'prod' : 'dev'}]`)
);
