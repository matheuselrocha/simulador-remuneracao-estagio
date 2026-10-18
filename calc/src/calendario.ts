/**
 * Calendário de dias úteis do Senado: segunda a sexta, exceto feriados e
 * pontos facultativos cadastrados. Só conhece os anos recebidos; pedir um
 * ano ausente lança `CalendarioIndisponivel` (em vez de contar errado).
 */
import {
  anoMesDe,
  ehFimDeSemana,
  partes,
  primeiroDia,
  proximoMes,
  somarDias,
  ultimoDia,
  type AnoMes,
  type DataISO,
} from "./datas.ts";

export class CalendarioIndisponivel extends Error {
  constructor(readonly ano: number) {
    super(`Calendário de ${ano} não cadastrado/publicado.`);
    this.name = "CalendarioIndisponivel";
  }
}

export interface DadosCalendario {
  /** Anos cujo calendário está disponível (no simulador: só os publicados). */
  anos: readonly number[];
  /** Feriados e pontos facultativos (podem incluir fins de semana: não têm efeito). */
  datasNaoUteis: readonly DataISO[];
}

export class Calendario {
  private readonly anos: ReadonlySet<number>;
  private readonly naoUteis: ReadonlySet<DataISO>;

  constructor(dados: DadosCalendario) {
    this.anos = new Set(dados.anos);
    this.naoUteis = new Set(dados.datasNaoUteis);
  }

  temAno(ano: number): boolean {
    return this.anos.has(ano);
  }

  temMes(am: AnoMes): boolean {
    return this.temAno(am.ano);
  }

  ehDiaUtil(data: DataISO): boolean {
    const { ano } = partes(data);
    if (!this.anos.has(ano)) throw new CalendarioIndisponivel(ano);
    return !ehFimDeSemana(data) && !this.naoUteis.has(data);
  }

  /** Dias úteis entre `inicio` e `fim`, ambos inclusive (como NETWORKDAYS). 0 se fim < inicio. */
  diasUteisEntre(inicio: DataISO, fim: DataISO): number {
    let n = 0;
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) if (this.ehDiaUtil(d)) n++;
    return n;
  }

  diasUteisNoMes(am: AnoMes): number {
    return this.diasUteisEntre(primeiroDia(am), ultimoDia(am));
  }

  /** N-ésimo dia útil do mês (ex.: 5º dia útil = data limite do depósito). */
  enesimoDiaUtil(am: AnoMes, n: number): DataISO {
    let contagem = 0;
    for (let d = primeiroDia(am); ; d = somarDias(d, 1)) {
      if (anoMesDe(d).mes !== am.mes) throw new RangeError(`${am.mes}/${am.ano} tem menos de ${n} dias úteis.`);
      if (this.ehDiaUtil(d) && ++contagem === n) return d;
    }
  }

  /** Data limite do depósito da folha de M: 5º dia útil de M+1. */
  dataDeposito(folha: AnoMes): DataISO {
    return this.enesimoDiaUtil(proximoMes(folha), 5);
  }
}
