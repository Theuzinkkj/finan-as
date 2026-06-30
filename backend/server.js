'use strict';

const express                   = require('express');
const path                      = require('path');
const nodemailer                = require('nodemailer');
const {
  randomBytes, createHash, createHmac, timingSafeEqual, createCipheriv, createDecipheriv,
} = require('crypto');
const Sentry                    = require('@sentry/node');
const compression               = require('compression');
const helmet                    = require('helmet');
const cron                      = require('node-cron');
const { z }                     = require('zod');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app          = express();
const SUPA_URL     = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_ANON    = process.env.SUPABASE_KEY         || '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPA_ANON;
const GROQ_KEY     = process.env.GROQ_KEY             || '';
const IS_PROD      = process.env.NODE_ENV === 'production';

// ── Sentry ────────────────────────────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV || 'development',
    tracesSampleRate: IS_PROD ? 0.1 : 0,
  });
}

// ── Logger (Pino) ─────────────────────────────────────────────────────────────
const log = require('pino')({
  level: IS_PROD ? 'info' : 'debug',
  ...(IS_PROD ? {} : {
    transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } },
  }),
});

// ── Email (Nodemailer) ────────────────────────────────────────────────────────
// Suporta SMTP genérico (Gmail, Outlook, Brevo, etc.) via variáveis de ambiente.
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
function createMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = +(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth:   { user, pass },
  });
}

const _mailer   = createMailer();
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'Atlas <noreply@atlas.app>';

// ── Schemas de validação (Zod) ────────────────────────────────────────────────

const str  = (msg) => z.string({ required_error: msg, invalid_type_error: msg });
const num  = (msg) => z.number({ required_error: msg, invalid_type_error: msg });

const schemas = {
  signup: z.object({
    email:    str('Email obrigatório.').email('Email inválido.'),
    password: str('Senha obrigatória.').min(6, 'A senha deve ter pelo menos 6 caracteres.').max(128, 'Senha muito longa.'),
  }),

  signin: z.object({
    email:    str('Email obrigatório.').email('Email inválido.'),
    password: str('Senha obrigatória.').min(1, 'Senha obrigatória.').max(128, 'Senha muito longa.'),
  }),

  resetPassword: z.object({
    email: str('Email obrigatório.').email('Email inválido.'),
  }),

  updatePassword: z.object({
    password: str('Senha obrigatória.').min(6, 'A nova senha deve ter pelo menos 6 caracteres.').max(128, 'Senha muito longa.'),
  }),

  transaction: z.object({
    id:           str().optional(),
    amount:       num('Valor obrigatório.').positive('O valor deve ser positivo.').max(100_000_000, 'Valor muito alto.'),
    type:         z.enum(['receita', 'despesa', 'benefício', 'beneficio'], { required_error: 'Tipo obrigatório.', invalid_type_error: 'Tipo inválido.' }),
    category:     str('Categoria obrigatória.').min(1, 'Categoria obrigatória.').max(100, 'Categoria muito longa.'),
    description:  str().max(500, 'Descrição muito longa.').optional().default(''),
    notes:        str().max(500, 'Observação muito longa.').nullish(),
    date:         str('Data obrigatória.').regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida. Use o formato AAAA-MM-DD.'),
    fixed:            z.boolean().nullish(),
    paymentMethod:    str().max(50, 'Método de pagamento muito longo.').nullish(),
    benefitType:      str().max(50).nullish(),
    invoiceItems:     z.array(z.any()).max(100, 'Muitos itens na fatura.').nullish(),
    paid:             z.boolean().nullish(),
    recurringId:      str().max(100).nullish(),
    repeatUntil:      str().regex(/^\d{4}-\d{2}$/, 'Mês final inválido. Use o formato AAAA-MM.').nullish(),
  }),

  transactionPatch: z.object({
    amount:       num().positive('O valor deve ser positivo.').max(100_000_000, 'Valor muito alto.').optional(),
    type:         z.enum(['receita', 'despesa', 'benefício', 'beneficio'], { invalid_type_error: 'Tipo inválido.' }).optional(),
    category:     str().min(1, 'Categoria obrigatória.').max(100, 'Categoria muito longa.').optional(),
    description:  str().max(500, 'Descrição muito longa.').optional(),
    notes:        str().max(500, 'Observação muito longa.').nullish(),
    date:         str().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida. Use o formato AAAA-MM-DD.').optional(),
    fixed:            z.boolean().nullish(),
    paymentMethod:    str().max(50, 'Método de pagamento muito longo.').nullish(),
    benefitType:      str().max(50).nullish(),
    invoiceItems:     z.array(z.any()).max(100, 'Muitos itens na fatura.').nullish(),
    paid:             z.boolean().nullish(),
    recurringId:      str().max(100).nullish(),
    repeatUntil:      str().regex(/^\d{4}-\d{2}$/, 'Mês final inválido. Use o formato AAAA-MM.').nullish(),
  }),

  portfolio: z.object({
    date:             str('Data obrigatória.').regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida. Use o formato AAAA-MM-DD.'),
    asset:            str('Ativo obrigatório.').min(1, 'Ativo obrigatório.').max(20, 'Nome do ativo muito longo.'),
    amount:           num('Valor obrigatório.').positive('O valor deve ser positivo.').max(100_000_000, 'Valor muito alto.'),
    notes:            str().max(500, 'Observação muito longa.').optional(),
    asset_type:       str().max(50).optional(),
    transaction_type: z.enum(['compra', 'venda'], { invalid_type_error: 'Tipo inválido.' }).optional().default('compra'),
    quantity:         num().positive('A quantidade deve ser positiva.').optional(),
    price:            num().positive('O preço deve ser positivo.').optional(),
    other_costs:      num().min(0, 'Custos não podem ser negativos.').optional(),
  }),

  profile: z.object({
    name:    str().max(100, 'Nome muito longo.').optional(),
    phone:   str().max(20, 'Telefone muito longo.').optional(),
    cpf:     str().max(14, 'CPF inválido.').optional(),
    address: str().max(300, 'Endereço muito longo.').optional(),
    budgets: z.record(num().min(0, 'Valor de orçamento inválido.').max(100_000_000, 'Valor de orçamento muito alto.')).optional(),
  }),

  aiChat: z.object({
    model:    str('Modelo obrigatório.').max(100),
    messages: z.array(z.object({
      role:    z.enum(['user', 'assistant', 'system'], { invalid_type_error: 'Papel inválido na mensagem.' }),
      content: str().max(20_000, 'Mensagem muito longa (máx. 20.000 caracteres).'),
    })).min(1, 'Nenhuma mensagem enviada.').max(50, 'Muitas mensagens no histórico.'),
    temperature: num().min(0).max(2).optional(),
    max_tokens:  num().int().min(1).max(4096).optional(),
  }),
};

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues?.[0]?.message ?? 'Dados inválidos.';
      return res.status(400).json({ message });
    }
    req.body = result.data;
    next();
  };
}

// ── Validação de ambiente ─────────────────────────────────────────────────────
// Falha rápido na inicialização — melhor que erros silenciosos em runtime.

const MISSING = ['SUPABASE_URL', 'SUPABASE_KEY', 'GROQ_KEY'].filter(k => !process.env[k]);
if (MISSING.length) {
  log.error({ missing: MISSING }, 'Variáveis de ambiente ausentes');
  if (IS_PROD) process.exit(1);
}

// ── Middleware global ─────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: false, // CSP gerenciado pelo frontend (PWA tem service worker)
  crossOriginEmbedderPolicy: false, // evita quebrar recursos de terceiros (fontes, ícones)
}));

// Compressão gzip/brotli em todas as respostas (reduz ~70% do payload)
app.use(compression());

app.use(express.json({ limit: '7mb' }));

// ── CORS ──────────────────────────────────────────────────────────────────────
// Middleware próprio — o pacote cors não expõe req no callback de origin,
// impedindo a comparação com o Host header para detectar same-origin.

const extraOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
);

