/* =====================================================================
   Nath · assistente do sistema
   - Entende o projeto que está na cabeça da artesã e cria no sistema
   - Pede tudo de uma vez, num formulário dentro do chat (economiza)
   - Tira dúvidas do ofício. Números sempre pela calculadora ou pela
     ferramenta de conta exata, nunca de cabeça.
   ===================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { sb, estado, esc, numero, toast, area } = App;

  const conv = { id: null, mensagens: [], pendentes: null, ctx: null, uso: null, ocupado: false };

  function contextoTexto(ctx) {
    const p = ctx.perfil || {};
    const nomeMat = (m) => [App.nomeTipo(m.tipo_material_id), m.espessura_mm ? m.espessura_mm + ' mm' : '', m.cor, m.marca].filter(Boolean).join(' ');
    const L = [];
    L.push(`Configurações: hora R$ ${p.valor_hora || 0}; margem ${p.margem_padrao_pct || 0}%; taxa ${p.taxa_maquininha_pct || 0}%; imposto ${p.imposto_pct || 0}%; sobra por fio ${p.sobra_por_fio_cm ?? 10} cm; ganchos: espaço ${p.esp_min_padrao ?? 9} a ${p.esp_max_padrao ?? 10} cm, margem ${p.margem_vao_cm ?? 2.5} cm, ponta ${p.ponta_cm ?? 20} cm, acabamento ${p.acabamento_gancho_m ?? 1} m por gancho.`);
    L.push('Materiais (id | descrição | unidade | custo por unidade):');
    ctx.materiais.forEach((m) => L.push(`- ${m.id} | ${nomeMat(m)} | ${m.unidade_consumo} | R$ ${Number(m.custo_por_unidade || 0).toFixed(4)}`));
    if (!ctx.materiais.length) L.push('- (nenhum material cadastrado)');
    L.push('Tramas (id | nome | tipo | medidas):');
    ctx.tramas.forEach((t) => L.push(`- ${t.id} | ${t.nome} | ${t.tipo}${t.tipo === 'geral' ? ` | ${t.largura_trama_cm} cm, ${t.fios_por_trama} fios, ${t.rendimento_metros} m fazem ${t.rendimento_cm} cm` : ''}`));
    L.push('Nós (id | nome): ' + ctx.nos.map((n) => `${n.id} | ${n.nome}`).join('; '));
    L.push('Tipos de peça (id | nome | família): ' + ctx.categorias.map((c) => `${c.id} | ${c.nome} | ${c.familia || 'livre'}`).join('; '));
    L.push('Clientes (id | nome | cidade): ' + ctx.clientes.slice(0, 80).map((c) => `${c.id} | ${c.nome} | ${c.cidade || ''}`).join('; '));
    return L.join('\n');
  }

  /* ---------------- Ferramentas (rodam aqui, no navegador) ---------------- */
  const normComp = (c) => ({ tipo: c.tipo, descricao: c.descricao || '', material_id: c.material_id || null, trama_id: c.trama_id || null, no_id: c.no_id || null, parametros: c.parametros || {} });

  function rodarCalcular(input) {
    const ctx = conv.ctx;
    const comps = (input.componentes || []).map(normComp);
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
        if (r.avisos && r.avisos.length) o.avisos = r.avisos;
        return o;
      }),
      materiais: calc.materiais.map((m) => ({ material_id: m.material_id, quantidade: m.quantidade, unidade: m.unidade, custo: m.custo, rolos: m.rolos })),
      ganchos_total: calc.ganchos_total, area_m2: calc.area_m2, metros_total: calc.metros_total, custo_material: calc.custo_material,
      na_proposta: { metros: window.Calc.arredondarCima(calc.metros_total, p.arredondar_para), ganchos: window.Calc.arredondarCima(calc.ganchos_total, p.arredondar_para) },
      preco, avisos: calc.avisos
    };
  }

  // Conta exata: só números, operações e algumas funções matemáticas.
  function rodarConta(input) {
    const exp = String(input.expressao || '').toLowerCase().replace(/\^/g, '**');
    const semFuncoes = exp.replace(/\b(sqrt|ceil|floor|round|min|max|abs|pow|pi)\b/g, '');
    if (!/^[0-9+\-*/().,%\s]*$/.test(semFuncoes) || /[a-z_$]/.test(semFuncoes)) return { erro: 'Expressão inválida. Use só números com ponto decimal, + - * / ( ) e sqrt, ceil, floor, round, min, max, abs, pow, pi.' };
    try {
      const js = exp.replace(/\b(sqrt|ceil|floor|round|min|max|abs|pow)\b/g, 'Math.$1').replace(/\bpi\b/g, 'Math.PI');
      const v = Function('"use strict"; return (' + js + ');')();
      if (typeof v !== 'number' || !isFinite(v)) return { erro: 'A conta não deu um número válido.' };
      return { descricao: input.descricao || '', expressao: input.expressao, resultado: Math.round(v * 10000) / 10000 };
    } catch (_) { return { erro: 'Não consegui fazer essa conta. Revise a expressão.' }; }
  }

  async function rodarCriarProjeto(input) {
    const ctx = conv.ctx;
    const p = estado.perfil || {};
    const cat = ctx.categorias.find((c) => c.id === input.categoria_id);
    const familia = (cat && cat.familia) || 'livre';
    const cliente = ctx.clientes.find((c) => c.id === input.cliente_id);
    const ed = {
      projeto: {
        nome: input.nome || [cat && cat.nome, cliente ? cliente.nome : 'Portfólio'].filter(Boolean).join(' · '),
        status: 'em_criacao', etapa: 5, versao: 1, referencias: [], categoria_id: cat ? cat.id : null,
        cliente_id: cliente ? cliente.id : null, para_portfolio: !cliente, descricao_livre: input.descricao_livre || '',
        horas_trabalho: (input.preco && input.preco.horas) || 0
      },
      componentes: (input.componentes || []).map(normComp),
      preco: Object.assign(App.precoPadrao(p, familia), input.preco || {})
    };
    const { id } = await App.gravarProjeto(ed, ctx);
    conv.ultimoProjeto = { id, nome: ed.projeto.nome };
    return { ok: true, projeto_id: id, mensagem: 'Projeto criado em Projetos, com status Em criação. A artesã revisa e conclui.' };
  }

  async function rodarFerramenta(u) {
    try {
      if (u.name === 'calcular') return JSON.stringify(rodarCalcular(u.input));
      if (u.name === 'conta') return JSON.stringify(rodarConta(u.input));
      if (u.name === 'criar_projeto') return JSON.stringify(await rodarCriarProjeto(u.input));
      return JSON.stringify({ erro: 'Ferramenta desconhecida.' });
    } catch (e) { return JSON.stringify({ erro: App.traduzErro(e) }); }
  }

  /* ---------------- Observações para melhorar o sistema ---------------- */
  const RX_OBS = /<obs\s+tipo="([^"]*)"(?:\s+tema="([^"]*)")?\s*>([\s\S]*?)<\/obs>/g;
  const TIPOS_OBS = ['pedido_nao_atendido', 'duvida_frequente', 'dificuldade', 'sugestao', 'tipo_de_peca'];
  function extrairObs(content) {
    const obs = [];
    (content || []).forEach((b) => { if (b.type === 'text') for (const m of b.text.matchAll(RX_OBS)) if (TIPOS_OBS.includes(m[1])) obs.push({ tipo: m[1], tema: (m[2] || '').slice(0, 80) || null, descricao: m[3].trim().slice(0, 600) }); });
    return obs;
  }
  const semObs = (t) => String(t || '').replace(RX_OBS, '').trim();

  async function avaliar(idxMsg, nota, botao) {
    const m = conv.mensagens[idxMsg];
    const texto = ((m && m.content) || []).filter((b) => b.type === 'text').map((b) => semObs(b.text)).join('\n').slice(0, 800);
    let comentario = null;
    if (nota < 0) comentario = prompt('O que faltou ou ficou errado nessa resposta? (opcional)') || null;
    const r = await sb.from('ia_feedback').insert({ conversa_id: conv.id, nota, resposta: texto, comentario });
    if (r.error) return App.erro(r.error);
    conv.avaliadas = conv.avaliadas || {};
    conv.avaliadas[idxMsg] = nota;
    toast(nota > 0 ? 'Obrigada! Isso ajuda a Nath a melhorar.' : 'Anotado. Vamos melhorar essa resposta.');
    desenharConversa();
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
          let msg = 'A Nath não respondeu agora.';
          try { const j = await error.context.json(); msg = j.erro || msg; } catch (_) { if (/Failed to send|fetch/i.test(error.message)) msg = 'A Nath ainda não foi instalada no Supabase, ou está sem conexão.'; }
          throw new Error(msg);
        }
        conv.uso = data.uso;
        conv.mensagens.push({ role: 'assistant', content: data.content });
        conv.obsPendentes = [...(conv.obsPendentes || []), ...extrairObs(data.content)];
        const usos = (data.content || []).filter((b) => b.type === 'tool_use');
        if (data.stop_reason !== 'tool_use' || !usos.length) break;
        const resultados = [];
        let formulario = null;
        for (const u of usos) {
          if (u.name === 'pedir_informacoes') formulario = u;
          else resultados.push({ type: 'tool_result', tool_use_id: u.id, content: await rodarFerramenta(u) });
        }
        if (formulario) { conv.pendentes = { resultados, formulario }; break; }
        conv.mensagens.push({ role: 'user', content: resultados });
      }
      await guardar();
      if (conv.obsPendentes && conv.obsPendentes.length) {
        const linhas = conv.obsPendentes.map((o) => ({ ...o, conversa_id: conv.id }));
        conv.obsPendentes = [];
        sb.from('ia_insights').insert(linhas).then(() => {});
      }
    } catch (e) {
      toast(e.message, true);
      const ult = conv.mensagens[conv.mensagens.length - 1];
      if (ult && ult.role === 'user') conv.mensagens.pop();
    } finally {
      conv.ocupado = false;
      desenharConversa();
    }
  }

  async function responder(texto, imagens = [], respostasForm = null) {
    texto = (texto || '').trim();
    if (!texto && !imagens.length && !respostasForm) return;
    const blocos = [];
    // última resposta pediu ferramentas e não recebeu resultado: responde agora
    const ult = conv.mensagens[conv.mensagens.length - 1];
    if (!conv.pendentes && ult && ult.role === 'assistant' && Array.isArray(ult.content)) {
      for (const u of ult.content.filter((x) => x.type === 'tool_use')) blocos.push({ type: 'tool_result', tool_use_id: u.id, content: u.name === 'pedir_informacoes' ? 'A artesã respondeu por texto.' : await rodarFerramenta(u) });
    }
    if (conv.pendentes) {
      blocos.push(...conv.pendentes.resultados);
      const conteudo = respostasForm ? JSON.stringify({ respostas: respostasForm, observacao: texto || undefined }) : texto || '(enviou imagem)';
      blocos.push({ type: 'tool_result', tool_use_id: conv.pendentes.formulario.id, content: conteudo });
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
    const titulo = (() => { for (const m of conv.mensagens) if (m.role === 'user' && Array.isArray(m.content)) { const t = m.content.find((b) => b.type === 'text'); if (t) return t.text.slice(0, 80); } return 'Conversa'; })();
    const leve = conv.mensagens.map((m) => ({ ...m, content: Array.isArray(m.content) ? m.content.map((b) => (b.type === 'image' ? { type: 'text', text: '[imagem enviada]' } : b)) : m.content }));
    if (conv.id) await sb.from('ia_conversas').update({ mensagens: leve, titulo, projeto_id: (conv.ultimoProjeto && conv.ultimoProjeto.id) || null }).eq('id', conv.id);
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
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] } };
  }

  /* ---------------- Tela ---------------- */
  function formatar(t) {
    return esc(String(t).replace(/\\n/g, '\n')).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function htmlFormulario(u, ativo) {
    const f = u.input || {};
    const campos = (f.campos || []).slice(0, 14);
    const c = (k) => `id="f-${esc(k.id)}" name="${esc(k.id)}" ${ativo ? '' : 'disabled'}`;
    return `<form class="formulario-chat" data-form="${esc(u.id)}">
      <h4>${esc(f.titulo || 'Preciso de algumas informações')}</h4>
      ${f.introducao ? `<p style="margin:0 0 12px;font-size:14px;color:var(--texto-2)">${esc(f.introducao)}</p>` : ''}
      <div class="grade g2">${campos.map((k) => {
        let ctl;
        if (k.tipo === 'opcoes' && Array.isArray(k.opcoes)) ctl = `<select ${c(k)}><option value="">Escolha...</option>${k.opcoes.map((o) => `<option>${esc(o)}</option>`).join('')}<option value="__outro">Outro (escrevo)</option></select><input data-outro="${esc(k.id)}" placeholder="Escreva aqui" style="display:none;margin-top:6px" ${ativo ? '' : 'disabled'}>`;
        else if (k.tipo === 'texto_longo') ctl = `<textarea rows="2" ${c(k)}></textarea>`;
        else if (k.tipo === 'numero') ctl = `<div class="com-sufixo"><input type="number" step="any" ${c(k)}><span>${esc(k.unidade || '')}</span></div>`;
        else ctl = `<input ${c(k)}>`;
        return `<div class="campo" ${k.tipo === 'texto_longo' ? 'style="grid-column:1/-1"' : ''}><label for="f-${esc(k.id)}">${esc(k.rotulo)}${k.obrigatorio ? ' *' : ''}${App.dica(k.ajuda || '')}</label>${ctl}</div>`;
      }).join('')}</div>
      ${ativo ? '<div class="acoes" style="margin-top:12px"><span class="ajuda" style="margin-right:auto;font-size:12px;color:var(--texto-2)">Não sabe algum? Deixe em branco.</span><button type="submit" class="botao">Enviar respostas</button></div>' : '<p class="ajuda" style="margin:8px 0 0;font-size:12px;color:var(--texto-2)">Respondido.</p>'}
    </form>`;
  }

  function bolhas() {
    const out = [];
    conv.mensagens.forEach((m, mi) => {
      const blocos = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
      blocos.forEach((b) => {
        if (m.role === 'user' && b.type === 'text') out.push(`<div class="bolha eu">${esc(b.text)}</div>`);
        if (m.role === 'user' && b.type === 'image' && b.source) out.push(`<div class="bolha eu"><img src="data:${b.source.media_type};base64,${b.source.data}" style="max-width:220px;border-radius:8px"></div>`);
        if (m.role === 'user' && b.type === 'tool_result') {
          let r = null; try { r = JSON.parse(b.content); } catch (_) { /* texto */ }
          if (r && r.respostas) out.push(`<div class="bolha eu">${Object.entries(r.respostas).filter(([, v]) => v !== '' && v !== null).map(([k, v]) => `${esc(k.replace(/_/g, ' '))}: <strong>${esc(v)}</strong>`).join('<br>')}${r.observacao ? '<br>' + esc(r.observacao) : ''}</div>`);
          else if (!r && b.content && !/^A artesã respondeu/.test(b.content)) out.push(`<div class="bolha eu">${esc(b.content)}</div>`);
        }
        if (m.role === 'assistant' && b.type === 'text' && semObs(b.text)) {
          const ultimoTexto = blocos.filter((x) => x.type === 'text' && semObs(x.text)).pop() === b;
          const av = (conv.avaliadas || {})[mi];
          out.push(`<div class="bolha ela">${formatar(semObs(b.text))}${ultimoTexto ? `<div class="avaliar"><button type="button" data-av="${mi}" data-nota="1" class="${av === 1 ? 'marcado' : ''}" aria-label="Resposta boa" ${av ? 'disabled' : ''}>👍</button><button type="button" data-av="${mi}" data-nota="-1" class="${av === -1 ? 'marcado' : ''}" aria-label="Resposta ruim" ${av ? 'disabled' : ''}>👎</button></div>` : ''}</div>`);
        }
        if (m.role === 'assistant' && b.type === 'tool_use' && b.name === 'pedir_informacoes') out.push(htmlFormulario(b, conv.pendentes && conv.pendentes.formulario.id === b.id && !conv.ocupado));
        if (m.role === 'assistant' && b.type === 'tool_use' && b.name === 'calcular') out.push('<div class="bolha sistema">Calculando com a calculadora do sistema...</div>');
        if (m.role === 'assistant' && b.type === 'tool_use' && b.name === 'conta') out.push(`<div class="bolha sistema">Conta exata: ${esc(b.input.expressao || '')}</div>`);
        if (m.role === 'user' && b.type === 'tool_result') {
          let r = null; try { r = JSON.parse(b.content); } catch (_) { /* */ }
          if (r && r.projeto_id) out.push(`<div class="bolha sistema">Projeto criado. <a href="#/projeto/${esc(r.projeto_id)}"><strong>Abrir o projeto para revisar e concluir</strong></a></div>`);
        }
      });
    });
    return out.join('');
  }

  function desenharConversa() {
    const caixa = document.getElementById('chat');
    if (!caixa) return;
    caixa.innerHTML = (conv.mensagens.length ? bolhas() : `<div class="bolha ela">Oi, eu sou a <strong>Nath</strong>! Me conte a peça que você quer criar, do seu jeito: o que é, para quem, tamanho, material. Pode mandar foto também.<br><br>Se for uma dúvida de técnica, conta, preço ou venda, pode perguntar.</div>`)
      + (conv.ocupado ? '<div class="bolha sistema">A Nath está pensando...</div>' : '');
    caixa.querySelectorAll('form[data-form]').forEach((form) => {
      form.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => { const o = form.querySelector(`[data-outro="${s.name}"]`); if (o) o.style.display = s.value === '__outro' ? 'block' : 'none'; }));
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (conv.ocupado) return;
        const respostas = {};
        const campos = (conv.pendentes && conv.pendentes.formulario.input.campos) || [];
        campos.forEach((k) => {
          const el = form.querySelector(`[name="${k.id}"]`);
          if (!el) return;
          let v = el.value;
          if (v === '__outro') v = (form.querySelector(`[data-outro="${k.id}"]`) || {}).value || '';
          respostas[k.id] = v;
        });
        responder('', [], respostas);
      });
    });
    caixa.querySelectorAll('[data-av]').forEach((bt) => bt.addEventListener('click', () => avaliar(Number(bt.dataset.av), Number(bt.dataset.nota), bt)));
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
        .entrada-chat{display:flex;gap:8px;margin-top:10px;align-items:flex-end}
        .entrada-chat textarea{flex:1;border:1px solid #cfc4b2;border-radius:10px;padding:10px 12px;min-height:48px;max-height:160px;resize:vertical;font:inherit}
      </style>
      <div class="cabecalho"><div><h1>Nath</h1><p>Sua assistente: monta o projeto com você e tira dúvidas do ofício. Os números saem sempre da calculadora.</p></div>
        <div class="acoes" style="margin:0;align-items:center"><span id="uso-ia" style="font-size:13px;color:var(--texto-2)"></span><button type="button" class="botao sec peq" id="bt-nova-conv">Nova conversa</button></div></div>
      <div class="chat-grade">
        <div>
          <div id="chat" aria-live="polite"></div>
          <div id="anexos" class="miniaturas"></div>
          <div class="entrada-chat">
            <input type="file" id="arq-chat" accept="image/*" multiple class="sr-only"><label for="arq-chat" class="botao sec" title="Anexar foto">Foto</label>
            <textarea id="txt-chat" placeholder="Escreva aqui... (Enter envia, Shift+Enter quebra linha)"></textarea>
            <button type="button" class="botao" id="bt-enviar">Enviar</button>
          </div>
          <p class="ajuda" style="font-size:12px;color:var(--texto-2);margin:8px 0 0">Suas conversas ajudam a melhorar a Nath e o sistema. Seus dados e os dos seus clientes nunca são mostrados para outras artesãs.</p>
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
    document.getElementById('bt-nova-conv').addEventListener('click', () => { Object.assign(conv, { id: null, mensagens: [], pendentes: null, ultimoProjeto: null, avaliadas: {} }); desenharConversa(); });
    area().querySelectorAll('[data-conv]').forEach((a) => a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const { data } = await sb.from('ia_conversas').select('*').eq('id', a.dataset.conv).single();
      if (!data) return;
      Object.assign(conv, { id: data.id, mensagens: data.mensagens || [], pendentes: null });
      const ult = conv.mensagens[conv.mensagens.length - 1];
      const form = ult && ult.role === 'assistant' && Array.isArray(ult.content) && ult.content.find((b) => b.type === 'tool_use' && b.name === 'pedir_informacoes');
      if (form) {
        const resultados = [];
        for (const u of ult.content.filter((b) => b.type === 'tool_use' && b.name !== 'pedir_informacoes')) resultados.push({ type: 'tool_result', tool_use_id: u.id, content: u.name === 'criar_projeto' ? JSON.stringify({ ok: true }) : await rodarFerramenta(u) });
        conv.pendentes = { resultados, formulario: form };
      }
      desenharConversa();
    }));
    desenharConversa();
    txt.focus();
  };

  // Exposto para testes
  App._nath = { rodarConta, rodarCalcular };
})();
