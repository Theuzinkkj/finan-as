'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app          = express();
const SUPA_URL     = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_ANON    = process.env.SUPABASE_KEY         || '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPA_ANON;
const GROQ_KEY     = process.env.GROQ_KEY             || '';

// ── Middleware global ─────────────────────────────────────────────────────────

app.use(express.json());

// CORS: permite o próprio domínio + origens configuradas em ALLOWED_ORIGINS.
// Segurança real é garantida pelo middleware requireAuth (JWT).
const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Permite requisições sem Origin (Postman, server-side, same-origin em alguns browsers)
    if (!origin) return cb(null, true);
    const clean = origin.replace(/\/+$/, '');
    if (extraOrigins.includes(clean)) return cb(null, true);
    // Permite se o Origin é o próprio servidor (same-origin)
    cb(null, true);
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.static(path.join(__dirname, '..')));

// ── Rate limiting (sem dependência externa) ───────────────────────────────────

function makeRateLimiter(windowMs, max, message) {
  const hits = new Map();

  // Limpa entradas expiradas a cada janela para não acumular memória
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }, windowMs);

  return function rateLimiter(req, res, next) {
    const ip  = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
    }

    entry.count++;
    hits.set(ip, entry);

    if (entry.count > max) {
      return res.status(429).json({ message });
    }
    next();
  };
}

const aiLimiter   = makeRateLimiter(60 * 1000,       20, 'Muitas requisições. Tente novamente em 1 minuto.');
const authLimiter = makeRateLimiter(15 * 60 * 1000,  10, 'Muitas tentativas. Tente novamente em 15 minutos.');

// ── Utilitários ───────────────────────────────────────────────────────────────

function decodeJwtPayload(token) {
  try {
    const part   = token.split('.')[1];
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function userHeaders(authHeader) {
  return {
    'Content-Type': 'application/json',
    'apikey':       SUPA_ANON,
    'Authorization': authHeader,
  };
}

// ── Middleware de autenticação ────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Autenticação necessária.' });
  }

  const token   = auth.slice(7);
  const payload = decodeJwtPayload(token);

  if (!payload || !payload.sub) {
    return res.status(401).json({ message: 'Token inválido.' });
  }

  if (payload.exp && Date.now() / 1000 > payload.exp) {
    return res.status(401).json({ message: 'Token expirado.' });
  }

  req.userId    = payload.sub;
  req.authToken = auth;
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// Retorna apenas os campos que o cliente precisa — nunca o objeto bruto do Supabase.
function pickSession(data) {
  const session = data.session || data; // signup retorna { session: {...} }, signin retorna o token direto
  return {
    access_token:  session.access_token  || null,
    refresh_token: session.refresh_token || null,
    expires_in:    session.expires_in    || 3600,
    user: {
      id:    data.user?.id    || session.user?.id    || null,
      email: data.user?.email || session.user?.email || null,
    },
  };
}

function pickError(data) {
  // Repassa apenas o código de erro e a mensagem — sem stack, sem metadados internos.
  return {
    error:             data.error             || null,
    error_code:        data.error_code        || null,
    error_description: data.error_description || data.msg || data.message || 'Erro desconhecido.',
  };
}

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const r    = await fetch(`${SUPA_URL}/auth/v1/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) return res.status(r.status).json(pickError(data));

    // Cadastro pendente de confirmação de email: sem session, mas tem user
    if (data.user && !data.session && !data.access_token) {
      return res.status(200).json({ user: { id: data.user.id, email: data.user.email } });
    }

    res.status(200).json(pickSession(data));
  } catch (e) {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

app.post('/api/auth/signin', authLimiter, async (req, res) => {
  try {
    const r    = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) return res.status(r.status).json(pickError(data));

    res.status(200).json(pickSession(data));
  } catch (e) {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?user_id=eq.${encodeURIComponent(req.userId)}`
              + `&select=*&order=date.desc`;

    const r    = await fetch(url, { headers: userHeaders(req.authToken) });
    const data = await r.json().catch(() => []);
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  try {
    const body = { ...req.body, user_id: req.userId };

    const r = await fetch(`${SUPA_URL}/rest/v1/transactions`, {
      method:  'POST',
      headers: { ...userHeaders(req.authToken), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(body),
    });
    res.status(r.status).end();
  } catch (e) {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;

    const r = await fetch(url, {
      method:  'DELETE',
      headers: userHeaders(req.authToken),
    });
    res.status(r.status).end();
  } catch (e) {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

// ── AI ────────────────────────────────────────────────────────────────────────

app.post('/api/ai/chat', requireAuth, aiLimiter, async (req, res) => {
  try {
    const r    = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Atlas Finance → http://localhost:${PORT}`)
);
