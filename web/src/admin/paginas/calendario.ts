/**
 * Calendário de dias úteis: cadastro manual data a data (fluxo real: a equipe
 * vê o ato na intranet e cadastra aqui), grade mensal clicável, contagem de
 * dias úteis ao vivo e publicação do ano.
 */
import {
  NOMES_MESES,
  diaDaSemana,
  diasNoMes,
  ehFimDeSemana,
  formatarAnoMes,
  formatarData,
  montar,
  partes,
  type Calendario,
} from "@sgest/calc";
import { el } from "../../shared/dom.ts";
import { calendarioCompleto, carregarDados, hojeISO, type DadosPainel } from "../dados.ts";
import type { Pagina } from "../main.ts";
import { mensagemDeErro, supabase, type LinhaAnoDb, type LinhaDataDb } from "../supabase.ts";
import { botao, confirmar, exigirNome, formatarDataHora, mensagem } from "../ui.ts";

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const INICIAIS = ["D", "S", "T", "Q", "Q", "S", "S"];
const NOME_TIPO = { feriado: "Feriado", ponto_facultativo: "Ponto facultativo" } as const;

let anoSelecionado: number | null = null;

/** "outubro/2026 passa de 20 para 19 dias úteis" para cada mês afetado. */
function impacto(dados: DadosPainel, mudanca: { incluir?: string; remover?: string }): string[] {
  const antes = calendarioCompleto(dados);
  const depois = calendarioCompleto(dados, mudanca.incluir ? [mudanca.incluir] : [], mudanca.remover ? [mudanca.remover] : []);
  const meses = new Set([mudanca.incluir, mudanca.remover].filter(Boolean).map((d) => d!.slice(0, 7)));
  const frases: string[] = [];
  for (const m of meses) {
    const am = { ano: Number(m.slice(0, 4)), mes: Number(m.slice(5, 7)) };
    if (!antes.temMes(am)) continue;
    const a = antes.diasUteisNoMes(am);
    const d = depois.diasUteisNoMes(am);
    frases.push(a === d ? `${formatarAnoMes(am)} continua com ${a} dias úteis (sem efeito).` : `${formatarAnoMes(am)} passa de ${a} para ${d} dias úteis.`);
  }
  return frases;
}

function nomeDia(data: string) {
  return DIAS_SEMANA[diaDaSemana(data)]!;
}

async function render(conteudo: HTMLElement) {
  const dados = await carregarDados();
  const hoje = hojeISO();
  const anoHoje = partes(hoje).ano;
  if (anoSelecionado === null || !dados.anos.some((a) => a.ano === anoSelecionado)) {
    anoSelecionado = dados.anos.some((a) => a.ano === anoHoje) ? anoHoje : (dados.anos.at(-1)?.ano ?? null);
  }

  const blocos: Node[] = [];

  // Aviso a partir de outubro: ano seguinte não publicado
  const proximo = dados.anos.find((a) => a.ano === anoHoje + 1);
  if (partes(hoje).mes >= 10 && proximo?.status !== "publicado") {
    blocos.push(
      el(
        "div",
        { class: "alerta alerta--atencao", role: "status" },
        el("strong", {}, `O calendário de ${anoHoje + 1} ainda não foi publicado. `),
        `A data de depósito da folha de dezembro e todas as simulações de ${anoHoje + 1} dependem dele. ` +
          (proximo ? "Cadastre as datas e publique o ano." : "Crie o ano abaixo, cadastre as datas e publique."),
      ),
    );
  }

  blocos.push(seletorAnos(dados, anoHoje, conteudo));

  const ano = dados.anos.find((a) => a.ano === anoSelecionado);
  if (!ano) {
    blocos.push(el("p", { class: "nota" }, "Nenhum ano cadastrado. Crie o primeiro ano acima."));
    conteudo.replaceChildren(...blocos);
    return;
  }
  const cal = calendarioCompleto(dados);
  const datasAno = dados.datas.filter((d) => d.ano === ano.ano);
  const form = formularioInclusao(dados, ano, conteudo);
  blocos.push(cabecalhoAno(dados, ano, datasAno, cal, conteudo), form.elemento, grade(ano.ano, datasAno, cal, form.preencher, (d) => void editar(d, dados, ano, conteudo)), listaDatas(datasAno, dados, ano, conteudo));
  conteudo.replaceChildren(...blocos);
}

