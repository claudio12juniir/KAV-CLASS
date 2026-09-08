-- ============================================================================
-- INSTITUTION Sprint 2 — Presença dupla + decisão de reposição pela escola
-- (briefing 08/09/2026). 100% aditivo: novas colunas nullable em Aula.
-- Escrita à mão via `prisma db execute` (ver institution-sprint1 runbook —
-- `prisma migrate dev` não funciona neste projeto).
-- ============================================================================

ALTER TABLE "Aula" ADD COLUMN "presencaProfessorEm" TIMESTAMP(3);
ALTER TABLE "Aula" ADD COLUMN "presencaAlunoEm" TIMESTAMP(3);
ALTER TABLE "Aula" ADD COLUMN "confirmadoManualmentePor" TEXT;
ALTER TABLE "Aula" ADD COLUMN "motivoManual" TEXT;
ALTER TABLE "Aula" ADD COLUMN "decisaoReposicao" BOOLEAN;
