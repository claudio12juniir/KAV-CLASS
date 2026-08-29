-- ============================================================================
-- Fase 0 (S0.1) — Escola como tenant raiz.
--
-- 100% aditivo e idempotente: cria a tabela Escola, dá 1 Escola própria pra
-- cada Professor que já existe (papel DONO, pacote PACOTE_PROFESSOR — ninguém
-- muda de plano sozinho) e replica esse escolaId em cada Aluno via o
-- professor dono. Nenhuma coluna existente é removida ou renomeada; os campos
-- de assinatura (Stripe etc.) permanecem em Professor nesta migration — só
-- migram pra Escola numa sprint futura, junto da lógica de rota que os lê,
-- pra não misturar duas mudanças de risco na mesma migration.
--
-- Ordem importa: cria tipos -> cria tabela Escola -> adiciona colunas
-- NULLABLE -> faz o backfill -> só então aperta NOT NULL + FK + índice.
-- Rodar sempre em staging com uma cópia do banco antes de produção — ver
-- docs/migrations/s0-1-escola-runbook.md para o passo a passo completo,
-- incluindo verificação pós-backfill e plano de rollback.
-- ============================================================================

-- ─── Tipos ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PapelUsuario" AS ENUM ('DONO', 'GESTOR', 'PROFESSOR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PacoteAssinatura" AS ENUM ('PACOTE_PROFESSOR', 'PACOTE_ESCOLA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tabela Escola ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Escola" (
  "id"        TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "pacote"    "PacoteAssinatura" NOT NULL DEFAULT 'PACOTE_PROFESSOR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Escola_pkey" PRIMARY KEY ("id")
);

-- ─── Colunas novas (nullable até o backfill terminar) ────────────────────

ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "escolaId" TEXT;
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "papel" "PapelUsuario" NOT NULL DEFAULT 'DONO';

ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "escolaId" TEXT;

-- ─── Backfill ─────────────────────────────────────────────────────────────
-- Reaproveita o próprio id do Professor como id da Escola de 1 pessoa: é
-- único por definição, dispensa RETURNING/correlação, e é idempotente (rodar
-- de novo não duplica nada porque o WHERE NOT EXISTS pula quem já tem Escola).

INSERT INTO "Escola" ("id", "nome", "pacote", "createdAt", "updatedAt")
SELECT p."id", p."nome", 'PACOTE_PROFESSOR', p."createdAt", CURRENT_TIMESTAMP
FROM "Professor" p
WHERE NOT EXISTS (SELECT 1 FROM "Escola" e WHERE e."id" = p."id");

UPDATE "Professor"
SET "escolaId" = "id"
WHERE "escolaId" IS NULL;

UPDATE "Aluno" a
SET "escolaId" = p."escolaId"
FROM "Professor" p
WHERE a."professorId" = p."id"
  AND a."escolaId" IS NULL;

-- ─── Trava as colunas + FK + índice, só depois do backfill acima ─────────

ALTER TABLE "Professor" ALTER COLUMN "escolaId" SET NOT NULL;
ALTER TABLE "Aluno" ALTER COLUMN "escolaId" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "Professor" ADD CONSTRAINT "Professor_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Professor_escolaId_idx" ON "Professor"("escolaId");
CREATE INDEX IF NOT EXISTS "Aluno_escolaId_idx" ON "Aluno"("escolaId");
