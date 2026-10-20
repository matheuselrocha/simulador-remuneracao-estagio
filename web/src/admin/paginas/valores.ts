/**
 * Valores (bolsa e AT): histórico de vigências, novo valor com prévia de
 * impacto e correção de digitação só para vigência futura.
 */
import {
  NOMES_MESES,
  anoMesDe,
  formatarAnoMes,
  formatarData,
  formatarMoeda,
  paraCentavos,
  primeiroDia,
  vigenteEm,
  type AnoMes,
  type Parametros,
} from "@sgest/calc";
import { el } from "../../shared/dom.ts";
import { brutoSemAusencias, carregarDados, hojeISO, parametrosPublicados, type DadosPainel } from "../dados.ts";
import type { Pagina } from "../main.ts";
import { mensagemDeErro, supabase, type LinhaValorDb } from "../supabase.ts";
import { botao, confirmar, exigirNome, formatarDataHora, mensagem } from "../ui.ts";

const NOME_TIPO = { bolsa: "Bolsa de estágio (mensal)", at: "Auxílio-transporte (diário)" } as const;

function lerCentavos(texto: string): number | null {
  try {
    const c = paraCentavos(texto);
    return c > 0 ? c : null;
  } catch {
    return null;
  }
}

/** Texto da prévia: "Folha de novembro/2026: bruto passa de R$ X para R$ Y". */
function previaImpacto(p: Parametros, tipo: "bolsa" | "at", centavos: number, mes: AnoMes, idIgnorado?: number, valores?: LinhaValorDb[]): string {
  // Parâmetros "antes": sem o registro em correção (se houver)
  let antes = p;
  if (idIgnorado && valores) {
    const sem = valores.filter((v) => v.id !== idIgnorado);
    antes = {
      ...p,
      bolsa: sem.filter((v) => v.tipo === "bolsa").map((v) => ({ inicio: v.vigencia_inicio, centavos: v.valor_centavos })),
      at: sem.filter((v) => v.tipo === "at").map((v) => ({ inicio: v.vigencia_inicio, centavos: v.valor_centavos })),
    };
  }
  const inicio = primeiroDia(mes);
  const depois: Parametros =
    tipo === "bolsa"
      ? { ...antes, bolsa: [...antes.bolsa.filter((b) => b.inicio !== inicio), { inicio, centavos }] }
      : { ...antes, at: [...antes.at.filter((a) => a.inicio !== inicio), { inicio, centavos }] };
  const a = brutoSemAusencias(antes, mes);
  const d = brutoSemAusencias(depois, mes);
  if (!d) {
    const v = tipo === "bolsa" ? vigenteEm(antes.bolsa, mes) : vigenteEm(antes.at, mes);
    return `Folha de ${formatarAnoMes(mes)}: o calendário de ${mes.ano} ainda não está publicado, então o bruto não pode ser calculado. ` +
      `${tipo === "bolsa" ? "A bolsa" : "O AT diário"} passa de ${v ? formatarMoeda(v.centavos) : "—"} para ${formatarMoeda(centavos)}.`;
  }
  return `Folha de ${formatarAnoMes(mes)} (${d.diasUteis} dias úteis), estagiário sem ausências: bruto passa de ${a ? formatarMoeda(a.centavos) : "—"} para ${formatarMoeda(d.centavos)}.`;
}

function situacao(v: LinhaValorDb, todos: LinhaValorDb[], hoje: string): "Vigente" | "Futuro" | "Encerrado" {
  if (v.vigencia_inicio > hoje) return "Futuro";
  const atual = todos.filter((x) => x.tipo === v.tipo && x.vigencia_inicio <= hoje).sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0];
  return atual?.id === v.id ? "Vigente" : "Encerrado";
}

