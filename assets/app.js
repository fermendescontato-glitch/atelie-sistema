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
  const FAMILIAS = { vao: 'Guarda-corpo e telas (vão com ganchos)', bolsa: 'Bolsa', colar_mesa: 'Colar de mesa', colar: 'Colar de pescoço', luminaria: 'Luminária', painel: 'Painel', hang_plant: 'Hang plant', pingente_parede: 'Pingente de parede', livre: 'Partes livres' };
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

  const dica = (info) => (info ? ` <span class="info" tabindex="0" role="note" aria-label="${esc(info)}" data-dica="${esc(info)}">i</span>` : '');
  const campo = (rotulo, html, ajuda = '', info = '') => `
    <div class="campo"><label>${esc(rotulo)}${dica(info)}</label>${html}${ajuda ? `<span class="ajuda">${ajuda}</span>` : ''}</div>`;
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
    { rota: 'assistente', rotulo: 'Nath · assistente' },
    { rota: 'projetos', rotulo: 'Projetos', tambem: ['projeto'] },
    { rota: 'pecas', rotulo: 'Peças prontas' },
    { rota: 'propostas', rotulo: 'Propostas', tambem: ['proposta'] },
    { rota: 'vendas', rotulo: 'Vendas', tambem: ['venda'] },
    { rota: 'financeiro', rotulo: 'Financeiro' },
    { rota: 'clientes', rotulo: 'Clientes' },
    { rota: 'biblioteca', rotulo: 'Biblioteca', tambem: ['nota'] },
    { rota: 'configuracoes', rotulo: 'Configurações' },
    { rota: 'insights', rotulo: 'Insights da Nath', admin: true }
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
          ${MENU.filter((m) => !m.admin || ehAdmin()).map((m) => `<a href="#/${m.rota}" class="${m.rota === atual || (m.tambem || []).includes(atual) ? 'ativo' : ''}">${esc(m.rotulo)}${m.breve ? '<span class="em-breve">em breve</span>' : ''}</a>`).join('')}
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
    const hoje = new Date();
    const mesIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    const [mat, pj, rec, pc] = await Promise.all([
      sb.from('materiais').select('id, estoque_atual, estoque_minimo').eq('ativo', true),
      sb.from('projetos').select('id, status'),
      sb.from('recebimentos').select('valor, valor_liquido, status, recebido_em'),
      sb.from('pecas').select('quantidade').eq('ativo', true)
    ]);
    const pecasEstoque = (pc.data || []).reduce((s, x) => s + Math.max(0, Number(x.quantidade || 0)), 0);
    const materiais = mat.data || [];
    const projetos = pj.data || [];
    const recs = rec.data || [];
    const acabando = materiais.filter((m) => Number(m.estoque_minimo) > 0 && Number(m.estoque_atual) <= Number(m.estoque_minimo)).length;
    const aReceber = recs.filter((r) => r.status === 'pendente').reduce((s, r) => s + Number(r.valor || 0), 0);
    const recebidoMes = recs.filter((r) => r.status === 'recebido' && r.recebido_em >= mesIni).reduce((s, r) => s + Number(r.valor_liquido ?? r.valor ?? 0), 0);
    const pendencias = [];
    if (!Number(p.valor_hora)) pendencias.push('o valor da sua hora de trabalho');
    if (!p.logo_url) pendencias.push('o logo da sua marca');
    if (!materiais.length) pendencias.push('os materiais que você usa, com preço');

    area().innerHTML = `
      <div class="cabecalho"><div><h1>Olá${p.nome ? ', ' + esc(p.nome.split(' ')[0]) : ''}!</h1><p>O que vamos criar hoje?</p></div></div>
      ${pendencias.length ? `<div class="aviso" style="margin-bottom:20px">Para o sistema calcular e precificar certinho, complete ${pendencias.map(esc).join(', ')}. <a href="#/${!materiais.length && Number(p.valor_hora) && p.logo_url ? 'biblioteca' : 'configuracoes'}">Completar agora</a></div>` : ''}
      <div class="atalhos">
        <a class="atalho" href="#/projeto/novo"><strong>Novo projeto</strong><span>Guarda-corpo, bolsa, colar, painel, hang plant...</span></a>
        <a class="atalho" href="#/assistente"><strong>Falar com a Nath</strong><span>Conte sua ideia e ela monta o projeto com você.</span></a>
        <a class="atalho oliva" href="#/venda/nova"><strong>Nova venda</strong><span>Registrar uma venda e o pagamento.</span></a>
      </div>
      <div class="indicadores">
        <div class="indicador"><div class="rot">Projetos em criação</div><div class="val">${projetos.filter((x) => x.status === 'em_criacao').length}</div></div>
        <div class="indicador"><div class="rot">Em proposta</div><div class="val">${projetos.filter((x) => x.status === 'em_proposta').length}</div></div>
        <div class="indicador"><div class="rot">Recebido no mês</div><div class="val" style="font-size:20px">${moeda(recebidoMes)}</div></div>
        <div class="indicador"><div class="rot">A receber</div><div class="val" style="font-size:20px">${moeda(aReceber)}</div></div>
        <div class="indicador"><div class="rot">Peças prontas</div><div class="val">${numero(pecasEstoque, 0)}</div></div>
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
    const [{ data: fotos }, { data: fixas }] = await Promise.all([
      sb.from('portfolio').select('*').eq('artesa_id', p.id).eq('ativo', true).order('ordem'),
      sb.from('despesas_fixas').select('valor').eq('ativo', true)
    ]);
    const somaFixas = (fixas || []).reduce((s, f) => s + Number(f.valor || 0), 0);
    const taxas = Object.assign({ pix: 0, dinheiro: 0, debito: 0, credito: [0] }, p.taxas_pagamento || {});
    if (!Array.isArray(taxas.credito) || !taxas.credito.length) taxas.credito = [0];
    const linhaCredito = (i, v) => `<div class="campo"><label>Crédito ${i + 1}x</label><div class="com-sufixo"><input type="number" step="any" min="0" data-credito="${i}" value="${v ?? 0}"><span>%</span></div></div>`;

    area().innerHTML = `
      <div class="cabecalho"><div><h1>Configurações</h1><p>Seus dados, valores e padrões. Eles alimentam os cálculos, as propostas e o financeiro.</p></div></div>
      <form id="form-config" novalidate>
        <section class="card">
          <h2>Sua marca</h2><p class="sub">Aparece nas propostas enviadas aos clientes.</p>
          <div class="grade g2">
            ${campo('Seu nome', entrada('nome', p.nome))}
            ${campo('Nome da marca', entrada('nome_marca', p.nome_marca))}
            ${campo('Telefone', entrada('telefone', p.telefone))}
            ${campo('Instagram', entrada('instagram', p.instagram, 'placeholder="@suamarca"'))}
          </div>
          <div style="margin-top:16px">${campo('Texto de apresentação', `<textarea name="texto_apresentacao" rows="5">${esc(p.texto_apresentacao)}</textarea>`, '', 'Aparece na página de apresentação da proposta. Conte quem você é, há quanto tempo trabalha e o que torna suas peças especiais.')}</div>
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
          <h2>Quanto vale a sua hora</h2><p class="sub">O valor da hora entra como custo de mão de obra no preço de cada projeto.</p>
          <div class="grade g4">
            ${campo('Custos fixos do mês', numeroCom('custos_fixos_mes', p.custos_fixos_mes, 'R$', 'min="0"'), somaFixas ? `<a href="#" id="usar-fixas">Usar as despesas fixas: ${moeda(somaFixas)}</a>` : '', 'Energia, internet, aluguel, celular, assinaturas: tudo o que você paga todo mês para o ateliê funcionar.')}
            ${campo('Quanto quer tirar por mês', numeroCom('prolabore_desejado', p.prolabore_desejado, 'R$', 'min="0"'), '', 'Seu salário (pró-labore): o que você quer levar para casa por mês.')}
            ${campo('Horas de trabalho no mês', numeroCom('horas_mes', p.horas_mes, 'h', 'min="0"'), '', 'Só as horas produzindo peças. Ex.: 6 h por dia × 20 dias = 120 h.')}
            <div class="calculo" id="calc-hora" style="align-self:end"></div>
          </div>
          <div class="grade g4" style="margin-top:16px">
            ${campo('Valor da sua hora', numeroCom('valor_hora', p.valor_hora, 'R$/hora', 'min="0"'), '', 'Usado no preço de cada projeto: horas de trabalho × valor da hora.')}
            ${campo('Margem desejada', numeroCom('margem_padrao_pct', p.margem_padrao_pct, '%', 'min="0" max="95"'), '', 'Lucro que você quer sobre o preço de venda, além de pagar materiais e a sua hora.')}
            ${campo('Taxa usada no preço', numeroCom('taxa_maquininha_pct', p.taxa_maquininha_pct, '%', 'min="0" max="50"'), '', 'Taxa média que você considera ao calcular o preço. Use a do crédito que você mais recebe.')}
            ${campo('Imposto', numeroCom('imposto_pct', p.imposto_pct, '%', 'min="0" max="50"'), '', 'Percentual de imposto sobre a venda. Deixe 0 se não emite nota.')}
          </div>
        </section>

        <section class="card">
          <h2>Formas de pagamento</h2><p class="sub">Taxas da sua maquininha. Ao registrar um recebimento, o sistema desconta e mostra o valor líquido.</p>
          <div class="grade g4">
            ${campo('Pix', numeroCom('taxa_pix', taxas.pix, '%', 'min="0"'))}
            ${campo('Dinheiro', numeroCom('taxa_dinheiro', taxas.dinheiro, '%', 'min="0"'))}
            ${campo('Débito', numeroCom('taxa_debito', taxas.debito, '%', 'min="0"'))}
            ${campo('Sinal na venda', numeroCom('sinal_pct', p.sinal_pct ?? 50, '%', 'min="0" max="100"'), '', 'Quanto a cliente paga no fechamento. O resto fica como saldo a receber na entrega.')}
          </div>
          <h3 style="margin:18px 0 8px">Crédito</h3>
          <div class="grade g4" id="lista-credito">${taxas.credito.map((v, i) => linhaCredito(i, v)).join('')}</div>
          <div class="acoes" style="justify-content:flex-start;margin-top:10px">
            <button type="button" class="botao sec peq" id="mais-parcela">+ Parcela</button>
            <button type="button" class="botao texto peq" id="menos-parcela">Remover última</button>
          </div>
        </section>

        <section class="card">
          <h2>Padrões de cálculo · todas as peças</h2><p class="sub">Valem para qualquer tipo de peça. Você pode mudar em cada projeto.</p>
          <div class="grade g4">
            ${campo('Sobra em cada fio', numeroCom('sobra_por_fio_cm', p.sobra_por_fio_cm, 'cm', 'min="0"'), '', 'Margem de corte somada no fim de cada fio, para o arremate e para não faltar.')}
            ${campo('Arredondar na proposta', `<select name="arredondar_para">${opcoes({ 1: 'Não arredondar', 5: 'Para cima, de 5 em 5', 10: 'Para cima, de 10 em 10', 50: 'Para cima, de 50 em 50' }, String(p.arredondar_para ?? 10))}</select>`, '', 'Na proposta, o material aparece arredondado para cima. Ex.: 44 ganchos viram 50.')}
          </div>
        </section>

        <section class="card">
          <h2>Padrões de cálculo · guarda-corpo e telas</h2><p class="sub">Só para quem faz vãos com ganchos. Aparecem já preenchidos no projeto de guarda-corpo.</p>
          <div class="grade g4">
            ${campo('Espaço mínimo entre ganchos', numeroCom('esp_min_padrao', p.esp_min_padrao ?? 9, 'cm', 'min="0"'), '', 'Menor distância aceita entre um gancho e outro.')}
            ${campo('Espaço máximo entre ganchos', numeroCom('esp_max_padrao', p.esp_max_padrao ?? 10, 'cm', 'min="0"'), '', 'Maior distância aceita. O sistema distribui os ganchos sem passar disso.')}
            ${campo('Margem nas pontas', numeroCom('margem_vao_cm', p.margem_vao_cm ?? 2.5, 'cm', 'min="0"'), '', 'Na trama zigzag, distância do primeiro e do último gancho até a borda.')}
            ${campo('Sobra por ponta', numeroCom('ponta_cm', p.ponta_cm, 'cm', 'min="0"'), '', 'Corda extra em cada ponta da corda contínua, para dar o nó de fechamento.')}
            ${campo('Acabamento por gancho', numeroCom('acabamento_gancho_m', p.acabamento_gancho_m, 'm', 'min="0"'), '', 'Pedaço de corda usado para esconder cada gancho.')}
          </div>
        </section>

        <section class="card">
          <h2>Proposta · imagens e apresentação</h2><p class="sub">Montam as páginas da proposta, no modelo da sua marca.</p>
          <div class="grade g3">
            ${['capa_url:Foto da capa:Foto de uma peça sua. O logo fica por cima, no centro.', 'foto_apresentacao_url:Sua foto:Aparece no topo da página de apresentação.', 'foto_projetos_url:Foto da página de projetos:Faixa vertical ao lado do título "projetos realizados".'].map((x) => { const [k, rot, info] = x.split(':'); return `<div class="campo"><label>${esc(rot)}${dica(info)}</label>
              <div style="display:flex;gap:12px;align-items:center"><div class="logo-preview" style="background:var(--creme-2)">${p[k] ? `<img src="${esc(p[k])}" alt="" style="max-width:100%;max-height:100%;object-fit:cover">` : '<span style="color:var(--texto-2)">Sem foto</span>'}</div>
              <div><input type="file" accept="image/png,image/jpeg,image/webp" id="arq-${k}" data-img-campo="${k}" class="sr-only"><label for="arq-${k}" class="botao sec peq">Enviar</label></div></div></div>`; }).join('')}
          </div>
          <div class="grade g2" style="margin-top:16px">
            ${campo('Título da apresentação', entrada('apresentacao_titulo', p.apresentacao_titulo, 'placeholder="Olá, eu sou a Nathália,"'), '', 'Primeira linha, em negrito. Vazio: usa "Olá, eu sou a" + seu primeiro nome.')}
            ${campo('Complemento do título', entrada('apresentacao_subtitulo', p.apresentacao_subtitulo, 'placeholder="artista têxtil e criadora da Nodana!"'))}
          </div>
          <p class="ajuda" style="margin:10px 0 0;font-size:12px;color:var(--texto-2)">O texto de apresentação fica em "Sua marca". Deixe uma linha em branco entre os parágrafos. O primeiro sai em negrito.</p>
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

    const form = document.getElementById('form-config');
    const calcHora = () => {
      const cf = valorNum(form.custos_fixos_mes.value) || 0, pl = valorNum(form.prolabore_desejado.value) || 0, h = valorNum(form.horas_mes.value) || 0;
      const caixa = document.getElementById('calc-hora');
      if (!h || !(cf + pl)) { caixa.innerHTML = 'Preencha os três campos para ver quanto vale a sua hora.'; return; }
      const v = Math.round(((cf + pl) / h) * 100) / 100;
      caixa.innerHTML = `Sua hora vale <strong>${moeda(v)}</strong><br><a href="#" id="usar-hora">Usar este valor</a>`;
      document.getElementById('usar-hora').addEventListener('click', (ev) => { ev.preventDefault(); form.valor_hora.value = v; toast('Valor da hora preenchido. Clique em Salvar.'); });
    };
    ['custos_fixos_mes', 'prolabore_desejado', 'horas_mes'].forEach((k) => form[k].addEventListener('input', calcHora));
    calcHora();
    const lf = document.getElementById('usar-fixas');
    if (lf) lf.addEventListener('click', (ev) => { ev.preventDefault(); form.custos_fixos_mes.value = somaFixas; calcHora(); });

    const listaCred = document.getElementById('lista-credito');
    document.getElementById('mais-parcela').addEventListener('click', () => {
      const n = listaCred.querySelectorAll('[data-credito]').length;
      if (n >= 24) return;
      listaCred.insertAdjacentHTML('beforeend', linhaCredito(n, ''));
    });
    document.getElementById('menos-parcela').addEventListener('click', () => {
      const itens = listaCred.querySelectorAll('.campo');
      if (itens.length > 1) itens[itens.length - 1].remove();
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = new FormData(form);
      const textos = ['nome', 'nome_marca', 'telefone', 'instagram', 'texto_apresentacao', 'apresentacao_titulo', 'apresentacao_subtitulo', 'cor_primaria', 'cor_secundaria', 'cor_fundo', 'condicoes_pagamento', 'formas_pagamento'];
      const numeros = ['valor_hora', 'margem_padrao_pct', 'taxa_maquininha_pct', 'imposto_pct', 'sobra_por_fio_cm', 'ponta_cm', 'acabamento_gancho_m', 'arredondar_para', 'validade_proposta_dias', 'custos_fixos_mes', 'prolabore_desejado', 'horas_mes', 'sinal_pct', 'esp_min_padrao', 'esp_max_padrao', 'margem_vao_cm'];
      const dados = {};
      textos.forEach((k) => { dados[k] = (d.get(k) || '').trim() || null; });
      numeros.forEach((k) => { dados[k] = valorNum(d.get(k)) ?? 0; });
      dados.taxas_pagamento = {
        pix: valorNum(d.get('taxa_pix')) || 0, dinheiro: valorNum(d.get('taxa_dinheiro')) || 0, debito: valorNum(d.get('taxa_debito')) || 0,
        credito: Array.from(listaCred.querySelectorAll('[data-credito]')).map((i) => valorNum(i.value) || 0)
      };
      if (dados.margem_padrao_pct + dados.taxa_maquininha_pct + dados.imposto_pct >= 100) { toast('Margem + taxa + imposto precisam somar menos de 100%.', true); return; }
      if (dados.esp_min_padrao > dados.esp_max_padrao) { toast('O espaço mínimo entre ganchos está maior que o máximo.', true); return; }
      const { data, error } = await sb.from('perfis').update(dados).eq('id', p.id).select().single();
      if (error) return erro(error);
      estado.perfil = data;
      toast('Configurações salvas.');
      telaShell();
    });

    const enviarImagem = async (arquivo, pasta, campoPerfil) => {
      if (!arquivo) return;
      if (arquivo.size > 8 * 1024 * 1024) { toast('A imagem precisa ter até 8 MB.', true); return; }
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
    area().querySelectorAll('[data-img-campo]').forEach((el) => el.addEventListener('change', (ev) => enviarImagem(ev.target.files[0], 'marca', el.dataset.imgCampo)));

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
    const abas = { materiais: 'Materiais', tipos: 'Tipos de material', tramas: 'Tramas', nos: 'Nós', categorias: 'Categorias' };
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
    const fn = { materiais: abaMateriais, tipos: abaTipos, tramas: abaTramas, nos: abaNos, categorias: abaCategorias }[estado.abaBiblioteca];
    await fn(document.getElementById('aba-conteudo'));
  }

  const filtrarAtivos = (q) => (estado.mostrarInativos ? q : q.eq('ativo', true));
  const nomeMaterial = (m) => (m ? [nomeTipo(m.tipo_material_id), m.descricao, m.espessura_mm ? numero(m.espessura_mm) + ' mm' : '', m.cor, m.marca].filter(Boolean).join(' · ') : '');
  const nomeTipo = (id) => (estado.tiposMaterial.find((t) => t.id === id) || {}).nome || '';
  const seloOrigem = (r) => (r.artesa_id && r.artesa_id === estado.sessao.user.id ? '<span class="selo">Meu</span>' : '<span class="selo base">Base</span>');
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
        <div class="acoes" style="margin:0"><a class="botao sec" href="#/nota/nova">Importar nota de compra</a><button type="button" class="botao" id="novo-material">+ Novo material</button></div>
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
    if (!document.getElementById('novo-material')) return;
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
          ${campo('Tipo', `<select name="tipo_material_id" required data-add-tabela="tipos_material"><option value="">Escolha...</option>${opcoesLista(estado.tiposMaterial, m.tipo_material_id)}${opcaoAdicionar()}</select>`, 'Não achou? Use "+ Adicionar novo" no fim da lista.')}
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
        const r = m.id ? await sb.from('materiais').update(dados).eq('id', m.id).select().single() : await sb.from('materiais').insert(dados).select().single();
        if (r.error) throw r.error;
        toast('Material salvo.');
        recarregar(r.data);
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
          ${campo('Material', `<select name="tipo_material_id" required data-add-tabela="tipos_material" data-add-grupo="fio"><option value="">Escolha...</option>${opcoesLista(fios, t.tipo_material_id)}${opcaoAdicionar()}</select>`)}
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
          ${campo('Nó', `<select name="no_id" required data-add-tabela="nos"><option value="">Escolha...</option>${opcoesLista(estado.nos, c.no_id)}${opcaoAdicionar()}</select>`)}
          ${campo('Material', `<select name="tipo_material_id" required data-add-tabela="tipos_material" data-add-grupo="fio"><option value="">Escolha...</option>${opcoesLista(fios, c.tipo_material_id)}${opcaoAdicionar()}</select>`)}
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

  /* ---- Tipos de material ---- */
  async function abaTipos(raiz) {
    const { data, error } = await filtrarAtivos(sb.from('tipos_material').select('*').order('grupo').order('nome'));
    if (error) throw error;
    const lista = data || [];
    const recarregar = async () => { const t = await sb.from('tipos_material').select('*').eq('ativo', true).order('nome'); estado.tiposMaterial = t.data || []; abaTipos(raiz).catch(erro); };
    const GRUPOS = { fio: 'Fio ou corda', acessorio: 'Acessório', fixacao: 'Fixação' };
    raiz.innerHTML = `
      <div class="acoes" style="margin:0 0 14px;justify-content:space-between;align-items:center">
        <span style="color:var(--texto-2);font-size:14px">Os tipos que aparecem na hora de cadastrar um material. Os seus ficam só para você.</span>
        <button type="button" class="botao" id="novo-tipo">+ Novo tipo</button>
      </div>
      <div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Tipo</th><th>Usado como</th><th>Origem</th><th></th></tr></thead>
        <tbody>${lista.map((t) => `<tr class="${t.ativo ? '' : 'inativo'}"><td><strong>${esc(t.nome)}</strong></td><td>${esc(GRUPOS[t.grupo] || t.grupo)}</td><td>${seloOrigem(t)}</td>
          <td style="white-space:nowrap">${ehMeu(t) || ehAdmin() ? `<button type="button" class="botao texto peq" data-editar="${t.id}">Editar</button>${botaoAtivo('tipos_material', t)}` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const form = (t) => abrirModal({
      titulo: t ? 'Editar tipo' : 'Novo tipo de material',
      corpo: `<div class="grade g2">${campo('Nome', entrada('nome', t && t.nome, 'required'))}${campo('Usado como', `<select name="grupo">${opcoes(GRUPOS, (t && t.grupo) || 'acessorio')}</select>`)}</div>`,
      aoSalvar: async (d) => {
        const dados = { nome: (d.get('nome') || '').trim(), grupo: d.get('grupo') };
        if (!dados.nome) throw new Error('Informe o nome.');
        const r = t ? await sb.from('tipos_material').update(dados).eq('id', t.id) : await sb.from('tipos_material').insert(dados);
        if (r.error) throw /duplicate|unique/i.test(r.error.message) ? new Error('Já existe um tipo com esse nome.') : r.error;
        toast('Tipo salvo.'); recarregar();
      }
    });
    document.getElementById('novo-tipo').addEventListener('click', () => form(null));
    raiz.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => form(lista.find((x) => x.id === b.dataset.editar))));
    ligarAlternar(raiz, recarregar);
  }

  /* ---- Categorias ---- */
  async function abaCategorias(raiz) {
    const { data, error } = await filtrarAtivos(sb.from('categorias').select('*').order('ordem').order('nome'));
    if (error) throw error;
    const lista = data || [];
    const recarregar = () => abaCategorias(raiz).catch(erro);
    raiz.innerHTML = `
      <div class="acoes" style="margin:0 0 14px;justify-content:space-between;align-items:center">
        <span style="color:var(--texto-2);font-size:14px">Tipos de peça que aparecem em Novo projeto. Não achou o seu? Crie um tipo próprio.</span>
        <button type="button" class="botao" id="nova-categoria">+ Nova categoria</button>
      </div>
      <div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Tipo de peça</th><th>Perguntas usadas</th><th>Origem</th><th></th></tr></thead>
        <tbody>${lista.map((c) => `
          <tr class="${c.ativo ? '' : 'inativo'}">
            <td><strong>${esc(c.nome)}</strong></td>
            <td>${esc(FAMILIAS[c.familia] || 'Partes livres')}</td>
            <td>${seloOrigem(c)}</td>
            <td style="white-space:nowrap">${ehMeu(c) || ehAdmin() ? `<button type="button" class="botao texto peq" data-editar="${c.id}">Editar</button>${botaoAtivo('categorias', c)}` : ''}</td>
          </tr>`).join('')}</tbody></table></div>`;
    const form = (c) => abrirModal({
      titulo: c && c.id ? 'Editar categoria' : 'Nova categoria',
      corpo: `<div class="grade g2">
        ${campo('Nome', entrada('nome', c && c.nome, 'required'))}
        ${campo('Perguntas do projeto', `<select name="familia">${opcoes(FAMILIAS, (c && c.familia) || 'livre')}</select>`, '', 'Qual roteiro de perguntas o projeto deste tipo de peça vai usar. Se nenhum servir, escolha Partes livres.')}
      </div>`,
      aoSalvar: async (d) => {
        const dados = { nome: d.get('nome').trim(), familia: d.get('familia') };
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
  const ORIGENS = { '': 'Não sei', instagram: 'Instagram', indicacao: 'Indicação', feira: 'Feira ou evento', site: 'Site', whatsapp: 'WhatsApp', loja: 'Loja parceira', outro: 'Outro' };

  async function paginaClientes() {
    const { data, error } = await (estado.mostrarInativos ? sb.from('clientes').select('*') : sb.from('clientes').select('*').eq('ativo', true)).order('nome');
    if (error) throw error;
    const todos = data || [];
    const recarregar = () => paginaClientes().catch(erro);
    const desenhar = () => {
      const b = estado.buscaClientes.toLowerCase();
      const lista = todos.filter((c) => !b || [c.nome, c.telefone, c.cidade, c.email, c.instagram].join(' ').toLowerCase().includes(b));
      document.getElementById('lista-clientes').innerHTML = lista.length ? `<div class="tabela-rolagem"><table class="lista">
        <thead><tr><th>Nome</th><th>Celular</th><th>Cidade</th><th>Instagram</th><th>Como conheceu</th><th>Novidades</th><th></th></tr></thead>
        <tbody>${lista.map((c) => `
          <tr class="${c.ativo ? '' : 'inativo'}">
            <td><strong>${esc(c.nome)}</strong>${c.email ? `<br><span style="font-size:13px;color:var(--texto-2)">${esc(c.email)}</span>` : ''}</td>
            <td>${esc(c.telefone || '-')}</td>
            <td>${esc([c.cidade, c.uf].filter(Boolean).join('/') || '-')}</td>
            <td>${esc(c.instagram || '-')}</td>
            <td>${esc(ORIGENS[c.origem || ''] || c.origem || '-')}${c.indicado_por_id ? `<br><span style="font-size:12px;color:var(--texto-2)">por ${esc((todos.find((a) => a.id === c.indicado_por_id) || {}).nome || '')}</span>` : ''}</td>
            <td>${c.aceita_novidades ? '<span class="selo status-aprovado">Aceita</span>' : '-'}</td>
            <td style="white-space:nowrap"><button type="button" class="botao texto peq" data-editar="${c.id}">Editar</button>${botaoAtivo('clientes', c)}</td>
          </tr>`).join('')}</tbody></table></div>`
        : `<div class="vazio">${todos.length ? 'Nenhum cliente encontrado nessa busca.' : 'Nenhum cliente ainda.'}</div>`;
      document.querySelectorAll('#lista-clientes [data-editar]').forEach((bt) => bt.addEventListener('click', () => formCliente(todos.find((x) => x.id === bt.dataset.editar), recarregar)));
      ligarAlternar(document.getElementById('lista-clientes'), recarregar);
    };
    area().innerHTML = `
      <div class="cabecalho">
        <div><h1>Clientes</h1><p>Contatos de quem compra de você. Úteis para entregar, cobrar e fazer marketing depois.</p></div>
        <button type="button" class="botao" id="novo-cliente">+ Novo cliente</button>
      </div>
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        <div class="campo" style="flex:1;min-width:220px"><label class="sr-only" for="busca">Buscar</label><input id="busca" placeholder="Buscar por nome, celular, cidade ou Instagram" value="${esc(estado.buscaClientes)}"></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--texto-2)"><input type="checkbox" id="ver-inativos" ${estado.mostrarInativos ? 'checked' : ''}> Mostrar desativados</label>
      </div>
      <div id="lista-clientes"></div>`;
    document.getElementById('novo-cliente').addEventListener('click', () => formCliente(null, recarregar));
    document.getElementById('busca').addEventListener('input', (ev) => { estado.buscaClientes = ev.target.value; desenhar(); });
    document.getElementById('ver-inativos').addEventListener('change', (ev) => { estado.mostrarInativos = ev.target.checked; recarregar(); });
    desenhar();
  }

  // aoSalvar(clienteSalvo) é chamado depois de gravar
  async function formCliente(c, aoSalvar) {
    c = c || { aceita_novidades: false };
    const { data: outros } = await sb.from('clientes').select('id, nome').eq('ativo', true).order('nome');
    abrirModal({
      titulo: c.id ? 'Editar cliente' : 'Novo cliente',
      corpo: `
        <div class="grade g2">
          ${campo('Nome', entrada('nome', c.nome, 'required'))}
          ${campo('Celular / WhatsApp', entrada('telefone', c.telefone, 'type="tel" placeholder="(11) 99999-9999"'))}
          ${campo('E-mail', entrada('email', c.email, 'type="email"'))}
          ${campo('Instagram', entrada('instagram', c.instagram, 'placeholder="@cliente"'))}
          ${campo('Aniversário', entrada('aniversario', c.aniversario, 'type="date"'), '', 'Para mandar uma mensagem ou um cupom no aniversário.')}
          ${campo('Como conheceu você', `<select name="origem">${opcoes(ORIGENS, c.origem || '')}</select>`, '', 'Mostra quais canais trazem mais clientes.')}
          ${campo('Indicado por', `<select name="indicado_por_id"><option value="">Ninguém</option>${opcoesLista((outros || []).filter((o) => o.id !== c.id), c.indicado_por_id)}</select>`, '', 'Quem indicou: arquiteto, loja ou outro cliente.')}
        </div>
        <h3 style="margin:20px 0 10px">Endereço</h3>
        <div class="grade g3">
          ${campo('CEP', entrada('cep', c.cep, 'inputmode="numeric" placeholder="00000-000"'), '<span id="cep-status"></span>', 'Digite o CEP e o resto do endereço é preenchido sozinho.')}
          ${campo('Rua', entrada('logradouro', c.logradouro))}
          ${campo('Número', entrada('numero', c.numero))}
          ${campo('Complemento', entrada('complemento', c.complemento))}
          ${campo('Bairro', entrada('bairro', c.bairro))}
          ${campo('Cidade', entrada('cidade', c.cidade))}
          ${campo('UF', entrada('uf', c.uf, 'maxlength="2"'))}
        </div>
        <label style="display:flex;gap:8px;align-items:flex-start;margin-top:16px"><input type="checkbox" name="aceita_novidades" ${c.aceita_novidades ? 'checked' : ''} style="margin-top:4px"> <span>A cliente <strong>aceita receber novidades</strong> e promoções. <span class="ajuda" style="display:block;font-size:12px;color:var(--texto-2)">Pela LGPD, só mande marketing para quem autorizou.</span></span></label>
        <div style="margin-top:14px">${campo('Observações', `<textarea name="observacoes" rows="3">${esc(c.observacoes)}</textarea>`)}</div>`,
      aoAbrir: (form) => {
        form.cep.addEventListener('input', async () => {
          const cep = form.cep.value.replace(/\D/g, '');
          const st = document.getElementById('cep-status');
          if (cep.length !== 8) { st.textContent = ''; return; }
          st.textContent = 'Buscando...';
          try {
            const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const j = await r.json();
            if (j.erro) { st.textContent = 'CEP não encontrado.'; return; }
            form.logradouro.value = j.logradouro || form.logradouro.value;
            form.bairro.value = j.bairro || form.bairro.value;
            form.cidade.value = j.localidade || form.cidade.value;
            form.uf.value = j.uf || form.uf.value;
            st.textContent = 'Endereço preenchido.';
            form.numero.focus();
          } catch (_) { st.textContent = 'Não consegui buscar. Preencha à mão.'; }
        });
      },
      aoSalvar: async (d) => {
        const t = (k) => (d.get(k) || '').trim() || null;
        const dados = {
          nome: t('nome'), telefone: t('telefone'), email: t('email'), instagram: t('instagram'),
          aniversario: t('aniversario'), origem: t('origem'), indicado_por_id: t('indicado_por_id'),
          cep: t('cep'), logradouro: t('logradouro'), numero: t('numero'), complemento: t('complemento'),
          bairro: t('bairro'), cidade: t('cidade'), uf: (t('uf') || '').toUpperCase() || null,
          aceita_novidades: d.get('aceita_novidades') === 'on', observacoes: t('observacoes')
        };
        if (!dados.nome) throw new Error('Informe o nome do cliente.');
        const r = c.id ? await sb.from('clientes').update(dados).eq('id', c.id).select().single() : await sb.from('clientes').insert(dados).select().single();
        if (r.error) throw r.error;
        toast('Cliente salvo.');
        if (aoSalvar) aoSalvar(r.data);
      }
    });
  }

  /* ---------------------------------------------------------------
     "+ Adicionar novo" dentro das listas suspensas
     Uso: <select data-add-tabela="tipos_material" data-add-grupo="fio">...${opcaoAdicionar()}</select>
     --------------------------------------------------------------- */
  const opcaoAdicionar = (rotulo = '+ Adicionar novo...') => `<option value="__novo">${esc(rotulo)}</option>`;
  const LISTAS = {
    tipos_material: { titulo: 'Novo tipo de material', ajuda: 'Ex.: Pingente de coco, Fio de juta, Argola de metal.' },
    nos: { titulo: 'Novo nó', ajuda: 'Depois cadastre quanto ele gasta em Biblioteca > Nós.' },
    categorias: { titulo: 'Novo tipo de peça', ajuda: 'Ex.: Chaveiro, Cortina, Tapete.' },
    categorias_financeiras: { titulo: 'Nova categoria de despesa', ajuda: 'Ex.: Aluguel da feira, Curso.' }
  };
  async function adicionarNaLista(sel) {
    const tabela = sel.dataset.addTabela;
    const cfgL = LISTAS[tabela];
    const anterior = sel.dataset.valorAnterior || '';
    sel.value = anterior;
    if (!cfgL) return;
    abrirModal({
      titulo: cfgL.titulo,
      corpo: `${campo('Nome', '<input name="nome" required>', cfgL.ajuda)}
        ${tabela === 'tipos_material' ? `<div style="margin-top:12px">${campo('É usado como', `<select name="grupo">${opcoes({ fio: 'Fio ou corda (gasto em metros)', acessorio: 'Acessório (por unidade)', fixacao: 'Fixação (gancho, olhal)' }, sel.dataset.addGrupo || 'acessorio')}</select>`)}</div>` : ''}
        ${tabela === 'categorias' ? `<div style="margin-top:12px">${campo('Perguntas do projeto', `<select name="familia">${opcoes(FAMILIAS, 'livre')}</select>`)}</div>` : ''}
        <p class="ajuda" style="margin:12px 0 0;font-size:12px;color:var(--texto-2)">Fica salvo só para você.</p>`,
      aoSalvar: async (d) => {
        const nome = (d.get('nome') || '').trim();
        if (!nome) throw new Error('Informe o nome.');
        const dados = { nome };
        if (tabela === 'tipos_material') dados.grupo = d.get('grupo');
        if (tabela === 'categorias') { dados.familia = d.get('familia'); dados.modelo = 'ambos'; dados.ordem = 100; }
        if (tabela === 'categorias_financeiras') { dados.tipo = sel.dataset.addTipo || 'despesa'; dados.ordem = 50; }
        const r = await sb.from(tabela).insert(dados).select().single();
        if (r.error) throw /duplicate|unique/i.test(r.error.message) ? new Error('Já existe um item com esse nome.') : r.error;
        if (tabela === 'tipos_material') estado.tiposMaterial = [...estado.tiposMaterial, r.data].sort((a, b) => a.nome.localeCompare(b.nome));
        if (tabela === 'nos') estado.nos = [...estado.nos, r.data].sort((a, b) => a.nome.localeCompare(b.nome));
        const op = document.createElement('option');
        op.value = r.data.id; op.textContent = r.data.nome;
        sel.insertBefore(op, sel.querySelector('option[value="__novo"]'));
        sel.value = r.data.id;
        sel.dataset.valorAnterior = r.data.id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        toast(`"${r.data.nome}" adicionado.`);
      }
    });
  }
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { const m = document.querySelectorAll('.fundo-modal'); if (m.length) m[m.length - 1].remove(); } });
  document.addEventListener('focusin', (ev) => { const s = ev.target; if (s.tagName === 'SELECT' && s.dataset.addTabela) s.dataset.valorAnterior = s.value; });
  document.addEventListener('change', (ev) => { const s = ev.target; if (s.tagName === 'SELECT' && s.value === '__novo') { ev.stopImmediatePropagation(); adicionarNaLista(s); } }, true);

  /* ---------------------------------------------------------------
     Compartilhado com os outros módulos (projetos, propostas, assistente)
     --------------------------------------------------------------- */
  Object.assign(App, { sb, estado, cfg, esc, moeda, numero, valorNum, toast, erro, traduzErro, abrirModal, campo, dica, entrada, numeroCom, opcoes, opcoesLista, area, ehAdmin, ehMeu, nomeTipo, telaShell, formCliente, formMaterial, opcaoAdicionar, nomeMaterial, TIPOS_TRAMA, MODELOS, FAMILIAS });

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

  window.addEventListener('hashchange', () => { document.querySelectorAll('.fundo-modal').forEach((m) => m.remove()); if (estado.sessao) telaShell(); });

  sb.auth.getSession().then(({ data }) => aoMudarSessao(data.session)).catch((e) => { console.error(e); telaLogin(); });
  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'SIGNED_IN' && estado.sessao && sessao && estado.sessao.user.id === sessao.user.id) { estado.sessao = sessao; return; }
    if (evento === 'TOKEN_REFRESHED') { estado.sessao = sessao; return; }
    if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') aoMudarSessao(sessao);
  });
})();
