'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app      = express();
const SUPA_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_KEY = process.env.SUPABASE_KEY  || '';
const GROQ_KEY = process.env.GROQ_KEY      || '';

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '..')));

function supaHeaders(authHeader) {
  return {
    'Content-Type':  'application/json',
    'apikey':        SUPA_KEY,
    'Authorization': authHeader || `Bearer ${SUPA_KEY}`,
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', async (req, res) => {
  try {
    const r    = await fetch(`${SUPA_URL}/auth/v1/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const r    = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/api/transactions', async (req, res) => {
  try {
    const r    = await fetch(
      `${SUPA_URL}/rest/v1/transactions?select=*&order=date.desc`,
      { headers: supaHeaders(req.headers.authorization) }
    );
    const data = await r.json().catch(() => []);
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/transactions`, {
      method:  'POST',
      headers: { ...supaHeaders(req.headers.authorization), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(req.body),
    });
    res.status(r.status).end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/transactions?id=eq.${encodeURIComponent(req.params.id)}`,
      { method: 'DELETE', headers: supaHeaders(req.headers.authorization) }
    );
    res.status(r.status).end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── AI ────────────────────────────────────────────────────────────────────────

app.post('/api/ai/chat', async (req, res) => {
  try {
    const r    = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Atlas Finance → http://localhost:${PORT}`)
);
