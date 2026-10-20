import type { AusenciasMes, EntradaSimulacao, Parametros } from "../src/index.ts";

/** Feriados e pontos facultativos de 2026, aba "Feriados e Ptos Fac. Senado" da planilha. */
export const DATAS_2026 = [
  "2026-01-01",
  "2026-02-16", "2026-02-17", "2026-02-18",
  "2026-04-02", "2026-04-03", "2026-04-20", "2026-04-21",
  "2026-05-01",
  "2026-06-04", "2026-06-05", "2026-06-29",
  "2026-09-07",
  "2026-10-12", "2026-10-28",
  "2026-11-02", "2026-11-15", "2026-11-20",
  "2026-12-24", "2026-12-25", "2026-12-31",
];

export function parametros2026(extra: Partial<Parametros> = {}): Parametros {
  return {
    bolsa: [{ inicio: "2026-01-01", centavos: 163953 }],
    at: [{ inicio: "2026-01-01", centavos: 1350 }],
    calendario: { anos: [2026], datasNaoUteis: DATAS_2026 },
    ...extra,
  };
}

export const SEM_AUSENCIAS: AusenciasMes = { diasNaoPresenciais: 0, faltasInjustificadas: 0 };

export function comum(dataEntrada: string, ano: number, mes: number, mesAnterior: AusenciasMes = SEM_AUSENCIAS): EntradaSimulacao {
  return { dataEntrada, folha: { ano, mes }, modo: "comum", mesAnterior };
}

/** Entrada "antiga" para cenários de mês comum. */
export const ENTRADA_ANTIGA = "2025-03-10";
