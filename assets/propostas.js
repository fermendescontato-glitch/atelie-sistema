/* =====================================================================
   Propostas: lista, montagem e impressão (PDF) com a marca da artesã.
   Regras para o cliente: material arredondado para cima, sem passagem
   das cordas e sem espaçamento de ganchos.
   ===================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { sb, estado, esc, moeda, numero, valorNum, toast, erro, campo, opcoes, opcoesLista, area } = App;

  const STATUS = { rascunho: 'Rascunho', enviada: 'Enviada', aceita: 'Aceita', recusada: 'Recusada', expirada: 'Expirada' };
  const DESLOC = { nenhum: 'Sem deslocamento', incluso: 'Incluso no valor (só o texto)', separado: 'Valor separado' };

  async function textosPadrao() {
    const { data } = await sb.from('textos_padrao').select('*').eq('ativo', true);
    const t = {};
    (data || []).sort((a, b) => (a.artesa_id ? 1 : 0) - (b.artesa_id ? 1 : 0)).forEach((x) => { t[x.chave] = x.texto; });
    return t;
  }

  /* ---------------- Texto automático de cada item ---------------- */
  async function textosDoProjeto(projetoId, ctx) {
    const [pj, cp, pr] = await Promise.all([
      sb.from('projetos').select('*, categorias(nome), clientes(cidade)').eq('id', projetoId).single(),
      sb.from('projeto_componentes').select('*').eq('projeto_id', projetoId).order('ordem'),
      sb.from('precificacoes').select('*').eq('projeto_id', projetoId).maybeSingle()
    ]);
    if (pj.error) throw pj.error;
    const d = resumoDoProjeto(pj.data, cp.data || [], ctx);
    return {
      projeto: pj.data, descricao: d.bullets.join('\n'), material: d.material.join('\n'), resumo: d.resumo,
      valor: (pr.data && Number(pr.data.preco_final)) || 0,
      deslocamento: (pr.data && Number(pr.data.deslocamento)) || 0,
      ganchosMarceneiro: d.ganchosMarceneiro, foto: (pj.data.referencias || [])[0]
    };
  }

  // Textos para o cliente: material arredondado para cima, sem passagens nem espaçamento.
  function resumoDoProjeto(projeto, componentes, ctx) {
    const comps = componentes.map((c) => ({ ...c, parametros: c.parametros || {} }));
    const calc = window.Calc.calcularProjeto(comps, ctx);
    const passo = (estado.perfil || {}).arredondar_para ?? 10;
    const tramas = [...new Set(comps.map((c) => (ctx.tramas.find((t) => t.id === c.trama_id) || {}).nome).filter(Boolean))];
    const vaos = comps.map((c, i) => (c.tipo === 'vao' && calc.componentes[i].ganchos ? { c, r: calc.componentes[i] } : null)).filter(Boolean);
    const cat = (projeto.categorias && projeto.categorias.nome) || projeto.nome;
    const fioPrincipal = calc.materiais.map((m) => ctx.materiais.find((x) => x.id === m.material_id)).find((m) => m && m.unidade_consumo === 'metro');
    const nomeFio = fioPrincipal ? [App.nomeTipo(fioPrincipal.tipo_material_id), fioPrincipal.espessura_mm ? numero(fioPrincipal.espessura_mm) + ' mm' : ''].filter(Boolean).join(' ') : '';
    const area = (m2) => numero(m2, 2) + ' m²';
    const medidas = vaos.map(({ c, r }) => `${r.telas > 1 ? `${r.telas} telas de` : '1 tela de'} ${numero(c.parametros.largura_cm)} × ${numero(c.parametros.altura_cm)} cm (${area(r.area_m2)}${r.telas > 1 ? ' no total' : ''})`);
    const pecas = comps.filter((c) => c.tipo === 'trama' && c.parametros.largura_cm && c.parametros.comprimento_cm).map((c) => `${numero(c.parametros.largura_cm)} × ${numero(c.parametros.comprimento_cm)} cm`);
    const bullets = [];
    medidas.forEach((m) => bullets.push(m + '.'));
    if (!medidas.length && pecas.length) bullets.push('Medidas: ' + pecas.join('; ') + '.');
    if (tramas.length) bullets.push(`Trama ${tramas.join(' e ').toLowerCase()}.`);
    if (vaos.length) bullets.push('Acabamento em corda nos ganchos.');
    const material = [];
    calc.materiais.forEach((m) => {
      const mat = ctx.materiais.find((x) => x.id === m.material_id);
      if (!mat) return;
      const ehGancho = vaos.some(({ c }) => c.parametros.gancho_material_id === m.material_id);
      if (ehGancho) return; // ganchos entram abaixo
      const nome = [App.nomeTipo(mat.tipo_material_id), mat.espessura_mm ? numero(mat.espessura_mm) + ' mm' : ''].filter(Boolean).join(' ');
      const qtd = window.Calc.arredondarCima(m.quantidade, passo);
      if (m.unidade === 'metro') material.push(`${nome}: ${qtd} metros.`);
      else if (m.unidade === 'unidade') material.push(`${nome}: ${qtd} ${qtd === 1 ? 'unidade' : 'unidades'}.`);
    });
    // Ganchos sempre aparecem quando há vão, mesmo sem material cadastrado
    if (calc.ganchos_total) {
      const gMat = vaos.map(({ c }) => ctx.materiais.find((x) => x.id === c.parametros.gancho_material_id)).find(Boolean);
      const base = gMat ? App.nomeTipo(gMat.tipo_material_id).toLowerCase() : 'gancho inox';
      const nomeG = /^ganchos?\b/.test(base) ? base.replace(/^ganchos?/, 'ganchos') : 'ganchos ' + base;
      const qtd = window.Calc.arredondarCima(calc.ganchos_total, passo);
      const cliente = vaos.every(({ c }) => c.parametros.ganchos_fornecidos === 'cliente');
      material.push(`${qtd} ${nomeG}${cliente ? ' (fornecidos pelo cliente)' : ''}.`);
    }
    const cidade = projeto.clientes && projeto.clientes.cidade;
    const resumo = `${cat} em ${nomeFio ? nomeFio.toLowerCase().replace(/ \d+([,.]\d+)? mm$/, '') : 'macramê'}${tramas.length ? ' com trama ' + tramas.join(' e ').toLowerCase() : ''}${cidade ? ', ' + cidade : ''}.`;
    return {
      bullets, material, resumo, calc, vaos, tramas, cat, nomeFio, fioPrincipal,
      ganchosMarceneiro: vaos.some(({ c }) => c.parametros.colocacao === 'marceneiro'),
      medidasCurtas: vaos.length ? vaos.map(({ c, r }) => `${r.telas > 1 ? r.telas + ' × ' : ''}${numero(c.parametros.largura_cm)} × ${numero(c.parametros.altura_cm)} cm`).join(' + ') : pecas.join(' + '),
      areaTotal: calc.area_m2
    };
  }

  /* =================================================================
     Lista
     ================================================================= */
  App.paginas.propostas = async function () {
    const { data, error } = await sb.from('propostas').select('*, clientes(nome), proposta_itens(id)').order('criado_em', { ascending: false });
    if (error) throw error;
    const lista = data || [];
    area().innerHTML = `
      <div class="cabecalho"><div><h1>Propostas</h1><p>Orçamentos enviados aos clientes.</p></div>
        <a class="botao" href="#/proposta/nova">+ Nova proposta</a></div>
      ${lista.length ? `<div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Nº</th><th>Cliente</th><th>Emissão</th><th>Status</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${lista.map((p) => `<tr>
          <td><strong>${esc(p.numero)}</strong></td>
          <td>${esc((p.clientes && p.clientes.nome) || 'A definir')}</td>
          <td>${new Date(p.data_emissao + 'T12:00').toLocaleDateString('pt-BR')}</td>
          <td><span class="selo status-${p.status}">${STATUS[p.status]}</span></td>
          <td class="num">${p.valor_total ? moeda(p.valor_total) : '-'}</td>
          <td style="white-space:nowrap"><a class="botao texto peq" href="#/proposta/${p.id}">Editar</a><a class="botao texto peq" href="#/imprimir/proposta/${p.id}" target="_blank">PDF</a></td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhuma proposta ainda. Abra um projeto e clique em <strong>Criar proposta</strong>.</div>'}`;
  };

  /* =================================================================
     Editor
     ================================================================= */
  App.paginas.proposta = async function () {
    const partes = location.hash.replace(/^#\/?/, '').split('/');
    const ctx = await App.carregarContexto();
    const { data: projetos } = await sb.from('projetos').select('id, nome, versao, cliente_id, status, precificacoes(preco_final)').neq('status', 'arquivado').order('atualizado_em', { ascending: false });
    const perfil = estado.perfil || {};
    let ed;
    if (partes[1] === 'nova') {
      ed = {
        proposta: { cliente_id: null, validade_dias: perfil.validade_proposta_dias || 7, status: 'rascunho', valor_unico: false, valor_total: 0, deslocamento_incluso: false, deslocamento_valor: 0, deslocamento_cidade: '', desloc_modo: 'nenhum', previsao_entrega: 'a combinar', cor_material: 'a definir', observacoes: '', ganchos_marceneiro: false, mostrar_portfolio: true },
        itens: []
      };
      if (partes[2]) {
        const t = await textosDoProjeto(partes[2], ctx);
        ed.proposta.cliente_id = t.projeto.cliente_id;
        const cli = ctx.clientes.find((c) => c.id === t.projeto.cliente_id);
        ed.proposta.deslocamento_cidade = (cli && cli.cidade) || '';
        if (t.deslocamento) { ed.proposta.desloc_modo = 'incluso'; ed.proposta.deslocamento_valor = t.deslocamento; }
        ed.proposta.ganchos_marceneiro = t.ganchosMarceneiro;
        ed.itens.push({ projeto_id: partes[2], opcao: null, descricao_cliente: t.descricao, material_cliente: t.material, valor: t.valor });
        ed.proposta.resumo_projeto = t.resumo;
      }
    } else {
      const [p, it] = await Promise.all([
        sb.from('propostas').select('*').eq('id', partes[1]).maybeSingle(),
        sb.from('proposta_itens').select('*').eq('proposta_id', partes[1]).order('ordem')
      ]);
      if (p.error) throw p.error;
      if (!p.data) { area().innerHTML = '<div class="vazio">Proposta não encontrada.</div>'; return; }
      ed = { proposta: p.data, itens: it.data || [] };
      const pp = ed.proposta;
      pp.desloc_modo = pp.deslocamento_incluso ? 'incluso' : Number(pp.deslocamento_valor) > 0 ? 'separado' : 'nenhum';
    }
    desenhar(ed, ctx, projetos || []);
  };

  function totalDe(ed) {
    const p = ed.proposta;
    const desloc = p.desloc_modo === 'separado' ? Number(p.deslocamento_valor) || 0 : 0;
    if (p.valor_unico) return Number(p.valor_total) || 0;
    const comOpcao = ed.itens.filter((i) => i.opcao);
    if (comOpcao.length) return null; // um total por opção
    return ed.itens.reduce((s, i) => s + (Number(i.valor) || 0), 0) + desloc;
  }

  function desenhar(ed, ctx, projetos) {
    const p = ed.proposta;
    area().innerHTML = `
      <div class="cabecalho">
        <div><p style="margin:0 0 4px"><a href="#/propostas">← Propostas</a></p>
          <h1>${p.id ? 'Proposta ' + esc(p.numero) : 'Nova proposta'}</h1>
          <p>O texto para o cliente já vem pronto, com material arredondado. Ajuste o que quiser.</p></div>
        <div class="acoes" style="margin:0">
          ${p.id ? `<a class="botao sec" href="#/imprimir/proposta/${p.id}" target="_blank">Ver e baixar PDF</a>` : ''}
          <button type="button" class="botao" id="bt-salvar-prop">Salvar proposta</button>
        </div>
      </div>
      <section class="card">
        <h2>Cliente e condições</h2>
        <div class="grade g3" style="margin-top:12px">
          ${campo('Cliente', `<select data-p="cliente_id"><option value="">A definir</option>${opcoesLista(ctx.clientes, p.cliente_id)}</select>`)}
          ${campo('Status', `<select data-p="status">${opcoes(STATUS, p.status)}</select>`)}
          ${campo('Validade', `<div class="com-sufixo"><input type="number" data-p="validade_dias" value="${p.validade_dias ?? 7}"><span>dias</span></div>`)}
          ${campo('Previsão de entrega', `<input data-p="previsao_entrega" value="${esc(p.previsao_entrega)}">`)}
          ${campo('Cor do material', `<input data-p="cor_material" value="${esc(p.cor_material)}">`)}
          ${campo('Deslocamento', `<select data-p="desloc_modo">${opcoes(DESLOC, p.desloc_modo)}</select>`)}
          ${p.desloc_modo !== 'nenhum' ? campo('Cidade', `<input data-p="deslocamento_cidade" value="${esc(p.deslocamento_cidade)}" placeholder="Ex.: Indaiatuba">`) : ''}
          ${p.desloc_modo === 'separado' ? campo('Valor do deslocamento', `<div class="com-sufixo"><input type="number" step="any" data-p="deslocamento_valor" value="${p.deslocamento_valor ?? ''}"><span>R$</span></div>`, 'Tire o deslocamento do valor de cada item, se ele já estava no preço do projeto.') : ''}
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="ganchos_marceneiro" ${p.ganchos_marceneiro ? 'checked' : ''}> Ganchos colocados pelo marceneiro</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="mostrar_portfolio" ${p.mostrar_portfolio !== false ? 'checked' : ''}> Incluir página de projetos realizados</label>
        </div>
        <div class="grade g2" style="margin-top:14px">
          ${campo('Projeto (uma linha)', `<input data-p="resumo_projeto" value="${esc(p.resumo_projeto)}" placeholder="Ex.: Guarda-corpo em corda náutica com trama quadrado, São José dos Campos.">`, '', 'Aparece no orçamento, logo abaixo do nome do cliente.')}
          ${campo('Observações', `<textarea data-p="observacoes" rows="2">${esc(p.observacoes)}</textarea>`, '', 'Entram como itens na descrição do pedido.')}
        </div>
      </section>

      <section class="card">
        <h2>O que está sendo orçado</h2><p class="sub">Um projeto por item. Use opções A, B e C para oferecer alternativas.</p>
        <div id="itens"></div>
        <div class="add-comp">
          <select id="sel-add-proj" style="min-width:260px;border:1px solid #cfc4b2;border-radius:8px;padding:8px 10px"><option value="">Adicionar um projeto...</option>${projetos.map((x) => `<option value="${x.id}">${esc(x.nome)}${x.versao > 1 ? ' (v' + x.versao + ')' : ''}</option>`).join('')}</select>
        </div>
        <div style="margin-top:18px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-p="valor_unico" ${p.valor_unico ? 'checked' : ''}> Valor único para qualquer opção</label>
          ${p.valor_unico ? `<div class="campo" style="min-width:200px"><div class="com-sufixo"><input type="number" step="any" data-p="valor_total" value="${p.valor_total ?? ''}"><span>R$</span></div></div>` : ''}
          <div id="total-prop" style="margin-left:auto;font-size:18px;font-weight:900;color:var(--terracota)"></div>
        </div>
      </section>`;

    const atualizaTotal = () => {
      const t = totalDe(ed);
      document.getElementById('total-prop').textContent = t === null ? 'Um total por opção' : 'Total: ' + moeda(t);
    };
    area().querySelectorAll('[data-p]').forEach((el) => {
      const k = el.dataset.p;
      const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? valorNum(el.value) : el.value;
        if (k === 'cliente_id') v = v || null;
        p[k] = v;
        if (k === 'valor_unico' && v && !Number(p.valor_total)) p.valor_total = Math.max(0, ...ed.itens.map((i) => Number(i.valor) || 0));
        if (['desloc_modo', 'valor_unico'].includes(k)) desenhar(ed, ctx, projetos);
        else atualizaTotal();
      });
    });

    const caixa = document.getElementById('itens');
    const desenharItens = () => {
      caixa.innerHTML = ed.itens.length ? ed.itens.map((it, i) => `
        <div class="comp" data-i="${i}">
          <div class="comp-topo"><span class="tipo">Item ${i + 1}</span><strong style="flex:1">${esc((projetos.find((x) => x.id === it.projeto_id) || {}).nome || 'Projeto')}</strong>
            <div class="direita"><button type="button" class="botao texto peq" data-tirar>Remover</button></div></div>
          <div class="comp-corpo">
            <div class="grade g3">
              ${campo('Opção', `<select data-it="opcao">${opcoes({ '': 'Sem opção', A: 'Opção A', B: 'Opção B', C: 'Opção C' }, it.opcao || '')}</select>`)}
              ${campo('Valor', `<div class="com-sufixo"><input type="number" step="any" data-it="valor" value="${it.valor ?? ''}"><span>R$</span></div>`, 'Vem do preço final do projeto.')}
              <div class="campo"><label>&nbsp;</label><button type="button" class="botao texto peq" data-refazer>Refazer textos pelo projeto</button></div>
            </div>
            <div class="grade g2" style="margin-top:12px">
              ${campo('Descrição do pedido', `<textarea data-it="descricao_cliente" rows="4">${esc(it.descricao_cliente)}</textarea>`, 'Uma linha por item. Deslocamento e marceneiro entram sozinhos.')}
              ${campo('Material (arredondado)', `<textarea data-it="material_cliente" rows="3">${esc(it.material_cliente)}</textarea>`, 'Uma linha por material.')}
            </div>
          </div>
        </div>`).join('') : '<div class="vazio" style="padding:22px">Adicione pelo menos um projeto.</div>';
      caixa.querySelectorAll('.comp').forEach((card) => {
        const it = ed.itens[Number(card.dataset.i)];
        card.querySelectorAll('[data-it]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          const k = el.dataset.it;
          it[k] = el.type === 'number' ? valorNum(el.value) : el.value || (k === 'opcao' ? null : '');
          atualizaTotal();
        }));
        card.querySelector('[data-tirar]').addEventListener('click', () => { ed.itens.splice(Number(card.dataset.i), 1); desenharItens(); atualizaTotal(); });
        card.querySelector('[data-refazer]').addEventListener('click', async () => {
          const t = await textosDoProjeto(it.projeto_id, ctx);
          Object.assign(it, { descricao_cliente: t.descricao, material_cliente: t.material, valor: t.valor });
          desenharItens(); atualizaTotal();
        });
      });
    };
    desenharItens();
    atualizaTotal();

    document.getElementById('sel-add-proj').addEventListener('change', async (ev) => {
      const id = ev.target.value;
      if (!id) return;
      try {
        const t = await textosDoProjeto(id, ctx);
        ed.itens.push({ projeto_id: id, opcao: null, descricao_cliente: t.descricao, material_cliente: t.material, valor: t.valor });
        if (!p.resumo_projeto) p.resumo_projeto = t.resumo;
        if (!p.cliente_id && t.projeto.cliente_id) p.cliente_id = t.projeto.cliente_id;
        if (t.ganchosMarceneiro) p.ganchos_marceneiro = true;
        desenhar(ed, ctx, projetos);
      } catch (e) { erro(e); }
    });

    document.getElementById('bt-salvar-prop').addEventListener('click', async () => {
      if (!ed.itens.length) { toast('Adicione pelo menos um projeto.', true); return; }
      const bt = document.getElementById('bt-salvar-prop');
      bt.disabled = true;
      try {
        const t = totalDe(ed);
        const dados = {
          cliente_id: p.cliente_id || null, validade_dias: p.validade_dias || 7, status: p.status,
          valor_unico: !!p.valor_unico,
          valor_total: t === null ? Math.max(...ed.itens.map((i) => Number(i.valor) || 0)) : t,
          deslocamento_incluso: p.desloc_modo === 'incluso',
          deslocamento_valor: p.desloc_modo === 'separado' ? Number(p.deslocamento_valor) || 0 : 0,
          deslocamento_cidade: p.desloc_modo === 'nenhum' ? null : p.deslocamento_cidade || null,
          previsao_entrega: p.previsao_entrega || 'a combinar', cor_material: p.cor_material || 'a definir',
          observacoes: p.observacoes || null, resumo_projeto: p.resumo_projeto || null, ganchos_marceneiro: !!p.ganchos_marceneiro, mostrar_portfolio: p.mostrar_portfolio !== false
        };
        let id = p.id;
        if (id) { const r = await sb.from('propostas').update(dados).eq('id', id); if (r.error) throw r.error; }
        else { const r = await sb.from('propostas').insert(dados).select('id').single(); if (r.error) throw r.error; id = r.data.id; }
        const del = await sb.from('proposta_itens').delete().eq('proposta_id', id);
        if (del.error) throw del.error;
        const ins = await sb.from('proposta_itens').insert(ed.itens.map((it, i) => ({ proposta_id: id, projeto_id: it.projeto_id, opcao: it.opcao || null, ordem: i, descricao_cliente: it.descricao_cliente, material_cliente: it.material_cliente, valor: Number(it.valor) || 0 })));
        if (ins.error) throw ins.error;
        const ids = ed.itens.map((i) => i.projeto_id).filter(Boolean);
        if (ids.length) await sb.from('projetos').update({ status: p.status === 'aceita' ? 'aprovado' : 'em_proposta' }).in('id', ids).in('status', p.status === 'aceita' ? ['em_criacao', 'pronto', 'em_proposta'] : ['em_criacao', 'pronto']);
        if (p.status === 'aceita' && App.criarVendaDaProposta) {
          try { await App.criarVendaDaProposta(id); toast('Proposta aceita: a venda e as parcelas foram criadas em Vendas.'); } catch (e) { erro(e); }
        } else toast('Proposta salva.');
        if (!p.id) location.hash = '#/proposta/' + id; else App.paginas.proposta().catch(erro);
      } catch (e) { erro(e); } finally { bt.disabled = false; }
    });
  }

  /* =================================================================
     Impressão
     ================================================================= */
  App.paginas.imprimir = async function () {
    const partes = location.hash.replace(/^#\/?/, '').split('/');
    const app = document.getElementById('app');
    app.innerHTML = '<div class="carregando">Montando o documento...</div>';
    let html = '', titulo = '';
    if (partes[1] === 'ficha') { html = await App.imprimirFicha(partes[2], Number(partes[3])); titulo = 'Ficha do marceneiro'; }
    else if (partes[1] === 'proposta') { html = await montarProposta(partes[2]); titulo = 'Proposta'; }
    app.innerHTML = `
      <div class="impressao-barra"><strong>${esc(titulo)}</strong>
        <span style="opacity:.8;font-size:13px">No botão abaixo, escolha "Salvar como PDF".</span>
        <button type="button" class="botao" onclick="window.print()">Imprimir ou salvar PDF</button>
        <button type="button" class="botao sec" onclick="history.length > 1 ? history.back() : window.close()">Voltar</button></div>
      <div class="folhas">${html}</div>`;
  };

  async function montarProposta(id) {
    const perfil = estado.perfil || {};
    const ctx = await App.carregarContexto();
    const [p, it, fotos, txt] = await Promise.all([
      sb.from('propostas').select('*, clientes(nome, telefone, cidade)').eq('id', id).single(),
      sb.from('proposta_itens').select('*').eq('proposta_id', id).order('ordem'),
      sb.from('portfolio').select('*').eq('artesa_id', estado.sessao.user.id).eq('ativo', true).order('ordem').limit(5),
      textosPadrao()
    ]);
    if (p.error) throw p.error;
    const prop = p.data, itens = it.data || [];
    const ids = [...new Set(itens.map((i) => i.projeto_id).filter(Boolean))];
    const [pjs, cps] = ids.length ? await Promise.all([
      sb.from('projetos').select('*, categorias(nome), clientes(cidade)').in('id', ids),
      sb.from('projeto_componentes').select('*').in('projeto_id', ids).order('ordem')
    ]) : [{ data: [] }, { data: [] }];
    const projetos = {};
    (pjs.data || []).forEach((pj) => { projetos[pj.id] = { pj, comps: (cps.data || []).filter((c) => c.projeto_id === pj.id) }; });
    const caminhos = [];
    Object.values(projetos).forEach(({ pj }) => (pj.referencias || []).slice(0, 2).forEach((r) => r && r.path && caminhos.push(r.path)));
    const assinadas = caminhos.length ? ((await sb.storage.from('referencias').createSignedUrls(caminhos, 3600)).data || []) : [];
    const urlDe = (r) => (r && (assinadas.find((a) => a.path === r.path) || {}).signedUrl) || '';

    const P = perfil.cor_primaria || '#B5460A', S = perfil.cor_secundaria || '#8B8110', F = perfil.cor_fundo || '#F5F1E9';
    const ESC = '#5b4636';
    const data = new Date(prop.data_emissao + 'T12:00').toLocaleDateString('pt-BR');
    const cli = prop.clientes || {};
    const preencher = (t, vars) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    const folha = (estilo, html) => `<div class="folha" style="padding:0;position:relative;overflow:hidden;font-family:Lato,sans-serif;${estilo}">${html}</div>`;
    const logo = (left, top, w) => perfil.logo_url ? `<img src="${esc(perfil.logo_url)}" alt="${esc(perfil.nome_marca || '')}" style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:auto">` : `<div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;font-size:${Math.round(w / 5)}px;font-weight:900;color:${F}">${esc(perfil.nome_marca || '')}</div>`;
    const linhas = (t) => String(t || '').split('\n').map((l) => l.replace(/^[•\-\s]+/, '').trim()).filter(Boolean);
    const folhas = [];

    // 1 · Capa
    folhas.push(folha(`background:${P}`, `${perfil.capa_url ? `<img src="${esc(perfil.capa_url)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : ''}${logo(252, 539, 289)}`));

    // 2 · Apresentação
    if (perfil.texto_apresentacao || perfil.foto_apresentacao_url) {
      const pars = String(perfil.texto_apresentacao || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      const primeiro = (perfil.nome || '').split(' ')[0];
      folhas.push(folha(`background:${F};color:${P};display:flex;flex-direction:column`, `
        ${perfil.foto_apresentacao_url ? `<img src="${esc(perfil.foto_apresentacao_url)}" alt="" style="width:100%;height:484px;object-fit:cover">` : '<div style="height:120px"></div>'}
        <div style="box-sizing:border-box;padding:36px 85px 0;display:flex;flex-direction:column;gap:30px">
          <div style="font-size:27px;line-height:1.2"><span style="font-weight:900">${esc(perfil.apresentacao_titulo || (primeiro ? `Olá, eu sou a ${primeiro},` : 'Olá!'))}</span>${perfil.apresentacao_subtitulo ? '<br>' + esc(perfil.apresentacao_subtitulo).replace(/\n/g, '<br>') : ''}</div>
          <div style="display:flex;flex-direction:column;gap:20px;font-size:17px;line-height:1.5;text-align:justify">${pars.map((x, i) => `<div style="${i === 0 ? 'font-weight:700' : ''}">${esc(x).replace(/\n/g, '<br>')}</div>`).join('')}</div>
        </div>`));
    }

    // 3 e 4 · Projetos realizados + fotos
    const fs = fotos.data || [];
    if (prop.mostrar_portfolio !== false) {
      folhas.push(folha(`background:${P};color:${F}`, `
        ${perfil.foto_projetos_url ? `<img src="${esc(perfil.foto_projetos_url)}" alt="" style="position:absolute;left:471px;top:0;width:324px;height:100%;object-fit:cover">` : ''}
        ${perfil.assinatura_url ? `<img src="${esc(perfil.assinatura_url)}" alt="" style="position:absolute;left:80px;top:63px;width:273px;height:auto">` : `<div style="position:absolute;left:80px;top:70px;font-size:22px;font-weight:300">${esc(perfil.nome || '')}</div>`}
        <div style="position:absolute;left:80px;top:470px;display:flex;flex-direction:column">
          <div style="font-size:23px;font-weight:300;line-height:1.1">alguns...</div>
          <div style="font-size:66px;font-weight:400;line-height:.95">projetos</div>
          <div style="font-size:66px;font-weight:900;line-height:1">realizados!</div>
        </div>
        ${perfil.logo_url ? `<img src="${esc(perfil.logo_url)}" alt="" style="position:absolute;left:80px;top:1043px;width:117px;height:auto">` : ''}`));
      if (fs.length) {
        const n = fs.length;
        const linhasGrade = n === 1 ? '1fr' : n === 2 ? '1fr 1fr' : n <= 4 ? '1fr 1fr' : '404px 380px 1fr';
        const span = (i) => (n === 1 || n === 2 || (n === 3 && i === 2) || (n === 5 && i === 4) ? 'grid-column:span 2;' : '');
        folhas.push(folha(`background:${P};display:grid;grid-template-columns:1fr 1fr;grid-template-rows:${linhasGrade}`,
          fs.map((f, i) => `<img src="${esc(f.foto_url)}" alt="${esc(f.legenda || '')}" style="width:100%;height:100%;object-fit:cover;min-height:0;${span(i)}">`).join('')));
      }
    }

    // 5 · O projeto (um por item)
    const cidade = prop.deslocamento_cidade || cli.cidade || '';
    const resumos = itens.map((i) => (projetos[i.projeto_id] ? resumoDoProjeto(projetos[i.projeto_id].pj, projetos[i.projeto_id].comps, ctx) : null));
    itens.forEach((i, k) => {
      const pr = projetos[i.projeto_id];
      const rs = resumos[k];
      const refs = (pr && pr.pj.referencias) || [];
      const foto1 = urlDe(refs[0]), foto2 = urlDe(refs[1]);
      const cor = prop.cor_material && prop.cor_material !== 'a definir' ? prop.cor_material : (rs && rs.fioPrincipal && rs.fioPrincipal.cor) || 'cor a definir';
      const cartao = (rot, val, sub) => `<div style="border:1.5px solid ${P};border-radius:12px;padding:14px 18px"><div style="font-size:12px;letter-spacing:.08em;font-weight:700">${esc(rot)}</div><div style="font-size:22px;font-weight:900">${esc(val)}</div>${sub ? `<div style="font-size:14px;color:${ESC}">${esc(sub)}</div>` : ''}</div>`;
      const cartoes = [];
      if (rs && rs.medidasCurtas) cartoes.push(cartao(rs.vaos.length ? (rs.vaos.some((v) => v.r.telas > 1) ? 'TELAS' : 'VÃO') : 'MEDIDAS', rs.medidasCurtas, rs.areaTotal ? `${numero(rs.areaTotal, 2)} m² no total` : ''));
      if (rs) cartoes.push(cartao(rs.tramas.length ? 'TRAMA' : 'PEÇA', rs.tramas.length ? rs.tramas.join(' e ') : rs.cat, [rs.nomeFio && rs.nomeFio.toLowerCase(), cor ? (cor.startsWith('cor') ? cor : 'cor ' + cor) : ''].filter(Boolean).join(', ')));
      if (cidade) cartoes.push(cartao('LOCAL', cidade, prop.deslocamento_incluso ? 'deslocamento incluso' : ''));
      else cartoes.push(cartao('ENTREGA', prop.previsao_entrega || 'a combinar', ''));
      folhas.push(folha(`background:${F};color:${P};display:flex;flex-direction:column`, `
        <div style="position:relative;width:100%;height:540px;background:#fff">
          ${foto1 ? `<img src="${esc(foto1)}" alt="" style="width:100%;height:540px;object-fit:contain">` : `<div style="height:540px;display:grid;place-items:center;color:${ESC};font-size:14px;background:${F}">Foto do projeto</div>`}
          ${refs[0] && refs[0].legenda ? `<div style="position:absolute;left:20px;bottom:16px;background:${F};color:${ESC};font-size:12px;padding:4px 10px;border-radius:4px">${esc(refs[0].legenda)}</div>` : ''}
        </div>
        <div style="box-sizing:border-box;padding:34px 80px 0;display:flex;flex-direction:column;gap:18px">
          <h1 style="margin:0;font-size:37px;font-weight:900;line-height:1;color:${P}">${i.opcao ? 'Opção ' + esc(i.opcao) : 'O projeto'}</h1>
          <div style="font-size:17px;line-height:1.55">${esc((rs && rs.resumo) || (pr && pr.pj.nome) || '')}</div>
          <div style="display:flex;gap:20px;align-items:stretch">
            ${foto2 ? `<div style="width:220px;display:flex;flex-direction:column;gap:6px"><img src="${esc(foto2)}" alt="" style="width:220px;height:295px;object-fit:cover;border-radius:6px">${refs[1] && refs[1].legenda ? `<div style="font-size:12px;color:${ESC}">${esc(refs[1].legenda)}</div>` : ''}</div>` : ''}
            <div style="flex:1;display:flex;flex-direction:column;gap:12px">${cartoes.join('')}</div>
          </div>
        </div>`));
    });

    // 6 · Orçamento
    const comOpcao = itens.some((i) => i.opcao);
    const notas = [];
    if (prop.deslocamento_incluso) notas.push(preencher(txt.deslocamento_incluso || 'Deslocamento até {cidade} incluso.', { cidade: prop.deslocamento_cidade || cli.cidade || 'o local' }));
    if (Number(prop.deslocamento_valor) > 0) notas.push(`Deslocamento${prop.deslocamento_cidade ? ' até ' + prop.deslocamento_cidade : ''}: ${moeda(prop.deslocamento_valor)}.`);
    if (prop.ganchos_marceneiro && txt.ganchos_marceneiro) notas.push(txt.ganchos_marceneiro);
    linhas(prop.observacoes).forEach((l) => notas.push(l));
    const bloco = (titulo, conteudo) => `<div style="border:1.3px solid #DDD6CA">${titulo ? `<div style="padding:11px 16px;border-bottom:1.3px solid #DDD6CA;font-weight:700;font-size:15px">${esc(titulo)}</div>` : ''}${conteudo}</div>`;
    const lista = (ls) => `<div style="padding:10px 16px 12px 32px;font-size:15px;line-height:1.6">${ls.map((l) => `<div>• ${esc(l)}</div>`).join('')}</div>`;
    const descricao = itens.length === 1
      ? lista([...linhas(itens[0].descricao_cliente), ...notas])
      : `<div style="padding:10px 16px 12px;font-size:15px;line-height:1.6">${itens.map((i) => `<div style="font-weight:700;margin-top:4px">${i.opcao ? 'Opção ' + esc(i.opcao) : esc((projetos[i.projeto_id] && projetos[i.projeto_id].pj.nome) || '')}</div>${linhas(i.descricao_cliente).map((l) => `<div style="padding-left:16px">• ${esc(l)}</div>`).join('')}`).join('')}${notas.map((l) => `<div style="margin-top:4px">• ${esc(l)}</div>`).join('')}</div>`;
    const materiais = itens.length === 1
      ? linhas(itens[0].material_cliente).map(esc).join('<br>')
      : itens.map((i) => `<strong>${i.opcao ? 'Opção ' + esc(i.opcao) : esc((projetos[i.projeto_id] && projetos[i.projeto_id].pj.nome) || '')}:</strong> ${linhas(i.material_cliente).map(esc).join(' · ')}`).join('<br>');
    const valorBox = !prop.valor_unico && comOpcao
      ? itens.map((i) => `<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><span style="font-size:14px;font-weight:700">${i.opcao ? 'Opção ' + esc(i.opcao) : esc((projetos[i.projeto_id] && projetos[i.projeto_id].pj.nome) || '')}</span><span style="font-size:26px;font-weight:900">${moeda(Number(i.valor || 0) + Number(prop.deslocamento_valor || 0))}</span></div>`).join('')
      : `<div style="font-size:14px;font-weight:700">${comOpcao ? 'Valor para qualquer opção:' : 'Valor total:'}</div><div style="font-size:38px;font-weight:900;line-height:1.1">${moeda(prop.valor_total)}</div>`;
    folhas.push(folha(`background:${F};color:${P}`, `
      <div style="box-sizing:border-box;height:100%;padding:88px 80px 70px;display:flex;flex-direction:column;gap:16px">
        <h1 style="margin:0;font-size:37px;font-weight:900;line-height:1;color:${P}">Orçamento</h1>
        <div style="display:flex;gap:8px;margin-top:6px">
          <div style="flex:1;background:${P};color:${F};border-radius:10px;padding:12px 16px;font-size:16px;line-height:1.3"><span style="font-weight:900">Nome do(a) Cliente:</span><br><span style="font-weight:700">${esc(cli.nome || 'a definir')}</span>${cli.telefone ? ' - Contato: ' + esc(cli.telefone) : ''}</div>
          <div style="width:160px;background:${P};color:${F};border-radius:10px;padding:12px 16px;font-size:16px;line-height:1.3"><span style="font-weight:900">Data:</span><br>${data}</div>
        </div>
        ${prop.resumo_projeto ? `<div style="font-size:16px;line-height:1.45"><span style="font-weight:700">Projeto:</span> ${esc(prop.resumo_projeto)}</div>` : ''}
        ${bloco('Descrição do pedido:', descricao)}
        ${bloco('', `<div style="padding:11px 16px;font-size:15px;line-height:1.6"><span style="font-weight:700">Material:</span><br>${materiais || '-'}</div><div style="padding:10px 16px;border-top:1.3px solid #DDD6CA;font-size:15px"><span style="font-weight:700">Cor:</span> ${esc(prop.cor_material || 'a definir')}.</div>`)}
        <h2 style="margin:12px 0 0;font-size:37px;font-weight:900;line-height:1;color:${P}">Investimento</h2>
        <div style="display:flex;gap:12px;align-items:stretch">
          <div style="flex:1;background:${S};color:${F};border-radius:10px;padding:14px 20px;display:flex;flex-direction:column;justify-content:center;gap:4px">${valorBox}</div>
          <div style="flex:1;border:1.3px solid ${S};border-radius:10px;padding:12px 18px;color:${S};font-size:14px;line-height:1.45;display:flex;flex-direction:column;gap:6px">
            ${perfil.condicoes_pagamento ? `<div><span style="font-weight:700">Para confirmar o pedido:</span> ${esc(perfil.condicoes_pagamento)}</div>` : ''}
            ${perfil.formas_pagamento ? `<div><span style="font-weight:700">Pagamento:</span> ${esc(perfil.formas_pagamento)}</div>` : ''}
          </div>
        </div>
        <div style="font-size:16px;margin-top:auto"><span style="font-weight:900">Previsão de entrega:</span> ${esc(prop.previsao_entrega || 'a combinar')}.</div>
      </div>`));

    // 7 · Contracapa
    folhas.push(folha(`background:${P};color:${F}`, `${logo(252, 539, 289)}
      <div style="position:absolute;left:0;right:0;top:1029px;text-align:center;font-size:17px;font-weight:700">${esc(preencher(txt.validade || 'Esse orçamento é válido por até {dias} dias a partir da data de emissão.', { dias: prop.validade_dias }))}</div>`));
    return folhas.join('');
  }
})();
