'use strict';

// =============================================
//  PROFILE
// =============================================
let _profilePhoto = null;

function loadProfile() {
  const stored = Storage.getJSON(Storage.profileKey(), {});

  // Remove fotos deixadas por versões antigas. A origem da foto é sempre o servidor.
  if (Object.prototype.hasOwnProperty.call(stored, 'photo')) {
    const { photo: _legacyPhoto, ...clean } = stored;
    Storage.setJSON(Storage.profileKey(), clean);
    return _profilePhoto ? { ...clean, photo: _profilePhoto } : clean;
  }

  return _profilePhoto ? { ...stored, photo: _profilePhoto } : stored;
}

function saveProfile(data) {
  const hasPhoto = Object.prototype.hasOwnProperty.call(data, 'photo');
  const { photo, ...serverData } = data;
  if (hasPhoto) _profilePhoto = photo || null;

  const current = loadProfile();
  const { photo: _currentPhoto, ...storedProfile } = current;
  Storage.setJSON(Storage.profileKey(), { ...storedProfile, ...serverData });

  if (!Demo.active) {
    if (Object.keys(serverData).length > 0) {
      API.req('PATCH', '/api/profile', serverData).catch(() => {});
    }
  }
}

async function syncProfileFromServer() {
  if (Demo.active) return;
  try {
    const remote = await API.req('GET', '/api/profile');
    if (remote && typeof remote === 'object' && Object.keys(remote).length) {
      const { photo, ...serverProfile } = remote;
      _profilePhoto = photo || null;
      const current = loadProfile();
      const { photo: _currentPhoto, ...storedProfile } = current;
      Storage.setJSON(Storage.profileKey(), { ...storedProfile, ...serverProfile });
      window.dispatchEvent(new Event('atlas:profile-synced'));
    }
  } catch { /* offline ou sem sessão — mantém cache local */ }
}

