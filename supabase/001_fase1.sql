-- =====================================================================
-- Sistema de apoio a macrameiras · Fase 1
-- Arquivo: 001_fase1.sql · Versão 1 · 16/11/2026
--
-- Como usar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Rode uma única vez, num projeto sem estas tabelas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Funções de apoio
-- ---------------------------------------------------------------------

-- Atualiza a coluna atualizado_em sempre que uma linha muda
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;


-- ---------------------------------------------------------------------
-- 1. CONTA
-- ---------------------------------------------------------------------

create table public.perfis (
  id                      uuid primary key references auth.users(id) on delete cascade,
  papel                   text not null default 'artesa' check (papel in ('artesa','admin')),
  email                   text,
  nome                    text,
  nome_marca              text,
  telefone                text,
  instagram               text,
  texto_apresentacao      text,
  logo_url                text,
  assinatura_url          text,
  cor_primaria            text default '#B5460A',
  cor_secundaria          text default '#8B8110',
  cor_fundo               text default '#F5F1E9',
  valor_hora              numeric(10,2) default 0,
  margem_padrao_pct       numeric(5,2)  default 30,
  taxa_maquininha_pct     numeric(5,2)  default 0,
  imposto_pct             numeric(5,2)  default 0,
  sobra_por_fio_cm        numeric(6,2)  default 10,
  ponta_cm                numeric(6,2)  default 20,
  acabamento_gancho_m     numeric(6,2)  default 1,
  arredondar_para         integer       default 10,
  validade_proposta_dias  integer       default 7,
  condicoes_pagamento     text default 'Para confirmar o pedido, 50% do valor no ato de fechamento da proposta e o restante na conclusão do serviço.',
  formas_pagamento        text default 'Transferência bancária, pix e link de cobrança (consultar taxas).',
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now()
);

create trigger perfis_atualizado before update on public.perfis
  for each row execute function public.tocar_atualizado_em();

-- Cria o perfil automaticamente quando você cria uma usuária no Authentication
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Diz se quem está logado é admin
create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin');
$$;

-- Impede a artesã de se promover a admin pela tela
create or replace function public.proteger_papel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.papel is distinct from old.papel and auth.uid() is not null and not public.eh_admin() then
    raise exception 'Somente o admin pode alterar o papel.';
  end if;
  return new;
end $$;

create trigger perfis_proteger_papel before update on public.perfis
  for each row execute function public.proteger_papel();