app.use((req, res, next) => {
  const origin = (req.headers.origin || '').replace(/\/+$/, '');

  // Sem Origin ou Origin: null = same-origin ou Service Worker da mesma origem
  if (!origin || origin === 'null') return next();

  // Same-origin: browser envia Origin mesmo em fetch() POST same-origin.
  // Railway (e outros proxies) preservam o domínio original em X-Forwarded-Host.
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0].trim().replace(/\/+$/, '');
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

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' blob: https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' blob: https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' blob: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' blob: https: https://viacep.com.br",
    "frame-src 'none'",
    "worker-src 'self' blob:",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ── Rotas de navegação ────────────────────────────────────────────────────────
const fe = f => path.join(__dirname, '..', 'frontend', f);

app.get('/',          (_req, res) => res.redirect('/landing'));
app.get('/checkout',    (_req, res) => res.sendFile(fe('checkout.html')));
app.get('/planos',      (_req, res) => res.sendFile(fe('planos.html')));
app.get('/login',       (_req, res) => res.sendFile(fe('login.html')));
app.get('/status',      (_req, res) => res.sendFile(fe('status.html')));
app.get('/termos',           (_req, res) => res.sendFile(fe('termos.html')));
app.get('/termos.html',      (_req, res) => res.redirect(301, '/termos'));
app.get('/privacidade',      (_req, res) => res.sendFile(fe('privacidade.html')));
app.get('/privacidade.html', (_req, res) => res.redirect(301, '/privacidade'));
app.get('/support',          (_req, res) => res.sendFile(fe('support.html')));
app.get('/support.html',     (_req, res) => res.redirect(301, '/support'));
app.get('/sw.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(fe('sw.js'));
});
// /app com injeção do billing.js (paywall) ao final do body
app.get('/app', async (_req, res) => {
  const fs = require('fs');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    let html = await fs.promises.readFile(fe('index.html'), 'utf8');
    html = html.replace('</body>', '<script src="/js/billing.js"></script></body>');
    res.send(html);
  } catch {
    res.sendFile(fe('index.html'));
  }
});

// /landing com injeção de script para capturar botão "Assinar"
app.get('/landing', async (_req, res) => {
  const fs = require('fs');
  try {
    let html = await fs.promises.readFile(fe('landing.html'), 'utf8');
    html = html.replace('</head>', `<script>
      (function(){
        function hookCtaButtons(){
          document.querySelectorAll('a,button').forEach(function(el){
            if(el._hooked) return;
            var txt = el.textContent.trim().toLowerCase();
            var dest = null;
            // "Assinar / Assine" (sem "grátis") → /checkout  (compra direta Pro)
            if((txt.includes('assinar')||txt.includes('assine'))&&!txt.includes('grátis')&&!txt.includes('gratis')){
              dest = '/checkout';
            }
            // "Testar / Começar / Criar conta" → /planos  (escolher plano)
            else if(txt.includes('começar')||txt.includes('comecar')||txt.includes('criar conta')||txt.includes('testar')||txt.includes('experim')){
              dest = '/planos';
            }
            // "Já tenho conta / Entrar / Fazer login" → /login
            else if(txt==='entrar'||txt.includes('fazer login')||txt.includes('tenho conta')||txt.includes('já tenho')){
              dest = '/login';
            }
            // "Ver planos / Preços" → /planos
            else if(txt.includes('ver planos')||txt.includes('preços')||txt.includes('ver plano')){
              dest = '/planos';
            }
            if(dest){
              el._hooked = true;
              el.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();window.location.href=dest;},{capture:true});
              if(el.tagName==='A') el.href=dest;
            }
          });
        }
        new MutationObserver(hookCtaButtons).observe(document.documentElement,{childList:true,subtree:true});
        document.addEventListener('DOMContentLoaded',hookCtaButtons);
        setTimeout(hookCtaButtons,600);
        setTimeout(hookCtaButtons,1800);

        // Injeta botão "Ver demo" próximo ao CTA principal
        function injectDemoButton(){
          if(document.getElementById('__atlas_demo_btn')) return;
          var primaryCta = null;
          document.querySelectorAll('a,button').forEach(function(el){
            if(primaryCta) return;
            var txt = el.textContent.trim().toLowerCase();
            if(txt.includes('começar')||txt.includes('comecar')||txt.includes('criar conta')||txt.includes('testar')||txt.includes('assinar')){
              primaryCta = el;
            }
          });
          if(!primaryCta) return;
          var btn = document.createElement('a');
          btn.id = '__atlas_demo_btn';
          btn.href = '#';
          btn.className = 'btn btn-ghost nav-cta nav-cta-demo';
          btn.innerHTML = '<span class="nav-cta-demo-icon" aria-hidden="true">&#9654;</span><span>Ver demo interativo</span>';
          btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;height:44px;min-height:44px;padding:0 18px;border-radius:12px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.16);color:#cbd5e1;font-size:14px;line-height:1;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s,color .2s;vertical-align:middle;white-space:nowrap;box-sizing:border-box;transform:none;';
          btn.addEventListener('mouseenter',function(){this.style.background='rgba(255,255,255,0.13)';this.style.color='#f1f5f9';});
          btn.addEventListener('mouseleave',function(){this.style.background='rgba(255,255,255,0.07)';this.style.color='#cbd5e1';});
          btn.addEventListener('click',function(e){
            e.preventDefault();e.stopPropagation();
            window.location.href='/app?demo=1';
          },{capture:true});
          var ctaGroup = primaryCta.closest('.nav-ctas');
          if(ctaGroup) ctaGroup.appendChild(btn);
          else primaryCta.insertAdjacentElement('afterend', btn);
        }
        setTimeout(injectDemoButton,900);
        setTimeout(injectDemoButton,1800);
        setTimeout(injectDemoButton,3500);

        // Corrige link "Status" no footer (bundled handler não redireciona)
        document.addEventListener('click',function(e){
          var a=e.target.closest('footer a');
          if(!a) return;
          if((a.textContent||'').trim()==='Status'){
            e.preventDefault();e.stopImmediatePropagation();
            window.location.href='/status';
          }
        },true);
      })();
    </script></head>`);
    res.send(html);
  } catch {
    res.sendFile(fe('landing.html'));
  }
});

// ── Status público ────────────────────────────────────────────────────────────
// Verificação real dos serviços com cache de 30 s para não sobrecarregar Supabase.

let _statusCache = null;
let _statusCacheAt = 0;
const STATUS_CACHE_TTL = 30_000;

async function checkHealth(url, headers = {}) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4_000);
    const r = await fetch(url, { method: 'HEAD', headers, signal: controller.signal });
    clearTimeout(tid);
    return r.status < 500;
  } catch {
    return false;
  }
}

app.get('/api/status', async (_req, res) => {
  const now = Date.now();
  if (_statusCache && now - _statusCacheAt < STATUS_CACHE_TTL) {
    return res.json(_statusCache);
  }

  // Verifica serviços em paralelo
  const [dbOk, authOk] = await Promise.all([
    checkHealth(`${SUPA_URL}/rest/v1/`, { apikey: SUPA_ANON }),
    checkHealth(`${SUPA_URL}/auth/v1/health`),
  ]);

  const components = [
    { id: 'api',      name: 'API',                 status: 'operational' },
    { id: 'database', name: 'Banco de Dados',       status: dbOk   ? 'operational' : 'incident' },
    { id: 'auth',     name: 'Autenticação',         status: authOk ? 'operational' : 'incident' },
    { id: 'storage',  name: 'Armazenamento',        status: dbOk   ? 'operational' : 'degraded' },
  ];

  // Lê incidentes do arquivo (editável manualmente)
  let incidents = [];
  try {
    const { promises: fs } = require('fs');
    const raw = await fs.readFile(path.join(__dirname, 'incidents.json'), 'utf8');
    incidents = JSON.parse(raw).incidents || [];
  } catch { /* sem arquivo = sem incidentes */ }

  const hasRealIncident = components.some(c => c.status === 'incident');
  const hasActiveManual = incidents.some(i => i.status !== 'resolved');
  const hasDegraded     = components.some(c => c.status === 'degraded');

  const overall = (hasRealIncident || hasActiveManual) ? 'incident'
                : hasDegraded                          ? 'degraded'
                : 'operational';

  _statusCache = { overall, components, incidents, checkedAt: new Date().toISOString() };
  _statusCacheAt = now;

  res.json(_statusCache);
});

// ── Arquivos estáticos ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend')));

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
// Usa Supabase como armazenamento compartilhado para funcionar com múltiplas
// instâncias. Em caso de falha do banco, libera o request (fail open) para
// não derrubar o site por causa do rate limiting.

