-- ============================================================================
-- Fase 4 (S4.3) — Aula experimental vinculada a Lead + regra configurável
-- de conversão experimental → matrícula.
--
-- 100% aditivo: duas colunas novas (Escola.regraConversaoExperimental com
-- DEFAULT, Matricula.leadId nullable) e uma tabela nova (AulaExperimental).
-- Nenhuma coluna existente é alterada de tipo, sem backfill.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "StatusAulaExperimental" AS ENUM ('AGENDADA', 'REALIZADA', 'NAO_COMPARECEU', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RegraConversaoExperimental" AS ENUM ('QUALQUER_MATRICULA', 'MESMO_CURSO_PROFESSOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "regraConversaoExperimental" "RegraConversaoExperimental" NOT NULL DEFAULT 'QUALQUER_MATRICULA';

ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "leadId" TEXT;

CREATE TABLE IF NOT EXISTS "AulaExperimental" (
  "id"          TEXT NOT NULL,
  "dataHora"    TIMESTAMP(3) NOT NULL,
  "status"      "StatusAulaExperimental" NOT NULL DEFAULT 'AGENDADA',
  "observacao"  TEXT,
  "leadId"      TEXT NOT NULL,
  "cursoId"     TEXT,
  "professorId" TEXT,
  "escolaId"    TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AulaExperimental_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AulaExperimental_escolaId_dataHora_idx" ON "AulaExperimental"("escolaId", "dataHora");
CREATE INDEX IF NOT EXISTS "AulaExperimental_leadId_idx" ON "AulaExperimental"("leadId");
CREATE UNIQUE INDEX IF NOT EXISTS "Matricula_leadId_key" ON "Matricula"("leadId");

DO $$ BEGIN
  ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AulaExperimental" ADD CONSTRAINT "AulaExperimental_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AulaExperimental" ADD CONSTRAINT "AulaExperimental_cursoId_fkey"
    FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AulaExperimental" ADD CONSTRAINT "AulaExperimental_professorId_fkey"
    FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AulaExperimental" ADD CONSTRAINT "AulaExperimental_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
