'use strict';

// ─── Password toggles ────────────────────────────────────────────────────────
function initPasswordToggles() {
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input   = document.getElementById(btn.dataset.target);
      const visible = input.type === 'text';
      input.type    = visible ? 'password' : 'text';
      btn.querySelector('.eye-open').classList.toggle('hidden', !visible);
      btn.querySelector('.eye-closed').classList.toggle('hidden', visible);
      btn.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Esconder senha');
    });
  });
}

function resetPasswordToggles() {
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    const input = document.getElementById(btn.dataset.target);
    if (input) input.type = 'password';
    btn.querySelector('.eye-open').classList.remove('hidden');
    btn.querySelector('.eye-closed').classList.add('hidden');
    btn.setAttribute('aria-label', 'Mostrar senha');
  });
}

// ─── Feedback ────────────────────────────────────────────────────────────────
function showAuthError(msg, { retryFn } = {}) {
  const el = document.getElementById('auth-error');
  if (retryFn) {
    el.innerHTML = `<span>${escHtmlLogin(msg)}</span> <button id="btn-auth-retry" style="background:none;border:none;color:inherit;text-decoration:underline;cursor:pointer;font-size:inherit;padding:0;margin-left:4px;">Tentar novamente</button>`;
    document.getElementById('btn-auth-retry').addEventListener('click', retryFn);
  } else {
    el.textContent = msg;
  }
  el.classList.remove('hidden');
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearAuthFeedback() {
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');
}

function setAuthLoading(on) {
  const btn    = document.getElementById('auth-submit');
  const text   = document.getElementById('auth-submit-text');
  const loader = document.getElementById('auth-submit-loader');
  btn.disabled = on;
  text.classList.toggle('hidden', on);
  loader.classList.toggle('hidden', !on);
}

// ─── Auth mode ───────────────────────────────────────────────────────────────
function setAuthMode(mode) {
  const isSignup = mode === 'signup';
  document.getElementById('tab-signin').classList.toggle('active', !isSignup);
  document.getElementById('tab-signup').classList.toggle('active', isSignup);
  document.getElementById('auth-confirm-group').classList.toggle('hidden', !isSignup);
  document.getElementById('auth-terms-group').classList.toggle('hidden', !isSignup);
  if (!isSignup) document.getElementById('auth-terms-check').checked = false;
  document.getElementById('auth-submit-text').textContent = isSignup ? 'Criar conta' : 'Entrar →';
  document.getElementById('btn-demo').classList.toggle('hidden', isSignup);
  document.querySelector('.auth-demo-divider').classList.toggle('hidden', isSignup);

  const forgotRow = document.getElementById('auth-forgot-row');
  if (forgotRow) forgotRow.classList.toggle('hidden', isSignup);

  const line1 = document.getElementById('auth-welcome-line1');
  const line2 = document.getElementById('auth-welcome-line2');
  if (line1) line1.textContent = isSignup ? 'Crie sua conta' : 'Bem-vindo de volta';
  if (line2) line2.innerHTML = isSignup ? '' : ' <i class="bi bi-hand-wave"></i>';

  document.getElementById('auth-hint-signin')?.classList.toggle('hidden', isSignup);
  document.getElementById('auth-hint-signup')?.classList.toggle('hidden', !isSignup);
  document.getElementById('auth-hint-pro')?.classList.toggle('hidden', !isSignup);

  clearAuthFeedback();
}

function authErrorMsg(raw) {
  const m = (raw || '').toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_grant'))
    return 'Email ou senha incorretos.';
  if (m.includes('email not confirmed'))
    return 'Email não confirmado. Verifique sua caixa de entrada.';
  if (m.includes('user already registered') || m.includes('user_already_exists'))
    return 'Este email já está cadastrado. Tente fazer login.';
  if (m.includes('password should be at least') || m.includes('weak_password'))
    return 'Senha muito fraca. Use pelo menos 6 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid format') || m.includes('email_address_invalid'))
    return 'Formato de email inválido.';
  if (m.includes('over_email_send_rate_limit') || m.includes('rate limit'))
    return 'Muitas tentativas. Aguarde um momento e tente novamente.';
  if (m.includes('signup_disabled'))
    return 'Cadastro desabilitado. Entre em contato com o suporte.';
  if (m.includes('network') || m.includes('fetch') || m.includes('load failed') || m.includes('failed to load'))
    return 'Erro de conexão. Verifique sua internet.';
  if (m.includes('servidor indisponível') || m.includes('serviço') || m.includes('serviço externo'))
    return 'Servidor temporariamente indisponível. Aguarde alguns instantes e tente novamente.';
  if (m.includes('too many requests') || m.includes('429'))
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.';
  if (m.includes('email_exists') || m.includes('email already'))
    return 'Este email já está cadastrado. Tente fazer login.';
  if (m.includes('token') || m.includes('expired') || m.includes('jwt'))
    return 'Sessão expirada. Faça login novamente.';
  // Se a mensagem original estiver em inglês, retorna um fallback genérico
  const hasPtChars = /[áéíóúãõâêîôûçàèìòùÁÉÍÓÚÃÕÂÊÎÔÛÇ]/.test(raw) || /\b(erro|falha|inválid|obrigat)\b/i.test(raw);
  return hasPtChars ? raw : 'Ocorreu um erro inesperado. Tente novamente.';
}

