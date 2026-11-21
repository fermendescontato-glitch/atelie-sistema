-- =====================================================================
-- 002 · Projetos, propostas e assistente
-- Rodar uma vez no SQL Editor, depois do 001.
-- =====================================================================

-- Propostas: deslocamento, texto do marceneiro e página de portfólio
alter table public.propostas
  add column if not exists deslocamento_valor  numeric(12,2) not null default 0,
  add column if not exists deslocamento_cidade text,
  add column if not exists ganchos_marceneiro  boolean not null default false,
  add column if not exists mostrar_portfolio   boolean not null default true;

-- Limite mensal do assistente por artesã (número de mensagens).
-- Você muda direto na tabela perfis. 0 = assistente desligado para ela.
alter table public.perfis
  add column if not exists ia_limite_mensal integer not null default 300;

-- A artesã não pode aumentar o próprio limite.
create or replace function public.proteger_limite_ia()
returns trigger language plpgsql as $$
begin
  if new.ia_limite_mensal is distinct from old.ia_limite_mensal
     and auth.uid() is not null and not public.eh_admin() then
    raise exception 'Somente o administrador altera o limite do assistente.';
  end if;
  return new;
end $$;

drop trigger if exists perfis_limite_ia on public.perfis;
create trigger perfis_limite_ia before update on public.perfis
  for each row execute function public.proteger_limite_ia();

-- Uso do assistente: quantas mensagens e tokens por mês.
-- Só a função do servidor grava aqui. A artesã apenas lê o dela.
create table if not exists public.ia_uso (
  artesa_id      uuid not null references public.perfis(id) on delete cascade,
  mes            date not null,
  mensagens      integer not null default 0,
  tokens_entrada bigint  not null default 0,
  tokens_saida   bigint  not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (artesa_id, mes)
);
alter table public.ia_uso enable row level security;
drop policy if exists ia_uso_ler on public.ia_uso;
create policy ia_uso_ler on public.ia_uso for select to authenticated
  using (artesa_id = auth.uid() or public.eh_admin());

-- Soma o uso (chamada pela função do servidor).
create or replace function public.registrar_uso_ia(p_artesa uuid, p_entrada bigint, p_saida bigint)
returns integer language plpgsql security definer set search_path = public as $$
declare total integer;
begin
  insert into public.ia_uso (artesa_id, mes, mensagens, tokens_entrada, tokens_saida)
  values (p_artesa, date_trunc('month', now())::date, 1, p_entrada, p_saida)
  on conflict (artesa_id, mes) do update
    set mensagens = ia_uso.mensagens + 1,
        tokens_entrada = ia_uso.tokens_entrada + excluded.tokens_entrada,
        tokens_saida = ia_uso.tokens_saida + excluded.tokens_saida,
        atualizado_em = now()
  returning mensagens into total;
  return total;
end $$;
revoke all on function public.registrar_uso_ia(uuid, bigint, bigint) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.registrar_uso_ia(uuid, bigint, bigint) to service_role;
  end if;
end $$;

-- Conversas com o assistente (para continuar depois).
create table if not exists public.ia_conversas (
  id             uuid primary key default gen_random_uuid(),
  artesa_id      uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  projeto_id     uuid references public.projetos(id) on delete set null,
  titulo         text,
  mensagens      jsonb not null default '[]'::jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
drop trigger if exists ia_conversas_atualizado on public.ia_conversas;
create trigger ia_conversas_atualizado before update on public.ia_conversas
  for each row execute function public.tocar_atualizado_em();
alter table public.ia_conversas enable row level security;
drop policy if exists ia_conversas_dona on public.ia_conversas;
create policy ia_conversas_dona on public.ia_conversas for all to authenticated
  using (artesa_id = auth.uid() or public.eh_admin())
  with check (artesa_id = auth.uid() or public.eh_admin());

-- Numeração da proposta: evita número repetido se uma for apagada.
create or replace function public.numerar_proposta()
returns trigger language plpgsql as $$
declare seq integer;
begin
  if new.numero is null then
    select coalesce(max(split_part(numero, '-', 2)::int), 0) + 1 into seq
      from public.propostas
     where artesa_id = new.artesa_id
       and numero like to_char(new.data_emissao, 'YYYY') || '-%';
    new.numero := to_char(new.data_emissao, 'YYYY') || '-' || lpad(seq::text, 3, '0');
  end if;
  return new;
end $$;

-- Fim.