function seletorAnos(dados: DadosPainel, anoHoje: number, conteudo: HTMLElement) {
  const abas = el(
    "div",
    { class: "abas-anos", role: "group", "aria-label": "Ano do calendário" },
    ...dados.anos.map((a) => {
      const b = botao(`${a.ano}${a.status === "rascunho" ? " (rascunho)" : ""}`, "botao--aba", () => {
        anoSelecionado = a.ano;
        void render(conteudo);
      });
      b.setAttribute("aria-pressed", String(a.ano === anoSelecionado));
      return b;
    }),
  );
  const sugestao = Math.max(anoHoje + 1, ...dados.anos.map((a) => a.ano + 1));
  const novoAno = el("input", { type: "number", id: "novo-ano", min: "2000", max: "2100", value: String(sugestao), class: "input-curto" });
  const criar = el("form", { class: "linha criar-ano", novalidate: "" }, el("label", { for: "novo-ano" }, "Criar ano"), novoAno, el("button", { type: "submit", class: "botao botao--secundario" }, "Criar em rascunho"));
  criar.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = exigirNome();
    if (!nome) return;
    const ano = Number(novoAno.value);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return mensagem("Informe um ano entre 2000 e 2100.", "erro");
    const { error } = await supabase.from("anos_calendario").insert({ ano, responsavel: nome });
    if (error) return mensagem(error.code === "23505" ? `O ano ${ano} já existe.` : mensagemDeErro(error), "erro");
    anoSelecionado = ano;
    mensagem(`Ano ${ano} criado em rascunho. O simulador só passa a usá-lo depois de publicado.`);
    await render(conteudo);
  });
  return el("section", { class: "bloco bloco--anos" }, abas, criar);
}

function cabecalhoAno(dados: DadosPainel, ano: LinhaAnoDb, datas: LinhaDataDb[], cal: Calendario, conteudo: HTMLElement) {
  const contagem = NOMES_MESES.map((_, i) => cal.diasUteisNoMes({ ano: ano.ano, mes: i + 1 }));
  const status =
    ano.status === "publicado"
      ? el("p", {}, el("span", { class: "selo selo--vigente" }, "Publicado"), ` em ${ano.publicado_em ? formatarDataHora(ano.publicado_em) : "—"}. Alterações entram em vigor no simulador imediatamente.`)
      : el("p", {}, el("span", { class: "selo selo--futuro" }, "Rascunho"), " O simulador ainda não usa este ano.");
  const acoes = el("div", { class: "acoes" });
  if (ano.status === "rascunho") {
    acoes.append(
      botao(`Publicar ${ano.ano}`, "botao--primario", async () => {
        const nome = exigirNome();
        if (!nome) return;
        const ok = await confirmar({
          titulo: `Publicar o calendário de ${ano.ano}`,
          corpo: [
            el("p", {}, `Depois de publicado, o simulador passa a usar ${ano.ano} e o ano não volta a rascunho. ${datas.length} datas cadastradas.`),
            tabelaContagem(ano.ano, contagem),
          ],
          botao: "Publicar",
          caixa: "Conferi a contagem de dias úteis com o calendário da intranet.",
        });
        if (!ok) return;
        const { error } = await supabase.from("anos_calendario").update({ status: "publicado", responsavel: nome }).eq("ano", ano.ano);
        if (error) return mensagem(mensagemDeErro(error), "erro");
        mensagem(`Calendário de ${ano.ano} publicado.`);
        await render(conteudo);
      }),
    );
    if (datas.length === 0) {
      acoes.append(
        botao(`Excluir ${ano.ano}`, "botao--perigo", async () => {
          const nome = exigirNome();
          if (!nome) return;
          if (!(await confirmar({ titulo: `Excluir o ano ${ano.ano}`, corpo: [el("p", {}, "O ano em rascunho, sem datas, será excluído.")], botao: "Excluir", perigo: true }))) return;
          const { error } = await supabase.rpc("excluir_registro", { p_tabela: "anos_calendario", p_id: String(ano.ano), p_responsavel: nome });
          if (error) return mensagem(mensagemDeErro(error), "erro");
          anoSelecionado = null;
          mensagem(`Ano ${ano.ano} excluído.`);
          await render(conteudo);
        }),
      );
    }
  }
  void dados;
  return el("section", { class: "bloco" }, el("h2", {}, `Calendário de ${ano.ano}`), status, acoes, el("h3", { class: "titulo-pequeno" }, "Dias úteis por mês"), tabelaContagem(ano.ano, contagem));
}

