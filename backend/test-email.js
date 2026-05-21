'use strict';
const nodemailer = require('nodemailer');
require('dotenv').config();

const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: +process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const fmtBRL = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const month      = 'Maio 2026';
const income     = 5800, expense = 3920, balance = 1880;
const score      = 72,   score_label = 'Bom';
const savePct    = ((balance / income) * 100).toFixed(0);
const appUrl     = process.env.APP_URL || 'https://app.mathsouza.online';
const scoreColor = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

const headline = score >= 75
  ? 'Você arrasou esse mês! 🚀'
  : score >= 50
  ? 'Bom mês, dá pra ir ainda mais longe! 💪'
  : 'Esse mês foi difícil — mas você tem o controle. 🎯';

const motivation = score >= 75
  ? `Sua taxa de poupança de ${savePct}% está acima da média brasileira. Continue investindo e o tempo trabalha pra você.`
  : score >= 50
  ? `Você poupou ${savePct}% da renda — quase na meta dos 20%. Com pequenos ajustes dá pra cruzar essa linha.`
  : `Saldo positivo já é uma vitória. Reduza 15% nos 2 maiores gastos e o impacto vai surpreender.`;

const cats = [
  { label: 'Alimentação', icon: '🍽', val: 1240, pct: 32 },
  { label: 'Moradia',     icon: '🏠', val: 1100, pct: 28 },
  { label: 'Transporte',  icon: '🚗', val: 620,  pct: 16 },
  { label: 'Lazer',       icon: '🎮', val: 480,  pct: 12 },
  { label: 'Outros',      icon: '📦', val: 480,  pct: 12 },
];

// Barra de progresso via tabela (compatível com Gmail)
const catRows = cats.map(c => `
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="22" style="font-size:14px;vertical-align:middle">${c.icon}</td>
          <td style="vertical-align:middle;padding:0 8px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:13px;color:#cbd5e1;font-family:Arial,sans-serif">${c.label}</td>
                <td align="right" style="font-size:13px;font-weight:bold;color:#f1f5f9;font-family:Arial,sans-serif;white-space:nowrap">${fmtBRL(c.val)}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:5px">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:3px;overflow:hidden;background:#1e293b">
                    <tr>
                      <td width="${c.pct}%" height="4" bgcolor="#6366f1" style="font-size:0;line-height:0">&nbsp;</td>
                      <td width="${100 - c.pct}%" height="4" bgcolor="#1e293b" style="font-size:0;line-height:0">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
          <td width="32" align="right" style="font-size:11px;color:#64748b;font-family:Arial,sans-serif;vertical-align:middle">${c.pct}%</td>
        </tr>
      </table>
    </td>
  </tr>`).join('');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resumo Atlas — ${month}</title>
