/**
 * Testes de banco e segurança (seção 9). Rodam contra o Supabase local:
 *   supabase start && supabase db reset && npm run test:db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  clienteAnon,
  conexaoPostgres,
  criarUsuario,
  removerUsuario,
  vigenciaFuturaUnica,
  type UsuarioTeste,
} from "./ambiente.ts";

const TABELAS = ["valores", "anos_calendario", "datas_nao_uteis", "auditoria", "admins"] as const;
const ANO_RASCUNHO = 2099;
const RESP = "Teste automatizado";

let db: pg.Client;
let admin: UsuarioTeste;
let comum: UsuarioTeste;

/** Negado = erro do PostgREST ou nenhuma linha afetada/visível. */
function negado(r: { error: unknown; data: unknown }) {
  return r.error !== null || (Array.isArray(r.data) && r.data.length === 0);
}

async function limparRascunho() {
  const datas = await admin.cliente.from("datas_nao_uteis").select("id").eq("ano", ANO_RASCUNHO);
  for (const d of datas.data ?? []) {
    await admin.cliente.rpc("excluir_registro", { p_tabela: "datas_nao_uteis", p_id: String(d.id), p_responsavel: RESP });
  }
  await admin.cliente.rpc("excluir_registro", { p_tabela: "anos_calendario", p_id: String(ANO_RASCUNHO), p_responsavel: RESP });
}

beforeAll(async () => {
  db = await conexaoPostgres();
  admin = await criarUsuario(true, db);
  comum = await criarUsuario(false, db);
  await limparRascunho();
  const ano = await admin.cliente.from("anos_calendario").insert({ ano: ANO_RASCUNHO, responsavel: RESP });
  expect(ano.error).toBeNull();
  const data = await admin.cliente
    .from("datas_nao_uteis")
    .insert({ data: `${ANO_RASCUNHO}-03-02`, descricao: "Data de teste", tipo: "feriado", responsavel: RESP });
  expect(data.error).toBeNull();
});

afterAll(async () => {
  if (admin) await limparRascunho();
  await removerUsuario(admin);
  await removerUsuario(comum);
  await db?.end();
});

describe("anon (simulador público)", () => {
  const anon = clienteAnon();

  it.each(TABELAS)("não consegue INSERT/UPDATE/DELETE em %s", async (tabela) => {
    const ins = await anon.from(tabela).insert({ responsavel: "x" } as never).select();
    const upd = await anon.from(tabela).update({ responsavel: "x" } as never).neq("responsavel", "nunca").select();
    const del = await anon.from(tabela).delete().neq("responsavel", "nunca").select();
    expect(ins.error).not.toBeNull();
    expect(negado(upd)).toBe(true);
    expect(negado(del)).toBe(true);
  });

  it("não consegue chamar a função de exclusão", async () => {
    const r = await anon.rpc("excluir_registro", { p_tabela: "valores", p_id: "1", p_responsavel: "Invasor" });
    expect(r.error).not.toBeNull();
  });

  it("não lê ano em rascunho nem suas datas", async () => {
    expect((await anon.from("anos_calendario").select("*").eq("ano", ANO_RASCUNHO)).data).toEqual([]);
    expect((await anon.from("datas_nao_uteis").select("*").eq("ano", ANO_RASCUNHO)).data).toEqual([]);
  });

  it("não lê o log de auditoria nem a tabela de admins", async () => {
    expect(negado(await anon.from("auditoria").select("*"))).toBe(true);
    expect(negado(await anon.from("admins").select("*"))).toBe(true);
  });

  it("lê os parâmetros publicados (seed da planilha)", async () => {
    const valores = await anon.from("valores").select("tipo, valor_centavos, divisor, vigencia_inicio").lte("vigencia_inicio", "2026-01-01");
    expect(valores.data).toEqual(
      expect.arrayContaining([
        { tipo: "bolsa", valor_centavos: 163953, divisor: 30, vigencia_inicio: "2026-01-01" },
        { tipo: "at", valor_centavos: 1350, divisor: null, vigencia_inicio: "2026-01-01" },
      ]),
    );
    const anos = await anon.from("anos_calendario").select("ano, status");
    expect(anos.data).toContainEqual({ ano: 2026, status: "publicado" });
    const datas = await anon.from("datas_nao_uteis").select("data").eq("ano", 2026);
    expect(datas.data).toHaveLength(21);
  });
});

describe("Auth", () => {
  it("signUp com e-mail novo falha (cadastro público desativado)", async () => {
    const r = await clienteAnon().auth.signUp({ email: `novo-${Date.now()}@sgest.test`, password: "uma-senha-bem-longa-123" });
    expect(r.error).not.toBeNull();
    expect(r.data.user).toBeNull();
  });
});

