'use strict';

// =============================================
//  LOCAL DATABASE — IndexedDB (cache offline)
// =============================================
const DB = {
  _db: null,
  DB_NAME:    'atlasfinance',
  DB_VERSION: 1,
  STORE:      'transactions',

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      req.onupgradeneeded = ({ target: { result: db } }) => {
        if (!db.objectStoreNames.contains(this.STORE)) {
          const store = db.createObjectStore(this.STORE, { keyPath: 'id' });
          store.createIndex('date',     'date',     { unique: false });
          store.createIndex('type',     'type',     { unique: false });
          store.createIndex('category', 'category', { unique: false });
        }
      };

      req.onsuccess = ({ target: { result } }) => { this._db = result; resolve(); };
      req.onerror   = ({ target: { error } })  => reject(error);
    });
  },

  getAll() {
    return new Promise((resolve, reject) => {
      const req = this._db
        .transaction(this.STORE, 'readonly')
        .objectStore(this.STORE)
        .getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = ({ target: { error } }) => reject(error);
    });
  },

  put(record) {
    return new Promise((resolve, reject) => {
      const req = this._db
        .transaction(this.STORE, 'readwrite')
        .objectStore(this.STORE)
        .put(record);
      req.onsuccess = () => resolve();
      req.onerror   = ({ target: { error } }) => reject(error);
    });
  },

  remove(id) {
    return new Promise((resolve, reject) => {
      const req = this._db
        .transaction(this.STORE, 'readwrite')
        .objectStore(this.STORE)
        .delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = ({ target: { error } }) => reject(error);
    });
  },
};

// =============================================
//  BACKEND HTTP CLIENT
// =============================================
const API = {
  _token: () => localStorage.getItem('financeai_auth_token') || '',

  _headers() {
    const h     = { 'Content-Type': 'application/json' };
    const token = this._token();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },

  async req(method, path, body) {
    const opts = { method, headers: this._headers() };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res  = await fetch(path, opts);
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const raw = (data && (data.error_description || data.msg || data.message || data.error)) ||
        `HTTP ${res.status}`;
      throw new Error(raw);
    }
    return data;
  },
};

// =============================================
//  CLOUD TRANSACTIONS (via backend proxy)
// =============================================
const CloudDB = {
  async getAll() {
    const rows = await API.req('GET', '/api/transactions');
    return (Array.isArray(rows) ? rows : [])
      .map(r => ({ ...r, amount: parseFloat(r.amount) }));
  },

  async add(tx) {
    return API.req('POST', '/api/transactions', tx);
  },

  async remove(id) {
    return API.req('DELETE', `/api/transactions/${id}`);
  },
};

// =============================================
//  AUTH (via backend proxy)
// =============================================
const Auth = {
  get token()      { return localStorage.getItem('financeai_auth_token')  || ''; },
  get email()      { return localStorage.getItem('financeai_auth_email')  || ''; },
  get userId()     { return localStorage.getItem('financeai_auth_uid')    || ''; },
  get expiry()     { return parseInt(localStorage.getItem('financeai_auth_expiry') || '0', 10); },
  get isLoggedIn() { return !!(this.token && Date.now() < this.expiry); },

  _save(data) {
    localStorage.setItem('financeai_auth_token',  data.access_token);
    localStorage.setItem('financeai_auth_email',  data.user?.email || '');
    localStorage.setItem('financeai_auth_uid',    data.user?.id    || '');
    localStorage.setItem('financeai_auth_expiry',
      String(Date.now() + (data.expires_in || 3600) * 1000));
  },

  async signIn(email, password) {
    const data = await API.req('POST', '/api/auth/signin', { email, password });
    this._save(data);
  },

  async signUp(email, password) {
    return API.req('POST', '/api/auth/signup', { email, password });
  },

  signOut() {
    ['financeai_auth_token', 'financeai_auth_email',
     'financeai_auth_uid',   'financeai_auth_expiry']
      .forEach(k => localStorage.removeItem(k));
  },
};

// =============================================
//  GROQ AI (via backend proxy)
// =============================================
const GroqAPI = {
  async complete(messages, { maxTokens = 1000, temperature = 0.7 } = {}) {
    const data = await API.req('POST', '/api/ai/chat', {
      model:       'llama-3.3-70b-versatile',
      max_tokens:  maxTokens,
      temperature,
      messages,
    });
    if (data?.error) throw new Error(data.error.message || 'Erro na IA');
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  },
};

