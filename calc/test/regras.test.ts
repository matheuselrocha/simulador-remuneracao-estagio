/** Casos além da seção 9: validações, bordas de datas e regras provisórias (4.6). */
import { describe, expect, it } from "vitest";
import {
  REGRAS_PADRAO,
  calcularDiasRecesso,
  dataFinalContrato,
  formatarData,
  formatarMoeda,
  mesesCompletos,
  multiplicarArredondado,
  paraCentavos,
  simularFolha,
  somarMeses,
  type EntradaSimulacao,
} from "../src/index.ts";
import { ENTRADA_ANTIGA, SEM_AUSENCIAS, comum, parametros2026 } from "./fixtures.ts";

describe("dinheiro e formatação", () => {
  it("arredonda half-up sobre o produto total", () => {
    expect(multiplicarArredondado(1, 163953, 30)).toBe(5465); // 54,651
    expect(multiplicarArredondado(14, 163953, 30)).toBe(76511); // 765,114
    expect(multiplicarArredondado(1, 5, 10)).toBe(1); // 0,5 → 1
    expect(multiplicarArredondado(2.5, 163953, 30)).toBe(13663); // 136,6275
    expect(() => multiplicarArredondado(0.3, 100)).toThrow();
  });
  it("converte e formata valores pt-BR", () => {
    expect(paraCentavos("1639.53")).toBe(163953);
    expect(paraCentavos("1.639,53")).toBe(163953);
    expect(paraCentavos("13,5")).toBe(1350);
    expect(() => paraCentavos("13,505")).toThrow();
    expect(formatarMoeda(163953)).toBe("R$ 1.639,53");
    expect(formatarMoeda(5)).toBe("R$ 0,05");
    expect(formatarMoeda(123456789)).toBe("R$ 1.234.567,89");
    expect(formatarData("2026-10-07")).toBe("07/10/2026");
  });
});