describe("usuário autenticado que NÃO é o do SGEST", () => {
  it("não insere valores nem datas", async () => {
    const v = await comum.cliente
      .from("valores")
      .insert({ tipo: "at", valor_centavos: 1, vigencia_inicio: vigenciaFuturaUnica(), responsavel: "Intruso" });
    expect(v.error?.code).toBe("42501");
    const d = await comum.cliente
      .from("datas_nao_uteis")
      .insert({ data: "2026-12-30", descricao: "Falso", tipo: "feriado", responsavel: "Intruso" });
    expect(d.error?.code).toBe("42501");
  });

  it("não altera nem exclui", async () => {
    const upd = await comum.cliente.from("datas_nao_uteis").update({ descricao: "Alterado", responsavel: "Intruso" }).eq("data", "2026-09-07").select();
    expect(negado(upd)).toBe(true);
    const pub = await comum.cliente.from("anos_calendario").update({ status: "publicado", responsavel: "Intruso" }).eq("ano", ANO_RASCUNHO).select();
    expect(negado(pub)).toBe(true);
    const del = await comum.cliente.rpc("excluir_registro", { p_tabela: "datas_nao_uteis", p_id: "1", p_responsavel: "Intruso" });
    expect(del.error).not.toBeNull();
    const conferencia = await db.query("select descricao from public.datas_nao_uteis where data = '2026-09-07'");
    expect(conferencia.rows[0].descricao).toBe("Independência do Brasil");
  });

  it("não lê a auditoria nem anos em rascunho", async () => {
    expect((await comum.cliente.from("auditoria").select("id")).data).toEqual([]);
    expect((await comum.cliente.from("anos_calendario").select("ano").eq("ano", ANO_RASCUNHO)).data).toEqual([]);
  });
});

describe("admin do SGEST: constraints e regras", () => {
  it("escrita sem 'Seu nome' é rejeitada (NOT NULL)", async () => {
    const r = await admin.cliente.from("valores").insert({ tipo: "at", valor_centavos: 1400, vigencia_inicio: vigenciaFuturaUnica() });
    expect(r.error?.code).toBe("23502");
    const vazio = await admin.cliente
      .from("datas_nao_uteis")
      .insert({ data: `${ANO_RASCUNHO}-03-03`, descricao: "Teste", tipo: "feriado", responsavel: "   " });
    expect(vazio.error?.code).toBe("23514");
  });

  it("data duplicada no calendário é rejeitada (UNIQUE)", async () => {
    const r = await admin.cliente
      .from("datas_nao_uteis")
      .insert({ data: "2026-09-07", descricao: "Duplicada", tipo: "feriado", responsavel: RESP });
    expect(r.error?.code).toBe("23505");
  });

  it("vigência precisa começar no dia 1º", async () => {
    const r = await admin.cliente.from("valores").insert({ tipo: "at", valor_centavos: 1400, vigencia_inicio: "2091-05-15", responsavel: RESP });
    expect(r.error?.code).toBe("23514");
  });

  it("não cria vigência no passado nem edita/exclui valor já vigente", async () => {
    const passado = await admin.cliente.from("valores").insert({ tipo: "at", valor_centavos: 1400, vigencia_inicio: "2025-06-01", responsavel: RESP });
    expect(passado.error?.message).toMatch(/antes do mês atual/);
    const editar = await admin.cliente
      .from("valores")
      .update({ valor_centavos: 1, responsavel: RESP })
      .eq("tipo", "bolsa")
      .eq("vigencia_inicio", "2026-01-01");
    expect(editar.error?.message).toMatch(/já vigente/);
    const id = (await db.query("select id from public.valores where tipo='bolsa' and vigencia_inicio='2026-01-01'")).rows[0].id;
    const excluir = await admin.cliente.rpc("excluir_registro", { p_tabela: "valores", p_id: String(id), p_responsavel: RESP });
    expect(excluir.error?.message).toMatch(/já vigente/);
  });

  it("DELETE direto (sem 'Seu nome') é rejeitado; via excluir_registro funciona", async () => {
    const ins = await admin.cliente
      .from("datas_nao_uteis")
      .insert({ data: `${ANO_RASCUNHO}-04-01`, descricao: "Para excluir", tipo: "ponto_facultativo", responsavel: RESP })
      .select("id")
      .single();
    expect(ins.error).toBeNull();
    const direto = await admin.cliente.from("datas_nao_uteis").delete().eq("id", ins.data!.id);
    expect(direto.error?.code).toBe("23502");
    const rpc = await admin.cliente.rpc("excluir_registro", { p_tabela: "datas_nao_uteis", p_id: String(ins.data!.id), p_responsavel: RESP });
    expect(rpc.error).toBeNull();
  });

  it("fim de semana cadastrado como feriado é aceito", async () => {
    const r = await admin.cliente
      .from("datas_nao_uteis")
      .insert({ data: `${ANO_RASCUNHO}-03-07`, descricao: "Sábado", tipo: "feriado", responsavel: RESP }); // 07/03/2099 é sábado
    expect(r.error).toBeNull();
  });

  it("ano nasce rascunho; publicado não volta a rascunho nem é excluído", async () => {
    await db.query("begin");
    try {
      await db.query("insert into public.anos_calendario (ano, status, responsavel) values (2098, 'publicado', $1)", [RESP]);
      const criado = await db.query("select status from public.anos_calendario where ano = 2098");
      expect(criado.rows[0].status).toBe("rascunho");
      await db.query("update public.anos_calendario set status = 'publicado', responsavel = $1 where ano = 2098", [RESP]);
      const pub = await db.query("select publicado_em from public.anos_calendario where ano = 2098");
      expect(pub.rows[0].publicado_em).not.toBeNull();
      await expect(db.query("update public.anos_calendario set status = 'rascunho', responsavel = $1 where ano = 2098", [RESP])).rejects.toThrow(
        /não pode voltar a rascunho/,
      );
    } finally {
      await db.query("rollback");
    }
  });
});

