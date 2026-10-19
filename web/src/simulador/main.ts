/**
 * Simulador público. Tudo é calculado no navegador; o único tráfego de rede
 * é a leitura (GET) dos parâmetros publicados. Nenhum dado do estagiário
 * sai da página nem é guardado (sem cookies, sem storage, sem analytics).
 */
import "../styles/index.css";
import {
  Calendario,
  NOMES_MESES,
  TITULOS_GRUPOS,
  formatarAnoMes,
  formatarData,
  formatarMoeda,
  mesAnterior,
  nomeMes,
  primeiroDia,
  proximoMes,
  simularFolha,
  ultimoDia,
  vigenteEm,
  type AnoMes,
  type CampoEntrada,
  type ContextoFolha,
  type EntradaSimulacao,
  type GrupoExtrato,
  type Parametros,
  type ResultadoSimulacao,
} from "@sgest/calc";
import { carregarParametros, type OrigemParametros } from "../shared/carregar-parametros.ts";
import { el, escapar } from "../shared/dom.ts";

// ───────────────────────── Elementos ─────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const campos = {
  dataEntrada: $<HTMLInputElement>("data-entrada"),
  folha: $<HTMLSelectElement>("folha"),
  modoComum: $<HTMLInputElement>("modo-comum"),
  modoDeslig: $<HTMLInputElement>("modo-desligamento"),
  dataSaida: $<HTMLInputElement>("data-saida"),
  antNaoPres: $<HTMLInputElement>("ant-nao-presenciais"),
  antFaltas: $<HTMLInputElement>("ant-faltas"),
  atualNaoPres: $<HTMLInputElement>("atual-nao-presenciais"),
  atualFaltas: $<HTMLInputElement>("atual-faltas"),
  recesso1oAno: $<HTMLInputElement>("recesso-1o-ano"),
};

/** Campo do motor → id do input (o erro fica em `${id}-erro`). */
const INPUT_DO_CAMPO: Record<CampoEntrada, string> = {
  dataEntrada: "data-entrada",
  folha: "folha",
  "mesAnterior.diasNaoPresenciais": "ant-nao-presenciais",
  "mesAnterior.faltasInjustificadas": "ant-faltas",
  "desligamento.dataSaida": "data-saida",
  "desligamento.mesAtual.diasNaoPresenciais": "atual-nao-presenciais",
  "desligamento.mesAtual.faltasInjustificadas": "atual-faltas",
};

let parametros: Parametros;
let calendario: Calendario;

// ───────────────────────── Leitura do formulário ─────────────────────────

function lerFolha(): AnoMes | null {
  const [a, m] = campos.folha.value.split("-").map(Number);
  return a && m ? { ano: a, mes: m } : null;
}

/** Campo vazio = 0. Texto inválido vira NaN e o motor acusa "número inválido". */
function lerDias(input: HTMLInputElement): number {
  const v = input.value.trim();
  if (v === "") return 0;
  return input.validity.badInput ? Number.NaN : Number(v);
}

function modo(): "comum" | "desligamento" {
  return campos.modoDeslig.checked ? "desligamento" : "comum";
}

function lerEntrada(folha: AnoMes): EntradaSimulacao {
  return {
    dataEntrada: campos.dataEntrada.value,
    folha,
    modo: modo(),
    mesAnterior: { diasNaoPresenciais: lerDias(campos.antNaoPres), faltasInjustificadas: lerDias(campos.antFaltas) },
    desligamento:
      modo() === "desligamento"
        ? {
            dataSaida: campos.dataSaida.value,
            mesAtual: { diasNaoPresenciais: lerDias(campos.atualNaoPres), faltasInjustificadas: lerDias(campos.atualFaltas) },
            naoGozouRecessoPrimeiroAno: campos.recesso1oAno.checked,
          }
        : undefined,
  };
}