function makeRateLimiter(windowMs, max, message) {
  return async function rateLimiter(req, res, next) {
    try {
      const ip  = req.ip || req.connection?.remoteAddress || 'unknown';
      const key = `${req.path}:${ip}`;

      const { ok, data } = await proxyFetch(
        `${SUPA_URL}/rest/v1/rpc/check_rate_limit`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPA_SERVICE,
            'Authorization': `Bearer ${SUPA_SERVICE}`,
          },
          body: JSON.stringify({ p_key: key, p_window_ms: windowMs, p_max: max }),
        }
      );

      if (ok && data === true) return res.status(429).json({ message });
    } catch {
      // Fail open: se o banco estiver fora, não bloqueia o usuário
    }
    next();
  };
}

const aiLimiter   = makeRateLimiter(60_000,       20, 'Muitas requisições. Tente novamente em 1 minuto.');
const authLimiter = makeRateLimiter(15 * 60_000,  10, 'Muitas tentativas. Tente novamente em 15 minutos.');

// ── Utilitários ───────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

function validateImageMagicBytes(buffer, mimeType) {
  const type = mimeType.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') {
    return buffer.length >= 3 &&
      buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  if (type === 'image/png') {
    return buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
  }
  if (type === 'image/gif') {
    return buffer.length >= 4 &&
      buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
  }
  if (type === 'image/webp') {
    return buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  }
  return false;
}

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

// Faz fetch ao proxy externo com timeout configurável e retry automático.
// retries: número de tentativas extras (0 = sem retry). Só recomendado para
// APIs idempotentes podem usar retry. Nunca use retry em writes Supabase.
async function proxyFetch(url, opts, { timeout = 10_000, retries = 0 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Backoff exponencial: 600ms, 1.2s, 2.4s...
      await new Promise(r => setTimeout(r, 600 * 2 ** (attempt - 1)));
    }

    let r;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeout);
      try {
        r = await fetch(url, { ...opts, signal: controller.signal });
      } finally {
        clearTimeout(tid);
      }
    } catch (err) {
      if (attempt < retries) continue;
      const isTimeout = err.name === 'AbortError';
      const e = new Error(isTimeout ? 'Tempo limite excedido. Tente novamente.' : 'Serviço externo inacessível. Tente novamente.');
      e.status = 502;
      throw e;
    }

    const text = await r.text().catch(() => '');
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    // Retry em rate limit ou indisponibilidade temporária
    if ((r.status === 429 || r.status === 503) && attempt < retries) continue;

    return { ok: r.ok, status: r.status, data };
  }
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

app.post('/api/auth/signup', authLimiter, validate(schemas.signup), async (req, res, next) => {
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

    const email = req.body.email;
    const name  = data?.user?.user_metadata?.name || email.split('@')[0];

    // Fire-and-forget — não bloqueia a resposta
    sendEmail({
      to:      email,
      subject: `Bem-vindo ao Atlas Finance, ${name}!`,
      html:    onboardingEmailHtml(name),
    }).catch(() => {});

    const token   = data?.session?.access_token || data?.access_token;
    const refresh = data?.session?.refresh_token || data?.refresh_token;

    if (!token) {
      return res.status(200).json({ ok: true, confirmEmail: true });
    }

    setSessionCookies(res, token, refresh);
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/auth/signin', authLimiter, validate(schemas.signin), async (req, res, next) => {
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

// ── OAuth (Google / Apple via Supabase PKCE) ──────────────────────────────────

const OAUTH_VERIFIER_COOKIE = 'atlas_ov';

app.get('/api/auth/oauth/:provider', (req, res) => {
  const { provider } = req.params;
  if (!['google', 'apple'].includes(provider)) {
    return res.redirect('/login?error=invalid_provider');
  }

  const verifier  = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  res.cookie(OAUTH_VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: 'lax',
    path:     '/',
    maxAge:   10 * 60 * 1000,
  });

  const appUrl      = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
  const callbackUrl = `${appUrl}/api/auth/callback`;

  const oauthUrl = new URL(`${SUPA_URL}/auth/v1/authorize`);
  oauthUrl.searchParams.set('provider',              provider);
  oauthUrl.searchParams.set('redirect_to',           callbackUrl);
  oauthUrl.searchParams.set('code_challenge',        challenge);
  oauthUrl.searchParams.set('code_challenge_method', 'S256');
  oauthUrl.searchParams.set('flow_type',             'pkce');

  res.redirect(oauthUrl.toString());
});

app.get('/api/auth/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/login?error=${encodeURIComponent(error)}`);
  }

  const cookies  = parseCookies(req);
  const verifier = cookies[OAUTH_VERIFIER_COOKIE];

  res.clearCookie(OAUTH_VERIFIER_COOKIE, { path: '/', secure: IS_PROD, sameSite: 'lax' });

  if (!code || !verifier) {
    return res.redirect('/login?error=oauth_failed');
  }

  try {
    const { ok, data } = await proxyFetch(
      `${SUPA_URL}/auth/v1/token?grant_type=pkce`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
        body:    JSON.stringify({ auth_code: code, code_verifier: verifier }),
      }
    );

    if (!ok || !data?.access_token) {
      log.error({ data }, 'OAuth: token exchange falhou');
      return res.redirect('/login?error=oauth_failed');
    }

    setSessionCookies(res, data.access_token, data.refresh_token);
    res.redirect('/app');
  } catch (err) {
    log.error({ err }, 'OAuth: callback error');
    res.redirect('/login?error=oauth_failed');
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/api/transactions', requireAuth, async (req, res, next) => {
  try {
    let url = `${SUPA_URL}/rest/v1/transactions`
            + `?user_id=eq.${encodeURIComponent(req.userId)}`
            + `&select=*&order=date.desc`;

    // ?month=YYYY-MM  →  filtra exatamente aquele mês
    const { month, since } = req.query;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      url += `&date=gte.${month}-01&date=lte.${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (since && /^\d{4}-\d{2}-\d{2}$/.test(since)) {
      // ?since=YYYY-MM-DD  →  carrega a partir daquela data
      url += `&date=gte.${since}`;
    }

    // Paginação: ?limit=N&offset=N  (padrão 200, máx 5000)
    const limit  = Math.min(parseInt(req.query.limit)  || 200, 5000);
    const offset = Math.max(parseInt(req.query.offset) || 0,    0);
    url += `&limit=${limit}&offset=${offset}`;

    const { ok, status, data } = await proxyFetch(url, { headers: supaHeaders(req.authToken) });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch (err) { next(err); }
});

app.post('/api/transactions', requireAuth, validate(schemas.transaction), async (req, res, next) => {
  try {
    const { recurringId, ...transaction } = req.body;
    if (recurringId && transaction.date) {
      transaction.id = `${recurringId}__${transaction.date.slice(0, 7)}`;
    }
    const body = { ...transaction, user_id: req.userId };

    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/rest/v1/transactions`, {
      method:  'POST',
      // resolution=merge-duplicates: se o ID já existe, atualiza em vez de falhar
      // garante que re-envios da pending_queue sejam idempotentes
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=minimal,resolution=merge-duplicates' },
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

app.patch('/api/transactions/:id', requireAuth, validate(schemas.transactionPatch), async (req, res, next) => {
  try {
    const { recurringId: _recurringId, ...patch } = req.body;
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;

    const { ok, status, data } = await proxyFetch(url, {
      method:  'PATCH',
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(patch),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).end();
  } catch (err) { next(err); }
});

// ── Profile ───────────────────────────────────────────────────────────────────

async function ensureAvatarBucket() {
  const headers = {
    'Content-Type':  'application/json',
    'apikey':        SUPA_SERVICE,
    'Authorization': `Bearer ${SUPA_SERVICE}`,
  };
  const existing = await proxyFetch(`${SUPA_URL}/storage/v1/bucket/avatars`, { headers });
  if (existing.ok) {
    if (existing.data?.public) return;
    const updated = await proxyFetch(`${SUPA_URL}/storage/v1/bucket/avatars`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        public:             true,
        file_size_limit:    MAX_PHOTO_BYTES,
        allowed_mime_types: [...ALLOWED_IMAGE_TYPES],
      }),
    });
    if (!updated.ok) {
      const err = new Error(supaErrorMsg(updated.data) || 'Erro ao configurar armazenamento de fotos.');
      err.status = updated.status;
      throw err;
    }
    return;
  }
  if (existing.status !== 404) {
    const err = new Error(supaErrorMsg(existing.data) || 'Erro ao verificar armazenamento de fotos.');
    err.status = existing.status;
    throw err;
  }

  const created = await proxyFetch(`${SUPA_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id:                 'avatars',
      name:               'avatars',
      public:             true,
      file_size_limit:    MAX_PHOTO_BYTES,
      allowed_mime_types: [...ALLOWED_IMAGE_TYPES],
    }),
  });
  if (!created.ok && created.status !== 409) {
    const err = new Error(supaErrorMsg(created.data) || 'Erro ao criar armazenamento de fotos.');
    err.status = created.status;
    throw err;
  }
}

app.post('/api/profile/photo', requireAuth, async (req, res, next) => {
  try {
    const { base64 } = req.body || {};
    if (!base64) return res.status(400).json({ message: 'Imagem obrigatória.' });

    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ message: 'Formato de imagem inválido.' });

    const [, contentType, imageData] = match;
    const normalizedType = contentType.toLowerCase();

    if (!ALLOWED_IMAGE_TYPES.has(normalizedType)) {
      return res.status(400).json({ message: 'Formato não suportado. Tente uma foto em JPEG ou PNG.' });
    }

    const buffer = Buffer.from(imageData, 'base64');

    if (buffer.length > MAX_PHOTO_BYTES) {
      return res.status(400).json({ message: 'Arquivo muito pesado. Tente uma imagem menor que 5 MB.' });
    }

    if (!validateImageMagicBytes(buffer, normalizedType)) {
      return res.status(400).json({ message: 'Arquivo não reconhecido. Tente uma foto diferente.' });
    }

    await ensureAvatarBucket();

    const currentUser = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      headers: supaHeaders(req.authToken),
    });
    if (!currentUser.ok) {
      return res.status(currentUser.status).json({ message: supaErrorMsg(currentUser.data) });
    }

    const oldPhotoUrl = currentUser.data?.user_metadata?.photo || '';
    const ext          = normalizedType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const filePath     = `${req.userId}/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;

    let uploadRes;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 30_000);
      uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/avatars/${filePath}`, {
        method:  'POST',
        headers: {
          'Content-Type':  normalizedType,
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

    // Salva a URL no perfil e confirma a persistência antes de responder sucesso.
    const saved = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: supaHeaders(req.authToken),
      body:    JSON.stringify({ data: { photo: photoUrl } }),
    });
    if (!saved.ok) {
      await proxyFetch(`${SUPA_URL}/storage/v1/object/avatars/${filePath}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPA_SERVICE, 'Authorization': `Bearer ${SUPA_SERVICE}` },
      }).catch(() => {});
      return res.status(saved.status).json({ message: supaErrorMsg(saved.data) });
    }

    // Remove o arquivo anterior depois que a nova foto já está persistida.
    const oldMatch = oldPhotoUrl.match(/\/object\/public\/avatars\/([^?]+)(?:\?.*)?$/);
    if (oldMatch && oldMatch[1] !== filePath) {
      await proxyFetch(`${SUPA_URL}/storage/v1/object/avatars/${oldMatch[1]}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPA_SERVICE, 'Authorization': `Bearer ${SUPA_SERVICE}` },
      }).catch(() => {});
    }

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

app.patch('/api/profile', requireAuth, validate(schemas.profile), async (req, res, next) => {
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
app.post('/api/auth/reset-password', authLimiter, validate(schemas.resetPassword), async (req, res, next) => {
  try {
    const { email } = req.body;

    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/recover`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify({ email }),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// Reenvia email de confirmação de cadastro
app.post('/api/auth/resend-confirmation', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email obrigatório.' });

    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/resend`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify({ type: 'signup', email }),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// Atualiza senha do usuário autenticado (chamado após fluxo de recovery)
app.post('/api/auth/update-password', requireAuth, validate(schemas.updatePassword), async (req, res, next) => {
  try {
    const { password } = req.body;

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

// Exclui a conta do usuário autenticado — LGPD: apaga todos os dados associados
app.delete('/api/auth/account', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const svcHdr = {
      'Content-Type':  'application/json',
      'apikey':        SUPA_SERVICE,
      'Authorization': `Bearer ${SUPA_SERVICE}`,
    };

    // 1. Busca metadados para obter URL da foto de perfil
    const { ok: metaOk, data: metaData } = await proxyFetch(
      `${SUPA_URL}/auth/v1/admin/users/${userId}`,
      { headers: svcHdr }
    );

    // 2. Remove foto do storage (não-fatal)
    if (metaOk && metaData?.user_metadata?.photo) {
      const photoMatch = metaData.user_metadata.photo.match(/\/object\/public\/avatars\/(.+)$/);
      if (photoMatch) {
        await proxyFetch(`${SUPA_URL}/storage/v1/object/avatars/${photoMatch[1]}`, {
          method: 'DELETE',
          headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}` },
        }).catch(() => {});
      }
    }

    // 3. Remove todas as transações do usuário
    await proxyFetch(
      `${SUPA_URL}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}`,
      { method: 'DELETE', headers: { ...svcHdr, Prefer: 'return=minimal' } }
    );

    // 4. Remove todos os lançamentos de portfólio
    await proxyFetch(
      `${SUPA_URL}/rest/v1/portfolio_entries?user_id=eq.${encodeURIComponent(userId)}`,
      { method: 'DELETE', headers: { ...svcHdr, Prefer: 'return=minimal' } }
    );

    // 5. Remove a conta de autenticação (invalida sessões automaticamente)
    const { ok, status, data } = await proxyFetch(
      `${SUPA_URL}/auth/v1/admin/users/${userId}`,
      { method: 'DELETE', headers: svcHdr }
    );

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    clearSessionCookies(res);
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// ── Portabilidade de dados (LGPD art. 18) ────────────────────────────────────

