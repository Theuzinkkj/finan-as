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
