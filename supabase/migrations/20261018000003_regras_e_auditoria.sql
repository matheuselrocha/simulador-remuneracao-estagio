-- Regras de negócio no banco + auditoria imutável gerada por trigger.
--
-- As regras valem para qualquer cliente (painel, API direta, SQL), exceto
-- durante o seed (`set sgest.seed = 'on'`), que precisa gravar a vigência
-- histórica de 01/01/2026.

create function public.hoje_brasilia()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create function public.em_seed()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('sgest.seed', true), '') = 'on' $$;

-- ───────────────────────── valores ─────────────────────────
-- • nova vigência: a partir do mês corrente (não reescreve o passado);
-- • valor já vigente: não se edita nem exclui;
-- • correção de digitação: só de vigência futura, para vigência futura.
create function public.tg_valores_regras()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  hoje date := public.hoje_brasilia();
begin
  if tg_op = 'DELETE' then
    if old.vigencia_inicio <= hoje and not public.em_seed() then
      raise exception 'Valor já vigente (desde %) não pode ser excluído.', to_char(old.vigencia_inicio, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.tipo = 'bolsa' and new.divisor is null then
    new.divisor := 30;
  end if;
  new.responsavel := btrim(new.responsavel);

  if tg_op = 'INSERT' then
    if new.vigencia_inicio < date_trunc('month', hoje)::date and not public.em_seed() then
      raise exception 'A vigência não pode começar antes do mês atual (%).', to_char(date_trunc('month', hoje), 'MM/YYYY')
        using errcode = 'P0001';
    end if;
    new.criado_em := now();
    new.atualizado_em := null;
  else
    if old.vigencia_inicio <= hoje and not public.em_seed() then
      raise exception 'Valor já vigente não pode ser editado. Cadastre um novo valor com nova data de vigência.'
        using errcode = 'P0001';
    end if;
    if new.vigencia_inicio <= hoje and not public.em_seed() then
      raise exception 'A correção só é permitida para uma vigência futura.' using errcode = 'P0001';
    end if;
    if new.tipo <> old.tipo then
      raise exception 'O tipo do valor não pode ser alterado.' using errcode = 'P0001';
    end if;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

create trigger valores_regras
  before insert or update or delete on public.valores
  for each row execute function public.tg_valores_regras();

-- ───────────────────────── anos_calendario ─────────────────────────
-- • ano novo nasce como rascunho;
-- • publicar é irreversível pelo painel (o simulador já pode ter usado);
-- • só rascunho pode ser excluído (e sem datas: FK restrict).
create function public.tg_anos_regras()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'publicado' then
      raise exception 'Ano % já publicado não pode ser excluído.', old.ano using errcode = 'P0001';
    end if;
    return old;
  end if;

  new.responsavel := btrim(new.responsavel);

  if tg_op = 'INSERT' then
    new.status := 'rascunho';
    new.publicado_em := null;
    new.criado_em := now();
    new.atualizado_em := null;
  else
    if new.ano <> old.ano then
      raise exception 'O ano não pode ser alterado.' using errcode = 'P0001';
    end if;
    if old.status = 'publicado' and new.status = 'rascunho' then
      raise exception 'Ano % já publicado não pode voltar a rascunho.', old.ano using errcode = 'P0001';
    end if;
    if old.status = 'rascunho' and new.status = 'publicado' then
      new.publicado_em := now();
    else
      new.publicado_em := old.publicado_em;
    end if;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

create trigger anos_regras
  before insert or update or delete on public.anos_calendario
  for each row execute function public.tg_anos_regras();

-- ───────────────────────── datas_nao_uteis ─────────────────────────
create function public.tg_datas_regras()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.responsavel := btrim(new.responsavel);
  new.descricao := btrim(new.descricao);
  new.fonte := nullif(btrim(new.fonte), '');
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.atualizado_em := null;
  else
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

create trigger datas_regras
  before insert or update on public.datas_nao_uteis
  for each row execute function public.tg_datas_regras();

-- ───────────────────────── auditoria ─────────────────────────
-- SECURITY DEFINER: grava na auditoria mesmo sem o usuário ter INSERT nela.
-- Em DELETE não existe NEW.responsavel: o nome vem de `sgest.responsavel`,
-- definido pela função excluir_registro(). Sem ele, a exclusão é rejeitada.
create function public.tg_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  anterior jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  novo jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  linha jsonb := coalesce(novo, anterior);
  resp text;
begin
  if tg_op = 'DELETE' then
    resp := nullif(btrim(coalesce(current_setting('sgest.responsavel', true), '')), '');
    if resp is null then
      raise exception 'Exclusão sem "Seu nome". Use a função excluir_registro(tabela, id, responsavel).'
        using errcode = '23502';
    end if;
  else
    resp := novo ->> 'responsavel';
  end if;

  insert into public.auditoria (tabela, operacao, registro, valor_anterior, valor_novo, responsavel, auth_uid)
  values (tg_table_name, tg_op, coalesce(linha ->> 'id', linha ->> 'ano'), anterior, novo, resp, auth.uid());

  return null;
end;
$$;
revoke all on function public.tg_auditar() from public, anon, authenticated;

create trigger valores_auditoria
  after insert or update or delete on public.valores
  for each row execute function public.tg_auditar();
create trigger anos_auditoria
  after insert or update or delete on public.anos_calendario
  for each row execute function public.tg_auditar();
create trigger datas_auditoria
  after insert or update or delete on public.datas_nao_uteis
  for each row execute function public.tg_auditar();

-- Imutabilidade: nem admin, nem service_role, nem o dono da tabela alteram o log.
create function public.tg_auditoria_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'O log de auditoria é imutável (% bloqueado).', tg_op using errcode = '42501';
end;
$$;

create trigger auditoria_sem_update_delete
  before update or delete on public.auditoria
  for each row execute function public.tg_auditoria_imutavel();
create trigger auditoria_sem_truncate
  before truncate on public.auditoria
  for each statement execute function public.tg_auditoria_imutavel();

-- ───────────────────────── exclusão com responsável ─────────────────────────
-- SECURITY INVOKER: a RLS de DELETE continua valendo (só admin).
create function public.excluir_registro(p_tabela text, p_id text, p_responsavel text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  coluna text;
  n integer;
begin
  if p_responsavel is null or length(btrim(p_responsavel)) < 2 then
    raise exception 'Informe "Seu nome" para excluir.' using errcode = '23502';
  end if;
  coluna := case p_tabela
    when 'valores' then 'id'
    when 'datas_nao_uteis' then 'id'
    when 'anos_calendario' then 'ano'
  end;
  if coluna is null then
    raise exception 'Tabela não permitida: %', p_tabela using errcode = '42501';
  end if;

  perform set_config('sgest.responsavel', btrim(p_responsavel), true);
  execute format('delete from public.%I where %I::text = $1', p_tabela, coluna) using p_id;
  get diagnostics n = row_count;
  perform set_config('sgest.responsavel', '', true);
  if n = 0 then
    raise exception 'Registro não encontrado ou sem permissão.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.excluir_registro(text, text, text) from public, anon;
grant execute on function public.excluir_registro(text, text, text) to authenticated;

revoke all on function public.hoje_brasilia() from public, anon;
revoke all on function public.em_seed() from public, anon;
grant execute on function public.hoje_brasilia(), public.em_seed() to authenticated;
