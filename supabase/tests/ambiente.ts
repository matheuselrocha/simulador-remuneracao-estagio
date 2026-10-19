/**
 * Conexões para os testes de banco. Dois modos:
 *
 * - Local (padrão): lê `supabase status -o env` do Supabase local (Docker).
 * - Remoto: se existir `supabase/.env.test` (fora do git), roda contra o
 *   projeto indicado nele. Use SÓ num projeto sem dados reais (ou antes de
 *   publicar, seguido de reset): os testes gravam, e a auditoria é imutável.
 *   SQL direto vai pela API de gerenciamento, com SUPABASE_ACCESS_TOKEN no ambiente.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const ARQUIVO_REMOTO = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.test");

function lerArquivoEnv(caminho: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/.exec(linha);
    if (m) env[m[1]!] = m[2]!;
  }
  return env;
}

function lerStatusLocal(): Record<string, string> {
  let saida: string;
  try {
    saida = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error(
      "Supabase local não está rodando. Execute `supabase start` (requer Docker), ou crie supabase/.env.test para rodar contra um projeto remoto (ver README).",
    );
  }
  const env: Record<string, string> = {};
  for (const linha of saida.split("\n")) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(linha.trim());
    if (m) env[m[1]!] = m[2]!;
  }
  return env;
}

export const REMOTO = existsSync(ARQUIVO_REMOTO);
const cfg = REMOTO ? lerArquivoEnv(ARQUIVO_REMOTO) : lerStatusLocal();

export const API_URL = (REMOTO ? cfg.SUPABASE_URL : cfg.API_URL)!;
export const ANON_KEY = (REMOTO ? cfg.SUPABASE_ANON_KEY : cfg.ANON_KEY)!;
const SERVICE_ROLE_KEY = (REMOTO ? cfg.SUPABASE_SERVICE_ROLE_KEY : cfg.SERVICE_ROLE_KEY)!;
const DB_URL = cfg.DB_URL;
const PROJECT_REF = cfg.SUPABASE_PROJECT_REF;

if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error("Configuração de teste incompleta: URL, anon key e service_role key são obrigatórias.");
}

const semSessao = { auth: { persistSession: false, autoRefreshToken: false } };

export function clienteAnon(): SupabaseClient {
  return createClient(API_URL, ANON_KEY, semSessao);
}

/** service_role: só para preparar o cenário (criar usuários). Nunca vai ao front. */
export function clienteServico(): SupabaseClient {
  return createClient(API_URL, SERVICE_ROLE_KEY, semSessao);
}

/** Execução de SQL como `postgres` (dono das tabelas), para introspecção e provas de imutabilidade. */
export interface ConexaoSql {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, any>[] }>;
  end(): Promise<void>;
}

function literal(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

export async function conexaoPostgres(): Promise<ConexaoSql> {
  if (!REMOTO) {
    const c = new pg.Client({ connectionString: DB_URL });
    await c.connect();
    return c;
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token || !PROJECT_REF) throw new Error("Modo remoto: defina SUPABASE_ACCESS_TOKEN no ambiente e SUPABASE_PROJECT_REF em supabase/.env.test.");
  return {
    async query(sql, params = []) {
      // $1..$n → literais (só usado pelos testes, com valores gerados por eles)
      let texto = sql;
      for (let i = params.length; i >= 1; i--) texto = texto.split(`$${i}`).join(literal(params[i - 1]));
      const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: texto }),
      });
      const corpo = await r.text();
      if (!r.ok) throw new Error(corpo);
      const dados = JSON.parse(corpo);
      return { rows: Array.isArray(dados) ? dados : [] };
    },
    async end() {},
  };
}

export interface UsuarioTeste {
  id: string;
  email: string;
  cliente: SupabaseClient;
}

/** Cria um usuário pelo Admin API (funciona com cadastro público desligado) e faz login. */
export async function criarUsuario(admin: boolean, db: ConexaoSql): Promise<UsuarioTeste> {
  const email = `teste-${randomUUID()}@sgest.test`;
  const senha = `Senha-de-teste-${randomUUID()}`;
  const { data, error } = await clienteServico().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  if (admin) await db.query("insert into public.admins (user_id) values ($1)", [id]);
  const cliente = clienteAnon();
  const login = await cliente.auth.signInWithPassword({ email, password: senha });
  if (login.error) throw login.error;
  return { id, email, cliente };
}

export async function removerUsuario(u: UsuarioTeste | undefined) {
  if (u) await clienteServico().auth.admin.deleteUser(u.id);
}

/** 1º dia de um mês num futuro distante e único, para não colidir entre execuções. */
export function vigenciaFuturaUnica(): string {
  const ano = 2050 + Math.floor(Math.random() * 40);
  const mes = 1 + Math.floor(Math.random() * 12);
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}
