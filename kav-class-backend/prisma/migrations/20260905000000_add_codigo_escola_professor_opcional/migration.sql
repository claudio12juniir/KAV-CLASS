-- ============================================================================
-- Fase 6 (S6.1) — Código de Escola para autoingresso de aluno.
-- 100% aditivo: nova coluna nullable em Escola, e relaxamento de NOT NULL
-- em Aluno.professorId (nenhum aluno existente perde o professor que já
-- tinha — a coluna só passa a aceitar nulo pra quem entra pelo código novo).
-- ============================================================================

ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "codigoConvite" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Escola_codigoConvite_key" ON "Escola"("codigoConvite");

ALTER TABLE "Aluno" ALTER COLUMN "professorId" DROP NOT NULL;
