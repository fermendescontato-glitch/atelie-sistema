# Sistema de apoio a macrameiras · Requisitos da V1

> Documento de referência do projeto. Toda decisão tomada entra aqui.
> Versão 1 · 16/11/2026 · Fernando + Claude, com base no uso real da Nathalia (Nodana)

---

## 1. Visão geral

**O que é:** um sistema por assinatura que ajuda artesãs de macramê a gerir o negócio inteiro, da ideia da peça até o dinheiro no caixa.

**O problema:** artesãs não são administradoras. Hoje elas calculam material, precificam, montam propostas e controlam o dinheiro de forma manual e intuitiva.

**As 4 dores principais:** calcular, precificar, montar a proposta e controlar o dinheiro.

**Para quem:** artesãs de macramê, da iniciante ao ateliê. Qualquer peça possível: guarda-corpo, painel, cortina, hang plant, bolsa, colar, pulseira, porta-copos, pingente, cadeira, balanço etc.

**Modelo comercial:** mensalidade entre R$ 59,90 e R$ 89,90. Ainda sem nome.

**MVP:** só a Nathalia (Nodana) e, no máximo, mais uma artesã.

---

## 2. Princípios do sistema

1. **Dois modelos de negócio desde a V1.** Sob medida (guarda-corpo, painel) e catálogo (hang plant, bolsa, colar).
2. **Toda peça nova nasce como projeto.** Na primeira vez, até uma peça de catálogo é um projeto. Depois de validada, vira produto cadastrado e padronizado.
3. **Duas camadas de informação.**
   - **Interna (para a artesã):** números exatos, lista de corte, passagens, espaçamentos.
   - **Comercial (para o cliente):** enxuta, material arredondado para cima, sem o "como fazer".
4. **A IA não calcula.** A calculadora é sempre determinística. A IA só interpreta descrições livres e organiza os dados para a calculadora.
5. **Múltipla escolha primeiro.** Texto livre só quando as opções não atendem.
6. **Tudo o que é informação fica em tabela.** O Fernando edita direto no Supabase, sem passar pelo código. Só a lógica fica no código.
7. **Desativar em vez de apagar.** Para não quebrar o histórico de projetos antigos.
8. **A artesã decide, o sistema alerta.** Desconto é livre. Venda com margem negativa gera alerta, mas não é bloqueada.
9. **IA restrita ao propósito do sistema.** Não pode ser usada para outros fins.

---

## 3. Tecnologia e operação

| Parte | Escolha |
|---|---|
| Sistema | HTML + JavaScript + CSS (poucos arquivos, sem build) |
| Hospedagem | GitHub Pages |
| Banco, login e arquivos | Supabase (projeto exclusivo da Nodana, separado da Avacy) |
| IA (fase 3) | API da Anthropic, chamada por uma Edge Function do Supabase (a chave nunca fica no HTML) |
| Plataforma | Computador na V1. Celular em versão futura |

**Fluxo de trabalho**
- O Claude envia o SQL para rodar no Supabase e os arquivos para subir no GitHub.
- O Fernando cria as usuárias no Supabase (Authentication, Add user) com e-mail e senha.
- O sistema não tem cadastro aberto. Só entra quem o Fernando criar.
- Cada artesã vê apenas os próprios dados (regras de segurança do banco).

**Segurança:** antes de abrir para artesãs pagantes, fazer uma revisão de segurança com um desenvolvedor externo (LGPD, dados de clientes).

---

## 4. Telas e fases

| Fase | Telas |
|---|---|
| **1** | Login, Início, Configurações, Biblioteca, Criação, Precificação, Proposta, Clientes (básico) |
| **2** | Pedidos, Produção, Estoque, Catálogo |
| **3** | Financeiro, Contrato, Assistente com IA |

### 4.1 Início
Três botões: **Novo projeto sob medida**, **Nova peça de catálogo**, **Nova venda**.
Resumo: propostas em aberto, pedidos em produção, a receber no mês, insumos acabando.
*(Pode mudar depois.)*

### 4.2 Configurações (por artesã)
- Marca: nome, logo, cores, texto de apresentação, fotos de projetos realizados
- Valor da hora de trabalho
- Taxa da maquininha (%) e imposto (%)
- Sobra padrão por fio (padrão 10 cm)
- Condições de pagamento (padrão: 50% no fechamento e 50% na conclusão)
- Validade da proposta (padrão: 7 dias)
- Regra de arredondamento do material na proposta (padrão: próxima dezena)

