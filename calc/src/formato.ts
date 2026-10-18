/**
 * Formatação pt-BR, sem depender de Intl (resultado idêntico em qualquer
 * navegador e no Node dos testes).
 */
import type { Centavos } from "./dinheiro.ts";
import { partes, type AnoMes, type DataISO } from "./datas.ts";

export const NOMES_MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/** 163953 → "R$ 1.639,53"; negativos → "−R$ 1,00" */
export function formatarMoeda(centavos: Centavos): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const inteiro = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = String(abs % 100).padStart(2, "0");
  return `${negativo ? "−" : ""}R$ ${inteiro},${frac}`;
}

/** "2026-10-07" → "07/10/2026" */
export function formatarData(data: DataISO): string {
  const { ano, mes, dia } = partes(data);
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

export function nomeMes(mes: number): string {
  return NOMES_MESES[mes - 1]!;
}

/** { 2026, 9 } → "setembro/2026" */
export function formatarAnoMes({ ano, mes }: AnoMes): string {
  return `${nomeMes(mes)}/${ano}`;
}

/** 1 → "1 dia"; 2.5 → "2,5 dias" */
export function formatarDias(n: number): string {
  const texto = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${texto} ${n === 1 ? "dia" : "dias"}`;
}