function seletorMes(prefixo: string, minimo: AnoMes, valor: AnoMes) {
  const mes = el("select", { id: `${prefixo}-mes` }, ...NOMES_MESES.map((n, i) => el("option", { value: String(i + 1) }, n)));
  const ano = el("select", { id: `${prefixo}-ano` }, ...[0, 1, 2, 3].map((k) => el("option", { value: String(minimo.ano + k) }, String(minimo.ano + k))));
  mes.value = String(valor.mes);
  ano.value = String(valor.ano);
  const ler = (): AnoMes => ({ ano: Number(ano.value), mes: Number(mes.value) });
  const bloco = el(
    "fieldset",
    { class: "campo campo--mes" },
    el("legend", {}, "Início da vigência (sempre o dia 1º)"),
    el("div", { class: "linha" }, el("label", { for: `${prefixo}-mes`, class: "sr-only" }, "Mês"), mes, el("label", { for: `${prefixo}-ano`, class: "sr-only" }, "Ano"), ano),
  );
  return { bloco, ler, mes, ano };
}

function proximoMesDe(hoje: string): AnoMes {
  const { ano, mes } = anoMesDe(hoje);
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

async function render(conteudo: HTMLElement) {
  const dados = await carregarDados();
  const p = parametrosPublicados(dados);
  const hoje = hojeISO();
  const mesAtual = anoMesDe(hoje);

  conteudo.replaceChildren(resumoVigentes(dados, hoje), formularioNovo(dados, p, hoje, mesAtual, conteudo), historico(dados, p, hoje, "bolsa", conteudo), historico(dados, p, hoje, "at", conteudo));
}

function resumoVigentes(d: DadosPainel, hoje: string) {
  const mes = anoMesDe(hoje);
  const p = parametrosPublicados(d);
  const bolsa = vigenteEm(p.bolsa, mes);
  const at = vigenteEm(p.at, mes);
  return el(
    "section",
    { class: "bloco resumo-vigentes", "aria-label": "Valores vigentes hoje" },
    el("div", { class: "kpi" }, el("p", { class: "kpi__rotulo" }, "Bolsa vigente"), el("p", { class: "kpi__valor" }, bolsa ? formatarMoeda(bolsa.centavos) : "—"), el("p", { class: "kpi__nota" }, bolsa ? `desde ${formatarData(bolsa.inicio)}` : "")),
    el("div", { class: "kpi" }, el("p", { class: "kpi__rotulo" }, "Auxílio-transporte vigente"), el("p", { class: "kpi__valor" }, at ? `${formatarMoeda(at.centavos)}/dia` : "—"), el("p", { class: "kpi__nota" }, at ? `desde ${formatarData(at.inicio)}` : "")),
  );
}

function formularioNovo(dados: DadosPainel, p: Parametros, hoje: string, mesAtual: AnoMes, conteudo: HTMLElement) {
  const tipo = el("select", { id: "novo-tipo" }, el("option", { value: "bolsa" }, NOME_TIPO.bolsa), el("option", { value: "at" }, NOME_TIPO.at));
  const valor = el("input", { id: "novo-valor", type: "text", inputmode: "decimal", placeholder: "ex.: 1.700,00", autocomplete: "off", "aria-describedby": "novo-valor-erro" });
  const erroValor = el("p", { id: "novo-valor-erro", class: "campo__erro", hidden: "" });
  const vig = seletorMes("novo-vig", mesAtual, proximoMesDe(hoje));
  const previa = el("p", { class: "previa", "aria-live": "polite" });
  const salvar = el("button", { type: "submit", class: "botao botao--primario" }, "Revisar e salvar");

  const atualizarPrevia = () => {
    const c = lerCentavos(valor.value);
    const mes = vig.ler();
    erroValor.hidden = true;
    valor.removeAttribute("aria-invalid");
    if (!valor.value.trim()) {
      previa.textContent = "Informe o valor para ver o impacto na folha.";
      return null;
    }
    if (c === null) {
      erroValor.hidden = false;
      erroValor.textContent = "Valor inválido: use um número positivo com até 2 casas decimais (ex.: 1.700,00).";
      valor.setAttribute("aria-invalid", "true");
      previa.textContent = "";
      return null;
    }
    if (primeiroDia(mes) < primeiroDia(mesAtual)) {
      previa.textContent = "A vigência não pode começar antes do mês atual.";
      return null;
    }
    const existente = dados.valores.find((v) => v.tipo === tipo.value && v.vigencia_inicio === primeiroDia(mes));
    if (existente) {
      previa.textContent = `Já existe ${tipo.value === "bolsa" ? "bolsa" : "AT"} com vigência em ${formatarAnoMes(mes)}. Use "Corrigir" no histórico.`;
      return null;
    }
    previa.textContent = previaImpacto(p, tipo.value as "bolsa" | "at", c, mes);
    return { c, mes };
  };
  for (const n of [tipo, valor, vig.mes, vig.ano]) n.addEventListener("input", atualizarPrevia);

  const form = el(
    "form",
    { class: "bloco form-grade", novalidate: "" },
    el("h2", {}, "Cadastrar novo valor"),
    el("p", { class: "campo__ajuda" }, "Um valor já vigente não é editado: cadastre o novo valor com a data em que ele passa a valer. Folhas anteriores continuam com o valor antigo."),
    el("div", { class: "campo" }, el("label", { for: "novo-tipo" }, "Tipo"), tipo),
    el("div", { class: "campo" }, el("label", { for: "novo-valor" }, "Valor (R$)"), valor, erroValor),
    vig.bloco,
    previa,
    el("div", { class: "acoes" }, salvar),
  );
  atualizarPrevia();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = atualizarPrevia();
    if (!ok) {
      valor.focus();
      return;
    }
    const nome = exigirNome();
    if (!nome) return;
    const t = tipo.value as "bolsa" | "at";
    const confirmado = await confirmar({
      titulo: "Confirmar novo valor",
      corpo: [
        el("dl", { class: "lista-definicao" }, el("dt", {}, "Tipo"), el("dd", {}, NOME_TIPO[t]), el("dt", {}, "Valor"), el("dd", {}, formatarMoeda(ok.c)), el("dt", {}, "Vigência"), el("dd", {}, `a partir de ${formatarData(primeiroDia(ok.mes))}`), el("dt", {}, "Responsável"), el("dd", {}, nome)),
        el("p", { class: "previa" }, previaImpacto(p, t, ok.c, ok.mes)),
      ],
      botao: "Salvar novo valor",
      caixa: "Confirmo que o valor e a data de vigência estão corretos.",
    });
    if (!confirmado) return;
    const { error } = await supabase.from("valores").insert({
      tipo: t,
      valor_centavos: ok.c,
      divisor: t === "bolsa" ? 30 : null, // exigido pela constraint do banco; o motor usa os dias do mês
      vigencia_inicio: primeiroDia(ok.mes),
      responsavel: nome,
    });
    if (error) return mensagem(mensagemDeErro(error), "erro");
    mensagem(`Novo valor cadastrado — ${NOME_TIPO[t]}: ${formatarMoeda(ok.c)} a partir de ${formatarData(primeiroDia(ok.mes))}.`);
    await render(conteudo);
  });
  return form;
}

