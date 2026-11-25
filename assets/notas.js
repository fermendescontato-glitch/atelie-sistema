/* =====================================================================
   Nota de compra: a artesã sobe o XML (NF-e), o PDF ou uma foto.
   - XML: lido aqui mesmo, sem IA.
   - PDF ou foto: a Nath lê e devolve os itens.
   A artesã confere item por item antes de salvar. Ao salvar: atualiza
   preço e estoque dos materiais, cadastra os novos e lança a despesa.
   ===================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { sb, estado, esc, moeda, numero, valorNum, toast, erro, campo, opcoes, opcoesLista, area } = App;

  const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const UN_CONSUMO = { metro: 'metros', grama: 'gramas', unidade: 'unidades' };

  function unidadeCompra(u) {
    const x = String(u || '').trim().toUpperCase();
    if (/^(RL|ROLO|ROL)/.test(x)) return 'rolo';
    if (/^(KG|KILO|QUILO)/.test(x)) return 'kg';
    if (/^(M|MT|MTS|METRO)S?$/.test(x)) return 'metro';
    if (/^(PCT|PACOTE|PC|PCS|CX|CAIXA|KIT)/.test(x)) return 'pacote';
    return 'unidade';
  }

  /* ---------------- Leitura do XML da NF-e ---------------- */
  function lerXML(texto) {
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Esse XML não pôde ser lido.');
    const tag = (raiz, nome) => { const el = raiz.getElementsByTagNameNS('*', nome)[0] || raiz.getElementsByTagName(nome)[0]; return el ? el.textContent.trim() : ''; };
    const dets = Array.from(doc.getElementsByTagNameNS('*', 'det'));
    if (!dets.length) throw new Error('Não encontrei itens nesse XML. Confira se é o XML da nota fiscal (NF-e).');
    const emit = doc.getElementsByTagNameNS('*', 'emit')[0] || doc;
    return {
      fornecedor: tag(emit, 'xFant') || tag(emit, 'xNome'),
      numero: tag(doc, 'nNF'),
      data: (tag(doc, 'dhEmi') || tag(doc, 'dEmi')).slice(0, 10),
      valor_total: Number(tag(doc, 'vNF')) || null,
      itens: dets.map((d) => ({
        descricao: tag(d, 'xProd'), quantidade: Number(tag(d, 'qCom')) || 1, unidade: tag(d, 'uCom'),
        valor_unitario: Number(tag(d, 'vUnCom')) || 0, valor_total: Number(tag(d, 'vProd')) || 0
      }))
    };
  }

  async function paraBase64(arquivo) {
    if (arquivo.type.startsWith('image/')) {
      const url = URL.createObjectURL(arquivo);
      const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = url; });
      const max = 1800, f = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      return { media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.88).split(',')[1] };
    }
    const dados = await new Promise((ok, falha) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = falha; fr.readAsDataURL(arquivo); });
    return { media_type: arquivo.type || 'application/pdf', data: dados };
  }

  // Sugere o material já cadastrado mais parecido com a descrição da nota
  function sugerir(descricao, materiais) {
    // Normaliza: sem acento, "8 mm" vira "8mm", compara pelo começo da palavra (corda ≈ cordão)
    const palavras = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/g, '$1$2').split(/[^a-z0-9.,]+/)
      .filter((w) => w.length >= 3 || /\d/.test(w)).map((w) => (/\d/.test(w) ? w : w.slice(0, 5)));
    const alvo = new Set(palavras(descricao));
    let melhor = null, nota = 0;
    materiais.forEach((m) => {
      const n = [...new Set(palavras(App.nomeMaterial(m)))].filter((w) => alvo.has(w)).length;
      if (n > nota) { nota = n; melhor = m; }
    });
    return nota >= 2 ? melhor : null;
  }

  /* ---------------- Página ---------------- */
  App.paginas.nota = async function () {
    const [{ data: mats }, { data: antigas }, { data: catFin }] = await Promise.all([
      sb.from('materiais').select('*').eq('ativo', true).order('criado_em'),
      sb.from('notas_compra').select('*').order('criado_em', { ascending: false }).limit(10),
      sb.from('categorias_financeiras').select('*').eq('ativo', true)
    ]);
    const materiais = mats || [];
    const catMaterial = (catFin || []).find((c) => /material/i.test(c.nome));
    const ed = { nota: null, itens: [], arquivo: null, caminho: null };

    area().innerHTML = `
      <div class="cabecalho"><div><p style="margin:0 0 4px"><a href="#/biblioteca">← Biblioteca</a></p><h1>Nota de compra</h1>
        <p>Suba a nota e o sistema preenche os materiais. Você confere item por item antes de salvar.</p></div></div>
      <section class="card" id="etapa-arquivo">
        <h2>1. Arquivo da nota</h2><p class="sub">XML da nota fiscal (o mais preciso), PDF ou foto da nota ou do cupom.</p>
        <input type="file" id="arq-nota" accept=".xml,text/xml,application/xml,application/pdf,image/*" class="sr-only">
        <label for="arq-nota" class="botao">Escolher arquivo</label>
        <span class="ajuda" style="margin-left:10px;color:var(--texto-2);font-size:13px">PDF e foto são lidos pela Nath e contam no limite mensal dela.</span>
        <div id="status-nota" style="margin-top:12px"></div>
      </section>
      <div id="etapa-itens"></div>
      ${(antigas || []).length ? `<section class="card"><h2>Notas já lançadas</h2><div class="linhas" style="margin-top:10px">${antigas.map((n) => `<div style="padding:6px 0;border-bottom:1px solid var(--linha)"><span>${esc(n.fornecedor || 'Fornecedor')}${n.numero ? ' · nº ' + esc(n.numero) : ''}<br><span style="font-size:12px;color:var(--texto-2);font-weight:400">${n.data_emissao ? new Date(n.data_emissao + 'T12:00').toLocaleDateString('pt-BR') : ''} · ${(n.itens || []).length} itens</span></span><span>${moeda(n.valor_total)}</span></div>`).join('')}</div></section>` : ''}`;

    const status = document.getElementById('status-nota');
    document.getElementById('arq-nota').addEventListener('change', async (ev) => {
      const arq = ev.target.files[0];
      if (!arq) return;
      if (arq.size > 10 * 1024 * 1024) { toast('O arquivo precisa ter até 10 MB.', true); return; }
      ed.arquivo = arq;
      status.innerHTML = '<div class="calculo">Lendo a nota...</div>';
      try {
        let nota;
        if (/xml/i.test(arq.type) || /\.xml$/i.test(arq.name)) nota = lerXML(await arq.text());
        else {
          const b64 = await paraBase64(arq);
          const { data, error } = await sb.functions.invoke('assistente', { body: { modo: 'nota', arquivo: b64 } });
          if (error) { let m = 'Não consegui ler a nota.'; try { m = (await error.context.json()).erro || m; } catch (_) { /* */ } throw new Error(m); }
          nota = data.nota || { itens: [] };
        }
        if (!(nota.itens || []).length) throw new Error('Não encontrei itens na nota. Tente outra foto, mais nítida, ou o XML.');
        ed.nota = nota;
        ed.itens = nota.itens.map((it) => {
          const sug = sugerir(it.descricao, materiais);
          const un = unidadeCompra(it.unidade);
          return {
            ...it, acao: sug ? 'existente' : 'novo', material_id: sug ? sug.id : '', sugerido: !!sug,
            rende: sug && sug.unidade_compra === un ? Number(sug.quantidade_por_compra) : (un === 'unidade' ? 1 : ''),
            atualizar_preco: true, conferido: false,
            novo: { tipo_material_id: '', descricao: it.descricao, espessura_mm: (String(it.descricao).match(/(\d+(?:[.,]\d+)?)\s*mm/i) || [])[1] || '', cor: '', unidade_compra: un, unidade_consumo: un === 'kg' ? 'metro' : un === 'unidade' || un === 'pacote' ? 'unidade' : 'metro' }
          };
        });
        status.innerHTML = `<div class="ok-msg">Li ${ed.itens.length} ${ed.itens.length === 1 ? 'item' : 'itens'}${nota.fornecedor ? ' de ' + esc(nota.fornecedor) : ''}. Confira cada um abaixo.</div>`;
        desenharItens();
      } catch (e) { status.innerHTML = `<div class="erro-msg">${esc(e.message)}</div>`; }
    });

    function desenharItens() {
      const caixa = document.getElementById('etapa-itens');
      const n = ed.nota;
      caixa.innerHTML = `
        <section class="card">
          <h2>2. Confira cada item</h2><p class="sub">Diga o que é cada item da nota. Marque "Conferido" quando estiver tudo certo.</p>
          ${ed.itens.map((it, i) => {
            const mat = materiais.find((m) => m.id === it.material_id);
            const unCons = it.acao === 'existente' ? (mat ? mat.unidade_consumo : 'unidade') : it.novo.unidade_consumo;
            return `<div class="comp" data-i="${i}" style="${it.acao === 'ignorar' ? 'opacity:.6' : ''}">
              <div class="comp-topo"><span class="tipo">Item ${i + 1}</span>
                <input data-f="descricao" value="${esc(it.descricao)}" style="border:0;background:transparent;font-weight:700;color:var(--terracota-esc);flex:1;min-width:0;padding:4px">
                <label style="display:flex;gap:6px;align-items:center;font-weight:700;font-size:13px;${it.conferido ? 'color:var(--ok)' : ''}"><input type="checkbox" data-f="conferido" ${it.conferido ? 'checked' : ''} ${it.acao === 'ignorar' ? 'disabled' : ''}> Conferido</label></div>
              <div class="comp-corpo">
                <div class="grade g4">
                  ${campo('Quantidade', `<input type="number" step="any" data-f="quantidade" value="${it.quantidade ?? ''}">`)}
                  ${campo('Unidade na nota', `<input data-f="unidade" value="${esc(it.unidade || '')}" placeholder="UN, RL, KG...">`)}
                  ${campo('Valor unitário', `<div class="com-sufixo"><input type="number" step="any" data-f="valor_unitario" value="${it.valor_unitario ?? ''}"><span>R$</span></div>`)}
                  ${campo('O que é', `<select data-f="acao">${opcoes({ existente: 'Material que já tenho', novo: 'Material novo', ignorar: 'Não é material (ignorar)' }, it.acao)}</select>`)}
                </div>
                ${it.acao === 'existente' ? `<div class="grade g3" style="margin-top:12px">
                  ${campo('Qual material', `<select data-f="material_id"><option value="">Escolha...</option>${opcoesLista(materiais, it.material_id, App.nomeMaterial)}</select>`, it.sugerido && it.material_id ? 'Sugestão pelo nome. Confira.' : '')}
                  ${campo(`Cada ${esc(it.unidade || 'unidade')} da nota rende`, `<div class="com-sufixo"><input type="number" step="any" data-f="rende" value="${it.rende ?? ''}"><span>${UN_CONSUMO[unCons] || ''}</span></div>`, '', 'Ex.: 1 rolo rende 180 metros; 1 pacote rende 50 unidades.')}
                  <div class="campo"><label>&nbsp;</label><label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" data-f="atualizar_preco" ${it.atualizar_preco ? 'checked' : ''}> Atualizar o preço do material</label></div>
                </div>` : ''}
                ${it.acao === 'novo' ? `<div class="grade g3" style="margin-top:12px">
                  ${campo('Tipo', `<select data-n="tipo_material_id" data-add-tabela="tipos_material"><option value="">Escolha...</option>${opcoesLista(estado.tiposMaterial, it.novo.tipo_material_id)}${App.opcaoAdicionar()}</select>`)}
                  ${campo('Descrição', `<input data-n="descricao" value="${esc(it.novo.descricao)}">`, '', 'O que diferencia este material dos outros do mesmo tipo.')}
                  ${campo('Cor', `<input data-n="cor" value="${esc(it.novo.cor)}">`)}
                  ${campo('Espessura', `<div class="com-sufixo"><input type="number" step="any" data-n="espessura_mm" value="${it.novo.espessura_mm}"><span>mm</span></div>`)}
                  ${campo(`Cada ${esc(it.unidade || 'unidade')} rende`, `<div class="com-sufixo"><input type="number" step="any" data-f="rende" value="${it.rende ?? ''}"><span>${UN_CONSUMO[it.novo.unidade_consumo]}</span></div>`)}
                  ${campo('Usado em', `<select data-n="unidade_consumo">${opcoes({ metro: 'metro', grama: 'grama', unidade: 'unidade' }, it.novo.unidade_consumo)}</select>`)}
                </div>` : ''}
                ${it.acao !== 'ignorar' && valorNum(it.rende) ? `<div class="calculo" style="margin-top:10px">Entra no estoque: <strong>${numero(Number(it.quantidade || 0) * Number(it.rende))} ${UN_CONSUMO[unCons] || ''}</strong> · custo de <strong>${moeda(Number(it.valor_unitario || 0) / Number(it.rende))}</strong> por ${unCons}</div>` : ''}
              </div></div>`;
          }).join('')}
        </section>
        <section class="card">
          <h2>3. Dados da nota</h2>
          <div class="grade g4" style="margin-top:12px">
            ${campo('Fornecedor', `<input id="nf-fornecedor" value="${esc(n.fornecedor || '')}">`)}
            ${campo('Número', `<input id="nf-numero" value="${esc(n.numero || '')}">`)}
            ${campo('Data', `<input type="date" id="nf-data" value="${esc(n.data || hojeISO())}">`)}
            ${campo('Valor total', `<div class="com-sufixo"><input type="number" step="any" id="nf-total" value="${n.valor_total ?? r2(ed.itens.reduce((s, x) => s + Number(x.valor_total || x.quantidade * x.valor_unitario || 0), 0))}"><span>R$</span></div>`)}
          </div>
          <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px">
            <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="nf-despesa" checked> Lançar no Financeiro como despesa (Material)</label>
            <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="nf-pago" checked> Já paguei</label>
          </div>
          <div class="acoes"><span id="nf-falta" style="margin-right:auto;font-size:14px;color:var(--texto-2)"></span><button type="button" class="botao" id="nf-salvar">Salvar nota</button></div>
        </section>`;

      const atualizarBotao = () => {
        const faltam = ed.itens.filter((x) => x.acao !== 'ignorar' && !x.conferido).length;
        document.getElementById('nf-falta').textContent = faltam ? `Falta conferir ${faltam} ${faltam === 1 ? 'item' : 'itens'}.` : 'Tudo conferido.';
        document.getElementById('nf-salvar').disabled = faltam > 0;
      };
      atualizarBotao();
      caixa.querySelectorAll('.comp').forEach((card) => {
        const it = ed.itens[Number(card.dataset.i)];
        card.querySelectorAll('[data-f]').forEach((el) => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'number' ? 'change' : 'input', () => {
          const k = el.dataset.f;
          it[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? valorNum(el.value) : el.value;
          if (k === 'material_id') { const m = materiais.find((x) => x.id === el.value); if (m && m.unidade_compra === unidadeCompra(it.unidade)) it.rende = Number(m.quantidade_por_compra); it.sugerido = false; }
          if (['acao', 'material_id', 'rende', 'quantidade', 'valor_unitario'].includes(k)) { if (k === 'acao' || k === 'material_id') it.conferido = false; desenharItens(); return; }
          atualizarBotao();
        }));
        card.querySelectorAll('[data-n]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          it.novo[el.dataset.n] = el.value;
          if (el.dataset.n === 'unidade_consumo') desenharItens();
        }));
      });
      document.getElementById('nf-salvar').addEventListener('click', salvar);
    }

    async function salvar() {
      const bt = document.getElementById('nf-salvar');
      bt.disabled = true;
      try {
        const uid = estado.sessao.user.id;
        const usados = ed.itens.filter((x) => x.acao !== 'ignorar');
        for (const it of usados) {
          if (!valorNum(it.rende)) throw new Error(`Item "${it.descricao}": informe quanto cada unidade da nota rende.`);
          if (it.acao === 'existente' && !it.material_id) throw new Error(`Item "${it.descricao}": escolha o material.`);
          if (it.acao === 'novo' && !it.novo.tipo_material_id) throw new Error(`Item "${it.descricao}": escolha o tipo do material.`);
        }
        // arquivo
        let caminho = null;
        if (ed.arquivo) {
          const ext = (ed.arquivo.name.split('.').pop() || 'bin').toLowerCase();
          caminho = `${uid}/${Date.now()}.${ext}`;
          const up = await sb.storage.from('notas').upload(caminho, ed.arquivo, { contentType: ed.arquivo.type || 'application/octet-stream' });
          if (up.error) caminho = null;
        }
        // materiais
        const registro = [];
        for (const it of usados) {
          const qtd = Number(it.quantidade || 0), rende = Number(it.rende), entrada = r2(qtd * rende);
          if (it.acao === 'existente') {
            const m = materiais.find((x) => x.id === it.material_id);
            const dados = { estoque_atual: r2(Number(m.estoque_atual || 0) + entrada) };
            if (it.atualizar_preco && Number(it.valor_unitario) > 0) { dados.preco_compra = Number(it.valor_unitario); dados.quantidade_por_compra = rende; dados.unidade_compra = unidadeCompra(it.unidade); }
            const r = await sb.from('materiais').update(dados).eq('id', m.id);
            if (r.error) throw r.error;
            registro.push({ ...it, material_id: m.id });
          } else {
            const r = await sb.from('materiais').insert({
              tipo_material_id: it.novo.tipo_material_id, descricao: it.novo.descricao || null, cor: it.novo.cor || null,
              espessura_mm: valorNum(it.novo.espessura_mm), marca: null,
              unidade_compra: unidadeCompra(it.unidade), preco_compra: Number(it.valor_unitario) || 0, quantidade_por_compra: rende,
              unidade_consumo: it.novo.unidade_consumo, estoque_atual: entrada, estoque_minimo: 0
            }).select('id').single();
            if (r.error) throw r.error;
            registro.push({ ...it, material_id: r.data.id });
          }
        }
        // despesa
        const total = valorNum(document.getElementById('nf-total').value) || 0;
        const data = document.getElementById('nf-data').value || hojeISO();
        const fornecedor = document.getElementById('nf-fornecedor').value.trim();
        const numeroNF = document.getElementById('nf-numero').value.trim();
        let despesaId = null;
        if (document.getElementById('nf-despesa').checked && total > 0) {
          const pago = document.getElementById('nf-pago').checked;
          const d = await sb.from('despesas').insert({ descricao: `Compra de material${fornecedor ? ' · ' + fornecedor : ''}${numeroNF ? ' · NF ' + numeroNF : ''}`, categoria_id: catMaterial ? catMaterial.id : null, valor: total, vencimento: data, status: pago ? 'pago' : 'pendente', pago_em: pago ? data : null }).select('id').single();
          if (d.error) throw d.error;
          despesaId = d.data.id;
        }
        const n = await sb.from('notas_compra').insert({ fornecedor: fornecedor || null, numero: numeroNF || null, data_emissao: data, valor_total: total, arquivo_path: caminho, itens: ed.itens.map((x) => ({ descricao: x.descricao, quantidade: x.quantidade, unidade: x.unidade, valor_unitario: x.valor_unitario, acao: x.acao, rende: x.rende, material_id: (registro.find((y) => y.descricao === x.descricao) || {}).material_id || null })), despesa_id: despesaId });
        if (n.error) throw n.error;
        toast(`Nota salva: ${registro.length} ${registro.length === 1 ? 'material atualizado' : 'materiais atualizados'}${despesaId ? ' e despesa lançada' : ''}.`);
        estado.abaBiblioteca = 'materiais';
        location.hash = '#/biblioteca';
      } catch (e) { erro(e); bt.disabled = false; }
    }
  };
})();
