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
10. [Desligamento e férias: regras confirmadas e pendências](#desligamento-e-férias-regras-confirmadas-e-pendências)
11. [Modelo de dados e privacidade](#modelo-de-dados-e-privacidade)
12. [Fontes e marca](#fontes-e-marca)

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

> **Modo "Último mês (desligamento)" ativo no site desde 23/10/2026**, com a observação "Simulação aproximada" junto ao valor a receber, porque ainda há pendências com a Folha (ver [Desligamento e férias](#desligamento-e-férias-regras-confirmadas-e-pendências)). Para desativar, mude `RECURSOS.desligamento` para `false` em `web/src/simulador/main.ts`.

O motor implementa uma regra provisória para cada ponto abaixo, parametrizada em `calc/src/parametros.ts` (`RegrasProvisorias`), e o simulador mostra "Regra a confirmar com o SGEST" quando o ponto afeta o resultado.

| # | Ponto | Regra provisória | Alternativa já implementada |
|---|---|---|---|
| 1 | Fração de mês nas férias proporcionais | conta só meses completos | fração ≥ 15 dias conta como mês |
| 2 | ~~Recesso do 1º ano não gozado~~ | **resolvido**: ver "Desligamento e férias" | — |
| 3 | Desligamento no meio do mês | bolsa por dias corridos até a saída (÷ dias do mês); AT por dias úteis até a saída | mês integral |
| 4 | Desconto do mês anterior após reajuste | usa o valor vigente em M−1 (mês em que foi pago); aplicado a AT **e bolsa** | valor vigente em M |
| 5 | Irregularidade de ponto e atestado sem abono descontam a bolsa? | sim, contam como falta injustificada (o slide do SGEST só cita o AT) | — (texto de ajuda) |

Outras decisões que vale confirmar:
- **Feriados de 2026**: a planilha só tinha as datas; descrições e tipos do seed foram inferidos e marcados "a conferir". **29/06/2026** não tem descrição conhecida.
- **Data final do contrato** de quem entra em 29/02: entrada + 2 anos − 1 dia = 28/02.
- Um novo valor não pode ter vigência anterior ao mês atual (não reescreve folhas passadas).
- **Bolsa diária = bolsa mensal ÷ número de dias do mês** (28 a 31), por decisão do SGEST em 20/10/2026, no lugar do divisor fixo 30 da especificação original. Vale para a 1ª folha proporcional (dias corridos desde a entrada), faltas injustificadas (dias do mês da falta) e desligamento no meio do mês. **Exceção: recesso indenizado usa bolsa ÷ 30** (30 dias de recesso = uma bolsa cheia, também decisão do SGEST). A coluna `valores.divisor` do banco ficou como legado e não é usada.

## Desligamento e férias: regras confirmadas e pendências

Levantamento feito pelo SGEST para reativar o modo "Último mês (desligamento)". **As regras abaixo já estão implementadas no motor e testadas** (exemplo do SGEST incluso); o modo está ativo no site desde 23/10/2026, com a observação de simulação aproximada até as pendências do fim desta seção serem respondidas.

### Confirmadas (SGEST, 23/10/2026)

1. As férias (recesso) do estagiário são **sempre de 30 dias**, sem parcelamento, e **só podem ser tiradas depois de completar 1 ano** de contrato.
2. **Com 1 ano completo**, o direito às primeiras férias é integral. Em qualquer saída a partir daí, se não as tiver usufruído, o estagiário recebe **30 dias em pecúnia**.
3. **Saída exatamente aos 12 meses:** 30 dias em pecúnia (não houve como usufruir).
4. **Saída entre 12 e 24 meses:** primeiras férias em pecúnia (se não usufruídas) + **segundas férias proporcionais** em pecúnia.
5. **As últimas férias são sempre usufruídas nos 30 dias anteriores ao fim do contrato** e isso é **obrigatório**: quem completa 2 anos não recebe as segundas férias em pecúnia. Quem não usufruiu as primeiras pode:
   - usufruir as primeiras e as segundas seguidas no fim do contrato; ou
   - usufruir só as segundas e receber as primeiras em pecúnia.
6. **AT nas últimas férias:** os dias de férias não são presenciais, então o AT deles não é devido. A última folha desconta o AT dos dias de férias do mês anterior **e** do próprio mês. O simulador deve **preencher esses dias automaticamente** a partir da data final do contrato.
7. Dia de recesso em pecúnia vale **bolsa ÷ 30** (30 dias = uma bolsa cheia), em qualquer mês (20/10/2026).
8. **Prazo do contrato:** o termo é sempre de **1 ano, prorrogável uma única vez por mais 1 ano**, sem exceções. O contrato termina, portanto, aos 12 meses (sem prorrogação), aos 24 meses ou antes, por desligamento (23/10/2026).
9. **Saída durante as férias:** os dias de férias que faltavam usufruir são **pagos em pecúnia**. Quem está nas últimas férias já está com o desligamento em andamento no sistema; não é um caso à parte (23/10/2026).
10. **O motivo do desligamento não muda** o direito às férias em pecúnia (23/10/2026).

### Como o simulador aplica as regras

- **Pergunta "Suas primeiras férias"** (só para quem sai depois de completar 1 ano):
  - **Já tirei os 30 dias**: nada em pecúnia pelas primeiras.
  - **Ainda não tirei**: 30 dias em pecúnia. Para quem completa 2 anos o texto vira "vou tirar só as últimas e receber as primeiras em dinheiro".
  - **Estou de férias (saí durante as férias)**: pede a data de início; os dias usufruídos até a saída são pagos como bolsa normal e os que faltavam para os 30, em pecúnia.
  - **Vou tirar junto com as últimas** (só para quem completa 2 anos): as primeiras ocupam os 30 dias antes das últimas; nada em pecúnia.
- **Saída exatamente ao completar 12 meses:** a pergunta não aparece; 30 dias em pecúnia.
- **Segundas férias proporcionais** (12 a 24 meses): 2,5 dias por mês completo desde o 1º ano. **Menos de 1 ano:** 2,5 dias por mês completo desde a entrada. **2 anos completos:** nada, as últimas férias são usufruídas.
- **Dias de férias:** calculados pelo simulador (últimas férias = 30 dias finais do contrato; primeiras em andamento = do início até a saída).
  - No **mês da saída** não geram auxílio-transporte. O extrato mostra "não devido: N dias úteis de férias", sem crédito e desconto.
  - No **mês anterior**, o AT já foi pago adiantado e é descontado na última folha.
  - Os limites dos campos de ausência já excluem esses dias; o estagiário informa só as outras ausências.
- **Pecúnia:** bolsa ÷ 30 por dia. **Bolsa dos dias do mês:** bolsa ÷ dias do mês.

**Exemplo do SGEST** (teste automático): entrada 01/01/2025, férias desde 01/07/2026, saída no 15º dia (15/07/2026):

| Linha | Valor |
|---|---|
| Bolsa de 01/07 a 15/07 (15 dias × bolsa ÷ 31) | R$ 793,32 |
| Auxílio-transporte (11 dias úteis de férias) | não devido |
| Primeiras férias não usufruídas (15 dias × bolsa ÷ 30) | R$ 819,77 |
| Segundas férias proporcionais (6 meses × 2,5 = 15 dias × bolsa ÷ 30) | R$ 819,77 |
| **Líquido** | **R$ 2.432,86** |

O período de 01/01 a 15/07/2026 tem 6 meses **e 15 dias**. Se a Folha contar a fração como mês, as segundas proporcionais vão a 17,5 dias (R$ 956,39) e o total a R$ 2.569,48.

### Ainda em aberto (levar ao Serviço de Elaboração da Folha)

- Faltando 1 dia para os 12 meses: proporcional de 11 meses (27,5 dias)?
- Fração de mês no proporcional: 7 meses e 20 dias conta 7, 8 ou dias exatos?
- Saída no meio do mês e no dia 1º; fim do contrato em fim de semana/feriado; estágio anterior no Senado (conta para o limite de 2 anos?).
- Ocorrências que chegam depois do fechamento da última folha; desconto maior que o valor a receber.
- Mais de um valor de bolsa (nível, carga horária); reajuste no mês da saída.
- Em qual folha entra o acerto. Pedir um demonstrativo real de cada caso para virar teste automático.

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
