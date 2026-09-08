-- ============================================================================
-- INSTITUTION Sprint 11 — Experimentais + Comunicados com push
-- (briefing 08/09/2026). 100% aditivo.
-- ============================================================================

ALTER TABLE "EnvioComunicado" ADD COLUMN "alunoId" TEXT;
ALTER TABLE "EnvioComunicado" ADD COLUMN "lidoEm" TIMESTAMP(3);

CREATE INDEX "EnvioComunicado_alunoId_lidoEm_idx" ON "EnvioComunicado"("alunoId", "lidoEm");

ALTER TABLE "EnvioComunicado" ADD CONSTRAINT "EnvioComunicado_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
