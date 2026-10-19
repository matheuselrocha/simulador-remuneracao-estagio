// Atualiza os woff2 usados em web/public/fontes/ a partir de referencias/fontes/
// (quando a pasta de referência existe). Os 4 arquivos de web/public/fontes/ são
// versionados; referencias/fontes/ (originais, 50 MB) não é.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "web/public/fontes");
const arquivos = {
  "RotisSansSerif-Bold.woff2": "referencias/fontes/Rotis/Sans Serif/RotisSansSerif-Bold.woff2",
  "RotisSansSerif-ExtraBold.woff2": "referencias/fontes/Rotis/Sans Serif/RotisSansSerif-ExtraBold.woff2",
  "Verdana.woff2": "referencias/fontes/Verdana/Verdana.woff2",
  "Verdana-Bold.woff2": "referencias/fontes/Verdana/Verdana-Bold.woff2",
};
mkdirSync(destino, { recursive: true });
let faltando = 0;
for (const [nome, origem] of Object.entries(arquivos)) {
  const caminho = join(raiz, origem);
  if (existsSync(caminho)) copyFileSync(caminho, join(destino, nome));
  else faltando++;
}
if (faltando && !Object.keys(arquivos).every((n) => existsSync(join(destino, n)))) {
  console.warn(`[fontes] ${faltando} arquivo(s) não encontrado(s); o site usará as fontes de fallback.`);
}