// ─── Reenvio de confirmação ───────────────────────────────────────────────────
function showResendConfirmation(email) {
  const el = document.getElementById('auth-success');
  el.innerHTML = `
    <span>Cadastro realizado! Verifique <strong>${escHtmlLogin(email)}</strong> para confirmar sua conta.</span>
    <button id="btn-resend-confirm" style="margin-top:8px;display:block;background:none;border:none;color:inherit;text-decoration:underline;cursor:pointer;font-size:inherit;padding:0;">Não recebeu? Reenviar email</button>
  `;
  el.classList.remove('hidden');

  document.getElementById('btn-resend-confirm').addEventListener('click', async function () {
    this.disabled = true;
    this.textContent = 'Enviando...';
    try {
      await API.req('POST', '/api/auth/resend-confirmation', { email });
      this.textContent = 'Email reenviado! Verifique sua caixa de entrada.';
    } catch (err) {
      this.textContent = 'Erro ao reenviar. Tente novamente.';
      this.disabled = false;
    }
  });
}

function escHtmlLogin(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Reset password form ──────────────────────────────────────────────────────
function showResetPasswordForm() {
  document.getElementById('auth-screen').classList.add('hidden');
  const screen    = document.getElementById('reset-password-screen');
  const form      = document.getElementById('reset-pw-form');
  const errEl     = document.getElementById('reset-pw-error');
  const btn       = document.getElementById('reset-pw-submit');
  const btnText   = document.getElementById('reset-pw-submit-text');
  const btnLoader = document.getElementById('reset-pw-submit-loader');

  screen.classList.remove('hidden');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const password = document.getElementById('reset-pw-new').value;
    const confirm  = document.getElementById('reset-pw-confirm').value;

    if (password.length < 6) {
      errEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
      errEl.classList.remove('hidden');
      return;
    }
    if (password !== confirm) {
      errEl.textContent = 'As senhas não coincidem.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');

    try {
      await API.req('POST', '/api/auth/update-password', { password });
      await Auth.signOut().catch(() => {});
      screen.classList.add('hidden');
      document.getElementById('auth-screen').classList.remove('hidden');
      resetPasswordToggles();
      clearAuthFeedback();
      showAuthSuccess('Senha redefinida com sucesso! Faça login com a nova senha.');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
    }
  });
}

