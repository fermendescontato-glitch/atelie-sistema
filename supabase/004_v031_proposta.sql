-- =====================================================================
-- 004 · v0.3.1: proposta no modelo da Nodana (canvas)
-- Rodar uma vez no SQL Editor, depois do 003.
-- =====================================================================

-- Imagens e textos da proposta, por artesã (preenchidos em Configurações)
alter table public.perfis
  add column if not exists capa_url               text,
  add column if not exists foto_apresentacao_url  text,
  add column if not exists foto_projetos_url      text,
  add column if not exists apresentacao_titulo    text,
  add column if not exists apresentacao_subtitulo text;

-- Linha "Projeto:" do orçamento
alter table public.propostas
  add column if not exists resumo_projeto text;

-- Fim.