create table public.portfolio (
  id            uuid primary key default gen_random_uuid(),
  artesa_id     uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  foto_url      text not null,
  legenda       text,
  ordem         integer default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. BIBLIOTECA
--    artesa_id vazio (null) = registro geral, visível para todas.
-- ---------------------------------------------------------------------

create table public.categorias (
  id            uuid primary key default gen_random_uuid(),
  artesa_id     uuid references public.perfis(id) on delete cascade,
  nome          text not null,
  modelo        text not null default 'ambos' check (modelo in ('sob_medida','catalogo','ambos')),
  ordem         integer default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table public.tipos_material (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  grupo         text not null default 'fio' check (grupo in ('fio','acessorio','fixacao')),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table public.materiais (
  id                     uuid primary key default gen_random_uuid(),
  artesa_id              uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  tipo_material_id       uuid not null references public.tipos_material(id),
  marca                  text,
  descricao              text,
  espessura_mm           numeric(5,2),
  cor                    text,
  unidade_compra         text not null default 'rolo' check (unidade_compra in ('metro','rolo','kg','unidade','pacote')),
  preco_compra           numeric(10,2) not null default 0,
  quantidade_por_compra  numeric(12,3) not null default 1,
  unidade_consumo        text not null default 'metro' check (unidade_consumo in ('metro','grama','unidade')),
  custo_por_unidade      numeric(12,4) generated always as (preco_compra / nullif(quantidade_por_compra,0)) stored,
  estoque_atual          numeric(12,3) default 0,
  estoque_minimo         numeric(12,3) default 0,
  ativo                  boolean not null default true,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

create trigger materiais_atualizado before update on public.materiais
  for each row execute function public.tocar_atualizado_em();

create table public.nos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  descricao     text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table public.consumo_nos (
  id                 uuid primary key default gen_random_uuid(),
  artesa_id          uuid references public.perfis(id) on delete cascade,
  no_id              uuid not null references public.nos(id),
  tipo_material_id   uuid not null references public.tipos_material(id),
  espessura_mm       numeric(5,2) not null,
  consumo_cm         numeric(8,2) not null,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now()
);

create table public.tramas (
  id                 uuid primary key default gen_random_uuid(),
  artesa_id          uuid references public.perfis(id) on delete cascade,
  nome               text not null,
  tipo               text not null default 'geral' check (tipo in ('geral','vao_zigzag','vao_quadrado')),
  tipo_material_id   uuid references public.tipos_material(id),
  espessura_mm       numeric(5,2),
  largura_trama_cm   numeric(8,2),
  fios_por_trama     integer,
  rendimento_metros  numeric(8,3),
  rendimento_cm      numeric(8,2),
  descricao          text,
  foto_url           text,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now()
);

create table public.textos_padrao (
  id            uuid primary key default gen_random_uuid(),
  artesa_id     uuid references public.perfis(id) on delete cascade,
  chave         text not null,
  texto         text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3. PROJETOS
-- ---------------------------------------------------------------------

create table public.clientes (
  id             uuid primary key default gen_random_uuid(),
  artesa_id      uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  nome           text not null,
  telefone       text,
  email          text,
  cidade         text,
  tipo           text not null default 'cliente_final' check (tipo in ('cliente_final','arquiteto','loja')),
  arquiteto_id   uuid references public.clientes(id),
  observacoes    text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create trigger clientes_atualizado before update on public.clientes
  for each row execute function public.tocar_atualizado_em();

create table public.projetos (
  id                  uuid primary key default gen_random_uuid(),
  artesa_id           uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  cliente_id          uuid references public.clientes(id),
  categoria_id        uuid references public.categorias(id),
  modelo              text not null default 'sob_medida' check (modelo in ('sob_medida','catalogo')),
  nome                text not null,
  descricao_livre     text,
  referencias         jsonb not null default '[]'::jsonb,
  horas_trabalho      numeric(8,2) default 0,
  status              text not null default 'rascunho'
                        check (status in ('rascunho','calculado','em_proposta','aprovado','pausado','arquivado')),
  versao              integer not null default 1,
  projeto_origem_id   uuid references public.projetos(id),
  resumo_calculo      jsonb not null default '{}'::jsonb,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create trigger projetos_atualizado before update on public.projetos
  for each row execute function public.tocar_atualizado_em();

create table public.projeto_componentes (
  id             uuid primary key default gen_random_uuid(),
  artesa_id      uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  projeto_id     uuid not null references public.projetos(id) on delete cascade,
  ordem          integer default 0,
  tipo           text not null check (tipo in ('trama','trecho_sem_trama','no','acessorio','vao')),
  descricao      text,
  material_id    uuid references public.materiais(id),
  trama_id       uuid references public.tramas(id),
  no_id          uuid references public.nos(id),
  parametros     jsonb not null default '{}'::jsonb,
  resultado      jsonb not null default '{}'::jsonb,
  criado_em      timestamptz not null default now()
);

create table public.precificacoes (
  id                uuid primary key default gen_random_uuid(),
  artesa_id         uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  projeto_id        uuid not null references public.projetos(id) on delete cascade,
  metodo            text not null default 'custo' check (metodo in ('custo','m2')),
  custo_material    numeric(12,2) default 0,
  horas             numeric(8,2)  default 0,
  valor_hora        numeric(10,2) default 0,
  custo_trabalho    numeric(12,2) default 0,
  deslocamento      numeric(12,2) default 0,
  embalagem         numeric(12,2) default 0,
  frete             numeric(12,2) default 0,
  taxa_pct          numeric(5,2)  default 0,
  imposto_pct       numeric(5,2)  default 0,
  margem_pct        numeric(5,2)  default 0,
  area_m2           numeric(10,4),
  valor_m2          numeric(12,2),
  preco_sugerido    numeric(12,2) default 0,
  preco_final       numeric(12,2) default 0,
  alerta_prejuizo   boolean not null default false,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create trigger precificacoes_atualizado before update on public.precificacoes
  for each row execute function public.tocar_atualizado_em();


-- ---------------------------------------------------------------------
-- 4. COMERCIAL
-- ---------------------------------------------------------------------

create table public.propostas (
  id                    uuid primary key default gen_random_uuid(),
  artesa_id             uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  cliente_id            uuid references public.clientes(id),
  numero                text,
  data_emissao          date not null default current_date,
  validade_dias         integer default 7,
  status                text not null default 'rascunho'
                          check (status in ('rascunho','enviada','aceita','recusada','expirada')),
  valor_unico           boolean not null default true,
  valor_total           numeric(12,2) default 0,
  deslocamento_incluso  boolean not null default false,
  previsao_entrega      text default 'a combinar',
  cor_material          text default 'a definir',
  observacoes           text,
  pdf_url               text,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create trigger propostas_atualizado before update on public.propostas
  for each row execute function public.tocar_atualizado_em();

-- Numeração automática por artesã: 2026-001, 2026-002...
create or replace function public.numerar_proposta()
returns trigger language plpgsql as $$
declare seq integer;
begin
  if new.numero is null then
    select count(*) + 1 into seq from public.propostas
      where artesa_id = new.artesa_id
        and extract(year from data_emissao) = extract(year from new.data_emissao);
    new.numero := to_char(new.data_emissao, 'YYYY') || '-' || lpad(seq::text, 3, '0');
  end if;
  return new;
end $$;

create trigger propostas_numero before insert on public.propostas
  for each row execute function public.numerar_proposta();

create table public.proposta_itens (
  id                 uuid primary key default gen_random_uuid(),
  artesa_id          uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  proposta_id        uuid not null references public.propostas(id) on delete cascade,
  projeto_id         uuid references public.projetos(id),
  opcao              text check (opcao in ('A','B','C')),
  ordem              integer default 0,
  descricao_cliente  text,
  material_cliente   text,
  valor              numeric(12,2) default 0,
  criado_em          timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 5. SEGURANÇA (Row Level Security)
--    Cada artesã vê só o que é dela + o que é geral.
--    Você, no painel do Supabase, continua vendo e editando tudo.
-- ---------------------------------------------------------------------

alter table public.perfis              enable row level security;
alter table public.portfolio           enable row level security;
alter table public.categorias          enable row level security;
alter table public.tipos_material      enable row level security;
alter table public.materiais           enable row level security;
alter table public.nos                 enable row level security;
alter table public.consumo_nos         enable row level security;
alter table public.tramas              enable row level security;
alter table public.textos_padrao       enable row level security;
alter table public.clientes            enable row level security;
alter table public.projetos            enable row level security;
alter table public.projeto_componentes enable row level security;
alter table public.precificacoes       enable row level security;
alter table public.propostas           enable row level security;
alter table public.proposta_itens      enable row level security;

-- Perfil: cada uma vê e edita o próprio
create policy perfis_ler    on public.perfis for select to authenticated using (id = auth.uid() or public.eh_admin());
create policy perfis_editar on public.perfis for update to authenticated using (id = auth.uid() or public.eh_admin())
                                                                    with check (id = auth.uid() or public.eh_admin());

-- Tabelas só gerais (você cadastra): todas leem, só admin escreve
create policy tipos_material_ler on public.tipos_material for select to authenticated using (true);
create policy tipos_material_admin on public.tipos_material for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy nos_ler on public.nos for select to authenticated using (true);
create policy nos_admin on public.nos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Tabelas mistas (geral + própria): lê as gerais e as suas; escreve só as suas
do $$
declare t text;
begin
  foreach t in array array['categorias','consumo_nos','tramas','textos_padrao'] loop
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated
                      using (artesa_id is null or artesa_id = auth.uid() or public.eh_admin())', t);
    execute format('create policy %1$s_inserir on public.%1$s for insert to authenticated
                      with check (artesa_id = auth.uid() or public.eh_admin())', t);
    execute format('create policy %1$s_editar on public.%1$s for update to authenticated
                      using (artesa_id = auth.uid() or public.eh_admin())
                      with check (artesa_id = auth.uid() or public.eh_admin())', t);
    execute format('create policy %1$s_apagar on public.%1$s for delete to authenticated
                      using (artesa_id = auth.uid() or public.eh_admin())', t);
  end loop;
end $$;

-- Tabelas próprias: tudo só da artesã
do $$
declare t text;
begin
  foreach t in array array['portfolio','materiais','clientes','projetos','projeto_componentes',
                           'precificacoes','propostas','proposta_itens'] loop
    execute format('create policy %1$s_dona on public.%1$s for all to authenticated
                      using (artesa_id = auth.uid() or public.eh_admin())
                      with check (artesa_id = auth.uid() or public.eh_admin())', t);
  end loop;
end $$;

-- Na tela, a artesã cria categorias, tramas e textos próprios já com o id dela
alter table public.categorias    alter column artesa_id set default auth.uid();
alter table public.consumo_nos   alter column artesa_id set default auth.uid();
alter table public.tramas        alter column artesa_id set default auth.uid();
alter table public.textos_padrao alter column artesa_id set default auth.uid();


-- ---------------------------------------------------------------------
-- 6. ARQUIVOS (Storage)
--    Cada artesã grava só na pasta com o id dela: <bucket>/<id>/arquivo
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('marca',       'marca',       true),
  ('portfolio',   'portfolio',   true),
  ('referencias', 'referencias', false),
  ('propostas',   'propostas',   false)
on conflict (id) do nothing;

create policy arquivos_ler on storage.objects for select to authenticated
  using (bucket_id in ('marca','portfolio','referencias','propostas')
         and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_admin()));

create policy arquivos_enviar on storage.objects for insert to authenticated
  with check (bucket_id in ('marca','portfolio','referencias','propostas')
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy arquivos_alterar on storage.objects for update to authenticated
  using (bucket_id in ('marca','portfolio','referencias','propostas')
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy arquivos_apagar on storage.objects for delete to authenticated
  using (bucket_id in ('marca','portfolio','referencias','propostas')
         and (storage.foldername(name))[1] = auth.uid()::text);


-- ---------------------------------------------------------------------
-- 7. DADOS INICIAIS (gerais) · edite à vontade depois no Table Editor
-- ---------------------------------------------------------------------

insert into public.categorias (artesa_id, nome, modelo, ordem) values
  (null, 'Guarda-corpo', 'sob_medida', 1),
  (null, 'Painel',       'ambos',      2),
  (null, 'Cortina',      'sob_medida', 3),
  (null, 'Balanço',      'ambos',      4),
  (null, 'Cadeira',      'ambos',      5),
  (null, 'Hang plant',   'catalogo',   6),
  (null, 'Bolsa',        'catalogo',   7),
  (null, 'Colar',        'catalogo',   8),
  (null, 'Pulseira',     'catalogo',   9),
  (null, 'Pingente',     'catalogo',  10),
  (null, 'Porta-copos',  'catalogo',  11);

insert into public.tipos_material (nome, grupo) values
  ('Cordão náutico',   'fio'),
  ('Barbante',         'fio'),
  ('Fio de algodão',   'fio'),
  ('Cordão encerado',  'fio'),
  ('Argola de madeira','acessorio'),
  ('Alça de madeira',  'acessorio'),
  ('Pingente',         'acessorio'),
  ('Miçanga',          'acessorio'),
  ('Gancho inox',      'fixacao');

insert into public.nos (nome) values
  ('Festonê'), ('Nó quadrado'), ('Nó espiral'), ('Cabeça de cotovia'), ('Nó de arremate');

insert into public.consumo_nos (artesa_id, no_id, tipo_material_id, espessura_mm, consumo_cm)
select null::uuid, n.id, t.id, 8, 19
from public.nos n, public.tipos_material t
where n.nome = 'Festonê' and t.nome = 'Cordão náutico';

insert into public.tramas (artesa_id, nome, tipo, tipo_material_id, espessura_mm, descricao)
select null::uuid, 'Zigzag', 'vao_zigzag', t.id, 8,
       'Diagonais cruzadas em 3 passagens entre ganchos de cima e de baixo, alinhados.'
from public.tipos_material t where t.nome = 'Cordão náutico'
union all
select null::uuid, 'Quadrado', 'vao_quadrado', t.id, 8,
       'Trama quadriculada com nó festonê em cada cruzamento. Sem ganchos nos cantos.'
from public.tipos_material t where t.nome = 'Cordão náutico';

insert into public.textos_padrao (artesa_id, chave, texto) values
  (null, 'ganchos_marceneiro',
         'Ganchos inox: colocação será realizada pelo marceneiro - enviarei medidas e distância previamente calculada.'),
  (null, 'deslocamento_incluso', 'Deslocamento até {cidade} incluso.'),
  (null, 'validade',             'Esse orçamento é válido por até {dias} dias a partir da data de emissão.'),
  (null, 'acabamento_ganchos',   'Acabamento em corda nos ganchos.');

-- Fim. Próximo passo: criar as usuárias e definir o admin (ver GUIA_SUPABASE.md).