app.get('/api/user/export', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const svcHdr = {
      'Content-Type':  'application/json',
      'apikey':        SUPA_SERVICE,
      'Authorization': `Bearer ${SUPA_SERVICE}`,
    };

    // Busca em paralelo: perfil, transações e portfólio
    const [profileRes, txRes, pfRes] = await Promise.all([
      proxyFetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, { headers: svcHdr }),
      proxyFetch(
        `${SUPA_URL}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&select=*&order=date.desc&limit=10000`,
        { headers: { ...svcHdr, Accept: 'application/json' } }
      ),
      proxyFetch(
        `${SUPA_URL}/rest/v1/portfolio_entries?user_id=eq.${encodeURIComponent(userId)}&select=*&order=date.desc&limit=10000`,
        { headers: { ...svcHdr, Accept: 'application/json' } }
      ),
    ]);

    const meta = profileRes.ok ? profileRes.data?.user_metadata || {} : {};

    const payload = {
      exportedAt:   new Date().toISOString(),
      lgpd:         'Exportação de dados pessoais conforme LGPD art. 18 — direito à portabilidade.',
      profile: {
        id:        userId,
        email:     profileRes.ok ? profileRes.data?.email : null,
        name:      meta.name      || null,
        phone:     meta.phone     || null,
        cpf:       meta.cpf       || null,
        address:   meta.address   || null,
        plan:      meta.plan      || 'free',
        createdAt: profileRes.ok ? profileRes.data?.created_at : null,
      },
      transactions:    txRes.ok  ? (txRes.data  || []) : [],
      portfolioEntries: pfRes.ok ? (pfRes.data  || []) : [],
    };

    res.setHeader('Content-Disposition', 'attachment; filename="atlas-meus-dados.json"');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(payload);
  } catch (err) { next(err); }
});

// ── Portfolio ─────────────────────────────────────────────────────────────────

