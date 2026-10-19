/**
 * npm run verificar:producao — confere, sem gravar nada, as configurações
 * críticas do projeto Supabase de produção:
 *   1. cadastro público DESATIVADO ("Allow new users to sign up" desligado);
 *   2. anon lê os valores publicados;
 *   3. anon NÃO lê o log de auditoria.
 *
 * Usa VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ambiente ou web/.env.local).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const env: Record<string, string | undefined> = { ...process.env };
for (const arquivo of ["web/.env.local", "web/.env"]) {
  const caminho = join(raiz, arquivo);
  if (!existsSync(caminho)) continue;
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(linha);
    if (m && env[m[1]!] === undefined) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const chave = env.VITE_SUPABASE_ANON_KEY;
if (!url || !chave) {
  console.error("Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}
const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };
let falhas = 0;
const resultado = (ok: boolean, texto: string) => {
  console.log(`${ok ? "OK   " : "FALHA"} ${texto}`);
  if (!ok) falhas++;
};

const settings = (await (await fetch(`${url}/auth/v1/settings`, { headers: cabecalhos })).json()) as { disable_signup?: boolean };
resultado(settings.disable_signup === true, "Cadastro público desativado (Authentication → Sign In / Providers → Allow new users to sign up = OFF)");

const valores = await fetch(`${url}/rest/v1/valores?select=tipo&limit=1`, { headers: cabecalhos });
resultado(valores.ok, `anon lê valores (HTTP ${valores.status})`);

const auditoria = await fetch(`${url}/rest/v1/auditoria?select=id&limit=1`, { headers: cabecalhos });
const linhas = auditoria.ok ? ((await auditoria.json()) as unknown[]) : [];
resultado(!auditoria.ok || linhas.length === 0, `anon não lê a auditoria (HTTP ${auditoria.status})`);

process.exit(falhas ? 1 : 0);
