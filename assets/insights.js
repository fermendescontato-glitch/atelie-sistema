/* =====================================================================
   Insights da Nath (só para o administrador)
   - O que as artesãs pedem e o sistema não faz, dúvidas frequentes,
     dificuldades, sugestões e tipos de peça novos
   - Avaliações 👍 👎 das respostas
   - Aprendizados aprovados, que entram nas respostas da Nath
   ===================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { sb, esc, numero, toast, erro, abrirModal, campo, area } = App;

  const TIPOS = { pedido_nao_atendido: 'Pedido que o sistema não faz', duvida_frequente: 'Dúvida frequente', dificuldade: 'Dificuldade de uso', sugestao: 'Sugestão', tipo_de_peca: 'Tipo de peça novo' };
  const CORES = { pedido_nao_atendido: 'status-pendente', duvida_frequente: 'status-pronto', dificuldade: 'status-pausado', sugestao: 'status-aprovado', tipo_de_peca: 'status-em_producao' };
  const data = (d) => new Date(d).toLocaleDateString('pt-BR');

  App.paginas.insights = async function () {
    if (!App.ehAdmin()) { area().innerHTML = '<div class="vazio">Esta área é só do administrador.</div>'; return; }
    const desde = new Date(Date.now() - 90 * 864e5).toISOString();
    const [ins, fb, con, perf, uso] = await Promise.all([
      sb.from('ia_insights').select('*').gte('criado_em', desde).order('criado_em', { ascending: false }),
      sb.from('ia_feedback').select('*').gte('criado_em', desde).order('criado_em', { ascending: false }),
      sb.from('ia_conhecimento').select('*').order('criado_em', { ascending: false }),
      sb.from('perfis').select('id, nome, nome_marca'),
      sb.from('ia_uso').select('*').order('mes', { ascending: false }).limit(50)
    ]);
    const insights = ins.data || [], feedback = fb.data || [], conhecimento = con.data || [], perfis = perf.data || [];
    const quem = (id) => { const p = perfis.find((x) => x.id === id); return p ? p.nome_marca || p.nome || '' : ''; };
    const abertos = insights.filter((i) => i.status === 'novo' || i.status === 'visto');
    const porTipo = {}; insights.forEach((i) => { porTipo[i.tipo] = (porTipo[i.tipo] || 0) + 1; });
    const temas = {}; insights.forEach((i) => { const t = (i.tema || i.descricao.slice(0, 40)).toLowerCase(); temas[t] = temas[t] || { n: 0, tipo: i.tipo, artesas: new Set() }; temas[t].n++; temas[t].artesas.add(i.artesa_id); });
    const topTemas = Object.entries(temas).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
    const pos = feedback.filter((f) => f.nota > 0).length, neg = feedback.filter((f) => f.nota < 0);
    const mesAtual = new Date().toISOString().slice(0, 7);
    const usoMes = (uso.data || []).filter((u) => String(u.mes).startsWith(mesAtual));

    area().innerHTML = `
      <div class="cabecalho"><div><h1>Insights da Nath</h1><p>O que as artesãs pedem, onde se confundem e como a Nath está respondendo. Últimos 90 dias. Só você vê esta página.</p></div>
        <button type="button" class="botao" id="novo-aprendizado">+ Novo aprendizado</button></div>
      <div class="indicadores" style="margin-top:0">
        ${Object.entries(TIPOS).map(([k, v]) => `<div class="indicador"><div class="rot">${esc(v)}</div><div class="val">${porTipo[k] || 0}</div></div>`).join('')}
      </div>
      <div class="indicadores">
        <div class="indicador"><div class="rot">Respostas aprovadas 👍</div><div class="val">${pos}</div></div>
        <div class="indicador"><div class="rot">Respostas ruins 👎</div><div class="val">${neg.length}</div></div>
        <div class="indicador"><div class="rot">Aprendizados ativos</div><div class="val">${conhecimento.filter((c) => c.ativo).length}</div></div>
        <div class="indicador"><div class="rot">Mensagens neste mês</div><div class="val">${usoMes.reduce((s, u) => s + Number(u.mensagens || 0), 0)}</div><div style="font-size:12px;color:var(--texto-2)">${usoMes.map((u) => `${esc(quem(u.artesa_id))}: ${u.mensagens}`).join(' · ')}</div></div>
      </div>

      <div class="grade g2" style="margin-top:20px;align-items:start">
        <section class="card">
          <h2>Temas que mais aparecem</h2><p class="sub">Bons candidatos para a próxima versão do sistema.</p>
          ${topTemas.length ? `<div class="linhas">${topTemas.map(([t, v]) => `<div style="padding:6px 0;border-bottom:1px solid var(--linha)"><span>${esc(t)}<br><span style="font-size:12px;color:var(--texto-2);font-weight:400">${esc(TIPOS[v.tipo] || '')} · ${v.artesas.size} artesã(s)</span></span><span>${v.n}×</span></div>`).join('')}</div>` : '<p class="ajuda" style="color:var(--texto-2)">Ainda sem observações.</p>'}
        </section>
        <section class="card">
          <h2>Respostas avaliadas como ruins</h2><p class="sub">Leia, corrija e transforme em aprendizado.</p>
          ${neg.length ? `<div class="linhas">${neg.slice(0, 15).map((f) => `<div style="padding:8px 0;border-bottom:1px solid var(--linha);display:block">
            <div style="font-size:12px;color:var(--texto-2)">${data(f.criado_em)} · ${esc(quem(f.artesa_id))}</div>
            ${f.comentario ? `<div style="font-weight:700;margin:2px 0">"${esc(f.comentario)}"</div>` : ''}
            <div style="font-size:13px;color:var(--texto-2);font-weight:400;white-space:pre-line">${esc((f.resposta || '').slice(0, 280))}${(f.resposta || '').length > 280 ? '…' : ''}</div>
            <button type="button" class="botao texto peq" data-fb-aprender="${f.id}">Virar aprendizado</button></div>`).join('')}</div>` : '<p class="ajuda" style="color:var(--texto-2)">Nenhuma resposta ruim. 🎉</p>'}
        </section>
      </div>

      <section class="card" style="margin-top:18px">
        <h2>Observações abertas</h2><p class="sub">Registradas pela Nath durante as conversas, sem dados de clientes.</p>
        ${abertos.length ? `<div class="tabela-rolagem"><table class="lista">
          <thead><tr><th>Tipo</th><th>Observação</th><th>Artesã</th><th>Data</th><th></th></tr></thead>
          <tbody>${abertos.map((i) => `<tr class="${i.status === 'visto' ? 'inativo' : ''}">
            <td><span class="selo ${CORES[i.tipo] || ''}">${esc(TIPOS[i.tipo] || i.tipo)}</span></td>
            <td>${i.tema ? `<strong>${esc(i.tema)}</strong><br>` : ''}${esc(i.descricao)}</td>
            <td>${esc(quem(i.artesa_id))}</td><td>${data(i.criado_em)}</td>
            <td style="white-space:nowrap"><button type="button" class="botao sec peq" data-aprender="${i.id}">Virar aprendizado</button>${i.status === 'novo' ? `<button type="button" class="botao texto peq" data-status="${i.id}" data-valor="visto">Visto</button>` : ''}<button type="button" class="botao texto peq" data-status="${i.id}" data-valor="descartado">Descartar</button></td>
          </tr>`).join('')}</tbody></table></div>` : '<p class="ajuda" style="color:var(--texto-2)">Nenhuma observação aberta.</p>'}
      </section>

      <section class="card" style="margin-top:18px">
        <h2>Aprendizados da Nath</h2><p class="sub">Orientações que você aprovou. Elas entram em todas as respostas da Nath, para todas as artesãs. Escreva de forma geral, sem dados de uma cliente específica.</p>
        ${conhecimento.length ? `<div class="linhas">${conhecimento.map((c) => `<div style="padding:8px 0;border-bottom:1px solid var(--linha);${c.ativo ? '' : 'opacity:.5'}"><span><strong>${esc(c.titulo)}</strong><br><span style="font-weight:400;font-size:14px;white-space:pre-line">${esc(c.conteudo)}</span></span>
          <span style="white-space:nowrap"><button type="button" class="botao texto peq" data-editar-ap="${c.id}">Editar</button><button type="button" class="botao texto peq" data-alt-ap="${c.id}" data-ativo="${c.ativo}">${c.ativo ? 'Desligar' : 'Ligar'}</button></span></div>`).join('')}</div>` : '<p class="ajuda" style="color:var(--texto-2)">Nenhum aprendizado ainda.</p>'}
      </section>`;

    const recarregar = () => App.paginas.insights().catch(erro);
    const formAprendizado = (ap, origem) => abrirModal({
      titulo: ap && ap.id ? 'Editar aprendizado' : 'Novo aprendizado',
      corpo: `${campo('Título', `<input name="titulo" value="${esc((ap && ap.titulo) || '')}" required>`)}
        <div style="margin-top:12px">${campo('Orientação para a Nath', `<textarea name="conteudo" rows="5">${esc((ap && ap.conteudo) || '')}</textarea>`, 'Ex.: "Para hang plant, sempre pergunte o diâmetro do vaso e quantos braços."', 'Escreva como uma regra ou dica que vale para todas as artesãs.')}</div>`,
      aoSalvar: async (d) => {
        const dados = { titulo: (d.get('titulo') || '').trim(), conteudo: (d.get('conteudo') || '').trim() };
        if (!dados.titulo || !dados.conteudo) throw new Error('Preencha o título e a orientação.');
        if (ap && ap.id) { const r = await sb.from('ia_conhecimento').update(dados).eq('id', ap.id); if (r.error) throw r.error; }
        else {
          const r = await sb.from('ia_conhecimento').insert({ ...dados, origem_id: origem || null });
          if (r.error) throw r.error;
          if (origem) await sb.from('ia_insights').update({ status: 'virou_aprendizado' }).eq('id', origem);
        }
        toast('Aprendizado salvo. A Nath já usa nas próximas respostas.');
        recarregar();
      }
    });
    document.getElementById('novo-aprendizado').addEventListener('click', () => formAprendizado(null));
    area().querySelectorAll('[data-aprender]').forEach((b) => b.addEventListener('click', () => {
      const i = insights.find((x) => x.id === b.dataset.aprender);
      formAprendizado({ titulo: i.tema || TIPOS[i.tipo], conteudo: i.descricao }, i.id);
    }));
    area().querySelectorAll('[data-fb-aprender]').forEach((b) => b.addEventListener('click', () => {
      const f = feedback.find((x) => x.id === b.dataset.fbAprender);
      formAprendizado({ titulo: f.comentario ? f.comentario.slice(0, 60) : 'Correção de resposta', conteudo: f.comentario ? `Quando a artesã perguntar algo parecido: ${f.comentario}` : '' });
    }));
    area().querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
      const r = await sb.from('ia_insights').update({ status: b.dataset.valor }).eq('id', b.dataset.status);
      if (r.error) return erro(r.error);
      recarregar();
    }));
    area().querySelectorAll('[data-editar-ap]').forEach((b) => b.addEventListener('click', () => formAprendizado(conhecimento.find((c) => c.id === b.dataset.editarAp))));
    area().querySelectorAll('[data-alt-ap]').forEach((b) => b.addEventListener('click', async () => {
      const r = await sb.from('ia_conhecimento').update({ ativo: b.dataset.ativo !== 'true' }).eq('id', b.dataset.altAp);
      if (r.error) return erro(r.error);
      recarregar();
    }));
  };
})();
