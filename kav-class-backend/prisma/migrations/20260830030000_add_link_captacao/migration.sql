-- ============================================================================
-- Fase 4 (S4.2) — Captação de leads: link público de auto-cadastro (lead
-- existente) + link reutilizável de captação (formulário/agendamento).
--
-- 100% aditivo: uma coluna nova nullable em Lead, uma tabela nova
-- (LinkCaptacao). Nenhuma coluna existente é alterada, sem backfill.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "TipoLinkCaptacao" AS ENUM ('CADASTRO', 'AGENDAMENTO_EXPERIMENTAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "tokenPublico" TEXT;

CREATE TABLE IF NOT EXISTS "LinkCaptacao" (
  "id"          TEXT NOT NULL,
  "token"       TEXT NOT NULL,
  "tipo"        "TipoLinkCaptacao" NOT NULL,
  "ativo"       BOOLEAN NOT NULL DEFAULT true,
  "escolaId"    TEXT NOT NULL,
  "professorId" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LinkCaptacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LinkCaptacao_token_key" ON "LinkCaptacao"("token");
CREATE INDEX IF NOT EXISTS "LinkCaptacao_escolaId_idx" ON "LinkCaptacao"("escolaId");
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_tokenPublico_key" ON "Lead"("tokenPublico");

DO $$ BEGIN
  ALTER TABLE "LinkCaptacao" ADD CONSTRAINT "LinkCaptacao_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LinkCaptacao" ADD CONSTRAINT "LinkCaptacao_professorId_fkey"
    FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