app.get('/api/portfolio', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/portfolio_entries`
              + `?user_id=eq.${encodeURIComponent(req.userId)}`
              + `&select=*&order=date.desc,created_at.desc`;
    const { ok, status, data } = await proxyFetch(url, { headers: supaHeaders(req.authToken) });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.json(Array.isArray(data) ? data : []);
  } catch (err) { next(err); }
});

app.post('/api/portfolio', requireAuth, validate(schemas.portfolio), async (req, res, next) => {
  try {
    const { date, asset, amount, notes, asset_type, transaction_type, quantity, price, other_costs } = req.body;

    const body = {
      date,
      asset: asset.trim(),
      amount: +amount,
      notes: notes?.trim() || null,
      asset_type: asset_type || null,
      transaction_type: transaction_type || 'compra',
      quantity: quantity != null ? +quantity : null,
      price: price != null ? +price : null,
      other_costs: other_costs != null ? +other_costs : null,
      user_id: req.userId,
    };
    let r = await proxyFetch(`${SUPA_URL}/rest/v1/portfolio_entries`, {
      method:  'POST',
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=representation' },
      body:    JSON.stringify(body),
    });
    // Fallback: if schema cache rejects extended columns, retry with core fields only
    if (!r.ok) {
      const msg = (supaErrorMsg(r.data) || '').toLowerCase();
      if (msg.includes('column') || msg.includes('schema') || msg.includes('relation')) {
        const coreBody = { date: body.date, asset: body.asset, amount: body.amount, notes: body.notes, user_id: body.user_id };
        r = await proxyFetch(`${SUPA_URL}/rest/v1/portfolio_entries`, {
          method:  'POST',
          headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=representation' },
          body:    JSON.stringify(coreBody),
        });
      }
    }
    if (!r.ok) return res.status(r.status).json({ message: supaErrorMsg(r.data) });
    res.status(201).json(Array.isArray(r.data) ? r.data[0] : r.data);
  } catch (err) { next(err); }
});

app.patch('/api/portfolio/:id', requireAuth, validate(schemas.portfolio.partial()), async (req, res, next) => {
  try {
    const { date, asset, amount, notes, asset_type, transaction_type, quantity, price, other_costs } = req.body || {};
    const updates = {};
    if (date)             updates.date             = date;
    if (asset)            updates.asset            = asset.trim();
    if (amount != null)   updates.amount           = +amount;
    if (notes !== undefined) updates.notes         = notes?.trim() || null;
    if (asset_type !== undefined)       updates.asset_type       = asset_type || null;
    if (transaction_type !== undefined) updates.transaction_type = transaction_type || 'compra';
    if (quantity != null) updates.quantity   = +quantity;
    if (price    != null) updates.price      = +price;
    if (other_costs != null) updates.other_costs = +other_costs;

    const url = `${SUPA_URL}/rest/v1/portfolio_entries`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;
    let rp = await proxyFetch(url, {
      method:  'PATCH',
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=representation' },
      body:    JSON.stringify(updates),
    });
    // Fallback: retry without extended columns if schema cache error
    if (!rp.ok) {
      const msg = (supaErrorMsg(rp.data) || '').toLowerCase();
      if (msg.includes('column') || msg.includes('schema') || msg.includes('relation')) {
        const coreUpdates = {};
        if (updates.date)   coreUpdates.date   = updates.date;
        if (updates.asset)  coreUpdates.asset  = updates.asset;
        if (updates.amount != null) coreUpdates.amount = updates.amount;
        if (updates.notes  !== undefined) coreUpdates.notes = updates.notes;
        rp = await proxyFetch(url, {
          method:  'PATCH',
          headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=representation' },
          body:    JSON.stringify(coreUpdates),
        });
      }
    }
    if (!rp.ok) return res.status(rp.status).json({ message: supaErrorMsg(rp.data) });
    res.json(Array.isArray(rp.data) ? rp.data[0] : rp.data);
  } catch (err) { next(err); }
});

app.delete('/api/portfolio/:id', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/portfolio_entries`
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

// ── Billing (Mercado Pago) ───────────────────────────────────────────────────

const billingLimiter = makeRateLimiter(60_000, 5, 'Muitas tentativas. Tente novamente em 1 minuto.');
const MP_API_URL = 'https://api.mercadopago.com';

function serviceHeaders() {
  return {
    'Content-Type':  'application/json',
    'apikey':        SUPA_SERVICE,
    'Authorization': `Bearer ${SUPA_SERVICE}`,
  };
}

async function mercadoPagoRequest(endpoint, { method = 'GET', body, idempotencyKey } = {}) {
  if (!process.env.MP_ACCESS_TOKEN) {
    const err = new Error('Mercado Pago não configurado. Adicione MP_ACCESS_TOKEN no ambiente.');
    err.status = 503;
    throw err;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
  };
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;

  const { ok, status, data } = await proxyFetch(`${MP_API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }, { timeout: 20_000, retries: 1 });

  if (!ok) {
    const err = new Error(data?.message || data?.error || 'Erro ao comunicar com o Mercado Pago.');
    err.status = status;
    err.details = data;
    throw err;
  }
  return data;
}

function checkoutEncryptionKey() {
  const secret = process.env.CHECKOUT_ENCRYPTION_KEY
    || `${SUPA_SERVICE}:${process.env.MP_WEBHOOK_SECRET || ''}`;
  return createHash('sha256').update(secret).digest();
}

function encryptCheckoutPayload(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', checkoutEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function decryptCheckoutPayload(value) {
  const [iv, tag, encrypted] = String(value || '').split('.');
  if (!iv || !tag || !encrypted) throw new Error('Cadastro pendente inválido.');
  const decipher = createDecipheriv('aes-256-gcm', checkoutEncryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8'));
}

async function getPendingCheckout(checkoutId) {
  const result = await proxyFetch(
    `${SUPA_URL}/rest/v1/pending_checkouts?id=eq.${encodeURIComponent(checkoutId)}&select=*&limit=1`,
    { headers: { ...serviceHeaders(), Accept: 'application/json' } }
  );
  if (!result.ok) {
    const err = new Error(
      result.status === 404
        ? 'Execute pending-checkouts-migration.sql no Supabase.'
        : supaErrorMsg(result.data)
    );
    err.status = result.status === 404 ? 503 : result.status;
    throw err;
  }
  return result.data?.[0] || null;
}

async function syncMercadoPagoSubscription(subscription) {
  const checkoutId = subscription?.external_reference;
  if (!checkoutId) return null;
  const pending = await getPendingCheckout(checkoutId);
  if (!pending) return null;
  const status = subscription.status || 'pending';

  if (status !== 'authorized') {
    await proxyFetch(
      `${SUPA_URL}/rest/v1/pending_checkouts?id=eq.${encodeURIComponent(checkoutId)}`,
      {
        method: 'PATCH',
        headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          subscription_id: String(subscription.id),
          status,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    return { status, accountReady: false };
  }

  if (pending.status === 'completed' && pending.user_id) {
    return { status, accountReady: true, userId: pending.user_id };
  }

  const claimed = await proxyFetch(
    `${SUPA_URL}/rest/v1/pending_checkouts?id=eq.${encodeURIComponent(checkoutId)}&status=in.(pending,authorized)`,
    {
      method: 'PATCH',
      headers: { ...serviceHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'processing',
        subscription_id: String(subscription.id),
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!claimed.ok) {
    const err = new Error(supaErrorMsg(claimed.data));
    err.status = claimed.status;
    throw err;
  }
  if (!claimed.data?.length) {
    const latest = await getPendingCheckout(checkoutId);
    return { status, accountReady: latest?.status === 'completed', userId: latest?.user_id };
  }

  try {
    const registration = decryptCheckoutPayload(pending.encrypted_payload);
    const created = await proxyFetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({
        email: registration.email,
        password: registration.password,
        email_confirm: true,
        user_metadata: {
          name: registration.name,
          cpf: registration.cpf,
          phone: registration.phone,
          address: registration.address,
          plan: 'pro',
          plan_type: registration.planType,
          billing_provider: 'mercadopago',
          billing_pending: false,
          mp_subscription_id: String(subscription.id),
          mp_subscription_status: status,
        },
      }),
    });
    if (!created.ok) {
      const err = new Error(supaErrorMsg(created.data));
      err.status = created.status;
      throw err;
    }

    await proxyFetch(
      `${SUPA_URL}/rest/v1/pending_checkouts?id=eq.${encodeURIComponent(checkoutId)}`,
      {
        method: 'PATCH',
        headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'completed',
          user_id: created.data.id,
          encrypted_payload: null,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    return { status, accountReady: true, userId: created.data.id };
  } catch (err) {
    await proxyFetch(
      `${SUPA_URL}/rest/v1/pending_checkouts?id=eq.${encodeURIComponent(checkoutId)}`,
      {
        method: 'PATCH',
        headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'authorized', updated_at: new Date().toISOString() }),
      }
    ).catch(() => {});
    throw err;
  }
}

function mercadoPagoSignatureIsValid(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  if (!secret || !signature || !requestId || !dataId) return false;

  const parts = Object.fromEntries(
    String(signature).split(',').map(part => part.trim().split('=')).filter(pair => pair.length === 2)
  );
  if (!parts.ts || !parts.v1) return false;

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const received = String(parts.v1);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function moneyEnv(value, fallback) {
  if (!value) return fallback;
  const clean = String(value).replace(/[^\d,.-]/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Retorna a disponibilidade do provedor e os dados dos planos.
app.get('/api/billing/config', (_req, res) => {
  res.json({
    mercadoPagoEnabled: Boolean(process.env.MP_ACCESS_TOKEN),
    plans: {
      monthly: {
        name:  process.env.MP_MONTHLY_PLAN_NAME || 'Atlas Pro',
        price: process.env.MP_MONTHLY_PRICE_LABEL || 'R$ 19,90',
      },
      annual: {
        name:         process.env.MP_ANNUAL_PLAN_NAME || 'Atlas Premium',
        price:        process.env.MP_ANNUAL_PRICE_LABEL || 'R$ 202,80',
        monthlyPrice: process.env.MP_ANNUAL_MONTHLY_PRICE_LABEL || 'R$ 16,90',
      },
    },
    planName:  process.env.MP_MONTHLY_PLAN_NAME || 'Atlas Pro',
    planPrice: process.env.MP_MONTHLY_PRICE_LABEL || 'R$ 19,90',
  });
});

// Guarda o cadastro criptografado e redireciona para autorização no Mercado Pago.
// A conta Supabase só é criada após a confirmação do pagamento.
app.post('/api/billing/mercadopago/prepare', billingLimiter, async (req, res, next) => {
  let checkoutId = null;
  let createdSubscriptionId = null;
  try {
    const {
      email, password, name, cpf, phone, address, planType = 'monthly',
    } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: 'A senha deve ter pelo menos 8 caracteres.' });
    }

    const registered = await proxyFetch(`${SUPA_URL}/rest/v1/rpc/atlas_email_registered`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ p_email: String(email).trim().toLowerCase() }),
    });
    if (!registered.ok) {
      const message = registered.status === 404
        ? 'Execute pending-checkouts-migration.sql no Supabase.'
        : supaErrorMsg(registered.data);
      return res.status(registered.status === 404 ? 503 : registered.status).json({ message });
    }
    if (registered.data === true) {
      return res.status(409).json({ message: 'Este e-mail já está cadastrado. Faça login.' });
    }

    const annual = planType === 'annual';
    const amount = annual
      ? moneyEnv(process.env.MP_ANNUAL_PRICE, 202.80)
      : moneyEnv(process.env.MP_MONTHLY_PRICE, 19.90);
    const planName = annual
      ? (process.env.MP_ANNUAL_PLAN_NAME || 'Atlas Premium')
      : (process.env.MP_MONTHLY_PLAN_NAME || 'Atlas Pro');
    const appUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
    checkoutId = randomBytes(24).toString('base64url');

    const pending = await proxyFetch(`${SUPA_URL}/rest/v1/pending_checkouts`, {
      method: 'POST',
      headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: checkoutId,
        email: String(email).trim().toLowerCase(),
        encrypted_payload: encryptCheckoutPayload({
          email: String(email).trim().toLowerCase(),
          password,
          name,
          cpf,
          phone,
          address,
          planType,
        }),
      }),
    });
    if (!pending.ok) {
      const err = new Error(
        pending.status === 404
          ? 'Execute pending-checkouts-migration.sql no Supabase.'
          : supaErrorMsg(pending.data)
      );
      err.status = pending.status === 404 ? 503 : pending.status;
      throw err;
    }

    const subscription = await mercadoPagoRequest('/preapproval', {
      method: 'POST',
      idempotencyKey: randomBytes(16).toString('hex'),
      body: {
        reason:             `${planName} - ${annual ? 'anual' : 'mensal'}`,
        external_reference: checkoutId,
        payer_email:        email,
        auto_recurring: {
          frequency:          annual ? 12 : 1,
          frequency_type:     'months',
          transaction_amount: amount,
          currency_id:        'BRL',
        },
        back_url: `${appUrl}/checkout?provider=mercadopago&status=return`,
        status:   'pending',
      },
    });
    createdSubscriptionId = String(subscription.id);

    await proxyFetch(
      `${SUPA_URL}/rest/v1/pending_checkouts?id=eq.${encodeURIComponent(checkoutId)}`,
      {
        method: 'PATCH',
        headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          subscription_id: createdSubscriptionId,
          status: subscription.status || 'pending',
          updated_at: new Date().toISOString(),
        }),
      }
    );

    res.json({
      initPoint:       subscription.init_point,
      subscriptionId: String(subscription.id),
      planName,
    });
  } catch (err) {
    if (createdSubscriptionId) {
      await mercadoPagoRequest(`/preapproval/${encodeURIComponent(createdSubscriptionId)}`, {
        method: 'PUT',
        body: { status: 'canceled' },
      }).catch(() => {});
    }
    if (checkoutId) {
      await proxyFetch(`${SUPA_URL}/rest/v1/pending_checkouts?id=eq.${encodeURIComponent(checkoutId)}`, {
        method: 'DELETE',
        headers: serviceHeaders(),
      }).catch(() => {});
    }
    next(err);
  }
});

// O retorno do checkout consulta o provedor; a query string nunca ativa o plano.
app.get('/api/billing/mercadopago/status', billingLimiter, async (req, res, next) => {
  try {
    const id = String(req.query.subscriptionId || '');
    if (!id || id.length > 100) return res.status(400).json({ message: 'Assinatura inválida.' });
    const subscription = await mercadoPagoRequest(`/preapproval/${encodeURIComponent(id)}`);
    const sync = await syncMercadoPagoSubscription(subscription);
    res.json({
      status: subscription.status,
      authorized: subscription.status === 'authorized',
      accountReady: Boolean(sync?.accountReady),
    });
  } catch (err) { next(err); }
});

app.post('/api/billing/mercadopago/webhook', async (req, res, next) => {
  try {
    const dataId = req.body?.data?.id || req.query['data.id'];
    if (!mercadoPagoSignatureIsValid(req, dataId)) {
      return res.status(401).json({ message: 'Assinatura do webhook inválida.' });
    }
    if (req.body?.type !== 'subscription_preapproval') {
      return res.json({ received: true, ignored: true });
    }

    const subscription = await mercadoPagoRequest(`/preapproval/${encodeURIComponent(dataId)}`);
    await syncMercadoPagoSubscription(subscription);
    res.json({ received: true });
  } catch (err) { next(err); }
});

app.post('/api/billing/mercadopago/cancel', requireAuth, async (req, res, next) => {
  try {
    const user = await proxyFetch(`${SUPA_URL}/auth/v1/user`, { headers: supaHeaders(req.authToken) });
    const id = user.data?.user_metadata?.mp_subscription_id;
    if (!user.ok || !id) {
      return res.status(400).json({ message: 'Nenhuma assinatura do Mercado Pago encontrada.' });
    }

    const subscription = await mercadoPagoRequest(`/preapproval/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: { status: 'canceled' },
    });
    await syncMercadoPagoSubscription(subscription);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Market Stocks (Yahoo Finance proxy) ──────────────────────────────────────

let _stocksCache    = null;
let _stocksAt       = 0;
let _stocksInflight = null; // deduplicação: evita N chamadas simultâneas na expiração do cache
const STOCKS_TTL    = 15 * 60 * 1000; // 15 min

const STOCK_NAMES = {
  'PETR4': 'Petrobras PN',
  'VALE3': 'Vale ON',
  'ITUB4': 'Itaú PN',
  'ABEV3': 'Ambev ON',
  'BBDC4': 'Bradesco PN',
  '^BVSP': 'IBOVESPA',
};

app.get('/api/market-stocks', async (req, res, next) => {
  try {
    const now = Date.now();
    if (_stocksCache && now - _stocksAt < STOCKS_TTL) return res.json(_stocksCache);

    // Deduplicação: se já há uma busca em andamento, aguarda o mesmo Promise
    if (_stocksInflight) return res.json(await _stocksInflight);

    const TICKERS    = ['^BVSP', 'PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'ABEV3.SA', 'BBDC4.SA'];
    const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };

    const fetchChart = async (symbol) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const { ok, data } = await proxyFetch(url, { headers: YF_HEADERS });
      if (!ok) return null;
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return null;
      const price  = meta.regularMarketPrice;
      const prev   = meta.chartPreviousClose ?? null;
      const change = prev != null ? +(price - prev).toFixed(2) : null;
      const pct    = prev != null ? +((change / prev) * 100).toFixed(2) : null;
      return {
        symbol:    symbol.replace('.SA', ''),
        shortName: meta.shortName || meta.longName || '',
        price, prev, change, pct,
        high:   meta.regularMarketDayHigh   ?? null,
        low:    meta.regularMarketDayLow    ?? null,
        volume: meta.regularMarketVolume    ?? null,
      };
    };

    _stocksInflight = Promise.all(TICKERS.map(t => fetchChart(t).catch(() => null)))
      .then(results => {
        const rawResults = results.filter(Boolean);
        if (rawResults.length) {
          _stocksCache = rawResults.map(q => ({
            symbol: q.symbol,
            name:   STOCK_NAMES[q.symbol] || q.shortName || q.symbol,
            price:  q.price,
            change: q.change,
            pct:    q.pct,
            prev:   q.prev,
            high:   q.high,
            low:    q.low,
            volume: q.volume,
          }));
          _stocksAt = Date.now();
        }
        return _stocksCache;
      })
      .finally(() => { _stocksInflight = null; });

    const data = await _stocksInflight;
    if (!data?.length) return res.status(502).json({ message: 'Mercado indisponível.' });
    res.json(data);
  } catch (err) { next(err); }
});

