/** Log de auditoria (somente leitura): quem alterou o quê, quando, de → para. */
import { formatarData, formatarMoeda } from "@sgest/calc";
import { el } from "../../shared/dom.ts";
import type { Pagina } from "../main.ts";
import { mensagemDeErro, supabase, type LinhaAuditoriaDb } from "../supabase.ts";
import { botao, formatarDataHora } from "../ui.ts";

const POR_PAGINA = 50;
const NOME_TABELA: Record<string, string> = { valores: "Valores", anos_calendario: "Anos", datas_nao_uteis: "Calendário" };
const NOME_OPERACAO = { INSERT: "Inclusão", UPDATE: "Alteração", DELETE: "Exclusão" } as const;
/** Campos técnicos que não ajudam a ler a mudança. */
const IGNORAR = new Set(["id", "criado_em", "atualizado_em", "responsavel", "ano", "publicado_em"]);

const TERMOS: Record<string, string> = {
  bolsa: "bolsa",
  at: "auxílio-transporte",
  feriado: "feriado",
  ponto_facultativo: "ponto facultativo",
  rascunho: "rascunho",
  publicado: "publicado",
};

function formatarCampo(chave: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (chave === "valor_centavos" && typeof valor === "number") return formatarMoeda(valor);
  if ((chave === "data" || chave === "vigencia_inicio") && typeof valor === "string") return formatarData(valor);
  return TERMOS[String(valor)] ?? String(valor);
}

const ROTULO: Record<string, string> = {
  tipo: "tipo",
  valor_centavos: "valor",
  divisor: "divisor",
  vigencia_inicio: "vigência",
  status: "situação",
  data: "data",
  descricao: "descrição",
  fonte: "fonte",
};

function descreverMudanca(l: LinhaAuditoriaDb): Node {
  const ant = l.valor_anterior ?? {};
  const novo = l.valor_novo ?? {};
  const chaves = [...new Set([...Object.keys(ant), ...Object.keys(novo)])].filter((k) => !IGNORAR.has(k));
  const itens: Node[] = [];
  for (const k of chaves) {
    const a = ant[k];
    const n = novo[k];
    if (l.operacao === "UPDATE" && JSON.stringify(a) === JSON.stringify(n)) continue;
    const rotulo = ROTULO[k] ?? k;
    if (l.operacao === "INSERT") itens.push(el("li", {}, `${rotulo}: ${formatarCampo(k, n)}`));
    else if (l.operacao === "DELETE") itens.push(el("li", {}, `${rotulo}: ${formatarCampo(k, a)}`));
    else itens.push(el("li", {}, `${rotulo}: `, el("del", {}, formatarCampo(k, a)), " → ", el("ins", {}, formatarCampo(k, n))));
  }
  if (l.operacao === "UPDATE" && itens.length === 0) itens.push(el("li", {}, "sem mudança de conteúdo"));
  return el("ul", { class: "mudancas" }, ...itens);
}

async function render(conteudo: HTMLElement) {
  const corpo = el("tbody", {});
  const status = el("p", { class: "texto-suave", "aria-live": "polite" });
  let carregados = 0;
  const mais = botao("Carregar mais", "botao--secundario", () => void carregar());

  async function carregar() {
    mais.disabled = true;
    const { data, error } = await supabase
      .from("auditoria")
      .select("id, ocorrido_em, tabela, operacao, registro, valor_anterior, valor_novo, responsavel")
      .order("id", { ascending: false })
      .range(carregados, carregados + POR_PAGINA - 1);
    mais.disabled = false;
    if (error) {
      status.textContent = mensagemDeErro(error);
      return;
    }
    for (const l of data as LinhaAuditoriaDb[]) {
      corpo.append(
        el(
          "tr",
          {},
          el("td", { class: "num" }, formatarDataHora(l.ocorrido_em)),
          el("td", {}, l.responsavel),
          el("td", {}, `${NOME_TABELA[l.tabela] ?? l.tabela}${l.tabela === "anos_calendario" ? ` ${l.registro}` : ""}`),
          el("td", {}, NOME_OPERACAO[l.operacao]),
          el("td", {}, descreverMudanca(l)),
        ),
      );
    }
    carregados += data.length;
    mais.hidden = data.length < POR_PAGINA;
    status.textContent = `${carregados} registro(s) exibido(s).`;
  }

  conteudo.replaceChildren(
    el(
      "section",
      { class: "bloco" },
      el("p", { class: "nota" }, "Registro automático e imutável de todas as alterações (gerado pelo banco). Ninguém consegue editar ou apagar estas linhas."),
      el(
        "div",
        { class: "tabela-rolagem" },
        el("table", { class: "tabela tabela--auditoria" }, el("thead", {}, el("tr", {}, ...["Quando", "Responsável", "Onde", "Operação", "O que mudou"].map((t) => el("th", { scope: "col" }, t)))), corpo),
      ),
      status,
      mais,
    ),
  );
  await carregar();
}

export const paginaAuditoria: Pagina = { titulo: "Auditoria", render };
