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

export interface DadosDesligamento {
  /** Último dia do estágio (inclusive). Deve cair no mês da folha. */
  dataSaida: DataISO;
  /** Ausências do próprio mês do desligamento. */
  mesAtual: AusenciasMes;
  /** Checkbox "não tirei o recesso do 1º ano" (regra provisória 4.6.2). */
  naoGozouRecessoPrimeiroAno: boolean;
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

export type GrupoExtrato = "mes-da-folha" | "mes-anterior" | "mes-atual" | "recesso";

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
  | "desligamento.mesAtual.faltasInjustificadas";

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
    | "saida-apos-fim-do-contrato";
  mensagem: string;
}

export interface Aviso {
  codigo:
    | "calendario-mes-anterior-indisponivel"
    | "calendario-deposito-indisponivel"
    | "regra-fracao-mes-recesso"
    | "regra-recesso-primeiro-ano"
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
  /** Mostra o checkbox "não tirei o recesso do 1º ano". */
  podeInformarRecessoPrimeiroAno: boolean;
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
  recesso: "Recesso indenizado",
};

// ───────────────────────────── Implementação ─────────────────────────────

const contaBolsaDiaria = (b: ValorBolsa) => `(${formatarMoeda(b.centavos)} ÷ ${b.divisor})`;

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
      conta: `${diasCorridos(a.faltasInjustificadas)} × ${contaBolsaDiaria(bolsa)}`,
      centavos: multiplicarArredondado(a.faltasInjustificadas, bolsa.centavos, bolsa.divisor),
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
    podeInformarRecessoPrimeiroAno: false,
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

  // ── Validação do mês anterior ──
  if (!ehMesDeEntrada) {
    validarAusencias(
      entrada.mesAnterior,
      contexto.maxNaoPresenciaisMesAnterior,
      nomeMes(mesAnt.mes),
      { naoPresenciais: "mesAnterior.diasNaoPresenciais", faltas: "mesAnterior.faltasInjustificadas" },
      erros,
    );
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
      contexto.maxNaoPresenciaisMesAtual = cal.diasUteisEntre(inicioMes, fimCredito);
      const meses = mesesCompletos(dataEntrada, saida).meses;
      contexto.podeInformarRecessoPrimeiroAno = meses >= 12 && saida < contexto.dataFinalContrato!;
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

  if (erros.length > 0) return { ok: false, contexto, erros, avisos };

  // ───────────────────────────── Cálculo ─────────────────────────────
  const linhas: LinhaExtrato[] = [];

  // Créditos do mês. Mês cheio: bolsa integral + AT de todos os dias úteis.
  // 1ª folha (regra 4.3) e/ou desligamento no meio do mês (4.6.3): bolsa e AT
  // proporcionais ao período de vínculo no mês — sem linhas de desconto.
  // Bolsa proporcional em mês comercial de 30 dias: paga min(dia final, 30) − (dia inicial − 1)
  // dias × bolsa ÷ 30 — o mesmo valor de "bolsa − (dia de entrada − 1) × bolsa ÷ 30" da regra 4.3.
  const inicioCredito = ehMesDeEntrada ? dataEntrada : primeiroDia(folha);
  if (inicioCredito === primeiroDia(folha) && fimCredito === ultimoDia(folha)) {
    linhas.push({
      grupo: "mes-da-folha",
      natureza: "credito",
      descricao: "Bolsa de estágio",
      conta: "valor mensal",
      centavos: bolsaM.centavos,
    });
    linhas.push({
      grupo: "mes-da-folha",
      natureza: "credito",
      descricao: `Auxílio-transporte de ${nomeMes(folha.mes)}`,
      conta: `${diasUteis(contexto.diasUteisFolha)} × ${formatarMoeda(atM.centavos)}`,
      centavos: multiplicarArredondado(contexto.diasUteisFolha, atM.centavos),
    });
  } else {
    const diaInicio = partes(inicioCredito).dia;
    const diaFim = partes(fimCredito).dia;
    const diasBolsa = Math.max(0, Math.min(diaFim, bolsaM.divisor) - (diaInicio - 1));
    const periodo = `de ${formatarData(inicioCredito).slice(0, 5)} a ${formatarData(fimCredito).slice(0, 5)}`;
    linhas.push({
      grupo: "mes-da-folha",
      natureza: "credito",
      descricao: `Bolsa de estágio proporcional (${periodo})`,
      conta: `${diasCorridos(diasBolsa)} × ${contaBolsaDiaria(bolsaM)}`,
      centavos: multiplicarArredondado(diasBolsa, bolsaM.centavos, bolsaM.divisor),
    });
    const du = cal.diasUteisEntre(inicioCredito, fimCredito);
    linhas.push({
      grupo: "mes-da-folha",
      natureza: "credito",
      descricao: `Auxílio-transporte proporcional (${periodo})`,
      conta: `${diasUteis(du)} × ${formatarMoeda(atM.centavos)}`,
      centavos: multiplicarArredondado(du, atM.centavos),
    });
    if (fimCredito < ultimoDia(folha)) {
      avisos.push({
        codigo: "regra-desligamento-meio-do-mes",
        regraAConfirmar: true,
        mensagem:
          "Desligamento antes do fim do mês: a bolsa foi calculada por dias corridos até a saída (÷ 30) e o auxílio-transporte pelos dias úteis até a saída.",
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
    linhas.push(...linhasAusencias("mes-anterior", mesAnt, a, bolsaAnt, atAnt));
  }

  // Desligamento (regra 4.5)
  if (deslig) {
    linhas.push(...linhasAusencias("mes-atual", folha, deslig.mesAtual, bolsaM, atM));
    linhas.push(...linhasRecesso(dataEntrada, deslig, contexto, bolsaM, regras, avisos));
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

/** Dias de recesso indenizado (regra 4.5 + provisórias 4.6.1 e 4.6.2). */
export function calcularDiasRecesso(
  dataEntrada: DataISO,
  dataSaida: DataISO,
  naoGozouRecessoPrimeiroAno: boolean,
  regras: RegrasProvisorias = REGRAS_PADRAO,
): { dias: number; mesesNoPeriodo: number; completouDoisAnos: boolean; fracaoIgnorada: boolean; somouPrimeiroAno: boolean } {
  const completouDoisAnos = dataSaida >= dataFinalContrato(dataEntrada);
  if (completouDoisAnos) {
    return { dias: 30, mesesNoPeriodo: 12, completouDoisAnos, fracaoIgnorada: false, somouPrimeiroAno: false };
  }
  const mesesContrato = mesesCompletos(dataEntrada, dataSaida).meses;
  const inicioPeriodo = mesesContrato >= 12 ? somarAnos(dataEntrada, 1) : dataEntrada;
  let { meses, diasRestantes } = mesesCompletos(inicioPeriodo, dataSaida);
  let fracaoIgnorada = false;
  if (diasRestantes > 0) {
    if (regras.fracaoMesRecesso === "fracao-15-dias-conta-mes" && diasRestantes >= 15) meses++;
    else fracaoIgnorada = true;
  }
  let dias = meses * 2.5;
  const somouPrimeiroAno =
    naoGozouRecessoPrimeiroAno && mesesContrato >= 12 && regras.recessoPrimeiroAnoNaoGozado === "soma-30-dias-se-marcado";
  if (somouPrimeiroAno) dias += 30;
  return { dias, mesesNoPeriodo: meses, completouDoisAnos, fracaoIgnorada, somouPrimeiroAno };
}

function linhasRecesso(
  dataEntrada: DataISO,
  deslig: DadosDesligamento,
  contexto: ContextoFolha,
  bolsa: ValorBolsa,
  regras: RegrasProvisorias,
  avisos: Aviso[],
): LinhaExtrato[] {
  const r = calcularDiasRecesso(
    dataEntrada,
    deslig.dataSaida,
    deslig.naoGozouRecessoPrimeiroAno && contexto.podeInformarRecessoPrimeiroAno,
    regras,
  );
  if (r.fracaoIgnorada) {
    avisos.push({
      codigo: "regra-fracao-mes-recesso",
      regraAConfirmar: true,
      mensagem: "O recesso proporcional considerou só os meses completos do período aquisitivo; a fração de mês ficou de fora.",
    });
  }
  if (r.somouPrimeiroAno) {
    avisos.push({
      codigo: "regra-recesso-primeiro-ano",
      regraAConfirmar: true,
      mensagem: "Foram somados 30 dias pelo recesso do 1º ano não gozado.",
    });
  }
  if (r.dias === 0) return [];
  const proporcional = r.completouDoisAnos ? "2 anos completos" : `${r.mesesNoPeriodo} ${r.mesesNoPeriodo === 1 ? "mês completo" : "meses completos"} × 2,5 dias`;
  const linhas: LinhaExtrato[] = [];
  const diasPeriodo = r.dias - (r.somouPrimeiroAno ? 30 : 0);
  if (diasPeriodo > 0) {
    linhas.push({
      grupo: "recesso",
      natureza: "credito",
      descricao: `Recesso indenizado (${proporcional})`,
      conta: `${formatarDias(diasPeriodo)} × ${contaBolsaDiaria(bolsa)}`,
      centavos: multiplicarArredondado(diasPeriodo, bolsa.centavos, bolsa.divisor),
    });
  }
  if (r.somouPrimeiroAno) {
    linhas.push({
      grupo: "recesso",
      natureza: "credito",
      descricao: "Recesso do 1º ano não gozado",
      conta: `30 dias × ${contaBolsaDiaria(bolsa)}`,
      centavos: multiplicarArredondado(30, bolsa.centavos, bolsa.divisor),
    });
  }
  return linhas;
}
