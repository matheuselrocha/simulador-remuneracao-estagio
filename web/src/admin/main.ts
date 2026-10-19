/**
 * Painel administrativo do SGEST (/admin). Rotas por hash (#/valores…),
 * para funcionar em qualquer hospedagem estática.
 */
import "../styles/admin.css";
import { el } from "../shared/dom.ts";
import { paginaAuditoria } from "./paginas/auditoria.ts";
import { paginaCalendario } from "./paginas/calendario.ts";
import { paginaLogin, paginaRedefinir } from "./paginas/login.ts";
import { paginaSenha } from "./paginas/senha.ts";
import { paginaValores } from "./paginas/valores.ts";
import { definirNomeResponsavel, nomeResponsavel, sair, vigiarInatividade } from "./sessao.ts";
import { configurado, supabase } from "./supabase.ts";

export interface Pagina {
  titulo: string;
  render(conteudo: HTMLElement): Promise<void>;
}

const MENU: { rota: string; rotulo: string; pagina: Pagina }[] = [
  { rota: "valores", rotulo: "Valores", pagina: paginaValores },
  { rota: "calendario", rotulo: "Calendário", pagina: paginaCalendario },
  { rota: "auditoria", rotulo: "Auditoria", pagina: paginaAuditoria },
  { rota: "senha", rotulo: "Alterar senha", pagina: paginaSenha },
];

const app = document.getElementById("app")!;
let emRecuperacao = false;
let avisoLogin = "";
/** user_id já confirmado como admin nesta aba. */
let adminConfirmado: string | null = null;

function rotaAtual(): string {
  return location.hash.replace(/^#\/?/, "").split("?")[0] || "valores";
}

async function ehAdmin(userId: string): Promise<boolean> {
  if (adminConfirmado === userId) return true;
  const { data, error } = await supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error || !data) return false;
  adminConfirmado = userId;
  return true;
}

function montarCasca(rota: string): HTMLElement {
  const nav = el(
    "ul",
    {},
    ...MENU.map((m) =>
      el("li", {}, el("a", { href: `#/${m.rota}`, ...(m.rota === rota ? { "aria-current": "page" } : {}) }, m.rotulo)),
    ),
  );
  const botaoSair = el("button", { type: "button", class: "painel__sair" }, "Sair");
  botaoSair.addEventListener("click", async () => {
    await sair();
    adminConfirmado = null;
    location.hash = "#/login";
    void renderizar();
  });

  const campoNome = el("input", {
    type: "text",
    id: "seu-nome",
    autocomplete: "name",
    maxlength: "120",
    "aria-describedby": "seu-nome-ajuda",
  });
  campoNome.value = nomeResponsavel();
  campoNome.addEventListener("input", () => {
    definirNomeResponsavel(campoNome.value);
    campoNome.removeAttribute("aria-invalid");
  });

  const pagina = MENU.find((m) => m.rota === rota)!.pagina;
  const conteudo = el("main", { id: "conteudo", class: "painel__conteudo", tabindex: "-1" });

  const casca = el(
    "div",
    { class: "painel" },
    el(
      "aside",
      { class: "painel__menu" },
      el("img", { src: "../marca/senado-horizontal-branco.svg", alt: "Senado Federal", class: "painel__logo", width: "438", height: "200" }),
      el("p", { class: "painel__nome" }, "Painel SGEST"),
      el("nav", { "aria-label": "Seções do painel" }, nav),
      el("div", { class: "painel__rodape-menu" }, el("a", { href: "../", class: "painel__link-simulador" }, "Abrir o simulador"), botaoSair),
    ),
    el(
      "div",
      { class: "painel__principal" },
      el(
        "header",
        { class: "painel__topo" },
        el("h1", {}, pagina.titulo),
        el(
          "div",
          { class: "seu-nome" },
          el("label", { for: "seu-nome" }, "Seu nome"),
          campoNome,
          el("p", { id: "seu-nome-ajuda", class: "campo__ajuda" }, "Obrigatório para gravar. Fica na auditoria."),
        ),
      ),
      el("div", { id: "mensagens", class: "mensagens" }),
      conteudo,
    ),
  );
  app.replaceChildren(casca);
  return conteudo;
}

async function renderizar() {
  if (!configurado) {
    app.replaceChildren(
      el(
        "div",
        { class: "tela-central" },
        el("h1", {}, "Painel não configurado"),
        el("p", {}, "Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja o README) e gere o build novamente."),
      ),
    );
    return;
  }

  const { data } = await supabase.auth.getSession();
  const sessao = data.session;
  const rota = rotaAtual();

  if (emRecuperacao || rota === "redefinir") {
    if (sessao) {
      await paginaRedefinir(app, () => {
        emRecuperacao = false;
        location.hash = "#/valores";
      });
      return;
    }
    emRecuperacao = false;
  }

  if (!sessao) {
    if (rota !== "login") history.replaceState(null, "", "#/login");
    await paginaLogin(app, avisoLogin);
    avisoLogin = "";
    return;
  }

  if (!(await ehAdmin(sessao.user.id))) {
    await sair();
    avisoLogin = "Este usuário não tem permissão de acesso ao painel.";
    location.hash = "#/login";
    await renderizar();
    return;
  }

  if (!MENU.some((m) => m.rota === rota)) {
    history.replaceState(null, "", "#/valores");
    return renderizar();
  }

  vigiarInatividade(() => {
    adminConfirmado = null;
    avisoLogin = "Sua sessão foi encerrada após 30 minutos sem atividade. Entre novamente.";
    location.hash = "#/login";
    void renderizar();
  });

  const conteudo = montarCasca(rota);
  document.title = `${MENU.find((m) => m.rota === rota)!.pagina.titulo} — Painel SGEST`;
  try {
    await MENU.find((m) => m.rota === rota)!.pagina.render(conteudo);
  } catch (e) {
    conteudo.replaceChildren(el("p", { class: "mensagem mensagem--erro", role: "alert" }, `Erro ao carregar: ${(e as Error).message}`));
  }
}

supabase.auth.onAuthStateChange((evento) => {
  if (evento === "PASSWORD_RECOVERY") {
    emRecuperacao = true;
    history.replaceState(null, "", "#/redefinir");
    void renderizar();
  }
});

window.addEventListener("hashchange", () => void renderizar());
void renderizar();
