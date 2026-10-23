/**
 * Simulação da folha de um mês (seção 4 do prompt de especificação).
 *
 * Função pura: recebe as respostas do estagiário + parâmetros e devolve o
 * extrato, ou a lista de erros de validação. Nunca lança por entrada ruim.
 */
import { Calendario, CalendarioIndisponivel } from "./calendario.ts";
import {
  anoMesDe,
  compararMeses,
  contidaNoMes,
  dataFinalContrato,
  diferencaDias,
  diasNoMes,
  ehDataISO,
  mesAnterior as mesAnteriorDe,
  mesesCompletos,
  mesmoMes,
  partes,
  primeiroDia,
  somarAnos,
  somarDias,
  ultimoDia,
  type AnoMes,
  type DataISO,
} from "./datas.ts";
import { multiplicarArredondado, type Centavos } from "./dinheiro.ts";
import { formatarAnoMes, formatarData, formatarDias, formatarMoeda, nomeMes } from "./formato.ts";
import {
  REGRAS_PADRAO,
  vigenteEm,
  type Parametros,
  type RegrasProvisorias,
  type ValorBolsa,
  type ValorVigente,
} from "./parametros.ts";

// ───────────────────────────── Tipos públicos ─────────────────────────────

export interface AusenciasMes {
  /** Dias úteis sem presença física (falta, atestado, recesso, remoto…). */
  diasNaoPresenciais: number;
  /** Subconjunto de diasNaoPresenciais que desconta bolsa. */
  faltasInjustificadas: number;
}

/**
 * Situação das primeiras férias (recesso do 1º ano) na data da saída.
 * Férias são sempre de 30 dias, sem parcelamento, e só depois de completar 1 ano.
 * - "tirou": usufruiu os 30 dias;
 * - "nao-tirou": não usufruiu → 30 dias em pecúnia (quem completa 2 anos: usufruiu só as últimas);
 * - "em-andamento": saiu durante as primeiras férias → dias restantes em pecúnia;
 * - "junto-com-ultimas": só para quem completa 2 anos: usufrui as primeiras seguidas das últimas.
 */
export type SituacaoPrimeirasFerias = "tirou" | "nao-tirou" | "em-andamento" | "junto-com-ultimas";

export interface DadosDesligamento {
  /** Último dia do estágio (inclusive). Deve cair no mês da folha. */
  dataSaida: DataISO;
  /** Outras ausências do mês do desligamento — os dias de férias o simulador calcula sozinho. */
  mesAtual: AusenciasMes;
  /** Obrigatória quando a saída é depois de completar 1 ano (ver ContextoFolha.opcoesPrimeirasFerias). */
  primeirasFerias?: { situacao: SituacaoPrimeirasFerias; /** Só em "em-andamento". */ inicio?: DataISO };
}

/** Período de férias considerado no desligamento (sem AT; bolsa normal). */
export interface PeriodoFerias {
  inicio: DataISO;
  fim: DataISO;
  descricao: string;
}

export interface EntradaSimulacao {
  dataEntrada: DataISO;
  folha: AnoMes;
  modo: "comum" | "desligamento";
  /** Ignorado no mês de entrada (não existe mês anterior). */
  mesAnterior: AusenciasMes;
  /** Obrigatório quando modo = "desligamento". */
  desligamento?: DadosDesligamento;
}

export type GrupoExtrato = "mes-da-folha" | "mes-anterior" | "mes-atual" | "ferias";

export interface LinhaExtrato {
  grupo: GrupoExtrato;
  natureza: "credito" | "desconto";
  descricao: string;
  /** A conta exibida, ex.: "4 dias × R$ 13,50". */
  conta: string;
  /** Sempre ≥ 0; o sinal vem de `natureza`. */
  centavos: Centavos;
}

export type CampoEntrada =
  | "dataEntrada"
  | "folha"
  | "mesAnterior.diasNaoPresenciais"
  | "mesAnterior.faltasInjustificadas"
  | "desligamento.dataSaida"
  | "desligamento.mesAtual.diasNaoPresenciais"
  | "desligamento.mesAtual.faltasInjustificadas"
  | "desligamento.primeirasFerias.situacao"
  | "desligamento.primeirasFerias.inicio";

