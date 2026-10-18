/**
 * Conexões para os testes de banco, a partir de `supabase status -o env`
 * (Supabase local). Nada aqui roda contra o projeto de produção.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

function lerStatus(): Record<string, string> {
  let saida: string;
  try {
    saida = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("Supabase local não está rodando. Execute `supabase start` (requer Docker) antes de `npm run test:db`.");
  }
  const env: Record<string, string> = {};
  for (const linha of saida.split("\n")) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(linha.trim());
    if (m) env[m[1]!] = m[2]!;
  }
  return env;
}

const status = lerStatus();
export const API_URL = status.API_URL!;
export const ANON_KEY = status.ANON_KEY!;
const SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY!;
const DB_URL = status.DB_URL!;

const semSessao = { auth: { persistSession: false, autoRefreshToken: false } };

export function clienteAnon(): SupabaseClient {
  return createClient(API_URL, ANON_KEY, semSessao);
}

/** service_role: só para preparar o cenário (criar usuários). Nunca vai ao front. */
export function clienteServico(): SupabaseClient {
  return createClient(API_URL, SERVICE_ROLE_KEY, semSessao);
}

/** Conexão direta como `postgres` (dono das tabelas), para introspecção e provas de imutabilidade. */
export async function conexaoPostgres(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

export interface UsuarioTeste {
  id: string;
  email: string;
  cliente: SupabaseClient;
}

/** Cria um usuário pelo Admin API (funciona com cadastro público desligado) e faz login. */
export async function criarUsuario(admin: boolean, db: pg.Client): Promise<UsuarioTeste> {
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
