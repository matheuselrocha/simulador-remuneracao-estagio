-- RLS e privilégios
--
-- anon (simulador): só SELECT, e só em valores e em anos PUBLICADOS.
-- authenticated: escrita apenas se auth.uid() estiver em public.admins —
-- não "qualquer autenticado". Continua seguro se o cadastro público for
-- reaberto por engano.

create function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
comment on function public.eh_admin() is 'true se o usuário logado é o login do SGEST.';

alter table public.admins enable row level security;
alter table public.valores enable row level security;
alter table public.anos_calendario enable row level security;
alter table public.datas_nao_uteis enable row level security;
alter table public.auditoria enable row level security;

-- Privilégios: começa do zero (o Supabase concede tudo por padrão) e libera o mínimo.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant select on public.valores, public.anos_calendario, public.datas_nao_uteis to anon;
grant select, insert, update, delete on public.valores, public.anos_calendario, public.datas_nao_uteis to authenticated;
grant select on public.auditoria, public.admins to authenticated;
-- anon também: as políticas de SELECT avaliam eh_admin() (devolve false para anon).
grant execute on function public.eh_admin() to anon, authenticated;

-- admins: cada usuário só vê a si mesmo (o painel usa isso para saber se é admin).
create policy admins_select_proprio on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- valores: leitura pública; escrita só admin.
create policy valores_select on public.valores
  for select to anon, authenticated
  using (true);
create policy valores_insert_admin on public.valores
  for insert to authenticated
  with check ((select public.eh_admin()));
create policy valores_update_admin on public.valores
  for update to authenticated
  using ((select public.eh_admin()))
  with check ((select public.eh_admin()));
create policy valores_delete_admin on public.valores
  for delete to authenticated
  using ((select public.eh_admin()));

-- anos_calendario: anon vê só publicados; admin vê tudo.
create policy anos_select_publicados on public.anos_calendario
  for select to anon, authenticated
  using (status = 'publicado' or (select public.eh_admin()));
create policy anos_insert_admin on public.anos_calendario
  for insert to authenticated
  with check ((select public.eh_admin()));
create policy anos_update_admin on public.anos_calendario
  for update to authenticated
  using ((select public.eh_admin()))
  with check ((select public.eh_admin()));
create policy anos_delete_admin on public.anos_calendario
  for delete to authenticated
  using ((select public.eh_admin()));

-- datas_nao_uteis: anon vê só datas de anos publicados.
create policy datas_select_publicadas on public.datas_nao_uteis
  for select to anon, authenticated
  using (
    (select public.eh_admin())
    or exists (
      select 1 from public.anos_calendario a
      where a.ano = datas_nao_uteis.ano and a.status = 'publicado'
    )
  );
create policy datas_insert_admin on public.datas_nao_uteis
  for insert to authenticated
  with check ((select public.eh_admin()));
create policy datas_update_admin on public.datas_nao_uteis
  for update to authenticated
  using ((select public.eh_admin()))
  with check ((select public.eh_admin()));
create policy datas_delete_admin on public.datas_nao_uteis
  for delete to authenticated
  using ((select public.eh_admin()));

-- auditoria: só o admin lê; ninguém escreve diretamente (o trigger é SECURITY DEFINER).
create policy auditoria_select_admin on public.auditoria
  for select to authenticated
  using ((select public.eh_admin()));