### 4.3 Biblioteca
- **Materiais:** tipo, marca, espessura, cor, unidade de compra (metro, rolo, kg, unidade, pacote), quantidade por unidade, preço. O sistema calcula o custo por metro (ou por grama, ou por unidade).
  - Cada especificação é um item com o seu preço (ex.: náutico 6 mm e náutico 8 mm da mesma marca são dois itens).
  - Insumo por kg: se a artesã souber quantos metros vêm em 1 kg, informa. Se não souber, o consumo passa a ser em gramas.
- **Tramas:** consumo por material e espessura (ver regra 5.1).
- **Nós:** tipos padronizados. O consumo varia por material e espessura (ex.: festonê com náutico 8 mm = 19 cm por nó).
- **Categorias:** gerais (cadastradas pelo Fernando) e próprias (criadas pela artesã). Sem a opção "outro".
- A Nathalia vai montar a base inicial de nós e tramas. Cada artesã pode editar ou adicionar os seus.

### 4.4 Criação (projeto)
1. Tipo (sob medida ou catálogo) e categoria
2. Partes da peça, somando componentes:
   - **Trama**
   - **Trecho sem trama**
   - **Nó** (por unidade)
   - **Acessório** (argola, alça de madeira, pingente, gancho)
   - **Vão com ganchos** (só sob medida)
3. Descrição livre, com foto ou referência, para o que não couber nas opções
4. Resultado: lista de corte (quantos fios e de que tamanho), total por material, ganchos e desenho quando houver. Números exatos.
5. Horas de trabalho

**Versões:** um projeto pode ter várias versões (medidas mudam depois da obra, projetos pausados).

### 4.5 Precificação
| Bloco | Origem |
|---|---|
| Material | Metros usados × custo por metro (da Biblioteca) |
| Trabalho | Horas × valor da hora (das Configurações, ajustável por peça) |
| Custos | Taxa da maquininha e imposto, em % (das Configurações) |
| Extras | Deslocamento, embalagem e frete (informados no pedido) |
| Preço final | Sugerido pelo sistema e editável |

- Sob medida também pode ser precificado **por m²** (área × valor do m²).
- **Alerta de prejuízo** quando o preço final fica abaixo do custo total.
- Custo da corda: cobra **só os metros usados**. A sobra do rolo vai para o estoque com custo proporcional.

### 4.6 Proposta
Modelo com a marca da artesã, preenchido automaticamente. Formato A4 em pé.

**Páginas:** capa, apresentação da artesã, projetos realizados, fotos de projetos, o projeto (imagem + destaques), orçamento, contracapa.

**Regras de conteúdo para o cliente**
- Nunca mostrar: passagem das cordas, espaçamento entre ganchos, quantidade exata.
- Material **arredondado para cima** (ex.: 44 ganchos viram 50; 156 m de corda viram 160 m).
- Pode ter opções (A e B), cada uma com o seu valor, ou um **valor único** para qualquer opção.
- Deslocamento pode aparecer separado ou incluso no total ("Deslocamento até X incluso").
- Ganchos colocados pelo marceneiro: texto "colocação será realizada pelo marceneiro, enviarei medidas e distância previamente calculada".
- Campos que podem ficar em aberto: nome, contato, cor ("a definir").

### 4.7 Documento para o marceneiro (ficha técnica)
Separado da proposta. Enviado só depois do fechamento.
Contém: vão, quantidade de ganchos, espaçamento, margem, desenho com cotas e tabela com a posição de cada furo medida da borda esquerda. Recalcula quando a medida muda.

### 4.8 Pedidos (fase 2)
- Um pedido pode misturar peças de catálogo e sob medida.
- Etapas: proposta enviada, aceita, em produção, pronta, entregue, paga.
- Controle de sinal (50%) e saldo.
- Qualquer venda, de qualquer canal, passa pelo sistema.

### 4.9 Produção e estoque (fase 2)
- Lista de corte e ficha técnica.
- Ao marcar como produzido: **baixa os insumos e soma as peças prontas**.
- Ao vender: baixa as peças prontas.
- Rolos abertos ficam no estoque com a metragem restante. A sobra só é reaproveitada se for suficiente para outra peça sem emenda.

### 4.10 Financeiro (fase 3)
Entradas, saídas, a receber e resultado do mês.

### 4.11 Contrato (fase 3)
Gerado a partir da proposta aceita. Aguardando o modelo do Fernando.

---

## 5. Regras de cálculo

### 5.1 Trama (peças em geral)
Campos da trama: material, espessura, **largura de uma trama**, **fios por trama**, **rendimento** (X m de fio fazem Y cm de trama).

1. **Tramas lado a lado** = largura da peça ÷ largura da trama, **sempre arredondado para cima**
2. **Fios** = tramas × fios por trama
3. **Tamanho de cada fio** = comprimento da trama ÷ Y cm × X m
4. Somar ao fio os trechos sem trama e as outras partes que ele faz
5. **Somar a sobra (padrão 10 cm) em cada fio, só no final**
6. **Total** = fios × tamanho final do fio

