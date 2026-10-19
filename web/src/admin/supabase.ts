/**
 * Cliente Supabase do painel. Só a anon key: quem garante a segurança é a
 * RLS (escrita apenas para o usuário em `admins`).
 */
import { createClient, type PostgrestError } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && chave);

export const supabase = createClient(url ?? "http://configure-o-supabase.invalid", chave ?? "sem-chave", {
  auth: {
    // sessionStorage: fechar a aba encerra a sessão (o login é compartilhado)
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
  },
});

export interface LinhaValorDb {
  id: number;
  tipo: "bolsa" | "at";
  valor_centavos: number;
  divisor: number | null;
  vigencia_inicio: string;
  responsavel: string;
  criado_em: string;
  atualizado_em: string | null;
}

export interface LinhaAnoDb {
  ano: number;
  status: "rascunho" | "publicado";
  publicado_em: string | null;
  responsavel: string;
  criado_em: string;
}

export interface LinhaDataDb {
  id: number;
  data: string;
  ano: number;
  descricao: string;
  tipo: "feriado" | "ponto_facultativo";
  fonte: string | null;
  responsavel: string;
  criado_em: string;
  atualizado_em: string | null;
}

export interface LinhaAuditoriaDb {
  id: number;
  ocorrido_em: string;
  tabela: string;
  operacao: "INSERT" | "UPDATE" | "DELETE";
  registro: string;
  valor_anterior: Record<string, unknown> | null;
  valor_novo: Record<string, unknown> | null;
  responsavel: string;
}

/** Mensagem clara para erros do PostgREST/Postgres. */
export function mensagemDeErro(e: PostgrestError | Error | null | undefined): string {
  if (!e) return "Erro desconhecido.";
  const code = "code" in e ? e.code : undefined;
  switch (code) {
    case "23505":
      return "Esse registro já existe (data ou vigência duplicada).";
    case "23502":
      return "Preencha o campo \"Seu nome\" antes de gravar.";
    case "23514":
      return "Valor fora das regras (confira os campos).";
    case "23503":
      return "O ano dessa data ainda não foi criado no calendário.";
    case "42501":
      return "Sem permissão para esta operação. Entre novamente com o login do SGEST.";
    case "P0001":
    case "P0002":
      return e.message;
  }
  if (e.message?.includes("Failed to fetch")) return "Não foi possível falar com o servidor. Verifique a conexão.";
  return e.message || "Erro desconhecido.";
}