export interface ErroValidacao {
  campo: CampoEntrada;
  codigo:
    | "data-invalida"
    | "entrada-posterior-a-folha"
    | "calendario-indisponivel"
    | "valores-indisponiveis"
    | "numero-invalido"
    | "faltas-maior-que-nao-presenciais"
    | "acima-do-maximo"
    | "saida-fora-do-mes"
    | "saida-antes-da-entrada"
    | "saida-apos-fim-do-contrato"
    | "situacao-ferias-obrigatoria"
    | "ferias-invalidas";
  mensagem: string;
}

export interface Aviso {
  codigo:
    | "calendario-mes-anterior-indisponivel"
    | "calendario-deposito-indisponivel"
    | "regra-fracao-mes-recesso"
    | "info-ultimas-ferias"
    | "regra-desligamento-meio-do-mes"
    | "regra-valor-desconto-mes-anterior";
  /** true para os pontos em aberto da seção 4.6 ("regra a confirmar com o SGEST"). */
  regraAConfirmar: boolean;
  mensagem: string;
}

/** Informações para montar rótulos e limites da interface, mesmo com erro. */
export interface ContextoFolha {
  folha: AnoMes;
  mesAnterior: AnoMes;
  ehMesDeEntrada: boolean;
  mesAnteriorEhEntrada: boolean;
  diasUteisFolha: number | null;
  diasUteisMesAnterior: number | null;
  /** Limite de dias não presenciais em M−1; null se desconhecido ou não se aplica. */
  maxNaoPresenciaisMesAnterior: number | null;
  /** Limite de dias não presenciais no mês do desligamento. */
  maxNaoPresenciaisMesAtual: number | null;
  dataFinalContrato: DataISO | null;
  dataDeposito: DataISO | null;
  /** Opções da pergunta "Suas primeiras férias" para esta saída; vazio = a pergunta não se aplica. */
  opcoesPrimeirasFerias: SituacaoPrimeirasFerias[];
  /** Períodos de férias considerados no desligamento (calculados pelo simulador). */
  periodosFerias: PeriodoFerias[];
  /** Dias úteis de férias (sem AT) no mês anterior e no mês da folha. */
  diasUteisFeriasMesAnterior: number;
  diasUteisFeriasMesAtual: number;
  bolsaCentavos: Centavos | null;
  atCentavos: Centavos | null;
}

export type ResultadoSimulacao =
  | {
      ok: true;
      contexto: ContextoFolha;
      linhas: LinhaExtrato[];
      creditosCentavos: Centavos;
      descontosCentavos: Centavos;
      liquidoCentavos: Centavos;
      avisos: Aviso[];
    }
  | { ok: false; contexto: ContextoFolha | null; erros: ErroValidacao[]; avisos: Aviso[] };

export const TITULOS_GRUPOS: Record<GrupoExtrato, string> = {
  "mes-da-folha": "Valores do mês",
  "mes-anterior": "Descontos do mês anterior",
  "mes-atual": "Descontos do mês do desligamento",
  ferias: "Férias em pecúnia",
};

// ───────────────────────────── Implementação ─────────────────────────────

/** Bolsa diária = bolsa mensal ÷ número de dias do mês a que o dia se refere (28, 29, 30 ou 31). */
const contaBolsaDiaria = (b: ValorBolsa, mes: AnoMes) => `(${formatarMoeda(b.centavos)} ÷ ${diasNoMes(mes.ano, mes.mes)})`;
const valorDiasDeBolsa = (dias: number, b: ValorBolsa, mes: AnoMes) => multiplicarArredondado(dias, b.centavos, diasNoMes(mes.ano, mes.mes));
/** Recesso: exceção à regra acima. 30 dias de recesso = uma bolsa cheia, então o dia de recesso vale bolsa ÷ 30. */
const DIVISOR_RECESSO = 30;
const contaDiaRecesso = (b: ValorBolsa) => `(${formatarMoeda(b.centavos)} ÷ ${DIVISOR_RECESSO})`;
const valorDiasDeRecesso = (dias: number, b: ValorBolsa) => multiplicarArredondado(dias, b.centavos, DIVISOR_RECESSO);

