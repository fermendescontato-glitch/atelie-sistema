# Modelo de dados · Fase 1

> Para revisão antes de gerar o SQL. Nenhuma tabela foi criada ainda.
> Versão 1 · 16/11/2026

---

## Como ler

- **`artesa_id`** liga o registro a uma artesã. Quando fica **vazio**, o registro é **geral** e aparece para todas. Os registros gerais são os que você cadastra direto no Supabase.
- **`ativo`** existe em todas as tabelas editáveis. Para tirar algo de uso, troque para `false` em vez de apagar.
- **Campos com ✏️** são os que você deve editar no dia a dia.
- **Campos com 🔒** são preenchidos pelo sistema. Não precisa mexer.

---

## Visão geral

| Grupo | Tabela | Para que serve | Quem edita |
|---|---|---|---|
| **Conta** | `perfis` | Dados e configurações de cada artesã | Artesã (tela de Configurações) e você |
| | `portfolio` | Fotos de projetos realizados, para a proposta | Artesã e você |
| **Biblioteca** | `categorias` | Tipos de peça (guarda-corpo, bolsa...) | **Você** (gerais) e artesã (próprias) |
| | `tipos_material` | Cordão náutico, barbante, argola de madeira... | **Você** |
| | `materiais` | Cada material com marca, espessura e preço | Artesã e você |
| | `nos` | Tipos de nó (festonê, quadrado...) | **Você** |
| | `consumo_nos` | Quanto cada nó gasta por material e espessura | **Você** (base) e artesã |
| | `tramas` | Zigzag, quadrado, trama X... e o consumo de cada uma | **Você** (base) e artesã |
| | `textos_padrao` | Textos da proposta (condições, avisos) | **Você** |
| **Projetos** | `clientes` | Clientes e arquitetos | Artesã |
| | `projetos` | Cada peça ou projeto, com versões | Artesã |
| | `projeto_componentes` | As partes da peça e o cálculo de cada uma | Sistema |
| | `precificacoes` | O preço de cada projeto | Sistema e artesã |
| **Comercial** | `propostas` | A proposta enviada ao cliente | Sistema e artesã |
| | `proposta_itens` | Itens e opções (A, B) da proposta | Sistema e artesã |

**Arquivos (Storage do Supabase)**

| Pasta | Conteúdo |
|---|---|
| `marca` | Logo e assinatura de cada artesã |
| `portfolio` | Fotos de projetos realizados |
| `referencias` | Fotos, desenhos e 3D dos projetos |
| `propostas` | PDFs gerados |

Cada artesã só acessa a própria subpasta.

---

## Conta

### `perfis`
Uma linha por artesã. Criada automaticamente quando você cria a usuária.

| Campo | Tipo | Exemplo |
|---|---|---|
| id 🔒 | id do login | |
| papel ✏️ | `artesa` ou `admin` | admin (você) |
| nome ✏️ | texto | Nathália Brisolla Altini |
| nome_marca ✏️ | texto | Nodana |
| telefone, email, instagram ✏️ | texto | |
| texto_apresentacao ✏️ | texto longo | "Olá, eu sou a Nathália..." |
| logo_url, assinatura_url ✏️ | arquivo | |
| cor_primaria, cor_secundaria, cor_fundo ✏️ | cor | #B5460A, #8B8110, #F5F1E9 |
| valor_hora ✏️ | R$ | |
| margem_padrao_pct ✏️ | % | |
| taxa_maquininha_pct ✏️ | % | |
| imposto_pct ✏️ | % | |
| sobra_por_fio_cm ✏️ | cm | 10 |
| ponta_cm ✏️ | cm | 20 |
| acabamento_gancho_m ✏️ | m | 1 |
| arredondar_para ✏️ | número | 10 (próxima dezena) |
| validade_proposta_dias ✏️ | dias | 7 |
| condicoes_pagamento ✏️ | texto | "50% no fechamento e o restante na conclusão" |
| formas_pagamento ✏️ | texto | "Transferência, pix e link de cobrança" |

### `portfolio`
| Campo | Exemplo |
|---|---|
| artesa_id | |
| foto_url ✏️ | |
| legenda ✏️ | Guarda-corpo em escada |
| ordem ✏️ | 1 |
| ativo ✏️ | true |

---

## Biblioteca

