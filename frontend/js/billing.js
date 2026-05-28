'use strict';

// ── billing.js — Paywall & Upgrade System ─────────────────────────────────────
// Intercepta features Pro antes dos handlers existentes usando capture events
// e override da função global switchTab.
// NÃO modificar index.html (bundled) — tudo é injetado via DOM aqui.

(function () {

  // ── Features que exigem Pro ──────────────────────────────────────────────────

  // Abas bloqueadas para free
  const PRO_TABS = new Set(['investments', 'analysis']);

  // Botões bloqueados para free (IDs do DOM)
  const PRO_BTN_IDS = new Set([
    'btn-chat', 'btn-chat-inline',       // IA assistente
    'btn-export-excel', 'btn-export-pdf', // Exportações
    'btn-budget-toggle', 'btn-budget-setup', 'btn-budget-setup-dash', // Orçamentos
  ]);

  // Info exibida no modal por feature
  const FEATURE_INFO = {
    investments:              { name: 'Investimentos',          desc: 'Acompanhe carteira, rentabilidade e cotações de ações em tempo real.' },
    analysis:                 { name: 'Análise IA',             desc: 'Obtenha análises inteligentes dos seus gastos, padrões financeiros e projeções personalizadas com IA.' },
    'btn-chat':               { name: 'IA Assistente',          desc: 'Obtenha insights financeiros personalizados com inteligência artificial.' },
    'btn-chat-inline':        { name: 'IA Assistente',          desc: 'Obtenha insights financeiros personalizados com inteligência artificial.' },
    'btn-export-excel':       { name: 'Exportação Excel / CSV', desc: 'Exporte todas as suas transações para Excel ou CSV.' },
    'btn-export-pdf':         { name: 'Relatório PDF',          desc: 'Gere relatórios financeiros profissionais em PDF.' },
    'btn-budget-toggle':      { name: 'Alertas de Orçamento',   desc: 'Configure limites por categoria e receba alertas quando estiver próximo do limite.' },
    'btn-budget-setup':       { name: 'Alertas de Orçamento',   desc: 'Configure limites por categoria e receba alertas quando estiver próximo do limite.' },
    'btn-budget-setup-dash':  { name: 'Alertas de Orçamento',   desc: 'Configure limites por categoria e receba alertas quando estiver próximo do limite.' },
  };

  // ── isPro ────────────────────────────────────────────────────────────────────

  function isPro() {
    try {
      if (typeof Demo !== 'undefined' && Demo.active) return false;
      if (typeof loadProfile === 'function') return loadProfile().plan === 'pro';
    } catch { /* seguro */ }
    return false;
  }

  // ── Injetar CSS + modal ──────────────────────────────────────────────────────

  function injectUI() {
    if (document.getElementById('upgrade-overlay')) return;

    const style = document.createElement('style');
    style.textContent = `
      #upgrade-overlay {
        position: fixed; inset: 0; z-index: 9500;
        background: rgba(0,0,0,.65);
        backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        opacity: 0; pointer-events: none;
        transition: opacity .2s;
      }
      #upgrade-overlay.upm-visible {
        opacity: 1; pointer-events: all;
      }
      #upgrade-modal {
        background: #0f1118;
        border: 1px solid rgba(99,102,241,.38);
        border-radius: 22px;
        padding: 36px 32px 28px;
        max-width: 420px; width: 100%;
        box-shadow: 0 32px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(99,102,241,.14);
        text-align: center;
        transform: translateY(18px) scale(.96);
        opacity: 0;
        transition: transform .28s cubic-bezier(.34,1.56,.64,1), opacity .22s;
      }
      #upgrade-overlay.upm-visible #upgrade-modal {
        transform: translateY(0) scale(1); opacity: 1;
      }
      .upm-icon {
        width: 62px; height: 62px; border-radius: 50%;
        background: rgba(99,102,241,.14);
        border: 1.5px solid rgba(99,102,241,.32);
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 18px; font-size: 1.75rem; color: #818cf8;
      }
      .upm-badge {
        display: inline-block;
        background: rgba(99,102,241,.12); border: 1px solid rgba(99,102,241,.28);
        border-radius: 20px; padding: 3px 12px;
        font-size: .70rem; font-weight: 700; color: #818cf8;
        letter-spacing: .07em; text-transform: uppercase; margin-bottom: 14px;
      }
      .upm-title {
        font-size: 1.25rem; font-weight: 800; color: #f1f5f9; margin-bottom: 10px;
      }
      .upm-desc {
        font-size: .86rem; color: #94a3b8; line-height: 1.6; margin-bottom: 20px;
      }
      .upm-perks {
        display: flex; flex-wrap: wrap; gap: 7px;
        justify-content: center; margin-bottom: 24px;
      }
      .upm-perk {
        display: flex; align-items: center; gap: 5px;
        background: rgba(16,185,129,.08); border: 1px solid rgba(16,185,129,.20);
        border-radius: 20px; padding: 4px 11px;
        font-size: .74rem; color: #34d399; font-weight: 500;
      }
      .upm-actions { display: flex; flex-direction: column; gap: 9px; }
      .upm-btn-pay {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        padding: 13px; border-radius: 12px;
        background: linear-gradient(135deg, #6366f1, #7c3aed);
        color: #fff; font-family: inherit; font-weight: 700; font-size: .93rem;
        text-decoration: none; border: none; cursor: pointer;
        box-shadow: 0 4px 18px rgba(99,102,241,.35);
        transition: opacity .18s;
      }
      .upm-btn-pay:hover { opacity: .88; }
      .upm-btn-plans {
        display: flex; align-items: center; justify-content: center; gap: 7px;
        padding: 11px; border-radius: 12px;
        background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10);
        color: #94a3b8; font-family: inherit; font-weight: 600; font-size: .88rem;
        text-decoration: none; transition: background .18s, color .18s;
      }
      .upm-btn-plans:hover { background: rgba(255,255,255,.09); color: #f1f5f9; }
      .upm-dismiss {
        background: none; border: none; color: #64748b; padding: 6px;
        font-family: inherit; font-size: .76rem; cursor: pointer;
        transition: color .18s; margin-top: 2px;
      }
      .upm-dismiss:hover { color: #94a3b8; }

      /* Badge Pro no header do app (usuários Pro) */
      .atlas-pro-badge {
        display: inline-flex; align-items: center; gap: 4px;
        background: rgba(99,102,241,.15); border: 1px solid rgba(99,102,241,.30);
        border-radius: 20px; padding: 2px 9px;
        font-size: .68rem; font-weight: 700; color: #818cf8;
        letter-spacing: .05em; text-transform: uppercase;
        cursor: default; user-select: none;
      }
      /* Chip "Pro" nos botões/abas bloqueadas */
      .pro-chip {
        display: inline-flex; align-items: center; gap: 3px;
        background: rgba(99,102,241,.18); border-radius: 10px;
        padding: 1px 7px; font-size: .65rem; font-weight: 700;
        color: #818cf8; margin-left: 5px; vertical-align: middle;
        pointer-events: none;
      }
      @media (max-width: 480px) {
        #upgrade-modal { padding: 28px 20px 22px; }
        .upm-title { font-size: 1.1rem; }
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'upgrade-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div id="upgrade-modal">
        <div class="upm-icon"><i class="bi bi-gem"></i></div>
        <div class="upm-badge" id="upm-badge">Recurso Pro</div>
        <div class="upm-title">Disponível no Atlas Pro</div>
        <p class="upm-desc" id="upm-desc">Faça upgrade para desbloquear este recurso.</p>
        <div class="upm-perks">
          <span class="upm-perk"><i class="bi bi-check-lg"></i>IA ilimitada</span>
          <span class="upm-perk"><i class="bi bi-check-lg"></i>Investimentos</span>
          <span class="upm-perk"><i class="bi bi-check-lg"></i>Exportações</span>
          <span class="upm-perk"><i class="bi bi-check-lg"></i>Alertas</span>
        </div>
        <div class="upm-actions">
          <a href="/checkout" class="upm-btn-pay">
            <i class="bi bi-gem"></i> Assinar Atlas Pro
          </a>
          <a href="/planos" class="upm-btn-plans">
            <i class="bi bi-list-ul"></i> Ver todos os planos
          </a>
          <button class="upm-dismiss" onclick="closeUpgradeModal()">
            Continuar no plano gratuito
          </button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeUpgradeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeUpgradeModal();
    });
    document.body.appendChild(overlay);
  }

  // ── Mostrar / fechar ─────────────────────────────────────────────────────────

  window.showUpgradeModal = function (key) {
    const info = FEATURE_INFO[key] || { name: key, desc: 'Este recurso está disponível no Atlas Pro.' };
    document.getElementById('upm-badge').textContent  = info.name;
    document.getElementById('upm-desc').textContent   = info.desc;
    const overlay = document.getElementById('upgrade-overlay');
    requestAnimationFrame(() => overlay.classList.add('upm-visible'));
  };

  window.closeUpgradeModal = function () {
    document.getElementById('upgrade-overlay')?.classList.remove('upm-visible');
  };

  // ── Override switchTab ───────────────────────────────────────────────────────

  function hookSwitchTab() {
    if (typeof switchTab !== 'function') return;
    const _orig = window.switchTab;
    window.switchTab = function (tabName) {
      if (PRO_TABS.has(tabName) && !isPro()) {
        showUpgradeModal(tabName);
        return;
      }
      _orig.call(this, tabName);
    };
  }

  // ── Interceptar cliques em botões Pro (capture = antes dos handlers) ─────────

  function hookButtons() {
    document.addEventListener('click', function (e) {
      if (isPro()) return;
      const target = e.target.closest('[id]');
      if (!target) return;
      if (PRO_BTN_IDS.has(target.id)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showUpgradeModal(target.id);
      }
    }, true);
  }

  // ── Bloquear atalho de teclado do chat ───────────────────────────────────────

  function hookKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (isPro()) return;
      if (e.key === '/' && !e.target.matches('input,textarea,select,[contenteditable]')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showUpgradeModal('btn-chat');
      }
    }, true);
  }

  // ── Adicionar chips "Pro" nas abas/botões bloqueados ─────────────────────────

  function addProChips() {
    if (isPro()) return;

    // Abas Pro no nav desktop
    ['investments', 'analysis'].forEach(tab => {
      document.querySelectorAll(`.nav-tab[data-tab="${tab}"]`).forEach(el => {
        if (!el.querySelector('.pro-chip')) {
          el.insertAdjacentHTML('beforeend', '<span class="pro-chip"><i class="bi bi-gem"></i>Pro</span>');
        }
      });
    });

    // Mobile nav tabs Pro
    ['mobile-nav-tab-investments', 'mobile-nav-tab-analysis'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.querySelector('.pro-chip')) {
        el.insertAdjacentHTML('beforeend', '<span class="pro-chip"><i class="bi bi-gem"></i></span>');
      }
    });

    // FAB option "Aporte" (investimentos mobile)
    const mobInvest = document.getElementById('mob-opt-invest');
    if (mobInvest && !mobInvest.querySelector('.pro-chip')) {
      mobInvest.insertAdjacentHTML('beforeend', '<span class="pro-chip"><i class="bi bi-gem"></i></span>');
    }

    // Botão chat
    ['btn-chat', 'btn-chat-inline'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.querySelector('.pro-chip')) {
        el.insertAdjacentHTML('beforeend', '<span class="pro-chip"><i class="bi bi-gem"></i>Pro</span>');
      }
    });
  }

  // ── Badge Pro no header (usuários Pro) ───────────────────────────────────────

  function addProBadge() {
    if (!isPro()) return;
    // Injeta badge ao lado do nome/avatar no header, se ainda não existe
    setTimeout(() => {
      const nameEl = document.getElementById('profile-name-display') ||
                     document.getElementById('header-greeting-name');
      if (nameEl && !document.querySelector('.atlas-pro-badge')) {
        nameEl.insertAdjacentHTML('afterend',
          '<span class="atlas-pro-badge" title="Plano Atlas Pro ativo"><i class="bi bi-gem"></i> Pro</span>'
        );
      }
    }, 800);
  }

  // ── Detectar retorno do checkout com sucesso ─────────────────────────────────

  function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;

    // Remove o parâmetro da URL sem reload
    const clean = window.location.pathname;
    window.history.replaceState({}, '', clean);

    // Sync perfil para obter plan: 'pro' do servidor
    if (typeof syncProfileFromServer === 'function') {
      syncProfileFromServer().then(() => {
        if (typeof toast === 'function') {
          toast('Bem-vindo ao Atlas Pro! Todos os recursos foram desbloqueados.', 'ok');
        }
        // Remove chips Pro (usuário agora é Pro)
        document.querySelectorAll('.pro-chip').forEach(el => el.remove());
        addProBadge();
      }).catch(() => {});
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function applyBillingUI() {
    addProChips();
    addProBadge();
    handleCheckoutReturn();
  }

  function init() {
    injectUI();
    hookSwitchTab();
    hookButtons();
    hookKeyboard();

    // Aguarda syncProfileFromServer disparar o evento com o plano carregado do servidor
    window.addEventListener('atlas:profile-synced', applyBillingUI, { once: true });

    // Fallback: se o evento não vier em 5s (offline/cache), aplica com o que tiver
    setTimeout(() => applyBillingUI(), 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
