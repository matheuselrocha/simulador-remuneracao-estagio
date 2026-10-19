/** Leituras do painel (admin vê também anos em rascunho) e contas de prévia. */
import { Calendario, vigenteEm, type AnoMes, type Parametros } from "@sgest/calc";
import { montarParametros } from "../shared/parametros-db.ts";
import { supabase, type LinhaAnoDb, type LinhaDataDb, type LinhaValorDb } from "./supabase.ts";

export interface DadosPainel {
  valores: LinhaValorDb[];
  anos: LinhaAnoDb[];
  datas: LinhaDataDb[];
}

export async function carregarDados(): Promise<DadosPainel> {
  const [v, a, d] = await Promise.all([
    supabase.from("valores").select("*").order("vigencia_inicio", { ascending: false }),
    supabase.from("anos_calendario").select("*").order("ano"),
    supabase.from("datas_nao_uteis").select("*").order("data"),
  ]);
  const erro = v.error ?? a.error ?? d.error;
  if (erro) throw new Error(erro.message);
  return { valores: v.data as LinhaValorDb[], anos: a.data as LinhaAnoDb[], datas: d.data as LinhaDataDb[] };
}

/** Parâmetros como o simulador os vê (só anos publicados). */
export function parametrosPublicados(d: DadosPainel): Parametros {
  return montarParametros(
    d.valores,
    d.anos.filter((a) => a.status === "publicado"),
    d.datas,
  );
}

/** Calendário com todos os anos cadastrados (inclui rascunhos), para conferência no painel. */
export function calendarioCompleto(d: DadosPainel, datasExtras: string[] = [], semDatas: string[] = []): Calendario {
  const remover = new Set(semDatas);
  return new Calendario({
    anos: d.anos.map((a) => a.ano),
    datasNaoUteis: [...d.datas.map((x) => x.data).filter((x) => !remover.has(x)), ...datasExtras],
  });
}

/** Bruto de um estagiário sem ausências na folha de `mes`, ou null se faltar valor/calendário. */
export function brutoSemAusencias(p: Parametros, mes: AnoMes): { centavos: number; diasUteis: number } | null {
  const bolsa = vigenteEm(p.bolsa, mes);
  const at = vigenteEm(p.at, mes);
  const cal = new Calendario(p.calendario);
  if (!bolsa || !at || !cal.temMes(mes)) return null;
  const diasUteis = cal.diasUteisNoMes(mes);
  return { centavos: bolsa.centavos + at.centavos * diasUteis, diasUteis };
}

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
