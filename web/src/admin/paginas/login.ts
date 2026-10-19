/** Login (e-mail + senha), "esqueci a senha" e redefinição pelo link do e-mail. */
import { el } from "../../shared/dom.ts";
import { mensagemDeErro, supabase } from "../supabase.ts";

export const SENHA_MINIMA = 12;

function tela(titulo: string, ...filhos: Node[]) {
  return el(
    "div",
    { class: "tela-central" },
    el(
      "div",
      { class: "card card--login" },
      el("div", { class: "card--login__topo" }, el("img", { src: "../marca/senado-horizontal-branco.svg", alt: "Senado Federal", width: "438", height: "200" })),
      el("div", { class: "card__corpo" }, el("h1", {}, titulo), ...filhos),
    ),
  );
}

function campo(id: string, rotulo: string, attrs: Record<string, string>) {
  const input = el("input", { id, ...attrs });
  return { input, bloco: el("div", { class: "campo" }, el("label", { for: id }, rotulo), input) };
}

export async function paginaLogin(app: HTMLElement, aviso = "") {
  const email = campo("login-email", "E-mail do SGEST", { type: "email", autocomplete: "username", required: "" });
  const senha = campo("login-senha", "Senha", { type: "password", autocomplete: "current-password", required: "" });
  const status = el("div", { class: "login__status", role: "alert" });
  if (aviso) status.append(el("p", { class: "mensagem mensagem--erro" }, aviso));
  const entrar = el("button", { type: "submit", class: "botao botao--primario botao--largo" }, "Entrar");
  const esqueci = el("button", { type: "button", class: "botao-link" }, "Esqueci a senha");

  const form = el("form", { class: "login__form", novalidate: "" }, email.bloco, senha.bloco, status, entrar, esqueci);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.replaceChildren();
    if (!email.input.value || !senha.input.value) {
      status.append(el("p", { class: "mensagem mensagem--erro" }, "Informe e-mail e senha."));
      return;
    }
    entrar.disabled = true;
    entrar.textContent = "Entrando…";
    const { error } = await supabase.auth.signInWithPassword({ email: email.input.value.trim(), password: senha.input.value });
    entrar.disabled = false;
    entrar.textContent = "Entrar";
    if (error) {
      status.append(
        el("p", { class: "mensagem mensagem--erro" }, error.message.includes("Invalid login") ? "E-mail ou senha incorretos." : mensagemDeErro(error)),
      );
      senha.input.value = "";
      senha.input.focus();
      return;
    }
    location.hash = "#/valores";
  });

  esqueci.addEventListener("click", async () => {
    status.replaceChildren();
    const endereco = email.input.value.trim();
    if (!endereco) {
      status.append(el("p", { class: "mensagem mensagem--erro" }, "Digite o e-mail do SGEST no campo acima e clique de novo em \"Esqueci a senha\"."));
      email.input.focus();
      return;
    }
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await supabase.auth.resetPasswordForEmail(endereco, { redirectTo });
    status.append(
      error
        ? el("p", { class: "mensagem mensagem--erro" }, mensagemDeErro(error))
        : el("p", { class: "mensagem mensagem--sucesso", role: "status" }, "Se o e-mail estiver correto, um link de redefinição foi enviado para a caixa do Gmail do SGEST."),
    );
  });

  app.replaceChildren(tela("Painel SGEST", form));
  email.input.focus();
}

/** Formulário de nova senha, usado na redefinição e na página "Alterar senha". */
export function formularioNovaSenha(aoConcluir: () => void, rotuloBotao = "Salvar nova senha") {
  const nova = campo("nova-senha", `Nova senha (mínimo ${SENHA_MINIMA} caracteres)`, { type: "password", autocomplete: "new-password", minlength: String(SENHA_MINIMA) });
  const repetir = campo("repetir-senha", "Repita a nova senha", { type: "password", autocomplete: "new-password" });
  const status = el("div", { role: "alert" });
  const salvar = el("button", { type: "submit", class: "botao botao--primario" }, rotuloBotao);
  const form = el("form", { class: "login__form", novalidate: "" }, nova.bloco, repetir.bloco, status, salvar);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.replaceChildren();
    const s = nova.input.value;
    let erro = "";
    if (s.length < SENHA_MINIMA) erro = `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
    else if (s !== repetir.input.value) erro = "As duas senhas não são iguais.";
    if (erro) {
      status.append(el("p", { class: "mensagem mensagem--erro" }, erro));
      return;
    }
    salvar.disabled = true;
    const { error } = await supabase.auth.updateUser({ password: s });
    salvar.disabled = false;
    if (error) {
      status.append(el("p", { class: "mensagem mensagem--erro" }, mensagemDeErro(error)));
      return;
    }
    nova.input.value = "";
    repetir.input.value = "";
    status.append(el("p", { class: "mensagem mensagem--sucesso", role: "status" }, "Senha alterada. Avise a equipe e guarde a nova senha em local seguro."));
    aoConcluir();
  });
  return form;
}

export async function paginaRedefinir(app: HTMLElement, aoConcluir: () => void) {
  const form = formularioNovaSenha(() => window.setTimeout(aoConcluir, 1500), "Definir nova senha");
  app.replaceChildren(tela("Definir nova senha", el("p", { class: "campo__ajuda" }, "Você chegou aqui pelo link de redefinição enviado ao Gmail do SGEST."), form));
}