// ── Market Rates (BCB proxy) ──────────────────────────────────────────────────

let _ratesCache    = null;
let _ratesAt       = 0;
let _ratesInflight = null; // deduplicação para taxa BCB
const RATES_TTL    = 4 * 60 * 60 * 1000; // 4 h

app.get('/api/market-rates', async (req, res, next) => {
  try {
    const now = Date.now();
    if (_ratesCache && now - _ratesAt < RATES_TTL) return res.json(_ratesCache);

    if (_ratesInflight) return res.json(await _ratesInflight);

    const bcb = s => proxyFetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s}/dados/ultimos/1?formato=json`,
      { headers: { Accept: 'application/json' } }
    );

    _ratesInflight = Promise.all([
      bcb(4390),  // Meta SELIC % a.a.
      bcb(4391),  // CDI anualizado base 252 % a.a.
      bcb(13522), // IPCA acumulado 12 meses %
    ]).then(([selicR, cdiR, ipcaR]) => {
      const parseVal  = r => parseFloat((r.data?.[0]?.valor || '0').replace(',', '.'));
      const dateOf    = r => r.data?.[0]?.data || '';
      const annualize = m => +((Math.pow(1 + m / 100, 12) - 1) * 100).toFixed(2);
      _ratesCache = {
        selic: { value: annualize(parseVal(selicR)), date: dateOf(selicR), unit: '% a.a.' },
        cdi:   { value: annualize(parseVal(cdiR)),   date: dateOf(cdiR),   unit: '% a.a.' },
        ipca:  { value: parseVal(ipcaR),             date: dateOf(ipcaR),  unit: '% 12m'  },
      };
      _ratesAt = Date.now();
      return _ratesCache;
    }).finally(() => { _ratesInflight = null; });

    res.json(await _ratesInflight);
  } catch (err) { next(err); }
});

// ── AI ────────────────────────────────────────────────────────────────────────

app.post('/api/ai/chat', aiLimiter, requireAuth, validate(schemas.aiChat), async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body:    JSON.stringify(req.body),
      },
      { timeout: 30_000, retries: 2 }
    );

    if (!ok) return res.status(status).json({ message: data?.error?.message || 'Erro na IA.' });
    res.status(200).json(data);
  } catch (err) { next(err); }
});

// ── Notifications (Email) ─────────────────────────────────────────────────────
const notifLimiter = makeRateLimiter(60_000, 5, 'Muitas notificações. Tente em 1 minuto.');

function onboardingEmailHtml(name) {
  const appUrl  = (process.env.APP_URL || 'https://atlasfinance.page').replace(/\/+$/, '');
  const display = name || 'por aí';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0c12;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c12;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#0f1118;border:1px solid rgba(99,102,241,.25);border-radius:20px;overflow:hidden">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:36px 32px;text-align:center">
            <div style="font-size:2rem;margin-bottom:8px">💎</div>
            <div style="font-size:1.5rem;font-weight:800;color:#fff;letter-spacing:-.5px">Atlas Finance</div>
            <div style="font-size:.85rem;color:#a5b4fc;margin-top:4px">Sua vida financeira, organizada.</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="font-size:1.1rem;font-weight:700;color:#f1f5f9;margin:0 0 8px">Olá, ${display}! 👋</p>
            <p style="font-size:.92rem;color:#94a3b8;line-height:1.7;margin:0 0 28px">
              Sua conta no Atlas foi criada com sucesso. Estamos felizes em ter você aqui.
              Veja por onde começar:
            </p>

            <!-- Steps -->
            ${[
              ['📥', 'Adicione sua primeira transação', 'Registre uma receita ou despesa e veja o dashboard ganhar vida.'],
              ['🗂️', 'Organize por categorias', 'Crie categorias personalizadas e entenda para onde seu dinheiro vai.'],
              ['📊', 'Acompanhe seu saldo', 'O resumo mensal mostra entradas, saídas e saldo de forma visual.'],
              ['🤖', 'Converse com a IA', 'Pergunte à IA insights sobre seus gastos — disponível no plano Pro.'],
            ].map(([icon, title, desc]) => `
            <table width="100%" style="margin-bottom:14px">
              <tr>
                <td width="44" valign="top" style="padding-top:2px">
                  <div style="width:36px;height:36px;border-radius:10px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.22);text-align:center;line-height:36px;font-size:1.1rem">${icon}</div>
                </td>
                <td style="padding-left:12px">
                  <div style="font-size:.9rem;font-weight:700;color:#e2e8f0">${title}</div>
                  <div style="font-size:.82rem;color:#64748b;margin-top:2px">${desc}</div>
                </td>
              </tr>
            </table>`).join('')}

            <!-- CTA -->
            <div style="text-align:center;margin-top:28px">
              <a href="${appUrl}/app" style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;font-weight:700;font-size:.95rem;text-decoration:none;border-radius:12px;box-shadow:0 4px 18px rgba(99,102,241,.4)">
                Abrir o Atlas →
              </a>
            </div>

            <p style="font-size:.8rem;color:#475569;text-align:center;margin:28px 0 0;line-height:1.6">
              Dúvidas? Responda este email que a gente ajuda.<br>
              — Equipe Atlas Finance
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,.06);text-align:center">
            <p style="font-size:.73rem;color:#334155;margin:0">
              Você recebeu este email porque criou uma conta em
              <a href="${appUrl}" style="color:#6366f1;text-decoration:none">atlasfinance.page</a>.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail({ to, subject, html }) {
  if (!_mailer) return { ok: false, reason: 'Email não configurado. Adicione SMTP_HOST, SMTP_USER e SMTP_PASS no .env.' };
  try {
    await _mailer.sendMail({ from: SMTP_FROM, to, subject, html });
    return { ok: true };
  } catch (err) {
    log.error({ err }, 'Erro ao enviar email');
    return { ok: false, reason: err.message };
  }
}

// Alerta de orçamento — dispara quando usuário atinge >= 80% de uma categoria
app.post('/api/notify/budget-alert', notifLimiter, requireAuth, async (req, res, next) => {
  try {
    const { category, spent, limit, pct } = req.body || {};
    if (!category || !spent || !limit) return res.status(400).json({ message: 'Parâmetros inválidos.' });

    const fmtBRL = v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const subject = `⚠️ Alerta Atlas: ${pct}% do orçamento de ${category} usado`;
    const html = `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f0e17;color:#f1f5f9;border-radius:16px">
        <div style="font-size:1.6rem;font-weight:800;color:#7c3aed;margin-bottom:4px">💎 Atlas</div>
        <div style="color:#94a3b8;font-size:.85rem;margin-bottom:24px">Alerta de Orçamento</div>
        <div style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:20px;margin-bottom:20px">
          <div style="font-size:1.1rem;font-weight:700;color:#f59e0b;margin-bottom:8px">⚠️ ${pct}% do orçamento de ${category} consumido</div>
          <div style="color:#94a3b8;font-size:.9rem">
            Você gastou <strong style="color:#f1f5f9">${fmtBRL(spent)}</strong> de um limite de <strong style="color:#f1f5f9">${fmtBRL(limit)}</strong> em <strong style="color:#f1f5f9">${category}</strong> neste mês.
          </div>
        </div>
        <div style="color:#94a3b8;font-size:.85rem;margin-bottom:24px">
          Ainda restam <strong style="color:#f1f5f9">${fmtBRL(limit - spent)}</strong> no orçamento. Monitore seus gastos para não ultrapassar o limite.
        </div>
        <a href="${process.env.APP_URL || 'https://atlasfinance.page'}/app?tab=dashboard"
           style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 22px;border-radius:10px;font-weight:600;font-size:.9rem">
          Ver meus gastos →
        </a>
        <div style="margin-top:32px;color:#4a5568;font-size:.75rem;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">
          Você recebeu este email porque configurou alertas de orçamento no Atlas.
        </div>
      </div>`;

    const result = await sendEmail({ to: req.userEmail, subject, html });
    if (!result.ok) return res.status(503).json({ message: result.reason });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Resumo mensal — enviado manualmente pelo usuário ou por cron externo
app.post('/api/notify/monthly-summary', notifLimiter, requireAuth, async (req, res, next) => {
  try {
    const { month, income, expense, balance, score, score_label, top_category } = req.body || {};
    if (!month) return res.status(400).json({ message: 'Parâmetro month obrigatório.' });

    const fmtBRL  = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const positive = (balance || 0) >= 0;
    const scoreColor = (score || 0) >= 75 ? '#10b981' : (score || 0) >= 50 ? '#f59e0b' : '#ef4444';
    const subject = `📊 Resumo Atlas — ${month}`;

    const html = `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f0e17;color:#f1f5f9;border-radius:16px">
        <div style="font-size:1.6rem;font-weight:800;color:#7c3aed;margin-bottom:4px">💎 Atlas</div>
        <div style="color:#94a3b8;font-size:.85rem;margin-bottom:24px">Resumo Mensal</div>
        <div style="font-size:1.3rem;font-weight:700;margin-bottom:20px">Seu mês de <strong style="color:#7c3aed">${month}</strong></div>
        <div style="display:grid;gap:12px;margin-bottom:20px">
          <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px 18px">
            <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Saldo</div>
            <div style="font-size:1.4rem;font-weight:800;color:${positive ? '#10b981' : '#ef4444'}">${positive ? '+' : ''}${fmtBRL(balance)}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div style="background:rgba(16,185,129,.08);border-radius:10px;padding:14px 18px">
              <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Receitas</div>
              <div style="font-size:1.1rem;font-weight:700;color:#10b981">${fmtBRL(income)}</div>
            </div>
            <div style="background:rgba(239,68,68,.08);border-radius:10px;padding:14px 18px">
              <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Despesas</div>
              <div style="font-size:1.1rem;font-weight:700;color:#ef4444">${fmtBRL(expense)}</div>
            </div>
          </div>
          ${score != null ? `
          <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:14px">
            <div style="font-size:2rem;font-weight:800;color:${scoreColor}">${score}</div>
            <div>
              <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em">Score Financeiro</div>
              <div style="font-weight:700;color:${scoreColor}">${score_label || ''}</div>
            </div>
          </div>` : ''}
          ${top_category ? `
          <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px 18px">
            <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Maior gasto</div>
            <div style="font-weight:600">${top_category}</div>
          </div>` : ''}
        </div>
        <a href="${process.env.APP_URL || 'https://atlasfinance.page'}/app?tab=analysis"
           style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 22px;border-radius:10px;font-weight:600;font-size:.9rem">
          Ver análise completa →
        </a>
        <div style="margin-top:32px;color:#4a5568;font-size:.75rem;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">
          Atlas Finance — seus dados, seu controle.
        </div>
      </div>`;

    const result = await sendEmail({ to: req.userEmail, subject, html });
    if (!result.ok) return res.status(503).json({ message: result.reason });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Cron: resumo mensal automático ───────────────────────────────────────────
// Executa todo dia 1 às 08:00 — envia o resumo do mês anterior a todos os usuários.
// Requer: SMTP configurado + SUPABASE_SERVICE_KEY com acesso ao auth admin.

async function sendMonthlySummariesToAllUsers() {
  if (!_mailer || !SUPA_SERVICE) return;

  const now      = new Date();
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year     = prevDate.getFullYear();
  const month    = prevDate.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const lastDay  = new Date(year, month, 0).getDate();
  const since    = `${monthStr}-01`;
  const until    = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  const fmtMonth = prevDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  let users = [];
  try {
    const { ok, data } = await proxyFetch(
      `${SUPA_URL}/auth/v1/admin/users?per_page=1000`,
      { headers: { 'apikey': SUPA_SERVICE, 'Authorization': `Bearer ${SUPA_SERVICE}` } }
    );
    users = ok ? (data?.users || []) : [];
  } catch (err) {
    log.error({ err }, 'Cron: falha ao listar usuários');
    return;
  }

  log.info({ month: fmtMonth, users: users.length }, 'Cron: enviando resumo mensal');

  for (const user of users) {
    if (!user.email) continue;
    try {
      const txUrl = `${SUPA_URL}/rest/v1/transactions`
        + `?user_id=eq.${user.id}&date=gte.${since}&date=lte.${until}&select=type,amount&limit=5000`;
      const { ok, data: txs } = await proxyFetch(txUrl, {
        headers: { 'apikey': SUPA_SERVICE, 'Authorization': `Bearer ${SUPA_SERVICE}` },
      });
      if (!ok || !Array.isArray(txs) || !txs.length) continue;

      const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + parseFloat(t.amount), 0);
      const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + parseFloat(t.amount), 0);
      const balance = income - expense;

      const fmtBRL  = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const positive = balance >= 0;
      const subject  = `📊 Resumo Atlas — ${fmtMonth}`;
      const html = `
        <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f0e17;color:#f1f5f9;border-radius:16px">
          <div style="font-size:1.6rem;font-weight:800;color:#7c3aed;margin-bottom:4px">💎 Atlas</div>
          <div style="color:#94a3b8;font-size:.85rem;margin-bottom:24px">Resumo Mensal Automático</div>
          <div style="font-size:1.3rem;font-weight:700;margin-bottom:20px">Seu mês de <strong style="color:#7c3aed">${fmtMonth}</strong></div>
          <div style="display:grid;gap:12px;margin-bottom:20px">
            <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px 18px">
              <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Saldo</div>
              <div style="font-size:1.4rem;font-weight:800;color:${positive ? '#10b981' : '#ef4444'}">${positive ? '+' : ''}${fmtBRL(balance)}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div style="background:rgba(16,185,129,.08);border-radius:10px;padding:14px 18px">
                <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Receitas</div>
                <div style="font-size:1.1rem;font-weight:700;color:#10b981">${fmtBRL(income)}</div>
              </div>
              <div style="background:rgba(239,68,68,.08);border-radius:10px;padding:14px 18px">
                <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Despesas</div>
                <div style="font-size:1.1rem;font-weight:700;color:#ef4444">${fmtBRL(expense)}</div>
              </div>
            </div>
          </div>
          <a href="${process.env.APP_URL || 'https://atlasfinance.page'}/app?tab=analysis"
             style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 22px;border-radius:10px;font-weight:600;font-size:.9rem">
            Ver análise completa →
          </a>
          <div style="margin-top:32px;color:#4a5568;font-size:.75rem;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">
            Atlas Finance — seus dados, seu controle.
          </div>
        </div>`;

      await sendEmail({ to: user.email, subject, html });
    } catch (err) {
      log.error({ err, email: user.email }, 'Cron: erro ao processar usuário');
    }
  }

  log.info('Cron: resumo mensal concluído');
}

// Todo dia 1 do mês às 08:00 (timezone configurável via TZ env var)
if (process.env.ENABLE_MONTHLY_CRON !== 'false') {
  cron.schedule('0 8 1 * *', sendMonthlySummariesToAllUsers, {
    timezone: process.env.TZ || 'America/Sao_Paulo',
  });
}

// Remove cadastros abandonados sem criar usuários no Auth.
cron.schedule('17 * * * *', async () => {
  try {
    await proxyFetch(`${SUPA_URL}/rest/v1/rpc/cleanup_pending_checkouts`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: '{}',
    });
  } catch (err) {
    log.warn({ err }, 'Cron: falha ao limpar checkouts pendentes');
  }
}, { timezone: process.env.TZ || 'America/Sao_Paulo' });

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  log.info({ signal }, 'Servidor encerrando graciosamente');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Error handler global ──────────────────────────────────────────────────────
// Centraliza todos os erros não tratados — CORS, proxy, runtime.

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status  = err.status || 500;
  const message = err.status ? err.message : 'Erro interno do servidor.';
  if (!err.status) {
    log.error({ err }, 'Erro interno não tratado');
    if (process.env.SENTRY_DSN) Sentry.captureException(err);
  }
  res.status(status).json({ message });
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () =>
    log.info({ port: PORT, env: IS_PROD ? 'prod' : 'dev' }, 'Atlas Finance iniciado')
  );
}

module.exports = app;