function historico(dados: DadosPainel, p: Parametros, hoje: string, tipo: "bolsa" | "at", conteudo: HTMLElement) {
  const linhas = dados.valores.filter((v) => v.tipo === tipo);
  const corpo = el("tbody", {});
  for (const v of linhas) {
    const sit = situacao(v, dados.valores, hoje);
    const acoes = el("td", { class: "acoes-celula" });
    if (sit === "Futuro") {
      acoes.append(
        botao("Corrigir", "botao--pequeno botao--secundario", () => void corrigir(v, dados, p, hoje, conteudo), { "aria-label": `Corrigir ${formatarMoeda(v.valor_centavos)} de ${formatarData(v.vigencia_inicio)}` }),
        botao("Excluir", "botao--pequeno botao--perigo", () => void excluir(v, conteudo), { "aria-label": `Excluir ${formatarMoeda(v.valor_centavos)} de ${formatarData(v.vigencia_inicio)}` }),
      );
    } else {
      acoes.append(el("span", { class: "texto-suave" }, "—"));
    }
    corpo.append(
      el(
        "tr",
        {},
        el("td", { class: "num" }, formatarMoeda(v.valor_centavos)),
        el("td", {}, formatarData(v.vigencia_inicio)),
        el("td", {}, el("span", { class: `selo selo--${sit.toLowerCase()}` }, sit)),
        el("td", {}, v.responsavel),
        el("td", {}, formatarDataHora(v.criado_em) + (v.atualizado_em ? ` (corrigido em ${formatarDataHora(v.atualizado_em)})` : "")),
        acoes,
      ),
    );
  }
  return el(
    "section",
    { class: "bloco" },
    el("h2", {}, `Histórico — ${NOME_TIPO[tipo]}`),
    el(
      "div",
      { class: "tabela-rolagem" },
      el(
        "table",
        { class: "tabela" },
        el("thead", {}, el("tr", {}, ...["Valor", "Vigência a partir de", "Situação", "Cadastrado por", "Em", "Ações"].map((t) => el("th", { scope: "col" }, t)))),
        corpo,
      ),
    ),
  );
}

