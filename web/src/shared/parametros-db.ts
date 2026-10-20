/**
 * Conversão das linhas do banco em `Parametros` do motor. Sem dependência
 * do Vite: usado também pelo script `npm run snapshot` (Node).
 */
import type { Parametros } from "@sgest/calc";

export interface LinhaValor {
  tipo: "bolsa" | "at";
  valor_centavos: number;
  divisor: number | null;
  vigencia_inicio: string;
}
export interface LinhaAno {
  ano: number;
}
export interface LinhaData {
  data: string;
}

/** Consultas de leitura usadas pelo simulador (todas GET; a RLS limita a anos publicados). */
export const CONSULTAS = {
  valores: "valores?select=tipo,valor_centavos,divisor,vigencia_inicio&order=vigencia_inicio",
  anos: "anos_calendario?select=ano&status=eq.publicado&order=ano",
  datas: "datas_nao_uteis?select=data&order=data",
} as const;

export function montarParametros(valores: LinhaValor[], anos: LinhaAno[], datas: LinhaData[]): Parametros {
  const publicados = new Set(anos.map((a) => a.ano));
  return {
    bolsa: valores
      .filter((v) => v.tipo === "bolsa")
      .map((v) => ({ inicio: v.vigencia_inicio, centavos: v.valor_centavos })),
    at: valores.filter((v) => v.tipo === "at").map((v) => ({ inicio: v.vigencia_inicio, centavos: v.valor_centavos })),
    calendario: {
      anos: [...publicados].sort(),
      // defesa extra: mesmo que a RLS falhe, datas de rascunho não entram
      datasNaoUteis: datas.map((d) => d.data).filter((d) => publicados.has(Number(d.slice(0, 4)))),
    },
  };
}

/** Lê os parâmetros pela API REST do Supabase, só com GET e a anon key. */
export async function buscarParametros(url: string, anonKey: string, timeoutMs = 8000): Promise<Parametros> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const get = async <T>(caminho: string): Promise<T> => {
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${caminho}`, {
      method: "GET",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: ctrl.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Supabase respondeu ${r.status} em ${caminho}`);
    return (await r.json()) as T;
  };
  try {
    const [valores, anos, datas] = await Promise.all([
      get<LinhaValor[]>(CONSULTAS.valores),
      get<LinhaAno[]>(CONSULTAS.anos),
      get<LinhaData[]>(CONSULTAS.datas),
    ]);
    return montarParametros(valores, anos, datas);
  } finally {
    clearTimeout(timer);
  }
}
