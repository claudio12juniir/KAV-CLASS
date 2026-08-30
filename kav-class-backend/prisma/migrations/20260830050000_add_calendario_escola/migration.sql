-- ============================================================================
-- Fase 1 (S1.4) — Calendário da Escola (feriados/recessos), retomado depois
-- de ter ficado pendente na Fase 1 original.
--
-- 100% aditivo: um enum novo e uma tabela nova (DiaNaoLetivo). Nenhuma
-- coluna existente é alterada, sem backfill.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "TipoDiaNaoLetivo" AS ENUM ('FERIADO', 'RECESSO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DiaNaoLetivo" (
  "id"        TEXT NOT NULL,
  "data"      TIMESTAMP(3) NOT NULL,
  "descricao" TEXT NOT NULL,
  "tipo"      "TipoDiaNaoLetivo" NOT NULL DEFAULT 'FERIADO',
  "escolaId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DiaNaoLetivo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DiaNaoLetivo_escolaId_idx" ON "DiaNaoLetivo"("escolaId");
CREATE UNIQUE INDEX IF NOT EXISTS "DiaNaoLetivo_escolaId_data_key" ON "DiaNaoLetivo"("escolaId", "data");

DO $$ BEGIN
  ALTER TABLE "DiaNaoLetivo" ADD CONSTRAINT "DiaNaoLetivo_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
