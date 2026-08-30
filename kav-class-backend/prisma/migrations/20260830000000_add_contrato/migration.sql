-- ============================================================================
-- Fase 3 (S3.2) — Contrato digital.
--
-- 100% aditivo: uma tabela nova (Contrato). Nenhuma coluna existente é
-- alterada, sem backfill.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "StatusContrato" AS ENUM ('ENVIADO', 'PREENCHIDO', 'ASSINADO', 'CANCELADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Contrato" (
  "id"                          TEXT NOT NULL,
  "status"                      "StatusContrato" NOT NULL DEFAULT 'ENVIADO',
  "token"                       TEXT NOT NULL,
  "testemunhas"                 TEXT[],
  "nomeAssinanteResponsavel"    TEXT,
  "cpfAssinanteResponsavel"     TEXT,
  "assinadoPeloResponsavelEm"   TIMESTAMP(3),
  "nomeRepresentanteEscola"     TEXT,
  "assinadoPeloRepresentanteEm" TIMESTAMP(3),
  "matriculaId"                 TEXT NOT NULL,
  "escolaId"                    TEXT NOT NULL,
  "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Contrato_token_key" ON "Contrato"("token");
CREATE INDEX IF NOT EXISTS "Contrato_matriculaId_idx" ON "Contrato"("matriculaId");
CREATE INDEX IF NOT EXISTS "Contrato_escolaId_idx" ON "Contrato"("escolaId");

DO $$ BEGIN
  ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_matriculaId_fkey"
    FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
