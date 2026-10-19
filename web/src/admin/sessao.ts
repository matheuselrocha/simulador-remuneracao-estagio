/**
 * Sessão do painel: "Seu nome" (lembrado na aba, não no banco) e logout
 * automático após 30 minutos sem atividade.
 */
import { supabase } from "./supabase.ts";

const CHAVE_NOME = "sgest.responsavel";
const CHAVE_ATIVIDADE = "sgest.ultimaAtividade";
export const INATIVIDADE_MS = 30 * 60 * 1000;

export function nomeResponsavel(): string {
  try {
    return sessionStorage.getItem(CHAVE_NOME) ?? "";
  } catch {
    return "";
  }
}

export function definirNomeResponsavel(nome: string) {
  try {
    sessionStorage.setItem(CHAVE_NOME, nome.trim());
  } catch {
    /* sem storage: o campo continua na tela */
  }
}

export function nomeValido(nome: string): boolean {
  const n = nome.trim();
  return n.length >= 2 && n.length <= 120;
}

function marcarAtividade() {
  try {
    sessionStorage.setItem(CHAVE_ATIVIDADE, String(Date.now()));
  } catch {
    /* ignora */
  }
}

function ultimaAtividade(): number {
  try {
    return Number(sessionStorage.getItem(CHAVE_ATIVIDADE) ?? Date.now());
  } catch {
    return Date.now();
  }
}

let vigiando = false;

/** Encerra a sessão após 30 min parado. `aoExpirar` mostra o aviso na tela de login. */
export function vigiarInatividade(aoExpirar: () => void) {
  if (vigiando) return;
  vigiando = true;
  marcarAtividade();
  for (const ev of ["pointerdown", "keydown", "scroll", "input"]) {
    window.addEventListener(ev, marcarAtividade, { passive: true });
  }
  const conferir = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session && Date.now() - ultimaAtividade() > INATIVIDADE_MS) {
      await sair();
      aoExpirar();
    }
  };
  window.setInterval(conferir, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void conferir();
  });
}

export async function sair() {
  await supabase.auth.signOut();
  try {
    sessionStorage.removeItem(CHAVE_ATIVIDADE);
  } catch {
    /* ignora */
  }
}
