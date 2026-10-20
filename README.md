# Simulador de Remuneração de Estágio — SGEST · Senado Federal

Site estático com duas partes:

- **Simulador público** (`/`): o estagiário estima quanto vai receber num mês (bolsa + auxílio-transporte − descontos). O cálculo é feito **no navegador**; nenhum dado do estagiário é enviado ou guardado.
- **Painel administrativo** (`/admin/`): a equipe do SGEST atualiza o valor da bolsa, o valor diário do auxílio-transporte (AT) e o calendário de feriados e pontos facultativos.

Substitui a planilha *Calculadora Financeira – Estagiários* (em `referencias/`), corrigindo os bugs dela.

---

## Sumário

1. [Estrutura](#estrutura)
2. [Rodar localmente](#rodar-localmente)
3. [Testes](#testes)
4. [Publicar o site](#publicar-o-site)
5. [Configuração do Supabase (passo a passo)](#configuração-do-supabase-passo-a-passo)
6. [Backup do banco](#backup-do-banco)
7. [Quem guarda a "chave mestra"](#quem-guarda-a-chave-mestra)
8. [Guia para a equipe do SGEST](#guia-para-a-equipe-do-sgest)
9. [Pontos em aberto (regras a confirmar)](#pontos-em-aberto-regras-a-confirmar)
10. [Modelo de dados e privacidade](#modelo-de-dados-e-privacidade)
11. [Fontes e marca](#fontes-e-marca)

---

## Estrutura

```
calc/                    motor de cálculo puro (TypeScript, sem DOM/IO) + testes Vitest
web/                     front (Vite + TypeScript, sem framework); public/fontes = 4 woff2 usados
  index.html             simulador público
  admin/index.html       painel (rotas por hash: #/valores, #/calendario…)
  src/parametros.snapshot.json   cópia dos parâmetros usada se o Supabase falhar
supabase/
  migrations/            schema, RLS, triggers de regras e de auditoria
  seed.sql               valores e calendário 2026 da planilha
  tests/                 testes de banco e segurança (Supabase local)
  config.toml            cadastro público desligado, senha mínima de 12
scripts/                 snapshot, cópia das fontes, verificação de produção
.github/workflows/       CI, deploy no GitHub Pages e "manter Supabase ativo"
referencias/             planilha original, marca, padrão cromático (fontes fora do git)
```

## Rodar localmente

Requisitos: **Node 20+**, **Docker** (para o Supabase local) e a **Supabase CLI**.

```bash
npm install
```

```bash
supabase start
```

```bash
supabase db reset
```

`supabase db reset` aplica as migrations e o `seed.sql`. Depois crie `web/.env.local` a partir de `web/.env.example`, com a `API URL` e a `anon key` mostradas por `supabase status`:

```bash
supabase status
```

```bash
npm run dev
```

- Simulador: http://localhost:5173/
- Painel: http://localhost:5173/admin/
- E-mails locais (redefinição de senha): http://127.0.0.1:54324 (Inbucket/Mailpit)

Para entrar no painel localmente, crie o usuário no Studio local (http://127.0.0.1:54323 → Authentication → Add user) e registre-o como admin (passo 6 da configuração abaixo).

Sem `web/.env.local`, o simulador funciona com o snapshot e mostra o aviso "valores podem estar desatualizados".

## Testes

| Comando | O que cobre |
|---|---|
| `npm test` | motor de cálculo: os 16 cenários obrigatórios + bordas (datas, arredondamento, regras provisórias) |
| `npm run test:db` | banco e segurança (exige `supabase start` + `supabase db reset`): anon só lê; cadastro desativado; não-admin não grava; "Seu nome" obrigatório; data duplicada; auditoria completa e imutável; schema contém só as 5 tabelas previstas; RLS em todas |
| `npm run typecheck` | TypeScript em todo o projeto |
| `npm run build` | gera `dist/` |
| `npm run verificar:producao` | sem gravar nada, confere no projeto real: cadastro desativado, anon lê valores, anon não lê auditoria |

### Testes de banco sem Docker (projeto remoto)

`npm run test:db` também roda contra um projeto Supabase remoto quando existe `supabase/.env.test` (fora do git):

```
SUPABASE_URL=https://SEU_REF.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # só neste arquivo local; nunca no front ou no git
SUPABASE_PROJECT_REF=SEU_REF
```

e com `SUPABASE_ACCESS_TOKEN` (token da conta) no ambiente, para o SQL direto. **Atenção:** os testes gravam dados e a auditoria é imutável. Rode só num projeto sem uso real (ou antes de publicar) e depois zere o banco: apague as tabelas/tipos/funções do app e as linhas `20261018%` de `supabase_migrations.schema_migrations` e de `seed_files`, e rode `supabase db push --include-seed`. Em 19/10/2026 a bateria completa (27 testes) passou no projeto de produção antes da publicação, que em seguida foi zerado.

## Publicar o site

```bash
npm run build
```

Gera `dist/` estático (caminhos relativos: funciona na raiz do domínio ou num subcaminho como GitHub Pages). O painel fica em `dist/admin/` e usa rotas por hash, então não precisa de regra de reescrita.

Variáveis de ambiente do build (**só estas duas**):

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL do Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon/public key (é pública por natureza; a segurança vem da RLS) |

> **Nunca** use a `service_role key` no front, em variáveis de build ou no repositório.

### GitHub Pages (hospedagem atual)

- Endereço: **https://matheuselrocha.github.io/simulador-remuneracao-estagio/** (painel em `.../admin/`).
- Cada push na `main` dispara o workflow *Publicar no GitHub Pages* (`.github/workflows/pages.yml`): testes → build → deploy.
- As duas variáveis vêm dos secrets do repositório `SUPABASE_URL` e `SUPABASE_ANON_KEY` (Settings → Secrets and variables → Actions). Os mesmos secrets alimentam o keepalive. Sem eles o site sai com o snapshot.
- Republicar sem mudar código: Actions → *Publicar no GitHub Pages* → *Run workflow*.

Outras opções (Vercel / Netlify): build command `npm run build`, output `dist`, as duas variáveis acima.

Antes de publicar, atualize o fallback e faça commit dele:

```bash
npm run snapshot
```

## Configuração do Supabase (passo a passo)

1. **Criar o projeto** em https://supabase.com entrando com o **Gmail institucional do SGEST**. Região: `South America (São Paulo)`. Guarde a senha do banco junto com a do Gmail.
2. **Aplicar as migrations e o seed** (no computador, na pasta do projeto):
   ```bash
   supabase login
   ```
   ```bash
   supabase link --project-ref SEU_PROJECT_REF
   ```
   ```bash
   supabase db push --include-seed
   ```
   Nada é criado "na mão" no dashboard, exceto o usuário de login.
3. **⚠️ Desativar o cadastro público (OBRIGATÓRIO).** Authentication → Sign In / Providers → desligue **"Allow new users to sign up"** → Save.
   Com o cadastro aberto, qualquer pessoa com a anon key (pública) criaria uma conta. A RLS continua barrando escrita de quem não está na tabela `admins`, mas essa é a primeira barreira. Confira com `npm run verificar:producao`.
4. **Senha mínima de 12 caracteres.** Authentication → Policies (ou Sign In / Providers → Email) → *Minimum password length* = 12.
5. **Criar o usuário único.** Authentication → Users → Add user → Create new user: e-mail = Gmail do SGEST, senha forte (12+), marque *Auto Confirm User*.
6. **Registrar esse usuário como admin.** SQL Editor:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'GMAIL_DO_SGEST@gmail.com';
   ```
7. **URLs do "esqueci a senha".** Authentication → URL Configuration:
   - *Site URL*: `https://matheuselrocha.github.io/simulador-remuneracao-estagio/`
   - *Redirect URLs*: `https://matheuselrocha.github.io/simulador-remuneracao-estagio/admin/` (e `http://localhost:5173/admin/` se for testar localmente)
8. **Copiar URL e anon key.** Project Settings → API → *Project URL* e *anon public* → secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` do repositório no GitHub (usados pelo deploy e pelo keepalive).
9. **Manter o projeto ativo.** Com os secrets do passo 8, o workflow *Manter Supabase ativo* faz uma leitura a cada 3 dias (o plano gratuito pausa após ~7 dias sem atividade). **Se o projeto pausar mesmo assim**, basta entrar no dashboard e clicar em *Restore/Resume project*; enquanto isso o simulador usa o snapshot e avisa.
10. **Conferir.** `npm run verificar:producao` deve mostrar três "OK".

## Backup do banco

O plano gratuito **não tem backup automático restaurável**. Os dados são poucos; faça um backup:
- depois de cada reajuste, de publicar um calendário e, no mínimo, uma vez por mês.

Opção 1 — dashboard: Table Editor → abra `valores`, `anos_calendario`, `datas_nao_uteis` e `auditoria` → *Export → CSV*.

Opção 2 — linha de comando (gera SQL restaurável):

```bash
supabase db dump --data-only --schema public -f backup-AAAA-MM-DD.sql
```

Guarde os arquivos no Google Drive do SGEST.

## Quem guarda a "chave mestra"

A senha do **Gmail institucional do SGEST** dá acesso a tudo: ao projeto Supabase, à redefinição de senha do painel e à conta de hospedagem. Defina por escrito:

- **titular**: a chefia do SGEST, que guarda a senha;
- **substituto**: uma segunda pessoa com acesso, para férias e afastamentos;
- verificação em duas etapas ativa no Gmail, com telefone e e-mail de recuperação institucionais;
- ao trocar a equipe: trocar a senha do Gmail **e** a do painel (Alterar senha).

## Guia para a equipe do SGEST

Endereço do painel: https://matheuselrocha.github.io/simulador-remuneracao-estagio/admin/ Ao entrar, preencha **"Seu nome"** no topo: ele vai para a auditoria de tudo o que você gravar. A sessão cai após 30 minutos sem uso.

### Reajustar a bolsa ou o auxílio-transporte

1. Menu **Valores** → *Cadastrar novo valor*.
2. Escolha o tipo, digite o valor (ex.: `1.700,00`) e o **mês de início da vigência** (sempre o dia 1º).
3. Confira a prévia ("Folha de novembro/2026: bruto passa de R$ X para R$ Y") → *Revisar e salvar* → marque a confirmação → *Salvar novo valor*.

Valores já vigentes não são editados. Se digitou errado um valor **futuro**, use *Corrigir* ou *Excluir* no histórico.

### Cadastrar um feriado ou ponto facultativo novo

1. Viu o ato na intranet? Menu **Calendário** → selecione o ano.
2. Clique no dia na grade (ou preencha a data) → descrição → tipo → fonte (ex.: "Ato da Diretoria-Geral nº …") → *Salvar data*.
3. Se o ano já está publicado, o painel mostra o impacto ("outubro/2026 passa de 20 para 19 dias úteis") e a mudança vale na hora.

Datas em fim de semana são aceitas, mas ficam marcadas "sem efeito".

### Publicar o calendário do ano seguinte

A partir de outubro o painel avisa se o ano seguinte não está publicado.

1. **Calendário** → *Criar ano* (ex.: 2027) → *Criar em rascunho*.
2. Cadastre todas as datas e confira a tabela "Dias úteis por mês" contra a intranet.
3. *Publicar 2027* → marque a confirmação → *Publicar*. Ano publicado não volta a rascunho.

## Pontos em aberto (regras a confirmar)

O motor implementa uma regra provisória para cada ponto abaixo, parametrizada em `calc/src/parametros.ts` (`RegrasProvisorias`), e o simulador mostra "Regra a confirmar com o SGEST" quando o ponto afeta o resultado.

| # | Ponto | Regra provisória | Alternativa já implementada |
|---|---|---|---|
| 1 | Fração de mês no recesso proporcional | conta só meses completos | fração ≥ 15 dias conta como mês |
| 2 | Recesso do 1º ano não gozado por quem sai entre 12 e 24 meses | checkbox "não tirei o recesso do 1º ano" soma +30 dias | ignorar |
| 3 | Desligamento no meio do mês | bolsa por dias corridos até a saída (÷ dias do mês); AT por dias úteis até a saída | mês integral |
| 4 | Desconto do mês anterior após reajuste | usa o valor vigente em M−1 (mês em que foi pago); aplicado a AT **e bolsa** | valor vigente em M |
| 5 | Irregularidade de ponto e atestado sem abono descontam a bolsa? | sim, contam como falta injustificada (o slide do SGEST só cita o AT) | — (texto de ajuda) |

Outras decisões que vale confirmar:
- **Feriados de 2026**: a planilha só tinha as datas; descrições e tipos do seed foram inferidos e marcados "a conferir". **29/06/2026** não tem descrição conhecida.
- **Data final do contrato** de quem entra em 29/02: entrada + 2 anos − 1 dia = 28/02.
- Um novo valor não pode ter vigência anterior ao mês atual (não reescreve folhas passadas).
- **Bolsa diária = bolsa mensal ÷ número de dias do mês** (28 a 31), por decisão do SGEST em 20/10/2026, no lugar do divisor fixo 30 da especificação original. Vale para a 1ª folha proporcional (dias corridos desde a entrada), faltas injustificadas (dias do mês da falta), desligamento no meio do mês e recesso indenizado (dias do mês do desligamento). A coluna `valores.divisor` do banco ficou como legado e não é usada. Consequência a confirmar: 30 dias de recesso num mês de 31 dias valem menos que uma bolsa cheia (R$ 1.586,64 em vez de R$ 1.639,53).

## Modelo de dados e privacidade

O banco guarda **apenas** estas 5 tabelas (verificado em teste):

| Tabela | Colunas |
|---|---|
| `admins` | `user_id` |
| `valores` | `id, tipo, valor_centavos, divisor, vigencia_inicio, responsavel, criado_em, atualizado_em` |
| `anos_calendario` | `ano, status, publicado_em, responsavel, criado_em, atualizado_em` |
| `datas_nao_uteis` | `id, data, ano, descricao, tipo, fonte, responsavel, criado_em, atualizado_em` |
| `auditoria` | `id, ocorrido_em, tabela, operacao, registro, valor_anterior, valor_novo, responsavel, auth_uid` |

- Nenhum dado de estagiário: o simulador só faz **GET** dos parâmetros publicados; sem cookies, sem storage, sem analytics.
- RLS em todas as tabelas. `anon` só lê `valores` e anos **publicados**; escrita só para `auth.uid()` presente em `admins`.
- Auditoria gerada por **trigger** no Postgres; `UPDATE`/`DELETE`/`TRUNCATE` bloqueados até para o dono do banco. Exclusões passam pela função `excluir_registro(tabela, id, responsavel)`, que leva "Seu nome" ao log.
- Cálculo em centavos inteiros, arredondamento half-up por linha (3 × 1.639,53 ÷ 31 = 158,664 → R$ 158,66).

## Fontes e marca

- As fontes são **comerciais**. O site usa e versiona só 4 arquivos woff2 em `web/public/fontes/` (Rotis Sans Serif Bold/ExtraBold, Verdana Regular/Bold), que ficam baixáveis por quem acessa o site. Os originais completos em `referencias/fontes/` (50 MB) não vão para o git. **A publicação com essas fontes pressupõe a licença web do Senado**; se a licença não cobrir, apague `web/public/fontes/` e o site passa a usar as fontes do sistema (tokens em `tokens.css`).
- Logos: SVGs originais em `web/public/marca/`, sem alteração (o SVG usa `#008ACF` internamente; a interface usa as cores do manual).
- Cores do manual como tokens em `web/src/styles/tokens.css`. O gradiente `189deg, 27%` foi conferido contra o degradê do logo. Texto branco sobre azul céu (4,5:1) e sobre o fim do gradiente (3,4:1) só em texto grande; para texto branco pequeno usa-se `--sf-azul-ceu-escuro` (5,8:1). O verde é só filete.