function tabelaContagem(ano: number, contagem: number[]) {
  return el(
    "div",
    { class: "tabela-rolagem" },
    el(
      "table",
      { class: "tabela tabela--contagem" },
      el("caption", { class: "sr-only" }, `Dias úteis por mês em ${ano}`),
      el("thead", {}, el("tr", {}, ...NOMES_MESES.map((n) => el("th", { scope: "col" }, n.slice(0, 3))), el("th", { scope: "col" }, "Total"))),
      el("tbody", {}, el("tr", {}, ...contagem.map((c) => el("td", { class: "num" }, String(c))), el("td", { class: "num" }, el("strong", {}, String(contagem.reduce((a, b) => a + b, 0)))))),
    ),
  );
}

function formularioInclusao(dados: DadosPainel, ano: LinhaAnoDb, conteudo: HTMLElement) {
  const data = el("input", { type: "date", id: "inc-data", min: `${ano.ano}-01-01`, max: `${ano.ano}-12-31`, required: "" });
  const descricao = el("input", { type: "text", id: "inc-descricao", maxlength: "200", placeholder: "ex.: Dia do Servidor Público", required: "" });
  const tipo = el("select", { id: "inc-tipo" }, el("option", { value: "ponto_facultativo" }, NOME_TIPO.ponto_facultativo), el("option", { value: "feriado" }, NOME_TIPO.feriado));
  const fonte = el("input", { type: "text", id: "inc-fonte", maxlength: "300", placeholder: "ex.: Ato da Diretoria-Geral nº …" });
  const aviso = el("p", { class: "previa", "aria-live": "polite" });

  const atualizar = () => {
    aviso.textContent = "";
    if (!data.value) return;
    if (dados.datas.some((d) => d.data === data.value)) aviso.textContent = `${formatarData(data.value)} já está cadastrada.`;
    else if (ehFimDeSemana(data.value)) aviso.textContent = `${formatarData(data.value)} é ${nomeDia(data.value)}: pode ser cadastrada, mas fica sem efeito nos dias úteis.`;
    else aviso.textContent = impacto(dados, { incluir: data.value }).join(" ");
  };
  data.addEventListener("input", atualizar);

  const form = el(
    "form",
    { class: "bloco form-grade form-grade--linha", novalidate: "", id: "form-inclusao" },
    el("h2", {}, "Incluir feriado ou ponto facultativo"),
    el("div", { class: "campo" }, el("label", { for: "inc-data" }, "Data"), data),
    el("div", { class: "campo campo--largo" }, el("label", { for: "inc-descricao" }, "Descrição"), descricao),
    el("div", { class: "campo" }, el("label", { for: "inc-tipo" }, "Tipo"), tipo),
    el("div", { class: "campo campo--largo" }, el("label", { for: "inc-fonte" }, "Fonte (opcional)"), fonte),
    aviso,
    el("div", { class: "acoes" }, el("button", { type: "submit", class: "botao botao--primario" }, "Salvar data")),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!data.value || partes(data.value).ano !== ano.ano) {
      data.focus();
      return mensagem(`Escolha uma data de ${ano.ano}.`, "erro");
    }
    if (descricao.value.trim().length < 2) {
      descricao.focus();
      return mensagem("Informe a descrição (ex.: \"Dia do Servidor Público\").", "erro");
    }
    if (dados.datas.some((d) => d.data === data.value)) return mensagem(`${formatarData(data.value)} já está cadastrada.`, "erro");
    const nome = exigirNome();
    if (!nome) return;
    if (ano.status === "publicado") {
      const ok = await confirmar({
        titulo: "Incluir data em ano publicado",
        corpo: [
          el("p", {}, `${formatarData(data.value)} (${nomeDia(data.value)}) — ${descricao.value.trim()}. O ano ${ano.ano} já está publicado: a mudança vale no simulador imediatamente.`),
          el("p", { class: "previa" }, ehFimDeSemana(data.value) ? "Fim de semana: sem efeito nos dias úteis." : impacto(dados, { incluir: data.value }).join(" ")),
        ],
        botao: "Incluir",
      });
      if (!ok) return;
    }
    const { error } = await supabase.from("datas_nao_uteis").insert({
      data: data.value,
      descricao: descricao.value.trim(),
      tipo: tipo.value,
      fonte: fonte.value.trim() || null,
      responsavel: nome,
    });
    if (error) return mensagem(error.code === "23505" ? `${formatarData(data.value)} já está cadastrada.` : mensagemDeErro(error), "erro");
    mensagem(`${formatarData(data.value)} incluída: ${descricao.value.trim()}.`);
    await render(conteudo);
  });

  return {
    elemento: form,
    preencher(dia: string) {
      data.value = dia;
      atualizar();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      descricao.focus({ preventScroll: true });
    },
  };
}