describe("auditoria", () => {
  it("toda alteração gera registro com valor anterior, valor novo e responsável", async () => {
    const vigencia = vigenciaFuturaUnica();
    const ins = await admin.cliente
      .from("valores")
      .insert({ tipo: "bolsa", valor_centavos: 170000, vigencia_inicio: vigencia, responsavel: "Ana (SGEST)" })
      .select("id, divisor")
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data!.divisor).toBe(30);
    const id = String(ins.data!.id);

    const upd = await admin.cliente.from("valores").update({ valor_centavos: 171000, responsavel: "Bruno (SGEST)" }).eq("id", id);
    expect(upd.error).toBeNull();
    const del = await admin.cliente.rpc("excluir_registro", { p_tabela: "valores", p_id: id, p_responsavel: "Carla (SGEST)" });
    expect(del.error).toBeNull();

    const log = await admin.cliente
      .from("auditoria")
      .select("operacao, valor_anterior, valor_novo, responsavel, auth_uid")
      .eq("tabela", "valores")
      .eq("registro", id)
      .order("id");
    expect(log.error).toBeNull();
    expect(log.data!.map((l) => [l.operacao, l.responsavel])).toEqual([
      ["INSERT", "Ana (SGEST)"],
      ["UPDATE", "Bruno (SGEST)"],
      ["DELETE", "Carla (SGEST)"],
    ]);
    const [i, u, d] = log.data!;
    expect(i!.valor_anterior).toBeNull();
    expect(i!.valor_novo.valor_centavos).toBe(170000);
    expect(u!.valor_anterior.valor_centavos).toBe(170000);
    expect(u!.valor_novo.valor_centavos).toBe(171000);
    expect(d!.valor_anterior.valor_centavos).toBe(171000);
    expect(d!.valor_novo).toBeNull();
    expect(log.data!.every((l) => l.auth_uid === admin.id)).toBe(true);
  });

  it("calendário e anos também são auditados", async () => {
    const r = await admin.cliente.from("auditoria").select("tabela").in("tabela", ["anos_calendario", "datas_nao_uteis"]).limit(1);
    expect(r.data!.length).toBe(1);
  });

  it("UPDATE/DELETE no log é negado, inclusive para o admin", async () => {
    const upd = await admin.cliente.from("auditoria").update({ responsavel: "Adulterado" }).gt("id", 0).select();
    expect(negado(upd)).toBe(true);
    const del = await admin.cliente.from("auditoria").delete().gt("id", 0).select();
    expect(negado(del)).toBe(true);
    const ins = await admin.cliente.from("auditoria").insert({ tabela: "x", operacao: "INSERT", registro: "1", responsavel: "Falso" });
    expect(ins.error).not.toBeNull();
  });

  it("nem o dono das tabelas (postgres) altera ou apaga o log", async () => {
    await expect(db.query("update public.auditoria set responsavel = 'x'")).rejects.toThrow(/imutável/);
    await expect(db.query("delete from public.auditoria")).rejects.toThrow(/imutável/);
    await expect(db.query("truncate public.auditoria")).rejects.toThrow(/imutável/);
  });
});

describe("minimização de dados: revisão do schema", () => {
  it("public contém exatamente as tabelas e colunas previstas", async () => {
    const r = await db.query(`
      select c.table_name, string_agg(c.column_name, ',' order by c.ordinal_position) as colunas
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public'
      group by c.table_name, t.table_type
      order by c.table_name`);
    expect(Object.fromEntries(r.rows.map((l) => [l.table_name, l.colunas]))).toEqual({
      admins: "user_id",
      anos_calendario: "ano,status,publicado_em,responsavel,criado_em,atualizado_em",
      auditoria: "id,ocorrido_em,tabela,operacao,registro,valor_anterior,valor_novo,responsavel,auth_uid",
      datas_nao_uteis: "id,data,ano,descricao,tipo,fonte,responsavel,criado_em,atualizado_em",
      valores: "id,tipo,valor_centavos,divisor,vigencia_inicio,responsavel,criado_em,atualizado_em",
    });
  });

  it("todas as tabelas de public têm RLS ativa", async () => {
    const r = await db.query(`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`);
    expect(r.rows.length).toBe(5);
    expect(r.rows.filter((l) => !l.relrowsecurity)).toEqual([]);
  });
});
