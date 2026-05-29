'use strict';

// =============================================
//  LOCAL DATABASE — IndexedDB (cache offline)
// =============================================
const DB = {
  _db: null,
  get DB_NAME() { return `atlasfinance_${Auth.userId || 'anon'}`; },
  DB_VERSION: 2,
  STORE:      'transactions',
  PENDING:    'pending_queue',

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
        // v2: fila de operações pendentes (sync offline → cloud)
        if (!db.objectStoreNames.contains(this.PENDING)) {
          db.createObjectStore(this.PENDING, { keyPath: 'qid', autoIncrement: true });
        }
      };

      req.onsuccess = ({ target: { result } }) => { this._db = result; resolve(); };
      req.onerror   = ({ target: { error } })  => reject(error);
    });
  },

  _op(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const req = fn(this._db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror   = ({ target: { error } }) => reject(error);
    });
  },

  getAll()    { return this._op(this.STORE, 'readonly',  s => s.getAll()); },
  put(record) { return this._op(this.STORE, 'readwrite', s => s.put(record)); },
  remove(id)  { return this._op(this.STORE, 'readwrite', s => s.delete(id)); },

  purgeOld() {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const cutoffStr = cutoff.toISOString().slice(0, 10); // 'YYYY-MM-DD'

    return new Promise((resolve, reject) => {
      const tx    = this._db.transaction(this.STORE, 'readwrite');
      const store = tx.objectStore(this.STORE);
      const index = store.index('date');
      // IDBKeyRange: tudo com date < cutoffStr
      const range = IDBKeyRange.upperBound(cutoffStr, true);
      const req   = index.openCursor(range);

      let count = 0;
      req.onsuccess = ({ target: { result: cursor } }) => {
        if (!cursor) { resolve(count); return; }
        cursor.delete();
        count++;
        cursor.continue();
      };
      req.onerror = ({ target: { error } }) => reject(error);
    });
  },
};

// =============================================
//  PENDING QUEUE — fila de sync offline
// =============================================
const PendingQueue = {
  push(op)   { return DB._op(DB.PENDING, 'readwrite', s => s.add(op)); },
  getAll()   { return DB._op(DB.PENDING, 'readonly',  s => s.getAll()); },
  _del(qid)  { return DB._op(DB.PENDING, 'readwrite', s => s.delete(qid)); },
  count()    { return DB._op(DB.PENDING, 'readonly',  s => s.count()); },

  // Tenta enviar todos os pendentes. Para se ficar offline; pula itens com erros online.
  async flush() {
    const items = await this.getAll();
    let synced = 0;
    for (const item of items) {
      try {
        if      (item.type === 'add')    await CloudDB._addDirect(item.payload);
        else if (item.type === 'remove') await CloudDB._removeDirect(item.payload);
        else if (item.type === 'update') await CloudDB._updateDirect(item.payload);
        await this._del(item.qid);
        synced++;
      } catch {
        if (!navigator.onLine) break; // Sem internet: para e tenta depois
        // Erro online: pula este item e continua os demais
      }
    }
    return synced;
  },
};

