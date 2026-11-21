/* =====================================================================
   Peças prontas: o que a artesã já tem (portfólio de produtos e estoque)
   - Cadastro com fotos, preço, custo e quantidade
   - Entradas (produção, ajuste, devolução) e histórico
   - Vender: cria a venda, o recebimento e dá baixa no estoque
   ===================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { sb, estado, esc, moeda, numero, valorNum, toast, erro, abrirModal, campo, opcoes, opcoesLista, area } = App;

  const FORMAS = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferência', outro: 'Outro' };
  const TIPOS_MOV = { inicial: 'Estoque inicial', producao: 'Produzi mais', venda: 'Venda', ajuste: 'Ajuste', devolucao: 'Devolução' };
  const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  const fotoDe = (p) => ((p.fotos || [])[0] || {}).url || '';
  const nomeCompleto = (p) => p.nome + (p.variacao ? ' · ' + p.variacao : '');

  async function categorias() {
    const { data } = await sb.from('categorias').select('id, nome').eq('ativo', true).order('ordem').order('nome');
    return data || [];
  }

  /* ---------------- Lista ---------------- */
  App.paginas.pecas = async function () {
    const [{ data, error }, cats] = await Promise.all([
      sb.from('pecas').select('*').eq('ativo', true).order('nome'),
      categorias()
    ]);
    if (error) throw error;
    const todas = data || [];
    const f = estado.filtroPecas || (estado.filtroPecas = { busca: '', cat: '', soEstoque: false });
    const lista = todas.filter((p) => (!f.busca || [p.nome, p.variacao, p.descricao].join(' ').toLowerCase().includes(f.busca.toLowerCase()))
      && (!f.cat || p.categoria_id === f.cat) && (!f.soEstoque || Number(p.quantidade) > 0));
    const qtd = todas.reduce((s, p) => s + Math.max(0, Number(p.quantidade)), 0);
    const valor = todas.reduce((s, p) => s + Math.max(0, Number(p.quantidade)) * Number(p.preco_venda || 0), 0);
    const custo = todas.reduce((s, p) => s + Math.max(0, Number(p.quantidade)) * Number(p.custo_unitario || 0), 0);
    const nomeCat = (id) => (cats.find((c) => c.id === id) || {}).nome || '';
    area().innerHTML = `
      <div class="cabecalho">
        <div><h1>Peças prontas</h1><p>O que você já tem feito: seu portfólio de produtos e o estoque para vender.</p></div>
        <button type="button" class="botao" id="nova-peca">+ Nova peça</button>
      </div>
      <div class="indicadores" style="margin-top:0">
        <div class="indicador"><div class="rot">Peças em estoque</div><div class="val">${numero(qtd, 0)}</div></div>
        <div class="indicador"><div class="rot">Valor de venda${App.dica('Quanto você recebe se vender tudo o que está em estoque, pelo preço cadastrado.')}</div><div class="val" style="font-size:22px">${moeda(valor)}</div></div>
        <div class="indicador"><div class="rot">Custo do estoque${App.dica('Quanto custou produzir as peças que estão paradas.')}</div><div class="val" style="font-size:22px">${moeda(custo)}</div></div>
        <div class="indicador"><div class="rot">Modelos</div><div class="val">${todas.length}</div></div>
      </div>
      <div style="display:flex;gap:12px;align-items:center;margin:20px 0 14px;flex-wrap:wrap">
        <div class="campo" style="flex:1;min-width:200px"><input id="pc-busca" placeholder="Buscar peça" value="${esc(f.busca)}"></div>
        <div class="campo" style="min-width:180px"><select id="pc-cat"><option value="">Todos os tipos</option>${opcoesLista(cats, f.cat)}</select></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--texto-2)"><input type="checkbox" id="pc-estoque" ${f.soEstoque ? 'checked' : ''}> Só com estoque</label>
      </div>
      ${lista.length ? `<div class="pecas-grade">${lista.map((p) => {
        const q = Number(p.quantidade);
        const selo = q <= 0 ? '<span class="selo status-cancelada">Esgotada</span>' : Number(p.estoque_minimo) > 0 && q <= Number(p.estoque_minimo) ? '<span class="selo status-pendente">Acabando</span>' : '';
        return `<article class="peca-card">
          <div class="peca-foto">${fotoDe(p) ? `<img src="${esc(fotoDe(p))}" alt="${esc(p.nome)}">` : '<span>Sem foto</span>'}</div>
          <div class="peca-info">
            <strong>${esc(p.nome)}</strong>
            <span class="peca-sub">${esc([p.variacao, nomeCat(p.categoria_id)].filter(Boolean).join(' · ') || ' ')}</span>
            <div class="peca-linha"><span class="peca-preco">${moeda(p.preco_venda)}</span><span>${numero(q, 0)} em estoque ${selo}</span></div>
          </div>
          <div class="peca-acoes">
            <button type="button" class="botao peq" data-vender="${p.id}" ${q <= 0 ? 'disabled' : ''}>Vender</button>
            <button type="button" class="botao sec peq" data-entrada="${p.id}">+ Entrada</button>
            <button type="button" class="botao texto peq" data-editar="${p.id}">Editar</button>
            <button type="button" class="botao texto peq" data-hist="${p.id}">Histórico</button>
          </div>
        </article>`;
      }).join('')}</div>` : `<div class="vazio">${todas.length ? 'Nenhuma peça com esse filtro.' : 'Nenhuma peça ainda. Cadastre o que você já tem pronto: cada modelo com foto, preço e quantidade.'}</div>`}`;
    const recarregar = () => App.paginas.pecas().catch(erro);
    const achar = (id) => todas.find((p) => p.id === id);
    document.getElementById('nova-peca').addEventListener('click', () => formPeca(null, cats, recarregar));
    const busca = document.getElementById('pc-busca');
    busca.addEventListener('input', () => { f.busca = busca.value; clearTimeout(busca._t); busca._t = setTimeout(() => recarregar().then?.(() => { const n = document.getElementById('pc-busca'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }), 250); });
    document.getElementById('pc-cat').addEventListener('change', (e) => { f.cat = e.target.value; recarregar(); });
    document.getElementById('pc-estoque').addEventListener('change', (e) => { f.soEstoque = e.target.checked; recarregar(); });
    area().querySelectorAll('[data-vender]').forEach((b) => b.addEventListener('click', () => venderPeca(achar(b.dataset.vender), recarregar)));
    area().querySelectorAll('[data-entrada]').forEach((b) => b.addEventListener('click', () => entradaPeca(achar(b.dataset.entrada), recarregar)));
    area().querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => formPeca(achar(b.dataset.editar), cats, recarregar)));
    area().querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', () => historicoPeca(achar(b.dataset.hist))));
  };

  /* ---------------- Cadastro ---------------- */
  async function formPeca(p, cats, aoSalvar) {
    cats = cats || (await categorias());
    p = p || { quantidade: 0, fotos: [] };
    let fotos = [...(p.fotos || [])];
    abrirModal({
      titulo: p.id ? 'Editar peça' : 'Nova peça pronta',
      corpo: `
        <div class="grade g2">
          ${campo('Nome', `<input name="nome" value="${esc(p.nome)}" required placeholder="Ex.: Hang plant médio">`)}
          ${campo('Tipo de peça', `<select name="categoria_id"><option value="">Escolha...</option>${opcoesLista(cats, p.categoria_id)}</select>`)}
          ${campo('Variação', `<input name="variacao" value="${esc(p.variacao)}" placeholder="Ex.: cru, 80 cm">`, '', 'Cor, tamanho ou modelo. Cada variação com preço ou estoque diferente vira uma peça separada.')}
          ${campo('Preço de venda', `<div class="com-sufixo"><input type="number" step="any" name="preco_venda" value="${p.preco_venda ?? ''}"><span>R$</span></div>`)}
          ${campo('Custo por peça', `<div class="com-sufixo"><input type="number" step="any" name="custo_unitario" value="${p.custo_unitario ?? ''}"><span>R$</span></div>`, '', 'Material + horas de trabalho de uma peça. Se a peça veio de um projeto, já vem preenchido.')}
          ${p.id ? campo('Em estoque', `<input value="${numero(p.quantidade, 0)}" disabled>`, 'Para mudar, use + Entrada ou Vender.') : campo('Quantas você tem hoje', '<input type="number" step="1" min="0" name="quantidade" value="1">')}
          ${campo('Avisar quando ficar abaixo de', `<input type="number" step="1" min="0" name="estoque_minimo" value="${p.estoque_minimo ?? 0}">`)}
        </div>
        <div style="margin-top:14px">${campo('Descrição', `<textarea name="descricao" rows="2" placeholder="Materiais, medidas, cuidados...">${esc(p.descricao)}</textarea>`)}</div>
        <div class="campo" style="margin-top:14px"><label>Fotos</label>
          <div><input type="file" id="pc-fotos" accept="image/*" multiple class="sr-only"><label for="pc-fotos" class="botao sec peq">Adicionar fotos</label></div>
          <div class="miniaturas" id="pc-mini"></div></div>
        <div class="calculo" id="pc-margem" style="margin-top:12px"></div>`,
      aoAbrir: (form) => {
        const mini = document.getElementById('pc-mini');
        const desenhar = () => {
          mini.innerHTML = fotos.map((ft, i) => `<div class="foto" style="width:90px"><img src="${esc(ft.url)}" alt=""><button type="button" data-tirar="${i}">Remover</button></div>`).join('');
          mini.querySelectorAll('[data-tirar]').forEach((b) => b.addEventListener('click', () => { fotos.splice(Number(b.dataset.tirar), 1); desenhar(); }));
        };
        desenhar();
        document.getElementById('pc-fotos').addEventListener('change', async (ev) => {
          const uid = estado.sessao.user.id;
          for (const arq of Array.from(ev.target.files || [])) {
            if (arq.size > 8 * 1024 * 1024) { toast(`"${arq.name}" passa de 8 MB.`, true); continue; }
            const ext = (arq.name.split('.').pop() || 'jpg').toLowerCase();
            const path = `${uid}/pecas/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
            const up = await sb.storage.from('portfolio').upload(path, arq, { contentType: arq.type });
            if (up.error) { erro(up.error); continue; }
            fotos.push({ path, url: sb.storage.from('portfolio').getPublicUrl(path).data.publicUrl });
          }
          ev.target.value = '';
          desenhar();
        });
        const margem = () => {
          const pv = valorNum(form.preco_venda.value) || 0, c = valorNum(form.custo_unitario.value) || 0;
          const tx = Number((estado.perfil || {}).taxa_maquininha_pct || 0) + Number((estado.perfil || {}).imposto_pct || 0);
          const lucro = pv * (1 - tx / 100) - c;
          document.getElementById('pc-margem').innerHTML = pv ? `Lucro por peça, tirando taxa e imposto: <strong>${moeda(lucro)}</strong>${pv ? ` (${numero((lucro / pv) * 100, 1)}%)` : ''}${lucro < 0 ? ' · <span style="color:var(--perigo)">prejuízo</span>' : ''}` : 'Preencha o preço para ver o lucro por peça.';
        };
        form.addEventListener('input', margem); margem();
      },
      aoSalvar: async (d) => {
        const t = (k) => (d.get(k) || '').trim() || null;
        const dados = { nome: t('nome'), categoria_id: t('categoria_id'), variacao: t('variacao'), descricao: t('descricao'), preco_venda: valorNum(d.get('preco_venda')) || 0, custo_unitario: valorNum(d.get('custo_unitario')) || 0, estoque_minimo: valorNum(d.get('estoque_minimo')) || 0, fotos };
        if (!dados.nome) throw new Error('Informe o nome da peça.');
        if (p.projeto_id && !p.id) dados.projeto_id = p.projeto_id;
        if (p.id) { const r = await sb.from('pecas').update(dados).eq('id', p.id); if (r.error) throw r.error; }
        else {
          const r = await sb.from('pecas').insert(dados).select('id').single();
          if (r.error) throw r.error;
          const q = Math.max(0, Math.round(valorNum(d.get('quantidade')) || 0));
          if (q) { const m = await sb.from('movimentos_pecas').insert({ peca_id: r.data.id, tipo: 'inicial', quantidade: q }); if (m.error) throw m.error; }
        }
        toast('Peça salva.');
        aoSalvar && aoSalvar();
      }
    });
  }
  App.formPeca = formPeca;

  // Projeto concluído vira peça pronta
  App.novaPecaDoProjeto = async function (pj, resultadoPreco) {
    const cats = await categorias();
    formPeca({ nome: pj.nome, categoria_id: pj.categoria_id, projeto_id: pj.id, preco_venda: resultadoPreco ? resultadoPreco.preco_final : 0, custo_unitario: resultadoPreco ? resultadoPreco.custo_total : 0, descricao: pj.descricao_livre || '', fotos: [], quantidade: 0 }, cats, () => { location.hash = '#/pecas'; });
  };

  /* ---------------- Entrada ---------------- */
  function entradaPeca(p, aoSalvar) {
    abrirModal({
      titulo: 'Entrada de estoque',
      corpo: `<p style="margin:0 0 12px"><strong>${esc(nomeCompleto(p))}</strong> · hoje: ${numero(p.quantidade, 0)}</p>
        <div class="grade g2">
          ${campo('O que aconteceu', `<select name="tipo">${opcoes({ producao: 'Produzi mais', devolucao: 'Devolução de cliente', ajuste: 'Ajuste (contagem)' }, 'producao')}</select>`)}
          ${campo('Quantidade', '<input type="number" step="1" name="quantidade" value="1">', 'No ajuste, use número negativo para tirar (ex.: peça danificada).')}
        </div>
        <div style="margin-top:12px">${campo('Observação', '<input name="observacao">')}</div>`,
      aoSalvar: async (d) => {
        const q = Math.round(valorNum(d.get('quantidade')) || 0);
        if (!q) throw new Error('Informe a quantidade.');
        if (d.get('tipo') !== 'ajuste' && q < 0) throw new Error('Para tirar peças, use Ajuste ou Vender.');
        const r = await sb.from('movimentos_pecas').insert({ peca_id: p.id, tipo: d.get('tipo'), quantidade: q, observacao: (d.get('observacao') || '').trim() || null });
        if (r.error) throw r.error;
        toast('Estoque atualizado.');
        aoSalvar && aoSalvar();
      }
    });
  }

  /* ---------------- Vender ---------------- */
  async function venderPeca(p, aoSalvar) {
    const { data: clientes } = await sb.from('clientes').select('id, nome').eq('ativo', true).order('nome');
    const maxParc = Math.max(1, (((estado.perfil || {}).taxas_pagamento || {}).credito || []).length);
    abrirModal({
      titulo: 'Vender',
      textoSalvar: 'Registrar venda',
      corpo: `<p style="margin:0 0 12px"><strong>${esc(nomeCompleto(p))}</strong> · ${numero(p.quantidade, 0)} em estoque</p>
        <div class="grade g3">
          ${campo('Quantidade', `<input type="number" step="1" min="1" name="quantidade" value="1">`)}
          ${campo('Valor por peça', `<div class="com-sufixo"><input type="number" step="any" name="valor" value="${p.preco_venda ?? ''}"><span>R$</span></div>`, '', 'Já vem com o preço cadastrado. Mude se der desconto.')}
          ${campo('Cliente', `<select name="cliente_id"><option value="">Consumidor final</option>${opcoesLista(clientes || [], null)}</select>`)}
        </div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:14px"><input type="checkbox" name="recebido" checked> Já recebi o pagamento</label>
        <div class="grade g3" style="margin-top:10px" id="bloco-pag">
          ${campo('Forma', `<select name="forma">${opcoes(FORMAS, 'pix')}</select>`)}
          ${campo('Parcelas', `<select name="parcelas">${Array.from({ length: maxParc }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select>`)}
          ${campo('Data', `<input type="date" name="data" value="${hojeISO()}">`)}
        </div>
        <div class="calculo" id="calc-venda" style="margin-top:12px"></div>`,
      aoAbrir: (form) => {
        const att = () => {
          const q = Math.max(1, Math.round(valorNum(form.quantidade.value) || 1)), v = valorNum(form.valor.value) || 0, total = q * v;
          const rec = form.recebido.checked;
          form.parcelas.closest('.campo').style.visibility = rec && form.forma.value === 'credito' ? 'visible' : 'hidden';
          form.forma.closest('.campo').style.visibility = rec ? 'visible' : 'hidden';
          const tx = rec ? App.taxaDe(form.forma.value, Number(form.parcelas.value)) : 0;
          const aviso = q > Number(p.quantidade) ? `<br><span style="color:var(--perigo)">Você tem só ${numero(p.quantidade, 0)} em estoque.</span>` : '';
          document.getElementById('calc-venda').innerHTML = `Total: <strong>${moeda(total)}</strong>${rec ? ` · taxa ${numero(tx)}% · você recebe <strong>${moeda(total - total * tx / 100)}</strong>` : ' · fica em A receber'}${aviso}`;
        };
        form.addEventListener('input', att); form.addEventListener('change', att); att();
      },
      aoSalvar: async (d) => {
        const q = Math.max(1, Math.round(valorNum(d.get('quantidade')) || 1));
        const v = valorNum(d.get('valor')) || 0, total = r2(q * v);
        if (q > Number(p.quantidade) && !confirm(`Você tem só ${numero(p.quantidade, 0)} em estoque. Registrar a venda mesmo assim?`)) return false;
        const data = d.get('data') || hojeISO();
        const venda = await sb.from('vendas').insert({ cliente_id: d.get('cliente_id') || null, data, descricao: nomeCompleto(p) + (q > 1 ? ` (${q})` : ''), valor_total: total }).select('id').single();
        if (venda.error) throw venda.error;
        const vid = venda.data.id;
        const it = await sb.from('venda_itens').insert({ venda_id: vid, peca_id: p.id, descricao: nomeCompleto(p), quantidade: q, valor_unitario: v });
        if (it.error) throw it.error;
        const recebido = d.get('recebido') === 'on';
        const forma = recebido ? d.get('forma') : null;
        const parcelas = forma === 'credito' ? Number(d.get('parcelas')) : null;
        const tx = recebido ? App.taxaDe(forma, parcelas) : 0;
        const rec = await sb.from('recebimentos').insert(recebido
          ? { venda_id: vid, numero: 1, descricao: 'Pagamento', vencimento: data, valor: total, status: 'recebido', recebido_em: data, forma, parcelas_cartao: parcelas, taxa_pct: tx, valor_liquido: r2(total - total * tx / 100) }
          : { venda_id: vid, numero: 1, descricao: 'A receber', vencimento: null, valor: total });
        if (rec.error) throw rec.error;
        const mv = await sb.from('movimentos_pecas').insert({ peca_id: p.id, tipo: 'venda', quantidade: -q, venda_id: vid });
        if (mv.error) throw mv.error;
        if (recebido) await sb.from('vendas').update({ status: 'quitada' }).eq('id', vid);
        toast(`Venda registrada${recebido ? ' e recebida' : ''}. Estoque atualizado.`);
        aoSalvar && aoSalvar();
      }
    });
  }

  /* ---------------- Histórico ---------------- */
  async function historicoPeca(p) {
    const { data } = await sb.from('movimentos_pecas').select('*').eq('peca_id', p.id).order('criado_em', { ascending: false }).limit(100);
    abrirModal({
      titulo: 'Histórico · ' + nomeCompleto(p),
      textoSalvar: 'Fechar',
      corpo: (data || []).length ? `<div class="linhas">${data.map((m) => `<div style="padding:6px 0;border-bottom:1px solid var(--linha)"><span>${esc(TIPOS_MOV[m.tipo] || m.tipo)}${m.venda_id ? ` · <a href="#/venda/${m.venda_id}">ver venda</a>` : ''}<br><span style="font-size:12px;color:var(--texto-2);font-weight:400">${new Date(m.criado_em).toLocaleDateString('pt-BR')}${m.observacao ? ' · ' + esc(m.observacao) : ''}</span></span><span style="color:${Number(m.quantidade) < 0 ? 'var(--perigo)' : 'var(--ok)'}">${Number(m.quantidade) > 0 ? '+' : ''}${numero(m.quantidade, 0)}</span></div>`).join('')}</div>` : '<p class="ajuda">Sem movimentos.</p>',
      aoSalvar: async () => true
    });
  }
})();
