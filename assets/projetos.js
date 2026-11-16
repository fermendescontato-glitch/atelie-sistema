/* =====================================================================
   Projetos: lista, criação (componentes + calculadora), desenho,
   precificação e ficha do marceneiro.
   ===================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { sb, estado, esc, moeda, numero, valorNum, toast, erro, abrirModal, campo, numeroCom, opcoes, opcoesLista, area } = App;

  const STATUS = { rascunho: 'Rascunho', calculado: 'Calculado', em_proposta: 'Em proposta', aprovado: 'Aprovado', pausado: 'Pausado', arquivado: 'Arquivado' };
  const TIPOS_COMP = {
    vao: { rotulo: 'Vão com ganchos', ajuda: 'Guarda-corpo, tela de proteção: trama zigzag ou quadrado entre ganchos.' },
    trama: { rotulo: 'Trama', ajuda: 'Parte trançada da peça, calculada pela largura e comprimento.' },
    trecho_sem_trama: { rotulo: 'Trecho sem trama', ajuda: 'Parte do fio sem trançar: franja, alça, pendente.' },
    no: { rotulo: 'Nó', ajuda: 'Nós avulsos ou nós em cada fio de uma trama.' },
    acessorio: { rotulo: 'Acessório', ajuda: 'Argola, alça de madeira, pingente, miçanga, gancho...' }
  };

  /* ---------------- Utilidades ---------------- */
  const grupoDe = (tipoId) => (estado.tiposMaterial.find((t) => t.id === tipoId) || {}).grupo;
  const nomeMaterial = (m) => {
    if (!m) return '';
    const tipo = App.nomeTipo(m.tipo_material_id);
    return [tipo, m.espessura_mm ? numero(m.espessura_mm) + ' mm' : '', m.cor, m.marca].filter(Boolean).join(' · ');
  };
  const un = (u, q) => (u === 'metro' ? 'm' : u === 'grama' ? 'g' : q === 1 ? 'unidade' : 'unidades');

  async function carregarContexto() {
    const [mat, tr, cn, cat, cli] = await Promise.all([
      sb.from('materiais').select('*').eq('ativo', true).order('criado_em'),
      sb.from('tramas').select('*').eq('ativo', true).order('nome'),
      sb.from('consumo_nos').select('*').eq('ativo', true),
      sb.from('categorias').select('*').eq('ativo', true).order('ordem').order('nome'),
      sb.from('clientes').select('*').eq('ativo', true).order('nome')
    ]);
    for (const r of [mat, tr, cn, cat, cli]) if (r.error) throw r.error;
    return { perfil: estado.perfil || {}, materiais: mat.data, tramas: tr.data, consumoNos: cn.data, nos: estado.nos, categorias: cat.data, clientes: cli.data };
  }
  App.carregarContexto = carregarContexto;

  /* =================================================================
     Desenho padrão (gerado a partir dos números da calculadora)
     ================================================================= */
  function desenhoVao(res, p, opc = {}) {
    if (!res || res.erro || !res.ganchos) return '';
    const L = Number(p.largura_cm), H = Number(p.altura_cm);
    const maxW = opc.largura || 680, maxH = opc.altura || 460;
    const esc_ = Math.min((maxW - 120) / L, (maxH - 110) / H);
    const w = L * esc_, h = H * esc_;
    const ox = 70, oy = 60;
    const X = (cm) => ox + cm * esc_, Y = (cm) => oy + cm * esc_;
    const cor = opc.cor || '#B5460A';
    const fmt = (v) => numero(v, 2);
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w + 140} ${h + 130}" font-family="Lato, sans-serif" font-size="12">`);
    out.push(`<rect x="${ox}" y="${oy}" width="${w}" height="${h}" fill="none" stroke="#3a2a1e" stroke-width="1.5"/>`);
    const furos = [];
    if (res.forma === 'zigzag') {
      res.ganchos.posicoes_cm.forEach((x) => { furos.push([x, 0]); furos.push([x, H]); });
      if (opc.trama) {
        // Linhas das passagens (só na visão interna)
        const n = res.ganchos.cima, s = res.ganchos.espacamento_cm, m = res.ganchos.margem_cm;
        const perc = window.Calc.percursoZigzag(n, s, H).trechos;
        const pos = (rot) => [m + (Number(rot.slice(1)) - 1) * s, rot[0] === 'C' ? 0 : H];
        const cores = { 1: '#B5460A', 2: '#8B8110', 3: '#6b5646' };
        perc.forEach((t) => { const a = pos(t.de), b = pos(t.para); out.push(`<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="${cores[t.passagem]}" stroke-width="1" opacity=".55"/>`); });
      }
      // cotas: largura, margem, espaçamento, altura
      out.push(cotaH(X(0), X(L), oy - 34, `${fmt(L)} cm`));
      out.push(cotaH(X(0), X(res.ganchos.margem_cm), oy - 14, `${fmt(res.ganchos.margem_cm)}`, true));
      if (res.ganchos.posicoes_cm.length > 1) out.push(cotaH(X(res.ganchos.posicoes_cm[0]), X(res.ganchos.posicoes_cm[1]), oy + h + 28, `${fmt(res.ganchos.espacamento_cm)} cm entre ganchos`, true));
      out.push(cotaV(X(L) + 30, Y(0), Y(H), `${fmt(H)} cm`));
    } else {
      res.ganchos.posicoes_largura_cm.forEach((x) => { furos.push([x, 0]); furos.push([x, H]); });
      res.ganchos.posicoes_altura_cm.forEach((y) => { furos.push([0, y]); furos.push([L, y]); });
      if (opc.trama) {
        res.ganchos.posicoes_largura_cm.forEach((x) => out.push(`<line x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(H)}" stroke="#8B8110" stroke-width="1" opacity=".55"/>`));
        res.ganchos.posicoes_altura_cm.forEach((y) => out.push(`<line x1="${X(0)}" y1="${Y(y)}" x2="${X(L)}" y2="${Y(y)}" stroke="#B5460A" stroke-width="1" opacity=".55"/>`));
      }
      out.push(cotaH(X(0), X(L), oy - 34, `${fmt(L)} cm`));
      if (res.ganchos.posicoes_largura_cm.length) out.push(cotaH(X(0), X(res.ganchos.posicoes_largura_cm[0]), oy - 14, `${fmt(res.ganchos.espacamento_largura_cm)}`, true));
      out.push(cotaV(X(L) + 30, Y(0), Y(H), `${fmt(H)} cm`));
      if (res.ganchos.posicoes_altura_cm.length) out.push(cotaV(ox - 30, Y(0), Y(res.ganchos.posicoes_altura_cm[0]), `${fmt(res.ganchos.espacamento_altura_cm)}`, true));
    }
    furos.forEach(([x, y]) => out.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="${Math.max(2.5, Math.min(5, esc_ * 1.2))}" fill="${cor}"/>`));
    out.push('</svg>');
    return out.join('');

    function cotaH(x1, x2, y, txt, peq) {
      return `<g stroke="#6b5646" stroke-width="1"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}"/><line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}"/></g><text x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="${peq && x2 - x1 < 60 ? 'start' : 'middle'}" fill="#3a2a1e" font-size="${peq ? 11 : 13}" font-weight="${peq ? 400 : 700}">${esc(txt)}</text>`;
    }
    function cotaV(x, y1, y2, txt, peq) {
      const cx = x - 6, cy = (y1 + y2) / 2;
      return `<g stroke="#6b5646" stroke-width="1"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}"/><line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}"/></g><text x="${cx}" y="${cy}" transform="rotate(-90 ${cx} ${cy})" text-anchor="middle" fill="#3a2a1e" font-size="${peq ? 11 : 13}" font-weight="${peq ? 400 : 700}">${esc(txt)}</text>`;
    }
  }
  App.desenhoVao = desenhoVao;

  /* =================================================================
     Lista de projetos
     ================================================================= */
  App.paginas.projetos = async function paginaProjetos() {
    const verArquivados = estado.verArquivados || false;
    let q = sb.from('projetos').select('id, nome, modelo, status, versao, atualizado_em, cliente_id, categoria_id, clientes(nome), categorias(nome), precificacoes(preco_final)').order('atualizado_em', { ascending: false });
    if (!verArquivados) q = q.neq('status', 'arquivado');
    const { data, error } = await q;
    if (error) throw error;
    const lista = data || [];
    const busca = (estado.buscaProjetos || '').toLowerCase();
    const filtrados = lista.filter((p) => !busca || [p.nome, p.clientes && p.clientes.nome, p.categorias && p.categorias.nome].join(' ').toLowerCase().includes(busca));
    area().innerHTML = `
      <div class="cabecalho">
        <div><h1>Projetos</h1><p>Peças sob medida e de catálogo, com cálculo e preço.</p></div>
        <div class="acoes" style="margin:0"><a class="botao sec" href="#/projeto/novo/catalogo">+ Peça de catálogo</a><a class="botao" href="#/projeto/novo/sob_medida">+ Projeto sob medida</a></div>
      </div>
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        <div class="campo" style="flex:1;min-width:220px"><input id="busca-proj" placeholder="Buscar por nome, cliente ou categoria" value="${esc(estado.buscaProjetos || '')}"></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--texto-2)"><input type="checkbox" id="ver-arq" ${verArquivados ? 'checked' : ''}> Mostrar arquivados</label>
      </div>
      ${filtrados.length ? `<div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Projeto</th><th>Cliente</th><th>Categoria</th><th>Status</th><th class="num">Preço</th><th>Atualizado</th></tr></thead>
        <tbody>${filtrados.map((p) => {
          const preco = (p.precificacoes && p.precificacoes[0] && p.precificacoes[0].preco_final) || 0;
          return `<tr style="cursor:pointer" data-abrir="${p.id}">
            <td><strong>${esc(p.nome)}</strong>${p.versao > 1 ? ` <span class="selo">v${p.versao}</span>` : ''}<br><span style="font-size:13px;color:var(--texto-2)">${p.modelo === 'catalogo' ? 'Catálogo' : 'Sob medida'}</span></td>
            <td>${esc((p.clientes && p.clientes.nome) || '-')}</td>
            <td>${esc((p.categorias && p.categorias.nome) || '-')}</td>
            <td><span class="selo status-${p.status}">${STATUS[p.status] || p.status}</span></td>
            <td class="num">${preco ? moeda(preco) : '-'}</td>
            <td>${new Date(p.atualizado_em).toLocaleDateString('pt-BR')}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`
        : `<div class="vazio">${lista.length ? 'Nenhum projeto nessa busca.' : 'Nenhum projeto ainda. Comece por um projeto sob medida ou uma peça de catálogo.'}</div>`}`;
    area().querySelectorAll('[data-abrir]').forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/projeto/' + tr.dataset.abrir; }));
    const b = document.getElementById('busca-proj');
    b.addEventListener('input', () => { estado.buscaProjetos = b.value; clearTimeout(b._t); b._t = setTimeout(() => App.paginas.projetos().then(() => { const n = document.getElementById('busca-proj'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }).catch(erro), 250); });
    document.getElementById('ver-arq').addEventListener('change', (ev) => { estado.verArquivados = ev.target.checked; App.paginas.projetos().catch(erro); });
  };

  /* =================================================================
     Editor de projeto
     ================================================================= */
  App.paginas.projeto = async function paginaProjeto() {
    const partes = location.hash.replace(/^#\/?/, '').split('/');
    const ctx = await carregarContexto();
    let ed;
    if (partes[1] === 'novo') {
      const modelo = partes[2] === 'catalogo' ? 'catalogo' : 'sob_medida';
      ed = { projeto: { nome: '', modelo, status: 'rascunho', versao: 1, referencias: [], horas_trabalho: 0, categoria_id: null, cliente_id: null, descricao_livre: '' }, componentes: [], preco: null };
      if (App.rascunhoAssistente) { Object.assign(ed, App.rascunhoAssistente); App.rascunhoAssistente = null; }
    } else {
      const id = partes[1];
      const [pj, cp, pr] = await Promise.all([
        sb.from('projetos').select('*').eq('id', id).maybeSingle(),
        sb.from('projeto_componentes').select('*').eq('projeto_id', id).order('ordem'),
        sb.from('precificacoes').select('*').eq('projeto_id', id).maybeSingle()
      ]);
      if (pj.error) throw pj.error;
      if (!pj.data) { area().innerHTML = '<div class="vazio">Projeto não encontrado.</div>'; return; }
      ed = { projeto: pj.data, componentes: (cp.data || []).map(({ tipo, descricao, material_id, trama_id, no_id, parametros }) => ({ tipo, descricao, material_id, trama_id, no_id, parametros: parametros || {} })), preco: pr.data };
    }
    const p = estado.perfil || {};
    ed.preco = Object.assign({
      metodo: ed.projeto.modelo === 'sob_medida' ? 'm2' : 'custo',
      horas: ed.projeto.horas_trabalho || 0, valor_hora: p.valor_hora || 0,
      deslocamento: 0, embalagem: 0, frete: 0,
      taxa_pct: p.taxa_maquininha_pct || 0, imposto_pct: p.imposto_pct || 0, margem_pct: p.margem_padrao_pct || 0,
      area_m2: null, valor_m2: null, preco_final: null, area_manual: false
    }, ed.preco || {});
    if (ed.preco.horas === undefined || ed.preco.horas === null) ed.preco.horas = ed.projeto.horas_trabalho || 0;
    ed.alterado = false;
    estado.editor = ed;
    renderEditor(ed, ctx);
  };

  function renderEditor(ed, ctx) {
    const pj = ed.projeto;
    const cats = ctx.categorias.filter((c) => c.modelo === 'ambos' || c.modelo === pj.modelo);
    area().innerHTML = `
      <div class="cabecalho">
        <div>
          <p style="margin:0 0 4px"><a href="#/projetos">← Projetos</a></p>
          <h1>${pj.id ? esc(pj.nome) : pj.modelo === 'catalogo' ? 'Nova peça de catálogo' : 'Novo projeto sob medida'}</h1>
          <p>${pj.id ? `<span class="selo status-${pj.status}">${STATUS[pj.status]}</span> · versão ${pj.versao}` : 'Preencha as partes da peça. O cálculo atualiza na hora.'}</p>
        </div>
        <div class="acoes" style="margin:0">
          ${pj.id ? `<button type="button" class="botao texto" id="bt-versao">Nova versão</button><button type="button" class="botao sec" id="bt-proposta">Criar proposta</button>` : ''}
          <button type="button" class="botao" id="bt-salvar">Salvar projeto</button>
        </div>
      </div>
      <div class="editor">
        <div>
          <section class="card">
            <h2>Dados do projeto</h2><p class="sub">Para quem é e o que é.</p>
            <div class="grade g2">
              ${campo('Nome do projeto', `<input id="pj-nome" value="${esc(pj.nome)}" placeholder="Ex.: Guarda-corpo beliche Flávia">`)}
              ${campo('Categoria', `<select id="pj-cat"><option value="">Escolha...</option>${opcoesLista(cats, pj.categoria_id)}</select>`)}
              ${campo('Cliente', `<div style="display:flex;gap:8px"><select id="pj-cli" style="flex:1"><option value="">Sem cliente ainda</option>${opcoesLista(ctx.clientes, pj.cliente_id)}</select><button type="button" class="botao sec peq" id="bt-novo-cli" title="Novo cliente">+</button></div>`)}
              ${campo('Status', `<select id="pj-status">${opcoes(STATUS, pj.status)}</select>`)}
            </div>
            <div style="margin-top:14px">${campo('Descrição livre', `<textarea id="pj-desc" rows="3" placeholder="O que não couber nas opções: detalhes, pedidos do cliente, ideias...">${esc(pj.descricao_livre)}</textarea>`)}</div>
            <div style="margin-top:14px" class="campo"><label>Fotos e referências</label>
              <div><input type="file" id="pj-fotos" accept="image/*" multiple class="sr-only"><label for="pj-fotos" class="botao sec peq">Adicionar fotos</label>
              <span class="ajuda" style="margin-left:8px">A primeira foto aparece na proposta.</span></div>
              <div class="miniaturas" id="pj-miniaturas"></div>
            </div>
          </section>

          <section class="card">
            <h2>Partes da peça</h2><p class="sub">Some as partes. Cada uma calcula o material que gasta.</p>
            <div id="lista-comp"></div>
            <div class="add-comp">
              ${Object.entries(TIPOS_COMP).filter(([k]) => k !== 'vao' || pj.modelo === 'sob_medida').map(([k, v]) => `<button type="button" class="botao sec peq" data-add="${k}" title="${esc(v.ajuda)}">+ ${v.rotulo}</button>`).join('')}
            </div>
          </section>

          <section class="card" id="sec-preco"></section>
        </div>
        <aside class="painel" id="painel"></aside>
      </div>`;

    const marcar = () => { ed.alterado = true; };
    const ligar = (id, campoNome, conv = (v) => v) => document.getElementById(id).addEventListener('input', (ev) => { pj[campoNome] = conv(ev.target.value); marcar(); });
    ligar('pj-nome', 'nome');
    ligar('pj-cat', 'categoria_id', (v) => v || null);
    ligar('pj-cli', 'cliente_id', (v) => v || null);
    ligar('pj-status', 'status');
    ligar('pj-desc', 'descricao_livre');
    document.getElementById('bt-novo-cli').addEventListener('click', () => {
      App.formCliente(null, ctx.clientes.filter((c) => c.tipo === 'arquiteto'), async () => {
        const { data } = await sb.from('clientes').select('*').eq('ativo', true).order('criado_em', { ascending: false });
        ctx.clientes = (data || []).sort((a, b) => a.nome.localeCompare(b.nome));
        const novo = (data || [])[0];
        const sel = document.getElementById('pj-cli');
        sel.innerHTML = `<option value="">Sem cliente ainda</option>${opcoesLista(ctx.clientes, novo && novo.id)}`;
        if (novo) { pj.cliente_id = novo.id; marcar(); }
      });
    });
    ligarFotos(ed);
    desenharComponentes(ed, ctx);
    desenharPreco(ed, ctx);
    recalcular(ed, ctx);

    area().querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
      const tipo = b.dataset.add;
      const c = { tipo, descricao: '', material_id: null, trama_id: null, no_id: null, parametros: {} };
      if (tipo === 'vao') {
        const zz = ctx.tramas.find((t) => t.tipo === 'vao_zigzag');
        c.trama_id = zz ? zz.id : null;
        c.parametros = { telas: 1, esp_min: 9, esp_max: 10, margem_cm: 2.5, ganchos_fornecidos: 'artesa', colocacao: 'artesa' };
      }
      if (tipo === 'trama') c.parametros = { pecas: 1 };
      ed.componentes.push(c);
      marcar();
      desenharComponentes(ed, ctx);
      recalcular(ed, ctx);
    }));

    document.getElementById('bt-salvar').addEventListener('click', () => salvar(ed, ctx));
    if (pj.id) {
      document.getElementById('bt-versao').addEventListener('click', () => novaVersao(ed, ctx));
      document.getElementById('bt-proposta').addEventListener('click', async () => {
        if (ed.alterado && !(await salvar(ed, ctx, true))) return;
        location.hash = '#/proposta/nova/' + pj.id;
      });
    }
  }

  /* ---------------- Fotos de referência ---------------- */
  async function ligarFotos(ed) {
    const pj = ed.projeto;
    const caixa = document.getElementById('pj-miniaturas');
    const desenhar = async () => {
      const refs = pj.referencias || [];
      if (!refs.length) { caixa.innerHTML = ''; return; }
      const { data } = await sb.storage.from('referencias').createSignedUrls(refs.map((r) => r.path), 3600);
      caixa.innerHTML = refs.map((r, i) => `<div class="foto"><img src="${esc(((data || [])[i] || {}).signedUrl || '')}" alt="Referência ${i + 1}"><button type="button" data-tirar="${i}">Remover</button></div>`).join('');
      caixa.querySelectorAll('[data-tirar]').forEach((b) => b.addEventListener('click', () => { pj.referencias.splice(Number(b.dataset.tirar), 1); ed.alterado = true; desenhar(); }));
    };
    document.getElementById('pj-fotos').addEventListener('change', async (ev) => {
      const uid = estado.sessao.user.id;
      for (const arq of Array.from(ev.target.files || [])) {
        if (arq.size > 8 * 1024 * 1024) { toast(`"${arq.name}" passa de 8 MB.`, true); continue; }
        const ext = (arq.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const up = await sb.storage.from('referencias').upload(path, arq, { contentType: arq.type });
        if (up.error) { erro(up.error); continue; }
        pj.referencias = [...(pj.referencias || []), { path, nome: arq.name }];
      }
      ed.alterado = true;
      ev.target.value = '';
      desenhar();
    });
    desenhar();
  }

  /* ---------------- Componentes ---------------- */
  function desenharComponentes(ed, ctx) {
    const caixa = document.getElementById('lista-comp');
    if (!ed.componentes.length) {
      caixa.innerHTML = `<div class="vazio" style="padding:22px">Nenhuma parte ainda. ${ed.projeto.modelo === 'sob_medida' ? 'Para guarda-corpo e telas, comece por <strong>Vão com ganchos</strong>.' : 'Comece por uma <strong>Trama</strong>.'}</div>`;
      return;
    }
    const fios = ctx.materiais.filter((m) => grupoDe(m.tipo_material_id) === 'fio');
    const acess = ctx.materiais.filter((m) => grupoDe(m.tipo_material_id) !== 'fio');
    const tramasIdx = ed.componentes.map((c, i) => (c.tipo === 'trama' ? i : -1)).filter((i) => i >= 0);
    const selMat = (lista, atual, nome = 'material_id') => `<select data-k="${nome}"><option value="">Escolha...</option>${opcoesLista(lista, atual, nomeMaterial)}</select>`;
    const semMat = (lista, tipo) => (lista.length ? '' : `<span class="ajuda" style="color:var(--perigo)">Nenhum ${tipo} na Biblioteca. <a href="#/biblioteca">Cadastrar</a></span>`);
    const n = (k, v, suf, extra = '') => `<div class="com-sufixo"><input type="number" step="any" data-k="${k}" value="${v ?? ''}" ${extra}><span>${suf}</span></div>`;
    const selAplicar = (c) => `<select data-k="aplicar_em"><option value="">${c.tipo === 'no' ? 'Nós avulsos (informo a quantidade)' : 'Fios próprios (informo quantos)'}</option>${tramasIdx.map((i) => `<option value="${i}" ${String(c.parametros.aplicar_em) === String(i) ? 'selected' : ''}>Nos fios da parte ${i + 1}: ${esc(ed.componentes[i].descricao || 'Trama')}</option>`).join('')}</select>`;

    caixa.innerHTML = ed.componentes.map((c, i) => {
      const p = c.parametros;
      let corpo = '';
      if (c.tipo === 'vao') {
        const vaoTramas = ctx.tramas.filter((t) => t.tipo !== 'geral');
        const forma = ((ctx.tramas.find((t) => t.id === c.trama_id) || {}).tipo) === 'vao_quadrado' ? 'quadrado' : 'zigzag';
        corpo = `
          <div class="grade g2">
            ${campo('Trama do vão', `<select data-k="trama_id">${opcoesLista(vaoTramas, c.trama_id)}</select>`)}
            ${campo('Corda', selMat(fios, c.material_id) + semMat(fios, 'fio'))}
          </div>
          <div class="grade g4" style="margin-top:14px">
            ${campo('Largura', n('largura_cm', p.largura_cm, 'cm'), 'Onde ficam os ganchos de cima e de baixo.')}
            ${campo('Altura', n('altura_cm', p.altura_cm, 'cm'))}
            ${campo('Telas iguais', n('telas', p.telas ?? 1, 'un.', 'min="1" step="1"'))}
            ${forma === 'zigzag' ? campo('Margem nas pontas', n('margem_cm', p.margem_cm ?? 2.5, 'cm')) : '<div></div>'}
            ${campo('Espaço mínimo', n('esp_min', p.esp_min ?? 9, 'cm'))}
            ${campo('Espaço máximo', n('esp_max', p.esp_max ?? 10, 'cm'))}
          </div>
          <div class="grade g3" style="margin-top:14px">
            ${campo('Gancho', `<select data-k="gancho_material_id"><option value="">Não cobrar ganchos</option>${opcoesLista(acess, p.gancho_material_id, nomeMaterial)}</select>`)}
            ${campo('Quem fornece os ganchos', `<select data-k="ganchos_fornecidos">${opcoes({ artesa: 'Eu', cliente: 'Cliente ou marceneiro' }, p.ganchos_fornecidos || 'artesa')}</select>`)}
            ${campo('Quem coloca os ganchos', `<select data-k="colocacao">${opcoes({ artesa: 'Eu', marceneiro: 'Marceneiro' }, p.colocacao || 'artesa')}</select>`)}
          </div>`;
      } else if (c.tipo === 'trama') {
        const gerais = ctx.tramas.filter((t) => t.tipo === 'geral');
        corpo = `
          <div class="grade g2">
            ${campo('Trama', `<select data-k="trama_id"><option value="">Escolha...</option>${opcoesLista(gerais, c.trama_id)}</select>` + (gerais.length ? '' : '<span class="ajuda" style="color:var(--perigo)">Nenhuma trama cadastrada. <a href="#/biblioteca">Cadastrar</a></span>'))}
            ${campo('Fio', selMat(fios, c.material_id) + semMat(fios, 'fio'))}
          </div>
          <div class="grade g3" style="margin-top:14px">
            ${campo('Largura da peça', n('largura_cm', p.largura_cm, 'cm'))}
            ${campo('Comprimento da trama', n('comprimento_cm', p.comprimento_cm, 'cm'))}
            ${campo('Peças iguais', n('pecas', p.pecas ?? 1, 'un.', 'min="1" step="1"'))}
          </div>`;
      } else if (c.tipo === 'trecho_sem_trama') {
        const proprio = !(p.aplicar_em !== undefined && p.aplicar_em !== '' && p.aplicar_em !== null);
        corpo = `
          <div class="grade g2">
            ${campo('Onde', selAplicar(c))}
            ${campo('Comprimento', n('comprimento_cm', p.comprimento_cm, 'cm por fio'))}
            ${proprio ? campo('Fio', selMat(fios, c.material_id)) + campo('Quantos fios', n('fios', p.fios, 'fios', 'step="1"')) : ''}
          </div>`;
      } else if (c.tipo === 'no') {
        const avulso = !(p.aplicar_em !== undefined && p.aplicar_em !== '' && p.aplicar_em !== null);
        corpo = `
          <div class="grade g2">
            ${campo('Nó', `<select data-k="no_id"><option value="">Escolha...</option>${opcoesLista(estado.nos, c.no_id)}</select>`)}
            ${campo('Onde', selAplicar(c))}
            ${avulso ? campo('Fio', selMat(fios, c.material_id)) + campo('Quantidade de nós', n('quantidade', p.quantidade, 'nós', 'step="1"')) : campo('Nós em cada fio', n('nos_por_fio', p.nos_por_fio, 'nós', 'step="1"'))}
          </div>`;
      } else if (c.tipo === 'acessorio') {
        corpo = `
          <div class="grade g2">
            ${campo('Acessório', selMat(acess, c.material_id) + semMat(acess, 'acessório'))}
            ${campo('Quantidade', n('quantidade', p.quantidade, 'un.', 'step="1"'))}
          </div>`;
      }
      return `
        <div class="comp" data-i="${i}">
          <div class="comp-topo">
            <span class="tipo">${i + 1} · ${TIPOS_COMP[c.tipo].rotulo}</span>
            <input data-k="descricao" value="${esc(c.descricao)}" placeholder="Nome desta parte (opcional)" style="border:0;background:transparent;font-weight:700;color:var(--terracota-esc);flex:1;min-width:0;padding:4px">
            <div class="direita">
              <button type="button" class="botao texto peq" data-mover="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
              <button type="button" class="botao texto peq" data-mover="1" ${i === ed.componentes.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
              <button type="button" class="botao texto peq" data-remover aria-label="Remover">Remover</button>
            </div>
          </div>
          <div class="comp-corpo">${corpo}<div class="comp-res" id="res-${i}"></div></div>
        </div>`;
    }).join('');

    const RAIZ = ['material_id', 'trama_id', 'no_id', 'descricao'];
    const ESTRUTURA = ['aplicar_em', 'trama_id'];
    caixa.querySelectorAll('.comp').forEach((card) => {
      const i = Number(card.dataset.i);
      const c = ed.componentes[i];
      card.querySelectorAll('[data-k]').forEach((el) => {
        const k = el.dataset.k;
        const evento = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evento, () => {
          let v = el.value;
          if (el.type === 'number') v = valorNum(v);
          if (RAIZ.includes(k)) c[k] = v || (k === 'descricao' ? '' : null);
          else c.parametros[k] = v === '' ? null : v;
          ed.alterado = true;
          if (ESTRUTURA.includes(k)) desenharComponentes(ed, ctx);
          recalcular(ed, ctx);
        });
      });
      card.querySelector('[data-remover]').addEventListener('click', () => {
        if (!confirm('Remover esta parte?')) return;
        ed.componentes.splice(i, 1);
        // reajusta referências "aplicar_em"
        ed.componentes.forEach((o) => {
          const a = o.parametros.aplicar_em;
          if (a === null || a === undefined || a === '') return;
          if (Number(a) === i) o.parametros.aplicar_em = null;
          else if (Number(a) > i) o.parametros.aplicar_em = Number(a) - 1;
        });
        ed.alterado = true;
        desenharComponentes(ed, ctx);
        recalcular(ed, ctx);
      });
      card.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => {
        const j = i + Number(b.dataset.mover);
        const lista = ed.componentes;
        [lista[i], lista[j]] = [lista[j], lista[i]];
        lista.forEach((o) => {
          const a = o.parametros.aplicar_em;
          if (a === null || a === undefined || a === '') return;
          if (Number(a) === i) o.parametros.aplicar_em = j; else if (Number(a) === j) o.parametros.aplicar_em = i;
        });
        ed.alterado = true;
        desenharComponentes(ed, ctx);
        recalcular(ed, ctx);
      }));
    });
  }

  /* ---------------- Cálculo ao vivo ---------------- */
  function recalcular(ed, ctx) {
    const calc = window.Calc.calcularProjeto(ed.componentes, ctx);
    ed.calculo = calc;
    const acharMat = (id) => ctx.materiais.find((m) => m.id === id);
    ed.componentes.forEach((c, i) => {
      const caixa = document.getElementById('res-' + i);
      if (!caixa) return;
      const r = calc.componentes[i] || {};
      if (r.erro) { caixa.innerHTML = `<div class="erro-msg">${esc(r.erro)}</div>`; return; }
      if (r.incluido_em !== undefined) { caixa.innerHTML = `<div class="calculo">Somado em cada fio da parte ${r.incluido_em + 1}.</div>`; return; }
      if (c.tipo === 'vao') {
        if (!r.ganchos) { caixa.innerHTML = ''; return; }
        const g = r.ganchos;
        const gTxt = r.forma === 'zigzag'
          ? `${g.cima} em cima + ${g.baixo} embaixo, a cada <strong>${numero(g.espacamento_cm)} cm</strong> (margem de ${numero(g.margem_cm)} cm)`
          : `${g.cima} em cima, ${g.baixo} embaixo, ${g.esquerda} em cada lateral · largura a cada <strong>${numero(g.espacamento_largura_cm)} cm</strong>, altura a cada <strong>${numero(g.espacamento_altura_cm)} cm</strong>`;
        caixa.innerHTML = `
          <div class="calculo">
            <div><strong>${g.total} ganchos</strong>${r.telas > 1 ? ` (${g.por_tela} por tela)` : ''}: ${gTxt}</div>
            <div style="margin-top:6px"><strong>${numero(r.metros)} m de corda</strong> · área ${numero(r.area_m2, 4)} m²</div>
            <div style="margin-top:6px">${r.cortes.map((k) => `${k.quantidade}× ${esc(k.descricao.toLowerCase())} de ${numero(k.comprimento_m)} m${k.emendas ? ` (${k.emendas} emenda${k.emendas > 1 ? 's' : ''})` : ''}`).join('<br>')}</div>
          </div>
          ${r.avisos && r.avisos.length ? `<div class="aviso" style="margin-top:8px">${r.avisos.map(esc).join('<br>')}</div>` : ''}
          <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700;color:var(--terracota)">Ver desenho</summary>
            <div class="desenho" style="margin-top:8px">${desenhoVao(r, c.parametros, { trama: true })}</div>
            ${ed.projeto.id ? `<p style="margin:8px 0 0"><a href="#/imprimir/ficha/${ed.projeto.id}/${i}" target="_blank">Abrir ficha do marceneiro</a> <span class="ajuda">(salve antes, se mudou algo)</span></p>` : '<p class="ajuda" style="margin:8px 0 0">Salve o projeto para gerar a ficha do marceneiro.</p>'}
          </details>`;
      } else if (c.tipo === 'trama') {
        if (!r.cortes) { caixa.innerHTML = ''; return; }
        caixa.innerHTML = `<div class="calculo">${r.tramas} tramas lado a lado → <strong>${r.fios_por_peca * r.pecas} fios de ${numero(r.cortes[0].comprimento_m)} m</strong> = <strong>${numero(r.metros)} m</strong><br>
          <span style="font-size:13px">Cada fio: ${numero(r.detalhe.trama_m)} m de trama${r.detalhe.extras_m ? ` + ${numero(r.detalhe.extras_m)} m de outras partes` : ''} + ${numero(r.detalhe.sobra_m)} m de sobra</span></div>`;
      } else if (c.tipo === 'trecho_sem_trama' && r.cortes) {
        caixa.innerHTML = `<div class="calculo">${r.cortes[0].quantidade} fios de ${numero(r.cortes[0].comprimento_m)} m = <strong>${numero(r.metros)} m</strong></div>`;
      } else if (c.tipo === 'no' && r.consumo_cm !== undefined) {
        caixa.innerHTML = `<div class="calculo">${numero(r.consumo_cm)} cm por nó = <strong>${numero(r.metros)} m</strong></div>`;
      } else if (c.tipo === 'acessorio' && c.material_id) {
        const m = acharMat(c.material_id);
        caixa.innerHTML = `<div class="calculo">${numero(r.unidades)} × ${moeda(m && m.custo_por_unidade)} = <strong>${moeda(r.unidades * ((m && m.custo_por_unidade) || 0))}</strong></div>`;
      } else caixa.innerHTML = '';
    });

    // área automática para o preço por m²
    if (!ed.preco.area_manual) {
      ed.preco.area_m2 = calc.area_m2 || null;
      const campoArea = document.getElementById('pr-area_m2');
      if (campoArea) campoArea.value = ed.preco.area_m2 ?? '';
    }
    desenharPainel(ed, ctx);
    atualizarPreco(ed);
  }

  function desenharPainel(ed, ctx) {
    const calc = ed.calculo;
    const painel = document.getElementById('painel');
    if (!painel) return;
    const acharMat = (id) => ctx.materiais.find((m) => m.id === id);
    const cortes = [];
    calc.componentes.forEach((r, i) => (r.cortes || []).forEach((k) => cortes.push({ ...k, parte: i + 1 })));
    painel.innerHTML = `
      <div class="card">
        <h3>Material</h3>
        ${calc.materiais.length ? `<div class="linhas">${calc.materiais.map((m) => {
          const mat = acharMat(m.material_id);
          return `<div><span>${esc(nomeMaterial(mat))}<br><span style="font-size:12px;color:var(--texto-2);font-weight:400">${numero(m.quantidade)} ${un(m.unidade, m.quantidade)}${m.rolos ? ` · ${m.rolos} rolo${m.rolos > 1 ? 's' : ''}` : ''}${m.falta ? ` · <span style="color:var(--perigo)">faltam ${numero(m.falta)} no estoque</span>` : ''}</span></span><span>${moeda(m.custo)}</span></div>`;
        }).join('')}<div class="total"><span>Custo do material</span><span>${moeda(calc.custo_material)}</span></div></div>` : '<p class="ajuda" style="margin:0;color:var(--texto-2)">Adicione as partes e escolha os materiais.</p>'}
      </div>
      ${calc.ganchos_total || calc.area_m2 ? `<div class="card"><div class="linhas">
        ${calc.ganchos_total ? `<div><span>Ganchos</span><span>${calc.ganchos_total}</span></div>` : ''}
        ${calc.area_m2 ? `<div><span>Área</span><span>${numero(calc.area_m2, 4)} m²</span></div>` : ''}
        <div><span>Corda total</span><span>${numero(calc.metros_total)} m</span></div>
        <div style="font-size:12px;color:var(--texto-2)"><span>Na proposta</span><span style="font-weight:400">${calc.metros_total ? Calc.arredondarCima(calc.metros_total, (estado.perfil || {}).arredondar_para) + ' m' : ''}${calc.ganchos_total ? ' · ' + Calc.arredondarCima(calc.ganchos_total, (estado.perfil || {}).arredondar_para) + ' ganchos' : ''}</span></div>
      </div></div>` : ''}
      ${cortes.length ? `<div class="card"><h3>Lista de corte</h3><div class="linhas">${cortes.map((k) => `<div><span>${k.quantidade}× ${esc(k.descricao)}<br><span style="font-size:12px;color:var(--texto-2);font-weight:400">parte ${k.parte}${k.emendas ? ` · ${k.emendas} emenda${k.emendas > 1 ? 's' : ''}` : ''}</span></span><span>${numero(k.comprimento_m)} m</span></div>`).join('')}</div></div>` : ''}
      ${calc.erros.length || calc.avisos.length ? `<div class="aviso">${[...calc.erros.map((e) => `Parte ${e.componente + 1}: ${e.erro}`), ...calc.avisos].map(esc).join('<br>')}</div>` : ''}
      <div class="card" id="painel-preco"></div>`;
  }

  /* ---------------- Preço ---------------- */
  function desenharPreco(ed) {
    const pr = ed.preco;
    const sec = document.getElementById('sec-preco');
    const n = (k, suf, ajuda = '', extra = '') => campo(
      { horas: 'Horas de trabalho', valor_hora: 'Valor da hora', deslocamento: 'Deslocamento', embalagem: 'Embalagem', frete: 'Frete', taxa_pct: 'Taxa da maquininha', imposto_pct: 'Imposto', margem_pct: 'Margem desejada', area_m2: 'Área', valor_m2: 'Valor do m²', preco_final: 'Preço final' }[k],
      `<div class="com-sufixo"><input type="number" step="any" id="pr-${k}" data-pr="${k}" value="${pr[k] ?? ''}" ${extra}><span>${suf}</span></div>`, ajuda);
    sec.innerHTML = `
      <h2>Preço</h2><p class="sub">Os valores padrão vêm das Configurações. Aqui você ajusta só para esta peça.</p>
      <div class="radios" style="margin-bottom:16px">
        <label><input type="radio" name="metodo" value="custo" ${pr.metodo !== 'm2' ? 'checked' : ''}> Pelo custo + margem</label>
        <label><input type="radio" name="metodo" value="m2" ${pr.metodo === 'm2' ? 'checked' : ''}> Por m²</label>
      </div>
      <div class="grade g4">
        ${pr.metodo === 'm2' ? n('area_m2', 'm²', 'Calculada pelos vãos. Pode ajustar.') + n('valor_m2', 'R$/m²') : ''}
        ${n('horas', 'h')}${n('valor_hora', 'R$/h')}
        ${n('deslocamento', 'R$')}${n('embalagem', 'R$')}${n('frete', 'R$')}
        ${n('taxa_pct', '%')}${n('imposto_pct', '%')}${pr.metodo !== 'm2' ? n('margem_pct', '%') : ''}
      </div>
      <div class="grade g2" style="margin-top:16px;align-items:end">
        ${n('preco_final', 'R$', 'Deixe vazio para usar o preço sugerido.')}
        <div><button type="button" class="botao sec peq" id="usar-sugerido">Usar o preço sugerido</button></div>
      </div>`;
    sec.querySelectorAll('[name=metodo]').forEach((r) => r.addEventListener('change', () => { pr.metodo = r.value; ed.alterado = true; desenharPreco(ed); atualizarPreco(ed); }));
    sec.querySelectorAll('[data-pr]').forEach((el) => el.addEventListener('input', () => {
      const k = el.dataset.pr;
      pr[k] = valorNum(el.value);
      if (k === 'area_m2') pr.area_manual = el.value !== '';
      if (k === 'horas') ed.projeto.horas_trabalho = pr[k] || 0;
      ed.alterado = true;
      atualizarPreco(ed);
    }));
    document.getElementById('usar-sugerido').addEventListener('click', () => { pr.preco_final = null; document.getElementById('pr-preco_final').value = ''; ed.alterado = true; atualizarPreco(ed); });
  }

  function atualizarPreco(ed) {
    const caixa = document.getElementById('painel-preco');
    if (!caixa || !ed.calculo) return;
    const r = window.Calc.calcularPreco({ ...ed.preco, custo_material: ed.calculo.custo_material });
    ed.resultadoPreco = r;
    const pr = ed.preco;
    caixa.innerHTML = `
      <h3>Preço</h3>
      <div class="linhas">
        <div><span>Material</span><span>${moeda(ed.calculo.custo_material)}</span></div>
        <div><span>Trabalho (${numero(pr.horas || 0)} h)</span><span>${moeda(r.custo_trabalho)}</span></div>
        ${r.extras ? `<div><span>Deslocamento, embalagem e frete</span><span>${moeda(r.extras)}</span></div>` : ''}
        <div class="total"><span>Custo total</span><span>${moeda(r.custo_total)}</span></div>
        <div style="margin-top:8px"><span>Sugerido ${pr.metodo === 'm2' ? `(${numero(pr.area_m2 || 0, 4)} m² × ${moeda(pr.valor_m2)}${r.extras ? ' + extras' : ''})` : `(margem de ${numero(pr.margem_pct)}%)`}</span><span>${r.preco_sugerido === null ? '-' : moeda(r.preco_sugerido)}</span></div>
        <div class="total"><span>Preço final</span><span>${moeda(r.preco_final)}</span></div>
        <div style="font-size:13px;color:var(--texto-2)"><span>Você recebe, tirando taxa e imposto</span><span>${moeda(r.recebe_liquido)}</span></div>
        <div style="font-size:13px;color:var(--texto-2)"><span>Lucro</span><span>${moeda(r.lucro)} (${numero(r.margem_real_pct, 1)}%)</span></div>
      </div>
      ${r.erro ? `<div class="erro-msg" style="margin-top:10px">${esc(r.erro)}</div>` : ''}
      ${r.preco_final > 0 && r.alerta_prejuizo ? `<div class="alerta-prejuizo" style="margin-top:10px">Atenção: com esse preço você tem prejuízo de ${moeda(-r.lucro)}.</div>` : ''}
      ${pr.metodo === 'm2' && !r.alerta_prejuizo && r.preco_final > 0 && !Number(pr.horas) ? '<div class="aviso" style="margin-top:10px">Informe as horas de trabalho para ver o lucro real.</div>' : ''}`;
  }

  /* ---------------- Salvar ---------------- */
  async function salvar(ed, ctx, silencioso) {
    const pj = ed.projeto;
    if (!pj.nome || !pj.nome.trim()) { toast('Dê um nome ao projeto.', true); document.getElementById('pj-nome').focus(); return false; }
    const bt = document.getElementById('bt-salvar');
    if (bt) { bt.disabled = true; bt.textContent = 'Salvando...'; }
    try {
      const calc = ed.calculo || window.Calc.calcularProjeto(ed.componentes, ctx);
      const preco = ed.resultadoPreco || window.Calc.calcularPreco({ ...ed.preco, custo_material: calc.custo_material });
      let status = pj.status;
      if (status === 'rascunho' && ed.componentes.length && !calc.erros.length) status = 'calculado';
      const dados = {
        nome: pj.nome.trim(), modelo: pj.modelo, categoria_id: pj.categoria_id || null, cliente_id: pj.cliente_id || null,
        descricao_livre: pj.descricao_livre || null, referencias: pj.referencias || [], horas_trabalho: ed.preco.horas || 0,
        status, versao: pj.versao || 1, projeto_origem_id: pj.projeto_origem_id || null,
        resumo_calculo: {
          metros_total: calc.metros_total, ganchos_total: calc.ganchos_total, area_m2: calc.area_m2, custo_material: calc.custo_material,
          materiais: calc.materiais.map((m) => ({ material_id: m.material_id, quantidade: m.quantidade, unidade: m.unidade, custo: m.custo })),
          vaos: ed.componentes.map((c, i) => (c.tipo === 'vao' && calc.componentes[i].ganchos ? { largura_cm: c.parametros.largura_cm, altura_cm: c.parametros.altura_cm, telas: calc.componentes[i].telas, forma: calc.componentes[i].forma, colocacao: c.parametros.colocacao, ganchos_fornecidos: c.parametros.ganchos_fornecidos } : null)).filter(Boolean),
          preco_final: preco.preco_final
        }
      };
      let id = pj.id;
      if (id) { const r = await sb.from('projetos').update(dados).eq('id', id); if (r.error) throw r.error; }
      else { const r = await sb.from('projetos').insert(dados).select('id').single(); if (r.error) throw r.error; id = r.data.id; }

      const del = await sb.from('projeto_componentes').delete().eq('projeto_id', id);
      if (del.error) throw del.error;
      if (ed.componentes.length) {
        const linhas = ed.componentes.map((c, i) => ({ projeto_id: id, ordem: i, tipo: c.tipo, descricao: c.descricao || null, material_id: c.material_id || null, trama_id: c.trama_id || null, no_id: c.no_id || null, parametros: c.parametros || {}, resultado: calc.componentes[i] ? { ...calc.componentes[i], trechos: undefined } : {} }));
        const ins = await sb.from('projeto_componentes').insert(linhas);
        if (ins.error) throw ins.error;
      }
      const pr = ed.preco;
      const precoDados = {
        projeto_id: id, metodo: pr.metodo, custo_material: calc.custo_material, horas: pr.horas || 0, valor_hora: pr.valor_hora || 0,
        custo_trabalho: preco.custo_trabalho, deslocamento: pr.deslocamento || 0, embalagem: pr.embalagem || 0, frete: pr.frete || 0,
        taxa_pct: pr.taxa_pct || 0, imposto_pct: pr.imposto_pct || 0, margem_pct: pr.margem_pct || 0,
        area_m2: pr.area_m2, valor_m2: pr.valor_m2, preco_sugerido: preco.preco_sugerido || 0, preco_final: preco.preco_final || 0,
        alerta_prejuizo: !!preco.alerta_prejuizo
      };
      const ex = await sb.from('precificacoes').select('id').eq('projeto_id', id).maybeSingle();
      const rp = ex.data ? await sb.from('precificacoes').update(precoDados).eq('id', ex.data.id) : await sb.from('precificacoes').insert(precoDados);
      if (rp.error) throw rp.error;
      ed.alterado = false;
      if (!silencioso) toast('Projeto salvo.');
      if (!pj.id) { location.hash = '#/projeto/' + id; return true; }
      pj.status = status;
      if (!silencioso) App.paginas.projeto().catch(erro);
      return true;
    } catch (e) { erro(e); return false; } finally { if (bt) { bt.disabled = false; bt.textContent = 'Salvar projeto'; } }
  }

  async function novaVersao(ed, ctx) {
    if (!confirm('Criar uma nova versão deste projeto? A versão atual fica guardada como está.')) return;
    if (ed.alterado && !(await salvar(ed, ctx, true))) return;
    const pj = ed.projeto;
    const origem = pj.projeto_origem_id || pj.id;
    const { data: irmaos } = await sb.from('projetos').select('versao').or(`id.eq.${origem},projeto_origem_id.eq.${origem}`);
    const versao = Math.max(...(irmaos || [{ versao: pj.versao }]).map((x) => x.versao)) + 1;
    estado.editor = null;
    App.rascunhoAssistente = null;
    const novo = { ...ed, projeto: { ...pj, id: undefined, versao, projeto_origem_id: origem, status: 'rascunho' } };
    novo.alterado = true;
    renderEditor(novo, ctx);
    toast(`Versão ${versao} criada. Ajuste e salve.`);
  }

  /* =================================================================
     Ficha do marceneiro (impressão)
     ================================================================= */
  App.imprimirFicha = async function (projetoId, idx) {
    const ctx = await carregarContexto();
    const [pj, cp] = await Promise.all([
      sb.from('projetos').select('*, clientes(nome, cidade)').eq('id', projetoId).maybeSingle(),
      sb.from('projeto_componentes').select('*').eq('projeto_id', projetoId).order('ordem')
    ]);
    if (pj.error) throw pj.error;
    const comps = (cp.data || []).map((c) => ({ ...c, parametros: c.parametros || {} }));
    const calc = window.Calc.calcularProjeto(comps, ctx);
    const c = comps[idx], r = calc.componentes[idx];
    const perfil = estado.perfil || {};
    if (!c || !r || !r.ganchos) return '<div class="folha"><p>Não encontrei o vão deste projeto.</p></div>';
    const p = c.parametros, g = r.ganchos;
    const tabela = (titulo, pos) => `<h3 style="margin:14px 0 6px;font-size:14px">${esc(titulo)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px">${chunk(pos, 10).map((linha, li) => `<tr>${linha.map((v, j) => `<td style="border:1px solid #ddd;padding:3px 4px;text-align:center"><span style="color:#999">${li * 10 + j + 1}</span><br><strong>${numero(v)}</strong></td>`).join('')}</tr>`).join('')}</table>`;
    const linhas = r.forma === 'zigzag'
      ? [['Trama', 'Zigzag'], ['Vão', `${numero(p.largura_cm)} × ${numero(p.altura_cm)} cm`], ['Telas', r.telas], ['Ganchos por tela', `${g.cima} em cima + ${g.baixo} embaixo`], ['Total de ganchos', g.total], ['Margem nas pontas', `${numero(g.margem_cm)} cm`], ['Espaço entre ganchos', `${numero(g.espacamento_cm)} cm`]]
      : [['Trama', 'Quadrado'], ['Vão', `${numero(p.largura_cm)} × ${numero(p.altura_cm)} cm`], ['Telas', r.telas], ['Ganchos por tela', `${g.cima} em cima, ${g.baixo} embaixo, ${g.esquerda} em cada lateral`], ['Total de ganchos', g.total], ['Espaço na largura', `${numero(g.espacamento_largura_cm)} cm`], ['Espaço na altura', `${numero(g.espacamento_altura_cm)} cm`], ['Cantos', 'sem gancho']];
    return `
      <div class="folha" style="font-size:13px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${esc(perfil.cor_primaria || '#B5460A')};padding-bottom:10px;margin-bottom:14px">
          <div><div style="font-size:11px;letter-spacing:.3em;color:#6b5646">FICHA TÉCNICA · FURAÇÃO</div><h1 style="font-size:24px;margin-top:4px;color:${esc(perfil.cor_primaria || '#B5460A')}">${esc(pj.data.nome)}</h1>
          <div style="color:#6b5646">${esc([pj.data.clientes && pj.data.clientes.nome, pj.data.clientes && pj.data.clientes.cidade].filter(Boolean).join(' · '))}${c.descricao ? ' · ' + esc(c.descricao) : ''}</div></div>
          ${perfil.logo_url ? `<img src="${esc(perfil.logo_url)}" style="max-height:48px;max-width:140px;background:${esc(perfil.cor_primaria || '#B5460A')};padding:6px;border-radius:6px">` : `<strong>${esc(perfil.nome_marca || '')}</strong>`}
        </div>
        <table style="border-collapse:collapse;margin-bottom:12px">${linhas.map(([k, v]) => `<tr><td style="padding:3px 18px 3px 0;color:#6b5646">${esc(k)}</td><td style="padding:3px 0;font-weight:700">${esc(String(v))}</td></tr>`).join('')}</table>
        <div style="border:1px solid #ddd;border-radius:6px;padding:6px">${desenhoVao(r, p, { largura: 640, altura: 430, cor: perfil.cor_primaria })}</div>
        ${r.forma === 'zigzag' ? tabela('Posição de cada furo, medida da borda esquerda (cm). Igual em cima e embaixo.', g.posicoes_cm)
          : tabela('Em cima e embaixo: posição medida da borda esquerda (cm)', g.posicoes_largura_cm) + tabela('Laterais: posição medida da borda de cima (cm)', g.posicoes_altura_cm)}
        <p style="margin-top:auto;font-size:11px;color:#6b5646">Medidas calculadas para o vão informado. Se a medida da obra mudar, peça uma ficha nova. Emitida em ${new Date().toLocaleDateString('pt-BR')}.</p>
      </div>`;
  };
  function chunk(a, n) { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; }
})();
