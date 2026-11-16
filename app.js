/* =====================================================================
   Sistema de apoio a macrameiras · v0.1.0 (Fase 1, parte 1)
   Telas: Login, Início, Configurações, Biblioteca, Clientes
   ===================================================================== */
(function () {
  'use strict';

  window.__APP_OK__ = true;
  const App = (window.App = window.App || { paginas: {} });
  App.paginas = App.paginas || {};
  const cfg = window.APP_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  const estado = {
    sessao: null,
    perfil: null,
    tiposMaterial: [],
    nos: [],
    abaBiblioteca: 'materiais',
    mostrarInativos: false,
    buscaClientes: ''
  };

  const app = document.getElementById('app');

  /* ---------------------------------------------------------------
     Utilidades
     --------------------------------------------------------------- */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const numero = (v, casas = 2) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const valorNum = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(',', '.')); return isNaN(n) ? null : n; };

  const UNIDADES_COMPRA = { metro: 'metro', rolo: 'rolo', kg: 'kg', unidade: 'unidade', pacote: 'pacote' };
  const UNIDADES_CONSUMO = { metro: 'metro', grama: 'grama', unidade: 'unidade' };
  const TIPOS_TRAMA = { geral: 'Trama de peça', vao_zigzag: 'Vão · zigzag', vao_quadrado: 'Vão · quadrado' };
  const MODELOS = { sob_medida: 'Sob medida', catalogo: 'Catálogo', ambos: 'Ambos' };
  const TIPOS_CLIENTE = { cliente_final: 'Cliente final', arquiteto: 'Arquiteto(a)', loja: 'Loja' };

  let toastTimer;
  function toast(msg, erro = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast mostrar' + (erro ? ' erro' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  function traduzErro(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado. Fale com o administrador.';
    if (/row-level security/i.test(m)) return 'Você não tem permissão para alterar este item.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    return m;
  }

  function erro(e) { console.error(e); toast(traduzErro(e), true); }

  /* Janela (modal) com formulário */
  function abrirModal({ titulo, corpo, textoSalvar = 'Salvar', aoSalvar, aoAbrir }) {
    const fundo = document.createElement('div');
    fundo.className = 'fundo-modal';
    fundo.innerHTML = `
      <form class="modal" novalidate>
        <h2>${esc(titulo)}</h2>
        <div class="corpo">${corpo}</div>
        <div class="erro-msg" hidden></div>
        <div class="acoes">
          <button type="button" class="botao sec" data-fechar>Cancelar</button>
          <button type="submit" class="botao">${esc(textoSalvar)}</button>
        </div>
      </form>`;
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(); });
    fundo.querySelector('[data-fechar]').addEventListener('click', fechar);
    const form = fundo.querySelector('form');
    const caixaErro = fundo.querySelector('.erro-msg');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      caixaErro.hidden = true;
      const botao = form.querySelector('[type=submit]');
      botao.disabled = true;
      try {
        const ok = await aoSalvar(new FormData(form), form);
        if (ok !== false) fechar();
      } catch (e) {
        caixaErro.textContent = traduzErro(e);
        caixaErro.hidden = false;
      } finally {
        botao.disabled = false;
      }
    });
    document.body.appendChild(fundo);
    if (aoAbrir) aoAbrir(form);
    const primeiro = form.querySelector('input,select,textarea');
    if (primeiro) primeiro.focus();
  }

  const campo = (rotulo, html, ajuda = '') => `
    <div class="campo"><label>${esc(rotulo)}</label>${html}${ajuda ? `<span class="ajuda">${ajuda}</span>` : ''}</div>`;
  const entrada = (nome, valor = '', extra = '') => `<input name="${nome}" value="${esc(valor)}" ${extra}>`;
  const numeroCom = (nome, valor, sufixo, extra = '') => `
    <div class="com-sufixo"><input type="number" step="any" name="${nome}" value="${valor ?? ''}" ${extra}><span>${esc(sufixo)}</span></div>`;
  const opcoes = (mapa, atual) => Object.entries(mapa).map(([v, r]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${esc(r)}</option>`).join('');
  const opcoesLista = (lista, atual, rotulo = (x) => x.nome) => lista.map((x) => `<option value="${x.id}" ${x.id === atual ? 'selected' : ''}>${esc(rotulo(x))}</option>`).join('');

  /* ---------------------------------------------------------------
     Sessão e dados de base
     --------------------------------------------------------------- */
  async function carregarBase() {
    const uid = estado.sessao.user.id;
    const [p, t, n] = await Promise.all([
      sb.from('perfis').select('*').eq('id', uid).maybeSingle(),
      sb.from('tipos_material').select('*').eq('ativo', true).order('nome'),
      sb.from('nos').select('*').eq('ativo', true).order('nome')
    ]);
    if (p.error) throw p.error;
    estado.perfil = p.data;
    estado.tiposMaterial = t.data || [];
    estado.nos = n.data || [];
  }

  const ehAdmin = () => estado.perfil && estado.perfil.papel === 'admin';
  const ehMeu = (registro) => registro.artesa_id === estado.sessao.user.id;

  /* ---------------------------------------------------------------
     Login
     --------------------------------------------------------------- */
  function telaLogin() {
    app.innerHTML = `
      <main class="login">
        <form class="login-card" id="form-login" novalidate>
          <div class="marca">ATELIÊ</div>
          <h1>Entrar</h1>
          <p>Use o e-mail e a senha que você recebeu.</p>
          ${campo('E-mail', '<input type="email" name="email" autocomplete="username" required>')}
          ${campo('Senha', '<input type="password" name="senha" autocomplete="current-password" required>')}
          <div class="erro-msg" hidden></div>
          <button class="botao" type="submit">Entrar</button>
          <p style="font-size:13px">Esqueceu a senha? Fale com o administrador do sistema.</p>
        </form>
      </main>`;
    const form = document.getElementById('form-login');
    const caixa = form.querySelector('.erro-msg');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      caixa.hidden = true;
      const d = new FormData(form);
      if (!d.get('email') || !d.get('senha')) { caixa.textContent = 'Preencha o e-mail e a senha.'; caixa.hidden = false; return; }
      const botao = form.querySelector('button');
      botao.disabled = true; botao.textContent = 'Entrando...';
      const { error } = await sb.auth.signInWithPassword({ email: d.get('email').trim(), password: d.get('senha') });
      botao.disabled = false; botao.textContent = 'Entrar';
      if (error) { caixa.textContent = traduzErro(error); caixa.hidden = false; }
    });
  }

  /* ---------------------------------------------------------------
     Estrutura (menu + conteúdo)
     --------------------------------------------------------------- */
  const MENU = [
    { rota: 'inicio', rotulo: 'Início' },
    { rota: 'assistente', rotulo: 'Assistente' },
    { rota: 'projetos', rotulo: 'Projetos', tambem: ['projeto'] },
    { rota: 'propostas', rotulo: 'Propostas', tambem: ['proposta'] },
    { rota: 'clientes', rotulo: 'Clientes' },
    { rota: 'biblioteca', rotulo: 'Biblioteca' },
    { rota: 'configuracoes', rotulo: 'Configurações' }
  ];

  function rotaAtual() { return (location.hash.replace(/^#\/?/, '') || 'inicio').split('/')[0]; }

  function telaShell() {
    const atual = rotaAtual();
    if (atual === 'imprimir') { (App.paginas.imprimir || paginaEmBreve)().catch(erro); return; }
    const p = estado.perfil || {};
    app.innerHTML = `
      <div class="shell">
        <nav class="menu" aria-label="Menu principal">
          <div class="marca">ATELIÊ<strong>${esc(p.nome_marca || 'Meu ateliê')}</strong></div>
          ${MENU.map((m) => `<a href="#/${m.rota}" class="${m.rota === atual || (m.tambem || []).includes(atual) ? 'ativo' : ''}">${esc(m.rotulo)}${m.breve ? '<span class="em-breve">em breve</span>' : ''}</a>`).join('')}
          <div class="rodape">
            ${esc(p.nome || p.email || '')}${ehAdmin() ? ' · admin' : ''}<br>
            <button type="button" id="sair">Sair</button>
            <div style="margin-top:8px;opacity:.7">v${esc(cfg.versao)}</div>
          </div>
        </nav>
        <main class="conteudo" id="conteudo"><div class="carregando">Carregando...</div></main>
      </div>`;
    document.getElementById('sair').addEventListener('click', () => sb.auth.signOut());
    const paginas = Object.assign({ inicio: paginaInicio, clientes: paginaClientes, biblioteca: paginaBiblioteca, configuracoes: paginaConfiguracoes }, App.paginas);
    (paginas[atual] || paginaEmBreve)().catch(erro);
  }

  const area = () => document.getElementById('conteudo');

  /* ---------------------------------------------------------------
     Início
     --------------------------------------------------------------- */
  async function paginaInicio() {
    const p = estado.perfil || {};
    const [mat, tr, cli] = await Promise.all([
      sb.from('materiais').select('id, estoque_atual, estoque_minimo').eq('ativo', true),
      sb.from('tramas').select('id', { count: 'exact', head: true }).eq('ativo', true),
      sb.from('clientes').select('id', { count: 'exact', head: true }).eq('ativo', true)
    ]);
    const materiais = mat.data || [];
    const acabando = materiais.filter((m) => Number(m.estoque_minimo) > 0 && Number(m.estoque_atual) <= Number(m.estoque_minimo)).length;
    const pendencias = [];
    if (!Number(p.valor_hora)) pendencias.push('o valor da sua hora de trabalho');
    if (!p.logo_url) pendencias.push('o logo da sua marca');
    if (!materiais.length) pendencias.push('os materiais que você usa, com preço');

    area().innerHTML = `
      <div class="cabecalho"><div><h1>Olá${p.nome ? ', ' + esc(p.nome.split(' ')[0]) : ''}!</h1><p>O que vamos criar hoje?</p></div></div>
      ${pendencias.length ? `<div class="aviso" style="margin-bottom:20px">Para o sistema calcular e precificar certinho, complete ${pendencias.map(esc).join(', ')}. <a href="#/${!materiais.length && Number(p.valor_hora) && p.logo_url ? 'biblioteca' : 'configuracoes'}">Completar agora</a></div>` : ''}
      <div class="atalhos">
        <a class="atalho" href="#/projeto/novo/sob_medida"><strong>Novo projeto sob medida</strong><span>Guarda-corpo, painel, cortina...</span></a>
        <a class="atalho" href="#/projeto/novo/catalogo"><strong>Nova peça de catálogo</strong><span>Hang plant, bolsa, colar...</span></a>
        <button class="atalho oliva" disabled><strong>Nova venda</strong><span>Registrar um pedido. Em breve.</span></button>
      </div>
      <div class="indicadores">
        <div class="indicador"><div class="rot">Materiais</div><div class="val">${materiais.length}</div></div>
        <div class="indicador"><div class="rot">Tramas disponíveis</div><div class="val">${tr.count ?? 0}</div></div>
        <div class="indicador"><div class="rot">Clientes</div><div class="val">${cli.count ?? 0}</div></div>
        <div class="indicador"><div class="rot">Insumos acabando</div><div class="val">${acabando}</div></div>
      </div>`;
  }

  /* ---------------------------------------------------------------
     Em breve
     --------------------------------------------------------------- */
  async function paginaEmBreve() {
    const nomes = { novo: 'Novo projeto', projetos: 'Projetos', propostas: 'Propostas' };
    area().innerHTML = `
      <div class="cabecalho"><div><h1>${esc(nomes[rotaAtual()] || 'Página')}</h1></div></div>
      <div class="vazio">Esta parte está sendo construída e chega na próxima versão.<br>
      Enquanto isso, deixe a <a href="#/biblioteca">Biblioteca</a> e as <a href="#/configuracoes">Configurações</a> prontas.</div>`;
  }

  /* ---------------------------------------------------------------
     Configurações
     --------------------------------------------------------------- */
  async function paginaConfiguracoes() {
    const p = estado.perfil;
    if (!p) { area().innerHTML = '<div class="erro-msg">Seu perfil não foi encontrado. Fale com o administrador.</div>'; return; }
    const { data: fotos } = await sb.from('portfolio').select('*').eq('artesa_id', p.id).eq('ativo', true).order('ordem');

    area().innerHTML = `
      <div class="cabecalho"><div><h1>Configurações</h1><p>Seus dados, valores e padrões. Eles alimentam os cálculos e as propostas.</p></div></div>
      <form id="form-config" novalidate>
        <section class="card">
          <h2>Sua marca</h2><p class="sub">Aparece nas propostas enviadas aos clientes.</p>
          <div class="grade g2">
            ${campo('Seu nome', entrada('nome', p.nome))}
            ${campo('Nome da marca', entrada('nome_marca', p.nome_marca))}
            ${campo('Telefone', entrada('telefone', p.telefone))}
            ${campo('Instagram', entrada('instagram', p.instagram, 'placeholder="@suamarca"'))}
          </div>
          <div style="margin-top:16px">${campo('Texto de apresentação', `<textarea name="texto_apresentacao" rows="5">${esc(p.texto_apresentacao)}</textarea>`, 'Usado na página "quem sou eu" da proposta.')}</div>
          <div class="grade g2" style="margin-top:16px;align-items:start">
            <div class="campo"><label>Logo</label>
              <div style="display:flex;gap:14px;align-items:center">
                <div class="logo-preview">${p.logo_url ? `<img src="${esc(p.logo_url)}" alt="Logo atual">` : '<span>Sem logo</span>'}</div>
                <div><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" id="arq-logo" class="sr-only">
                <label for="arq-logo" class="botao sec peq">Enviar logo</label>
                <div class="ajuda" style="margin-top:6px;font-size:12px;color:var(--texto-2)">PNG com fundo transparente fica melhor.</div></div>
              </div>
            </div>
            <div class="campo"><label>Assinatura (opcional)</label>
              <div style="display:flex;gap:14px;align-items:center">
                <div class="logo-preview">${p.assinatura_url ? `<img src="${esc(p.assinatura_url)}" alt="Assinatura atual">` : '<span>Sem assinatura</span>'}</div>
                <div><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" id="arq-assinatura" class="sr-only">
                <label for="arq-assinatura" class="botao sec peq">Enviar assinatura</label></div>
              </div>
            </div>
          </div>
          <div class="cores" style="margin-top:16px">
            ${campo('Cor principal', `<input type="color" name="cor_primaria" value="${esc(p.cor_primaria || '#B5460A')}">`)}
            ${campo('Cor de destaque', `<input type="color" name="cor_secundaria" value="${esc(p.cor_secundaria || '#8B8110')}">`)}
            ${campo('Cor de fundo', `<input type="color" name="cor_fundo" value="${esc(p.cor_fundo || '#F5F1E9')}">`)}
          </div>
        </section>

        <section class="card">
          <h2>Valores</h2><p class="sub">Base da precificação. Você pode ajustar em cada peça.</p>
          <div class="grade g4">
            ${campo('Valor da sua hora', numeroCom('valor_hora', p.valor_hora, 'R$/hora', 'min="0"'))}
            ${campo('Margem desejada', numeroCom('margem_padrao_pct', p.margem_padrao_pct, '%', 'min="0" max="95"'))}
            ${campo('Taxa da maquininha', numeroCom('taxa_maquininha_pct', p.taxa_maquininha_pct, '%', 'min="0" max="50"'), 'Média que você paga.')}
            ${campo('Imposto', numeroCom('imposto_pct', p.imposto_pct, '%', 'min="0" max="50"'), 'Deixe 0 se não emite nota.')}
          </div>
        </section>

        <section class="card">
          <h2>Padrões de cálculo</h2><p class="sub">Usados pela calculadora em todos os projetos.</p>
          <div class="grade g4">
            ${campo('Sobra em cada fio', numeroCom('sobra_por_fio_cm', p.sobra_por_fio_cm, 'cm', 'min="0"'), 'Somada no final de cada fio.')}
            ${campo('Sobra por ponta', numeroCom('ponta_cm', p.ponta_cm, 'cm', 'min="0"'), 'Para dar o nó de fechamento.')}
            ${campo('Acabamento por gancho', numeroCom('acabamento_gancho_m', p.acabamento_gancho_m, 'm', 'min="0"'), 'Para esconder o gancho.')}
            ${campo('Arredondar na proposta', `<select name="arredondar_para">${opcoes({ 1: 'Não arredondar', 5: 'Para cima, de 5 em 5', 10: 'Para cima, de 10 em 10', 50: 'Para cima, de 50 em 50' }, String(p.arredondar_para ?? 10))}</select>`, 'Ex.: 44 ganchos viram 50.')}
          </div>
        </section>

        <section class="card">
          <h2>Proposta</h2><p class="sub">Textos padrão do orçamento.</p>
          <div class="grade g3">
            ${campo('Validade', numeroCom('validade_proposta_dias', p.validade_proposta_dias, 'dias', 'min="1"'))}
          </div>
          <div class="grade g2" style="margin-top:16px">
            ${campo('Condições de pagamento', `<textarea name="condicoes_pagamento" rows="3">${esc(p.condicoes_pagamento)}</textarea>`)}
            ${campo('Formas de pagamento', `<textarea name="formas_pagamento" rows="3">${esc(p.formas_pagamento)}</textarea>`)}
          </div>
        </section>

        <div class="acoes" style="position:sticky;bottom:0;background:var(--creme);padding:14px 0">
          <button class="botao" type="submit">Salvar configurações</button>
        </div>
      </form>

      <section class="card">
        <h2>Projetos realizados</h2><p class="sub">Fotos que aparecem na proposta, na página de portfólio.</p>
        <input type="file" accept="image/png,image/jpeg,image/webp" id="arq-fotos" multiple class="sr-only">
        <label for="arq-fotos" class="botao sec peq">Adicionar fotos</label>
        <div class="fotos">
          ${(fotos || []).map((f) => `<div class="foto"><img src="${esc(f.foto_url)}" alt="${esc(f.legenda || 'Projeto realizado')}"><button type="button" data-remover-foto="${f.id}" aria-label="Remover foto">Remover</button></div>`).join('') || '<div class="ajuda" style="grid-column:1/-1;color:var(--texto-2)">Nenhuma foto ainda.</div>'}
        </div>
      </section>`;

    document.getElementById('form-config').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = new FormData(ev.target);
      const textos = ['nome', 'nome_marca', 'telefone', 'instagram', 'texto_apresentacao', 'cor_primaria', 'cor_secundaria', 'cor_fundo', 'condicoes_pagamento', 'formas_pagamento'];
      const numeros = ['valor_hora', 'margem_padrao_pct', 'taxa_maquininha_pct', 'imposto_pct', 'sobra_por_fio_cm', 'ponta_cm', 'acabamento_gancho_m', 'arredondar_para', 'validade_proposta_dias'];
      const dados = {};
      textos.forEach((k) => { dados[k] = (d.get(k) || '').trim() || null; });
      numeros.forEach((k) => { dados[k] = valorNum(d.get(k)) ?? 0; });
      if (dados.margem_padrao_pct + dados.taxa_maquininha_pct + dados.imposto_pct >= 100) { toast('Margem + taxa + imposto precisam somar menos de 100%.', true); return; }
      const { data, error } = await sb.from('perfis').update(dados).eq('id', p.id).select().single();
      if (error) return erro(error);
      estado.perfil = data;
      toast('Configurações salvas.');
      telaShell();
    });

    const enviarImagem = async (arquivo, pasta, campoPerfil) => {
      if (!arquivo) return;
      if (arquivo.size > 5 * 1024 * 1024) { toast('A imagem precisa ter até 5 MB.', true); return; }
      const ext = (arquivo.name.split('.').pop() || 'png').toLowerCase();
      const caminho = `${p.id}/${campoPerfil}-${Date.now()}.${ext}`;
      const up = await sb.storage.from(pasta).upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
      if (up.error) return erro(up.error);
      const url = sb.storage.from(pasta).getPublicUrl(caminho).data.publicUrl;
      const { data, error } = await sb.from('perfis').update({ [campoPerfil]: url }).eq('id', p.id).select().single();
      if (error) return erro(error);
      estado.perfil = data;
      toast('Imagem enviada.');
      paginaConfiguracoes().catch(erro);
    };
    document.getElementById('arq-logo').addEventListener('change', (ev) => enviarImagem(ev.target.files[0], 'marca', 'logo_url'));
    document.getElementById('arq-assinatura').addEventListener('change', (ev) => enviarImagem(ev.target.files[0], 'marca', 'assinatura_url'));

    document.getElementById('arq-fotos').addEventListener('change', async (ev) => {
      const arquivos = Array.from(ev.target.files || []);
      if (!arquivos.length) return;
      toast('Enviando fotos...');
      let ordem = (fotos || []).length;
      for (const arq of arquivos) {
        if (arq.size > 8 * 1024 * 1024) { toast(`"${arq.name}" passa de 8 MB e foi ignorada.`, true); continue; }
        const ext = (arq.name.split('.').pop() || 'jpg').toLowerCase();
        const caminho = `${p.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const up = await sb.storage.from('portfolio').upload(caminho, arq, { contentType: arq.type });
        if (up.error) { erro(up.error); continue; }
        const url = sb.storage.from('portfolio').getPublicUrl(caminho).data.publicUrl;
        const ins = await sb.from('portfolio').insert({ foto_url: url, ordem: ordem++ });
        if (ins.error) erro(ins.error);
      }
      toast('Fotos adicionadas.');
      paginaConfiguracoes().catch(erro);
    });

    area().querySelectorAll('[data-remover-foto]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Remover esta foto do portfólio?')) return;
      const { error } = await sb.from('portfolio').update({ ativo: false }).eq('id', b.dataset.removerFoto);
      if (error) return erro(error);
      toast('Foto removida.');
      paginaConfiguracoes().catch(erro);
    }));
  }

  /* ---------------------------------------------------------------
     Biblioteca
     --------------------------------------------------------------- */
  async function paginaBiblioteca() {
    const abas = { materiais: 'Materiais', tramas: 'Tramas', nos: 'Nós', categorias: 'Categorias' };
    area().innerHTML = `
      <div class="cabecalho">
        <div><h1>Biblioteca</h1><p>Seus materiais com preço e as regras de consumo usadas nos cálculos.</p></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--texto-2)">
          <input type="checkbox" id="ver-inativos" ${estado.mostrarInativos ? 'checked' : ''}> Mostrar desativados
        </label>
      </div>
      <div class="abas" role="tablist">
        ${Object.entries(abas).map(([k, r]) => `<button type="button" role="tab" data-aba="${k}" class="${estado.abaBiblioteca === k ? 'ativa' : ''}">${r}</button>`).join('')}
      </div>
      <div id="aba-conteudo"><div class="carregando">Carregando...</div></div>`;
    area().querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { estado.abaBiblioteca = b.dataset.aba; paginaBiblioteca().catch(erro); }));
    document.getElementById('ver-inativos').addEventListener('change', (ev) => { estado.mostrarInativos = ev.target.checked; paginaBiblioteca().catch(erro); });
    const fn = { materiais: abaMateriais, tramas: abaTramas, nos: abaNos, categorias: abaCategorias }[estado.abaBiblioteca];
    await fn(document.getElementById('aba-conteudo'));
  }

  const filtrarAtivos = (q) => (estado.mostrarInativos ? q : q.eq('ativo', true));
  const nomeTipo = (id) => (estado.tiposMaterial.find((t) => t.id === id) || {}).nome || '';
  const seloOrigem = (r) => (r.artesa_id ? '<span class="selo">Meu</span>' : '<span class="selo base">Base</span>');
  const botaoAtivo = (tabela, r) => `<button type="button" class="botao texto peq" data-alternar="${tabela}" data-id="${r.id}" data-ativo="${r.ativo}">${r.ativo ? 'Desativar' : 'Reativar'}</button>`;

  function ligarAlternar(raiz, recarregar) {
    raiz.querySelectorAll('[data-alternar]').forEach((b) => b.addEventListener('click', async () => {
      const novo = b.dataset.ativo !== 'true';
      const { error } = await sb.from(b.dataset.alternar).update({ ativo: novo }).eq('id', b.dataset.id);
      if (error) return erro(error);
      toast(novo ? 'Reativado.' : 'Desativado. Ele some das opções, mas o histórico continua.');
      recarregar();
    }));
  }

  /* ---- Materiais ---- */
  async function abaMateriais(raiz) {
    const { data, error } = await filtrarAtivos(sb.from('materiais').select('*').order('criado_em'));
    if (error) throw error;
    const lista = data || [];
    const recarregar = () => abaMateriais(raiz).catch(erro);
    raiz.innerHTML = `
      <div class="acoes" style="margin:0 0 14px;justify-content:space-between;align-items:center">
        <span style="color:var(--texto-2);font-size:14px">Cada especificação (marca, espessura, cor) é um item com o seu preço.</span>
        <button type="button" class="botao" id="novo-material">+ Novo material</button>
      </div>
      ${lista.length ? `<div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Material</th><th>Espessura</th><th>Cor</th><th>Compra</th><th class="num">Custo</th><th class="num">Estoque</th><th></th></tr></thead>
        <tbody>${lista.map((m) => `
          <tr class="${m.ativo ? '' : 'inativo'}">
            <td><strong>${esc(nomeTipo(m.tipo_material_id))}</strong><br><span style="color:var(--texto-2);font-size:13px">${esc([m.marca, m.descricao].filter(Boolean).join(' · '))}</span></td>
            <td>${m.espessura_mm ? numero(m.espessura_mm) + ' mm' : '-'}</td>
            <td>${esc(m.cor || '-')}</td>
            <td>${moeda(m.preco_compra)} por ${esc(m.unidade_compra)}${m.unidade_compra !== 'unidade' && m.unidade_compra !== 'metro' ? ` de ${numero(m.quantidade_por_compra)} ${esc(m.unidade_consumo)}s` : ''}</td>
            <td class="num">${moeda(m.custo_por_unidade).replace(/(,\d{2})$/, '$1')}<br><span style="font-size:12px;color:var(--texto-2)">por ${esc(m.unidade_consumo)}</span></td>
            <td class="num">${numero(m.estoque_atual)} ${esc(m.unidade_consumo)}s${Number(m.estoque_minimo) > 0 && Number(m.estoque_atual) <= Number(m.estoque_minimo) ? '<br><span class="selo" style="background:#faeeda;color:#633806">Acabando</span>' : ''}</td>
            <td style="white-space:nowrap"><button type="button" class="botao texto peq" data-editar="${m.id}">Editar</button>${botaoAtivo('materiais', m)}</td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="vazio">Nenhum material ainda. Cadastre as cordas, fios e acessórios que você usa, com o preço que paga.</div>'}`;
    document.getElementById('novo-material').addEventListener('click', () => formMaterial(null, recarregar));
    raiz.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => formMaterial(lista.find((x) => x.id === b.dataset.editar), recarregar)));
    ligarAlternar(raiz, recarregar);
  }

  function formMaterial(m, recarregar) {
    m = m || { unidade_compra: 'rolo', unidade_consumo: 'metro', quantidade_por_compra: '', preco_compra: '' };
    abrirModal({
      titulo: m.id ? 'Editar material' : 'Novo material',
      corpo: `
        <div class="grade g2">
          ${campo('Tipo', `<select name="tipo_material_id" required><option value="">Escolha...</option>${opcoesLista(estado.tiposMaterial, m.tipo_material_id)}</select>`, 'Não achou o tipo? Peça ao administrador para incluir.')}
          ${campo('Marca', entrada('marca', m.marca))}
          ${campo('Descrição', entrada('descricao', m.descricao, 'placeholder="Ex.: trançado, encerado..."'))}
          ${campo('Cor', entrada('cor', m.cor))}
          ${campo('Espessura', numeroCom('espessura_mm', m.espessura_mm, 'mm', 'min="0"'))}
        </div>
        <h3 style="margin:20px 0 10px">Como você compra</h3>
        <div class="grade g3">
          ${campo('Vendido por', `<select name="unidade_compra">${opcoes(UNIDADES_COMPRA, m.unidade_compra)}</select>`)}
          ${campo('Preço pago', numeroCom('preco_compra', m.preco_compra, 'R$', 'min="0" required'))}
          ${campo('Rende', numeroCom('quantidade_por_compra', m.quantidade_por_compra, '', 'min="0" required'), 'Quanto vem em cada compra.')}
        </div>
        <div class="grade g2" style="margin-top:14px">
          ${campo('Usado em', `<select name="unidade_consumo">${opcoes(UNIDADES_CONSUMO, m.unidade_consumo)}</select>`, 'Fios: metro. Kg sem metragem conhecida: grama. Acessórios: unidade.')}
          <div class="calculo" id="calc-custo" style="align-self:end"></div>
        </div>
        <h3 style="margin:20px 0 10px">Estoque</h3>
        <div class="grade g2">
          ${campo('Tenho hoje', numeroCom('estoque_atual', m.estoque_atual, '', 'min="0"'), 'Na mesma unidade de uso (metros, gramas ou unidades).')}
          ${campo('Avisar quando ficar abaixo de', numeroCom('estoque_minimo', m.estoque_minimo, '', 'min="0"'))}
        </div>`,
      aoAbrir: (form) => {
        const atualizar = () => {
          const preco = valorNum(form.preco_compra.value), qtd = valorNum(form.quantidade_por_compra.value);
          const un = form.unidade_consumo.value, comp = form.unidade_compra.value;
          form.querySelector('.com-sufixo input[name=quantidade_por_compra] + span').textContent = un === 'metro' ? 'metros' : un === 'grama' ? 'gramas' : 'unidades';
          form.querySelectorAll('input[name=estoque_atual] + span, input[name=estoque_minimo] + span').forEach((s) => { s.textContent = un + 's'; });
          const c = document.getElementById('calc-custo');
          if (comp === 'kg' && un === 'metro' && !qtd) { c.innerHTML = 'Comprado por kg: informe quantos <strong>metros</strong> vêm em 1 kg. Se não souber, escolha "grama" e informe 1000.'; return; }
          c.innerHTML = preco && qtd ? `Custo: <strong>${moeda(preco / qtd)}</strong> por ${un}` : 'Preencha preço e rendimento para ver o custo.';
        };
        form.addEventListener('input', atualizar);
        form.unidade_compra.addEventListener('change', () => {
          const v = form.unidade_compra.value;
          if (v === 'unidade' || v === 'pacote') form.unidade_consumo.value = 'unidade';
          if (v === 'unidade') form.quantidade_por_compra.value = 1;
          if (v === 'metro') { form.unidade_consumo.value = 'metro'; form.quantidade_por_compra.value = 1; }
          atualizar();
        });
        atualizar();
      },
      aoSalvar: async (d) => {
        if (!d.get('tipo_material_id')) throw new Error('Escolha o tipo de material.');
        const preco = valorNum(d.get('preco_compra')), qtd = valorNum(d.get('quantidade_por_compra'));
        if (preco === null || !qtd) throw new Error('Informe o preço pago e quanto rende cada compra.');
        const dados = {
          tipo_material_id: d.get('tipo_material_id'),
          marca: d.get('marca').trim() || null,
          descricao: d.get('descricao').trim() || null,
          cor: d.get('cor').trim() || null,
          espessura_mm: valorNum(d.get('espessura_mm')),
          unidade_compra: d.get('unidade_compra'),
          preco_compra: preco,
          quantidade_por_compra: qtd,
          unidade_consumo: d.get('unidade_consumo'),
          estoque_atual: valorNum(d.get('estoque_atual')) ?? 0,
          estoque_minimo: valorNum(d.get('estoque_minimo')) ?? 0
        };
        const r = m.id ? await sb.from('materiais').update(dados).eq('id', m.id) : await sb.from('materiais').insert(dados);
        if (r.error) throw r.error;
        toast('Material salvo.');
        recarregar();
      }
    });
  }

  /* ---- Tramas ---- */
  async function abaTramas(raiz) {
    const { data, error } = await filtrarAtivos(sb.from('tramas').select('*').order('tipo').order('nome'));
    if (error) throw error;
    const lista = data || [];
    const recarregar = () => abaTramas(raiz).catch(erro);
    const resumo = (t) => {
      if (t.tipo !== 'geral') return `<span style="color:var(--texto-2)">${esc(t.descricao || 'Regra de vão calculada pelo sistema.')}</span>`;
      const partes = [];
      if (t.largura_trama_cm) partes.push(`${numero(t.largura_trama_cm)} cm de largura`);
      if (t.fios_por_trama) partes.push(`${t.fios_por_trama} fios`);
      if (t.rendimento_metros && t.rendimento_cm) partes.push(`${numero(t.rendimento_metros)} m de fio fazem ${numero(t.rendimento_cm)} cm`);
      return partes.join(' · ') || '-';
    };
    raiz.innerHTML = `
      <div class="acoes" style="margin:0 0 14px;justify-content:space-between;align-items:center">
        <span style="color:var(--texto-2);font-size:14px"><span class="selo base">Base</span> vem pronta no sistema. <span class="selo">Meu</span> são as suas, que você pode editar.</span>
        <button type="button" class="botao" id="nova-trama">+ Nova trama</button>
      </div>
      ${lista.length ? `<div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Trama</th><th>Tipo</th><th>Material</th><th>Consumo</th><th>Origem</th><th></th></tr></thead>
        <tbody>${lista.map((t) => `
          <tr class="${t.ativo ? '' : 'inativo'}">
            <td><strong>${esc(t.nome)}</strong></td>
            <td>${esc(TIPOS_TRAMA[t.tipo] || t.tipo)}</td>
            <td>${esc(nomeTipo(t.tipo_material_id))}${t.espessura_mm ? ' ' + numero(t.espessura_mm) + ' mm' : ''}</td>
            <td>${resumo(t)}</td>
            <td>${seloOrigem(t)}</td>
            <td style="white-space:nowrap">${(ehMeu(t) || ehAdmin()) && t.tipo === 'geral' ? `<button type="button" class="botao texto peq" data-editar="${t.id}">Editar</button>` : ''}${ehMeu(t) || ehAdmin() ? botaoAtivo('tramas', t) : ''}</td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="vazio">Nenhuma trama cadastrada.</div>'}`;
    document.getElementById('nova-trama').addEventListener('click', () => formTrama(null, recarregar));
    raiz.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => formTrama(lista.find((x) => x.id === b.dataset.editar), recarregar)));
    ligarAlternar(raiz, recarregar);
  }

  function formTrama(t, recarregar) {
    t = t || {};
    const fios = estado.tiposMaterial.filter((x) => x.grupo === 'fio');
    abrirModal({
      titulo: t.id ? 'Editar trama' : 'Nova trama',
      corpo: `
        <div class="grade g2">
          ${campo('Nome da trama', entrada('nome', t.nome, 'required placeholder="Ex.: Trama X"'))}
          ${campo('Material', `<select name="tipo_material_id" required><option value="">Escolha...</option>${opcoesLista(fios, t.tipo_material_id)}</select>`)}
          ${campo('Espessura', numeroCom('espessura_mm', t.espessura_mm, 'mm', 'min="0" required'))}
        </div>
        <h3 style="margin:20px 0 10px">Medidas da trama</h3>
        <div class="grade g2">
          ${campo('Largura de uma trama', numeroCom('largura_trama_cm', t.largura_trama_cm, 'cm', 'min="0" required'))}
          ${campo('Fios em cada trama', numeroCom('fios_por_trama', t.fios_por_trama, 'fios', 'min="1" step="1" required'))}
          ${campo('Metros de fio...', numeroCom('rendimento_metros', t.rendimento_metros ?? 1, 'm', 'min="0" required'))}
          ${campo('...fazem quantos cm de trama', numeroCom('rendimento_cm', t.rendimento_cm, 'cm', 'min="0" required'))}
        </div>
        <div class="calculo" id="calc-trama" style="margin-top:14px"></div>
        <div style="margin-top:14px">${campo('Observações', `<textarea name="descricao" rows="2">${esc(t.descricao)}</textarea>`)}</div>`,
      aoAbrir: (form) => {
        const atualizar = () => {
          const l = valorNum(form.largura_trama_cm.value), f = valorNum(form.fios_por_trama.value);
          const rm = valorNum(form.rendimento_metros.value), rc = valorNum(form.rendimento_cm.value);
          const c = document.getElementById('calc-trama');
          if (!(l && f && rm && rc)) { c.textContent = 'Preencha as medidas para ver um exemplo.'; return; }
          const tramas = Math.ceil(30 / l), totalFios = tramas * f, porFio = (50 / rc) * rm;
          c.innerHTML = `Exemplo: peça de <strong>30 cm</strong> de largura e <strong>50 cm</strong> de comprimento → ${tramas} tramas, <strong>${totalFios} fios de ${numero(porFio)} m</strong> (antes da sobra).`;
        };
        form.addEventListener('input', atualizar);
        atualizar();
      },
      aoSalvar: async (d) => {
        const dados = {
          nome: d.get('nome').trim(),
          tipo: 'geral',
          tipo_material_id: d.get('tipo_material_id') || null,
          espessura_mm: valorNum(d.get('espessura_mm')),
          largura_trama_cm: valorNum(d.get('largura_trama_cm')),
          fios_por_trama: Math.round(valorNum(d.get('fios_por_trama')) || 0) || null,
          rendimento_metros: valorNum(d.get('rendimento_metros')),
          rendimento_cm: valorNum(d.get('rendimento_cm')),
          descricao: d.get('descricao').trim() || null
        };
        if (!dados.nome || !dados.tipo_material_id) throw new Error('Informe o nome e o material.');
        if (!(dados.largura_trama_cm && dados.fios_por_trama && dados.rendimento_metros && dados.rendimento_cm)) throw new Error('Preencha todas as medidas da trama.');
        const r = t.id ? await sb.from('tramas').update(dados).eq('id', t.id) : await sb.from('tramas').insert(dados);
        if (r.error) throw r.error;
        toast('Trama salva.');
        recarregar();
      }
    });
  }

  /* ---- Nós ---- */
  async function abaNos(raiz) {
    const { data, error } = await filtrarAtivos(sb.from('consumo_nos').select('*').order('espessura_mm'));
    if (error) throw error;
    const lista = (data || []).sort((a, b) => ((estado.nos.find((n) => n.id === a.no_id) || {}).nome || '').localeCompare((estado.nos.find((n) => n.id === b.no_id) || {}).nome || ''));
    const recarregar = () => abaNos(raiz).catch(erro);
    const nomeNo = (id) => (estado.nos.find((n) => n.id === id) || {}).nome || '';
    raiz.innerHTML = `
      <div class="acoes" style="margin:0 0 14px;justify-content:space-between;align-items:center">
        <span style="color:var(--texto-2);font-size:14px">Quanto de fio cada nó gasta, por material e espessura. Se o seu consumo for diferente da base, cadastre o seu.</span>
        <button type="button" class="botao" id="novo-consumo">+ Novo consumo</button>
      </div>
      ${lista.length ? `<div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Nó</th><th>Material</th><th>Espessura</th><th class="num">Gasta por nó</th><th>Origem</th><th></th></tr></thead>
        <tbody>${lista.map((c) => `
          <tr class="${c.ativo ? '' : 'inativo'}">
            <td><strong>${esc(nomeNo(c.no_id))}</strong></td>
            <td>${esc(nomeTipo(c.tipo_material_id))}</td>
            <td>${numero(c.espessura_mm)} mm</td>
            <td class="num">${numero(c.consumo_cm)} cm</td>
            <td>${seloOrigem(c)}</td>
            <td style="white-space:nowrap">${ehMeu(c) || ehAdmin() ? `<button type="button" class="botao texto peq" data-editar="${c.id}">Editar</button>${botaoAtivo('consumo_nos', c)}` : ''}</td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="vazio">Nenhum consumo de nó cadastrado.</div>'}
      <p style="font-size:13px;color:var(--texto-2);margin-top:14px">Nós disponíveis: ${estado.nos.map((n) => esc(n.nome)).join(', ')}. Precisa de outro tipo de nó? Peça ao administrador.</p>`;
    document.getElementById('novo-consumo').addEventListener('click', () => formConsumo(null, recarregar));
    raiz.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => formConsumo(lista.find((x) => x.id === b.dataset.editar), recarregar)));
    ligarAlternar(raiz, recarregar);
  }

  function formConsumo(c, recarregar) {
    c = c || {};
    const fios = estado.tiposMaterial.filter((x) => x.grupo === 'fio');
    abrirModal({
      titulo: c.id ? 'Editar consumo do nó' : 'Novo consumo de nó',
      corpo: `
        <div class="grade g2">
          ${campo('Nó', `<select name="no_id" required><option value="">Escolha...</option>${opcoesLista(estado.nos, c.no_id)}</select>`)}
          ${campo('Material', `<select name="tipo_material_id" required><option value="">Escolha...</option>${opcoesLista(fios, c.tipo_material_id)}</select>`)}
          ${campo('Espessura', numeroCom('espessura_mm', c.espessura_mm, 'mm', 'min="0" required'))}
          ${campo('Cada nó gasta', numeroCom('consumo_cm', c.consumo_cm, 'cm de fio', 'min="0" required'))}
        </div>`,
      aoSalvar: async (d) => {
        const dados = { no_id: d.get('no_id'), tipo_material_id: d.get('tipo_material_id'), espessura_mm: valorNum(d.get('espessura_mm')), consumo_cm: valorNum(d.get('consumo_cm')) };
        if (!dados.no_id || !dados.tipo_material_id || !dados.espessura_mm || !dados.consumo_cm) throw new Error('Preencha todos os campos.');
        const r = c.id ? await sb.from('consumo_nos').update(dados).eq('id', c.id) : await sb.from('consumo_nos').insert(dados);
        if (r.error) throw r.error;
        toast('Consumo salvo.');
        recarregar();
      }
    });
  }

  /* ---- Categorias ---- */
  async function abaCategorias(raiz) {
    const { data, error } = await filtrarAtivos(sb.from('categorias').select('*').order('ordem').order('nome'));
    if (error) throw error;
    const lista = data || [];
    const recarregar = () => abaCategorias(raiz).catch(erro);
    raiz.innerHTML = `
      <div class="acoes" style="margin:0 0 14px;justify-content:space-between;align-items:center">
        <span style="color:var(--texto-2);font-size:14px">Tipos de peça que você cria. Não achou o seu? Crie uma categoria própria.</span>
        <button type="button" class="botao" id="nova-categoria">+ Nova categoria</button>
      </div>
      <div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Categoria</th><th>Modelo</th><th>Origem</th><th></th></tr></thead>
        <tbody>${lista.map((c) => `
          <tr class="${c.ativo ? '' : 'inativo'}">
            <td><strong>${esc(c.nome)}</strong></td>
            <td>${esc(MODELOS[c.modelo] || c.modelo)}</td>
            <td>${seloOrigem(c)}</td>
            <td style="white-space:nowrap">${ehMeu(c) || ehAdmin() ? `<button type="button" class="botao texto peq" data-editar="${c.id}">Editar</button>${botaoAtivo('categorias', c)}` : ''}</td>
          </tr>`).join('')}</tbody></table></div>`;
    const form = (c) => abrirModal({
      titulo: c && c.id ? 'Editar categoria' : 'Nova categoria',
      corpo: `<div class="grade g2">
        ${campo('Nome', entrada('nome', c && c.nome, 'required'))}
        ${campo('Usada em', `<select name="modelo">${opcoes(MODELOS, (c && c.modelo) || 'ambos')}</select>`)}
      </div>`,
      aoSalvar: async (d) => {
        const dados = { nome: d.get('nome').trim(), modelo: d.get('modelo') };
        if (!dados.nome) throw new Error('Informe o nome.');
        const r = c && c.id ? await sb.from('categorias').update(dados).eq('id', c.id) : await sb.from('categorias').insert({ ...dados, ordem: 100 });
        if (r.error) throw r.error;
        toast('Categoria salva.');
        recarregar();
      }
    });
    document.getElementById('nova-categoria').addEventListener('click', () => form(null));
    raiz.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => form(lista.find((x) => x.id === b.dataset.editar))));
    ligarAlternar(raiz, recarregar);
  }

  /* ---------------------------------------------------------------
     Clientes
     --------------------------------------------------------------- */
  async function paginaClientes() {
    const { data, error } = await (estado.mostrarInativos ? sb.from('clientes').select('*') : sb.from('clientes').select('*').eq('ativo', true)).order('nome');
    if (error) throw error;
    const todos = data || [];
    const arquitetos = todos.filter((c) => c.tipo === 'arquiteto' && c.ativo);
    const recarregar = () => paginaClientes().catch(erro);
    const desenhar = () => {
      const b = estado.buscaClientes.toLowerCase();
      const lista = todos.filter((c) => !b || [c.nome, c.telefone, c.cidade, c.email].join(' ').toLowerCase().includes(b));
      document.getElementById('lista-clientes').innerHTML = lista.length ? `<div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Nome</th><th>Tipo</th><th>Telefone</th><th>Cidade</th><th>Arquiteto(a)</th><th></th></tr></thead>
        <tbody>${lista.map((c) => `
          <tr class="${c.ativo ? '' : 'inativo'}">
            <td><strong>${esc(c.nome)}</strong>${c.email ? `<br><span style="font-size:13px;color:var(--texto-2)">${esc(c.email)}</span>` : ''}</td>
            <td>${esc(TIPOS_CLIENTE[c.tipo] || c.tipo)}</td>
            <td>${esc(c.telefone || '-')}</td>
            <td>${esc(c.cidade || '-')}</td>
            <td>${esc((todos.find((a) => a.id === c.arquiteto_id) || {}).nome || '-')}</td>
            <td style="white-space:nowrap"><button type="button" class="botao texto peq" data-editar="${c.id}">Editar</button>${botaoAtivo('clientes', c)}</td>
          </tr>`).join('')}</tbody></table></div>`
        : `<div class="vazio">${todos.length ? 'Nenhum cliente encontrado nessa busca.' : 'Nenhum cliente ainda.'}</div>`;
      document.querySelectorAll('#lista-clientes [data-editar]').forEach((bt) => bt.addEventListener('click', () => formCliente(todos.find((x) => x.id === bt.dataset.editar), arquitetos, recarregar)));
      ligarAlternar(document.getElementById('lista-clientes'), recarregar);
    };
    area().innerHTML = `
      <div class="cabecalho">
        <div><h1>Clientes</h1><p>Clientes finais, arquitetos parceiros e lojas.</p></div>
        <button type="button" class="botao" id="novo-cliente">+ Novo cliente</button>
      </div>
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        <div class="campo" style="flex:1;min-width:220px"><label class="sr-only" for="busca">Buscar</label><input id="busca" placeholder="Buscar por nome, telefone ou cidade" value="${esc(estado.buscaClientes)}"></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--texto-2)"><input type="checkbox" id="ver-inativos" ${estado.mostrarInativos ? 'checked' : ''}> Mostrar desativados</label>
      </div>
      <div id="lista-clientes"></div>`;
    document.getElementById('novo-cliente').addEventListener('click', () => formCliente(null, arquitetos, recarregar));
    document.getElementById('busca').addEventListener('input', (ev) => { estado.buscaClientes = ev.target.value; desenhar(); });
    document.getElementById('ver-inativos').addEventListener('change', (ev) => { estado.mostrarInativos = ev.target.checked; recarregar(); });
    desenhar();
  }

  function formCliente(c, arquitetos, recarregar) {
    c = c || { tipo: 'cliente_final' };
    abrirModal({
      titulo: c.id ? 'Editar cliente' : 'Novo cliente',
      corpo: `
        <div class="grade g2">
          ${campo('Nome', entrada('nome', c.nome, 'required'))}
          ${campo('Tipo', `<select name="tipo">${opcoes(TIPOS_CLIENTE, c.tipo)}</select>`)}
          ${campo('Telefone', entrada('telefone', c.telefone, 'type="tel"'))}
          ${campo('E-mail', entrada('email', c.email, 'type="email"'))}
          ${campo('Cidade', entrada('cidade', c.cidade))}
          ${campo('Arquiteto(a) do projeto', `<select name="arquiteto_id"><option value="">Nenhum</option>${opcoesLista(arquitetos.filter((a) => a.id !== c.id), c.arquiteto_id)}</select>`)}
        </div>
        <div style="margin-top:14px">${campo('Observações', `<textarea name="observacoes" rows="3">${esc(c.observacoes)}</textarea>`)}</div>`,
      aoSalvar: async (d) => {
        const dados = {
          nome: d.get('nome').trim(), tipo: d.get('tipo'),
          telefone: d.get('telefone').trim() || null, email: d.get('email').trim() || null,
          cidade: d.get('cidade').trim() || null, arquiteto_id: d.get('arquiteto_id') || null,
          observacoes: d.get('observacoes').trim() || null
        };
        if (!dados.nome) throw new Error('Informe o nome do cliente.');
        const r = c.id ? await sb.from('clientes').update(dados).eq('id', c.id) : await sb.from('clientes').insert(dados);
        if (r.error) throw r.error;
        toast('Cliente salvo.');
        recarregar();
      }
    });
  }

  /* ---------------------------------------------------------------
     Compartilhado com os outros módulos (projetos, propostas, assistente)
     --------------------------------------------------------------- */
  Object.assign(App, { sb, estado, cfg, esc, moeda, numero, valorNum, toast, erro, traduzErro, abrirModal, campo, entrada, numeroCom, opcoes, opcoesLista, area, ehAdmin, ehMeu, nomeTipo, telaShell, formCliente, TIPOS_TRAMA, MODELOS });

  /* ---------------------------------------------------------------
     Inicialização
     --------------------------------------------------------------- */
  async function aoMudarSessao(sessao) {
    estado.sessao = sessao;
    if (!sessao) { estado.perfil = null; telaLogin(); return; }
    app.innerHTML = '<div class="carregando">Carregando...</div>';
    try { await carregarBase(); } catch (e) { erro(e); }
    telaShell();
  }

  window.addEventListener('hashchange', () => { if (estado.sessao) telaShell(); });

  sb.auth.getSession().then(({ data }) => aoMudarSessao(data.session)).catch((e) => { console.error(e); telaLogin(); });
  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'SIGNED_IN' && estado.sessao && sessao && estado.sessao.user.id === sessao.user.id) { estado.sessao = sessao; return; }
    if (evento === 'TOKEN_REFRESHED') { estado.sessao = sessao; return; }
    if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') aoMudarSessao(sessao);
  });
})();
