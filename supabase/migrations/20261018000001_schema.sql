-- Simulador de Remuneração de Estágio (SGEST) — schema
--
-- Minimização de dados: o banco guarda APENAS parâmetros (valores com
-- vigência, calendário, status dos anos), a auditoria do painel e a lista de
-- admins. Nenhum dado de estagiário. Ver README, "Modelo de dados".

create type public.tipo_valor as enum ('bolsa', 'at');
create type public.status_ano as enum ('rascunho', 'publicado');
create type public.tipo_data as enum ('feriado', 'ponto_facultativo');

-- "Seu nome": obrigatório em toda gravação (login é compartilhado)
create domain public.nome_responsavel as text
  not null
  check (length(btrim(value)) between 2 and 120);

-- Login do SGEST com permissão de escrita (base das políticas RLS).
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
comment on table public.admins is 'Usuários do Supabase Auth com permissão de escrita (o login único do SGEST).';

-- Bolsa e auxílio-transporte com histórico de vigência.
create table public.valores (
  id bigint generated always as identity primary key,
  tipo public.tipo_valor not null,
  valor_centavos integer not null check (valor_centavos > 0),
  -- Divisor da bolsa diária (regra 4.1: 30). Só existe para a bolsa.
  divisor smallint,
  vigencia_inicio date not null,
  responsavel public.nome_responsavel not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  constraint valores_vigencia_dia_1 check (extract(day from vigencia_inicio) = 1),
  constraint valores_divisor check (
    (tipo = 'bolsa' and divisor = 30) or (tipo = 'at' and divisor is null)
  ),
  constraint valores_tipo_vigencia_unica unique (tipo, vigencia_inicio)
);
comment on table public.valores is 'Valor mensal da bolsa e diário do AT, em centavos, vigentes a partir do 1º dia de um mês.';

-- Anos do calendário: rascunho (invisível ao simulador) ou publicado.
create table public.anos_calendario (
  ano smallint primary key check (ano between 2000 and 2100),
  status public.status_ano not null default 'rascunho',
  publicado_em timestamptz,
  responsavel public.nome_responsavel not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  constraint anos_publicado_em check ((status = 'publicado') = (publicado_em is not null))
);

-- Feriados e pontos facultativos (o que não é dia útil além dos fins de semana).
create table public.datas_nao_uteis (
  id bigint generated always as identity primary key,
  data date not null,
  ano smallint generated always as (extract(year from data)::smallint) stored not null
    references public.anos_calendario (ano) on delete restrict,
  descricao text not null check (length(btrim(descricao)) between 2 and 200),
  tipo public.tipo_data not null,
  fonte text check (fonte is null or length(fonte) <= 300),
  responsavel public.nome_responsavel not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  constraint datas_nao_uteis_data_unica unique (data)
);
create index datas_nao_uteis_ano_idx on public.datas_nao_uteis (ano);

-- Log de auditoria: escrito só por trigger, imutável.
create table public.auditoria (
  id bigint generated always as identity primary key,
  ocorrido_em timestamptz not null default now(),
  tabela text not null,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  registro text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  responsavel text not null,
  auth_uid uuid
);
create index auditoria_ocorrido_em_idx on public.auditoria (ocorrido_em desc);
comment on table public.auditoria is 'Alterações do painel. Preenchida por trigger; sem UPDATE/DELETE para ninguém.';
