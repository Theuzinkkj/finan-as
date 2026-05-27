'use strict';

(function () {
  const CONSENT_KEY = 'atlas_lgpd_consent_v1';
  if (localStorage.getItem(CONSENT_KEY)) return;

  const banner = document.createElement('div');
  banner.id = 'lgpd-consent-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Aviso de privacidade');
  banner.innerHTML =
    '<div class="lgpd-consent-inner">' +
      '<div class="lgpd-consent-text">' +
        '<strong>Privacidade &amp; Cookies</strong> &mdash; ' +
        'Usamos <strong>cookies de sess&atilde;o</strong> (httpOnly, necess&aacute;rios para autentica&ccedil;&atilde;o) e ' +
        '<strong>localStorage</strong> para prefer&ecirc;ncias locais como tema e modo demo. ' +
        'N&atilde;o utilizamos rastreamento ou publicidade. ' +
        '<a href="/privacidade.html" target="_blank" rel="noopener">Pol&iacute;tica de Privacidade</a>' +
      '</div>' +
      '<button id="lgpd-accept-btn" class="lgpd-consent-btn">Entendido</button>' +
    '</div>';

  document.body.appendChild(banner);

  document.getElementById('lgpd-accept-btn').addEventListener('click', function () {
    localStorage.setItem(CONSENT_KEY, '1');
    banner.classList.add('lgpd-consent-hiding');
    setTimeout(function () { banner.remove(); }, 300);
  });
})();
