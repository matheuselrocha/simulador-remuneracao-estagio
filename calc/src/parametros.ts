/**
 * Parâmetros que vêm do banco (ou do snapshot). O motor nunca os lê sozinho:
 * recebe tudo por argumento.
 */
import type { DadosCalendario } from "./calendario.ts";
import { primeiroDia, type AnoMes, type DataISO } from "./datas.ts";
import type { Centavos } from "./dinheiro.ts";

export interface ValorVigente {
  /** Início da vigência; sempre o dia 1º de um mês. */
  inicio: DataISO;
  centavos: Centavos;
}

export interface ValorBolsa extends ValorVigente {
  /** Divisor da bolsa diária. Regra 4.1: sempre 30. */
  divisor: number;
}

export interface Parametros {
  bolsa: readonly ValorBolsa[];
  at: readonly ValorVigente[];
  calendario: DadosCalendario;
}

/**
 * Regras provisórias (seção 4.6). Cada uma tem um padrão e alternativa(s),
 * para que a confirmação do SGEST vire troca de opção, não reescrita.
 */
export interface RegrasProvisorias {
  /** 4.6.1 — fração de mês no recesso proporcional. */
  fracaoMesRecesso: "so-meses-completos" | "fracao-15-dias-conta-mes";
  /** 4.6.2 — recesso do 1º ano não gozado por quem sai entre 12 e 24 meses. */
  recessoPrimeiroAnoNaoGozado: "soma-30-dias-se-marcado" | "ignorar";
  /** 4.6.3 — desligamento no meio do mês. */
  desligamentoMeioDoMes: "proporcional" | "integral";
  /** 4.6.4 — valor usado no desconto do mês anterior quando houve reajuste entre M−1 e M. */
  valorDescontoMesAnterior: "vigente-em-M-1" | "vigente-em-M";
}

export const REGRAS_PADRAO: RegrasProvisorias = {
  fracaoMesRecesso: "so-meses-completos",
  recessoPrimeiroAnoNaoGozado: "soma-30-dias-se-marcado",
  desligamentoMeioDoMes: "proporcional",
  valorDescontoMesAnterior: "vigente-em-M-1",
};

/** Valor vigente no 1º dia do mês: maior `inicio` ≤ 1º dia. `undefined` se não houver. */
export function vigenteEm<T extends ValorVigente>(valores: readonly T[], mes: AnoMes): T | undefined {
  const dia1 = primeiroDia(mes);
  let escolhido: T | undefined;
  for (const v of valores) {
    if (v.inicio <= dia1 && (!escolhido || v.inicio > escolhido.inicio)) escolhido = v;
  }
  return escolhido;
}