*Exemplo:* peça de 30 cm, trama de 5 cm com 4 fios, rendimento de 1 m para 10 cm, comprimento de 50 cm.
30 ÷ 5 = 6 tramas → 24 fios. 50 ÷ 10 × 1 m = 5 m. Com a sobra: 5,10 m. **24 fios de 5,10 m = 122,4 m.**

### 5.2 Nó e acessório
- **Nó:** quantidade × consumo por nó (por material e espessura).
- **Acessório:** quantidade × custo por unidade.

### 5.3 Vão com ganchos (sob medida)
**Espaçamento:** entre 9 e 10 cm, calculado separado em cada direção, o mais parecido possível.

| Regra | Quando | Conta |
|---|---|---|
| **Com margem nas pontas** | Trama zigzag | Primeiro e último gancho a 2,5 cm da borda. Intervalos = (medida − 5) ÷ espaçamento máximo, arredondado para cima. Ganchos = intervalos + 1 |
| **Sem ganchos nos cantos** | Trama quadrado | A borda conta como um quadrado. Espaços = medida ÷ espaçamento (inteiro que deixe entre 9 e 10 cm). Ganchos = espaços − 1 |

### 5.4 Trama zigzag (3 passagens)
- 1ª passagem: pula 1 gancho. Ida: desce reto e sobe na diagonal. Volta: sobe na diagonal e desce reto (cruza em X).
- 2ª passagem: pula 2 ganchos, só diagonais. 3ª passagem: pula 3 ganchos, só diagonais.
- Quando a passagem não termina no último gancho: passagem a mais para acertar os vértices (vai ao último, faz uma reta e volta).
- Diagonal = √(altura² + (pulo × espaçamento)²).
- Somar: 20 cm por ponta, 40 cm por emenda e 1 m de acabamento por gancho.

### 5.5 Trama quadrado
- Primeiro a corda horizontal: zigue-zague contínuo entre os ganchos das laterais.
- Depois a vertical: zigue-zague contínuo entre os ganchos de cima e de baixo, com **nó festonê em cada cruzamento**.
- **Horizontal** = ganchos da lateral × largura + (ganchos da lateral − 1) × espaçamento + 2 × 20 cm
- **Vertical** = ganchos de cima × altura + (ganchos de cima − 1) × espaçamento + 2 × 20 cm + cruzamentos × consumo do nó
- **Acabamento:** 4 m fixos.
- A horizontal e a vertical saem do mesmo rolo, mas são cortadas em dois pedaços (o sistema mostra cada um).

### 5.6 Área
- Retângulo: largura × altura
- Triângulo (lateral de escada): largura × altura ÷ 2
- Trapézio (lateral inclinada): largura × (altura maior + altura menor) ÷ 2
- Cilindro (túnel): π × diâmetro × comprimento
- Fundo de passarela em U: margem de +5% para o caimento

### 5.7 Rolos e emendas
- Rolo de corda 6 mm: até 180 m.
- Quando o total passa do rolo, calcular as emendas (40 cm cada) e quantos rolos comprar.
- Dica de operação: planejar a emenda num gancho, para o acabamento esconder o nó.

### 5.8 Deslocamento
Valor informado pela artesã por projeto. O sistema pode sugerir com base em distância, combustível e pedágio (versão futura).

---

## 6. Lembretes (retomar depois)

1. Base de consumo de nós e tramas por material e espessura (a Nathalia vai montar).
2. Como a Nathalia projeta cada tipo de peça (ela vai escrever). Bolsas e hang plants começam com descrição livre.
3. Hang plant: cada fio cortado é usado metade em uma alça e metade em outra.
4. Bolsa: fundo, início pela boca ou pelo fundo, contínua ou em partes, fechamento, alça junto ou separada.
5. Definir o que conta como perda.
6. Modelo de contrato (o Fernando vai enviar).
7. Fórmula do preço sugerido (validar, ver seção 7).
8. Nota fiscal e teto do MEI (versão futura).
9. Energia, internet e outros custos fixos (versão futura).
10. Versão para celular (versão futura).
11. Sugestão automática de deslocamento (versão futura).

---

## 7. Para validar

**Fórmula do preço sugerido.** Proposta:

```
custo total   = material + trabalho + extras
preço sugerido = custo total ÷ (1 − taxa da maquininha − imposto − margem desejada)
prejuízo      = preço final × (1 − taxa − imposto) < custo total
```

Assim a taxa e o imposto são calculados sobre o preço de venda, e não sobre o custo.