describe("datas", () => {
  it("data final do contrato usa aritmética de datas (bissexto)", () => {
    expect(dataFinalContrato("2024-02-29")).toBe("2026-02-28");
    expect(dataFinalContrato("2027-03-01")).toBe("2029-02-28");
    expect(dataFinalContrato("2026-01-01")).toBe("2027-12-31");
  });
  it("soma meses com dia inexistente avançando para o dia 1º", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-03-01");
    expect(somarMeses("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("conta meses completos", () => {
    expect(mesesCompletos("2026-03-15", "2026-04-14")).toEqual({ meses: 1, diasRestantes: 0 });
    expect(mesesCompletos("2026-03-15", "2026-04-20")).toEqual({ meses: 1, diasRestantes: 6 });
    expect(mesesCompletos("2026-03-15", "2026-04-13").meses).toBe(0);
  });
});

describe("validações", () => {
  it("rejeita entrada posterior ao mês da folha (bug 4 da planilha)", () => {
    const r = simularFolha(comum("2026-10-05", 2026, 9), parametros2026());
    expect(!r.ok && r.erros[0]!.codigo).toBe("entrada-posterior-a-folha");
  });
  it("ano sem calendário publicado: erro claro", () => {
    const r = simularFolha(comum(ENTRADA_ANTIGA, 2027, 3), parametros2026());
    expect(!r.ok && r.erros[0]!.codigo).toBe("calendario-indisponivel");
  });
  it("dias não presenciais acima dos dias úteis do mês anterior", () => {
    const r = simularFolha(comum(ENTRADA_ANTIGA, 2026, 9, { diasNaoPresenciais: 22, faltasInjustificadas: 0 }), parametros2026());
    expect(!r.ok && r.erros[0]!.codigo).toBe("acima-do-maximo");
  });
  it("números negativos ou fracionários", () => {
    const r = simularFolha(comum(ENTRADA_ANTIGA, 2026, 9, { diasNaoPresenciais: -1, faltasInjustificadas: 1.5 }), parametros2026());
    expect(!r.ok && r.erros.map((e) => e.codigo)).toEqual(["numero-invalido", "numero-invalido"]);
  });
  it("no mês de entrada, ausências do mês anterior são ignoradas", () => {
    const r = simularFolha(comum("2026-09-15", 2026, 9, { diasNaoPresenciais: 99, faltasInjustificadas: 99 }), parametros2026());
    expect(r.ok && r.liquidoCentavos).toBe(103642);
  });
  it("folha de dezembro/2026 sem calendário de 2027: calcula e avisa sobre o depósito", () => {
    const r = simularFolha(comum(ENTRADA_ANTIGA, 2026, 12), parametros2026());
    expect(r.ok).toBe(true);
    expect(r.contexto!.dataDeposito).toBeNull();
    expect(r.avisos.map((a) => a.codigo)).toContain("calendario-deposito-indisponivel");
  });
  it("feriado em fim de semana não tem efeito (15/11/2026, domingo)", () => {
    const r = simularFolha(comum(ENTRADA_ANTIGA, 2026, 11), parametros2026());
    expect(r.contexto!.diasUteisFolha).toBe(19);
  });
});

describe("regra provisória 4.6.4 — reajuste do AT entre M−1 e M", () => {
  const params = parametros2026({
    at: [
      { inicio: "2026-01-01", centavos: 1350 },
      { inicio: "2026-10-01", centavos: 1500 },
    ],
  });
  const entrada = comum(ENTRADA_ANTIGA, 2026, 10, { diasNaoPresenciais: 2, faltasInjustificadas: 0 });
  it("padrão: desconta com o valor vigente em M−1 e avisa", () => {
    const r = simularFolha(entrada, params);
    expect(r.ok && r.linhas.find((l) => l.grupo === "mes-anterior")!.centavos).toBe(2700);
    expect(r.avisos.find((a) => a.codigo === "regra-valor-desconto-mes-anterior")?.regraAConfirmar).toBe(true);
  });
  it("alternativa: valor vigente em M", () => {
    const r = simularFolha(entrada, params, { ...REGRAS_PADRAO, valorDescontoMesAnterior: "vigente-em-M" });
    expect(r.ok && r.linhas.find((l) => l.grupo === "mes-anterior")!.centavos).toBe(3000);
  });
  it("sem ausências não há aviso", () => {
    const r = simularFolha(comum(ENTRADA_ANTIGA, 2026, 10), params);
    expect(r.avisos).toEqual([]);
  });
});

describe("desligamento e recesso (4.5 e 4.6.1–4.6.3)", () => {
  const deslig = (dataEntrada: string, dataSaida: string, naoGozou = false, mes = 9): EntradaSimulacao => ({
    dataEntrada,
    folha: { ano: 2026, mes },
    modo: "desligamento",
    mesAnterior: SEM_AUSENCIAS,
    desligamento: { dataSaida, mesAtual: SEM_AUSENCIAS, naoGozouRecessoPrimeiroAno: naoGozou },
  });

  it("menos de 1 ano: 2,5 dias por mês completo, fração ignorada com aviso", () => {
    // 01/03/2026 a 20/09/2026: 6 meses completos + fração
    const d = calcularDiasRecesso("2026-03-01", "2026-09-20", false);
    expect(d).toMatchObject({ dias: 15, mesesNoPeriodo: 6, fracaoIgnorada: true });
    const alt = calcularDiasRecesso("2026-03-01", "2026-09-20", false, { ...REGRAS_PADRAO, fracaoMesRecesso: "fracao-15-dias-conta-mes" });
    expect(alt.dias).toBe(17.5);
  });

  it("entre 12 e 24 meses: só o período aquisitivo em aberto; checkbox soma 30", () => {
    // entrada 01/03/2025, saída 31/08/2026: 2º período de 01/03/2026 a 31/08/2026 = 6 meses
    expect(calcularDiasRecesso("2025-03-01", "2026-08-31", false)).toMatchObject({ dias: 15, fracaoIgnorada: false });
    expect(calcularDiasRecesso("2025-03-01", "2026-08-31", true)).toMatchObject({ dias: 45, somouPrimeiroAno: true });
  });

  it("checkbox ignorado com menos de 12 meses", () => {
    expect(calcularDiasRecesso("2026-03-01", "2026-08-31", true).dias).toBe(15);
    const r = simularFolha(deslig("2026-03-01", "2026-09-30", true), parametros2026());
    expect(r.contexto!.podeInformarRecessoPrimeiroAno).toBe(false);
    expect(r.ok && r.linhas.filter((l) => l.grupo === "recesso").length).toBe(1);
  });

  it("desligamento no meio do mês: bolsa por dias corridos e AT por dias úteis até a saída", () => {
    // saída 18/09/2026 (sexta): 18 dias corridos; dias úteis 01–18/09 = 13 (07/09 feriado)
    const r = simularFolha(deslig("2025-03-01", "2026-09-18"), parametros2026());
    if (!r.ok) throw new Error(JSON.stringify(r.erros));
    const [bolsa, at] = r.linhas.filter((l) => l.grupo === "mes-da-folha");
    expect(bolsa!.centavos).toBe(multiplicarArredondado(18, 163953, 30));
    expect(at!.conta).toBe("13 dias úteis × R$ 13,50");
    expect(r.contexto.maxNaoPresenciaisMesAtual).toBe(13);
    expect(r.avisos.map((a) => a.codigo)).toContain("regra-desligamento-meio-do-mes");
  });

  it("valida a data de saída", () => {
    const fora = simularFolha(deslig(ENTRADA_ANTIGA, "2026-10-02"), parametros2026());
    expect(!fora.ok && fora.erros[0]!.codigo).toBe("saida-fora-do-mes");
    const alem = simularFolha(deslig("2024-09-10", "2026-09-20"), parametros2026());
    expect(!alem.ok && alem.erros[0]!.codigo).toBe("saida-apos-fim-do-contrato");
  });

  it("ausências do mês atual respeitam o limite até a saída", () => {
    const e = deslig("2025-03-01", "2026-09-18");
    e.desligamento!.mesAtual = { diasNaoPresenciais: 14, faltasInjustificadas: 0 };
    const r = simularFolha(e, parametros2026());
    expect(!r.ok && r.erros[0]!.campo).toBe("desligamento.mesAtual.diasNaoPresenciais");
  });
});
