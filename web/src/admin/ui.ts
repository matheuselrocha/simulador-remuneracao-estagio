/** Peças de interface do painel: mensagens, confirmação e "Seu nome". */
import { el } from "../shared/dom.ts";
import { nomeResponsavel, nomeValido } from "./sessao.ts";

/** Mensagem de sucesso (role=status) ou erro (role=alert) no topo do conteúdo. */
export function mensagem(texto: string, tipo: "sucesso" | "erro" = "sucesso") {
  const area = document.getElementById("mensagens");
  if (!area) return;
  const item = el(
    "div",
    { class: `mensagem mensagem--${tipo}`, role: tipo === "erro" ? "alert" : "status" },
    el("span", {}, texto),
  );
  const fechar = el("button", { type: "button", class: "mensagem__fechar", "aria-label": "Fechar mensagem" }, "×");
  fechar.addEventListener("click", () => item.remove());
  item.append(fechar);
  area.replaceChildren(item);
  if (tipo === "sucesso") window.setTimeout(() => item.remove(), 8000);
}

/** Diálogo modal de confirmação (elemento <dialog> nativo: foco e Esc acessíveis). */
export function confirmar(opcoes: {
  titulo: string;
  corpo: (Node | string)[];
  botao: string;
  perigo?: boolean;
  /** Exige marcar "Confirmo…" antes de liberar o botão. */
  caixa?: string;
}): Promise<boolean> {
  return new Promise((resolver) => {
    const titulo = el("h2", { id: "dialogo-titulo" }, opcoes.titulo);
    const botaoOk = el("button", { type: "submit", value: "ok", class: `botao ${opcoes.perigo ? "botao--perigo" : "botao--primario"}` }, opcoes.botao);
    const botaoCancelar = el("button", { type: "submit", value: "cancelar", class: "botao botao--secundario" }, "Cancelar");
    const form = el("form", { method: "dialog", class: "dialogo__form" }, titulo, el("div", { class: "dialogo__corpo" }, ...opcoes.corpo));
    if (opcoes.caixa) {
      const id = `confirmo-${Date.now()}`;
      const caixa = el("input", { type: "checkbox", id });
      botaoOk.disabled = true;
      caixa.addEventListener("change", () => (botaoOk.disabled = !caixa.checked));
      form.append(el("div", { class: "campo campo--checkbox" }, caixa, el("label", { for: id }, opcoes.caixa)));
    }
    form.append(el("div", { class: "dialogo__acoes" }, botaoCancelar, botaoOk));
    const dialogo = el("dialog", { class: "dialogo", "aria-labelledby": "dialogo-titulo" }, form);
    document.body.append(dialogo);
    dialogo.addEventListener("close", () => {
      resolver(dialogo.returnValue === "ok");
      dialogo.remove();
    });
    dialogo.showModal();
    botaoCancelar.focus();
  });
}

/** Lê "Seu nome" do cabeçalho; se faltar, destaca o campo e devolve null. */
export function exigirNome(): string | null {
  const nome = nomeResponsavel();
  if (nomeValido(nome)) return nome.trim();
  const campo = document.getElementById("seu-nome") as HTMLInputElement | null;
  campo?.setAttribute("aria-invalid", "true");
  campo?.focus();
  mensagem("Preencha \"Seu nome\" (no topo da página) antes de gravar. Ele fica registrado na auditoria.", "erro");
  return null;
}

export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function botao(texto: string, classe: string, aoClicar: () => void, atributos: Record<string, string> = {}) {
  const b = el("button", { type: "button", class: `botao ${classe}`, ...atributos }, texto);
  b.addEventListener("click", aoClicar);
  return b;
}
