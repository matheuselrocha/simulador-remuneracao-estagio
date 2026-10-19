/**
 * npm run snapshot — regenera web/src/parametros.snapshot.json a partir do
 * banco (só leitura, anon key). O snapshot é o fallback do simulador quando
 * o Supabase está fora do ar ou pausado.
 *
 * Lê VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do ambiente ou de web/.env.local.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buscarParametros } from "../web/src/shared/parametros-db.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

function lerEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const arquivo of ["web/.env.local", "web/.env"]) {
    const caminho = join(raiz, arquivo);
    if (!existsSync(caminho)) continue;
    for (const linha of readFileSync(caminho, "utf8").split("\n")) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(linha);
      if (m && env[m[1]!] === undefined) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = lerEnv();
const url = env.VITE_SUPABASE_URL;
const chave = env.VITE_SUPABASE_ANON_KEY;
if (!url || !chave) {
  console.error("Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ambiente ou web/.env.local).");
  process.exit(1);
}

const parametros = await buscarParametros(url, chave);
const destino = join(raiz, "web/src/parametros.snapshot.json");
writeFileSync(destino, JSON.stringify({ geradoEm: new Date().toISOString(), parametros }, null, 2) + "\n");
console.log(
  `Snapshot salvo em web/src/parametros.snapshot.json: ${parametros.bolsa.length} bolsa(s), ${parametros.at.length} AT, ` +
    `anos ${parametros.calendario.anos.join(", ")}, ${parametros.calendario.datasNaoUteis.length} datas.`,
);