function diasCorridos(n: number) {
  return formatarDias(n);
}
function diasUteis(n: number) {
  return `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
}

function inteiroNaoNegativo(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/** Valida um par (não presenciais, faltas) contra o limite do mês. */
function validarAusencias(
  a: AusenciasMes,
  maximo: number | null,
  nomeDoMes: string,
  campos: { naoPresenciais: CampoEntrada; faltas: CampoEntrada },
  erros: ErroValidacao[],
) {
  let ok = true;
  if (!inteiroNaoNegativo(a.diasNaoPresenciais)) {
    erros.push({ campo: campos.naoPresenciais, codigo: "numero-invalido", mensagem: "Informe um número inteiro de dias, 0 ou mais." });
    ok = false;
  }
  if (!inteiroNaoNegativo(a.faltasInjustificadas)) {
    erros.push({ campo: campos.faltas, codigo: "numero-invalido", mensagem: "Informe um número inteiro de dias, 0 ou mais." });
    ok = false;
  }
  if (!ok) return;
  if (maximo !== null && a.diasNaoPresenciais > maximo) {
    erros.push({
      campo: campos.naoPresenciais,
      codigo: "acima-do-maximo",
      mensagem: `${capitalizar(nomeDoMes)} tem só ${diasUteis(maximo)} que contam para você. Informe no máximo ${maximo}.`,
    });
  }
  if (a.faltasInjustificadas > a.diasNaoPresenciais) {
    erros.push({
      campo: campos.faltas,
      codigo: "faltas-maior-que-nao-presenciais",
      mensagem: "As faltas injustificadas fazem parte dos dias não presenciais: não podem ser mais numerosas que eles.",
    });
  }
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Descontos de ausências de um mês (regra 4.2). */
function linhasAusencias(
  grupo: "mes-anterior" | "mes-atual",
  mes: AnoMes,
  a: AusenciasMes,
  bolsa: ValorBolsa,
  at: ValorVigente,
): LinhaExtrato[] {
  const linhas: LinhaExtrato[] = [];
  const nome = nomeMes(mes.mes);
  if (a.faltasInjustificadas > 0) {
    linhas.push({
      grupo,
      natureza: "desconto",
      descricao: `Faltas injustificadas em ${nome} (bolsa)`,
      conta: `${diasCorridos(a.faltasInjustificadas)} × ${contaBolsaDiaria(bolsa, mes)}`,
      centavos: valorDiasDeBolsa(a.faltasInjustificadas, bolsa, mes),
    });
  }
  if (a.diasNaoPresenciais > 0) {
    linhas.push({
      grupo,
      natureza: "desconto",
      descricao: `Dias sem presença física em ${nome} (auxílio-transporte)`,
      conta: `${diasCorridos(a.diasNaoPresenciais)} × ${formatarMoeda(at.centavos)}`,
      centavos: multiplicarArredondado(a.diasNaoPresenciais, at.centavos),
    });
  }
  return linhas;
}

export function simularFolha(
  entrada: EntradaSimulacao,
  parametros: Parametros,
  regras: RegrasProvisorias = REGRAS_PADRAO,
): ResultadoSimulacao {
  const erros: ErroValidacao[] = [];
  const avisos: Aviso[] = [];
  const cal = new Calendario(parametros.calendario);
  const { folha } = entrada;

  // ── Datas básicas ──
  if (!Number.isInteger(folha.ano) || !Number.isInteger(folha.mes) || folha.mes < 1 || folha.mes > 12) {
    erros.push({ campo: "folha", codigo: "data-invalida", mensagem: "Escolha o mês e o ano da folha." });
    return { ok: false, contexto: null, erros, avisos };
  }
  if (!ehDataISO(entrada.dataEntrada)) {
    erros.push({ campo: "dataEntrada", codigo: "data-invalida", mensagem: "Informe a data em que você entrou no Senado." });
    return { ok: false, contexto: null, erros, avisos };
  }
  const mesAnt = mesAnteriorDe(folha);
  const dataEntrada = entrada.dataEntrada;
  const mesEntrada = anoMesDe(dataEntrada);
  if (compararMeses(mesEntrada, folha) > 0) {
    erros.push({
      campo: "dataEntrada",
      codigo: "entrada-posterior-a-folha",
      mensagem: `Sua data de entrada (${formatarData(dataEntrada)}) é posterior a ${formatarAnoMes(folha)}. Escolha uma folha a partir do mês de entrada.`,
    });
  }

  const ehMesDeEntrada = mesmoMes(mesEntrada, folha);
  const mesAnteriorEhEntrada = mesmoMes(mesEntrada, mesAnt);
  const bolsaM = vigenteEm(parametros.bolsa, folha);
  const atM = vigenteEm(parametros.at, folha);

  const contexto: ContextoFolha = {
    folha,
    mesAnterior: mesAnt,
    ehMesDeEntrada,
    mesAnteriorEhEntrada,
    diasUteisFolha: null,
    diasUteisMesAnterior: null,
    maxNaoPresenciaisMesAnterior: null,
    maxNaoPresenciaisMesAtual: null,
    dataFinalContrato: dataFinalContrato(dataEntrada),
    dataDeposito: null,
    opcoesPrimeirasFerias: [],
    periodosFerias: [],
    diasUteisFeriasMesAnterior: 0,
    diasUteisFeriasMesAtual: 0,
    bolsaCentavos: bolsaM?.centavos ?? null,
    atCentavos: atM?.centavos ?? null,
  };

  // ── Calendário do mês da folha: obrigatório ──
  if (!cal.temMes(folha)) {
    erros.push({
      campo: "folha",
      codigo: "calendario-indisponivel",
      mensagem: `O calendário de ${folha.ano} ainda não foi publicado pelo SGEST. Não é possível simular ${formatarAnoMes(folha)}.`,
    });
    return { ok: false, contexto, erros, avisos };
  }
  contexto.diasUteisFolha = cal.diasUteisNoMes(folha);

  if (!bolsaM || !atM) {
    erros.push({
      campo: "folha",
      codigo: "valores-indisponiveis",
      mensagem: `Não há valor de bolsa ou de auxílio-transporte vigente em ${formatarAnoMes(folha)}.`,
    });
    return { ok: false, contexto, erros, avisos };
  }

  // ── Calendário do mês anterior: opcional (só limita a validação) ──
  if (!ehMesDeEntrada) {
    if (cal.temMes(mesAnt)) {
      contexto.diasUteisMesAnterior = cal.diasUteisNoMes(mesAnt);
      contexto.maxNaoPresenciaisMesAnterior = mesAnteriorEhEntrada
        ? cal.diasUteisEntre(dataEntrada, ultimoDia(mesAnt))
        : contexto.diasUteisMesAnterior;
    } else {
      avisos.push({
        codigo: "calendario-mes-anterior-indisponivel",
        regraAConfirmar: false,
        mensagem: `O calendário de ${mesAnt.ano} não está cadastrado, então não foi possível conferir o limite de dias úteis de ${formatarAnoMes(mesAnt)}. Confira os números informados.`,
      });
    }
  }

  // ── Data do depósito: 5º dia útil de M+1 ──
  try {
    contexto.dataDeposito = cal.dataDeposito(folha);
  } catch (e) {
    if (!(e instanceof CalendarioIndisponivel)) throw e;
    avisos.push({
      codigo: "calendario-deposito-indisponivel",
      regraAConfirmar: false,
      mensagem: `O calendário de ${e.ano} ainda não foi publicado, então a data do depósito (5º dia útil do mês seguinte) não pôde ser calculada.`,
    });
  }

  // ── Desligamento: validação de datas e limites ──
  const deslig = entrada.modo === "desligamento" ? entrada.desligamento : undefined;
  let fimCredito = ultimoDia(folha); // último dia que gera bolsa/AT no mês
  if (entrada.modo === "desligamento") {
    if (!deslig || !ehDataISO(deslig.dataSaida)) {
      erros.push({ campo: "desligamento.dataSaida", codigo: "data-invalida", mensagem: "Informe a data do desligamento." });
    } else if (!contidaNoMes(deslig.dataSaida, folha)) {
      erros.push({
        campo: "desligamento.dataSaida",
        codigo: "saida-fora-do-mes",
        mensagem: `A data do desligamento precisa estar em ${formatarAnoMes(folha)}, o mês da folha simulada.`,
      });
    } else if (deslig.dataSaida < dataEntrada) {
      erros.push({ campo: "desligamento.dataSaida", codigo: "saida-antes-da-entrada", mensagem: "A data do desligamento é anterior à data de entrada." });
    } else if (deslig.dataSaida > contexto.dataFinalContrato!) {
      erros.push({
        campo: "desligamento.dataSaida",
        codigo: "saida-apos-fim-do-contrato",
        mensagem: `O estágio termina no máximo em ${formatarData(contexto.dataFinalContrato!)} (2 anos).`,
      });
    } else {
      const saida = deslig.dataSaida;
      if (regras.desligamentoMeioDoMes === "proporcional" && saida < ultimoDia(folha)) fimCredito = saida;
      const inicioMes = ehMesDeEntrada ? dataEntrada : primeiroDia(folha);
      resolverFeriasDoDesligamento(dataEntrada, deslig, contexto, erros);
      // Dias úteis de férias: sem AT. No mês da saída simplesmente não geram AT;
      // no mês anterior o AT foi pago adiantado e é descontado na última folha.
      contexto.diasUteisFeriasMesAtual = diasUteisDeFerias(cal, contexto.periodosFerias, inicioMes, fimCredito);
      if (!ehMesDeEntrada && cal.temMes(mesAnt)) {
        contexto.diasUteisFeriasMesAnterior = diasUteisDeFerias(cal, contexto.periodosFerias, primeiroDia(mesAnt), ultimoDia(mesAnt));
        if (contexto.maxNaoPresenciaisMesAnterior !== null) contexto.maxNaoPresenciaisMesAnterior -= contexto.diasUteisFeriasMesAnterior;
      }
      contexto.maxNaoPresenciaisMesAtual = cal.diasUteisEntre(inicioMes, fimCredito) - contexto.diasUteisFeriasMesAtual;
      validarAusencias(
        deslig.mesAtual,
        contexto.maxNaoPresenciaisMesAtual,
        nomeMes(folha.mes),
        {
          naoPresenciais: "desligamento.mesAtual.diasNaoPresenciais",
          faltas: "desligamento.mesAtual.faltasInjustificadas",
        },
        erros,
      );
    }
  }

  // ── Validação do mês anterior (limite já sem os dias de férias, no desligamento) ──
  if (!ehMesDeEntrada) {
    validarAusencias(
      entrada.mesAnterior,
      contexto.maxNaoPresenciaisMesAnterior,
      nomeMes(mesAnt.mes),
      { naoPresenciais: "mesAnterior.diasNaoPresenciais", faltas: "mesAnterior.faltasInjustificadas" },
      erros,
    );
  }

  if (erros.length > 0) return { ok: false, contexto, erros, avisos };

  // ───────────────────────────── Cálculo ─────────────────────────────
  const linhas: LinhaExtrato[] = [];

  // Créditos do mês. Mês cheio: bolsa integral + AT de todos os dias úteis.
  // 1ª folha (regra 4.3) e/ou desligamento no meio do mês (4.6.3): bolsa e AT
  // proporcionais ao período de vínculo no mês — sem linhas de desconto.
  // Bolsa proporcional: dias corridos do período × (bolsa ÷ dias do mês).
  const inicioCredito = ehMesDeEntrada ? dataEntrada : primeiroDia(folha);
  if (inicioCredito === primeiroDia(folha) && fimCredito === ultimoDia(folha)) {
    linhas.push({
      grupo: "mes-da-folha",
      natureza: "credito",
      descricao: "Bolsa de estágio",
      conta: "valor mensal",
      centavos: bolsaM.centavos,
    });
    linhas.push(linhaAT(`Auxílio-transporte de ${nomeMes(folha.mes)}`, contexto.diasUteisFolha, contexto.diasUteisFeriasMesAtual, atM));
  } else {
    const diaInicio = partes(inicioCredito).dia;
    const diaFim = partes(fimCredito).dia;
    const diasBolsa = Math.max(0, diaFim - diaInicio + 1);
    const periodo = `de ${formatarData(inicioCredito).slice(0, 5)} a ${formatarData(fimCredito).slice(0, 5)}`;
    linhas.push({
      grupo: "mes-da-folha",
      natureza: "credito",
      descricao: `Bolsa de estágio proporcional (${periodo})`,
      conta: `${diasCorridos(diasBolsa)} × ${contaBolsaDiaria(bolsaM, folha)}`,
      centavos: valorDiasDeBolsa(diasBolsa, bolsaM, folha),
    });
    const du = cal.diasUteisEntre(inicioCredito, fimCredito);
    linhas.push(linhaAT(`Auxílio-transporte proporcional (${periodo})`, du, contexto.diasUteisFeriasMesAtual, atM));
    if (fimCredito < ultimoDia(folha)) {
      avisos.push({
        codigo: "regra-desligamento-meio-do-mes",
        regraAConfirmar: true,
        mensagem:
          "Desligamento antes do fim do mês: a bolsa foi calculada pelos dias corridos até a saída (bolsa ÷ dias do mês) e o auxílio-transporte pelos dias úteis até a saída.",
      });
    }
  }

  // Mês de entrada (regra 4.3): não existe mês anterior, logo não há descontos de ausências.
  if (!ehMesDeEntrada) {
    // Mês anterior (regra 4.2), com valor vigente em M−1 (regra provisória 4.6.4)
    let bolsaAnt = bolsaM;
    let atAnt = atM;
    if (regras.valorDescontoMesAnterior === "vigente-em-M-1") {
      bolsaAnt = vigenteEm(parametros.bolsa, mesAnt) ?? bolsaM;
      atAnt = vigenteEm(parametros.at, mesAnt) ?? atM;
    }
    const a = entrada.mesAnterior;
    const reajusteRelevante =
      (a.diasNaoPresenciais > 0 && vigenteEm(parametros.at, mesAnt) && vigenteEm(parametros.at, mesAnt)!.centavos !== atM.centavos) ||
      (a.faltasInjustificadas > 0 &&
        vigenteEm(parametros.bolsa, mesAnt) &&
        vigenteEm(parametros.bolsa, mesAnt)!.centavos !== bolsaM.centavos);
    if (reajusteRelevante) {
      avisos.push({
        codigo: "regra-valor-desconto-mes-anterior",
        regraAConfirmar: true,
        mensagem:
          regras.valorDescontoMesAnterior === "vigente-em-M-1"
            ? `Houve reajuste entre ${formatarAnoMes(mesAnt)} e ${formatarAnoMes(folha)}. Os descontos de ${nomeMes(mesAnt.mes)} usam o valor vigente em ${nomeMes(mesAnt.mes)}, o mês em que foi pago.`
            : `Houve reajuste entre ${formatarAnoMes(mesAnt)} e ${formatarAnoMes(folha)}. Os descontos de ${nomeMes(mesAnt.mes)} usam o valor vigente em ${nomeMes(folha.mes)}.`,
      });
    }
    if (contexto.diasUteisFeriasMesAnterior > 0) {
      linhas.push({
        grupo: "mes-anterior",
        natureza: "desconto",
        descricao: `Dias de férias em ${nomeMes(mesAnt.mes)} (auxílio-transporte pago adiantado)`,
        conta: `${diasUteis(contexto.diasUteisFeriasMesAnterior)} × ${formatarMoeda(atAnt.centavos)}`,
        centavos: multiplicarArredondado(contexto.diasUteisFeriasMesAnterior, atAnt.centavos),
      });
    }
    linhas.push(...linhasAusencias("mes-anterior", mesAnt, a, bolsaAnt, atAnt));
  }

  // Desligamento (regra 4.5)
  if (deslig) {
    linhas.push(...linhasAusencias("mes-atual", folha, deslig.mesAtual, bolsaM, atM));
    linhas.push(...linhasFeriasEmPecunia(dataEntrada, deslig, contexto, bolsaM, regras, avisos));
  }

  const creditos = soma(linhas, "credito");
  const descontos = soma(linhas, "desconto");
  return {
    ok: true,
    contexto,
    linhas,
    creditosCentavos: creditos,
    descontosCentavos: descontos,
    liquidoCentavos: creditos - descontos,
    avisos,
  };
}

function soma(linhas: LinhaExtrato[], natureza: LinhaExtrato["natureza"]): Centavos {
  return linhas.filter((l) => l.natureza === natureza).reduce((t, l) => t + l.centavos, 0);
}

/** AT do mês sem os dias úteis de férias (forma B: os dias de férias simplesmente não geram AT). */
function linhaAT(descricao: string, diasUteisPeriodo: number, diasUteisFerias: number, at: ValorVigente): LinhaExtrato {
  const presenciais = Math.max(0, diasUteisPeriodo - diasUteisFerias);
  const conta =
    diasUteisFerias === 0
      ? `${diasUteis(presenciais)} × ${formatarMoeda(at.centavos)}`
      : presenciais === 0
        ? `não devido: ${diasUteis(diasUteisFerias)} de férias`
        : `${diasUteis(presenciais)} × ${formatarMoeda(at.centavos)} (sem os ${diasUteis(diasUteisFerias)} de férias)`;
  return { grupo: "mes-da-folha", natureza: "credito", descricao, conta, centavos: multiplicarArredondado(presenciais, at.centavos) };
}

function diasUteisDeFerias(cal: Calendario, periodos: PeriodoFerias[], inicio: DataISO, fim: DataISO): number {
  let n = 0;
  for (const p of periodos) {
    const a = p.inicio > inicio ? p.inicio : inicio;
    const b = p.fim < fim ? p.fim : fim;
    if (a <= b) n += cal.diasUteisEntre(a, b);
  }
  return n;
}

/** Marcos do contrato para as regras de férias. */
export function marcosDoContrato(dataEntrada: DataISO, dataSaida: DataISO) {
  const podeTirarFeriasDesde = somarAnos(dataEntrada, 1); // dia seguinte ao 1º ano completo
  return {
    podeTirarFeriasDesde,
    completouUmAno: dataSaida >= somarDias(podeTirarFeriasDesde, -1),
    /** Saída no último dia do 1º ano: não houve como usufruir as primeiras férias. */
    saiuAoCompletarUmAno: dataSaida === somarDias(podeTirarFeriasDesde, -1),
    completouDoisAnos: dataSaida >= dataFinalContrato(dataEntrada),
  };
}

/** Define as opções de "Suas primeiras férias", valida a resposta e monta os períodos de férias. */
function resolverFeriasDoDesligamento(dataEntrada: DataISO, deslig: DadosDesligamento, contexto: ContextoFolha, erros: ErroValidacao[]) {
  const saida = deslig.dataSaida;
  const final = contexto.dataFinalContrato!;
  const m = marcosDoContrato(dataEntrada, saida);
  contexto.opcoesPrimeirasFerias =
    !m.completouUmAno || m.saiuAoCompletarUmAno
      ? []
      : m.completouDoisAnos
        ? ["tirou", "nao-tirou", "junto-com-ultimas"]
        : ["tirou", "nao-tirou", "em-andamento"];

  const periodos: PeriodoFerias[] = [];
  // Últimas férias: obrigatoriamente usufruídas nos 30 dias anteriores ao fim do contrato.
  if (m.completouDoisAnos) {
    periodos.push({ inicio: somarDias(final, -29), fim: final, descricao: "últimas férias" });
  }
  const situacao = deslig.primeirasFerias?.situacao;
  if (contexto.opcoesPrimeirasFerias.length > 0) {
    if (!situacao || !contexto.opcoesPrimeirasFerias.includes(situacao)) {
      erros.push({
        campo: "desligamento.primeirasFerias.situacao",
        codigo: "situacao-ferias-obrigatoria",
        mensagem: "Informe a situação das suas primeiras férias.",
      });
    } else if (situacao === "junto-com-ultimas") {
      periodos.unshift({ inicio: somarDias(final, -59), fim: somarDias(final, -30), descricao: "primeiras férias" });
    } else if (situacao === "em-andamento") {
      const inicio = deslig.primeirasFerias?.inicio ?? "";
      if (!ehDataISO(inicio)) {
        erros.push({ campo: "desligamento.primeirasFerias.inicio", codigo: "data-invalida", mensagem: "Informe a data em que suas férias começaram." });
      } else if (inicio < m.podeTirarFeriasDesde) {
        erros.push({
          campo: "desligamento.primeirasFerias.inicio",
          codigo: "ferias-invalidas",
          mensagem: `As primeiras férias só podem começar depois de completar 1 ano, a partir de ${formatarData(m.podeTirarFeriasDesde)}.`,
        });
      } else if (inicio > saida) {
        erros.push({ campo: "desligamento.primeirasFerias.inicio", codigo: "ferias-invalidas", mensagem: "O início das férias não pode ser depois da data do desligamento." });
      } else if (diferencaDias(inicio, saida) + 1 > 30) {
        erros.push({
          campo: "desligamento.primeirasFerias.inicio",
          codigo: "ferias-invalidas",
          mensagem: `Férias iniciadas em ${formatarData(inicio)} terminaram em ${formatarData(somarDias(inicio, 29))}, antes do desligamento. Escolha "Já tirei".`,
        });
      } else {
        periodos.unshift({ inicio, fim: saida, descricao: "primeiras férias" });
      }
    }
  }
  contexto.periodosFerias = periodos;
}

/** Dias de férias pagos em pecúnia na saída (regras confirmadas pelo SGEST em 23/10/2026). */
export function calcularFeriasEmPecunia(
  dataEntrada: DataISO,
  dataSaida: DataISO,
  primeiras: DadosDesligamento["primeirasFerias"],
  regras: RegrasProvisorias = REGRAS_PADRAO,
): {
  primeiras: { dias: number; usufruidos: number } | null;
  proporcional: { dias: number; meses: number; periodo: "primeiro" | "segundo"; fracaoIgnorada: boolean } | null;
  completouDoisAnos: boolean;
} {
  const m = marcosDoContrato(dataEntrada, dataSaida);
  // Primeiras férias: direito integral a partir do 1º ano completo.
  let primeirasPecunia: { dias: number; usufruidos: number } | null = null;
  if (m.completouUmAno) {
    const situacao = m.saiuAoCompletarUmAno ? "nao-tirou" : primeiras?.situacao;
    if (situacao === "nao-tirou") primeirasPecunia = { dias: 30, usufruidos: 0 };
    else if (situacao === "em-andamento" && primeiras?.inicio) {
      const usufruidos = Math.min(30, diferencaDias(primeiras.inicio, dataSaida) + 1);
      primeirasPecunia = { dias: 30 - usufruidos, usufruidos };
    }
  }
  // Proporcional: 2,5 dias por mês completo do período em aberto. Quem completa 2 anos
  // usufrui as últimas férias no fim do contrato (obrigatório): nada em pecúnia.
  let proporcional: { dias: number; meses: number; periodo: "primeiro" | "segundo"; fracaoIgnorada: boolean } | null = null;
  if (!m.completouDoisAnos) {
    const periodo = m.completouUmAno ? "segundo" : "primeiro";
    const inicioPeriodo = m.completouUmAno ? m.podeTirarFeriasDesde : dataEntrada;
    let { meses, diasRestantes } = mesesCompletos(inicioPeriodo, dataSaida);
    let fracaoIgnorada = false;
    if (diasRestantes > 0) {
      if (regras.fracaoMesRecesso === "fracao-15-dias-conta-mes" && diasRestantes >= 15) meses++;
      else fracaoIgnorada = true;
    }
    proporcional = { dias: meses * 2.5, meses, periodo, fracaoIgnorada };
  }
  return { primeiras: primeirasPecunia, proporcional, completouDoisAnos: m.completouDoisAnos };
}

function linhasFeriasEmPecunia(
  dataEntrada: DataISO,
  deslig: DadosDesligamento,
  contexto: ContextoFolha,
  bolsa: ValorBolsa,
  regras: RegrasProvisorias,
  avisos: Aviso[],
): LinhaExtrato[] {
  const r = calcularFeriasEmPecunia(dataEntrada, deslig.dataSaida, deslig.primeirasFerias, regras);
  const linhas: LinhaExtrato[] = [];
  if (r.primeiras && r.primeiras.dias > 0) {
    linhas.push({
      grupo: "ferias",
      natureza: "credito",
      descricao:
        r.primeiras.usufruidos > 0
          ? `Primeiras férias: dias não usufruídos (usufruiu ${r.primeiras.usufruidos} de 30)`
          : r.completouDoisAnos
            ? "Primeiras férias não usufruídas (usufruiu só as últimas)"
            : "Primeiras férias não usufruídas",
      conta: `${formatarDias(r.primeiras.dias)} × ${contaDiaRecesso(bolsa)}`,
      centavos: valorDiasDeRecesso(r.primeiras.dias, bolsa),
    });
  }
  if (r.proporcional) {
    if (r.proporcional.fracaoIgnorada) {
      avisos.push({
        codigo: "regra-fracao-mes-recesso",
        regraAConfirmar: true,
        mensagem: "As férias proporcionais consideraram só os meses completos do período aquisitivo; a fração de mês ficou de fora.",
      });
    }
    if (r.proporcional.dias > 0) {
      const meses = `${r.proporcional.meses} ${r.proporcional.meses === 1 ? "mês completo" : "meses completos"} × 2,5 dias`;
      linhas.push({
        grupo: "ferias",
        natureza: "credito",
        descricao: `${r.proporcional.periodo === "segundo" ? "Segundas férias proporcionais" : "Férias proporcionais"} (${meses})`,
        conta: `${formatarDias(r.proporcional.dias)} × ${contaDiaRecesso(bolsa)}`,
        centavos: valorDiasDeRecesso(r.proporcional.dias, bolsa),
      });
    }
  }
  const ultimas = contexto.periodosFerias.find((p) => p.descricao === "últimas férias");
  if (ultimas) {
    avisos.push({
      codigo: "info-ultimas-ferias",
      regraAConfirmar: false,
      mensagem: `As últimas férias (${formatarData(ultimas.inicio)} a ${formatarData(ultimas.fim)}) são usufruídas no fim do contrato e não são pagas em dinheiro. Nesses dias a bolsa é paga normalmente e não há auxílio-transporte.`,
    });
  }
  return linhas;
}
