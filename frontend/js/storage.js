// Centraliza todas as chaves e acessos ao localStorage.
// Deve ser carregado antes de qualquer outro script da aplicação.
const Storage = {
  // ── Chaves estáticas ─────────────────────────────────────────────
  THEME:         'financeai_theme',
  AUTH_EMAIL:    'financeai_display_email',
  AUTH_UID:      'financeai_display_uid',
  DEMO:          'financeai_demo',
  CSV_IMPORTED:  'atlas_csv_imported',
  PWA_DISMISSED: 'atlas_pwa_dismissed',
  VISITS:        'atlas_visits',
LEGACY_TXS:    'financeai_txs',
  PF_DEMO:       'atlas_pf_demo',
  GOAL_DEMO:     'atlas_goal_demo',

  // ── Chaves por usuário ───────────────────────────────────────────
  _uid()           { return localStorage.getItem(this.AUTH_UID) || 'anon'; },
  catsKey()        { return `atlas_custom_cats_${this._uid()}`; },
  benefitKey()     { return `atlas_benefits_${this._uid()}`; },
  benefitOpenKey() { return `atlas_benefits_open_${this._uid()}`; },
  budgetOpenKey()  { return `atlas_budget_open_${this._uid()}`; },
  budgetAlertKey() { return `atlas_budget_alerted_${this._uid()}`; },
  profileKey()     { return `atlas_profile_${this._uid()}`; },
  openingBalanceKey(monthKey) { return `atlas_opening_balance_${this._uid()}_${monthKey}`; },
  scoreHistKey()   { return `atlas_score_history_${this._uid()}`; },
  tourKey()        { return `atlas_tour_done_${this._uid()}`; },
  achievKey()      { return `atlas_achievements_${this._uid()}`; },

  // ── String pura ──────────────────────────────────────────────────
  get(key, def = null) { const v = localStorage.getItem(key); return v !== null ? v : def; },
  set(key, val)        { localStorage.setItem(key, String(val)); },

  // ── JSON ─────────────────────────────────────────────────────────
  getJSON(key, def = null) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; }
    catch { return def; }
  },
  setJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); },

  // ── Flag ('1') ───────────────────────────────────────────────────
  flag(key)    { return localStorage.getItem(key) === '1'; },
  setFlag(key) { localStorage.setItem(key, '1'); },

  // ── Remoção ──────────────────────────────────────────────────────
  remove(key) { localStorage.removeItem(key); },
  clear()     { localStorage.clear(); },
};
