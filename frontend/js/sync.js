'use strict';

// =============================================
//  CLOUD SYNC
// =============================================

// Meses já carregados na memória (evita refetch ao navegar para meses já vistos)
const _cachedMonths = new Set();

// Atualiza badge de itens pendentes no botão de sync
async function _updatePendingBadge() {
  const count = await PendingQueue.count().catch(() => 0);
  const badge = document.getElementById('sync-pending-badge');
  if (!badge) return;
  badge.textContent = count > 0 ? count : '';
  badge.classList.toggle('hidden', count === 0);
  if (count > 0) setCloudStatus('pending', `${count} item${count > 1 ? 's' : ''} aguardando sync`);
}

// monthOnly = 'YYYY-MM': carrega apenas aquele mês e funde no array global.
// Sem monthOnly: carrega últimos 13 meses (cobre gráficos históricos).
async function syncFromCloud(monthOnly) {
  setCloudStatus('loading', monthOnly ? `Carregando ${monthOnly}...` : 'Sincronizando...');
  try {
    let remote;

    if (monthOnly) {
      remote = await CloudDB.getAll({ month: monthOnly });
      transactions = transactions.filter(t => !t.date.startsWith(monthOnly));
      for (const tx of remote) {
        await DB.put(tx);
        transactions.push(tx);
      }
      _cachedMonths.add(monthOnly);
    } else {
      // Carrega últimos 13 meses para cobrir gráficos de evolução anual
      const since = (() => {
        const d = new Date(currentDate);
        d.setMonth(d.getMonth() - 12);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      })();
      remote = await CloudDB.getAll({ since });

      const remoteIds = new Set(remote.map(t => t.id));
      const local     = await DB.getAll();

      // Itens com operação pendente não devem ser deletados — ainda não chegaram ao cloud
      const pendingOps = await PendingQueue.getAll().catch(() => []);
      const pendingTxIds = new Set(pendingOps
        .filter(op => op.type === 'add' || op.type === 'update')
        .map(op => op.payload?.id)
        .filter(Boolean)
      );

      for (const tx of remote) await DB.put(tx);
      // Remove do cache local apenas registros dentro do período que não estão no remoto
      // e que não têm operações pendentes aguardando envio ao cloud
      for (const tx of local.filter(t => t.date >= since && !remoteIds.has(t.id) && !pendingTxIds.has(t.id))) {
        await DB.remove(tx.id);
      }

      // Inclui transações locais com operações pendentes (ainda não enviadas ao cloud)
      const pendingLocalTxs = local.filter(t => pendingTxIds.has(t.id) && !remoteIds.has(t.id));
      transactions = [...remote, ...pendingLocalTxs];
      _cachedMonths.clear();
      transactions.forEach(t => _cachedMonths.add(t.date.slice(0, 7)));
    }

    renderAll();
    setCloudStatus('connected', `${transactions.length} transações sincronizadas`);

    // Tenta enviar itens que ficaram na fila offline
    const pending = await PendingQueue.count().catch(() => 0);
    if (pending > 0) {
      const synced = await PendingQueue.flush().catch(() => 0);
      if (synced > 0 && !monthOnly) await syncFromCloud();
    }
    await _updatePendingBadge();
  } catch (err) {
    console.warn('Cloud sync error:', err.message);
    setCloudStatus('error', 'Erro ao sincronizar: ' + err.message);
    toast('Erro ao sincronizar com a nuvem: ' + err.message, 'err');
    await _updatePendingBadge();
  }
}
