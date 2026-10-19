// Copia só os woff2 usados de referencias/fontes/ para web/public/fontes/.
// As fontes são comerciais e não são versionadas (ver README, "Fontes").
// Sem elas, o site usa as fontes de fallback do sistema.
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
if (faltando) console.warn(`[fontes] ${faltando} arquivo(s) não encontrado(s) em referencias/fontes; usando fontes de fallback.`);