</head>
<body style="margin:0;padding:16px 0;background:#0d0d1a;font-family:Arial,Helvetica,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">

  <!-- HEADER -->
  <tr>
    <td bgcolor="#11103a" style="padding:28px 28px 22px;border-radius:16px 16px 0 0;border-bottom:1px solid #2d1f6e">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <span style="font-size:18px;font-weight:900;color:#a78bfa;font-family:Arial,sans-serif">💎 Atlas</span>
          </td>
          <td align="right">
            <span style="background:#2d1f6e;color:#a78bfa;font-size:10px;font-weight:700;padding:4px 10px;border-radius:100px;letter-spacing:1px;text-transform:uppercase;font-family:Arial,sans-serif">RESUMO MENSAL</span>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 6px;font-size:11px;font-weight:700;color:#6d28d9;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif">${month}</p>
      <p style="margin:0 0 8px;font-size:22px;font-weight:900;color:#f1f5f9;line-height:1.25;font-family:Arial,sans-serif">${headline}</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;font-family:Arial,sans-serif">${motivation}</p>
    </td>
  </tr>

  <!-- SALDO PRINCIPAL -->
  <tr>
    <td bgcolor="#0f0f1e" style="padding:20px 28px 0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#161630;border:1px solid #2a2a4a;border-radius:14px">
        <tr>
          <td style="padding:20px 22px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#475569;letter-spacing:1.5px;text-transform:uppercase;font-family:Arial,sans-serif">SALDO DO MÊS</p>
                  <p style="margin:0 0 4px;font-size:32px;font-weight:900;color:#10b981;line-height:1;font-family:Arial,sans-serif">+${fmtBRL(balance)}</p>
                  <p style="margin:0;font-size:12px;color:#475569;font-family:Arial,sans-serif">Você poupou ${savePct}% da sua renda</p>
                </td>
                <td align="right" valign="middle" width="90">
                  <table cellpadding="0" cellspacing="0" border="0" align="right">
                    <tr>
                      <td align="center" width="72" height="72" bgcolor="#1e1a3a" style="border-radius:50%;border:2px solid ${scoreColor}">
                        <p style="margin:0;font-size:22px;font-weight:900;color:${scoreColor};font-family:Arial,sans-serif;line-height:68px">${score}</p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top:4px;font-size:11px;color:#64748b;font-family:Arial,sans-serif">${score_label}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- RECEITA / DESPESA -->
  <tr>
    <td bgcolor="#0f0f1e" style="padding:12px 28px 0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="49%" bgcolor="#0d2a1e" style="border:1px solid #1a4a32;border-radius:12px;padding:14px 16px">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#34d399;letter-spacing:1px;text-transform:uppercase;font-family:Arial,sans-serif">↑ RECEITAS</p>
            <p style="margin:0;font-size:17px;font-weight:700;color:#f1f5f9;font-family:Arial,sans-serif">${fmtBRL(income)}</p>
          </td>
          <td width="2%"></td>
          <td width="49%" bgcolor="#2a0d0d" style="border:1px solid #4a1a1a;border-radius:12px;padding:14px 16px">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#f87171;letter-spacing:1px;text-transform:uppercase;font-family:Arial,sans-serif">↓ DESPESAS</p>
            <p style="margin:0;font-size:17px;font-weight:700;color:#f1f5f9;font-family:Arial,sans-serif">${fmtBRL(expense)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CATEGORIAS -->
  <tr>
    <td bgcolor="#0f0f1e" style="padding:12px 28px 0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#161630;border:1px solid #2a2a4a;border-radius:14px">
        <tr>
          <td style="padding:16px 20px">
            <p style="margin:0 0 12px;font-size:10px;font-weight:700;color:#475569;letter-spacing:1.5px;text-transform:uppercase;font-family:Arial,sans-serif">GASTOS POR CATEGORIA</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">${catRows}</table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- INSIGHT -->
  <tr>
    <td bgcolor="#0f0f1e" style="padding:12px 28px 0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#12122a;border-left:3px solid #6366f1;border-radius:0 12px 12px 0">
        <tr>
          <td style="padding:14px 16px">
            <p style="margin:0 0 5px;font-size:10px;font-weight:700;color:#818cf8;letter-spacing:1px;text-transform:uppercase;font-family:Arial,sans-serif">💡 INSIGHT DO MÊS</p>
            <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;font-family:Arial,sans-serif">
              Alimentação consome <strong style="color:#f1f5f9">32%</strong> das suas despesas. A média recomendada é 15–20%. Planejar refeições semanalmente pode economizar até <strong style="color:#f1f5f9">R$ 300/mês</strong>.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td bgcolor="#0f0f1e" style="padding:24px 28px 28px;text-align:center">
      <a href="${appUrl}/app?tab=analysis"
         style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:10px;font-size:14px;font-weight:700;font-family:Arial,sans-serif">
        Abrir análise completa &rarr;
      </a>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td bgcolor="#080810" style="padding:16px 28px;border-top:1px solid #1a1a2e;border-radius:0 0 16px 16px;text-align:center">
      <p style="margin:0;font-size:11px;color:#1e293b;font-family:Arial,sans-serif">💎 Atlas Finance &middot; Seus dados, seu controle.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;

t.sendMail({
  from: process.env.SMTP_FROM,
  to: 'mitaovlog00@gmail.com',
  subject: `📊 Seu resumo de ${month} chegou — Atlas`,
  html,
}).then(() => console.log('Enviado!'))
  .catch(e => console.error('Erro:', e.message));
