/* =====================================================================
   Calculadora do ateliê
   Regras determinísticas. A IA nunca calcula: ela só preenche os
   parâmetros e chama estas funções.
   Funciona no navegador (window.Calc) e no Node (testes).
   ===================================================================== */
(function (raiz) {
  'use strict';

  const EMENDA_CM = 40;
  const r2 = (n) => Math.round(n * 100) / 100;
  const num = (v, padrao = 0) => { const n = Number(v); return isFinite(n) && v !== '' && v !== null && v !== undefined ? n : padrao; };

  /* ---------------- Ganchos ---------------- */

  // Trama zigzag: primeiro e último gancho a "margem" da borda.
  function ganchosComMargem(medida, espMax, margem) {
    const util = medida - 2 * margem;
    const intervalos = Math.max(1, Math.ceil(util / espMax - 1e-9));
    return { ganchos: intervalos + 1, espacamento: util / intervalos, intervalos, margem };
  }

  // Trama quadrado: sem gancho nos cantos. Devolve as opções de divisão
  // que deixam o espaçamento entre min e max.
  function opcoesSemCanto(medida, espMin, espMax) {
    const lista = [];
    for (let n = Math.max(1, Math.floor(medida / espMax)); n <= Math.ceil(medida / espMin); n++) {
      const s = medida / n;
      if (s >= espMin - 1e-9 && s <= espMax + 1e-9) lista.push({ espacos: n, espacamento: s, ganchos: n - 1 });
    }
    return lista;
  }

  function ganchosQuadrado(largura, altura, espMin, espMax) {
    const avisos = [];
    const alvo = (espMin + espMax) / 2;
    const reserva = (m) => { const n = Math.max(2, Math.round(m / alvo)); return [{ espacos: n, espacamento: m / n, ganchos: n - 1 }]; };
    let ol = opcoesSemCanto(largura, espMin, espMax);
    let oa = opcoesSemCanto(altura, espMin, espMax);
    if (!ol.length) { ol = reserva(largura); avisos.push(`Na largura de ${largura} cm não dá para ficar entre ${espMin} e ${espMax} cm. Usei ${r2(ol[0].espacamento)} cm.`); }
    if (!oa.length) { oa = reserva(altura); avisos.push(`Na altura de ${altura} cm não dá para ficar entre ${espMin} e ${espMax} cm. Usei ${r2(oa[0].espacamento)} cm.`); }
    let melhor = null;
    for (const a of ol) for (const b of oa) {
      const nota = Math.abs(a.espacamento - b.espacamento) * 10 + Math.abs(a.espacamento - alvo) + Math.abs(b.espacamento - alvo);
      if (!melhor || nota < melhor.nota) melhor = { nota, largura: a, altura: b };
    }
    return { largura: melhor.largura, altura: melhor.altura, avisos };
  }

  /* ---------------- Trama zigzag (3 passagens) ---------------- */
  // Ganchos em cima (C) e embaixo (B), ao longo da largura. A corda vence a altura.
  function percursoZigzag(n, espacamento, altura) {
    const ultimo = n - 1;
    let pos = { i: 0, lado: 'C' };
    let total = 0;
    const trechos = [];
    const outro = (l) => (l === 'C' ? 'B' : 'C');
    const ir = (i, lado, passagem) => {
      const dx = Math.abs(i - pos.i) * espacamento;
      const dy = lado === pos.lado ? 0 : altura;
      const d = Math.hypot(dx, dy);
      total += d;
      trechos.push({ passagem, de: pos.lado + (pos.i + 1), para: lado + (i + 1), cm: d });
      pos = { i, lado };
    };

    // 1ª passagem (pula 1): ida desce reto e sobe na diagonal; volta cruza em X.
    ir(0, 'B', 1);
    for (let i = 1; i <= ultimo; i++) { ir(i, outro(pos.lado), 1); ir(i, outro(pos.lado), 1); }
    for (let i = ultimo - 1; i >= 0; i--) { ir(i, outro(pos.lado), 1); ir(i, outro(pos.lado), 1); }

    // 2ª (pula 2) e 3ª (pula 3): só diagonais, ida e volta.
    for (const pulo of [2, 3]) {
      for (const sentido of [1, -1]) {
        const fim = sentido === 1 ? ultimo : 0;
        while (Math.abs(fim - pos.i) >= pulo) ir(pos.i + sentido * pulo, outro(pos.lado), pulo);
        if (pos.i !== fim) {
          // Passagem de ajuste: vai ao último, faz uma reta e volta.
          const parou = pos.i;
          ir(fim, outro(pos.lado), pulo);
          ir(fim, outro(pos.lado), pulo);
          ir(parou, outro(pos.lado), pulo);
        } else if (sentido === 1) {
          ir(fim, outro(pos.lado), pulo); // reta para virar e cruzar em X na volta
        }
      }
    }
    return { cm: total, trechos };
  }

  /* ---------------- Componentes ---------------- */

  function consumoDoNo(ctx, noId, material) {
    if (!material) return null;
    const cands = (ctx.consumoNos || []).filter((c) => c.ativo !== false && c.no_id === noId && c.tipo_material_id === material.tipo_material_id && Math.abs(num(c.espessura_mm) - num(material.espessura_mm)) < 0.01);
    // O da artesã vale mais que o da base.
    cands.sort((a, b) => (b.artesa_id ? 1 : 0) - (a.artesa_id ? 1 : 0));
    return cands[0] ? num(cands[0].consumo_cm) : null;
  }

  function rolosDo(material) {
    if (material && material.unidade_compra === 'rolo' && material.unidade_consumo === 'metro' && num(material.quantidade_por_compra) > 0) return num(material.quantidade_por_compra) * 100;
    return Infinity;
  }

  function emendas(cm, material) {
    const rolo = rolosDo(material);
    if (!isFinite(rolo)) return 0;
    let e = 0;
    while (cm + e * EMENDA_CM > rolo * (e + 1)) e++;
    return e;
  }

  function calcularVao(p, material, ctx, perfil) {
    const forma = p.forma === 'quadrado' ? 'quadrado' : 'zigzag';
    const L = num(p.largura_cm), H = num(p.altura_cm), telas = Math.max(1, Math.round(num(p.telas, 1)));
    const espMin = num(p.esp_min, 9), espMax = num(p.esp_max, 10);
    const ponta = num(perfil.ponta_cm, 20), acabG = num(perfil.acabamento_gancho_m, 1) * 100;
    const avisos = [];
    if (!(L > 0 && H > 0)) return { erro: 'Informe largura e altura do vão.' };
    let r;
    if (forma === 'zigzag') {
      const margem = num(p.margem_cm, 2.5);
      const g = ganchosComMargem(L, espMax, margem);
      if (g.espacamento < espMin - 1e-9) avisos.push(`O espaçamento ficou em ${r2(g.espacamento)} cm, abaixo de ${espMin} cm.`);
      const perc = percursoZigzag(g.ganchos, g.espacamento, H);
      const continua = perc.cm + 2 * ponta;
      const nEmendas = emendas(continua, material);
      const ganchosTela = g.ganchos * 2;
      const acabamento = ganchosTela * acabG;
      const porTela = continua + nEmendas * EMENDA_CM + acabamento;
      r = {
        forma, telas,
        ganchos: { cima: g.ganchos, baixo: g.ganchos, por_tela: ganchosTela, total: ganchosTela * telas, espacamento_cm: r2(g.espacamento), margem_cm: margem, posicoes_cm: Array.from({ length: g.ganchos }, (_, i) => r2(margem + i * g.espacamento)) },
        cortes: [
          { descricao: 'Corda da trama (contínua)', quantidade: telas, comprimento_m: r2((continua + nEmendas * EMENDA_CM) / 100), emendas: nEmendas },
          { descricao: 'Acabamento dos ganchos', quantidade: ganchosTela * telas, comprimento_m: r2(acabG / 100) }
        ],
        detalhe: { percurso_m: r2(perc.cm / 100), pontas_m: r2(2 * ponta / 100), emendas: nEmendas, emendas_m: r2(nEmendas * EMENDA_CM / 100), acabamento_m: r2(acabamento / 100) },
        trechos: perc.trechos.length,
        metros: r2((porTela * telas) / 100)
      };
    } else {
      const g = ganchosQuadrado(L, H, espMin, espMax);
      avisos.push(...g.avisos);
      const nt = g.largura.ganchos; // em cima e embaixo
      const nl = g.altura.ganchos;  // em cada lateral
      const sV = g.altura.espacamento, sH = g.largura.espacamento;
      let consumoNo = consumoDoNo(ctx, p.no_id || (ctx.noFestone || {}).id, material);
      if (consumoNo === null) { consumoNo = 19; avisos.push('Não achei o consumo do nó festonê para este material e espessura. Usei 19 cm. Cadastre na Biblioteca > Nós.'); }
      const cruz = nl * nt;
      const horiz = nl * L + (nl - 1) * sV + 2 * ponta;
      const vert = nt * H + (nt - 1) * sH + 2 * ponta + cruz * consumoNo;
      const eH = emendas(horiz, material), eV = emendas(vert, material);
      const acab = 4 * acabG;
      const porTela = horiz + eH * EMENDA_CM + vert + eV * EMENDA_CM + acab;
      const ganchosTela = 2 * nt + 2 * nl;
      r = {
        forma, telas,
        ganchos: { cima: nt, baixo: nt, esquerda: nl, direita: nl, por_tela: ganchosTela, total: ganchosTela * telas, espacamento_largura_cm: r2(sH), espacamento_altura_cm: r2(sV), posicoes_largura_cm: Array.from({ length: nt }, (_, i) => r2((i + 1) * sH)), posicoes_altura_cm: Array.from({ length: nl }, (_, i) => r2((i + 1) * sV)) },
        cortes: [
          { descricao: 'Corda horizontal', quantidade: telas, comprimento_m: r2((horiz + eH * EMENDA_CM) / 100), emendas: eH },
          { descricao: 'Corda vertical', quantidade: telas, comprimento_m: r2((vert + eV * EMENDA_CM) / 100), emendas: eV },
          { descricao: 'Acabamento', quantidade: telas, comprimento_m: r2(acab / 100) }
        ],
        detalhe: { cruzamentos: cruz, consumo_no_cm: consumoNo, horizontal_m: r2(horiz / 100), vertical_m: r2(vert / 100), acabamento_m: r2(acab / 100) },
        metros: r2((porTela * telas) / 100)
      };
    }
    r.area_m2 = Math.round(L * H * telas) / 10000;
    r.avisos = avisos;
    return r;
  }

  function calcularTrama(p, trama, perfil, extrasPorFioCm) {
    if (!trama) return { erro: 'Escolha a trama.' };
    const larg = num(p.largura_cm), comp = num(p.comprimento_cm), pecas = Math.max(1, Math.round(num(p.pecas, 1)));
    const lt = num(trama.largura_trama_cm), fpt = num(trama.fios_por_trama), rm = num(trama.rendimento_metros), rc = num(trama.rendimento_cm);
    if (!(larg > 0 && comp > 0)) return { erro: 'Informe largura e comprimento da trama.' };
    if (!(lt > 0 && fpt > 0 && rm > 0 && rc > 0)) return { erro: `A trama "${trama.nome}" está sem medidas na Biblioteca.` };
    const tramas = Math.ceil(larg / lt - 1e-9);
    const fios = tramas * fpt;
    const baseCm = (comp / rc) * rm * 100;
    const sobra = num(perfil.sobra_por_fio_cm, 10);
    const fioCm = baseCm + extrasPorFioCm + sobra;
    return {
      tramas, fios_por_peca: fios, pecas,
      cortes: [{ descricao: `Fios da trama ${trama.nome}`, quantidade: fios * pecas, comprimento_m: r2(fioCm / 100) }],
      detalhe: { trama_m: r2(baseCm / 100), extras_m: r2(extrasPorFioCm / 100), sobra_m: r2(sobra / 100) },
      metros: r2((fios * pecas * fioCm) / 100)
    };
  }

  /* ---------------- Projeto ---------------- */
  // ctx: { perfil, materiais, tramas, consumoNos, nos }
  // componentes: [{ tipo, descricao, material_id, trama_id, no_id, parametros }]
  function calcularProjeto(componentes, ctx) {
    const perfil = ctx.perfil || {};
    const acharMat = (id) => (ctx.materiais || []).find((m) => m.id === id) || null;
    const acharTrama = (id) => (ctx.tramas || []).find((t) => t.id === id) || null;
    ctx.noFestone = (ctx.nos || []).find((n) => /feston/i.test(n.nome)) || null;

    const res = componentes.map(() => ({}));
    const extras = componentes.map(() => 0); // cm somados em cada fio de uma trama

    // 1) trechos sem trama e nós aplicados a uma trama viram extra por fio
    componentes.forEach((c, i) => {
      const p = c.parametros || {};
      const alvo = p.aplicar_em === '' || p.aplicar_em === null || p.aplicar_em === undefined ? -1 : Number(p.aplicar_em);
      if (!(alvo >= 0 && componentes[alvo] && componentes[alvo].tipo === 'trama')) return;
      if (c.tipo === 'trecho_sem_trama') extras[alvo] += num(p.comprimento_cm);
      if (c.tipo === 'no') {
        const matAlvo = acharMat(componentes[alvo].material_id);
        const cons = consumoDoNo(ctx, c.no_id, matAlvo);
        if (cons === null) { res[i].erro = 'Não achei o consumo deste nó para o material da trama. Cadastre na Biblioteca > Nós.'; return; }
        extras[alvo] += num(p.nos_por_fio) * cons;
      }
    });

    // 2) cada componente
    componentes.forEach((c, i) => {
      if (res[i].erro) return;
      const p = c.parametros || {};
      const mat = acharMat(c.material_id);
      const aplicado = p.aplicar_em !== '' && p.aplicar_em !== null && p.aplicar_em !== undefined && Number(p.aplicar_em) >= 0;
      try {
        if (c.tipo === 'trama') res[i] = calcularTrama(p, acharTrama(c.trama_id), perfil, extras[i]);
        else if (c.tipo === 'vao') res[i] = calcularVao({ ...p, forma: p.forma || ((acharTrama(c.trama_id) || {}).tipo === 'vao_quadrado' ? 'quadrado' : 'zigzag') }, mat, ctx, perfil);
        else if (c.tipo === 'trecho_sem_trama') {
          if (aplicado) res[i] = { incluido_em: Number(p.aplicar_em), metros: 0 };
          else {
            const fios = Math.max(0, Math.round(num(p.fios))), comp = num(p.comprimento_cm), sobra = num(perfil.sobra_por_fio_cm, 10);
            if (!(fios > 0 && comp > 0)) res[i] = { erro: 'Informe quantos fios e o comprimento.' };
            else res[i] = { cortes: [{ descricao: c.descricao || 'Trecho sem trama', quantidade: fios, comprimento_m: r2((comp + sobra) / 100) }], metros: r2(fios * (comp + sobra) / 100) };
          }
        } else if (c.tipo === 'no') {
          if (aplicado) res[i] = { incluido_em: Number(p.aplicar_em), metros: 0 };
          else {
            const cons = consumoDoNo(ctx, c.no_id, mat);
            if (cons === null) res[i] = { erro: 'Não achei o consumo deste nó para este material e espessura. Cadastre na Biblioteca > Nós.' };
            else res[i] = { consumo_cm: cons, metros: r2(num(p.quantidade) * cons / 100) };
          }
        } else if (c.tipo === 'acessorio') {
          res[i] = { unidades: Math.max(0, num(p.quantidade)) };
        }
      } catch (e) { res[i] = { erro: e.message }; }
    });

    // 3) totais por material
    const porMaterial = {};
    const somar = (matId, qtd) => {
      if (!matId || !qtd) return;
      porMaterial[matId] = (porMaterial[matId] || 0) + qtd;
    };
    componentes.forEach((c, i) => {
      const r = res[i];
      if (r.erro) return;
      if (c.tipo === 'acessorio') somar(c.material_id, r.unidades);
      else if (r.metros) {
        somar(c.material_id, r.metros);
      }
      if (c.tipo === 'vao' && c.parametros && c.parametros.gancho_material_id && c.parametros.ganchos_fornecidos !== 'cliente') somar(c.parametros.gancho_material_id, r.ganchos.total);
    });

    const avisos = [];
    const materiais = Object.entries(porMaterial).map(([id, qtd]) => {
      const m = acharMat(id);
      if (!m) { avisos.push('Um material usado no projeto não está mais na Biblioteca.'); return { material_id: id, quantidade: qtd, unidade: '?', custo: 0 }; }
      const custoUn = num(m.custo_por_unidade, num(m.preco_compra) / Math.max(num(m.quantidade_por_compra, 1), 1e-9));
      if (m.unidade_consumo === 'grama') avisos.push(`"${m.descricao || m.marca || 'Material'}" está cadastrado em gramas. Para cordas, informe quantos metros vêm em cada compra.`);
      const rolo = rolosDo(m);
      return {
        material_id: id, quantidade: r2(qtd), unidade: m.unidade_consumo, custo_unitario: custoUn,
        custo: r2(qtd * custoUn),
        rolos: isFinite(rolo) ? Math.ceil(qtd * 100 / rolo - 1e-9) : null,
        estoque_atual: num(m.estoque_atual),
        falta: num(m.estoque_atual) < qtd ? r2(qtd - num(m.estoque_atual)) : 0
      };
    });

    res.forEach((r) => { if (r.avisos) avisos.push(...r.avisos); });
    const vaos = res.filter((r, i) => componentes[i].tipo === 'vao' && !r.erro);
    return {
      componentes: res,
      materiais,
      custo_material: r2(materiais.reduce((s, m) => s + m.custo, 0)),
      ganchos_total: vaos.reduce((s, v) => s + v.ganchos.total, 0),
      area_m2: Math.round(vaos.reduce((s, v) => s + v.area_m2, 0) * 10000) / 10000,
      metros_total: r2(materiais.filter((m) => m.unidade === 'metro').reduce((s, m) => s + m.quantidade, 0)),
      erros: res.map((r, i) => (r.erro ? { componente: i, erro: r.erro } : null)).filter(Boolean),
      avisos
    };
  }

  /* ---------------- Preço ---------------- */
  // d: { metodo, custo_material, horas, valor_hora, deslocamento, embalagem, frete,
  //      taxa_pct, imposto_pct, margem_pct, area_m2, valor_m2, preco_final }
  function calcularPreco(d) {
    const trabalho = r2(num(d.horas) * num(d.valor_hora));
    const extras = num(d.deslocamento) + num(d.embalagem) + num(d.frete);
    const custo = r2(num(d.custo_material) + trabalho + extras);
    const taxa = num(d.taxa_pct) / 100, imposto = num(d.imposto_pct) / 100, margem = num(d.margem_pct) / 100;
    const divisor = 1 - taxa - imposto - margem;
    const porCusto = divisor > 0 ? r2(custo / divisor) : null;
    const porM2 = r2(num(d.area_m2) * num(d.valor_m2) + extras);
    const sugerido = d.metodo === 'm2' ? porM2 : porCusto;
    const final = d.preco_final === '' || d.preco_final === null || d.preco_final === undefined ? sugerido : num(d.preco_final);
    const liquido = r2(num(final) * (1 - taxa - imposto));
    const lucro = r2(liquido - custo);
    return {
      custo_trabalho: trabalho, extras: r2(extras), custo_total: custo,
      preco_por_custo: porCusto, preco_por_m2: porM2, preco_sugerido: sugerido,
      preco_final: r2(num(final)), recebe_liquido: liquido, lucro,
      margem_real_pct: final ? r2((lucro / num(final)) * 100) : 0,
      alerta_prejuizo: liquido < custo,
      erro: divisor <= 0 ? 'Taxa + imposto + margem passam de 100%.' : null
    };
  }

  /* ---------------- Arredondamento para a proposta ---------------- */
  function arredondarCima(valor, passo) {
    passo = num(passo, 10);
    if (passo <= 1) return Math.ceil(valor - 1e-9);
    return Math.ceil(valor / passo - 1e-9) * passo;
  }

  raiz.Calc = { calcularProjeto, calcularPreco, calcularVao, calcularTrama, percursoZigzag, ganchosComMargem, ganchosQuadrado, arredondarCima, EMENDA_CM };
})(typeof window !== 'undefined' ? window : globalThis);