### `categorias`
| Campo | Exemplo |
|---|---|
| artesa_id | vazio = geral |
| nome ✏️ | Guarda-corpo |
| modelo ✏️ | `sob_medida`, `catalogo` ou `ambos` |
| ordem ✏️ | 1 |
| ativo ✏️ | true |

### `tipos_material`
| Campo | Exemplo |
|---|---|
| nome ✏️ | Cordão náutico |
| grupo ✏️ | `fio`, `acessorio` ou `fixacao` |
| ativo ✏️ | true |

### `materiais`
Cada especificação é uma linha com o seu preço.

| Campo | Exemplo 1 | Exemplo 2 |
|---|---|---|
| artesa_id | Nathalia | Nathalia |
| tipo_material_id ✏️ | Cordão náutico | Gancho inox |
| marca ✏️ | Marca X | Marca Y |
| espessura_mm ✏️ | 8 | |
| cor ✏️ | Areia | |
| unidade_compra ✏️ | `rolo` | `pacote` |
| preco_compra ✏️ | 250,00 | 30,00 |
| quantidade_por_compra ✏️ | 180 | 10 |
| unidade_consumo ✏️ | `metro` | `unidade` |
| custo_por_unidade 🔒 | 1,39 por metro | 3,00 por unidade |
| estoque_atual ✏️ | 215 (metros) | 40 |
| estoque_minimo ✏️ | 50 | 20 |
| ativo ✏️ | true | true |

**Insumo por kg:** `unidade_compra = kg`. Se souber a metragem, `quantidade_por_compra` = metros por kg e `unidade_consumo = metro`. Se não souber, `quantidade_por_compra = 1000` e `unidade_consumo = grama`.

### `nos`
| Campo | Exemplo |
|---|---|
| nome ✏️ | Festonê |
| descricao ✏️ | |
| ativo ✏️ | true |

### `consumo_nos`
| Campo | Exemplo |
|---|---|
| artesa_id | vazio = base geral |
| no_id ✏️ | Festonê |
| tipo_material_id ✏️ | Cordão náutico |
| espessura_mm ✏️ | 8 |
| consumo_cm ✏️ | 19 |
| ativo ✏️ | true |

### `tramas`
| Campo | Exemplo (geral) | Exemplo (sob medida) |
|---|---|---|
| artesa_id | vazio | vazio |
| nome ✏️ | Trama X | Zigzag |
| tipo ✏️ | `geral` | `vao_zigzag` |
| tipo_material_id ✏️ | Cordão náutico | Cordão náutico |
| espessura_mm ✏️ | 6 | 8 |
| largura_trama_cm ✏️ | 5 | |
| fios_por_trama ✏️ | 4 | |
| rendimento_metros ✏️ | 1 | |
| rendimento_cm ✏️ | 10 | |
| foto_url ✏️ | | |
| ativo ✏️ | true | true |

`tipo` define qual regra da calculadora é usada:
- `geral`: regra de fios (requisitos 5.1)
- `vao_zigzag`: ganchos com margem e 3 passagens (5.3 e 5.4)
- `vao_quadrado`: ganchos sem canto e nó em cada cruzamento (5.3 e 5.5)

### `textos_padrao`
| Campo | Exemplo |
|---|---|
| artesa_id | vazio = geral |
| chave ✏️ | `ganchos_marceneiro` |
| texto ✏️ | "Colocação será realizada pelo marceneiro, enviarei medidas e distância previamente calculada." |
| ativo ✏️ | true |

---

## Projetos

### `clientes`
| Campo | Exemplo |
|---|---|
| artesa_id | |
| nome | Juliana |
| telefone, email, cidade | |
| tipo | `cliente_final`, `arquiteto` ou `loja` |
| arquiteto_id | liga o cliente à arquiteta, quando houver |
| observacoes | |
| ativo | true |

### `projetos`
| Campo | Exemplo |
|---|---|
| artesa_id | |
| cliente_id | Juliana |
| categoria_id | Guarda-corpo |
| modelo | `sob_medida` ou `catalogo` |
| nome | Guarda-corpo zigzag Indaiatuba |
| descricao_livre | texto da artesã |
| referencias | fotos e desenhos |
| horas_trabalho | 12 |
| status | `rascunho`, `calculado`, `em_proposta`, `aprovado`, `pausado`, `arquivado` |
| versao 🔒 | 2 |
| projeto_origem_id 🔒 | versão anterior |
| resumo_calculo 🔒 | totais de material, ganchos, área |

### `projeto_componentes`
As partes que compõem a peça. Os parâmetros variam por tipo.

