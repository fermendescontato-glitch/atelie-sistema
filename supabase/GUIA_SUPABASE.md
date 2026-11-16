# Guia do Supabase · Fase 1

Passo a passo para preparar o banco. Leva uns 10 minutos.

---

## 1. Rodar o SQL

1. Abra o projeto da Nodana no Supabase.
2. Menu lateral: **SQL Editor** > **New query**.
3. Cole todo o conteúdo de `001_fase1.sql`.
4. Clique em **Run**. Deve aparecer "Success. No rows returned".

> Rode só uma vez. Se aparecer erro dizendo que algo "already exists", o arquivo já foi rodado antes. Me mande o erro antes de tentar de novo.

---

## 2. Fechar o cadastro aberto

Assim, só entra quem você criar.

1. **Authentication** > **Sign In / Providers** (ou **Providers**) > **Email**.
2. Desligue **Allow new users to sign up**.
3. Salve.

---

## 3. Criar as usuárias

1. **Authentication** > **Users** > **Add user** > **Create new user**.
2. Preencha o e-mail e a senha.
3. Marque **Auto Confirm User**.
4. Crie primeiro **a sua usuária** e depois a da Nathalia.

O perfil de cada uma é criado sozinho na tabela `perfis`.

---

## 4. Tornar você o admin

No **SQL Editor**, rode trocando pelo seu e-mail:

```sql
update public.perfis set papel = 'admin' where email = 'SEU-EMAIL-AQUI';
```

Como admin, você enxerga tudo também pelo sistema, e não só pelo painel.

---

## 5. Preencher os dados da Nathalia

**Table Editor** > tabela **`perfis`** > linha da Nathalia. Preencha:

| Campo | O que colocar |
|---|---|
| nome | Nathália Brisolla Altini |
| nome_marca | Nodana |
| telefone, instagram | |
| valor_hora | Valor da hora dela |
| margem_padrao_pct | Margem desejada (%) |
| taxa_maquininha_pct | Taxa média da maquininha (%) |
| imposto_pct | Imposto (%), se houver |

Os outros campos já vêm com os padrões que usamos: sobra de 10 cm por fio, 20 cm por ponta, 1 m de acabamento por gancho, arredondamento para a próxima dezena e validade de 7 dias.

---

## Como editar no dia a dia

Tudo pelo **Table Editor**, clicando na tabela e depois na linha.

| Quero... | Tabela | Dica |
|---|---|---|
| Nova categoria de peça para todas | `categorias` | Deixe `artesa_id` **vazio** |
| Novo tipo de material | `tipos_material` | Grupo: `fio`, `acessorio` ou `fixacao` |
| Novo nó | `nos` | Depois cadastre o consumo em `consumo_nos` |
| Consumo de um nó | `consumo_nos` | Nó + material + espessura + cm por nó |
| Nova trama | `tramas` | Para peças: `tipo = geral` com largura, fios e rendimento |
| Material com preço para a Nathalia | `materiais` | Preencha `artesa_id` com o id dela |
| Texto padrão da proposta | `textos_padrao` | `artesa_id` vazio vale para todas |

**Regras de ouro**

- **`artesa_id` vazio = geral** (todas veem). Preenchido = só daquela artesã.
- **Para tirar algo de uso, troque `ativo` para `false`.** Não apague, para não quebrar projetos antigos.
- **`custo_por_unidade`** em `materiais` é calculado sozinho (preço ÷ quantidade). Não precisa preencher.
- **Onde achar o id da Nathalia:** tabela `perfis`, coluna `id` da linha dela.

**Exemplo de material**

| Campo | Valor |
|---|---|
| tipo_material_id | Cordão náutico |
| marca | Marca X |
| espessura_mm | 8 |
| cor | Areia |
| unidade_compra | rolo |
| preco_compra | 250 |
| quantidade_por_compra | 180 |
| unidade_consumo | metro |

Resultado: custo de R$ 1,39 por metro.

**Exemplo de trama geral**

| Campo | Valor |
|---|---|
| nome | Trama X |
| tipo | geral |
| tipo_material_id | Cordão náutico |
| espessura_mm | 6 |
| largura_trama_cm | 5 |
| fios_por_trama | 4 |
| rendimento_metros | 1 |
| rendimento_cm | 10 |

Leitura: cada trama tem 5 cm de largura e 4 fios, e 1 m de fio faz 10 cm de trama.
