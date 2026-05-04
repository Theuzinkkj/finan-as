'use strict';

const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const { rateLimit } = require('express-rate-limit');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app          = express();
const SUPA_URL     = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_ANON    = process.env.SUPABASE_KEY  || '';   // chave anon (pública)
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPA_ANON; // chave service role
const GROQ_KEY     = process.env.GROQ_KEY      || '';

// ── Middleware global ─────────────────────────────────────────────────────────

app.use(express.json());

// CORS: aceita apenas origens conhecidas
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',').map(o => o.trim().replace(/\/+$/, ''));  // remove barra final

app.use(cors({
  origin(origin, cb) {
    // permite requests sem origin (ex: Postman em dev, server-side)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado para origem: ${origin}`));
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.static(path.join(__dirname, '..')));

// ── Utilitários ───────────────────────────────────────────────────────────────

// Decodifica o payload do JWT sem verificar assinatura.
// A verificação criptográfica é delegada ao Supabase (RLS usa auth.uid()).
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Cabeçalhos para chamadas ao Supabase usando a chave service role (backend).
function serviceHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey':       SUPA_SERVICE,
    'Authorization': `Bearer ${SUPA_SERVICE}`,
  };
}

// Cabeçalhos que incluem o JWT do usuário — necessário para o RLS funcionar.
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

  // Verifica expiração do token
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    return res.status(401).json({ message: 'Token expirado.' });
  }

  req.userId    = payload.sub;   // UUID do usuário autenticado
  req.authToken = auth;          // header completo para repassar ao Supabase
  next();
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const aiLimiter = rateLimit({
  windowMs:         60 * 1000,  // janela de 1 minuto
  max:              20,          // máximo 20 requisições por IP por minuto
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { message: 'Muitas requisições. Tente novamente em 1 minuto.' },
});

const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // janela de 15 minutos
  max:              10,               // máximo 10 tentativas de login por IP
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { message: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const r    = await fetch(`${SUPA_URL}/auth/v1/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
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
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

// GET — retorna APENAS as transações do usuário autenticado
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

// POST — força user_id a partir do token, ignora o que o cliente enviou
app.post('/api/transactions', requireAuth, async (req, res) => {
  try {
    const body = { ...req.body, user_id: req.userId };  // sobrescreve user_id

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

// DELETE — o filtro user_id garante que só o dono pode excluir
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
