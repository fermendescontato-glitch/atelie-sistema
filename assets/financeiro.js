/* =====================================================================
   Vendas e financeiro (visão de caixa)
   - Venda: itens + recebimentos (sinal, saldo, parcelas)
   - Recebimento: ao marcar como recebido, desconta a taxa da forma de pagamento
   - Despesas: avulsas e fixas (repetem todo mês), pró-labore separado
   ===================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { sb, estado, esc, moeda, numero, valorNum, toast, erro, abrirModal, campo, opcoes, opcoesLista, area } = App;

  const FORMAS = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferência', outro: 'Outro' };
  const ST_VENDA = { aberta: 'Em aberto', quitada: 'Quitada', cancelada: 'Cancelada' };
  const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const dataBR = (d) => (d ? new Date(d + 'T12:00').toLocaleDateString('pt-BR') : '-');
  const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

  // Taxa da forma de pagamento (Configurações > Formas de pagamento)
  function taxaDe(forma, parcelas) {
    const t = (estado.perfil && estado.perfil.taxas_pagamento) || {};
    if (forma === 'credito') {
      const lista = Array.isArray(t.credito) ? t.credito : [];
      const n = Math.max(1, Number(parcelas) || 1);
      return Number(lista[Math.min(n, lista.length) - 1] || 0);
    }
    return Number(t[forma] || 0);
  }
  function maxParcelas() { const t = (estado.perfil && estado.perfil.taxas_pagamento) || {}; return Math.max(1, (t.credito || []).length); }

  async function atualizarStatusVenda(vendaId) {
    const { data: recs } = await sb.from('recebimentos').select('status').eq('venda_id', vendaId);
    const { data: v } = await sb.from('vendas').select('status').eq('id', vendaId).single();
    if (!v || v.status === 'cancelada') return;
    const quitada = (recs || []).length > 0 && recs.every((r) => r.status === 'recebido');
    await sb.from('vendas').update({ status: quitada ? 'quitada' : 'aberta' }).eq('id', vendaId);
  }

  /* ---------------- Receber uma parcela ---------------- */
  function formReceber(rec, aoSalvar) {
    abrirModal({
      titulo: 'Registrar recebimento',
      textoSalvar: 'Confirmar recebimento',
      corpo: `
        <p style="margin:0 0 14px">${esc(rec.descricao || 'Parcela')} · <strong>${moeda(rec.valor)}</strong></p>
        <div class="grade g3">
          ${campo('Data', `<input type="date" name="recebido_em" value="${hojeISO()}">`)}
          ${campo('Forma', `<select name="forma">${opcoes(FORMAS, rec.forma || 'pix')}</select>`)}
          ${campo('Parcelas no cartão', `<select name="parcelas_cartao">${Array.from({ length: maxParcelas() }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select>`, '', 'Só para crédito. As taxas vêm de Configurações > Formas de pagamento.')}
          ${campo('Valor recebido', `<div class="com-sufixo"><input type="number" step="any" name="valor" value="${rec.valor}"><span>R$</span></div>`)}
        </div>
        <div class="calculo" id="calc-rec" style="margin-top:14px"></div>`,
      aoAbrir: (form) => {
        const att = () => {
          const forma = form.forma.value, n = Number(form.parcelas_cartao.value), v = valorNum(form.valor.value) || 0;
          form.parcelas_cartao.closest('.campo').style.visibility = forma === 'credito' ? 'visible' : 'hidden';
          const tx = taxaDe(forma, n);
          document.getElementById('calc-rec').innerHTML = `Taxa: <strong>${numero(tx)}%</strong> (${moeda(v * tx / 100)}) · Você recebe <strong>${moeda(v - v * tx / 100)}</strong>`;
        };
        form.addEventListener('input', att); form.addEventListener('change', att); att();
      },
      aoSalvar: async (d) => {
        const forma = d.get('forma'), n = forma === 'credito' ? Number(d.get('parcelas_cartao')) : null;
        const valor = valorNum(d.get('valor')) || 0, tx = taxaDe(forma, n);
        const dados = { status: 'recebido', recebido_em: d.get('recebido_em') || hojeISO(), forma, parcelas_cartao: n, valor, taxa_pct: tx, valor_liquido: r2(valor - valor * tx / 100) };
        const r = await sb.from('recebimentos').update(dados).eq('id', rec.id);
        if (r.error) throw r.error;
        await atualizarStatusVenda(rec.venda_id);
        toast('Recebimento registrado.');
        aoSalvar && aoSalvar();
      }
    });
  }
  App.formReceber = formReceber;

  /* =================================================================
     Venda criada a partir da proposta aceita
     ================================================================= */
  App.criarVendaDaProposta = async function (propostaId) {
    const { data: ja } = await sb.from('vendas').select('id').eq('proposta_id', propostaId).maybeSingle();
    if (ja) return ja.id;
    const [{ data: p }, { data: itens }] = await Promise.all([
      sb.from('propostas').select('*').eq('id', propostaId).single(),
      sb.from('proposta_itens').select('*, projetos(nome)').eq('proposta_id', propostaId).order('ordem')
    ]);
    let escolhidos = itens || [];
    let total = Number(p.valor_total) || 0;
    const opcoesExist = [...new Set(escolhidos.map((i) => i.opcao).filter(Boolean))];
    if (opcoesExist.length > 1) {
      const op = (prompt(`A cliente escolheu qual opção? (${opcoesExist.join(', ')})`, opcoesExist[0]) || '').trim().toUpperCase();
      if (opcoesExist.includes(op)) {
        escolhidos = escolhidos.filter((i) => !i.opcao || i.opcao === op);
        if (!p.valor_unico) total = escolhidos.reduce((s, i) => s + Number(i.valor || 0), 0) + Number(p.deslocamento_valor || 0);
      }
    }
    const v = await sb.from('vendas').insert({ cliente_id: p.cliente_id, proposta_id: p.id, data: hojeISO(), descricao: `Proposta ${p.numero}`, valor_total: total }).select('id').single();
    if (v.error) throw v.error;
    const vid = v.data.id;
    if (escolhidos.length) {
      const linhas = escolhidos.map((i) => ({ venda_id: vid, projeto_id: i.projeto_id, descricao: (i.projetos && i.projetos.nome) || i.descricao_cliente, quantidade: 1, valor_unitario: p.valor_unico ? 0 : Number(i.valor || 0) }));
      if (p.valor_unico && linhas.length) linhas[0].valor_unitario = total;
      await sb.from('venda_itens').insert(linhas);
    }
    const sinal = Number((estado.perfil || {}).sinal_pct ?? 50);
    const recs = sinal > 0 && sinal < 100
      ? [{ venda_id: vid, numero: 1, descricao: `Sinal (${numero(sinal)}%)`, vencimento: hojeISO(), valor: r2(total * sinal / 100) }, { venda_id: vid, numero: 2, descricao: 'Saldo na entrega', vencimento: null, valor: r2(total - r2(total * sinal / 100)) }]
      : [{ venda_id: vid, numero: 1, descricao: 'Pagamento', vencimento: hojeISO(), valor: total }];
    await sb.from('recebimentos').insert(recs);
    return vid;
  };

  /* =================================================================
     Lista de vendas
     ================================================================= */
  App.paginas.vendas = async function () {
    const { data, error } = await sb.from('vendas').select('*, clientes(nome), recebimentos(valor, valor_liquido, status)').order('data', { ascending: false });
    if (error) throw error;
    const lista = data || [];
    area().innerHTML = `
      <div class="cabecalho"><div><h1>Vendas</h1><p>Tudo o que você vendeu e o que falta receber.</p></div>
        <a class="botao" href="#/venda/nova">+ Nova venda</a></div>
      ${lista.length ? `<div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Data</th><th>Venda</th><th>Cliente</th><th>Status</th><th class="num">Total</th><th class="num">Recebido</th><th class="num">A receber</th></tr></thead>
        <tbody>${lista.map((v) => {
          const recs = v.recebimentos || [];
          const recebido = recs.filter((r) => r.status === 'recebido').reduce((s, r) => s + Number(r.valor || 0), 0);
          const falta = recs.filter((r) => r.status === 'pendente').reduce((s, r) => s + Number(r.valor || 0), 0);
          return `<tr style="cursor:pointer" data-abrir="${v.id}" class="${v.status === 'cancelada' ? 'inativo' : ''}">
            <td>${dataBR(v.data)}</td><td><strong>${esc(v.descricao || 'Venda')}</strong></td>
            <td>${esc((v.clientes && v.clientes.nome) || 'Consumidor final')}</td>
            <td><span class="selo status-${v.status}">${ST_VENDA[v.status]}</span></td>
            <td class="num">${moeda(v.valor_total)}</td><td class="num">${moeda(recebido)}</td><td class="num">${falta ? `<strong>${moeda(falta)}</strong>` : '-'}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="vazio">Nenhuma venda ainda. Quando uma proposta for aceita, a venda aparece aqui sozinha. Vendas de feira ou Instagram você registra em <strong>Nova venda</strong>.</div>'}`;
    area().querySelectorAll('[data-abrir]').forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/venda/' + tr.dataset.abrir; }));
  };

  /* =================================================================
     Venda (nova ou editar)
     ================================================================= */
  App.paginas.venda = async function () {
    const id = location.hash.replace(/^#\/?/, '').split('/')[1];
    const [cli, pj] = await Promise.all([
      sb.from('clientes').select('id, nome').eq('ativo', true).order('nome'),
      sb.from('projetos').select('id, nome, precificacoes(preco_final)').not('status', 'in', '(arquivado,em_criacao)').order('atualizado_em', { ascending: false })
    ]);
    const clientes = cli.data || [], projetos = pj.data || [];
    let ed;
    if (id === 'nova') ed = { venda: { data: hojeISO(), status: 'aberta', cliente_id: null, descricao: '' }, itens: [{ descricao: '', quantidade: 1, valor_unitario: 0 }], recs: [] };
    else {
      const [v, it, rc] = await Promise.all([
        sb.from('vendas').select('*').eq('id', id).maybeSingle(),
        sb.from('venda_itens').select('*').eq('venda_id', id).order('criado_em'),
        sb.from('recebimentos').select('*').eq('venda_id', id).order('numero')
      ]);
      if (!v.data) { area().innerHTML = '<div class="vazio">Venda não encontrada.</div>'; return; }
      ed = { venda: v.data, itens: it.data || [], recs: rc.data || [] };
    }
    desenharVenda(ed, clientes, projetos);
  };

  function desenharVenda(ed, clientes, projetos) {
    const v = ed.venda;
    const total = () => r2(ed.itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0));
    const novo = !v.id;
    area().innerHTML = `
      <div class="cabecalho"><div><p style="margin:0 0 4px"><a href="#/vendas">← Vendas</a></p><h1>${novo ? 'Nova venda' : esc(v.descricao || 'Venda')}</h1>
        ${!novo ? `<p><span class="selo status-${v.status}">${ST_VENDA[v.status]}</span></p>` : ''}</div>
        <div class="acoes" style="margin:0">${!novo && v.status !== 'cancelada' ? '<button type="button" class="botao texto" id="bt-cancelar">Cancelar venda</button>' : ''}<button type="button" class="botao" id="bt-salvar-venda">Salvar venda</button></div></div>
      <section class="card">
        <h2>Venda</h2>
        <div class="grade g3" style="margin-top:12px">
          ${campo('Cliente', `<select id="v-cli"><option value="">Consumidor final</option>${opcoesLista(clientes, v.cliente_id)}</select>`)}
          ${campo('Data da venda', `<input type="date" id="v-data" value="${esc(v.data)}">`)}
          ${campo('Descrição', `<input id="v-desc" value="${esc(v.descricao)}" placeholder="Ex.: Feira de domingo, pedido do Instagram">`)}
        </div>
      </section>
      <section class="card">
        <h2>Peças vendidas</h2>
        <div id="v-itens"></div>
        <div class="add-comp">
          <button type="button" class="botao sec peq" id="add-item">+ Item</button>
          <select id="add-proj" style="min-width:240px;border:1px solid #cfc4b2;border-radius:8px;padding:8px 10px"><option value="">Adicionar de um projeto...</option>${projetos.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select>
          <div style="margin-left:auto;font-size:18px;font-weight:900;color:var(--terracota)" id="v-total"></div>
        </div>
      </section>
      <section class="card">
        <h2>Pagamento</h2><p class="sub">Divida em sinal e saldo, ou receba à vista. Ao marcar como recebido, a taxa da forma de pagamento é descontada.</p>
        <div id="v-recs"></div>
        <div class="add-comp">
          <button type="button" class="botao sec peq" id="gerar-sinal">Sinal + saldo (${numero((estado.perfil || {}).sinal_pct ?? 50)}%)</button>
          <button type="button" class="botao sec peq" id="gerar-vista">À vista</button>
          <button type="button" class="botao texto peq" id="add-rec">+ Parcela</button>
        </div>
      </section>`;

    const caixaItens = document.getElementById('v-itens');
    const caixaRecs = document.getElementById('v-recs');
    const atTotal = () => { document.getElementById('v-total').textContent = 'Total: ' + moeda(total()); };
    const desenharItens = () => {
      caixaItens.innerHTML = ed.itens.map((it, i) => `<div class="grade g4" style="align-items:end;margin-top:10px" data-i="${i}">
        ${campo(i === 0 ? 'Peça' : '', `<input data-it="descricao" value="${esc(it.descricao)}" placeholder="Ex.: Hang plant médio">`)}
        ${campo(i === 0 ? 'Quantidade' : '', `<input type="number" step="any" data-it="quantidade" value="${it.quantidade ?? 1}">`)}
        ${campo(i === 0 ? 'Valor unitário' : '', `<div class="com-sufixo"><input type="number" step="any" data-it="valor_unitario" value="${it.valor_unitario ?? ''}"><span>R$</span></div>`)}
        <div><button type="button" class="botao texto peq" data-tirar-item>Remover</button></div></div>`).join('') || '<p class="ajuda">Nenhum item.</p>';
      caixaItens.querySelectorAll('[data-i]').forEach((row) => {
        const it = ed.itens[Number(row.dataset.i)];
        row.querySelectorAll('[data-it]').forEach((el) => el.addEventListener('input', () => { it[el.dataset.it] = el.type === 'number' ? valorNum(el.value) : el.value; atTotal(); }));
        row.querySelector('[data-tirar-item]').addEventListener('click', () => { ed.itens.splice(Number(row.dataset.i), 1); desenharItens(); atTotal(); });
      });
    };
    const desenharRecs = () => {
      caixaRecs.innerHTML = ed.recs.length ? `<div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
        <tbody>${ed.recs.map((r, i) => r.status === 'recebido'
          ? `<tr><td>${esc(r.descricao || 'Parcela ' + (i + 1))}</td><td>${dataBR(r.vencimento)}</td><td class="num">${moeda(r.valor)}</td>
              <td><span class="selo status-recebido">Recebido ${dataBR(r.recebido_em)}</span><br><span style="font-size:12px;color:var(--texto-2)">${esc(FORMAS[r.forma] || '')}${r.parcelas_cartao ? ' ' + r.parcelas_cartao + 'x' : ''} · líquido ${moeda(r.valor_liquido)}</span></td><td></td></tr>`
          : `<tr data-r="${i}"><td><input data-rc="descricao" value="${esc(r.descricao)}" style="border:1px solid #cfc4b2;border-radius:6px;padding:6px 8px;width:100%"></td>
              <td><input type="date" data-rc="vencimento" value="${esc(r.vencimento || '')}" style="border:1px solid #cfc4b2;border-radius:6px;padding:6px 8px"></td>
              <td class="num"><input type="number" step="any" data-rc="valor" value="${r.valor ?? ''}" style="border:1px solid #cfc4b2;border-radius:6px;padding:6px 8px;width:110px;text-align:right"></td>
              <td><span class="selo status-pendente">A receber</span></td>
              <td style="white-space:nowrap">${r.id ? '<button type="button" class="botao sec peq" data-receber>Recebi</button>' : '<span class="ajuda">salve para receber</span>'}<button type="button" class="botao texto peq" data-tirar-rec>Remover</button></td></tr>`).join('')}</tbody></table></div>
        ${Math.abs(ed.recs.reduce((s, r) => s + Number(r.valor || 0), 0) - total()) > 0.009 ? `<div class="aviso" style="margin-top:8px">As parcelas somam ${moeda(ed.recs.reduce((s, r) => s + Number(r.valor || 0), 0))}, diferente do total da venda.</div>` : ''}`
        : '<p class="ajuda" style="color:var(--texto-2)">Nenhuma parcela ainda.</p>';
      caixaRecs.querySelectorAll('[data-r]').forEach((row) => {
        const r = ed.recs[Number(row.dataset.r)];
        row.querySelectorAll('[data-rc]').forEach((el) => el.addEventListener('input', () => { r[el.dataset.rc] = el.type === 'number' ? valorNum(el.value) : el.value || null; }));
        row.querySelector('[data-tirar-rec]').addEventListener('click', async () => {
          if (r.id) { const x = await sb.from('recebimentos').delete().eq('id', r.id); if (x.error) return erro(x.error); }
          ed.recs.splice(Number(row.dataset.r), 1); desenharRecs();
        });
        const br = row.querySelector('[data-receber]');
        if (br) br.addEventListener('click', async () => { await salvarVenda(true); formReceber(r, () => App.paginas.venda().catch(erro)); });
      });
    };
    desenharItens(); desenharRecs(); atTotal();

    document.getElementById('v-cli').addEventListener('change', (e) => { v.cliente_id = e.target.value || null; });
    document.getElementById('v-data').addEventListener('input', (e) => { v.data = e.target.value; });
    document.getElementById('v-desc').addEventListener('input', (e) => { v.descricao = e.target.value; });
    document.getElementById('add-item').addEventListener('click', () => { ed.itens.push({ descricao: '', quantidade: 1, valor_unitario: 0 }); desenharItens(); });
    document.getElementById('add-proj').addEventListener('change', (e) => {
      const p = projetos.find((x) => x.id === e.target.value);
      if (!p) return;
      ed.itens = ed.itens.filter((i) => i.descricao || Number(i.valor_unitario));
      ed.itens.push({ projeto_id: p.id, descricao: p.nome, quantidade: 1, valor_unitario: (p.precificacoes && p.precificacoes[0] && Number(p.precificacoes[0].preco_final)) || 0 });
      e.target.value = ''; desenharItens(); atTotal();
    });
    const pendentesFora = () => ed.recs.filter((r) => r.status === 'recebido');
    document.getElementById('gerar-sinal').addEventListener('click', () => {
      const t = total() - pendentesFora().reduce((s, r) => s + Number(r.valor || 0), 0);
      const sinal = Number((estado.perfil || {}).sinal_pct ?? 50);
      const s1 = r2(t * sinal / 100);
      ed.recs = [...pendentesFora(), { numero: 1, descricao: `Sinal (${numero(sinal)}%)`, vencimento: hojeISO(), valor: s1, status: 'pendente' }, { numero: 2, descricao: 'Saldo na entrega', vencimento: null, valor: r2(t - s1), status: 'pendente' }];
      desenharRecs();
    });
    document.getElementById('gerar-vista').addEventListener('click', () => {
      const t = total() - pendentesFora().reduce((s, r) => s + Number(r.valor || 0), 0);
      ed.recs = [...pendentesFora(), { numero: 1, descricao: 'À vista', vencimento: hojeISO(), valor: r2(t), status: 'pendente' }];
      desenharRecs();
    });
    document.getElementById('add-rec').addEventListener('click', () => { ed.recs.push({ numero: ed.recs.length + 1, descricao: 'Parcela ' + (ed.recs.length + 1), vencimento: null, valor: 0, status: 'pendente' }); desenharRecs(); });

    async function salvarVenda(silencioso) {
      const bt = document.getElementById('bt-salvar-venda');
      bt.disabled = true;
      try {
        const dados = { cliente_id: v.cliente_id || null, data: v.data || hojeISO(), descricao: (v.descricao || '').trim() || null, valor_total: total() };
        let id = v.id;
        if (id) { const r = await sb.from('vendas').update(dados).eq('id', id); if (r.error) throw r.error; }
        else { const r = await sb.from('vendas').insert(dados).select('id').single(); if (r.error) throw r.error; id = r.data.id; v.id = id; }
        await sb.from('venda_itens').delete().eq('venda_id', id);
        const itens = ed.itens.filter((i) => i.descricao || Number(i.valor_unitario)).map((i) => ({ venda_id: id, projeto_id: i.projeto_id || null, descricao: i.descricao || null, quantidade: Number(i.quantidade) || 1, valor_unitario: Number(i.valor_unitario) || 0 }));
        if (itens.length) { const r = await sb.from('venda_itens').insert(itens); if (r.error) throw r.error; }
        // parcelas pendentes: regrava todas; recebidas ficam como estão
        await sb.from('recebimentos').delete().eq('venda_id', id).eq('status', 'pendente');
        const pend = ed.recs.filter((r) => r.status !== 'recebido').map((r, i) => ({ venda_id: id, numero: i + 1 + pendentesFora().length, descricao: r.descricao || null, vencimento: r.vencimento || null, valor: Number(r.valor) || 0 }));
        if (pend.length) { const r = await sb.from('recebimentos').insert(pend).select(); if (r.error) throw r.error; ed.recs = [...pendentesFora(), ...r.data]; }
        else ed.recs = pendentesFora();
        await atualizarStatusVenda(id);
        if (!silencioso) toast('Venda salva.');
        if (location.hash !== '#/venda/' + id) history.replaceState(null, '', '#/venda/' + id);
        return true;
      } catch (e) { erro(e); return false; } finally { bt.disabled = false; }
    }
    document.getElementById('bt-salvar-venda').addEventListener('click', async () => { if (!ed.itens.some((i) => i.descricao || Number(i.valor_unitario))) { toast('Adicione pelo menos uma peça.', true); return; } if (await salvarVenda()) App.paginas.venda().catch(erro); });
    const bc = document.getElementById('bt-cancelar');
    if (bc) bc.addEventListener('click', async () => {
      if (!confirm('Cancelar esta venda? As parcelas a receber deixam de contar.')) return;
      await sb.from('vendas').update({ status: 'cancelada' }).eq('id', v.id);
      await sb.from('recebimentos').delete().eq('venda_id', v.id).eq('status', 'pendente');
      toast('Venda cancelada.'); location.hash = '#/vendas';
    });
  }

  /* =================================================================
     Financeiro (painel do mês)
     ================================================================= */
  const mesISO = (d) => d.toISOString().slice(0, 7);
  const primeiroDia = (ym) => ym + '-01';
  const ultimoDia = (ym) => { const [a, m] = ym.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };

  async function gerarFixas(ym) {
    const { data: fixas } = await sb.from('despesas_fixas').select('*').eq('ativo', true);
    if (!fixas || !fixas.length) return;
    const { data: ja } = await sb.from('despesas').select('despesa_fixa_id').eq('mes_ref', primeiroDia(ym)).not('despesa_fixa_id', 'is', null);
    const tem = new Set((ja || []).map((x) => x.despesa_fixa_id));
    const [a, m] = ym.split('-').map(Number);
    const fim = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const novas = fixas.filter((f) => !tem.has(f.id) && f.criado_em.slice(0, 7) <= ym).map((f) => ({
      descricao: f.descricao, categoria_id: f.categoria_id, valor: f.valor, despesa_fixa_id: f.id, mes_ref: primeiroDia(ym),
      vencimento: `${ym}-${String(Math.min(f.dia_vencimento, fim)).padStart(2, '0')}`
    }));
    if (novas.length) await sb.from('despesas').upsert(novas, { onConflict: 'despesa_fixa_id,mes_ref', ignoreDuplicates: true });
  }

  App.paginas.financeiro = async function () {
    const ym = estado.mesFinanceiro || mesISO(new Date());
    estado.mesFinanceiro = ym;
    await gerarFixas(ym);
    const ini = primeiroDia(ym), fim = ultimoDia(ym), ano = ym.slice(0, 4);
    const [vendasAno, recsMes, pend, despMes, despPend, cats] = await Promise.all([
      sb.from('vendas').select('data, valor_total, status').gte('data', ano + '-01-01').lte('data', ano + '-12-31').neq('status', 'cancelada'),
      sb.from('recebimentos').select('*, vendas(descricao, clientes(nome))').eq('status', 'recebido').gte('recebido_em', ini).lte('recebido_em', fim),
      sb.from('recebimentos').select('*, vendas(descricao, status, clientes(nome))').eq('status', 'pendente').order('vencimento', { nullsFirst: false }),
      sb.from('despesas').select('*').gte('vencimento', ini).lte('vencimento', fim).order('vencimento'),
      sb.from('despesas').select('*').eq('status', 'pendente').lt('vencimento', ini),
      sb.from('categorias_financeiras').select('*').eq('ativo', true).order('ordem')
    ]);
    const categorias = cats.data || [];
    const catDe = (id) => categorias.find((c) => c.id === id) || {};
    const fatMes = (vendasAno.data || []).filter((v) => v.data >= ini && v.data <= fim).reduce((s, v) => s + Number(v.valor_total || 0), 0);
    const fatAno = (vendasAno.data || []).reduce((s, v) => s + Number(v.valor_total || 0), 0);
    const recebido = (recsMes.data || []).reduce((s, r) => s + Number(r.valor_liquido ?? r.valor ?? 0), 0);
    const taxas = (recsMes.data || []).reduce((s, r) => s + Number(r.valor || 0) - Number(r.valor_liquido ?? r.valor ?? 0), 0);
    const aReceber = (pend.data || []).filter((r) => !r.vendas || r.vendas.status !== 'cancelada');
    const despesas = despMes.data || [];
    const pagas = despesas.filter((d) => d.status === 'pago');
    const pagasDespesa = pagas.filter((d) => catDe(d.categoria_id).tipo !== 'retirada').reduce((s, d) => s + Number(d.valor || 0), 0);
    const prolabore = pagas.filter((d) => catDe(d.categoria_id).tipo === 'retirada').reduce((s, d) => s + Number(d.valor || 0), 0);
    const resultado = recebido - pagasDespesa;
    const porCat = {};
    pagas.filter((d) => catDe(d.categoria_id).tipo !== 'retirada').forEach((d) => { const n = catDe(d.categoria_id).nome || 'Sem categoria'; porCat[n] = (porCat[n] || 0) + Number(d.valor || 0); });
    const maxCat = Math.max(1, ...Object.values(porCat));
    const hoje = hojeISO();
    const nomeMes = (() => { const t = new Date(ini + 'T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); })();
    const atrasadas = despPend.data || [];

    area().innerHTML = `
      <div class="cabecalho">
        <div><h1>Financeiro</h1><p>Visão de caixa: conta quando o dinheiro entra ou sai de verdade.</p></div>
        <div class="acoes" style="margin:0;align-items:center">
          <button type="button" class="botao texto" id="mes-ant" aria-label="Mês anterior">←</button>
          <strong style="min-width:150px;text-align:center">${esc(nomeMes)}</strong>
          <button type="button" class="botao texto" id="mes-prox" aria-label="Próximo mês">→</button>
        </div>
      </div>
      <div class="indicadores" style="margin-top:0">
        <div class="indicador"><div class="rot">Recebido (líquido)${App.dica('O que entrou de fato no mês, já sem as taxas da maquininha.')}</div><div class="val" style="font-size:22px">${moeda(recebido)}</div>${taxas ? `<div style="font-size:12px;color:var(--texto-2)">taxas: ${moeda(taxas)}</div>` : ''}</div>
        <div class="indicador"><div class="rot">Despesas pagas</div><div class="val" style="font-size:22px">${moeda(pagasDespesa)}</div></div>
        <div class="indicador"><div class="rot">Resultado do ateliê${App.dica('Recebido menos despesas pagas no mês. É o que o ateliê gerou, antes do seu pró-labore.')}</div><div class="val" style="font-size:22px;color:${resultado < 0 ? 'var(--perigo)' : 'var(--ok)'}">${moeda(resultado)}</div></div>
        <div class="indicador"><div class="rot">Pró-labore retirado</div><div class="val" style="font-size:22px">${moeda(prolabore)}</div><div style="font-size:12px;color:var(--texto-2)">sobra: ${moeda(resultado - prolabore)}</div></div>
      </div>
      <div class="indicadores">
        <div class="indicador"><div class="rot">Vendido no mês${App.dica('Soma das vendas feitas no mês, recebidas ou não.')}</div><div class="val" style="font-size:20px">${moeda(fatMes)}</div></div>
        <div class="indicador"><div class="rot">A receber</div><div class="val" style="font-size:20px">${moeda(aReceber.reduce((s, r) => s + Number(r.valor || 0), 0))}</div></div>
        <div class="indicador"><div class="rot">Vendido em ${ano}${App.dica('Acompanhe junto com o teto de faturamento do MEI.')}</div><div class="val" style="font-size:20px">${moeda(fatAno)}</div></div>
      </div>

      <div class="grade g2" style="margin-top:20px;align-items:start">
        <section class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2>Despesas do mês</h2>
            <div class="acoes" style="margin:0"><button type="button" class="botao texto peq" id="bt-fixas">Despesas fixas</button><button type="button" class="botao sec peq" id="bt-prolabore">+ Pró-labore</button><button type="button" class="botao peq" id="bt-despesa">+ Despesa</button></div></div>
          ${atrasadas.length ? `<div class="aviso" style="margin-top:10px">${atrasadas.length} despesa(s) de meses anteriores ainda não paga(s): ${moeda(atrasadas.reduce((s, d) => s + Number(d.valor || 0), 0))}.</div>` : ''}
          ${despesas.length ? `<div class="linhas" style="margin-top:12px">${despesas.map((d) => `<div style="align-items:center;padding:6px 0;border-bottom:1px solid var(--linha)">
            <span>${esc(d.descricao)}<br><span style="font-size:12px;color:var(--texto-2);font-weight:400">${esc(catDe(d.categoria_id).nome || '')} · ${d.status === 'pago' ? 'pago em ' + dataBR(d.pago_em) : `<span class="${d.vencimento < hoje ? 'atrasado' : ''}">vence ${dataBR(d.vencimento)}</span>`}</span></span>
            <span style="display:flex;gap:6px;align-items:center">${moeda(d.valor)}${d.status === 'pendente' ? `<button type="button" class="botao sec peq" data-pagar="${d.id}">Paguei</button>` : ''}<button type="button" class="botao texto peq" data-editar-desp="${d.id}">Editar</button></span></div>`).join('')}</div>` : '<p class="ajuda" style="color:var(--texto-2);margin-top:12px">Nenhuma despesa neste mês.</p>'}
          ${Object.keys(porCat).length ? `<h3 style="margin:18px 0 8px">Para onde foi o dinheiro</h3>${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<div style="display:grid;grid-template-columns:130px 1fr 90px;gap:8px;align-items:center;font-size:13px;margin-bottom:6px"><span>${esc(n)}</span><span style="background:var(--creme-2);border-radius:4px;height:12px"><span style="display:block;height:12px;border-radius:4px;background:var(--terracota);width:${(v / maxCat) * 100}%"></span></span><span style="text-align:right;font-weight:700">${moeda(v)}</span></div>`).join('')}` : ''}
        </section>
        <section class="card">
          <h2>A receber</h2>
          ${aReceber.length ? `<div class="linhas" style="margin-top:12px">${aReceber.map((r) => `<div style="align-items:center;padding:6px 0;border-bottom:1px solid var(--linha)">
            <span><a href="#/venda/${r.venda_id}">${esc((r.vendas && r.vendas.clientes && r.vendas.clientes.nome) || (r.vendas && r.vendas.descricao) || 'Venda')}</a><br><span style="font-size:12px;color:var(--texto-2);font-weight:400">${esc(r.descricao || '')} · ${r.vencimento ? `<span class="${r.vencimento < hoje ? 'atrasado' : ''}">vence ${dataBR(r.vencimento)}</span>` : 'sem data'}</span></span>
            <span style="display:flex;gap:6px;align-items:center">${moeda(r.valor)}<button type="button" class="botao sec peq" data-receber="${r.id}">Recebi</button></span></div>`).join('')}</div>` : '<p class="ajuda" style="color:var(--texto-2);margin-top:12px">Nada a receber.</p>'}
          <h2 style="margin-top:22px">Recebido no mês</h2>
          ${(recsMes.data || []).length ? `<div class="linhas" style="margin-top:12px">${recsMes.data.map((r) => `<div style="padding:6px 0;border-bottom:1px solid var(--linha)"><span>${esc((r.vendas && r.vendas.clientes && r.vendas.clientes.nome) || (r.vendas && r.vendas.descricao) || 'Venda')}<br><span style="font-size:12px;color:var(--texto-2);font-weight:400">${dataBR(r.recebido_em)} · ${esc(FORMAS[r.forma] || '')}${r.parcelas_cartao ? ' ' + r.parcelas_cartao + 'x' : ''}${Number(r.taxa_pct) ? ` · taxa ${numero(r.taxa_pct)}%` : ''}</span></span><span>${moeda(r.valor_liquido ?? r.valor)}</span></div>`).join('')}</div>` : '<p class="ajuda" style="color:var(--texto-2);margin-top:12px">Nada recebido neste mês.</p>'}
        </section>
      </div>`;

    const mudarMes = (delta) => { const [a, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + delta, 1)); estado.mesFinanceiro = d.toISOString().slice(0, 7); App.paginas.financeiro().catch(erro); };
    document.getElementById('mes-ant').addEventListener('click', () => mudarMes(-1));
    document.getElementById('mes-prox').addEventListener('click', () => mudarMes(1));
    const recarregar = () => App.paginas.financeiro().catch(erro);
    document.getElementById('bt-despesa').addEventListener('click', () => formDespesa(null, categorias.filter((c) => c.tipo === 'despesa'), recarregar));
    document.getElementById('bt-prolabore').addEventListener('click', () => formDespesa({ descricao: 'Pró-labore', categoria_id: (categorias.find((c) => c.tipo === 'retirada') || {}).id, status: 'pago', vencimento: hoje, pago_em: hoje }, categorias.filter((c) => c.tipo === 'retirada'), recarregar, true));
    document.getElementById('bt-fixas').addEventListener('click', () => gerenciarFixas(categorias.filter((c) => c.tipo === 'despesa'), recarregar));
    area().querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', async () => {
      const r = await sb.from('despesas').update({ status: 'pago', pago_em: hojeISO() }).eq('id', b.dataset.pagar);
      if (r.error) return erro(r.error);
      toast('Despesa paga.'); recarregar();
    }));
    area().querySelectorAll('[data-editar-desp]').forEach((b) => b.addEventListener('click', () => {
      const d = despesas.find((x) => x.id === b.dataset.editarDesp);
      const ret = catDe(d.categoria_id).tipo === 'retirada';
      formDespesa(d, categorias.filter((c) => c.tipo === (ret ? 'retirada' : 'despesa')), recarregar, ret);
    }));
    area().querySelectorAll('[data-receber]').forEach((b) => b.addEventListener('click', () => formReceber(aReceber.find((r) => r.id === b.dataset.receber), recarregar)));
  };

  async function formDespesa(d, categorias, aoSalvar, retirada) {
    d = d || { vencimento: hojeISO(), status: 'pendente' };
    const { data: materiais } = await sb.from('materiais').select('id, descricao, marca, cor, espessura_mm, unidade_consumo, tipo_material_id').eq('ativo', true);
    const catMaterial = categorias.find((c) => /material/i.test(c.nome));
    abrirModal({
      titulo: retirada ? 'Pró-labore' : d.id ? 'Editar despesa' : 'Nova despesa',
      corpo: `
        ${retirada ? '<p class="ajuda" style="margin:0 0 12px;color:var(--texto-2)">Dinheiro que você tira do ateliê para você. Fica separado das despesas.</p>' : ''}
        <div class="grade g2">
          ${campo('Descrição', `<input name="descricao" value="${esc(d.descricao)}" required>`)}
          ${retirada ? `<input type="hidden" name="categoria_id" value="${esc(d.categoria_id || '')}">` : campo('Categoria', `<select name="categoria_id"><option value="">Escolha...</option>${opcoesLista(categorias, d.categoria_id)}</select>`)}
          ${campo('Valor', `<div class="com-sufixo"><input type="number" step="any" name="valor" value="${d.valor ?? ''}"><span>R$</span></div>`)}
          ${campo(retirada ? 'Data' : 'Vencimento', `<input type="date" name="vencimento" value="${esc(d.vencimento || hojeISO())}">`)}
        </div>
        ${retirada ? '<input type="hidden" name="pago" value="on">' : `<label style="display:flex;gap:8px;align-items:center;margin-top:14px"><input type="checkbox" name="pago" ${d.status === 'pago' ? 'checked' : ''}> Já paguei</label>`}
        ${!retirada && !d.id ? `<div id="bloco-material" style="margin-top:14px;display:none"><div class="grade g2">
          ${campo('Material comprado', `<select name="material_id"><option value="">Não somar no estoque</option>${opcoesLista(materiais || [], null, (m) => [App.nomeTipo(m.tipo_material_id), m.espessura_mm ? m.espessura_mm + ' mm' : '', m.cor, m.marca].filter(Boolean).join(' · '))}</select>`, '', 'Escolha o material para somar a quantidade comprada no estoque.')}
          ${campo('Quantidade comprada', `<input type="number" step="any" name="quantidade_material" placeholder="metros, gramas ou unidades">`)}
        </div></div>` : ''}`,
      aoAbrir: (form) => {
        const bloco = document.getElementById('bloco-material');
        if (bloco && form.categoria_id) {
          const ver = () => { bloco.style.display = catMaterial && form.categoria_id.value === catMaterial.id ? 'block' : 'none'; };
          form.categoria_id.addEventListener('change', ver); ver();
        }
      },
      aoSalvar: async (f) => {
        const pago = f.get('pago') === 'on';
        const dados = { descricao: (f.get('descricao') || '').trim(), categoria_id: f.get('categoria_id') || null, valor: valorNum(f.get('valor')) || 0, vencimento: f.get('vencimento') || hojeISO(), status: pago ? 'pago' : 'pendente', pago_em: pago ? d.pago_em || f.get('vencimento') || hojeISO() : null };
        if (!dados.descricao || !dados.valor) throw new Error('Informe a descrição e o valor.');
        const matId = f.get('material_id'), qtd = valorNum(f.get('quantidade_material'));
        if (matId && qtd) { dados.material_id = matId; dados.quantidade_material = qtd; }
        const r = d.id ? await sb.from('despesas').update(dados).eq('id', d.id) : await sb.from('despesas').insert(dados);
        if (r.error) throw r.error;
        if (!d.id && matId && qtd) {
          const { data: m } = await sb.from('materiais').select('estoque_atual').eq('id', matId).single();
          await sb.from('materiais').update({ estoque_atual: Number((m && m.estoque_atual) || 0) + qtd }).eq('id', matId);
        }
        toast(retirada ? 'Pró-labore registrado.' : 'Despesa salva.');
        aoSalvar && aoSalvar();
      }
    });
  }

  async function gerenciarFixas(categorias, aoFechar) {
    const { data } = await sb.from('despesas_fixas').select('*').order('descricao');
    const fixas = data || [];
    abrirModal({
      titulo: 'Despesas fixas',
      textoSalvar: 'Adicionar',
      corpo: `
        <p class="ajuda" style="margin:0 0 12px;color:var(--texto-2)">Contas que se repetem todo mês: energia, internet, aluguel, DAS do MEI. Elas entram sozinhas no financeiro de cada mês.</p>
        ${fixas.length ? `<div class="linhas" style="margin-bottom:16px">${fixas.map((f) => `<div style="align-items:center;padding:6px 0;border-bottom:1px solid var(--linha);${f.ativo ? '' : 'opacity:.5'}"><span>${esc(f.descricao)}<br><span style="font-size:12px;color:var(--texto-2);font-weight:400">dia ${f.dia_vencimento} · ${esc((categorias.find((c) => c.id === f.categoria_id) || {}).nome || '')}</span></span><span style="display:flex;gap:6px;align-items:center">${moeda(f.valor)}<button type="button" class="botao texto peq" data-alt-fixa="${f.id}" data-ativo="${f.ativo}">${f.ativo ? 'Parar' : 'Retomar'}</button></span></div>`).join('')}
          <div class="total"><span>Total por mês</span><span>${moeda(fixas.filter((f) => f.ativo).reduce((s, f) => s + Number(f.valor || 0), 0))}</span></div></div>` : ''}
        <h3 style="margin:0 0 8px">Nova despesa fixa</h3>
        <div class="grade g2">
          ${campo('Descrição', '<input name="descricao" placeholder="Ex.: Internet">')}
          ${campo('Categoria', `<select name="categoria_id">${opcoesLista(categorias, (categorias.find((c) => /fixo/i.test(c.nome)) || {}).id)}</select>`)}
          ${campo('Valor por mês', '<div class="com-sufixo"><input type="number" step="any" name="valor"><span>R$</span></div>')}
          ${campo('Dia do vencimento', '<input type="number" name="dia_vencimento" min="1" max="31" value="10">')}
        </div>`,
      aoAbrir: (form) => {
        form.querySelectorAll('[data-alt-fixa]').forEach((b) => b.addEventListener('click', async () => {
          await sb.from('despesas_fixas').update({ ativo: b.dataset.ativo !== 'true' }).eq('id', b.dataset.altFixa);
          form.closest('.fundo-modal').remove(); gerenciarFixas(categorias, aoFechar);
        }));
      },
      aoSalvar: async (f) => {
        const dados = { descricao: (f.get('descricao') || '').trim(), categoria_id: f.get('categoria_id') || null, valor: valorNum(f.get('valor')) || 0, dia_vencimento: Math.min(31, Math.max(1, Number(f.get('dia_vencimento')) || 10)) };
        if (!dados.descricao || !dados.valor) throw new Error('Informe a descrição e o valor.');
        const r = await sb.from('despesas_fixas').insert(dados);
        if (r.error) throw r.error;
        toast('Despesa fixa adicionada.');
        aoFechar && aoFechar();
      }
    });
  }
})();
