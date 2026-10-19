/** Utilitários mínimos de DOM (sem framework). Texto sempre entra como textContent. */

type Filho = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Record<string, string> = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const no = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) no.setAttribute(k, v);
  for (const f of filhos) no.append(f);
  return no;
}

export function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
