import { el } from "../../shared/dom.ts";
import type { Pagina } from "../main.ts";
import { formularioNovaSenha } from "./login.ts";

export const paginaSenha: Pagina = {
  titulo: "Alterar senha",
  async render(conteudo) {
    conteudo.replaceChildren(
      el(
        "section",
        { class: "bloco bloco--estreito" },
        el(
          "p",
          { class: "nota" },
          "O login é compartilhado pela equipe do SGEST. Ao trocar a senha, avise a equipe e guarde a nova senha com o responsável pela conta Gmail do SGEST.",
        ),
        formularioNovaSenha(() => {}),
      ),
    );
  },
};