// ─── Supabase auth redirect (email confirm / recovery) ───────────────────────
async function handleAuthRedirect() {
  const hash = window.location.hash.slice(1);
  if (!hash) return { ok: false, attempted: false, recovery: false };

  const params      = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken) return { ok: false, attempted: false, recovery: false };

  const isRecovery   = params.get('type') === 'recovery';
  const refreshToken = params.get('refresh_token');
  history.replaceState(null, '', window.location.pathname);

  try {
    await API.req('POST', '/api/auth/confirm', { access_token: accessToken, refresh_token: refreshToken });
    return { ok: true, attempted: true, recovery: isRecovery };
  } catch (err) {
    return { ok: false, attempted: true, recovery: false, expiredRecovery: isRecovery, error: err.message };
  }
}

// ─── Auth events ─────────────────────────────────────────────────────────────
function bindAuthEvents() {
  document.getElementById('tab-signin').addEventListener('click', () => setAuthMode('signin'));
  document.getElementById('tab-signup').addEventListener('click', () => setAuthMode('signup'));
  document.getElementById('link-goto-signup')?.addEventListener('click', e => { e.preventDefault(); setAuthMode('signup'); });
  document.getElementById('link-goto-signin')?.addEventListener('click', e => { e.preventDefault(); setAuthMode('signin'); });

  document.getElementById('btn-forgot-pw')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    if (!email) {
      document.getElementById('auth-email').focus();
      showAuthError('Preencha seu email para redefinir a senha.');
      return;
    }
    clearAuthFeedback();
    const btn = document.getElementById('btn-forgot-pw');
    btn.disabled    = true;
    btn.textContent = 'Enviando...';
    try {
      await API.req('POST', '/api/auth/reset-password', { email });
      showAuthSuccess(`Link de redefinição enviado para ${email}. Verifique sua caixa de entrada.`);
    } catch (err) {
      showAuthError(err.message || 'Erro ao enviar email.');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Esqueci a senha';
    }
  });

  document.getElementById('btn-google-login')?.addEventListener('click', () => {
    window.location.href = '/api/auth/oauth/google';
  });
  document.getElementById('btn-apple-login')?.addEventListener('click', () => {
    window.location.href = '/api/auth/oauth/apple';
  });

  document.getElementById('btn-demo').addEventListener('click', () => {
    Demo.enter();
    window.location.href = '/app?demo=1';
  });

  document.getElementById('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirm  = document.getElementById('auth-confirm').value;
    const isSignup = document.getElementById('tab-signup').classList.contains('active');

    clearAuthFeedback();

    if (!email || !password) { showAuthError('Preencha email e senha.'); return; }
    if (isSignup && password.length < 6) { showAuthError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (isSignup && password !== confirm) { showAuthError('As senhas não coincidem.'); return; }
    if (isSignup && !document.getElementById('auth-terms-check').checked) {
      showAuthError('Você precisa aceitar os Termos de Uso e a Política de Privacidade para criar uma conta.');
      return;
    }

    async function doAuth() {
      setAuthLoading(true);
      try {
        if (isSignup) {
          const result = await Auth.signUp(email, password);
          if (result.confirmEmail) {
            showResendConfirmation(email);
            setAuthMode('signin');
            return;
          }
        } else {
          await Auth.signIn(email, password);
        }
        sessionStorage.removeItem('atlas_app_error');
        window.location.href = '/app';
      } catch (err) {
        const msg = authErrorMsg(err.message);
        const isConnErr = msg.includes('conexão') || msg.includes('indisponível') || msg.includes('internet') || msg.includes('limite');
        showAuthError(msg, isConnErr ? { retryFn: () => { clearAuthFeedback(); doAuth(); } } : {});
      } finally {
        setAuthLoading(false);
      }
    }
    doAuth();
  });
}

