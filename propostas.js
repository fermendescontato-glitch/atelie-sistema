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
      sb.from('projetos').select('*, categorias(nome)').eq('id', projetoId).single(),
      sb.from('projeto_componentes').select('*').eq('projeto_id', projetoId).order('ordem'),
      sb.from('precificacoes').select('*').eq('projeto_id', projetoId).maybeSingle()
    ]);
    if (pj.error) throw pj.error;
    const comps = (cp.data || []).map((c) => ({ ...c, parametros: c.parametros || {} }));
    const calc = window.Calc.calcularProjeto(comps, ctx);
    const passo = (estado.perfil || {}).arredondar_para ?? 10;
    const trama = comps.map((c) => (ctx.tramas.find((t) => t.id === c.trama_id) || {}).nome).filter(Boolean);
    const vaos = comps.map((c, i) => (c.tipo === 'vao' && calc.componentes[i].ganchos ? { c, r: calc.componentes[i] } : null)).filter(Boolean);
    const medidas = vaos.map(({ c, r }) => `${numero(c.parametros.largura_cm)} × ${numero(c.parametros.altura_cm)} cm${r.telas > 1 ? ` (${r.telas} telas)` : ''}`);
    const cat = (pj.data.categorias && pj.data.categorias.nome) || pj.data.nome;
    const descricao = `${cat} em macramê${trama.length ? `, trama ${[...new Set(trama)].join(' e ').toLowerCase()}` : ''}.${medidas.length ? ` Medidas: ${medidas.join('; ')}.` : ''}`;
    const mats = [];
    calc.materiais.forEach((m) => {
      const mat = ctx.materiais.find((x) => x.id === m.material_id);
      if (!mat) return;
      const tipo = App.nomeTipo(mat.tipo_material_id);
      const qtd = window.Calc.arredondarCima(m.quantidade, passo);
      const nome = [tipo, mat.espessura_mm ? numero(mat.espessura_mm) + ' mm' : ''].filter(Boolean).join(' ');
      if (m.unidade === 'metro') mats.push(`${nome}: ${qtd} m`);
      else if (m.unidade === 'unidade') mats.push(`${nome}: ${qtd} ${qtd === 1 ? 'unidade' : 'unidades'}`);
    });
    const ganchosMarceneiro = vaos.some(({ c }) => c.parametros.colocacao === 'marceneiro');
    return {
      projeto: pj.data, descricao, material: mats.join('\n'),
      valor: (pr.data && Number(pr.data.preco_final)) || 0,
      deslocamento: (pr.data && Number(pr.data.deslocamento)) || 0,
      ganchosMarceneiro, foto: (pj.data.referencias || [])[0]
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
        <div style="margin-top:14px">${campo('Observações', `<textarea data-p="observacoes" rows="2">${esc(p.observacoes)}</textarea>`)}</div>
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
              ${campo('Descrição para o cliente', `<textarea data-it="descricao_cliente" rows="3">${esc(it.descricao_cliente)}</textarea>`)}
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
          observacoes: p.observacoes || null, ganchos_marceneiro: !!p.ganchos_marceneiro, mostrar_portfolio: p.mostrar_portfolio !== false
        };
        let id = p.id;
        if (id) { const r = await sb.from('propostas').update(dados).eq('id', id); if (r.error) throw r.error; }
        else { const r = await sb.from('propostas').insert(dados).select('id').single(); if (r.error) throw r.error; id = r.data.id; }
        const del = await sb.from('proposta_itens').delete().eq('proposta_id', id);
        if (del.error) throw del.error;
        const ins = await sb.from('proposta_itens').insert(ed.itens.map((it, i) => ({ proposta_id: id, projeto_id: it.projeto_id, opcao: it.opcao || null, ordem: i, descricao_cliente: it.descricao_cliente, material_cliente: it.material_cliente, valor: Number(it.valor) || 0 })));
        if (ins.error) throw ins.error;
        const ids = ed.itens.map((i) => i.projeto_id).filter(Boolean);
        if (ids.length) await sb.from('projetos').update({ status: p.status === 'aceita' ? 'aprovado' : 'em_proposta' }).in('id', ids).in('status', ['rascunho', 'calculado', 'em_proposta']);
        toast('Proposta salva.');
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
    const [p, it, fotos, txt] = await Promise.all([
      sb.from('propostas').select('*, clientes(nome, telefone, cidade)').eq('id', id).single(),
      sb.from('proposta_itens').select('*, projetos(nome, referencias)').eq('proposta_id', id).order('ordem'),
      sb.from('portfolio').select('*').eq('artesa_id', estado.sessao.user.id).eq('ativo', true).order('ordem').limit(6),
      textosPadrao()
    ]);
    if (p.error) throw p.error;
    const prop = p.data, itens = it.data || [];
    const corP = perfil.cor_primaria || '#B5460A', corS = perfil.cor_secundaria || '#8B8110', corF = perfil.cor_fundo || '#F5F1E9';
    const caminhos = itens.map((i) => ((i.projetos && i.projetos.referencias) || [])[0]).map((r) => r && r.path).filter(Boolean);
    const assinadas = caminhos.length ? ((await sb.storage.from('referencias').createSignedUrls(caminhos, 3600)).data || []) : [];
    const urlDe = (path) => (assinadas.find((a) => a.path === path) || {}).signedUrl;
    const data = new Date(prop.data_emissao + 'T12:00').toLocaleDateString('pt-BR');
    const cliente = (prop.clientes && prop.clientes.nome) || '';
    const logo = (fundoEscuro) => perfil.logo_url ? `<img src="${esc(perfil.logo_url)}" style="max-width:${fundoEscuro ? '70%' : '160px'};max-height:${fundoEscuro ? '220px' : '60px'}">` : `<div style="font-size:${fundoEscuro ? 54 : 22}px;font-weight:900;letter-spacing:.05em">${esc(perfil.nome_marca || '')}</div>`;
    const sub = (s) => `<div style="font-size:11px;letter-spacing:.35em;text-transform:uppercase;color:${corS};font-weight:700;margin-bottom:6px">${esc(s)}</div>`;
    const tit = (s) => `<h1 style="font-size:34px;color:${corP};margin-bottom:18px">${esc(s)}</h1>`;
    const rodape = `<div style="margin-top:auto;padding-top:14px;display:flex;justify-content:space-between;font-size:10px;color:#8a7a6a;border-top:1px solid #e8e0d2"><span>${esc(perfil.nome_marca || '')}</span><span>Proposta ${esc(prop.numero)} · ${data}</span></div>`;
    const preencher = (t, vars) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    const folhas = [];

    // Capa
    folhas.push(`<div class="folha" style="background:${corP};color:${corF};justify-content:center;align-items:center;text-align:center;gap:28px">
      ${logo(true)}
      <div style="font-size:13px;letter-spacing:.5em;font-weight:300">PROPOSTA COMERCIAL</div>
      <div style="font-size:15px">${cliente ? esc(cliente) + ' · ' : ''}Nº ${esc(prop.numero)} · ${data}</div></div>`);

    // Apresentação
    if (perfil.texto_apresentacao) folhas.push(`<div class="folha" style="background:${corF}">
      ${sub('Apresentação')}${tit(perfil.nome || perfil.nome_marca || 'Quem sou eu')}
      <div style="font-size:14px;line-height:1.75;white-space:pre-line;color:#3a2a1e">${esc(perfil.texto_apresentacao)}</div>
      ${perfil.assinatura_url ? `<img src="${esc(perfil.assinatura_url)}" style="max-height:70px;max-width:220px;margin-top:24px">` : ''}
      ${rodape}</div>`);

    // Projetos realizados
    if (prop.mostrar_portfolio !== false && (fotos.data || []).length) folhas.push(`<div class="folha">
      ${sub('Portfólio')}${tit('Projetos realizados')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:1">${(fotos.data || []).map((f) => `<div style="border-radius:8px;overflow:hidden;background:${corF};aspect-ratio:4/3"><img src="${esc(f.foto_url)}" style="width:100%;height:100%;object-fit:cover"></div>`).join('')}</div>
      ${rodape}</div>`);

    // Cada projeto
    itens.forEach((i) => {
      const ref = ((i.projetos && i.projetos.referencias) || [])[0];
      const url = ref && urlDe(ref.path);
      folhas.push(`<div class="folha">
        ${sub(i.opcao ? 'Opção ' + i.opcao : 'O projeto')}${tit((i.projetos && i.projetos.nome) || 'Projeto')}
        ${url ? `<div style="border-radius:10px;overflow:hidden;background:${corF};height:120mm;margin-bottom:18px"><img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover"></div>` : ''}
        <div style="font-size:15px;line-height:1.7;margin-bottom:16px">${esc(i.descricao_cliente)}</div>
        ${i.material_cliente ? `<div style="background:${corF};border-radius:10px;padding:14px 18px"><div style="font-weight:900;color:${corP};margin-bottom:6px">Material</div><div style="white-space:pre-line;line-height:1.7">${esc(i.material_cliente)}</div>
          <div style="margin-top:6px">Cor: ${esc(prop.cor_material || 'a definir')}</div></div>` : ''}
        ${rodape}</div>`);
    });

    // Orçamento
    const comOpcao = itens.some((i) => i.opcao);
    const linhasValor = prop.valor_unico
      ? `<tr><td style="padding:12px 0">${comOpcao ? 'Valor para qualquer uma das opções' : 'Valor total'}</td><td style="text-align:right;font-weight:900;font-size:20px;color:${corP}">${moeda(prop.valor_total)}</td></tr>`
      : itens.map((i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">${i.opcao ? '<strong>Opção ' + esc(i.opcao) + '</strong> · ' : ''}${esc((i.projetos && i.projetos.nome) || '')}</td><td style="text-align:right;border-bottom:1px solid #eee;font-weight:700">${moeda(i.valor)}</td></tr>`).join('')
        + (Number(prop.deslocamento_valor) > 0 ? `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">Deslocamento${prop.deslocamento_cidade ? ' até ' + esc(prop.deslocamento_cidade) : ''}</td><td style="text-align:right;border-bottom:1px solid #eee;font-weight:700">${moeda(prop.deslocamento_valor)}</td></tr>` : '')
        + (!comOpcao ? `<tr><td style="padding:14px 0;font-weight:900">Total</td><td style="text-align:right;font-weight:900;font-size:20px;color:${corP}">${moeda(prop.valor_total)}</td></tr>` : '');
    const notas = [];
    if (prop.deslocamento_incluso) notas.push(preencher(txt.deslocamento_incluso || 'Deslocamento até {cidade} incluso.', { cidade: prop.deslocamento_cidade || 'o local' }));
    if (prop.ganchos_marceneiro && txt.ganchos_marceneiro) notas.push(txt.ganchos_marceneiro);
    if (prop.observacoes) notas.push(prop.observacoes);
    folhas.push(`<div class="folha">
      ${sub('Investimento')}${tit('Orçamento')}
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">${linhasValor}</table>
      ${notas.length ? `<div style="font-size:13px;line-height:1.7;margin-bottom:18px">${notas.map((n) => `<div>• ${esc(n)}</div>`).join('')}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px;line-height:1.6">
        ${perfil.condicoes_pagamento ? `<div style="background:${corF};border-radius:10px;padding:14px"><strong style="color:${corP}">Condições de pagamento</strong><div style="white-space:pre-line">${esc(perfil.condicoes_pagamento)}</div></div>` : ''}
        ${perfil.formas_pagamento ? `<div style="background:${corF};border-radius:10px;padding:14px"><strong style="color:${corP}">Formas de pagamento</strong><div style="white-space:pre-line">${esc(perfil.formas_pagamento)}</div></div>` : ''}
        <div style="background:${corF};border-radius:10px;padding:14px"><strong style="color:${corP}">Previsão de entrega</strong><div>${esc(prop.previsao_entrega || 'a combinar')}</div></div>
        <div style="background:${corF};border-radius:10px;padding:14px"><strong style="color:${corP}">Validade</strong><div>${esc(preencher(txt.validade || 'Válido por {dias} dias.', { dias: prop.validade_dias }))}</div></div>
      </div>
      ${rodape}</div>`);

    // Contracapa
    folhas.push(`<div class="folha" style="background:${corP};color:${corF};justify-content:center;align-items:center;text-align:center;gap:20px">
      ${logo(true)}
      <div style="font-size:16px;line-height:1.9">${[perfil.instagram, perfil.telefone].filter(Boolean).map(esc).join('<br>')}</div>
      <div style="font-size:13px;letter-spacing:.4em;font-weight:300">AGRADEÇO A CONFIANÇA</div></div>`);
    return folhas.join('');
  }
})();
