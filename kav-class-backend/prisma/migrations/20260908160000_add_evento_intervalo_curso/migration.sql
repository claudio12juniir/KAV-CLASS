-- ============================================================================
-- INSTITUTION Sprint 10 — Cronograma (ex-Calendário), briefing 08/09/2026.
-- 100% aditivo: novos valores de enum, coluna nullable, tabela de junção.
-- ============================================================================

ALTER TYPE "TipoDiaNaoLetivo" ADD VALUE IF NOT EXISTS 'PALESTRA';
ALTER TYPE "TipoDiaNaoLetivo" ADD VALUE IF NOT EXISTS 'PASSEIO';
ALTER TYPE "TipoDiaNaoLetivo" ADD VALUE IF NOT EXISTS 'FESTIVAL';
ALTER TYPE "TipoDiaNaoLetivo" ADD VALUE IF NOT EXISTS 'APRESENTACAO';
ALTER TYPE "TipoDiaNaoLetivo" ADD VALUE IF NOT EXISTS 'FERIAS';

ALTER TABLE "DiaNaoLetivo" ADD COLUMN "dataFim" TIMESTAMP(3);

CREATE TABLE "DiaNaoLetivoCurso" (
    "diaNaoLetivoId" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,

    CONSTRAINT "DiaNaoLetivoCurso_pkey" PRIMARY KEY ("diaNaoLetivoId", "cursoId")
);

CREATE INDEX "DiaNaoLetivoCurso_cursoId_idx" ON "DiaNaoLetivoCurso"("cursoId");

ALTER TABLE "DiaNaoLetivoCurso" ADD CONSTRAINT "DiaNaoLetivoCurso_diaNaoLetivoId_fkey"
  FOREIGN KEY ("diaNaoLetivoId") REFERENCES "DiaNaoLetivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiaNaoLetivoCurso" ADD CONSTRAINT "DiaNaoLetivoCurso_cursoId_fkey"
  FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;