| Campo | Exemplo |
|---|---|
| projeto_id | |
| ordem | 1 |
| tipo | `trama`, `trecho_sem_trama`, `no`, `acessorio`, `vao` |
| material_id, trama_id, no_id | conforme o tipo |
| parametros | largura 30 cm, comprimento 50 cm |
| resultado 🔒 | 24 fios de 5,10 m = 122,4 m · custo R$ X |

### `precificacoes`
| Campo | Exemplo |
|---|---|
| projeto_id | |
| metodo | `custo` ou `m2` |
| custo_material 🔒 | |
| horas, valor_hora | 12 h × R$ 50 (ajustável) |
| custo_trabalho 🔒 | |
| deslocamento, embalagem, frete | 850,00 |
| taxa_pct, imposto_pct | vêm do perfil |
| area_m2, valor_m2 | 8,75 × 900 |
| margem_pct | |
| preco_sugerido 🔒 | |
| preco_final | editável |
| alerta_prejuizo 🔒 | true / false |

---

## Comercial

### `propostas`
| Campo | Exemplo |
|---|---|
| artesa_id, cliente_id | |
| numero 🔒 | 2026-014 |
| data_emissao | 19/10/2026 |
| validade_dias | 7 |
| status | `rascunho`, `enviada`, `aceita`, `recusada`, `expirada` |
| valor_unico | true = um valor para qualquer opção |
| valor_total | 8.725,00 |
| deslocamento_incluso | true |
| previsao_entrega | "a combinar" |
| pdf_url 🔒 | |

### `proposta_itens`
| Campo | Exemplo |
|---|---|
| proposta_id, projeto_id | |
| opcao | vazio, `A` ou `B` |
| descricao_cliente | "Vão de 250 × 350 cm (8,75 m²)" |
| material_cliente 🔒 | "Corda náutica 6 mm: 570 metros" (arredondado) |
| valor | |

---

## Fases seguintes (só para referência)

| Fase | Tabelas |
|---|---|
| 2 | `pedidos`, `pedido_itens`, `producoes`, `movimentos_estoque`, `produtos_catalogo` |
| 3 | `lancamentos_financeiros`, `contratos`, `ia_conversas` (para controlar o uso da IA) |

---

## Regras de segurança (resumo)

| Situação | Pode? |
|---|---|
| Artesã ver os próprios registros | Sim |
| Artesã ver os registros gerais da biblioteca | Sim |
| Artesã editar registros gerais | Não |
| Artesã ver dados de outra artesã | Não |
| Você, pelo painel do Supabase | Vê e edita tudo |

---

## Atualizações · v0.2 e v0.3 (SQL 002 e 003)

| Tabela | O que mudou |
|---|---|
| `categorias` | + `familia` (vao, bolsa, colar_mesa, colar, luminaria, painel, hang_plant, pingente_parede, livre), `icone`, `descricao` |
| `projetos` | status: em_criacao, pronto, em_proposta, aprovado, em_producao, entregue, pausado, arquivado. + `para_portfolio`, `etapa` |
| `clientes` | + `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `uf`, `aniversario`, `instagram`, `origem`, `aceita_novidades`, `indicado_por_id` |
| `perfis` | + `taxas_pagamento` (jsonb: pix, dinheiro, debito, credito[1x..Nx]), `sinal_pct`, `esp_min_padrao`, `esp_max_padrao`, `margem_vao_cm`, `custos_fixos_mes`, `prolabore_desejado`, `horas_mes`, `ia_limite_mensal` |
| `propostas` | + `deslocamento_valor`, `deslocamento_cidade`, `ganchos_marceneiro`, `mostrar_portfolio` |
| `ia_uso`, `ia_conversas` | uso mensal e conversas da Nath |
| `categorias_financeiras` | ✏️ geral ou da artesã. `tipo`: despesa ou retirada (pró-labore) |
| `vendas` | cliente, proposta (1 venda por proposta), data, valor_total, status aberta/quitada/cancelada |
| `venda_itens` | peças da venda (com ou sem projeto) |
| `recebimentos` | parcelas: vencimento, valor, forma, parcelas no cartão, taxa %, valor líquido, recebido_em |
| `despesas_fixas` | contas mensais (dia de vencimento). Geram uma despesa por mês |
| `despesas` | avulsas e fixas: categoria, valor, vencimento, pago_em, material comprado (soma no estoque) |
