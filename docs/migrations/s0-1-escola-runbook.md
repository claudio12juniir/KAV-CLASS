# Runbook — S0.1: Escola como tenant raiz

Migration: `kav-class-backend/prisma/migrations/20260829000000_add_escola_multi_tenant/migration.sql`

Aplica a Fase 0 (Sprint S0.1) do [roadmap](../roadmap-escola.md): cria a tabela
`Escola` e dá a cada `Professor` já existente uma Escola de 1 pessoa (papel
`DONO`, pacote `PACOTE_PROFESSOR`). É aditiva e idempotente — pode rodar mais
de uma vez sem duplicar nada — mas mexe em produção de verdade (`DATABASE_URL`
aponta pro Postgres do Supabase), então segue o checklist abaixo, não o
`prisma migrate deploy` direto.

## O que essa migration faz

1. Cria os enums `PapelUsuario` e `PacoteAssinatura`.
2. Cria a tabela `Escola`.
3. Adiciona `escolaId`/`papel` em `Professor` e `escolaId` em `Aluno`, ainda
   nullable.
4. Backfill: 1 Escola por Professor existente (reaproveita o `id` do
   professor como `id` da escola), `Aluno.escolaId` copiado do professor
   dono via `professorId`.
5. Só depois do backfill: `escolaId` vira `NOT NULL` + `FOREIGN KEY` +
   índice, em `Professor` e em `Aluno`.

Nenhuma coluna existente é removida, renomeada ou tem seu tipo alterado.
`server.js` só teve 5 pontos de criação de conta (`Professor`/`Aluno`, e-mail
e Google) ajustados pra preencher `escolaId`/`escola` — o resto das ~55 rotas
não foi tocado nesta sprint.

## Antes de rodar em produção

1. **Backup.** Snapshot do banco Supabase (Database → Backups → criar backup
   manual) imediatamente antes da janela de manutenção.
2. **Staging primeiro.** Restaurar o backup mais recente num banco Postgres à
   parte, apontar um `.env` local pra ele, e rodar:
   ```bash
   cd kav-class-backend
   DATABASE_URL="<url-do-staging>" npx prisma migrate deploy
   ```
3. **Verificar o staging** com as queries da seção abaixo antes de tocar o
   banco real.
4. **Janela de manutenção curta.** A migration em si é rápida (ALTER TABLE
   com DEFAULT constante e backfill são metadata-only / joins simples sobre
   tabelas pequenas), mas ainda assim rodar fora do horário de pico evita
   qualquer lock concorrente com tráfego real.

## Rodando em produção

```bash
cd kav-class-backend
npx prisma migrate deploy
```

Isso aplica exatamente o `migration.sql` já escrito (não gera um novo diff) e
registra a migration como aplicada em `_prisma_migrations`.

## Verificação pós-backfill

Rodar contra o banco de produção logo depois do deploy:

```sql
-- Nenhum professor ou aluno deve ficar sem escolaId
SELECT count(*) FROM "Professor" WHERE "escolaId" IS NULL; -- esperado: 0
SELECT count(*) FROM "Aluno"     WHERE "escolaId" IS NULL; -- esperado: 0

-- Toda Escola tem exatamente o mesmo id do Professor que a originou
SELECT count(*) FROM "Professor" p
  JOIN "Escola" e ON e."id" = p."id"
  WHERE p."escolaId" != e."id"; -- esperado: 0

-- Todo aluno pertence à mesma Escola do professor dele
SELECT count(*) FROM "Aluno" a
  JOIN "Professor" p ON p."id" = a."professorId"
  WHERE a."escolaId" != p."escolaId"; -- esperado: 0

-- Nº de escolas deve bater com o nº de professores (1:1 nesta sprint)
SELECT (SELECT count(*) FROM "Escola") = (SELECT count(*) FROM "Professor"); -- esperado: true
```

Depois, no app: login de um professor existente e de um aluno existente,
conferir que dashboard, agenda, chat, materiais e pagamentos carregam
normalmente — nada nessas telas depende de `escolaId`, é só confirmação de
que a migration não quebrou leitura/escrita nas rotas de sempre.

## Rollback

A migration não remove nem altera dado nenhum de tabela existente — só
adiciona. Reverter é seguro e não perde informação:

```sql
ALTER TABLE "Aluno" DROP CONSTRAINT IF EXISTS "Aluno_escolaId_fkey";
ALTER TABLE "Professor" DROP CONSTRAINT IF EXISTS "Professor_escolaId_fkey";
DROP INDEX IF EXISTS "Aluno_escolaId_idx";
DROP INDEX IF EXISTS "Professor_escolaId_idx";
ALTER TABLE "Aluno" DROP COLUMN IF EXISTS "escolaId";
ALTER TABLE "Professor" DROP COLUMN IF EXISTS "escolaId";
ALTER TABLE "Professor" DROP COLUMN IF EXISTS "papel";
DROP TABLE IF EXISTS "Escola";
DROP TYPE IF EXISTS "PacoteAssinatura";
DROP TYPE IF EXISTS "PapelUsuario";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260829000000_add_escola_multi_tenant';
```

Também reverter o deploy do backend pra uma revisão anterior a este commit —
caso contrário as rotas de cadastro (que agora fazem `escola: { create: ... }`)
voltam a falhar contra um schema sem a coluna.

## O que essa sprint deliberadamente NÃO faz

- Não move `stripeCustomerId`/`assinaturaStatus`/`assinaturaFim`/
  `stripeSessionId` de `Professor` pra `Escola` — fica pra uma sprint
  seguinte, junto da lógica de rota que os lê (checkout, dashboard, cron de
  vencimento), pra não misturar duas mudanças de risco na mesma migration.
- Não adiciona telas de GESTOR nem convite de professor — isso é S0.2.
- Não muda nenhuma das ~55 rotas existentes além dos 5 pontos de criação de
  conta.
