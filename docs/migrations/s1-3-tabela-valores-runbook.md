# Runbook — S1.3: Tabela de valores versionada

Migration: `kav-class-backend/prisma/migrations/20260829040000_add_tabela_valores/migration.sql`

Terceira sprint da Fase 1 do [roadmap](../roadmap-escola.md). Dá ao preço um
motor de verdade — hoje é só um número solto (`Aluno.valorMensalidade`)
digitado pelo professor em `/api/configurar-aluno`, sem histórico nem
reaproveitamento entre cursos.

## O que essa migration faz

- Cinco tabelas novas: `Modalidade`, `PlanoPagamento`, `TabelaValores`,
  `VersaoTabelaValores`, `ValorPlano`.
- Uma coluna **nullable** em `Curso`: `tabelaValoresId`.
- Sem backfill.

## O motor de precificação

- **Modalidade** — frequência (reaproveita o enum `RecorrenciaAula` que já
  existia) + duração. Uma pode ser marcada `padrao` (a rota de criar/editar
  desmarca as outras automaticamente, numa transação).
- **PlanoPagamento** — nome + periodicidade (`MENSAL`/`SEMESTRAL`/`ANUAL`/`LIVRE`).
- **TabelaValores** — pode ser vinculada a vários `Curso` (reaproveitamento,
  igual à Emusys: editar/versionar a tabela propaga pra todos os cursos que
  apontam pra ela).
- **VersaoTabelaValores** — o motor do reajuste. `ativa: false` por padrão
  (rascunho); só afeta preço resolvido quando ativada.
- **ValorPlano** — preço por combinação (versão, plano de pagamento, forma
  de pagamento opcional). `metodo = null` é o fallback "qualquer forma";
  uma linha com `metodo` preenchido sobrepõe só aquela forma específica.

**"Só uma versão ativa por tabela" é garantido na aplicação, não no banco**
— a rota de ativação desativa as irmãs na mesma transação antes de ativar a
nova. Decidi não usar um índice único parcial (`WHERE ativa = true`) porque
isso exigiria uma migration com SQL fora do que o Prisma schema DSL expressa
nativamente, criando risco de drift entre schema.prisma e o banco real sem
ganho proporcional — o invariante já fica garantido do jeito mais simples.

## Regra de negócio central (testada em staging, não só lida no código)

**Ativar uma nova versão nunca muda o valor de quem já está matriculado.**
Isso é verdade quase "de graça": `Aluno.valorMensalidade` continua sendo um
valor gravado no momento da matrícula/configuração — essa migration não
toca nele, não cria nenhuma referência viva entre `Aluno` e
`VersaoTabelaValores`. `/api/configurar-aluno` continua exatamente como
estava; ligar a matrícula a esse motor novo (ler o preço vigente na hora de
matricular) fica pra uma sprint futura, deliberadamente fora do escopo desta.

## Rotas novas

| Rota | O que faz |
|---|---|
| `GET/POST /api/modalidades`, `PATCH /api/modalidades/:id` | catálogo de modalidades da Escola |
| `GET/POST /api/planos-pagamento` | catálogo de planos de pagamento da Escola |
| `GET/POST /api/tabelas-valores`, `GET /api/tabelas-valores/:id` | tabelas e seu detalhe (todas as versões, mais recente primeiro) |
| `POST /api/tabelas-valores/:id/versoes` | cria versão nova — rascunho por padrão, `ativarImediatamente: true` pra pular direto |
| `PUT /api/tabelas-valores/versoes/:id/ativar` | ativa uma versão (desativa as irmãs) |
| `GET /api/cursos/:id/preco?planoPagamentoId=&metodo=` | resolve o preço vigente (versão ativa da tabela do curso), com fallback pra "qualquer forma" |
| `PATCH /api/cursos/:id` (já existia) | ganhou o campo `tabelaValoresId` |

## Validado em staging — ponta a ponta, com dados fictícios

Rodei a migration no mesmo staging usado pra S0.1–S1.2 (`localhost:5433`) e
testei o ciclo completo via HTTP real:

1. Criar plano de pagamento, modalidade, tabela de valores.
2. Vincular a tabela a um curso existente.
3. Criar versão 1 já ativa: R$150 qualquer forma, R$140 no Pix.
4. Resolver preço — Pix devolveu 140 (override), boleto devolveu 150
   (fallback), exatamente como desenhado.
5. Criar versão 2 (reajuste) **sem** ativar — preço resolvido continuou 150.
6. Ativar versão 2 — preço resolvido passou a 180; conferido no banco que
   só a versão 2 ficou com `ativa = true`.
7. Conferido no banco que `Aluno.valorMensalidade` dos alunos de teste
   continuou exatamente como estava (null, nunca tocado) durante todo o
   processo.

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "TabelaValores"; -- esperado: 0 logo após o deploy
SELECT count(*) FROM "VersaoTabelaValores"; -- esperado: 0
SELECT count(*) FROM "Curso" WHERE "tabelaValoresId" IS NOT NULL; -- esperado: 0
```

## Rollback

```sql
ALTER TABLE "ValorPlano" DROP CONSTRAINT IF EXISTS "ValorPlano_versaoId_fkey";
ALTER TABLE "ValorPlano" DROP CONSTRAINT IF EXISTS "ValorPlano_planoPagamentoId_fkey";
ALTER TABLE "VersaoTabelaValores" DROP CONSTRAINT IF EXISTS "VersaoTabelaValores_tabelaId_fkey";
ALTER TABLE "TabelaValores" DROP CONSTRAINT IF EXISTS "TabelaValores_escolaId_fkey";
ALTER TABLE "PlanoPagamento" DROP CONSTRAINT IF EXISTS "PlanoPagamento_escolaId_fkey";
ALTER TABLE "Modalidade" DROP CONSTRAINT IF EXISTS "Modalidade_escolaId_fkey";
ALTER TABLE "Curso" DROP CONSTRAINT IF EXISTS "Curso_tabelaValoresId_fkey";
DROP TABLE IF EXISTS "ValorPlano";
DROP TABLE IF EXISTS "VersaoTabelaValores";
DROP TABLE IF EXISTS "TabelaValores";
DROP TABLE IF EXISTS "PlanoPagamento";
DROP TABLE IF EXISTS "Modalidade";
ALTER TABLE "Curso" DROP COLUMN IF EXISTS "tabelaValoresId";
DROP TYPE IF EXISTS "PeriodicidadePlano";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260829040000_add_tabela_valores';
```
