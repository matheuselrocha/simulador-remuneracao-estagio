/**
 * Testes obrigatórios da seção 9 (1–16). Parâmetros: bolsa R$ 1.639,53,
 * AT R$ 13,50, calendário 2026 da planilha.
 */
import { describe, expect, it } from "vitest";
import {
  Calendario,
  dataFinalContrato,
  simularFolha,
  type GrupoExtrato,
  type ResultadoSimulacao,
} from "../src/index.ts";
import { DATAS_2026, ENTRADA_ANTIGA, comum, parametros2026 } from "./fixtures.ts";

function ok(r: ResultadoSimulacao) {
  if (!r.ok) throw new Error(`Esperava cálculo, veio erro: ${JSON.stringify(r.erros)}`);
  return r;
}
function totalGrupo(r: ResultadoSimulacao, grupo: GrupoExtrato, natureza: "credito" | "desconto", trecho: string) {
  return ok(r)
    .linhas.filter((l) => l.grupo === grupo && l.natureza === natureza && l.descricao.includes(trecho))
    .reduce((t, l) => t + l.centavos, 0);
}

const cal2026 = new Calendario({ anos: [2026], datasNaoUteis: DATAS_2026 });

describe("seção 9 — testes obrigatórios", () => {
  it("1. dias úteis de 2026, jan→dez", () => {
    const dias = Array.from({ length: 12 }, (_, i) => cal2026.diasUteisNoMes({ ano: 2026, mes: i + 1 }));
    expect(dias).toEqual([21, 17, 22, 18, 20, 19, 23, 21, 21, 20, 19, 20]);
  });

  it("2. folha set/2026, entrada 15/09/2026: 1ª folha proporcional, sem descontos", () => {
    const r = ok(simularFolha(comum("2026-09-15", 2026, 9), parametros2026()));
    // Equivale a bolsa − 765,11 e AT − 121,50 (9 dias úteis antes da entrada) da regra 4.3
    const [bolsa, at] = r.linhas;
    expect(bolsa!.descricao).toBe("Bolsa de estágio proporcional (de 15/09 a 30/09)");
    expect(bolsa!.conta).toBe("16 dias × (R$ 1.639,53 ÷ 30)");
    expect(bolsa!.centavos).toBe(163953 - 76511);
    expect(at!.conta).toBe("12 dias úteis × R$ 13,50");
    expect(at!.centavos).toBe(28350 - 12150);
    expect(r.descontosCentavos).toBe(0);
    expect(r.linhas.every((l) => l.natureza === "credito")).toBe(true);
    expect(r.liquidoCentavos).toBe(103642);
    expect(r.contexto.ehMesDeEntrada).toBe(true);
  });

  it("2b. entrada 20/09/2026 (domingo): 11 dias de bolsa e 8 dias úteis de AT", () => {
    const r = ok(simularFolha(comum("2026-09-20", 2026, 9), parametros2026()));
    expect(r.linhas.map((l) => l.conta)).toEqual(["11 dias × (R$ 1.639,53 ÷ 30)", "8 dias úteis × R$ 13,50"]);
    expect(r.liquidoCentavos).toBe(60116 + 10800);
  });

  it("2c. 1ª folha em mês de 31 dias: entrada 20/10/2026 → 12 dias × (bolsa ÷ 31)", () => {
    const r = ok(simularFolha(comum("2026-10-20", 2026, 10), parametros2026()));
    expect(r.linhas.map((l) => l.conta)).toEqual(["12 dias × (R$ 1.639,53 ÷ 31)", "8 dias úteis × R$ 13,50"]);
    expect(r.linhas[0]!.centavos).toBe(63466); // 634,657
  });

  it("2d. 1ª folha em fevereiro: entrada 20/02/2026 → 9 dias × (bolsa ÷ 28)", () => {
    const r = ok(simularFolha(comum("2026-02-20", 2026, 2), parametros2026()));
    expect(r.linhas.map((l) => l.conta)).toEqual(["9 dias × (R$ 1.639,53 ÷ 28)", "6 dias úteis × R$ 13,50"]);
    expect(r.linhas[0]!.centavos).toBe(52699); // 526,99
  });

  it("3. folha set/2026, entrada antiga, agosto sem ausências", () => {
    const r = ok(simularFolha(comum(ENTRADA_ANTIGA, 2026, 9), parametros2026()));
    expect(r.liquidoCentavos).toBe(192303);
    expect(r.descontosCentavos).toBe(0);
  });

  it("4. idem, agosto com 4 dias de remoto autorizado", () => {
    const r = ok(simularFolha(comum(ENTRADA_ANTIGA, 2026, 9, { diasNaoPresenciais: 4, faltasInjustificadas: 0 }), parametros2026()));
    expect(totalGrupo(r, "mes-anterior", "desconto", "auxílio")).toBe(5400);
    expect(totalGrupo(r, "mes-anterior", "desconto", "bolsa")).toBe(0);
    expect(r.liquidoCentavos).toBe(186903);
  });

  it("5. idem, agosto com 3 dias não presenciais, todos injustificados (bolsa diária de agosto = ÷ 31)", () => {
    const r = ok(simularFolha(comum(ENTRADA_ANTIGA, 2026, 9, { diasNaoPresenciais: 3, faltasInjustificadas: 3 }), parametros2026()));
    const bolsa = r.linhas.find((l) => l.grupo === "mes-anterior" && l.descricao.includes("bolsa"))!;
    // Regra atual: bolsa diária varia com os dias do mês. 3 × 1639,53/31 = 158,664 → 158,66
    // (a especificação original usava ÷ 30: 163,95 e líquido 1.718,58)
    expect(bolsa.centavos).toBe(15866);
    expect(bolsa.conta).toBe("3 dias × (R$ 1.639,53 ÷ 31)");
    expect(totalGrupo(r, "mes-anterior", "desconto", "auxílio")).toBe(4050);
    expect(r.liquidoCentavos).toBe(192303 - 15866 - 4050);
  });

  it("5b. faltas de setembro (30 dias) usam ÷ 30 e de fevereiro (28 dias) usam ÷ 28", () => {
    const out = ok(simularFolha(comum(ENTRADA_ANTIGA, 2026, 10, { diasNaoPresenciais: 1, faltasInjustificadas: 1 }), parametros2026()));
    expect(out.linhas.find((l) => l.descricao.includes("Faltas"))!.conta).toBe("1 dia × (R$ 1.639,53 ÷ 30)");
    expect(out.linhas.find((l) => l.descricao.includes("Faltas"))!.centavos).toBe(5465);
    const mar = ok(simularFolha(comum(ENTRADA_ANTIGA, 2026, 3, { diasNaoPresenciais: 1, faltasInjustificadas: 1 }), parametros2026()));
    expect(mar.linhas.find((l) => l.descricao.includes("Faltas"))!.conta).toBe("1 dia × (R$ 1.639,53 ÷ 28)");
    expect(mar.linhas.find((l) => l.descricao.includes("Faltas"))!.centavos).toBe(5855); // 58,554
  });

  it("6. entrada no dia 1º do mês: bolsa e AT integrais", () => {
    const r = ok(simularFolha(comum("2026-09-01", 2026, 9), parametros2026()));
    expect(r.linhas.map((l) => l.descricao)).toEqual(["Bolsa de estágio", "Auxílio-transporte de setembro"]);
    expect(r.liquidoCentavos).toBe(192303);
  });

  it("7. folha out/2026, entrada 15/09/2026: máximo de dias não presenciais de setembro = 12", () => {
    const r = simularFolha(comum("2026-09-15", 2026, 10), parametros2026());
    expect(r.contexto!.mesAnteriorEhEntrada).toBe(true);
    expect(r.contexto!.maxNaoPresenciaisMesAnterior).toBe(12);
    const acima = simularFolha(comum("2026-09-15", 2026, 10, { diasNaoPresenciais: 13, faltasInjustificadas: 0 }), parametros2026());
    expect(acima.ok).toBe(false);
    expect(!acima.ok && acima.erros[0]!.codigo).toBe("acima-do-maximo");
    expect(simularFolha(comum("2026-09-15", 2026, 10, { diasNaoPresenciais: 12, faltasInjustificadas: 0 }), parametros2026()).ok).toBe(true);
  });

  it("8. depósito da folha set/2026 → 07/10/2026", () => {
    expect(ok(simularFolha(comum(ENTRADA_ANTIGA, 2026, 9), parametros2026())).contexto.dataDeposito).toBe("2026-10-07");
  });

  it("9. depósito da folha out/2026 → 09/11/2026 (02/11 é feriado)", () => {
    expect(cal2026.dataDeposito({ ano: 2026, mes: 10 })).toBe("2026-11-09");
  });

  it("10. desligamento com 2 anos completos, folha set/2026 (regras de férias de 23/10/2026)", () => {
    // A especificação original somava 30 dias de recesso indenizado (líquido 3.467,41).
    // Regra confirmada: quem completa 2 anos usufrui as últimas férias nos 30 dias finais
    // (01/09 a 30/09/2026): bolsa normal, sem AT nesses dias, nada em pecúnia.
    const entrada = (situacao: "tirou" | "nao-tirou" | "junto-com-ultimas", agosto = 2) => ({
      dataEntrada: "2024-10-01",
      folha: { ano: 2026, mes: 9 },
      modo: "desligamento" as const,
      mesAnterior: { diasNaoPresenciais: agosto, faltasInjustificadas: 0 },
      desligamento: { dataSaida: "2026-09-30", mesAtual: { diasNaoPresenciais: 0, faltasInjustificadas: 0 }, primeirasFerias: { situacao } },
    });
    const tirou = ok(simularFolha(entrada("tirou"), parametros2026()));
    expect(tirou.contexto.opcoesPrimeirasFerias).toEqual(["tirou", "nao-tirou", "junto-com-ultimas"]);
    expect(tirou.contexto.periodosFerias).toEqual([{ inicio: "2026-09-01", fim: "2026-09-30", descricao: "últimas férias" }]);
    expect(tirou.linhas.find((l) => l.descricao.startsWith("Auxílio-transporte"))!.conta).toBe("não devido: 21 dias úteis de férias");
    expect(totalGrupo(tirou, "ferias", "credito", "")).toBe(0);
    expect(tirou.liquidoCentavos).toBe(163953 - 2700);
    expect(tirou.avisos.map((a) => a.codigo)).toContain("info-ultimas-ferias");
    expect(tirou.contexto.maxNaoPresenciaisMesAtual).toBe(0);

    const naoTirou = ok(simularFolha(entrada("nao-tirou"), parametros2026()));
    expect(naoTirou.linhas.filter((l) => l.grupo === "ferias").map((l) => [l.descricao, l.centavos])).toEqual([
      ["Primeiras férias não usufruídas (usufruiu só as últimas)", 163953],
    ]);

    // Primeiras + últimas seguidas: 02/08 a 30/09. AT de agosto pago adiantado é descontado.
    const junto = ok(simularFolha(entrada("junto-com-ultimas", 0), parametros2026()));
    expect(junto.contexto.diasUteisFeriasMesAnterior).toBe(21);
    expect(junto.linhas.find((l) => l.descricao.startsWith("Dias de férias em agosto"))!.centavos).toBe(21 * 1350);
    expect(junto.liquidoCentavos).toBe(163953 - 21 * 1350);
    expect(junto.contexto.maxNaoPresenciaisMesAnterior).toBe(0);
  });

  it("11. data final: entrada 15/09/2026 → 14/09/2028 (a planilha dava 13/09)", () => {
    expect(dataFinalContrato("2026-09-15")).toBe("2028-09-14");
  });

  it("12. folha jan/2026 (dez/2025 sem calendário): não quebra e avisa", () => {
    const r = ok(simularFolha(comum(ENTRADA_ANTIGA, 2026, 1, { diasNaoPresenciais: 2, faltasInjustificadas: 0 }), parametros2026()));
    expect(r.contexto.maxNaoPresenciaisMesAnterior).toBeNull();
    expect(r.avisos.map((a) => a.codigo)).toContain("calendario-mes-anterior-indisponivel");
    expect(r.liquidoCentavos).toBe(163953 + 21 * 1350 - 2 * 1350);
  });

  it("13. faltas injustificadas > dias não presenciais: erro, sem cálculo", () => {
    const r = simularFolha(comum(ENTRADA_ANTIGA, 2026, 9, { diasNaoPresenciais: 2, faltasInjustificadas: 3 }), parametros2026());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erros.map((e) => [e.campo, e.codigo])).toEqual([["mesAnterior.faltasInjustificadas", "faltas-maior-que-nao-presenciais"]]);
    expect("liquidoCentavos" in r).toBe(false);
  });

  const reajuste = () =>
    parametros2026({
      bolsa: [
        { inicio: "2026-01-01", centavos: 163953 },
        { inicio: "2026-11-01", centavos: 170000 },
      ],
    });

  it("14. bolsa reajustada a partir de 01/11/2026; folha out/2026 ainda usa 1.639,53", () => {
    const r = ok(simularFolha(comum(ENTRADA_ANTIGA, 2026, 10), reajuste()));
    expect(r.linhas.find((l) => l.descricao === "Bolsa de estágio")!.centavos).toBe(163953);
    expect(r.liquidoCentavos).toBe(163953 + 20 * 1350);
  });

  it("15. mesmo reajuste; folha nov/2026 sem ausências → 1.956,50", () => {
    const r = ok(simularFolha(comum(ENTRADA_ANTIGA, 2026, 11), reajuste()));
    expect(r.contexto.diasUteisFolha).toBe(19);
    expect(r.liquidoCentavos).toBe(195650);
  });

  it("16. ponto facultativo em 30/10/2026 (sexta): outubro passa de 20 para 19 dias úteis", () => {
    const antes = new Calendario({ anos: [2026], datasNaoUteis: DATAS_2026 });
    const depois = new Calendario({ anos: [2026], datasNaoUteis: [...DATAS_2026, "2026-10-30"] });
    expect(antes.diasUteisNoMes({ ano: 2026, mes: 10 })).toBe(20);
    expect(depois.diasUteisNoMes({ ano: 2026, mes: 10 })).toBe(19);
  });
});
