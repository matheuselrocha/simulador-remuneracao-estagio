import type { Parametros } from "@sgest/calc";
import snapshot from "../parametros.snapshot.json";
import { buscarParametros } from "./parametros-db.ts";

export type OrigemParametros =
  | { tipo: "banco" }
  | { tipo: "snapshot"; geradoEm: string; motivo: string };

/** Lê do Supabase; se indisponível (fora do ar, pausado, sem env), usa o snapshot do build. */
export async function carregarParametros(): Promise<{ parametros: Parametros; origem: OrigemParametros }> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && chave) {
    try {
      return { parametros: await buscarParametros(url, chave), origem: { tipo: "banco" } };
    } catch (e) {
      console.warn("Parâmetros do Supabase indisponíveis; usando snapshot.", e);
      return { parametros: snapshot.parametros as Parametros, origem: { tipo: "snapshot", geradoEm: snapshot.geradoEm, motivo: "indisponivel" } };
    }
  }
  return { parametros: snapshot.parametros as Parametros, origem: { tipo: "snapshot", geradoEm: snapshot.geradoEm, motivo: "sem-configuracao" } };
}