function updateProfileUI() {
  const profile  = loadProfile();
  const email    = Demo.active ? 'Modo Demo' : (Auth.email || '');
  const rawName  = profile.name || (email ? email.split('@')[0] : '');
  const name     = rawName || '—';
  const initial  = name !== '—' ? name[0].toUpperCase() : '?';

  // Header mini avatar
  const miniEl = document.getElementById('profile-avatar-mini');
  if (miniEl) {
    if (profile.photo) {
      miniEl.innerHTML = `<img src="${profile.photo}" alt="Foto" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      miniEl.innerHTML = `<span class="profile-initial-mini">${initial}</span>`;
    }
  }

  // Header greeting
  const greetEl   = document.getElementById('header-greeting');
  const greetName = document.getElementById('header-greeting-name');
  if (greetEl && greetName) {
    greetName.textContent = name !== '—' ? name : '';
    greetEl.classList.toggle('hidden', name === '—');
  }

  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  // Dashboard hero title (desktop)
  const heroTitle = document.getElementById('dash-hero-title');
  if (heroTitle) {
    heroTitle.textContent = name !== '—' ? `${saudacao}, ${name}.` : `${saudacao}.`;
  }

  // Mobile greeting
  const mobGreetName = document.getElementById('mob-greeting-name');
  const mobGreetSub  = document.getElementById('mob-greeting-sub');
  const mobAvatar    = document.getElementById('mob-avatar');
  if (mobGreetName) mobGreetName.innerHTML = name !== '—' ? escHtml(name) + ' <i class="bi bi-hand-wave"></i>' : '<i class="bi bi-hand-wave"></i>';
  if (mobAvatar)    mobAvatar.textContent    = initial;
  // Avatares extras (IA e Invest.)
  const mobIaAvatar  = document.getElementById('mob-ia-avatar');
  const mobInvAvatar = document.getElementById('mob-inv-avatar');
  if (mobIaAvatar)  mobIaAvatar.textContent  = initial;
  if (mobInvAvatar) mobInvAvatar.textContent = initial;
  // Mês na tela de investimentos
  const mobInvMonth = document.getElementById('mob-inv-month');
  if (mobInvMonth) mobInvMonth.textContent = currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
  if (mobGreetSub) mobGreetSub.textContent = `${saudacao},`;

  // Panel avatar
  const panelImg = document.getElementById('profile-avatar-img');
  if (panelImg) {
    panelImg.innerHTML = profile.photo
      ? `<img src="${profile.photo}" alt="Foto">`
      : `<span class="profile-avatar-initial">${initial}</span>`;
  }

  // Panel name + email
  const nameEl  = document.getElementById('profile-name-display');
  const emailEl = document.getElementById('profile-email-display');
  if (nameEl)  nameEl.textContent  = name;
  if (emailEl) emailEl.textContent = email || '—';
}

async function openProfilePanel() {
  if (!Demo.active && !Auth.email) {
    await Auth.check().catch(() => {});
  }
  updateProfileUI();
  document.getElementById('profile-panel-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeProfilePanel() {
  document.getElementById('profile-panel-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function openSettingsModal() {
  const accountSection = document.getElementById('auth-user-bar');
  if (accountSection) accountSection.classList.toggle('hidden', Demo.active);

  // Injeta botão "Gerenciar assinatura" uma única vez (não aparece no modo demo)
  if (!Demo.active && !document.getElementById('btn-manage-subscription')) {
    const resetBtn = document.getElementById('btn-reset-password');
    if (resetBtn) {
      const btn = document.createElement('button');
      btn.id        = 'btn-manage-subscription';
      btn.type      = 'button';
      btn.className = resetBtn.className;
      btn.innerHTML = '<i class="bi bi-credit-card-fill"></i><span>Gerenciar assinatura</span>';
      btn.addEventListener('click', manageSubscription);
      resetBtn.parentNode.insertBefore(btn, resetBtn);
    }
  }

  openModal('modal-settings');
}

async function manageSubscription() {
  const btn = document.getElementById('btn-manage-subscription');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin .7s linear infinite"></i><span>Abrindo portal…</span>'; }
  try {
    const data = await API.req('POST', '/api/billing/portal');
    if (data?.url) window.location.href = data.url;
    else if (data?.provider === 'mercadopago') {
      const confirmed = window.confirm('Deseja cancelar a renovação da assinatura pelo Mercado Pago?');
      if (!confirmed) return;
      await API.req('POST', '/api/billing/mercadopago/cancel');
      toast('Assinatura cancelada. Seu plano não será renovado.', 'ok');
    }
    else toast('Erro ao abrir portal de assinatura.', 'err');
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Nenhuma assinatura')) {
      toast('Você está no plano gratuito. Assine o Pro para gerenciar aqui.', 'err');
      window.open('/planos', '_blank');
    } else {
      toast('Erro: ' + msg, 'err');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-credit-card-fill"></i><span>Gerenciar assinatura</span>'; }
  }
}

async function exportUserData() {
  if (Demo.active) { toast('Indisponível no modo demo.', 'err'); return; }
  const btn = document.getElementById('btn-export-data');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/user/export', { method: 'GET', credentials: 'include' });
    if (!res.ok) throw new Error('Erro ao exportar dados.');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'atlas-meus-dados.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Dados exportados com sucesso.');
  } catch (err) {
    toast('Erro ao exportar: ' + err.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function resetPassword() {
  const email = Auth.email;
  if (!email) { toast('Nenhum email encontrado.', 'err'); return; }
  const btn = document.getElementById('btn-reset-password');
  if (btn) btn.disabled = true;
  try {
    await API.req('POST', '/api/auth/reset-password', { email });
    toast(`Email enviado para ${email}. Verifique sua caixa de entrada.`);
  } catch (err) {
    toast('Erro ao enviar email: ' + err.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteAccount() {
  const textEl   = document.getElementById('delete-account-text');
  const loaderEl = document.getElementById('delete-account-loader');
  const btn      = document.getElementById('btn-confirm-delete');
  if (btn)      btn.disabled    = true;
  if (textEl)   textEl.classList.add('hidden');
  if (loaderEl) loaderEl.classList.remove('hidden');
  try {
    await API.req('DELETE', '/api/auth/account');
    Auth._clearDisplay();
    Storage.clear();
    window.location.reload();
  } catch (err) {
    toast('Erro ao excluir conta: ' + err.message, 'err');
    if (btn)      btn.disabled    = false;
    if (textEl)   textEl.classList.remove('hidden');
    if (loaderEl) loaderEl.classList.add('hidden');
    closeModal('modal-confirm-delete');
  }
}

function saveProfileName() {
  const input = document.getElementById('edit-name-input');
  const name  = input.value.trim();
  if (!name) return;
  saveProfile({ name });
  closeModal('modal-edit-name');
  updateProfileUI();
  toast('Nome atualizado!');
}
