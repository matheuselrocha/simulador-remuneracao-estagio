/**
 * Aritmética de datas civis, sem fuso horário.
 *
 * Datas circulam como strings ISO `AAAA-MM-DD` (o formato que o Postgres
 * devolve para colunas `date`). Internamente usamos `Date.UTC` só para
 * converter de/para um número de dias, nunca o relógio local.
 */

export type DataISO = string;

export interface AnoMes {
  ano: number;
  /** 1–12 */
  mes: number;
}

const MS_DIA = 86_400_000;
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ehDataISO(valor: string): boolean {
  const m = RE_ISO.exec(valor);
  if (!m) return false;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Faixa plausível: evita datas parciais da digitação (0002-11-25) e o Date.UTC,
  // que trata os anos 0–99 como 1900–1999.
  return a >= 1900 && a <= 2200 && me >= 1 && me <= 12 && d >= 1 && d <= diasNoMes(a, me);
}

export function partes(data: DataISO): { ano: number; mes: number; dia: number } {
  const m = RE_ISO.exec(data);
  if (!m || !ehDataISO(data)) throw new RangeError(`Data inválida: ${data}`);
  return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

export function montar(ano: number, mes: number, dia: number): DataISO {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function paraDias(data: DataISO): number {
  const { ano, mes, dia } = partes(data);
  return Date.UTC(ano, mes - 1, dia) / MS_DIA;
}

function deDias(n: number): DataISO {
  const d = new Date(n * MS_DIA);
  return montar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

export function diasNoMes(ano: number, mes: number): number {
  return [31, ehBissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1]!;
}

export function somarDias(data: DataISO, n: number): DataISO {
  return deDias(paraDias(data) + n);
}

/** Diferença em dias corridos (b − a). */
export function diferencaDias(a: DataISO, b: DataISO): number {
  return paraDias(b) - paraDias(a);
}

/** 0 = domingo … 6 = sábado */
export function diaDaSemana(data: DataISO): number {
  return new Date(paraDias(data) * MS_DIA).getUTCDay();
}

export function ehFimDeSemana(data: DataISO): boolean {
  const d = diaDaSemana(data);
  return d === 0 || d === 6;
}

/**
 * Soma meses mantendo o dia. Quando o dia não existe no mês de destino
 * (31/01 + 1 mês, 29/02 + 12 meses), avança para o dia 1º do mês seguinte:
 * o "aniversário" de 29/02/2024 em 2025 é 01/03/2025.
 */
export function somarMeses(data: DataISO, n: number): DataISO {
  const { ano, mes, dia } = partes(data);
  const total = ano * 12 + (mes - 1) + n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  if (dia <= diasNoMes(a, m)) return montar(a, m, dia);
  const prox = proximoMes({ ano: a, mes: m });
  return montar(prox.ano, prox.mes, 1);
}

export function somarAnos(data: DataISO, n: number): DataISO {
  return somarMeses(data, n * 12);
}

export function primeiroDia({ ano, mes }: AnoMes): DataISO {
  return montar(ano, mes, 1);
}

export function ultimoDia({ ano, mes }: AnoMes): DataISO {
  return montar(ano, mes, diasNoMes(ano, mes));
}

export function anoMesDe(data: DataISO): AnoMes {
  const { ano, mes } = partes(data);
  return { ano, mes };
}

export function mesAnterior({ ano, mes }: AnoMes): AnoMes {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function proximoMes({ ano, mes }: AnoMes): AnoMes {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

export function mesmoMes(a: AnoMes, b: AnoMes): boolean {
  return a.ano === b.ano && a.mes === b.mes;
}

/** Compara AnoMes: negativo se a < b. */
export function compararMeses(a: AnoMes, b: AnoMes): number {
  return a.ano * 12 + a.mes - (b.ano * 12 + b.mes);
}

export function contidaNoMes(data: DataISO, am: AnoMes): boolean {
  return mesmoMes(anoMesDe(data), am);
}

/**
 * Meses completos entre `inicio` (inclusive) e `fim` (inclusive).
 * Um mês está completo quando o período alcança a véspera do mesmo dia no
 * mês seguinte: de 15/03 a 14/04 = 1 mês.
 */
export function mesesCompletos(inicio: DataISO, fim: DataISO): { meses: number; diasRestantes: number } {
  if (fim < inicio) return { meses: 0, diasRestantes: 0 };
  const diaSeguinteAoFim = somarDias(fim, 1);
  let meses = 0;
  while (somarMeses(inicio, meses + 1) <= diaSeguinteAoFim) meses++;
  const diasRestantes = diferencaDias(somarMeses(inicio, meses), diaSeguinteAoFim);
  return { meses, diasRestantes };
}

/** Data final do contrato de 2 anos: entrada + 2 anos − 1 dia (aritmética de datas). */
export function dataFinalContrato(entrada: DataISO): DataISO {
  return somarDias(somarAnos(entrada, 2), -1);
}
