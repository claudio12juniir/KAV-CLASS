-- ============================================================================
-- Índices únicos de Conta.email/googleId, em arquivo PRÓPRIO de propósito:
-- `prisma db execute --file` manda o arquivo inteiro como uma única
-- mensagem ao Postgres (simple-query protocol), o que envolve tudo numa
-- transação implícita — e CREATE INDEX CONCURRENTLY não roda dentro de
-- transação. Por isso não pode estar no mesmo arquivo da migration anterior
-- (20260915120000). Rodar esta como sua própria invocação de `db execute`.
--
-- googleId é único só quando preenchido (a maioria das Contas não usa
-- Google) — índice parcial, mesmo padrão de outros campos opcionais únicos
-- do schema.
-- ============================================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Conta_email_key" ON "Conta"("email");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Conta_googleId_key" ON "Conta"("googleId") WHERE "googleId" IS NOT NULL;
