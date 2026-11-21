-- =====================================================================
-- 003 · v0.3: projeto em etapas, clientes para marketing,
--       configurações por tipo de peça, vendas e financeiro.
-- Rodar uma vez no SQL Editor, depois do 002.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TIPOS DE PEÇA (categorias ganham uma "família")
-- ---------------------------------------------------------------------
alter table public.categorias
  add column if not exists familia   text not null default 'livre',
  add column if not exists icone     text,
  add column if not exists descricao text;

alter table public.categorias drop constraint if exists categorias_familia_check;
alter table public.categorias add constraint categorias_familia_check
  check (familia in ('vao','bolsa','colar_mesa','colar','luminaria','painel','hang_plant','pingente_parede','livre'));

update public.categorias set familia = 'vao',        icone = '▦', descricao = 'Guarda-corpo, tela de proteção, rede' where artesa_id is null and nome = 'Guarda-corpo';
update public.categorias set familia = 'painel',     icone = '▤', descricao = 'Painel de parede ou divisória'        where artesa_id is null and nome = 'Painel';
update public.categorias set familia = 'hang_plant', icone = '⚲', descricao = 'Suporte suspenso para vaso'           where artesa_id is null and nome = 'Hang plant';
update public.categorias set familia = 'bolsa',      icone = '◫', descricao = 'Bolsa, necessaire, ecobag'            where artesa_id is null and nome = 'Bolsa';
update public.categorias set familia = 'colar',      icone = '◌', descricao = 'Colar de pescoço', nome = 'Colar de pescoço' where artesa_id is null and nome = 'Colar';
update public.categorias set familia = 'pingente_parede', icone = '⟟', descricao = 'Pingente para pendurar na parede', nome = 'Pingente de parede' where artesa_id is null and nome = 'Pingente';

insert into public.categorias (artesa_id, nome, modelo, ordem, familia, icone, descricao)
select null, v.nome, v.modelo, v.ordem, v.familia, v.icone, v.descricao
from (values
  ('Colar de mesa', 'catalogo', 3, 'colar_mesa', '▭', 'Trilho e colar de mesa'),
  ('Luminária',     'ambos',    6, 'luminaria',  '◔', 'Abajur e pendente')
) as v(nome, modelo, ordem, familia, icone, descricao)
where not exists (select 1 from public.categorias c where c.artesa_id is null and c.nome = v.nome);

-- Ordem dos 8 tipos da primeira versão
update public.categorias set ordem = 1 where artesa_id is null and familia = 'vao';
update public.categorias set ordem = 2 where artesa_id is null and familia = 'bolsa';
update public.categorias set ordem = 3 where artesa_id is null and familia = 'colar_mesa';
update public.categorias set ordem = 4 where artesa_id is null and familia = 'colar';
update public.categorias set ordem = 5 where artesa_id is null and familia = 'luminaria';
update public.categorias set ordem = 6 where artesa_id is null and familia = 'painel';
update public.categorias set ordem = 7 where artesa_id is null and familia = 'hang_plant';
update public.categorias set ordem = 8 where artesa_id is null and familia = 'pingente_parede';

-- Tipos fora da primeira versão ficam desligados (religue trocando ativo para true)
update public.categorias set ativo = false
 where artesa_id is null and nome in ('Cortina','Balanço','Cadeira','Pulseira','Porta-copos');

-- ---------------------------------------------------------------------
-- 2. PROJETOS: status novos e portfólio
-- ---------------------------------------------------------------------
alter table public.projetos drop constraint if exists projetos_status_check;
update public.projetos set status = 'em_criacao' where status = 'rascunho';
update public.projetos set status = 'pronto'     where status = 'calculado';
alter table public.projetos alter column status set default 'em_criacao';
alter table public.projetos add constraint projetos_status_check
  check (status in ('em_criacao','pronto','em_proposta','aprovado','em_producao','entregue','pausado','arquivado'));

alter table public.projetos
  add column if not exists para_portfolio boolean not null default false,
  add column if not exists etapa          integer not null default 1;

-- ---------------------------------------------------------------------
-- 3. CLIENTES: dados para marketing
-- ---------------------------------------------------------------------
alter table public.clientes
  add column if not exists cep              text,
  add column if not exists logradouro       text,
  add column if not exists numero           text,
  add column if not exists complemento      text,
  add column if not exists bairro           text,
  add column if not exists uf               text,
  add column if not exists aniversario      date,
  add column if not exists instagram        text,
  add column if not exists origem           text,
  add column if not exists aceita_novidades boolean not null default false,
  add column if not exists indicado_por_id  uuid references public.clientes(id);

update public.clientes set indicado_por_id = arquiteto_id where indicado_por_id is null and arquiteto_id is not null;

-- ---------------------------------------------------------------------
-- 4. CONFIGURAÇÕES (perfis)
-- ---------------------------------------------------------------------
alter table public.perfis
  add column if not exists taxas_pagamento    jsonb not null default '{"pix":0,"dinheiro":0,"debito":0,"credito":[0]}'::jsonb,
  add column if not exists sinal_pct          numeric(5,2) not null default 50,
  add column if not exists esp_min_padrao     numeric(6,2) not null default 9,
  add column if not exists esp_max_padrao     numeric(6,2) not null default 10,
  add column if not exists margem_vao_cm      numeric(6,2) not null default 2.5,
  add column if not exists custos_fixos_mes   numeric(12,2) not null default 0,
  add column if not exists prolabore_desejado numeric(12,2) not null default 0,
  add column if not exists horas_mes          numeric(8,2) not null default 0;