async function corrigir(v: LinhaValorDb, dados: DadosPainel, p: Parametros, hoje: string, conteudo: HTMLElement) {
  const nome = exigirNome();
  if (!nome) return;
  const valor = el("input", { id: "corrigir-valor", type: "text", inputmode: "decimal" });
  valor.value = (v.valor_centavos / 100).toFixed(2).replace(".", ",");
  const vig = seletorMes("corrigir-vig", proximoMesDe(hoje), anoMesDe(v.vigencia_inicio));
  const previa = el("p", { class: "previa", "aria-live": "polite" });
  const atualizar = () => {
    const c = lerCentavos(valor.value);
    previa.textContent = c ? previaImpacto(p, v.tipo, c, vig.ler(), v.id, dados.valores) : "Valor inválido.";
  };
  for (const n of [valor, vig.mes, vig.ano]) n.addEventListener("input", atualizar);
  atualizar();

  const ok = await confirmar({
    titulo: `Corrigir valor futuro (${v.tipo === "bolsa" ? "bolsa" : "AT"})`,
    corpo: [
      el("p", { class: "campo__ajuda" }, `Correção de digitação, permitida só para vigência futura. Valor atual: ${formatarMoeda(v.valor_centavos)} a partir de ${formatarData(v.vigencia_inicio)}. A alteração fica registrada na auditoria.`),
      el("div", { class: "campo" }, el("label", { for: "corrigir-valor" }, "Valor correto (R$)"), valor),
      vig.bloco,
      previa,
    ],
    botao: "Salvar correção",
    caixa: "Confirmo a correção deste valor futuro.",
  });
  if (!ok) return;
  const c = lerCentavos(valor.value);
  const mes = vig.ler();
  if (!c) return mensagem("Valor inválido: use um número positivo com até 2 casas decimais.", "erro");
  if (primeiroDia(mes) <= hoje) return mensagem("A correção só é permitida para uma vigência futura.", "erro");
  const { error } = await supabase
    .from("valores")
    .update({ valor_centavos: c, vigencia_inicio: primeiroDia(mes), responsavel: nome })
    .eq("id", v.id);
  if (error) return mensagem(mensagemDeErro(error), "erro");
  mensagem(`Valor corrigido para ${formatarMoeda(c)} a partir de ${formatarData(primeiroDia(mes))}.`);
  await render(conteudo);
}

async function excluir(v: LinhaValorDb, conteudo: HTMLElement) {
  const nome = exigirNome();
  if (!nome) return;
  const ok = await confirmar({
    titulo: "Excluir valor futuro",
    corpo: [el("p", {}, `Excluir ${v.tipo === "bolsa" ? "a bolsa" : "o AT"} de ${formatarMoeda(v.valor_centavos)} com vigência a partir de ${formatarData(v.vigencia_inicio)}? O valor anterior continua valendo. A exclusão fica na auditoria.`)],
    botao: "Excluir",
    perigo: true,
  });
  if (!ok) return;
  const { error } = await supabase.rpc("excluir_registro", { p_tabela: "valores", p_id: String(v.id), p_responsavel: nome });
  if (error) return mensagem(mensagemDeErro(error), "erro");
  mensagem("Valor futuro excluído.");
  await render(conteudo);
}

export const paginaValores: Pagina = { titulo: "Valores", render };