function grade(ano: number, datas: LinhaDataDb[], cal: Calendario, aoClicarLivre: (d: string) => void, aoClicarCadastrada: (d: LinhaDataDb) => void) {
  const porData = new Map(datas.map((d) => [d.data, d]));
  const meses = NOMES_MESES.map((nome, i) => {
    const mes = i + 1;
    const corpo = el("tbody", {});
    let linha = el("tr", {});
    const primeiro = diaDaSemana(montar(ano, mes, 1));
    for (let k = 0; k < primeiro; k++) linha.append(el("td", {}));
    for (let dia = 1; dia <= diasNoMes(ano, mes); dia++) {
      const data = montar(ano, mes, dia);
      const cadastrada = porData.get(data);
      const fds = ehFimDeSemana(data);
      const classe = cadastrada ? `dia--${cadastrada.tipo}${fds ? " dia--sem-efeito" : ""}` : fds ? "dia--fds" : "dia--util";
      const rotulo = `${dia} de ${nome}, ${nomeDia(data)}` + (cadastrada ? `: ${NOME_TIPO[cadastrada.tipo].toLowerCase()}, ${cadastrada.descricao}${fds ? " (sem efeito)" : ""}` : fds ? "" : ", dia útil");
      const b = el("button", { type: "button", class: `dia ${classe}`, "aria-label": rotulo, title: rotulo }, String(dia));
      b.addEventListener("click", () => (cadastrada ? aoClicarCadastrada(cadastrada) : aoClicarLivre(data)));
      linha.append(el("td", {}, b));
      if (diaDaSemana(data) === 6) {
        corpo.append(linha);
        linha = el("tr", {});
      }
    }
    if (linha.childElementCount) corpo.append(linha);
    return el(
      "table",
      { class: "mes" },
      el("caption", {}, el("span", { class: "mes__nome" }, nome), el("span", { class: "mes__uteis" }, `${cal.diasUteisNoMes({ ano, mes })} dias úteis`)),
      el("thead", {}, el("tr", {}, ...INICIAIS.map((l, j) => el("th", { scope: "col", abbr: DIAS_SEMANA[j]! }, l)))),
      corpo,
    );
  });
  const legenda = el(
    "ul",
    { class: "legenda" },
    ...[
      ["dia--util", "Dia útil"],
      ["dia--fds", "Fim de semana"],
      ["dia--feriado", "Feriado"],
      ["dia--ponto_facultativo", "Ponto facultativo"],
    ].map(([c, t]) => el("li", {}, el("span", { class: `dia dia--amostra ${c}`, "aria-hidden": "true" }), t!)),
  );
  return el(
    "section",
    { class: "bloco" },
    el("h2", {}, `Grade de ${ano}`),
    el("p", { class: "campo__ajuda" }, "Clique num dia livre para incluir a data no formulário acima; clique numa data cadastrada para editá-la."),
    legenda,
    el("div", { class: "grade-meses" }, ...meses),
  );
}

function listaDatas(datas: LinhaDataDb[], dados: DadosPainel, ano: LinhaAnoDb, conteudo: HTMLElement) {
  const corpo = el("tbody", {});
  for (const d of datas) {
    const fds = ehFimDeSemana(d.data);
    corpo.append(
      el(
        "tr",
        {},
        el("td", { class: "num" }, formatarData(d.data)),
        el("td", {}, nomeDia(d.data)),
        el("td", {}, d.descricao),
        el("td", {}, NOME_TIPO[d.tipo]),
        el("td", {}, d.fonte ?? "—"),
        el("td", {}, fds ? el("span", { class: "selo selo--encerrado" }, "Sem efeito (fim de semana)") : "—"),
        el("td", {}, d.responsavel),
        el(
          "td",
          { class: "acoes-celula" },
          botao("Editar", "botao--pequeno botao--secundario", () => void editar(d, dados, ano, conteudo), { "aria-label": `Editar ${formatarData(d.data)}` }),
          botao("Remover", "botao--pequeno botao--perigo", () => void remover(d, dados, ano, conteudo), { "aria-label": `Remover ${formatarData(d.data)}` }),
        ),
      ),
    );
  }
  return el(
    "section",
    { class: "bloco" },
    el("h2", {}, `Datas cadastradas em ${ano.ano} (${datas.length})`),
    datas.length === 0
      ? el("p", { class: "texto-suave" }, "Nenhuma data cadastrada.")
      : el(
          "div",
          { class: "tabela-rolagem" },
          el(
            "table",
            { class: "tabela" },
            el("thead", {}, el("tr", {}, ...["Data", "Dia", "Descrição", "Tipo", "Fonte", "Situação", "Cadastrado por", "Ações"].map((t) => el("th", { scope: "col" }, t)))),
            corpo,
          ),
        ),
  );
}