// ───────────────────────── Preparação ─────────────────────────

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function preencherMeses() {
  const anos = [...parametros.calendario.anos].sort();
  campos.folha.replaceChildren();
  if (anos.length === 0) {
    campos.folha.append(el("option", { value: "" }, "Nenhum calendário publicado"));
    campos.folha.disabled = true;
    return;
  }
  for (const ano of anos) {
    const grupo = el("optgroup", { label: String(ano) });
    NOMES_MESES.forEach((nome, i) => {
      grupo.append(el("option", { value: `${ano}-${String(i + 1).padStart(2, "0")}` }, `${nome}/${ano}`));
    });
    campos.folha.append(grupo);
  }
  // Padrão: mês atual, se o ano estiver publicado; senão o mês publicado mais próximo.
  const hoje = hojeLocal().slice(0, 7);
  const valores = [...campos.folha.options].map((o) => o.value);
  campos.folha.value = valores.includes(hoje) ? hoje : hoje < valores[0]! ? valores[0]! : valores[valores.length - 1]!;
}

function avisoParametros(origem: OrigemParametros) {
  const aviso = $("aviso-parametros");
  if (origem.tipo === "banco") return;
  aviso.hidden = false;
  aviso.textContent =
    `Não foi possível carregar os valores atualizados agora; o simulador está usando uma cópia de ` +
    `${formatarData(origem.geradoEm.slice(0, 10))}. Os valores podem estar desatualizados.`;
}

// ───────────────────────── Atualização da tela ─────────────────────────