// =============================================
//  BACKEND HTTP CLIENT
// =============================================
const API = {
  async req(method, path, body) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 20_000);

    const opts = {
      method,
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal:      controller.signal,
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    let res, text, data;
    try {
      res  = await fetch(path, opts);
      text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch (err) {
      clearTimeout(tid);
      if (err.name === 'AbortError') throw new Error('Tempo limite excedido. Verifique sua conexão.');
      throw err;
    }
    clearTimeout(tid);

    if (!res.ok) {
      const raw = (data && (data.error_description || data.message || data.error)) ||
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
  // Carrega com filtros opcionais: month=YYYY-MM, since=YYYY-MM-DD, limit, offset
  async getAll({ month, since, limit = 1000, offset = 0 } = {}) {
    let path = `/api/transactions?limit=${limit}&offset=${offset}`;
    if (month) path += `&month=${encodeURIComponent(month)}`;
    else if (since) path += `&since=${encodeURIComponent(since)}`;
    const rows = await API.req('GET', path);
    return (Array.isArray(rows) ? rows : [])
      .map(r => ({ ...r, amount: parseFloat(r.amount) }));
  },

  // Chamadas diretas ao servidor (usadas pelo PendingQueue.flush)
  async _addDirect(tx) {
    const { user_id: _d, ...payload } = tx;
    return API.req('POST', '/api/transactions', payload);
  },
  async _removeDirect(id) {
    return API.req('DELETE', `/api/transactions/${id}`);
  },
  async _updateDirect(tx) {
    const { id, user_id: _d, ...payload } = tx;
    return API.req('PATCH', `/api/transactions/${id}`, payload);
  },

  // Métodos públicos: tentam cloud; sempre enfileiram para sync em caso de falha
  async add(tx) {
    try {
      return await this._addDirect(tx);
    } catch {
      // Enfileira independente do estado de conexão para garantir que a
      // transação não seja perdida quando o syncFromCloud limpar o cache local
      await PendingQueue.push({ type: 'add', payload: tx });
      return { queued: true };
    }
  },

  async remove(id) {
    try {
      return await this._removeDirect(id);
    } catch {
      await PendingQueue.push({ type: 'remove', payload: id });
      return { queued: true };
    }
  },

  async update(tx) {
    try {
      return await this._updateDirect(tx);
    } catch {
      await PendingQueue.push({ type: 'update', payload: tx });
      return { queued: true };
    }
  },
};

// =============================================
//  AUTH (via backend proxy — cookie httpOnly)
// =============================================
// O JWT fica num cookie httpOnly: o JS nunca lê o token.
// Apenas email/id de display são guardados (não são segredos).
const Auth = {
  get email()  { return Storage.get(Storage.AUTH_EMAIL, ''); },
  get userId() { return Storage.get(Storage.AUTH_UID,   ''); },

  _saveDisplay(email, id) {
    Storage.set(Storage.AUTH_EMAIL, email || '');
    Storage.set(Storage.AUTH_UID,   id    || '');
  },

  _clearDisplay() {
    Storage.remove(Storage.AUTH_EMAIL);
    Storage.remove(Storage.AUTH_UID);
  },

  // Verifica sessão no backend — retorna true se autenticado.
  async check() {
    try {
      const data = await API.req('GET', '/api/auth/me');
      this._saveDisplay(data.email, data.id);
      return true;
    } catch {
      this._clearDisplay();
      return false;
    }
  },

  async signIn(email, password) {
    await API.req('POST', '/api/auth/signin', { email, password });
    await this.check();
    if (!this.email) this._saveDisplay(email, this.userId);
  },

  async signUp(email, password) {
    return API.req('POST', '/api/auth/signup', { email, password });
  },

  async signOut() {
    await API.req('POST', '/api/auth/signout', {}).catch(() => {});
    this._clearDisplay();
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
  get active() { return Storage.flag(Storage.DEMO); },
  enter()      { Storage.setFlag(Storage.DEMO); },
  exit()       { Storage.remove(Storage.DEMO); },

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
      { id: 'demo_16', type: 'despesa', amount: 320.00,  description: 'Roupas',            category: 'compras',   notes: 'Compras',        date: this._date(p, 12) },
      { id: 'demo_17', type: 'despesa', amount: 150.00,  description: 'Consulta médica',   category: 'saude',       notes: '',               date: this._date(p, 15) },
      { id: 'demo_18', type: 'receita', amount: 500.00,  description: 'Venda de itens',    category: 'outros',      notes: 'Itens usados',   date: this._date(p, 18) },
      { id: 'demo_19', type: 'despesa', amount: 89.90,   description: 'Academia',          category: 'saude',       notes: 'Mensalidade',    date: this._date(p, 5)  },
      { id: 'demo_20', type: 'despesa', amount: 180.00,  description: 'Combustível',       category: 'transporte',  notes: '',               date: this._date(p, 20) },
      { id: 'demo_21', type: 'despesa', amount: 45.00,   description: 'Livros / cursos',   category: 'educacao',    notes: '',               date: this._date(p, 22) },
      { id: 'demo_22', type: 'despesa', amount: 220.00,  description: 'Tênis novo',        category: 'compras',   notes: 'Desconto 20%',   date: this._date(p, 25) },
    ];
  },
};