async function editar(d: LinhaDataDb, dados: DadosPainel, ano: LinhaAnoDb, conteudo: HTMLElement) {
  const nome = exigirNome();
  if (!nome) return;
  const data = el("input", { type: "date", id: "ed-data", min: `${ano.ano}-01-01`, max: `${ano.ano}-12-31` });
  data.value = d.data;
  const descricao = el("input", { type: "text", id: "ed-descricao", maxlength: "200" });
  descricao.value = d.descricao;
  const tipo = el("select", { id: "ed-tipo" }, el("option", { value: "ponto_facultativo" }, NOME_TIPO.ponto_facultativo), el("option", { value: "feriado" }, NOME_TIPO.feriado));
  tipo.value = d.tipo;
  const fonte = el("input", { type: "text", id: "ed-fonte", maxlength: "300" });
  fonte.value = d.fonte ?? "";
  const previa = el("p", { class: "previa", "aria-live": "polite" });
  const atualizar = () => {
    previa.textContent =
      data.value && data.value !== d.data && ano.status === "publicado" ? impacto(dados, { incluir: data.value, remover: d.data }).join(" ") : "";
  };
  data.addEventListener("input", atualizar);

  const ok = await confirmar({
    titulo: `Editar ${formatarData(d.data)}`,
    corpo: [
      el("div", { class: "campo" }, el("label", { for: "ed-data" }, "Data"), data),
      el("div", { class: "campo" }, el("label", { for: "ed-descricao" }, "Descrição"), descricao),
      el("div", { class: "campo" }, el("label", { for: "ed-tipo" }, "Tipo"), tipo),
      el("div", { class: "campo" }, el("label", { for: "ed-fonte" }, "Fonte (opcional)"), fonte),
      previa,
      ano.status === "publicado" ? el("p", { class: "campo__ajuda" }, "Ano publicado: a alteração vale no simulador imediatamente.") : "",
    ],
    botao: "Salvar alterações",
  });
  if (!ok) return;
  if (!data.value || partes(data.value).ano !== ano.ano) return mensagem(`A data precisa ser de ${ano.ano}.`, "erro");
  if (descricao.value.trim().length < 2) return mensagem("Informe a descrição.", "erro");
  if (data.value !== d.data && dados.datas.some((x) => x.data === data.value)) return mensagem(`${formatarData(data.value)} já está cadastrada.`, "erro");
  const { error } = await supabase
    .from("datas_nao_uteis")
    .update({ data: data.value, descricao: descricao.value.trim(), tipo: tipo.value, fonte: fonte.value.trim() || null, responsavel: nome })
    .eq("id", d.id);
  if (error) return mensagem(mensagemDeErro(error), "erro");
  mensagem(`${formatarData(data.value)} atualizada.`);
  await render(conteudo);
}

async function remover(d: LinhaDataDb, dados: DadosPainel, ano: LinhaAnoDb, conteudo: HTMLElement) {
  const nome = exigirNome();
  if (!nome) return;
  const ok = await confirmar({
    titulo: `Remover ${formatarData(d.data)}`,
    corpo: [
      el("p", {}, `${d.descricao} (${NOME_TIPO[d.tipo].toLowerCase()}) deixará de ser contado como dia não útil.`),
      el("p", { class: "previa" }, ano.status === "publicado" ? impacto(dados, { remover: d.data }).join(" ") + " Vale no simulador imediatamente." : impacto(dados, { remover: d.data }).join(" ")),
    ],
    botao: "Remover",
    perigo: true,
  });
  if (!ok) return;
  const { error } = await supabase.rpc("excluir_registro", { p_tabela: "datas_nao_uteis", p_id: String(d.id), p_responsavel: nome });
  if (error) return mensagem(mensagemDeErro(error), "erro");
  mensagem(`${formatarData(d.data)} removida.`);
  await render(conteudo);
}

export const paginaCalendario: Pagina = { titulo: "Calendário", render };