function diasUteisTexto(n: number) {
  return `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
}

/**
 * Só escreve o atributo se ele mudou. Reescrever atributos de um <input type="date">
 * enquanto a pessoa digita faz o Chrome reiniciar a edição do campo (o ano
 * digitado dígito a dígito se perde e a data é apagada).
 */
function definirAtributo(no: HTMLElement, nome: string, valor: string | null) {
  if (valor === null) {
    if (no.hasAttribute(nome)) no.removeAttribute(nome);
  } else if (no.getAttribute(nome) !== valor) {
    no.setAttribute(nome, valor);
  }
}

/** Enquanto o ano está sendo digitado o navegador entrega datas como 0002-11-25: tratamos como incompleta. */
function dataCompleta(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && Number(valor.slice(0, 4)) >= 1900;
}

function limparErros() {
  for (const id of Object.values(INPUT_DO_CAMPO)) {
    const input = $(id);
    definirAtributo(input, "aria-invalid", null);
    const erro = document.getElementById(`${id}-erro`);
    if (erro) {
      erro.hidden = true;
      erro.textContent = "";
    }
  }
}

function mostrarErro(campo: CampoEntrada, mensagem: string) {
  const id = INPUT_DO_CAMPO[campo];
  definirAtributo($(id), "aria-invalid", "true");
  const erro = document.getElementById(`${id}-erro`);
  if (erro) {
    erro.hidden = false;
    erro.textContent = mensagem;
  }
}

let ultimoAjusteSaida = "";
/**
 * Ajusta a data de saída para dentro do mês da folha só quando o mês ou o modo
 * mudam — nunca enquanto a pessoa digita a própria data de saída.
 */
function ajustarDataSaida(folha: AnoMes) {
  const min = primeiroDia(folha);
  const max = ultimoDia(folha);
  definirAtributo(campos.dataSaida, "min", min);
  definirAtributo(campos.dataSaida, "max", max);
  const chave = `${min}|${modo()}`;
  if (chave === ultimoAjusteSaida) return;
  ultimoAjusteSaida = chave;
  const v = campos.dataSaida.value;
  if (!v || v < min || v > max) campos.dataSaida.value = max;
}

function atualizarRotulos(folha: AnoMes, ctx: ContextoFolha | null) {
  const ant = mesAnterior(folha);
  const nomeAnt = nomeMes(ant.mes);
  const desligamento = modo() === "desligamento";

  $("bloco-saida").hidden = !desligamento;
  $("bloco-mes-atual").hidden = !desligamento;
  $("data-saida-ajuda").textContent = `Deve estar em ${formatarAnoMes(folha)}.`;

  // Entrada: mostra até quando vai o contrato
  $("data-entrada-ajuda").textContent = ctx?.dataFinalContrato
    ? `Seu contrato de 2 anos vai, no máximo, até ${formatarData(ctx.dataFinalContrato)}.`
    : "Está no seu termo de compromisso de estágio.";

  // Mês de entrada: sem mês anterior
  const ehEntrada = !!ctx?.ehMesDeEntrada;
  $("bloco-mes-anterior").hidden = ehEntrada;
  const nota = $("nota-entrada");
  nota.hidden = !ehEntrada;
  nota.textContent = ehEntrada
    ? `Você entrou em ${nomeMes(folha.mes)}: não há mês anterior a informar. Os dias antes da sua entrada são descontados nesta mesma folha.`
    : "";
  $("t-ausencias-texto").textContent = ehEntrada ? "Ausências" : `Ausências de ${nomeAnt}/${ant.ano}`;

  // Mês anterior: rótulo dinâmico com os dias úteis
  let complemento: string;
  if (ctx?.mesAnteriorEhEntrada && ctx.maxNaoPresenciaisMesAnterior !== null) {
    complemento = `(de ${formatarData(campos.dataEntrada.value)} até o fim de ${nomeAnt} foram ${diasUteisTexto(ctx.maxNaoPresenciaisMesAnterior)})`;
  } else if (ctx?.diasUteisMesAnterior != null) {
    complemento = `(${nomeAnt} teve ${diasUteisTexto(ctx.diasUteisMesAnterior)})`;
  } else if (calendario.temMes(ant)) {
    complemento = `(${nomeAnt} teve ${diasUteisTexto(calendario.diasUteisNoMes(ant))})`;
  } else {
    complemento = `(o calendário de ${ant.ano} não está cadastrado)`;
  }
  $("ant-nao-presenciais-rotulo").textContent =
    `Quantos dias úteis de ${nomeAnt.toUpperCase()} você não foi presencialmente ao Senado? ${complemento}`;
  $("ant-nao-presenciais-ajuda").textContent = ctx?.mesAnteriorEhEntrada
    ? "Conte só os dias a partir da sua data de entrada. Os dias anteriores já foram descontados na sua primeira folha."
    : "Conte faltas, atestados, recesso e trabalho remoto autorizado: o auxílio-transporte só é devido em dia presencial.";
  definirAtributo(campos.antNaoPres, "max", ctx?.maxNaoPresenciaisMesAnterior != null ? String(ctx.maxNaoPresenciaisMesAnterior) : null);

  // Mês do desligamento
  if (desligamento) {
    const nome = nomeMes(folha.mes);
    $("t-mes-atual").textContent = `Ausências de ${nome}/${folha.ano} (mês do desligamento)`;
    const max = ctx?.maxNaoPresenciaisMesAtual;
    $("atual-nao-presenciais-rotulo").textContent =
      `Quantos dias úteis de ${nome.toUpperCase()} você não foi presencialmente ao Senado?` +
      (max != null ? ` (até a saída foram ${diasUteisTexto(max)})` : "");
    $("atual-nao-presenciais-ajuda").textContent = "Neste mês as ausências são descontadas na própria folha, porque não haverá folha seguinte.";
    definirAtributo(campos.atualNaoPres, "max", max != null ? String(max) : null);
    $("bloco-recesso-1o-ano").hidden = !ctx?.podeInformarRecessoPrimeiroAno;
    $("recesso-info").textContent =
      "Quem completa 2 anos recebe 30 dias de recesso; quem sai antes recebe 2,5 dias por mês completo do período em aberto. O recesso indenizado é só bolsa, sem auxílio-transporte.";
  }
}

function linhaTotal(rotulo: string, centavos: number, classe: string) {
  return el("tr", { class: classe }, el("th", { scope: "row" }, rotulo), el("td", { class: "valor" }, formatarMoeda(centavos)));
}

function renderizarExtrato(r: Extract<ResultadoSimulacao, { ok: true }>, folha: AnoMes) {
  const tabela = el("table", { class: "extrato" }, el("caption", {}, `Extrato estimado da folha de ${formatarAnoMes(folha)}`));
  const ordem: GrupoExtrato[] = ["mes-da-folha", "entrada", "mes-anterior", "mes-atual", "recesso"];
  for (const grupo of ordem) {
    const linhas = r.linhas.filter((l) => l.grupo === grupo);
    const mostrarVazio = (grupo === "mes-anterior" && !r.contexto.ehMesDeEntrada) || (grupo === "mes-atual" && modo() === "desligamento");
    if (linhas.length === 0 && !mostrarVazio) continue;
    const corpo = el("tbody", {}, el("tr", { class: "extrato__grupo" }, el("th", { colspan: "2", scope: "colgroup" }, TITULOS_GRUPOS[grupo])));
    if (linhas.length === 0) {
      const mes = grupo === "mes-anterior" ? r.contexto.mesAnterior : folha;
      corpo.append(
        el("tr", { class: "extrato__vazio" }, el("th", { scope: "row" }, `Nenhuma ausência informada em ${nomeMes(mes.mes)}`), el("td", { class: "valor" }, formatarMoeda(0))),
      );
    }
    for (const l of linhas) {
      const sinal = l.natureza === "credito" ? "+" : "−";
      corpo.append(
        el(
          "tr",
          { class: `extrato__linha extrato__linha--${l.natureza}` },
          el("th", { scope: "row" }, el("span", { class: "extrato__desc" }, l.descricao), el("span", { class: "extrato__conta" }, l.conta)),
          el("td", { class: "valor" }, el("span", { class: "sr-only" }, l.natureza === "credito" ? "crédito " : "desconto "), `${sinal} ${formatarMoeda(l.centavos)}`),
        ),
      );
    }
    tabela.append(corpo);
  }
  tabela.append(
    el(
      "tfoot",
      {},
      linhaTotal("Total de créditos", r.creditosCentavos, "extrato__total"),
      linhaTotal("Total de descontos", r.descontosCentavos, "extrato__total"),
      linhaTotal("Valor líquido estimado", r.liquidoCentavos, "extrato__liquido"),
    ),
  );
  return tabela;
}

function renderizarAvisos(avisos: ResultadoSimulacao["avisos"]) {
  if (avisos.length === 0) return null;
  return el(
    "ul",
    { class: "avisos" },
    ...avisos.map((a) =>
      el(
        "li",
        { class: a.regraAConfirmar ? "aviso aviso--regra" : "aviso" },
        a.regraAConfirmar ? el("span", { class: "etiqueta-regra" }, "Regra a confirmar com o SGEST") : "",
        el("span", {}, a.mensagem),
      ),
    ),
  );
}

function resumoDadosInformados(entrada: EntradaSimulacao, ctx: ContextoFolha) {
  const itens: [string, string][] = [
    ["Data de entrada", formatarData(entrada.dataEntrada)],
    ["Folha", formatarAnoMes(entrada.folha)],
    ["Tipo", entrada.modo === "comum" ? "Mês comum" : "Último mês (desligamento)"],
  ];
  if (!ctx.ehMesDeEntrada) {
    const ant = nomeMes(ctx.mesAnterior.mes);
    itens.push([`Dias não presenciais em ${ant}`, String(entrada.mesAnterior.diasNaoPresenciais)]);
    itens.push([`Faltas injustificadas em ${ant}`, String(entrada.mesAnterior.faltasInjustificadas)]);
  }
  if (entrada.desligamento) {
    const atual = nomeMes(entrada.folha.mes);
    itens.push(["Data do desligamento", formatarData(entrada.desligamento.dataSaida)]);
    itens.push([`Dias não presenciais em ${atual}`, String(entrada.desligamento.mesAtual.diasNaoPresenciais)]);
    itens.push([`Faltas injustificadas em ${atual}`, String(entrada.desligamento.mesAtual.faltasInjustificadas)]);
  }
  return el(
    "div",
    { class: "dados-informados" },
    el("h3", {}, "Dados informados"),
    el("dl", {}, ...itens.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
  );
}

let temporizadorResumo: number | undefined;
/** O resumo é a região aria-live: atualiza com pequena espera para não "falar" a cada tecla. */
function definirResumo(html: string) {
  window.clearTimeout(temporizadorResumo);
  temporizadorResumo = window.setTimeout(() => {
    $("resumo").innerHTML = html;
  }, 400);
}

function atualizar() {
  const folha = lerFolha();
  if (!folha) return;
  if (modo() === "desligamento") ajustarDataSaida(folha);
  else ultimoAjusteSaida = "";
  definirAtributo(campos.dataEntrada, "max", ultimoDia(folha));

  const extrato = $("extrato");
  limparErros();

  const saidaIncompleta = modo() === "desligamento" && campos.dataSaida.value !== "" && !dataCompleta(campos.dataSaida.value);
  if (!dataCompleta(campos.dataEntrada.value) || saidaIncompleta) {
    atualizarRotulos(folha, null);
    extrato.replaceChildren();
    definirResumo(
      `<p class="destaque__vazio">${saidaIncompleta ? "Termine de informar a data do desligamento." : "Informe sua data de entrada para ver a estimativa."}</p>`,
    );
    return;
  }

  const entrada = lerEntrada(folha);
  const r = simularFolha(entrada, parametros);
  atualizarRotulos(folha, r.contexto);

  const bolsa = vigenteEm(parametros.bolsa, folha);
  const at = vigenteEm(parametros.at, folha);
  const valoresUsados =
    bolsa && at
      ? el("p", { class: "valores-usados" }, `Valores vigentes em ${formatarAnoMes(folha)}: bolsa ${formatarMoeda(bolsa.centavos)} · auxílio-transporte ${formatarMoeda(at.centavos)} por dia útil.`)
      : "";

  if (!r.ok) {
    for (const e of r.erros) mostrarErro(e.campo, e.mensagem);
    definirResumo(
      `<p class="destaque__erro"><strong>Não foi possível calcular.</strong> Corrija ${r.erros.length === 1 ? "o campo destacado" : "os campos destacados"}:</p>` +
        `<ul class="destaque__erros">${r.erros.map((e) => `<li><a href="#${INPUT_DO_CAMPO[e.campo]}">${escapar(e.mensagem)}</a></li>`).join("")}</ul>`,
    );
    extrato.replaceChildren(...[renderizarAvisos(r.avisos)].filter((x): x is HTMLUListElement => x !== null));
    return;
  }

  const ctx = r.contexto;
  const deposito = ctx.dataDeposito
    ? `Depósito estimado até <strong>${formatarData(ctx.dataDeposito)}</strong> (5º dia útil de ${nomeMes(proximoMes(folha).mes)}).`
    : `Data do depósito indisponível: o calendário de ${proximoMes(folha).ano} ainda não foi publicado.`;
  definirResumo(
    `<p class="destaque__rotulo">Valor líquido estimado · folha de ${formatarAnoMes(folha)}</p>` +
      `<p class="destaque__valor">${formatarMoeda(r.liquidoCentavos)}</p>` +
      `<p class="destaque__deposito">${deposito}</p>`,
  );
  extrato.replaceChildren(
    ...[renderizarAvisos(r.avisos), renderizarExtrato(r, folha), valoresUsados, resumoDadosInformados(entrada, ctx)].filter(
      (x): x is Exclude<typeof x, null | ""> => x !== null && x !== "",
    ),
  );
}

function preencherComoFunciona() {
  const folha = lerFolha();
  if (!folha) return;
  const bolsa = vigenteEm(parametros.bolsa, folha);
  const at = vigenteEm(parametros.at, folha);
  document.querySelectorAll<HTMLElement>("[data-valor=bolsa]").forEach((n) => (n.textContent = bolsa ? formatarMoeda(bolsa.centavos) : "—"));
  document.querySelectorAll<HTMLElement>("[data-valor=at]").forEach((n) => (n.textContent = at ? formatarMoeda(at.centavos) : "—"));
}

// ───────────────────────── Início ─────────────────────────

async function iniciar() {
  const { parametros: p, origem } = await carregarParametros();
  parametros = p;
  calendario = new Calendario(p.calendario);
  avisoParametros(origem);
  preencherMeses();

  const form = $<HTMLFormElement>("form");
  form.addEventListener("input", () => {
    atualizar();
    preencherComoFunciona();
  });
  form.addEventListener("change", () => {
    atualizar();
    preencherComoFunciona();
  });
  form.addEventListener("submit", (e) => e.preventDefault());
  $("imprimir").addEventListener("click", () => window.print());

  atualizar();
  preencherComoFunciona();
}

void iniciar();