-- ---------------------------------------------------------------------
-- 5. FINANCEIRO
-- ---------------------------------------------------------------------
create table if not exists public.categorias_financeiras (
  id         uuid primary key default gen_random_uuid(),
  artesa_id  uuid references public.perfis(id) on delete cascade,
  nome       text not null,
  tipo       text not null default 'despesa' check (tipo in ('despesa','retirada')),
  ordem      integer default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.vendas (
  id             uuid primary key default gen_random_uuid(),
  artesa_id      uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  cliente_id     uuid references public.clientes(id),
  proposta_id    uuid unique references public.propostas(id) on delete set null,
  data           date not null default current_date,
  descricao      text,
  valor_total    numeric(12,2) not null default 0,
  status         text not null default 'aberta' check (status in ('aberta','quitada','cancelada')),
  observacoes    text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.venda_itens (
  id              uuid primary key default gen_random_uuid(),
  artesa_id       uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  venda_id        uuid not null references public.vendas(id) on delete cascade,
  projeto_id      uuid references public.projetos(id) on delete set null,
  descricao       text,
  quantidade      numeric(10,2) not null default 1,
  valor_unitario  numeric(12,2) not null default 0,
  criado_em       timestamptz not null default now()
);

create table if not exists public.recebimentos (
  id              uuid primary key default gen_random_uuid(),
  artesa_id       uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  venda_id        uuid not null references public.vendas(id) on delete cascade,
  numero          integer not null default 1,
  descricao       text,
  vencimento      date,
  valor           numeric(12,2) not null default 0,
  forma           text check (forma in ('pix','dinheiro','debito','credito','transferencia','outro')),
  parcelas_cartao integer,
  taxa_pct        numeric(6,2) not null default 0,
  valor_liquido   numeric(12,2),
  recebido_em     date,
  status          text not null default 'pendente' check (status in ('pendente','recebido')),
  criado_em       timestamptz not null default now()
);

create table if not exists public.despesas_fixas (
  id              uuid primary key default gen_random_uuid(),
  artesa_id       uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  descricao       text not null,
  categoria_id    uuid references public.categorias_financeiras(id),
  valor           numeric(12,2) not null default 0,
  dia_vencimento  integer not null default 10 check (dia_vencimento between 1 and 31),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

create table if not exists public.despesas (
  id                  uuid primary key default gen_random_uuid(),
  artesa_id           uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  descricao           text not null,
  categoria_id        uuid references public.categorias_financeiras(id),
  valor               numeric(12,2) not null default 0,
  vencimento          date not null default current_date,
  forma               text,
  pago_em             date,
  status              text not null default 'pendente' check (status in ('pendente','pago')),
  despesa_fixa_id     uuid references public.despesas_fixas(id) on delete set null,
  mes_ref             date,
  material_id         uuid references public.materiais(id),
  quantidade_material numeric(12,2),
  observacoes         text,
  criado_em           timestamptz not null default now(),
  unique (despesa_fixa_id, mes_ref)
);

drop trigger if exists vendas_atualizado on public.vendas;
create trigger vendas_atualizado before update on public.vendas
  for each row execute function public.tocar_atualizado_em();

-- Segurança
alter table public.categorias_financeiras enable row level security;
alter table public.vendas                 enable row level security;
alter table public.venda_itens            enable row level security;
alter table public.recebimentos           enable row level security;
alter table public.despesas_fixas         enable row level security;
alter table public.despesas               enable row level security;

drop policy if exists categorias_financeiras_ler on public.categorias_financeiras;
drop policy if exists categorias_financeiras_escrever on public.categorias_financeiras;
create policy categorias_financeiras_ler on public.categorias_financeiras for select to authenticated
  using (artesa_id is null or artesa_id = auth.uid() or public.eh_admin());
create policy categorias_financeiras_escrever on public.categorias_financeiras for all to authenticated
  using (artesa_id = auth.uid() or public.eh_admin())
  with check (artesa_id = auth.uid() or public.eh_admin());
alter table public.categorias_financeiras alter column artesa_id set default auth.uid();

do $$
declare t text;
begin
  foreach t in array array['vendas','venda_itens','recebimentos','despesas_fixas','despesas'] loop
    execute format('drop policy if exists %1$s_dona on public.%1$s', t);
    execute format('create policy %1$s_dona on public.%1$s for all to authenticated
                      using (artesa_id = auth.uid() or public.eh_admin())
                      with check (artesa_id = auth.uid() or public.eh_admin())', t);
  end loop;
end $$;

-- Categorias financeiras gerais (artesa_id vazio = valem para todas)
insert into public.categorias_financeiras (artesa_id, nome, tipo, ordem)
select null::uuid, v.nome, v.tipo, v.ordem
from (values
  ('Material',             'despesa',  1),
  ('Ferramentas',          'despesa',  2),
  ('Embalagem',            'despesa',  3),
  ('Frete',                'despesa',  4),
  ('Deslocamento',         'despesa',  5),
  ('Marketing',            'despesa',  6),
  ('Impostos (DAS do MEI)','despesa',  7),
  ('Custos fixos',         'despesa',  8),
  ('Outros',               'despesa',  9),
  ('Pró-labore',           'retirada', 10)
) as v(nome, tipo, ordem)
where not exists (select 1 from public.categorias_financeiras c where c.artesa_id is null and c.nome = v.nome);

-- Fim.