// =============================================
//  DEMO MODE
// =============================================
const Demo = {
  KEY: 'financeai_demo',

  get active() { return localStorage.getItem(this.KEY) === '1'; },
  enter()      { localStorage.setItem(this.KEY, '1'); },
  exit()       { localStorage.removeItem(this.KEY); },

  _date(monthOffset, day) {
    const now   = new Date();
    const month = now.getMonth() + monthOffset;
    const year  = now.getFullYear() + Math.floor(month / 12);
    const m     = ((month % 12) + 12) % 12;
    return `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  },

  transactions() {
    const c = 0, p = -1;
    return [
      { id: 'demo_01', type: 'receita', amount: 4500.00, description: 'Salário',          category: 'outros',      notes: 'Salário mensal', date: this._date(c, 5)  },
      { id: 'demo_02', type: 'despesa', amount: 1200.00, description: 'Aluguel',           category: 'moradia',     notes: '',               date: this._date(c, 5)  },
      { id: 'demo_03', type: 'despesa', amount: 189.90,  description: 'Supermercado',      category: 'alimentacao', notes: '',               date: this._date(c, 7)  },
      { id: 'demo_04', type: 'despesa', amount: 39.90,   description: 'Netflix',           category: 'lazer',       notes: 'Assinatura',     date: this._date(c, 8)  },
      { id: 'demo_05', type: 'despesa', amount: 21.90,   description: 'Spotify',           category: 'lazer',       notes: 'Assinatura',     date: this._date(c, 8)  },
      { id: 'demo_06', type: 'despesa', amount: 180.00,  description: 'Combustível',       category: 'transporte',  notes: '',               date: this._date(c, 10) },
      { id: 'demo_07', type: 'receita', amount: 800.00,  description: 'Freelance',         category: 'outros',      notes: 'Projeto web',    date: this._date(c, 12) },
      { id: 'demo_08', type: 'despesa', amount: 89.90,   description: 'Academia',          category: 'saude',       notes: 'Mensalidade',    date: this._date(c, 12) },
      { id: 'demo_09', type: 'despesa', amount: 78.50,   description: 'Restaurante',       category: 'alimentacao', notes: 'Jantar',         date: this._date(c, 14) },
      { id: 'demo_10', type: 'despesa', amount: 99.90,   description: 'Internet',          category: 'contas',      notes: '',               date: this._date(c, 15) },
      { id: 'demo_11', type: 'despesa', amount: 145.20,  description: 'Energia elétrica',  category: 'contas',      notes: '',               date: this._date(c, 15) },
      { id: 'demo_12', type: 'despesa', amount: 62.30,   description: 'Farmácia',          category: 'saude',       notes: 'Remédios',       date: this._date(c, 18) },
      { id: 'demo_13', type: 'receita', amount: 4500.00, description: 'Salário',           category: 'outros',      notes: 'Salário mensal', date: this._date(p, 5)  },
      { id: 'demo_14', type: 'despesa', amount: 1200.00, description: 'Aluguel',           category: 'moradia',     notes: '',               date: this._date(p, 5)  },
      { id: 'demo_15', type: 'despesa', amount: 235.60,  description: 'Supermercado',      category: 'alimentacao', notes: '',               date: this._date(p, 8)  },
      { id: 'demo_16', type: 'despesa', amount: 320.00,  description: 'Roupas',            category: 'vestuario',   notes: 'Compras',        date: this._date(p, 12) },
      { id: 'demo_17', type: 'despesa', amount: 150.00,  description: 'Consulta médica',   category: 'saude',       notes: '',               date: this._date(p, 15) },
      { id: 'demo_18', type: 'receita', amount: 500.00,  description: 'Venda de itens',    category: 'outros',      notes: 'Itens usados',   date: this._date(p, 18) },
      { id: 'demo_19', type: 'despesa', amount: 89.90,   description: 'Academia',          category: 'saude',       notes: 'Mensalidade',    date: this._date(p, 5)  },
      { id: 'demo_20', type: 'despesa', amount: 180.00,  description: 'Combustível',       category: 'transporte',  notes: '',               date: this._date(p, 20) },
      { id: 'demo_21', type: 'despesa', amount: 45.00,   description: 'Livros / cursos',   category: 'educacao',    notes: '',               date: this._date(p, 22) },
      { id: 'demo_22', type: 'despesa', amount: 220.00,  description: 'Tênis novo',        category: 'vestuario',   notes: 'Desconto 20%',   date: this._date(p, 25) },
    ];
  },
};
