'use strict';

const BENEFIT_TYPES = {
  vr: { label: 'Vale Refeição', icon: '<i class="bi bi-cup-hot-fill"></i>', color: '#f59e0b' },
  vt: { label: 'Vale Transporte', icon: '<i class="bi bi-bus-front-fill"></i>', color: '#3b82f6' },
};

const CATEGORIES = {
  alimentacao: { label: 'Alimentação', icon: '<i class="bi bi-bag-fill"></i>',         color: '#f59e0b' },
  transporte:  { label: 'Transporte',  icon: '<i class="bi bi-car-front-fill"></i>',   color: '#3b82f6' },
  moradia:     { label: 'Moradia',     icon: '<i class="bi bi-house-fill"></i>',        color: '#8b5cf6' },
  saude:       { label: 'Saúde',       icon: '<i class="bi bi-capsule"></i>',           color: '#10b981' },
  lazer:       { label: 'Lazer',       icon: '<i class="bi bi-controller"></i>',        color: '#ec4899' },
  educacao:    { label: 'Educação',    icon: '<i class="bi bi-book-fill"></i>',         color: '#84cc16' },
  contas:      { label: 'Contas',      icon: '<i class="bi bi-lightbulb-fill"></i>',   color: '#f97316' },
  compras:     { label: 'Compras',     icon: '<i class="bi bi-cart-fill"></i>',         color: '#6366f1' },
  outros:      { label: 'Outros',      icon: '<i class="bi bi-three-dots"></i>',        color: '#94a3b8' },
};