// ─── Mockup interactivity ────────────────────────────────────────────────────
function initMockupInteractivity() {
  const left   = document.querySelector('.auth-left');
  const scene  = document.querySelector('.auth-mockup-scene');
  const window_ = document.querySelector('.auth-mockup-window');
  if (!left || !scene || !window_) return;

  left.addEventListener('mousemove', e => {
    const rect = left.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width  - 0.5;
    const cy = (e.clientY - rect.top)  / rect.height - 0.5;
    scene.style.transform   = `translate(${cx * 10}px, ${cy * 8}px)`;
    window_.style.transform = `rotateY(${cx * 4}deg) rotateX(${-cy * 3}deg)`;
  });

  left.addEventListener('mouseleave', () => {
    scene.style.transform   = '';
    window_.style.transform = '';
  });

  // Number counter animation
  const counters = [
    { el: document.querySelector('.mk-card-value'), target: 3192.50, prefix: 'R$ ', decimals: 2 },
    { el: document.querySelectorAll('.mk-stat-value')[0], target: 5300, prefix: 'R$ ', decimals: 0 },
    { el: document.querySelectorAll('.mk-stat-value')[1], target: 2107, prefix: 'R$ ', decimals: 0 },
  ];

  setTimeout(() => {
    counters.forEach(({ el, target, prefix, decimals }) => {
      if (!el) return;
      const duration = 1200;
      const start    = performance.now();
      const fmt = v => prefix + v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      const tick = now => {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(target * ease);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, 400);
}

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const theme = Storage.get(Storage.THEME, 'dark');
  document.documentElement.dataset.theme = theme;

  initPasswordToggles();
  bindAuthEvents();
  initMockupInteractivity();

  const redirect = await handleAuthRedirect();

  if (redirect.recovery) {
    showResetPasswordForm();
    return;
  }

  if (redirect.expiredRecovery) {
    showAuthError('O link de redefinição expirou. Clique em "Esqueci minha senha" para receber um novo.');
    return;
  }

  if (redirect.attempted && !redirect.ok) {
    const el = document.getElementById('auth-error');
    el.innerHTML = `
      <span>O link de confirmação expirou ou é inválido.</span>
      <button id="btn-resend-expired" style="margin-top:6px;display:block;background:none;border:none;color:inherit;text-decoration:underline;cursor:pointer;font-size:inherit;padding:0;">Reenviar email de confirmação</button>
    `;
    el.classList.remove('hidden');
    document.getElementById('btn-resend-expired').addEventListener('click', async function () {
      const email = document.getElementById('auth-email').value.trim();
      if (!email) { showAuthError('Preencha seu email para reenviar a confirmação.'); return; }
      this.disabled = true;
      this.textContent = 'Enviando...';
      try {
        await API.req('POST', '/api/auth/resend-confirmation', { email });
        this.textContent = 'Email reenviado! Verifique sua caixa de entrada.';
      } catch (err) {
        this.textContent = 'Erro ao reenviar. Tente novamente.';
        this.disabled = false;
      }
    });
    return;
  }

  if (redirect.attempted && redirect.ok) {
    window.location.href = '/app';
    return;
  }

  const oauthError = new URLSearchParams(window.location.search).get('error');
  if (oauthError) {
    const msgs = {
      oauth_failed:     'Falha no login social. Tente novamente.',
      invalid_provider: 'Provedor inválido.',
      access_denied:    'Login cancelado.',
    };
    showAuthError(msgs[oauthError] || `Erro no login: ${oauthError}`);
    history.replaceState(null, '', window.location.pathname);
  }

  const loggedIn = await Auth.check();
  if (loggedIn) {
    const appError = sessionStorage.getItem('atlas_app_error');
    if (appError) {
      sessionStorage.removeItem('atlas_app_error');
      showAuthError(`Erro ao carregar o app: ${appError}. Tente fazer login novamente.`);
      return;
    }
    window.location.href = '/app';
    return;
  }

  const pendingMode = sessionStorage.getItem('atlas_auth_mode');
  if (pendingMode) {
    sessionStorage.removeItem('atlas_auth_mode');
    setAuthMode(pendingMode);
  }

  if (new URLSearchParams(window.location.search).get('signup') === '1') {
    setAuthMode('signup');
  }
});
