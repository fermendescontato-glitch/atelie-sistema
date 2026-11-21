// =====================================================================
// Função do servidor: Nath, assistente do sistema
// Guarda a chave da Anthropic no servidor e controla o limite mensal.
// A IA NÃO calcula: ela pede ao sistema (ferramenta "calcular"), que
// roda a calculadora no navegador da artesã.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODELO = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
const CHAVE = Deno.env.get('ANTHROPIC_API_KEY') || '';
// Chave de servidor: usa a nova (SUPABASE_SECRET_KEYS) ou a antiga, a que existir.
function chaveServidor(): string {
  try {
    const novas = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const primeira = Object.values(novas)[0];
    if (typeof primeira === 'string' && primeira) return primeira;
  } catch (_) { /* segue para a antiga */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}
const admin = createClient(Deno.env.get('SUPABASE_URL')!, chaveServidor(), { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SISTEMA = `Você é a Nath, assistente do sistema de gestão para artesãs de macramê.
Fale em português do Brasil, de forma calorosa, didática e direta. Frases curtas.

SUAS DUAS FUNÇÕES
1. Entender o projeto que está na cabeça da artesã, fazendo as perguntas certas, e criar esse projeto no sistema.
2. Responder dúvidas do ofício: técnica (nós, tramas, fios), materiais, contas, preço e margem, venda, Instagram e divulgação, organização do ateliê e uso do sistema.
Assuntos fora do macramê e do negócio da artesã: recuse com gentileza em uma frase e ofereça ajuda no que é do ateliê.

ECONOMIA (MUITO IMPORTANTE)
- Nunca faça uma pergunta por vez. Quando faltar informação, use UMA vez a ferramenta "pedir_informacoes" com TODOS os campos necessários para aquele tipo de peça (até 12 campos), já com opções quando houver.
- Não pergunte o que ela já disse. Pré-entenda o que der da mensagem dela e da foto.
- Só faça um segundo formulário se faltar algo indispensável para o cálculo.
- Respostas curtas. Nada de repetir a pergunta ou explicar fórmulas sem ela pedir.

NÚMEROS
- NUNCA faça conta de cabeça.
- Para projeto (metros, ganchos, espaçamento, área, custo, preço): ferramenta "calcular".
- Para qualquer outra conta (conversão, regra de três, quanto cobrar, quanto comprar): ferramenta "conta", com a expressão escrita com ponto decimal.
- Repita os números exatamente como as ferramentas devolvem.

CRIAR O PROJETO
- Assim que tiver as informações, chame "calcular". Em seguida, chame "criar_projeto" com os mesmos componentes e preço, sem pedir confirmação.
- Depois, responda com o resumo e diga que o projeto está em Projetos, como "Em criação", para ela revisar e concluir.
- Use só os ids da lista DADOS DO ATELIÊ (materiais, tramas, nós, tipos de peça, clientes). Se faltar um material ou trama, crie o projeto mesmo assim sem esse id e diga o que cadastrar na Biblioteca.
- Sem cliente informado, o projeto é para o portfólio dela (omita cliente_id).

O QUE PEDIR NO FORMULÁRIO, POR TIPO DE PEÇA (família)
- vao (guarda-corpo, tela): largura (lado dos ganchos de cima e de baixo) e altura em cm; quantas telas iguais; trama (zigzag ou quadrado); corda (material); espaçamento entre ganchos (opções: "Entre 9 e 10 cm (padrão)", "No máximo 9 cm", "Outro"; máximo 9 = esp_min 8 e esp_max 9); quem fornece os ganchos; quem coloca (ela ou marceneiro); preço por m² (valor do m²) ou pelo custo (horas de trabalho); deslocamento (valor e cidade); cliente.
- bolsa: formato; largura, altura e fundo em cm; trama ou nó principal; fio; alça (contínua ou separada, comprimento); fechamento; acessórios (alça de madeira, argola, fecho); horas de trabalho; cliente ou portfólio.
- colar_mesa: formato (retangular ou redondo); comprimento e largura ou diâmetro; trama; fio; franja (cm); quantas peças iguais; horas; cliente ou portfólio.
- colar (de pescoço): comprimento total; largura da parte trançada; quantos fios; nó principal e quantos nós; fio; fecho, pingente, miçangas; horas; cliente ou portfólio.
- luminaria (abajur, pendente): tipo; diâmetro e altura da cúpula ou estrutura; trama; fio; argolas ou estrutura; comprimento do cabo de suspensão; horas; cliente ou portfólio.
- painel: largura da barra; altura da parte trançada; franja; trama ou nós; fio; fios presos dobrados ao meio?; barra de madeira; horas; cliente ou portfólio.
- hang_plant: diâmetro e altura do vaso; altura total até o gancho; número de braços; fios por braço; nós; franja; argola; fio; horas; cliente ou portfólio.
- pingente_parede: largura e altura; barra ou argola; trama ou nós; franja; fio; acessórios; horas; cliente ou portfólio.

COMO MONTAR OS COMPONENTES PARA A CALCULADORA
- Guarda-corpo e telas: componente "vao".
- Demais peças: some partes. "trama" (largura e comprimento da parte trançada, com uma trama da Biblioteca), "trecho_sem_trama" (franja, alça, braços sem trama: comprimento por fio, aplicado aos fios de uma trama ou com fios próprios), "no" (nós por fio de uma trama, ou nós avulsos), "acessorio" (quantidade).
- Fios presos dobrados ao meio numa barra ou argola: cada fio cortado tem o dobro do comprimento. Considere isso nos trechos.
- Se não houver trama cadastrada que sirva, use trechos sem trama com o comprimento estimado por fio informado pela artesã e avise que o consumo fica mais preciso cadastrando a trama na Biblioteca.

COMO RESPONDER O RESULTADO (curto, com quebras de linha)
- O que foi calculado (ganchos e espaçamento, quando houver).
- Fio ou corda: total exato e a lista de corte.
- Na proposta: metros e ganchos arredondados (campo "na_proposta").
- Preço: método, valor, custo total e lucro numa linha.
- Avisos do sistema, um por linha, só se existirem.`;

const FERRAMENTAS = [
  {
    name: 'pedir_informacoes',
    description: 'Mostra um formulário dentro do chat com todas as perguntas de uma vez. A artesã preenche e envia numa resposta só.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        introducao: { type: 'string', description: 'Uma frase curta explicando para que servem as respostas.' },
        campos: {
          type: 'array', maxItems: 14,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'identificador curto, sem espaços (ex.: largura_cm)' },
              rotulo: { type: 'string' },
              tipo: { type: 'string', enum: ['texto', 'numero', 'opcoes', 'texto_longo'] },
              opcoes: { type: 'array', items: { type: 'string' } },
              unidade: { type: 'string', description: 'ex.: cm, m, h, R$' },
              ajuda: { type: 'string', description: 'explicação curta do campo, com exemplo' },
              obrigatorio: { type: 'boolean' }
            },
            required: ['id', 'rotulo', 'tipo']
          }
        }
      },
      required: ['titulo', 'campos']
    }
  },
  {
    name: 'calcular',
    description: 'Roda a calculadora do sistema. Devolve material, lista de corte, ganchos, área, custo e preço. Sempre use para números de projeto.',
    input_schema: {
      type: 'object',
      properties: {
        componentes: {
          type: 'array',
          description: 'Partes da peça. aplicar_em = índice (0, 1...) de uma parte do tipo trama, para somar em cada fio dela.',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', enum: ['vao', 'trama', 'trecho_sem_trama', 'no', 'acessorio'] },
              descricao: { type: 'string' },
              material_id: { type: 'string' },
              trama_id: { type: 'string' },
              no_id: { type: 'string' },
              parametros: {
                type: 'object',
                description: 'vao: largura_cm, altura_cm, telas, esp_min, esp_max, margem_cm, gancho_material_id, ganchos_fornecidos (artesa|cliente), colocacao (artesa|marceneiro). trama: largura_cm, comprimento_cm, pecas. trecho_sem_trama: comprimento_cm e aplicar_em, ou comprimento_cm e fios. no: aplicar_em e nos_por_fio, ou quantidade. acessorio: quantidade.'
              }
            },
            required: ['tipo', 'parametros']
          }
        },
        preco: { type: 'object', description: 'Opcional. metodo (custo|m2), horas, valor_m2, deslocamento, embalagem, frete. O resto vem das Configurações.' }
      },
      required: ['componentes']
    }
  },
  {
    name: 'conta',
    description: 'Faz uma conta exata. Use para qualquer número fora da calculadora de projeto. Aceita + - * / ( ), ^, sqrt, ceil, floor, round, min, max, abs, pow, pi. Ponto como decimal.',
    input_schema: {
      type: 'object',
      properties: { expressao: { type: 'string' }, descricao: { type: 'string', description: 'o que a conta representa' } },
      required: ['expressao']
    }
  },
  {
    name: 'criar_projeto',
    description: 'Cria o projeto no sistema (status Em criação), com os componentes e o preço calculados. A artesã revisa e conclui depois.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        categoria_id: { type: 'string', description: 'id do tipo de peça' },
        cliente_id: { type: 'string', description: 'omita para portfólio' },
        descricao_livre: { type: 'string', description: 'resumo do que a artesã pediu, detalhes e cores' },
        componentes: { type: 'array', items: { type: 'object' } },
        preco: { type: 'object' }
      },
      required: ['nome', 'categoria_id', 'componentes']
    }
  }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405);
  if (!CHAVE) return resposta({ erro: 'A Nath ainda não foi configurada (falta a chave da Anthropic).' }, 500);

  // Quem está chamando
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: quem, error: erroUsuario } = await admin.auth.getUser(token);
  if (erroUsuario || !quem?.user) return resposta({ erro: 'Sessão expirada. Entre de novo.' }, 401);
  const uid = quem.user.id;

  // Limite do mês
  const { data: perfil } = await admin.from('perfis').select('ia_limite_mensal').eq('id', uid).maybeSingle();
  const limite = perfil?.ia_limite_mensal ?? 0;
  const mes = new Date().toISOString().slice(0, 7) + '-01';
  const { data: uso } = await admin.from('ia_uso').select('mensagens').eq('artesa_id', uid).eq('mes', mes).maybeSingle();
  const usadas = uso?.mensagens ?? 0;
  if (limite <= 0) return resposta({ erro: 'A Nath não está liberada para a sua conta.' }, 403);
  if (usadas >= limite) return resposta({ erro: `Você usou as ${limite} mensagens da Nath deste mês. O limite volta no dia 1º.` }, 429);

  // Pedido
  let corpo: { mensagens?: unknown[]; contexto?: string };
  try { corpo = await req.json(); } catch { return resposta({ erro: 'Pedido inválido.' }, 400); }
  const mensagens = Array.isArray(corpo.mensagens) ? corpo.mensagens.slice(-40) : [];
  if (!mensagens.length) return resposta({ erro: 'Sem mensagem.' }, 400);
  if (JSON.stringify(mensagens).length > 4_000_000) return resposta({ erro: 'A conversa ficou grande demais. Comece uma nova.' }, 413);
  const contexto = String(corpo.contexto || '').slice(0, 20000);

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': CHAVE, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 2500,
      system: [
        { type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'DADOS DO ATELIÊ (Biblioteca e Configurações):\n' + contexto }
      ],
      tools: FERRAMENTAS,
      messages: mensagens
    })
  });
  const dados = await r.json();
  if (!r.ok) {
    console.error('Anthropic', r.status, JSON.stringify(dados));
    return resposta({ erro: 'A Nath não respondeu agora. Tente de novo em instantes.' }, 502);
  }

  const entrada = (dados.usage?.input_tokens || 0) + (dados.usage?.cache_creation_input_tokens || 0) + (dados.usage?.cache_read_input_tokens || 0);
  const { data: total } = await admin.rpc('registrar_uso_ia', { p_artesa: uid, p_entrada: entrada, p_saida: dados.usage?.output_tokens || 0 });

  return resposta({ content: dados.content, stop_reason: dados.stop_reason, uso: { mensagens: total ?? usadas + 1, limite } });
});
