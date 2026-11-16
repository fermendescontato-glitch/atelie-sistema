/* =====================================================================
   Assistente: conversa com a IA. A IA pergunta (com opções), pede
   cálculos à calculadora do sistema e abre o projeto no editor.
   ===================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { sb, estado, esc, moeda, numero, toast, erro, area } = App;

  const conv = { id: null, mensagens: [], pendentes: null, ctx: null, uso: null, ocupado: false };

  function contextoTexto(ctx) {
    const p = ctx.perfil || {};
    const nomeMat = (m) => [App.nomeTipo(m.tipo_material_id), m.espessura_mm ? m.espessura_mm + ' mm' : '', m.cor, m.marca].filter(Boolean).join(' ');
    const linhas = [];
    linhas.push(`Configurações: valor da hora R$ ${p.valor_hora || 0}; margem ${p.margem_padrao_pct || 0}%; taxa ${p.taxa_maquininha_pct || 0}%; imposto ${p.imposto_pct || 0}%; sobra por fio ${p.sobra_por_fio_cm ?? 10} cm; ponta ${p.ponta_cm ?? 20} cm; acabamento por gancho ${p.acabamento_gancho_m ?? 1} m.`);
    linhas.push('Materiais (id | descrição | unidade de uso | custo):');
    ctx.materiais.forEach((m) => linhas.push(`- ${m.id} | ${nomeMat(m)} | ${m.unidade_consumo} | R$ ${Number(m.custo_por_unidade || 0).toFixed(4)}`));
    if (!ctx.materiais.length) linhas.push('- (nenhum material cadastrado)');
    linhas.push('Tramas (id | nome | tipo | medidas):');
    ctx.tramas.forEach((t) => linhas.push(`- ${t.id} | ${t.nome} | ${t.tipo}${t.tipo === 'geral' ? ` | ${t.largura_trama_cm} cm, ${t.fios_por_trama} fios, ${t.rendimento_metros} m fazem ${t.rendimento_cm} cm` : ''}`));
    linhas.push('Nós (id | nome): ' + ctx.nos.map((n) => `${n.id} | ${n.nome}`).join('; '));
    linhas.push('Categorias (id | nome | modelo): ' + ctx.categorias.map((c) => `${c.id} | ${c.nome} | ${c.modelo}`).join('; '));
    linhas.push('Clientes (id | nome | cidade): ' + ctx.clientes.slice(0, 80).map((c) => `${c.id} | ${c.nome} | ${c.cidade || ''}`).join('; '));
    return linhas.join('\n');
  }

  /* ---------------- Ferramentas (rodam aqui, no navegador) ---------------- */
  function rodarCalcular(input) {
    const ctx = conv.ctx;
    const comps = (input.componentes || []).map((c) => ({ tipo: c.tipo, descricao: c.descricao || '', material_id: c.material_id || null, trama_id: c.trama_id || null, no_id: c.no_id || null, parametros: c.parametros || {} }));
    const calc = window.Calc.calcularProjeto(comps, ctx);
    const p = ctx.perfil || {};
    const pr = Object.assign({ metodo: 'custo', horas: 0, valor_hora: p.valor_hora || 0, taxa_pct: p.taxa_maquininha_pct || 0, imposto_pct: p.imposto_pct || 0, margem_pct: p.margem_padrao_pct || 0, area_m2: calc.area_m2 }, input.preco || {});
    const preco = window.Calc.calcularPreco({ ...pr, custo_material: calc.custo_material });
    return {
      partes: calc.componentes.map((r, i) => {
        const o = { parte: i, tipo: comps[i].tipo };
        if (r.erro) o.erro = r.erro;
        if (r.ganchos) o.ganchos = { ...r.ganchos, posicoes_cm: undefined, posicoes_largura_cm: undefined, posicoes_altura_cm: undefined };
        if (r.cortes) o.lista_de_corte = r.cortes;
        if (r.metros !== undefined) o.metros = r.metros;
        if (r.area_m2) o.area_m2 = r.area_m2;
        if (r.detalhe) o.detalhe = r.detalhe;
        if (r.avisos && r.avisos.length) o.avisos = r.avisos;
        return o;
      }),
      materiais: calc.materiais.map((m) => ({ material_id: m.material_id, quantidade: m.quantidade, unidade: m.unidade, custo: m.custo, rolos: m.rolos })),
      ganchos_total: calc.ganchos_total, area_m2: calc.area_m2, metros_total: calc.metros_total, custo_material: calc.custo_material,
      na_proposta: { metros: window.Calc.arredondarCima(calc.metros_total, p.arredondar_para), ganchos: window.Calc.arredondarCima(calc.ganchos_total, p.arredondar_para) },
      preco, avisos: calc.avisos
    };
  }

  function rodarMontar(input) {
    const p = estado.perfil || {};
    App.rascunhoAssistente = {
      projeto: {
        nome: input.nome || 'Projeto do assistente', modelo: input.modelo === 'catalogo' ? 'catalogo' : 'sob_medida', status: 'rascunho', versao: 1,
        referencias: [], categoria_id: input.categoria_id || null, cliente_id: input.cliente_id || null,
        descricao_livre: input.descricao_livre || '', horas_trabalho: (input.preco && input.preco.horas) || 0
      },
      componentes: (input.componentes || []).map((c) => ({ tipo: c.tipo, descricao: c.descricao || '', material_id: c.material_id || null, trama_id: c.trama_id || null, no_id: c.no_id || null, parametros: c.parametros || {} })),
      preco: Object.assign({ metodo: input.modelo === 'catalogo' ? 'custo' : 'm2', valor_hora: p.valor_hora || 0, taxa_pct: p.taxa_maquininha_pct || 0, imposto_pct: p.imposto_pct || 0, margem_pct: p.margem_padrao_pct || 0 }, input.preco || {})
    };
    return { ok: true, mensagem: 'Projeto pronto para abrir no editor. A artesã vai revisar e salvar.' };
  }

  /* ---------------- Conversa ---------------- */
  async function enviar() {
    if (conv.ocupado) return;
    conv.ocupado = true;
    desenharConversa();
    try {
      for (let volta = 0; volta < 6; volta++) {
        const { data, error } = await sb.functions.invoke('assistente', { body: { mensagens: conv.mensagens, contexto: contextoTexto(conv.ctx) } });
        if (error) {
          let msg = 'O assistente não respondeu.';
          try { const j = await error.context.json(); msg = j.erro || msg; } catch (_) { if (/Failed to send|fetch/i.test(error.message)) msg = 'O assistente ainda não foi instalado no Supabase, ou está sem conexão.'; }
          throw new Error(msg);
        }
        conv.uso = data.uso;
        conv.mensagens.push({ role: 'assistant', content: data.content });
        const usos = (data.content || []).filter((b) => b.type === 'tool_use');
        if (data.stop_reason !== 'tool_use' || !usos.length) break;
        // roda as ferramentas automáticas e guarda as perguntas
        const resultados = [];
        let pergunta = null;
        for (const u of usos) {
          if (u.name === 'calcular') resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(rodarCalcular(u.input)) });
          else if (u.name === 'montar_projeto') resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(rodarMontar(u.input)) });
          else if (u.name === 'perguntar') pergunta = u;
          else resultados.push({ type: 'tool_result', tool_use_id: u.id, content: 'Ferramenta desconhecida.', is_error: true });
        }
        if (pergunta) { conv.pendentes = { resultados, pergunta }; break; }
        conv.mensagens.push({ role: 'user', content: resultados });
      }
      await guardar();
    } catch (e) {
      toast(e.message, true);
      // desfaz a última mensagem da artesã para ela poder tentar de novo
      const ult = conv.mensagens[conv.mensagens.length - 1];
      if (ult && ult.role === 'user') conv.mensagens.pop();
    } finally {
      conv.ocupado = false;
      desenharConversa();
    }
  }

  function responder(texto, imagens = []) {
    texto = (texto || '').trim();
    if (!texto && !imagens.length) return;
    const blocos = [];
    // se a última resposta pediu ferramentas e não recebeu resultado, responde agora
    const ult = conv.mensagens[conv.mensagens.length - 1];
    if (!conv.pendentes && ult && ult.role === 'assistant' && Array.isArray(ult.content)) {
      ult.content.filter((x) => x.type === 'tool_use').forEach((u) => blocos.push({ type: 'tool_result', tool_use_id: u.id, content: u.name === 'calcular' ? JSON.stringify(rodarCalcular(u.input)) : JSON.stringify({ ok: true }) }));
    }
    if (conv.pendentes) {
      blocos.push(...conv.pendentes.resultados);
      blocos.push({ type: 'tool_result', tool_use_id: conv.pendentes.pergunta.id, content: texto || '(enviou imagem)' });
      conv.pendentes = null;
      imagens.forEach((im) => blocos.push(im));
    } else {
      imagens.forEach((im) => blocos.push(im));
      if (texto) blocos.push({ type: 'text', text: texto });
    }
    conv.mensagens.push({ role: 'user', content: blocos });
    enviar();
  }

  async function guardar() {
    const titulo = (() => { for (const m of conv.mensagens) if (m.role === 'user') { const t = (m.content || []).find((b) => b.type === 'text'); if (t) return t.text.slice(0, 80); } return 'Conversa'; })();
    // imagens não são guardadas (ocupam muito espaço)
    const leve = conv.mensagens.map((m) => ({ ...m, content: Array.isArray(m.content) ? m.content.map((b) => (b.type === 'image' ? { type: 'text', text: '[imagem enviada]' } : b)) : m.content }));
    if (conv.id) await sb.from('ia_conversas').update({ mensagens: leve, titulo }).eq('id', conv.id);
    else { const { data } = await sb.from('ia_conversas').insert({ mensagens: leve, titulo }).select('id').single(); if (data) conv.id = data.id; }
  }

  async function reduzirImagem(arquivo) {
    const url = URL.createObjectURL(arquivo);
    const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = url; });
    const max = 1024, f = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const dados = c.toDataURL('image/jpeg', 0.82).split(',')[1];
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dados } };
  }

  /* ---------------- Tela ---------------- */
  function bolhas() {
    const out = [];
    conv.mensagens.forEach((m) => {
      const blocos = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
      blocos.forEach((b) => {
        if (m.role === 'user' && b.type === 'text') out.push(`<div class="bolha eu">${esc(b.text)}</div>`);
        if (m.role === 'user' && b.type === 'image') out.push(`<div class="bolha eu"><img src="data:${b.source.media_type};base64,${b.source.data}" style="max-width:220px;border-radius:8px"></div>`);
        if (m.role === 'user' && b.type === 'tool_result' && !/^[{[]/.test(String(b.content))) out.push(`<div class="bolha eu">${esc(b.content)}</div>`);
        if (m.role === 'assistant' && b.type === 'text' && b.text.trim()) out.push(`<div class="bolha ela">${formatar(b.text)}</div>`);
        if (m.role === 'assistant' && b.type === 'tool_use' && b.name === 'perguntar') out.push(`<div class="bolha ela"><strong>${esc(b.input.pergunta)}</strong></div>`);
        if (m.role === 'assistant' && b.type === 'tool_use' && b.name === 'calcular') out.push('<div class="bolha sistema">Calculando com a calculadora do sistema...</div>');
        if (m.role === 'assistant' && b.type === 'tool_use' && b.name === 'montar_projeto') out.push(`<div class="bolha sistema">Projeto <strong>${esc(b.input.nome || '')}</strong> pronto. <a href="#/projeto/novo/${b.input.modelo === 'catalogo' ? 'catalogo' : 'sob_medida'}" data-abrir-rascunho>Abrir no editor para revisar e salvar</a></div>`);
      });
    });
    return out.join('');
  }

  function formatar(t) {
    return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function desenharConversa() {
    const caixa = document.getElementById('chat');
    if (!caixa) return;
    caixa.innerHTML = (conv.mensagens.length ? bolhas() : `<div class="bolha ela">Oi! Me conte o projeto: o que é, as medidas e o material. Pode mandar foto de referência também.</div>`)
      + (conv.ocupado ? '<div class="bolha sistema">Pensando...</div>' : '');
    const opc = document.getElementById('opcoes');
    opc.innerHTML = conv.pendentes && !conv.ocupado
      ? conv.pendentes.pergunta.input.opcoes.map((o) => `<button type="button" class="botao sec peq" data-op="${esc(o)}">${esc(o)}</button>`).join('')
      : '';
    opc.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => responder(b.dataset.op)));
    caixa.querySelectorAll('[data-abrir-rascunho]').forEach((a) => a.addEventListener('click', () => {
      // reaplica o último projeto montado
      const ult = [...conv.mensagens].reverse().flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((b) => b.type === 'tool_use' && b.name === 'montar_projeto');
      if (ult) rodarMontar(ult.input);
    }));
    caixa.scrollTop = caixa.scrollHeight;
    const u = document.getElementById('uso-ia');
    if (u && conv.uso) u.textContent = `${conv.uso.mensagens} de ${conv.uso.limite} mensagens neste mês`;
    const bt = document.getElementById('bt-enviar');
    if (bt) bt.disabled = conv.ocupado;
  }

  App.paginas.assistente = async function () {
    conv.ctx = await App.carregarContexto();
    const { data: antigas } = await sb.from('ia_conversas').select('id, titulo, atualizado_em').order('atualizado_em', { ascending: false }).limit(15);
    area().innerHTML = `
      <style>
        .chat-grade{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:20px}
        @media (max-width:1000px){.chat-grade{grid-template-columns:1fr}}
        #chat{height:min(62vh,640px);overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:16px;background:var(--branco);border:1px solid var(--linha);border-radius:var(--raio)}
        .bolha{max-width:78%;padding:10px 14px;border-radius:14px;line-height:1.5;font-size:15px}
        .bolha.ela{background:var(--creme-2);align-self:flex-start;border-bottom-left-radius:4px}
        .bolha.eu{background:var(--terracota);color:var(--creme);align-self:flex-end;border-bottom-right-radius:4px}
        .bolha.sistema{align-self:center;font-size:13px;color:var(--texto-2);background:none;padding:2px}
        #opcoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
        .entrada-chat{display:flex;gap:8px;margin-top:10px;align-items:flex-end}
        .entrada-chat textarea{flex:1;border:1px solid #cfc4b2;border-radius:10px;padding:10px 12px;min-height:48px;max-height:160px;resize:vertical;font:inherit}
      </style>
      <div class="cabecalho"><div><h1>Assistente</h1><p>Monte o projeto conversando. Os números saem sempre da calculadora do sistema.</p></div>
        <div class="acoes" style="margin:0;align-items:center"><span id="uso-ia" style="font-size:13px;color:var(--texto-2)"></span><button type="button" class="botao sec peq" id="bt-nova-conv">Nova conversa</button></div></div>
      <div class="chat-grade">
        <div>
          <div id="chat" aria-live="polite"></div>
          <div id="opcoes"></div>
          <div id="anexos" class="miniaturas"></div>
          <div class="entrada-chat">
            <input type="file" id="arq-chat" accept="image/*" multiple class="sr-only"><label for="arq-chat" class="botao sec" title="Anexar foto">Foto</label>
            <textarea id="txt-chat" placeholder="Escreva aqui... (Enter envia, Shift+Enter quebra linha)"></textarea>
            <button type="button" class="botao" id="bt-enviar">Enviar</button>
          </div>
        </div>
        <aside class="card" style="padding:16px"><h3>Conversas</h3>
          <div class="linhas" style="margin-top:8px">${(antigas || []).map((c) => `<a href="#" data-conv="${c.id}" style="display:block;padding:6px 0;border-bottom:1px solid var(--linha);text-decoration:none">${esc(c.titulo || 'Conversa')}<br><span style="font-size:12px;color:var(--texto-2)">${new Date(c.atualizado_em).toLocaleDateString('pt-BR')}</span></a>`).join('') || '<span style="color:var(--texto-2);font-size:13px">Nenhuma ainda.</span>'}</div>
        </aside>
      </div>`;
    let anexos = [];
    const txt = document.getElementById('txt-chat');
    const mandar = () => { if (conv.ocupado) return; const t = txt.value; const im = anexos; txt.value = ''; anexos = []; document.getElementById('anexos').innerHTML = ''; responder(t, im); };
    document.getElementById('bt-enviar').addEventListener('click', mandar);
    txt.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); mandar(); } });
    document.getElementById('arq-chat').addEventListener('change', async (ev) => {
      for (const f of Array.from(ev.target.files || []).slice(0, 3)) {
        try { anexos.push(await reduzirImagem(f)); } catch (_) { toast('Não consegui abrir a imagem.', true); }
      }
      ev.target.value = '';
      document.getElementById('anexos').innerHTML = anexos.map((a) => `<div class="foto"><img src="data:image/jpeg;base64,${a.source.data}"></div>`).join('');
    });
    document.getElementById('bt-nova-conv').addEventListener('click', () => { Object.assign(conv, { id: null, mensagens: [], pendentes: null }); desenharConversa(); });
    area().querySelectorAll('[data-conv]').forEach((a) => a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const { data } = await sb.from('ia_conversas').select('*').eq('id', a.dataset.conv).single();
      if (!data) return;
      Object.assign(conv, { id: data.id, mensagens: data.mensagens || [], pendentes: null });
      // se terminou numa pergunta, reabre as opções
      const ult = conv.mensagens[conv.mensagens.length - 1];
      const perg = ult && ult.role === 'assistant' && (ult.content || []).find((b) => b.type === 'tool_use' && b.name === 'perguntar');
      if (perg) conv.pendentes = { resultados: (ult.content || []).filter((b) => b.type === 'tool_use' && b.name !== 'perguntar').map((u) => ({ type: 'tool_result', tool_use_id: u.id, content: u.name === 'calcular' ? JSON.stringify(rodarCalcular(u.input)) : JSON.stringify({ ok: true }) })), pergunta: perg };
      desenharConversa();
    }));
    desenharConversa();
    txt.focus();
  };
})();
